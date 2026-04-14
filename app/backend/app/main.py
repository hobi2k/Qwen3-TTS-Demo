"""FastAPI application for the Qwen3-TTS demo backend."""

import json
import os
import pickle
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import librosa
import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .mmaudio import MMAudioError, MMAudioSoundEffectEngine
from .qwen import QwenDemoEngine
from .schemas import (
    AudioAsset,
    AudioConvertRequest,
    AudioSeparationRequest,
    AudioToolAsset,
    AudioToolCapability,
    AudioToolJob,
    AudioToolResponse,
    BootstrapResponse,
    AudioTranscriptionRequest,
    AudioTranscriptionResponse,
    CharacterPreset,
    CharacterPresetCreateRequest,
    ClonePromptCreateFromSampleRequest,
    ClonePromptCreateFromUploadRequest,
    ClonePromptRecord,
    CustomVoiceRequest,
    FineTuneDataset,
    FineTuneDatasetCreateRequest,
    FineTuneRun,
    FineTuneRunCreateRequest,
    GenerationRecord,
    GenerationResponse,
    HealthResponse,
    HybridCloneInstructRequest,
    ModelInfo,
    VoiceChangerModelInfo,
    SoundEffectRequest,
    StoryStudioRequest,
    PrepareDatasetRequest,
    PresetGenerateRequest,
    AudioTranslateRequest,
    UniversalInferenceRequest,
    VoiceChangerRequest,
    VoiceCloneRequest,
    VoiceDesignRequest,
)
from .storage import Storage, utc_now
from .voice_changer import (
    ApplioVoiceChanger,
    VoiceChangerError,
    applio_voice_changer_available,
    list_available_voice_models,
)

JsonDict = Dict[str, Any]

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent
UPSTREAM_QWEN_DIR = REPO_ROOT / "Qwen3-TTS" / "finetuning"
DEMO_SCRIPTS_DIR = REPO_ROOT / "scripts"
load_dotenv(BACKEND_DIR / ".env")

storage = Storage(REPO_ROOT)
engine = QwenDemoEngine(storage)
voice_changer = ApplioVoiceChanger(REPO_ROOT)
mmaudio_engine = MMAudioSoundEffectEngine(REPO_ROOT)


def default_model_id(category: str) -> str:
    defaults = {
        "custom_voice": ("Qwen3-TTS-12Hz-0.6B-CustomVoice", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        "voice_design": ("Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        "base_clone": ("Qwen3-TTS-12Hz-0.6B-Base", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
        "tokenizer": ("Qwen3-TTS-Tokenizer-12Hz", "Qwen/Qwen3-TTS-Tokenizer-12Hz"),
    }
    configured = {
        "custom_voice": os.getenv("QWEN_DEMO_CUSTOM_MODEL"),
        "voice_design": os.getenv("QWEN_DEMO_DESIGN_MODEL"),
        "base_clone": os.getenv("QWEN_DEMO_BASE_MODEL"),
        "tokenizer": os.getenv("QWEN_DEMO_TOKENIZER_MODEL"),
    }
    configured_value = (configured.get(category) or "").strip()

    if configured_value:
        configured_path = Path(configured_value)
        # 다른 머신 절대경로가 남아 있어도 서버가 바로 깨지지 않도록,
        # 실제로 존재하는 경로일 때만 그대로 사용한다.
        if configured_path.exists():
            return str(configured_path)
        if not configured_path.is_absolute():
            return configured_value

    dirname, repo_id = defaults[category]
    return model_path_or_repo(dirname, repo_id)


def model_path_or_repo(dirname: str, repo_id: str) -> str:
    local_path = REPO_ROOT / "data" / "models" / dirname
    if local_path.exists():
        return str(local_path)
    return repo_id


def stock_speaker_names() -> List[str]:
    """기본 제공 CustomVoice 화자 이름 목록을 반환한다."""

    return [speaker["speaker"] for speaker in engine.supported_speakers()]


def scan_finetuned_model_infos() -> List[ModelInfo]:
    """로컬 fine-tuning 산출물 중 추론 가능한 체크포인트를 찾아 모델 목록으로 변환한다."""

    infos: List[ModelInfo] = []
    run_root = storage.finetune_runs_dir
    if not run_root.exists():
        return infos

    for checkpoint_dir in sorted(run_root.glob("*/checkpoint-epoch-*")):
        config_path = checkpoint_dir / "config.json"
        weights_path = checkpoint_dir / "model.safetensors"
        if not config_path.exists() or not weights_path.exists():
            continue

        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        tts_model_type = str(config.get("tts_model_type") or "").strip().lower()
        talker_config = config.get("talker_config", {}) or {}
        speaker_map = talker_config.get("spk_id", {}) or {}
        speaker_names = [str(name) for name in speaker_map.keys()]
        stock_names = {name.lower() for name in stock_speaker_names()}
        custom_names = [name for name in speaker_names if name.lower() not in stock_names]
        default_speaker = (custom_names[-1] if custom_names else (speaker_names[-1] if speaker_names else None))

        if tts_model_type == "custom_voice":
            category = "custom_voice_finetuned"
            inference_mode = "custom_voice"
            supports_instruction = True
        elif tts_model_type == "base":
            category = "base_clone_finetuned"
            inference_mode = "voice_clone"
            supports_instruction = False
        elif tts_model_type == "voice_design":
            category = "voice_design_finetuned"
            inference_mode = "voice_design"
            supports_instruction = True
        else:
            continue

        run_name = checkpoint_dir.parent.name
        checkpoint_name = checkpoint_dir.name
        label = f"FT {run_name} / {checkpoint_name}"
        notes = f"Local fine-tuned checkpoint discovered at {storage.relpath(checkpoint_dir)}"
        if custom_names:
            notes = f"{notes} · new speaker: {', '.join(custom_names)}"
        recommended = (
            checkpoint_name == "checkpoint-epoch-2"
            and run_name in {"mai_ko_base17b_full", "mai_ko_customvoice17b_full"}
        )

        infos.append(
            ModelInfo(
                key=f"ft_{run_name}_{checkpoint_name}".replace("/", "_").replace(".", "_"),
                category=category,
                label=label,
                model_id=str(checkpoint_dir),
                supports_instruction=supports_instruction,
                notes=notes,
                recommended=recommended,
                inference_mode=inference_mode,
                source="finetuned",
                available_speakers=speaker_names,
                default_speaker=default_speaker,
            )
        )

    infos.sort(key=lambda item: item.model_id, reverse=True)
    return infos


def build_model_catalog() -> List[ModelInfo]:
    """프런트엔드가 사용할 전체 모델 카탈로그를 구성한다."""

    catalog = [
        ModelInfo(
            key="custom_voice_0_6b",
            category="custom_voice",
            label="CustomVoice 0.6B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-0.6B-CustomVoice", default_model_id("custom_voice")),
            supports_instruction=True,
            notes="로컬 데모에서 가장 먼저 테스트할 현실적인 기본 모델",
            recommended=True,
            inference_mode="custom_voice",
            source="stock",
            available_speakers=stock_speaker_names(),
            default_speaker="Sohee",
        ),
        ModelInfo(
            key="custom_voice_1_7b",
            category="custom_voice",
            label="CustomVoice 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-CustomVoice", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
            supports_instruction=True,
            notes="더 무거운 고품질 CustomVoice",
            inference_mode="custom_voice",
            source="stock",
            available_speakers=stock_speaker_names(),
            default_speaker="Sohee",
        ),
        ModelInfo(
            key="voice_design_1_7b",
            category="voice_design",
            label="VoiceDesign 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-VoiceDesign", default_model_id("voice_design")),
            supports_instruction=True,
            notes="설명문 기반 새 목소리 설계용",
            recommended=True,
            inference_mode="voice_design",
            source="stock",
        ),
        ModelInfo(
            key="base_clone_0_6b",
            category="base_clone",
            label="Base 0.6B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-0.6B-Base", default_model_id("base_clone")),
            supports_instruction=False,
            notes="clone prompt 재사용과 CPU 환경 데모를 고려한 기본 모델",
            recommended=True,
            inference_mode="voice_clone",
            source="stock",
        ),
        ModelInfo(
            key="base_clone_1_7b",
            category="base_clone",
            label="Base 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-Base", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
            supports_instruction=False,
            notes="고품질 Base clone과 파인튜닝용",
            inference_mode="voice_clone",
            source="stock",
        ),
        ModelInfo(
            key="tokenizer_12hz",
            category="tokenizer",
            label="Tokenizer 12Hz",
            model_id=model_path_or_repo("Qwen3-TTS-Tokenizer-12Hz", default_model_id("tokenizer")),
            supports_instruction=False,
            notes="prepare_data와 tokenizer 처리용",
            source="stock",
        ),
    ]
    return catalog + scan_finetuned_model_infos()


def model_catalog_by_id() -> Dict[str, ModelInfo]:
    """현재 모델 카탈로그를 model_id 기준으로 빠르게 조회할 수 있게 만든다."""

    return {item.model_id: item for item in build_model_catalog()}


def resolve_finetune_entrypoint(training_mode: str) -> str:
    """파인튜닝 모드에 맞는 업스트림 스크립트 파일명을 반환한다."""

    normalized = (training_mode or "base").strip().lower()
    if normalized == "custom_voice":
        return "finetuning/sft_custom_voice_12hz.py"
    return "finetuning/sft_12hz.py"

app = FastAPI(title="Qwen3-TTS Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=storage.data_dir), name="files")


@app.on_event("startup")
def startup_housekeeping() -> None:
    """서버 시작 시 저장 구조를 최신 규칙으로 정리한다.

    기존 실행에서 남은 flat 파일명이나 루트 직하 JSON 레코드가 있더라도,
    서버가 뜰 때 한 번 정리해서 프런트와 백엔드가 같은 규칙으로만 동작하게 만든다.
    이렇게 해두면 이후 화면에서 예전 무작위 파일명이나 낡은 경로 구조가 다시
    튀어나오는 일을 줄일 수 있다.
    """

    migrate_existing_storage_layout()


def audio_url_for(relative_path: str) -> str:
    """상대 파일 경로를 정적 파일 접근 URL로 변환한다.

    Args:
        relative_path: 프로젝트 루트 기준 상대 경로.

    Returns:
        `/files` 마운트 경로를 사용하는 정적 파일 URL.
    """

    prefix = "data/"
    if relative_path.startswith(prefix):
        relative_path = relative_path[len(prefix):]
    return f"/files/{relative_path.replace(os.sep, '/')}"


def utc_now_datetime() -> datetime:
    """현재 UTC 시각을 datetime으로 반환한다."""

    return datetime.now(timezone.utc)


def readable_label(value: str, default: str) -> str:
    """파일명/디렉터리용 설명문 후보를 짧게 정리한다."""

    normalized = " ".join((value or "").strip().split())
    return normalized[:72] if normalized else default


def generated_audio_path(category: str, label: str, extension: str = "wav") -> Path:
    """사람이 읽을 수 있는 생성 오디오 경로를 만든다."""

    return storage.named_output_path(
        root=storage.generated_dir,
        category=category,
        label=readable_label(label, category),
        extension=extension,
        created_at=utc_now_datetime(),
    )


def parse_created_at(value: Optional[str]) -> datetime:
    """ISO 시각 문자열을 UTC datetime으로 안전하게 변환한다.

    Args:
        value: 레코드에 저장된 created_at 문자열.

    Returns:
        파싱된 UTC datetime. 실패하면 현재 시각을 반환한다.
    """

    if value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            pass
    return utc_now_datetime()


def is_opaque_generated_filename(filename: str) -> bool:
    """랜덤 접두사 기반의 읽기 어려운 생성 파일명인지 판별한다."""

    return bool(filename and re.match(r"^(audio|gen|sfx|voicechanger|convert|harmonic|percussive)_[a-f0-9]{8,}", filename, flags=re.IGNORECASE))


def readable_record_label(record: JsonDict, fallback: str) -> str:
    """기록에서 사람이 읽기 쉬운 대표 라벨을 뽑는다."""

    candidates = [
        str(record.get("name") or "").strip(),
        str(record.get("input_summary") or "").strip(),
        str(record.get("input_text") or "").strip(),
        str(record.get("reference_text") or "").strip(),
        str(record.get("instruction") or "").strip(),
        str(record.get("speaker") or "").strip(),
    ]
    for candidate in candidates:
        if candidate:
            return readable_label(candidate, fallback)
    return fallback


def save_generation_record(payload: JsonDict) -> JsonDict:
    """생성 이력 레코드를 디스크에 저장한 뒤 그대로 반환한다.

    Args:
        payload: 저장할 생성 이력 데이터.

    Returns:
        저장된 생성 이력 데이터.
    """

    created_at = parse_created_at(payload.get("created_at"))
    record_path = storage.named_record_path(
        root=storage.generated_dir,
        category=f"{payload.get('mode', 'generation')}-records",
        label=readable_record_label(payload, str(payload.get("mode") or "generation")),
        record_id=str(payload["id"]),
        created_at=created_at,
    )
    storage.write_json(record_path, payload)
    return payload


def build_generation_record(
    record_id: str,
    mode: str,
    text: str,
    language: str,
    audio_path: Path,
    speaker: str = "",
    instruction: str = "",
    preset_id: str = "",
    source_ref_audio_path: str = "",
    source_ref_text: str = "",
    meta: Optional[JsonDict] = None,
) -> JsonDict:
    """생성 결과를 공통 이력 레코드 포맷으로 변환한다.

    Args:
        record_id: 저장할 레코드 식별자.
        mode: 생성 모드 이름.
        text: 입력 텍스트.
        language: 사용 언어 설정.
        audio_path: 생성된 오디오 파일 경로.
        speaker: 기본 화자 이름.
        instruction: 스타일 지시문.
        preset_id: 사용한 프리셋 식별자.
        source_ref_audio_path: 참조 음성 경로.
        source_ref_text: 참조 음성 텍스트.
        meta: 추가 실행 메타데이터.

    Returns:
        API 응답과 저장에 공통으로 사용하는 생성 이력 딕셔너리.
    """

    rel_audio_path = storage.relpath(audio_path)
    return {
        "id": record_id,
        "mode": mode,
        "input_text": text,
        "language": language,
        "speaker": speaker or None,
        "instruction": instruction or None,
        "preset_id": preset_id or None,
        "output_audio_path": rel_audio_path,
        "output_audio_url": audio_url_for(rel_audio_path),
        "source_ref_audio_path": source_ref_audio_path or None,
        "source_ref_text": source_ref_text or None,
        "created_at": utc_now(),
        "meta": meta or {},
    }


def get_generation_record(record_id: str) -> JsonDict:
    """생성 이력 레코드를 조회하고 없으면 404를 발생시킨다.

    Args:
        record_id: 조회할 생성 이력 식별자.

    Returns:
        조회된 생성 이력 데이터.
    """

    payload = storage.get_record(storage.generated_dir, record_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Generation record not found.")
    return payload


def get_preset_record(preset_id: str) -> JsonDict:
    """프리셋 레코드를 조회하고 없으면 404를 발생시킨다.

    Args:
        preset_id: 조회할 프리셋 식별자.

    Returns:
        조회된 프리셋 데이터.
    """

    payload = storage.get_record(storage.presets_dir, preset_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Preset not found.")
    return payload


def get_dataset_record(dataset_id: str) -> JsonDict:
    """데이터셋 레코드를 조회하고 없으면 404를 발생시킨다.

    Args:
        dataset_id: 조회할 데이터셋 식별자.

    Returns:
        조회된 데이터셋 데이터.
    """

    record_path = storage.dataset_record_path(dataset_id)
    if record_path.exists():
        payload = storage.read_json(record_path)
    else:
        payload = storage.get_record(storage.datasets_dir, dataset_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return payload


def create_clone_prompt_file(
    prompt_path: Path,
    model_id: str,
    reference_audio_path: str,
    reference_text: str,
    x_vector_only_mode: bool,
) -> None:
    """참조 입력으로부터 clone prompt 파일을 생성한다.

    Args:
        prompt_path: 저장할 pickle 파일 경로.
        reference_audio_path: 참조 음성 상대 경로.
        reference_text: 참조 음성 텍스트.
        x_vector_only_mode: x-vector 전용 clone 모드 사용 여부.
    """

    if engine.simulation_mode or not engine.qwen_tts_available:
        # 시뮬레이션 모드에서도 프런트엔드 흐름이 끊기지 않도록
        # 실제 prompt 대신 동일 구조의 placeholder pickle을 저장한다.
        prompt_payload = {
            "kind": "simulation",
            "reference_audio_path": reference_audio_path,
            "reference_text": reference_text,
            "x_vector_only_mode": x_vector_only_mode,
        }
    else:
        model = engine._get_model("base_clone", model_id)
        prompt_payload = model.create_voice_clone_prompt(
            ref_audio=str(REPO_ROOT / reference_audio_path),
            ref_text=reference_text,
            x_vector_only_mode=x_vector_only_mode,
        )

    with prompt_path.open("wb") as handle:
        pickle.dump(prompt_payload, handle)


def create_clone_prompt_record(
    source_type: str,
    model_id: str,
    reference_audio_path: str,
    reference_text: str,
    x_vector_only_mode: bool,
    meta: Optional[JsonDict] = None,
) -> ClonePromptRecord:
    """clone prompt 파일과 메타데이터 레코드를 함께 생성한다.

    Args:
        source_type: prompt 생성 출처 구분값.
        reference_audio_path: 참조 음성 상대 경로.
        reference_text: 참조 음성 텍스트.
        x_vector_only_mode: x-vector 전용 clone 모드 사용 여부.
        meta: 추가 메타데이터.

    Returns:
        저장이 완료된 clone prompt 레코드 모델.
    """

    prompt_id = storage.new_id("clone")
    created_at = utc_now()
    prompt_label = reference_text or basename_for_asset(reference_audio_path)
    created_moment = parse_created_at(created_at)
    prompt_path = storage.named_output_path(
        root=storage.clone_prompts_dir,
        category=source_type,
        label=prompt_label,
        extension="pkl",
        created_at=created_moment,
    )
    create_clone_prompt_file(
        prompt_path=prompt_path,
        model_id=model_id,
        reference_audio_path=reference_audio_path,
        reference_text=reference_text,
        x_vector_only_mode=x_vector_only_mode,
    )

    record = {
        "id": prompt_id,
        "source_type": source_type,
        "base_model": model_id,
        "prompt_path": storage.relpath(prompt_path),
        "reference_audio_path": reference_audio_path,
        "reference_text": reference_text,
        "x_vector_only_mode": x_vector_only_mode,
        "created_at": created_at,
        "meta": meta or {},
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.clone_prompts_dir,
            category=source_type,
            label=prompt_label,
            record_id=prompt_id,
            created_at=created_moment,
        ),
        record,
    )
    return ClonePromptRecord(**record)


def write_dataset_jsonl(dataset_path: Path, ref_audio_path: str, samples: List[Any]) -> None:
    """파인튜닝용 raw JSONL 파일을 생성한다.

    Args:
        dataset_path: 저장할 JSONL 파일 경로.
        ref_audio_path: 모든 샘플이 공유할 참조 음성 경로.
        samples: 요청으로 전달된 샘플 목록.
    """

    jsonl_lines = []
    for sample in samples:
        audio_path = sample.audio_path if hasattr(sample, "audio_path") else sample["audio_path"]
        text = sample.text if hasattr(sample, "text") else sample["text"]
        normalized_audio_path = resolve_repo_audio_path(audio_path)
        normalized_ref_audio_path = resolve_repo_audio_path(ref_audio_path)
        jsonl_lines.append(
            json.dumps(
                {
                    "audio": normalized_audio_path,
                    "text": text,
                    "ref_audio": normalized_ref_audio_path,
                },
                ensure_ascii=False,
            )
        )
    dataset_path.write_text("\n".join(jsonl_lines) + "\n", encoding="utf-8")


def resolve_repo_audio_path(audio_path: str) -> str:
    """프로젝트 내부 상대 오디오 경로를 절대 경로로 정규화한다."""

    candidate = Path(audio_path.strip())
    if candidate.is_absolute():
        return str(candidate)
    return str((REPO_ROOT / candidate).resolve())


def copy_audio_into_dataset(dataset_dir: Path, source_audio_path: str, filename: str) -> str:
    """Copy one audio asset into a dataset-local audio directory.

    Args:
        dataset_dir: Canonical dataset root under `data/datasets/<dataset_id>`.
        source_audio_path: Source audio path, absolute or repo-relative.
        filename: Target file name inside `audio/`.

    Returns:
        Project-relative path to the copied dataset-local audio asset.
    """

    source = Path(resolve_repo_audio_path(source_audio_path))
    if not source.exists():
        raise HTTPException(status_code=400, detail=f"Audio file not found: {source_audio_path}")

    audio_dir = dataset_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    target = audio_dir / filename

    if source.resolve() != target.resolve():
        shutil.copy2(source, target)

    return storage.relpath(target)


def dataset_manifest_payload(
    *,
    dataset_id: str,
    dataset_name: str,
    dataset_dir: Path,
    record: Dict[str, Any],
) -> Dict[str, Any]:
    """데이터셋 폴더 구조를 설명하는 보조 manifest를 만든다.

    Args:
        dataset_id: 데이터셋 식별자.
        dataset_name: 사용자에게 보이는 데이터셋 이름.
        dataset_dir: 데이터셋 루트 폴더.
        record: 현재 dataset.json 레코드.

    Returns:
        폴더/자산/JSONL 위치를 설명하는 manifest 데이터.
    """

    audio_dir = dataset_dir / "audio"
    return {
        "id": dataset_id,
        "name": dataset_name,
        "dataset_root_path": storage.relpath(dataset_dir),
        "audio_dir_path": storage.relpath(audio_dir),
        "raw_jsonl_path": record.get("raw_jsonl_path"),
        "prepared_jsonl_path": record.get("prepared_jsonl_path"),
        "ref_audio_path": record.get("ref_audio_path"),
        "speaker_name": record.get("speaker_name"),
        "sample_count": record.get("sample_count", 0),
        "created_at": record.get("created_at", utc_now()),
        "files": {
            "dataset_record": storage.relpath(storage.dataset_record_path(dataset_id)),
            "manifest": storage.relpath(storage.dataset_manifest_path(dataset_id)),
        },
    }


def normalize_dataset_jsonl_paths(dataset_path: Path) -> None:
    """기존 JSONL 안의 audio/ref_audio 경로를 절대 경로로 다시 쓴다."""

    if not dataset_path.exists():
        return

    normalized_lines = []
    for raw_line in dataset_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        line = json.loads(raw_line)
        if "audio" in line:
            line["audio"] = resolve_repo_audio_path(line["audio"])
        if "ref_audio" in line:
            line["ref_audio"] = resolve_repo_audio_path(line["ref_audio"])
        normalized_lines.append(json.dumps(line, ensure_ascii=False))

    dataset_path.write_text("\n".join(normalized_lines) + "\n", encoding="utf-8")


def dataset_audio_codes_are_2d(dataset_path: Path) -> bool:
    """prepared JSONL의 audio_codes가 학습이 기대하는 2차원 형식인지 확인한다."""

    if not dataset_path.exists():
        return False

    for raw_line in dataset_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        row = json.loads(raw_line)
        audio_codes = row.get("audio_codes")
        if not isinstance(audio_codes, list) or not audio_codes:
            return False
        first_frame = audio_codes[0]
        if not isinstance(first_frame, list) or not first_frame:
            return False
        return True
    return False


def run_prepare_data(
    *,
    raw_jsonl_path: Path,
    prepared_jsonl_path: Path,
    tokenizer_model_path: str,
    device: str,
) -> None:
    """실제 prepare_data.py를 실행해 audio_codes 포함 JSONL을 만든다."""

    prepare_script = DEMO_SCRIPTS_DIR / "qwen3_tts_prepare_data.py"
    if not prepare_script.exists():
        raise HTTPException(status_code=400, detail="Demo-side prepare_data wrapper is missing.")

    result = subprocess.run(
        [
            "python3",
            str(prepare_script),
            "--device",
            device,
            "--tokenizer_model_path",
            tokenizer_model_path,
            "--input_jsonl",
            str(raw_jsonl_path),
            "--output_jsonl",
            str(prepared_jsonl_path),
            "--batch_infer_num",
            "4",
        ],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or result.stdout or "prepare_data.py failed")


def ensure_real_prepared_dataset(dataset: JsonDict, device: str) -> JsonDict:
    """실학습 전 prepared JSONL이 유효한 실제 결과인지 확인하고 필요하면 다시 만든다."""

    raw_jsonl_path = REPO_ROOT / dataset["raw_jsonl_path"]
    prepared_rel_path = dataset.get("prepared_jsonl_path")
    if not prepared_rel_path:
        raise HTTPException(status_code=400, detail="Dataset must be prepared before starting fine-tuning.")

    prepared_jsonl_path = REPO_ROOT / prepared_rel_path
    normalize_dataset_jsonl_paths(raw_jsonl_path)
    normalize_dataset_jsonl_paths(prepared_jsonl_path)

    prepared_with_simulation = bool(dataset.get("prepared_with_simulation"))
    prepared_valid = dataset_audio_codes_are_2d(prepared_jsonl_path)
    if prepared_with_simulation or not prepared_valid:
        tokenizer_model_path = dataset.get("prepared_tokenizer_model_path") or default_model_id("tokenizer")
        run_prepare_data(
            raw_jsonl_path=raw_jsonl_path,
            prepared_jsonl_path=prepared_jsonl_path,
            tokenizer_model_path=tokenizer_model_path,
            device=device,
        )
        dataset["prepared_jsonl_path"] = storage.relpath(prepared_jsonl_path)
        dataset["prepared_with_simulation"] = False
        dataset["prepared_tokenizer_model_path"] = tokenizer_model_path
        dataset["prepared_device"] = device
        storage.write_json(storage.dataset_record_path(dataset["id"]), dataset)

    return dataset


def transcribe_audio_or_raise(audio_path: str) -> AudioTranscriptionResponse:
    """저장된 음성 파일을 전사하고 HTTP 오류로 정규화한다.

    Args:
        audio_path: 프로젝트 루트 기준 상대 경로 또는 절대 경로.

    Returns:
        Whisper 전사 결과 응답 모델.
    """

    try:
        result = engine.transcribe_reference_audio(audio_path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Automatic transcription failed: {error}") from error

    return AudioTranscriptionResponse(audio_path=audio_path, **result)


def run_generation_or_http(generator: Any) -> Any:
    """Normalize engine generation failures into HTTP errors.

    Args:
        generator: Zero-argument callable that executes one generation path.

    Returns:
        Raw generator result on success.
    """

    try:
        return generator()
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Generation failed: {error}") from error


def resolve_reference_text(reference_audio_path: str, reference_text: Optional[str]) -> str:
    """참조 텍스트를 정리하고 비어 있으면 Whisper 전사를 사용한다.

    Args:
        reference_audio_path: 참조 음성 파일 경로.
        reference_text: 사용자가 직접 입력한 참조 문장.

    Returns:
        clone prompt 생성에 사용할 참조 텍스트.
    """

    normalized_audio_path = reference_audio_path.strip()
    normalized = (reference_text or "").strip()
    if normalized:
        return normalized
    return transcribe_audio_or_raise(normalized_audio_path).text


def generation_options_from_payload(payload: Any) -> Dict[str, Any]:
    """요청 객체에서 업스트림 generate 제어 옵션만 추출한다."""

    options: Dict[str, Any] = {}
    for key in [
        "seed",
        "non_streaming_mode",
        "do_sample",
        "top_k",
        "top_p",
        "temperature",
        "repetition_penalty",
        "subtalker_dosample",
        "subtalker_top_k",
        "subtalker_top_p",
        "subtalker_temperature",
        "max_new_tokens",
    ]:
        value = getattr(payload, key, None)
        if value is not None:
            options[key] = value

    extra = getattr(payload, "extra_generate_kwargs", {}) or {}
    if extra:
        options.update(extra)

    return options


def split_story_script(script: str, split_mode: str) -> List[str]:
    """장시간 대본을 합성 가능한 세그먼트 목록으로 나눈다.

    Args:
        script: 사용자가 입력한 전체 대본.
        split_mode: `line` 또는 `paragraph`.

    Returns:
        비어 있지 않은 대본 세그먼트 목록.
    """

    normalized = script.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    if split_mode == "paragraph":
        parts = [part.strip() for part in re.split(r"\n\s*\n", normalized) if part.strip()]
    else:
        parts = [part.strip() for part in normalized.split("\n") if part.strip()]
    return parts


def concatenate_audio_segments(segment_paths: List[Path], output_path: Path, pause_ms: int) -> None:
    """여러 세그먼트 오디오를 짧은 무음 간격과 함께 하나로 합친다.

    Args:
        segment_paths: 이어 붙일 오디오 파일 경로 목록.
        output_path: 최종 출력 파일 경로.
        pause_ms: 세그먼트 사이에 넣을 무음 길이.
    """

    if not segment_paths:
        raise ValueError("At least one segment is required.")

    combined: List[np.ndarray] = []
    target_sr: Optional[int] = None
    for index, path in enumerate(segment_paths):
        waveform, sample_rate = sf.read(str(path), dtype="float32")
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)
        if target_sr is None:
            target_sr = sample_rate
        elif sample_rate != target_sr:
            waveform = librosa.resample(np.asarray(waveform, dtype=np.float32), orig_sr=sample_rate, target_sr=target_sr)
        combined.append(np.asarray(waveform, dtype=np.float32))
        if pause_ms > 0 and index < len(segment_paths) - 1:
            silence = np.zeros(int(target_sr * (pause_ms / 1000.0)), dtype=np.float32)
            combined.append(silence)

    sf.write(str(output_path), np.concatenate(combined), int(target_sr or 24000))


def list_server_audio_assets() -> List[AudioAsset]:
    """서버 내부에 저장된 오디오 파일 목록을 최신순으로 반환한다."""

    assets: List[AudioAsset] = []
    generation_records = [record.model_dump() for record in list_generation_records()]
    seen_paths = set()

    for record in generation_records:
        rel_path = record.get("output_audio_path")
        if not rel_path:
            continue
        seen_paths.add(rel_path)
        assets.append(
            AudioAsset(
                id=record.get("id", basename_for_asset(rel_path)),
                path=rel_path,
                url=audio_url_for(rel_path),
                filename=basename_for_asset(rel_path),
                source="generated",
                created_at=record.get("created_at"),
                text_preview=(record.get("input_text") or "")[:120] or None,
                transcript_text=(record.get("input_text") or None),
            )
        )

    for path in sorted(storage.uploads_dir.rglob("*")):
        if not path.is_file():
            continue
        rel_path = storage.relpath(path)
        if rel_path in seen_paths:
            continue
        assets.append(
            AudioAsset(
                id=path.stem,
                path=rel_path,
                url=audio_url_for(rel_path),
                filename=path.name,
                source="uploaded",
                created_at=utc_now_from_stat(path),
                text_preview=None,
                transcript_text=None,
            )
        )

    assets.sort(key=lambda item: item.created_at or "", reverse=True)
    return assets


def list_generation_records() -> List[GenerationRecord]:
    records = storage.list_json_records(storage.generated_dir)
    items: List[GenerationRecord] = []
    seen_audio_paths = set()
    for record in records:
        if not all(key in record for key in ("id", "mode", "input_text", "language", "output_audio_path", "output_audio_url")):
            continue
        try:
            parsed = GenerationRecord(**record)
            items.append(parsed)
            seen_audio_paths.add(parsed.output_audio_path)
        except Exception:
            continue

    audio_extensions = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus"}
    for path in sorted(storage.generated_dir.rglob("*"), key=lambda candidate: candidate.stat().st_mtime, reverse=True):
        if not path.is_file() or path.suffix.lower() not in audio_extensions:
            continue
        rel_path = storage.relpath(path)
        if rel_path in seen_audio_paths:
            continue

        parent_name = path.parent.parent.name if path.parent != storage.generated_dir and path.parent.parent != path.parent else path.parent.name
        mode_guess = (parent_name or path.parent.name or "generated").replace("-", "_")
        stem_text = re.sub(r"^\d{6}_", "", path.stem).replace("-", " ").strip()
        try:
            stat = path.stat()
        except OSError:
            continue

        items.append(
            GenerationRecord(
                id=f"file_{path.stem}",
                mode=mode_guess,
                input_text=stem_text or path.stem,
                language="Auto",
                output_audio_path=rel_path,
                output_audio_url=audio_url_for(rel_path),
                created_at=utc_now_from_timestamp(stat.st_mtime),
                meta={"synthetic": True},
            )
        )

    items.sort(key=lambda item: item.created_at or "", reverse=True)
    return items


def list_preset_records() -> List[CharacterPreset]:
    records = storage.list_json_records(storage.presets_dir)
    return [CharacterPreset(**record) for record in records]


def normalize_legacy_dataset_record(record: Dict[str, Any], fallback_name: str) -> Optional[Dict[str, Any]]:
    """Normalize legacy dataset manifests into the current dataset schema.

    Args:
        record: Raw JSON payload loaded from disk.
        fallback_name: Filename stem used when the legacy payload has no explicit id.

    Returns:
        A dictionary compatible with `FineTuneDataset`, or `None` when the
        payload cannot be safely represented as a dataset list item.
    """

    if record.get("id") and record.get("name") and record.get("raw_jsonl_path"):
        normalized = dict(record)
        if "ref_audio_path" not in normalized and record.get("ref_audio"):
            normalized["ref_audio_path"] = record["ref_audio"]
        dataset_id = normalized.get("id") or fallback_name
        normalized.setdefault("dataset_root_path", storage.relpath(storage.dataset_dir(dataset_id)) if storage.dataset_dir(dataset_id).exists() else None)
        normalized.setdefault("audio_dir_path", storage.relpath(storage.dataset_dir(dataset_id) / "audio") if (storage.dataset_dir(dataset_id) / "audio").exists() else None)
        normalized.setdefault("manifest_path", storage.relpath(storage.dataset_manifest_path(dataset_id)) if storage.dataset_manifest_path(dataset_id).exists() else None)
        return normalized

    # Older manifests stored only train/eval JSONL paths plus aggregate counts.
    # We keep them visible in the UI by projecting them into the current card
    # shape rather than crashing bootstrap on startup.
    train_jsonl = record.get("train_jsonl")
    ref_audio = record.get("ref_audio")
    train_count = record.get("train_count")
    if not train_jsonl or not ref_audio or train_count is None:
        return None

    manifest_id = fallback_name.replace("_manifest", "")
    return {
        "id": manifest_id,
        "name": manifest_id,
        "source_type": "legacy_manifest",
        "dataset_root_path": None,
        "audio_dir_path": None,
        "manifest_path": None,
        "raw_jsonl_path": storage.relpath(train_jsonl) if os.path.isabs(train_jsonl) else train_jsonl,
        "prepared_jsonl_path": None,
        "prepared_with_simulation": None,
        "prepared_tokenizer_model_path": None,
        "prepared_device": None,
        "ref_audio_path": ref_audio,
        "speaker_name": manifest_id,
        "sample_count": int(train_count),
        "created_at": utc_now_from_timestamp((storage.datasets_dir / f"{fallback_name}.json").stat().st_mtime)
        if (storage.datasets_dir / f"{fallback_name}.json").exists()
        else utc_now(),
    }


def list_dataset_records() -> List[FineTuneDataset]:
    by_id: Dict[str, FineTuneDataset] = {}
    for path in storage.list_dataset_record_paths():
        try:
            record = storage.read_json(path)
        except Exception:
            continue

        normalized = normalize_legacy_dataset_record(record, path.stem)
        if not normalized:
            continue

        try:
            dataset = FineTuneDataset(**normalized)
        except Exception:
            continue

        existing = by_id.get(dataset.id)
        if existing is None:
            by_id[dataset.id] = dataset
            continue

        existing_is_legacy = existing.source_type == "legacy_manifest"
        current_is_legacy = dataset.source_type == "legacy_manifest"
        if existing_is_legacy and not current_is_legacy:
            by_id[dataset.id] = dataset
        elif existing_is_legacy == current_is_legacy and (dataset.created_at or "") > (existing.created_at or ""):
            by_id[dataset.id] = dataset

    datasets = sorted(by_id.values(), key=lambda item: item.created_at or "", reverse=True)
    return datasets


def list_finetune_run_records() -> List[FineTuneRun]:
    records = storage.list_json_records(storage.finetune_runs_dir)
    items: List[FineTuneRun] = []
    for record in records:
        if not all(
            key in record
            for key in (
                "id",
                "dataset_id",
                "training_mode",
                "init_model_path",
                "output_model_path",
                "batch_size",
                "lr",
                "num_epochs",
                "speaker_name",
                "status",
                "created_at",
            )
        ):
            continue
        try:
            items.append(FineTuneRun(**record))
        except Exception:
            continue
    return items


def list_audio_tool_jobs() -> List[AudioToolJob]:
    records = storage.list_json_records(storage.audio_tools_dir)
    jobs: List[AudioToolJob] = []
    for record in records:
        try:
            jobs.append(AudioToolJob(**record))
        except Exception:
            continue
    return jobs


def maybe_move_file(source: Path, destination: Path) -> Path:
    """파일이 존재하면 목적지로 이동하고 최종 경로를 반환한다.

    Args:
        source: 현재 파일 경로.
        destination: 옮길 목표 경로.

    Returns:
        이동 후 실제 파일 경로.
    """

    if not source.exists():
        return destination
    if source.resolve() == destination.resolve():
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(destination))
    return destination


def migrate_generation_records() -> None:
    """기존 flat/random 생성 이력을 읽기 쉬운 구조로 정리한다.

    예전 실행에서 `data/generated` 루트에 바로 떨어진 오디오와 JSON 기록을 읽어,
    현재 규칙인 `category/date/readable-name` 구조로 옮긴다. 오디오 파일과 레코드
    JSON을 함께 갱신해서 프런트가 사람에게 읽히는 이름만 보도록 맞춘다.
    """

    for record_path in sorted(storage.generated_dir.rglob("*.json")):
        try:
            record = storage.read_json(record_path)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        if not record.get("id") or not record.get("output_audio_path"):
            continue

        created_at = parse_created_at(record.get("created_at"))
        label = readable_record_label(record, str(record.get("mode") or "generation"))
        audio_path = Path(record["output_audio_path"])
        if not audio_path.is_absolute():
            audio_path = REPO_ROOT / audio_path

        if audio_path.exists() and (audio_path.parent == storage.generated_dir or is_opaque_generated_filename(audio_path.name)):
            extension = audio_path.suffix.lstrip(".") or "wav"
            target_audio = storage.named_output_path(
                root=storage.generated_dir,
                category=str(record.get("mode") or "generation"),
                label=label,
                extension=extension,
                created_at=created_at,
            )
            moved_audio = maybe_move_file(audio_path, target_audio)
            rel_audio = storage.relpath(moved_audio)
            record["output_audio_path"] = rel_audio
            record["output_audio_url"] = audio_url_for(rel_audio)

        target_record = storage.named_record_path(
            root=storage.generated_dir,
            category=f"{record.get('mode', 'generation')}-records",
            label=label,
            record_id=str(record["id"]),
            created_at=created_at,
        )
        final_record_path = maybe_move_file(record_path, target_record)
        storage.write_json(final_record_path, record)


def migrate_clone_prompt_records() -> None:
    """clone prompt 자산과 메타데이터를 읽기 쉬운 구조로 정리한다.

    과거의 `clone_xxxxx.pkl` 같은 파일명과 루트 직하 JSON 메타데이터를 현재 구조로
    이동시켜, 프리셋/하이브리드 화면에서 내부 경로나 무작위 이름이 그대로 노출되지
    않도록 정리한다.
    """

    for record_path in sorted(storage.clone_prompts_dir.rglob("*.json")):
        try:
            record = storage.read_json(record_path)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        if not record.get("id") or not record.get("prompt_path"):
            continue

        created_at = parse_created_at(record.get("created_at"))
        label = readable_record_label(record, basename_for_asset(record.get("reference_audio_path") or "") or "clone-prompt")
        prompt_path = Path(record["prompt_path"])
        if not prompt_path.is_absolute():
            prompt_path = REPO_ROOT / prompt_path

        if prompt_path.exists() and (prompt_path.parent == storage.clone_prompts_dir or prompt_path.name.startswith("clone_")):
            target_prompt = storage.named_output_path(
                root=storage.clone_prompts_dir,
                category=str(record.get("source_type") or "clone-prompt"),
                label=label,
                extension="pkl",
                created_at=created_at,
            )
            moved_prompt = maybe_move_file(prompt_path, target_prompt)
            record["prompt_path"] = storage.relpath(moved_prompt)

        target_record = storage.named_record_path(
            root=storage.clone_prompts_dir,
            category=str(record.get("source_type") or "clone-prompt"),
            label=label,
            record_id=str(record["id"]),
            created_at=created_at,
        )
        final_record_path = maybe_move_file(record_path, target_record)
        storage.write_json(final_record_path, record)


def migrate_preset_records() -> None:
    """preset 메타데이터 파일을 이름 기반 폴더 구조로 정리한다.

    프리셋 JSON은 오디오 산출물처럼 직접 재생되는 파일은 아니지만, 화면에서 자주
    조회되기 때문에 이름과 생성 시각 기준으로 정리해 두어야 관리가 쉬워진다.
    """

    for record_path in sorted(storage.presets_dir.rglob("*.json")):
        try:
            record = storage.read_json(record_path)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        if not record.get("id"):
            continue

        created_at = parse_created_at(record.get("created_at"))
        label = readable_record_label(record, "preset")
        target_record = storage.named_record_path(
            root=storage.presets_dir,
            category=str(record.get("source_type") or "preset"),
            label=label,
            record_id=str(record["id"]),
            created_at=created_at,
        )
        final_record_path = maybe_move_file(record_path, target_record)
        storage.write_json(final_record_path, record)


def migrate_audio_tool_jobs() -> None:
    """오디오 도구 메타데이터와 산출물 경로를 읽기 쉬운 구조로 정리한다.

    사운드 효과, 보이스 체인저, 오디오 분리처럼 새로 늘어난 기능은 산출물 종류가
    섞이기 쉽다. 이 정리 단계는 각 작업 기록과 산출물 파일을 함께 옮겨서 기능별
    카테고리와 읽을 수 있는 파일명 규칙을 강제한다.
    """

    for record_path in sorted(storage.audio_tools_dir.rglob("*.json")):
        try:
            record = storage.read_json(record_path)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        if not record.get("id"):
            continue

        created_at = parse_created_at(record.get("created_at"))
        label = readable_record_label(record, str(record.get("kind") or "audio-tool"))
        artifacts = record.get("artifacts", []) or []
        updated_artifacts = []
        for artifact in artifacts:
            artifact_path = Path(artifact.get("path") or "")
            if not artifact_path:
                updated_artifacts.append(artifact)
                continue
            if not artifact_path.is_absolute():
                artifact_path = REPO_ROOT / artifact_path

            if artifact_path.exists() and (artifact_path.parent == storage.generated_dir or is_opaque_generated_filename(artifact_path.name)):
                extension = artifact_path.suffix.lstrip(".") or "wav"
                target_path = storage.named_output_path(
                    root=storage.generated_dir,
                    category=str(record.get("kind") or "audio-tool"),
                    label=artifact.get("label") or label,
                    extension=extension,
                    created_at=created_at,
                )
                artifact_path = maybe_move_file(artifact_path, target_path)

            rel_path = storage.relpath(artifact_path) if artifact_path.exists() else artifact.get("path")
            updated_artifacts.append(
                {
                    **artifact,
                    "path": rel_path,
                    "url": audio_url_for(rel_path) if rel_path else artifact.get("url"),
                    "filename": basename_for_asset(rel_path) if rel_path else artifact.get("filename"),
                }
            )

        record["artifacts"] = updated_artifacts
        target_record = storage.named_record_path(
            root=storage.audio_tools_dir,
            category=str(record.get("kind") or "audio-tool"),
            label=label,
            record_id=str(record["id"]),
            created_at=created_at,
        )
        final_record_path = maybe_move_file(record_path, target_record)
        storage.write_json(final_record_path, record)


def migrate_existing_storage_layout() -> None:
    """기존 flat/random 파일 구조를 현재 readable layout으로 한 번 정리한다.

    개별 마이그레이션은 서로 다른 저장 영역을 담당하므로, 서버 시작 시 이 함수를
    한 번 호출해 전체 저장소를 동일한 규칙으로 맞춘다.
    """

    migrate_generation_records()
    migrate_clone_prompt_records()
    migrate_preset_records()
    migrate_audio_tool_jobs()


def audio_tool_capabilities() -> List[AudioToolCapability]:
    """독립 오디오 기능 페이지에서 쓸 설명 목록을 반환한다.

    Returns:
        프런트가 각 오디오 기능 페이지의 제목과 안내 문구를 구성할 때 사용하는 capability 목록.
    """

    return [
        AudioToolCapability(
            key="sound_effects",
            label="사운드 효과",
            description="MMAudio로 텍스트 기반 효과음을 생성합니다.",
            available=mmaudio_engine.is_available(),
            notes=mmaudio_engine.availability_notes(),
        ),
        AudioToolCapability(
            key="voice_changer",
            label="보이스 체인저",
            description="RVC/Applio로 기존 음성의 타이밍을 유지한 채 음색을 바꿉니다.",
            available=applio_voice_changer_available(REPO_ROOT),
            notes="RVC 모델(.pth)과 인덱스(.index)가 필요합니다.",
        ),
        AudioToolCapability(
            key="audio_separation",
            label="오디오 분리",
            description="librosa HPSS로 harmonic/percussive stems를 분리합니다.",
            available=True,
        ),
    ]


def resolve_audio_absolute_path(audio_path: str) -> Path:
    candidate = Path(audio_path.strip())
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Audio file not found: {audio_path}")
    return candidate


def create_audio_tool_asset(path: Path, label: str) -> AudioToolAsset:
    rel_path = storage.relpath(path)
    return AudioToolAsset(
        label=label,
        path=rel_path,
        url=audio_url_for(rel_path),
        filename=path.name,
    )


def save_audio_tool_job(
    *,
    kind: str,
    input_summary: str,
    message: str,
    assets: List[AudioToolAsset],
    status: str = "completed",
) -> AudioToolJob:
    job_id = storage.new_id(kind)
    created_at = utc_now()
    record = {
        "id": job_id,
        "kind": kind,
        "status": status,
        "input_summary": input_summary,
        "created_at": created_at,
        "artifacts": [asset.model_dump() for asset in assets],
        "message": message,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.audio_tools_dir,
            category=kind,
            label=readable_label(input_summary, kind),
            record_id=job_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return AudioToolJob(**record)


def write_audio_tool_generation_record(
    *,
    mode: str,
    text: str,
    language: str,
    audio_path: Path,
    instruction: str = "",
    meta: Optional[JsonDict] = None,
) -> GenerationRecord:
    record_id = storage.new_id("audio")
    record = build_generation_record(
        record_id=record_id,
        mode=mode,
        text=text,
        language=language,
        audio_path=audio_path,
        instruction=instruction,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationRecord(**record)


def audio_tool_format_or_422(output_format: str) -> str:
    """지원하는 출력 포맷만 통과시킨다.

    Args:
        output_format: 사용자가 요청한 출력 포맷 문자열.

    Returns:
        soundfile이 직접 기록할 수 있는 확장자 문자열.
    """

    normalized = (output_format or "wav").strip().lower()
    allowed_formats = {"wav", "flac", "ogg"}
    if normalized not in allowed_formats:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported output format: {output_format}. Use one of: wav, flac, ogg.",
        )
    return normalized


def basename_for_asset(value: str) -> str:
    normalized = value.replace(os.sep, "/")
    return normalized.split("/")[-1]


def asset_stem(value: str) -> str:
    """경로에서 확장자를 제외한 파일명만 꺼낸다."""

    return Path(basename_for_asset(value)).stem


def utc_now_from_stat(path: Path) -> str:
    return utc_now_from_timestamp(path.stat().st_mtime)


def utc_now_from_timestamp(timestamp: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def run_upstream_command(command: List[str]) -> subprocess.CompletedProcess[str]:
    """업스트림 finetuning 스크립트를 실행하고 결과를 반환한다.

    Args:
        command: 실행할 명령 인자 목록.

    Returns:
        캡처된 표준 출력과 표준 에러를 포함한 실행 결과 객체.
    """

    if not UPSTREAM_QWEN_DIR.exists():
        raise HTTPException(status_code=400, detail="Upstream finetuning directory is missing.")

    return subprocess.run(
        command,
        cwd=str(UPSTREAM_QWEN_DIR),
        capture_output=True,
        text=True,
    )


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """백엔드 상태와 런타임 모드를 반환한다.

    Returns:
        시뮬레이션 여부와 데이터 디렉터리를 포함한 헬스체크 응답.
    """

    return HealthResponse(
        status="ok",
        simulation_mode=engine.simulation_mode,
        runtime_mode="simulation" if engine.simulation_mode else "real",
        qwen_tts_available=engine.qwen_tts_available,
        device=engine.resolve_device(),
        attention_implementation=engine.resolve_attention_implementation(),
        recommended_instruction_language="English",
        data_dir=str(storage.data_dir),
    )


@app.get("/api/bootstrap", response_model=BootstrapResponse)
def bootstrap() -> BootstrapResponse:
    """초기 화면 렌더에 필요한 공통 데이터를 한 번에 반환한다."""

    return BootstrapResponse(
        health=health(),
        models=list_models(),
        speakers=list_speakers(),
        audio_assets=list_server_audio_assets(),
        history=list_generation_records(),
        presets=list_preset_records(),
        datasets=list_dataset_records(),
        finetune_runs=list_finetune_run_records(),
        audio_tool_capabilities=audio_tool_capabilities(),
        audio_tool_jobs=list_audio_tool_jobs(),
        voice_changer_models=list_voice_changer_models(),
    )


def list_voice_changer_models() -> List[VoiceChangerModelInfo]:
    return [VoiceChangerModelInfo(**item) for item in list_available_voice_models(REPO_ROOT, voice_changer.applio_root)]


@app.get("/api/models", response_model=List[ModelInfo])
def list_models() -> List[ModelInfo]:
    """프런트엔드가 표시할 데모 모델 목록을 반환한다.

    Returns:
        지원 모델 메타데이터 목록.
    """

    return build_model_catalog()


@app.get("/api/speakers")
def list_speakers() -> List[Dict[str, str]]:
    """CustomVoice용 기본 화자 목록을 반환한다.

    Returns:
        화자 이름과 설명을 담은 목록.
    """

    return engine.supported_speakers()


@app.post("/api/transcriptions/reference-audio", response_model=AudioTranscriptionResponse)
def transcribe_reference_audio(payload: AudioTranscriptionRequest) -> AudioTranscriptionResponse:
    """저장된 참조 음성을 Whisper로 전사한다.

    Args:
        payload: 전사할 음성 경로 요청.

    Returns:
        전사 텍스트와 메타데이터.
    """

    return transcribe_audio_or_raise(payload.audio_path)


@app.get("/api/history", response_model=List[GenerationRecord])
def history() -> List[GenerationRecord]:
    """저장된 생성 이력을 최신순으로 반환한다.

    Returns:
        생성 이력 모델 목록.
    """

    return list_generation_records()


@app.get("/api/audio-assets", response_model=List[AudioAsset])
def audio_assets() -> List[AudioAsset]:
    """서버에 저장된 오디오 파일 목록을 반환한다."""

    return list_server_audio_assets()


@app.post("/api/uploads/reference-audio")
async def upload_reference_audio(file: UploadFile = File(...)) -> Dict[str, str]:
    """참조 음성 파일을 업로드 디렉터리에 저장한다.

    Args:
        file: 사용자가 업로드한 오디오 파일.

    Returns:
        저장된 파일의 식별자와 접근 경로 정보.
    """

    file_id = storage.new_id("upload")
    extension = Path(file.filename or "reference.wav").suffix or ".wav"
    destination = storage.named_output_path(
        root=storage.uploads_dir,
        category="reference-audio",
        label=Path(file.filename or "reference").stem,
        extension=extension,
    )
    contents = await file.read()

    # 업로드 원본을 그대로 보존해야 이후 clone prompt 생성과 데이터셋 빌드가
    # 사용자가 확인한 파일 기준으로 재현 가능해진다.
    destination.write_bytes(contents)
    rel_path = storage.relpath(destination)
    return {
        "id": file_id,
        "path": rel_path,
        "url": audio_url_for(rel_path),
        "filename": file.filename or destination.name,
    }


@app.get("/api/audio-tools/capabilities", response_model=List[AudioToolCapability])
def list_audio_tool_capability_records() -> List[AudioToolCapability]:
    """오디오 제품군 기능 지원 범위를 반환한다."""

    return audio_tool_capabilities()


@app.get("/api/audio-tools/voice-models", response_model=List[VoiceChangerModelInfo])
def audio_tool_voice_models() -> List[VoiceChangerModelInfo]:
    """Applio/RVC에서 선택 가능한 보이스 모델 목록을 반환한다."""

    return list_voice_changer_models()


@app.get("/api/audio-tools/jobs", response_model=List[AudioToolJob])
def audio_tool_jobs() -> List[AudioToolJob]:
    """최근 오디오 도구 작업 이력을 반환한다."""

    return list_audio_tool_jobs()


@app.post("/api/audio-tools/sound-effects", response_model=AudioToolResponse)
def generate_sound_effect(payload: SoundEffectRequest) -> AudioToolResponse:
    """텍스트 프롬프트에서 MMAudio 기반 효과음을 생성한다."""

    output_path = generated_audio_path("sound-effects", payload.prompt, "wav")
    try:
        output_path, engine_meta = mmaudio_engine.generate(
            prompt=payload.prompt,
            duration_sec=payload.duration_sec,
            intensity=payload.intensity,
            seed=payload.seed,
            output_path=output_path,
        )
    except MMAudioError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    record = write_audio_tool_generation_record(
        mode="sound_effect",
        text=payload.prompt,
        language="N/A",
        audio_path=output_path,
        meta={
            "tool_kind": "sound_effect",
            "duration_sec": payload.duration_sec,
            "intensity": payload.intensity,
            "seed": payload.seed,
            **engine_meta,
        },
    )
    asset = create_audio_tool_asset(output_path, "generated sound effect")
    save_audio_tool_job(
        kind="sound_effect",
        input_summary=payload.prompt,
        message="MMAudio sound effect generated.",
        assets=[asset],
    )
    return AudioToolResponse(
        kind="sound_effect",
        status="completed",
        message="MMAudio sound effect generated.",
        assets=[asset],
        record=record,
    )


@app.post("/api/audio-tools/voice-changer", response_model=AudioToolResponse)
def change_voice(payload: VoiceChangerRequest) -> AudioToolResponse:
    """Applio/RVC로 기존 음성의 음색을 직접 바꾼다.

    Args:
        payload: 원본 오디오와 RVC 변환 설정.

    Returns:
        변환된 오디오 결과.
    """
    if not voice_changer.is_available():
        raise HTTPException(status_code=400, detail="Applio repository is not available for voice conversion.")

    output_path = generated_audio_path("voice-changer", "voice conversion", "wav")
    try:
        audio_path, meta = voice_changer.transform(
            input_audio_path=payload.audio_path,
            output_path=output_path,
            model_path=payload.model_path,
            index_path=payload.index_path,
            pitch_shift_semitones=payload.pitch_shift_semitones,
            f0_method=payload.f0_method,
            index_rate=payload.index_rate,
            protect=payload.protect,
            split_audio=payload.split_audio,
            f0_autotune=payload.f0_autotune,
            clean_audio=payload.clean_audio,
            clean_strength=payload.clean_strength,
            embedder_model=payload.embedder_model,
        )
    except VoiceChangerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice changer failed: {exc}") from exc

    record = write_audio_tool_generation_record(
        mode="voice_changer",
        text="voice conversion",
        language="N/A",
        audio_path=audio_path,
        meta={
            "tool_kind": "voice_changer",
            "source_audio_path": payload.audio_path,
            **meta,
        },
    )
    asset = create_audio_tool_asset(audio_path, "voice changed speech")
    save_audio_tool_job(
        kind="voice_changer",
        input_summary="voice conversion",
        message="Voice converted from source audio.",
        assets=[asset],
    )
    return AudioToolResponse(
        kind="voice_changer",
        status="completed",
        message="Voice converted from source audio.",
        assets=[asset],
        record=record,
    )


@app.post("/api/audio-tools/convert", response_model=AudioToolResponse)
def convert_audio(payload: AudioConvertRequest) -> AudioToolResponse:
    """오디오 포맷과 샘플레이트를 변환한다."""

    source_path = resolve_audio_absolute_path(payload.audio_path)
    waveform, sample_rate = sf.read(str(source_path), dtype="float32")
    if waveform.ndim > 1 and payload.mono:
        waveform = waveform.mean(axis=1)
    if sample_rate != payload.sample_rate:
        waveform = librosa.resample(np.asarray(waveform, dtype=np.float32), orig_sr=sample_rate, target_sr=payload.sample_rate)
        sample_rate = payload.sample_rate
    extension = audio_tool_format_or_422(payload.output_format)
    output_path = generated_audio_path("audio-converter", f"convert {extension} {sample_rate}hz", extension)
    sf.write(str(output_path), waveform, sample_rate)
    record = write_audio_tool_generation_record(
        mode="audio_converter",
        text=f"convert to {extension} {sample_rate}hz",
        language="N/A",
        audio_path=output_path,
        meta={
            "tool_kind": "audio_converter",
            "source_audio_path": payload.audio_path,
            "output_format": extension,
            "sample_rate": sample_rate,
            "mono": payload.mono,
        },
    )
    asset = create_audio_tool_asset(output_path, f"converted {extension}")
    save_audio_tool_job(
        kind="audio_converter",
        input_summary=f"convert to {extension} {sample_rate}Hz",
        message="Audio conversion completed.",
        assets=[asset],
    )
    return AudioToolResponse(
        kind="audio_converter",
        status="completed",
        message="Audio conversion completed.",
        assets=[asset],
        record=record,
    )


@app.post("/api/audio-tools/separate", response_model=AudioToolResponse)
def separate_audio(payload: AudioSeparationRequest) -> AudioToolResponse:
    """librosa HPSS로 harmonic/percussive를 분리한다."""

    source_path = resolve_audio_absolute_path(payload.audio_path)
    waveform, sample_rate = librosa.load(str(source_path), sr=None, mono=True)
    harmonic, percussive = librosa.effects.hpss(waveform)
    base_label = asset_stem(payload.audio_path) or "source"
    harmonic_path = generated_audio_path("audio-separation", f"{base_label} harmonic", "wav")
    percussive_path = generated_audio_path("audio-separation", f"{base_label} percussive", "wav")
    sf.write(str(harmonic_path), harmonic, sample_rate)
    sf.write(str(percussive_path), percussive, sample_rate)
    assets = [
        create_audio_tool_asset(harmonic_path, "harmonic stem"),
        create_audio_tool_asset(percussive_path, "percussive stem"),
    ]
    record = write_audio_tool_generation_record(
        mode="audio_separation",
        text=f"{base_label} harmonic",
        language="N/A",
        audio_path=harmonic_path,
        meta={
            "tool_kind": "audio_separation",
            "source_audio_path": payload.audio_path,
            "stem_role": "harmonic",
            "paired_artifact_path": storage.relpath(percussive_path),
        },
    )
    write_audio_tool_generation_record(
        mode="audio_separation",
        text=f"{base_label} percussive",
        language="N/A",
        audio_path=percussive_path,
        meta={
            "tool_kind": "audio_separation",
            "source_audio_path": payload.audio_path,
            "stem_role": "percussive",
            "paired_artifact_path": storage.relpath(harmonic_path),
        },
    )
    save_audio_tool_job(
        kind="audio_separation",
        input_summary=f"{base_label} split",
        message="HPSS separation completed.",
        assets=assets,
    )
    return AudioToolResponse(
        kind="audio_separation",
        status="completed",
        message="HPSS separation completed.",
        assets=assets,
        record=record,
    )


@app.post("/api/audio-tools/translate", response_model=AudioToolResponse)
def translate_audio(payload: AudioTranslateRequest) -> AudioToolResponse:
    """Whisper 전사와 선택적 재합성을 묶은 번역 보조 흐름."""

    transcript = transcribe_audio_or_raise(payload.audio_path)
    translated_text = payload.translated_text.strip()
    assets: List[AudioToolAsset] = []
    record: Optional[GenerationRecord] = None
    message = "Transcript captured. Add translated_text to synthesize translated speech."

    if translated_text:
        audio_path, _, meta = run_generation_or_http(
            lambda: engine.generate_custom_voice(
                text=translated_text,
                language=payload.target_language,
                speaker=payload.speaker,
                instruct=payload.instruct,
                model_id=payload.model_id or default_model_id("custom_voice"),
            )
        )
        record = write_audio_tool_generation_record(
            mode="audio_translation",
            text=translated_text,
            language=payload.target_language,
            audio_path=audio_path,
            instruction=payload.instruct,
            meta={
                **meta,
                "tool_kind": "audio_translation",
                "source_audio_path": payload.audio_path,
                "transcript_text": transcript.text,
                "target_language": payload.target_language,
            },
        )
        assets.append(create_audio_tool_asset(audio_path, "translated speech"))
        message = "Transcript captured and translated speech synthesized from supplied text."

    save_audio_tool_job(
        kind="audio_translation",
        input_summary=f"translate to {payload.target_language}",
        message=message,
        assets=assets,
    )
    return AudioToolResponse(
        kind="audio_translation",
        status="completed",
        message=message,
        assets=assets,
        transcript_text=transcript.text,
        translated_text=translated_text or None,
        record=record,
    )


@app.post("/api/generate/custom-voice", response_model=GenerationResponse)
def generate_custom_voice(payload: CustomVoiceRequest) -> GenerationResponse:
    """CustomVoice 경로로 음성을 생성하고 이력을 저장한다.

    Args:
        payload: CustomVoice 생성 요청.

    Returns:
        저장된 생성 이력 응답.
    """

    audio_path, _, meta = run_generation_or_http(
        lambda: engine.generate_custom_voice(
            text=payload.text,
            language=payload.language,
            speaker=payload.speaker,
            instruct=payload.instruct,
            model_id=payload.model_id or default_model_id("custom_voice"),
            **generation_options_from_payload(payload),
        )
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="custom_voice",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        speaker=payload.speaker,
        instruction=payload.instruct,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/voice-design", response_model=GenerationResponse)
def generate_voice_design(payload: VoiceDesignRequest) -> GenerationResponse:
    """VoiceDesign 경로로 음성을 생성하고 이력을 저장한다.

    Args:
        payload: VoiceDesign 생성 요청.

    Returns:
        저장된 생성 이력 응답.
    """

    audio_path, _, meta = run_generation_or_http(
        lambda: engine.generate_voice_design(
            text=payload.text,
            language=payload.language,
            instruct=payload.instruct,
            model_id=payload.model_id or default_model_id("voice_design"),
            **generation_options_from_payload(payload),
        )
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="story_studio",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        instruction=payload.instruct,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/story-studio", response_model=GenerationResponse)
def generate_story_studio(payload: StoryStudioRequest) -> GenerationResponse:
    """장시간 대본을 세그먼트 단위로 합성한 뒤 하나의 오디오로 묶는다.

    Args:
        payload: 장면 지시와 긴 대본을 포함한 요청.

    Returns:
        세그먼트 합성 결과를 합친 생성 이력 응답.
    """

    segments = split_story_script(payload.text, payload.split_mode)
    if not segments:
        raise HTTPException(status_code=400, detail="Story script is empty.")

    segment_paths: List[Path] = []
    segment_meta: List[Dict[str, Any]] = []
    options = generation_options_from_payload(payload)
    for segment in segments:
        if payload.generation_mode == "custom_voice":
            audio_path, _, meta = run_generation_or_http(
                lambda segment_text=segment: engine.generate_custom_voice(
                    text=segment_text,
                    language=payload.language,
                    speaker=payload.speaker or stock_speaker_names()[0],
                    instruct=payload.instruct,
                    model_id=payload.model_id or default_model_id("custom_voice"),
                    **options,
                )
            )
        else:
            audio_path, _, meta = run_generation_or_http(
                lambda segment_text=segment: engine.generate_voice_design(
                    text=segment_text,
                    language=payload.language,
                    instruct=payload.instruct,
                    model_id=payload.model_id or default_model_id("voice_design"),
                    **options,
                )
            )
        segment_paths.append(audio_path)
        segment_meta.append({"text": segment, **meta})

    output_path = generated_audio_path("story-studio", segments[0], "wav")
    concatenate_audio_segments(segment_paths, output_path, payload.pause_ms)
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="voice_design",
        text=payload.text,
        language=payload.language,
        audio_path=output_path,
        speaker=payload.speaker or "",
        instruction=payload.instruct,
        meta={
            "story_studio": True,
            "generation_mode": payload.generation_mode,
            "split_mode": payload.split_mode,
            "pause_ms": payload.pause_ms,
            "segment_count": len(segments),
            "segments": segment_meta,
        },
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/voice-clone", response_model=GenerationResponse)
def generate_voice_clone(payload: VoiceCloneRequest) -> GenerationResponse:
    """프리셋 또는 참조 입력을 사용해 clone 음성을 생성한다.

    Args:
        payload: Base clone 생성 요청.

    Returns:
        저장된 생성 이력 응답.
    """

    model_id = payload.model_id or default_model_id("base_clone")
    ref_audio_path = payload.ref_audio_path or ""
    ref_text = payload.ref_text or ""
    voice_clone_prompt_path = payload.voice_clone_prompt_path or ""

    if payload.preset_id:
        preset = get_preset_record(payload.preset_id)
        # 프리셋은 재사용 가능한 캐릭터 자산이므로, 명시적 입력보다
        # 프리셋에 저장된 참조 정보를 우선 적용해 결과 일관성을 지킨다.
        ref_audio_path = preset["reference_audio_path"]
        ref_text = preset["reference_text"]
        voice_clone_prompt_path = preset["clone_prompt_path"]
        model_id = preset["base_model"]

    if ref_audio_path and not ref_text and not voice_clone_prompt_path:
        # 업로드 직후 바로 합성하는 경우도 자연스럽게 동작하도록
        # 참조 텍스트가 비어 있으면 서버가 Whisper 전사를 보완한다.
        ref_text = resolve_reference_text(ref_audio_path, ref_text)

    if not voice_clone_prompt_path and not (ref_audio_path and ref_text):
        raise HTTPException(status_code=400, detail="Preset or clone prompt/reference inputs are required.")

    audio_path, _, meta = run_generation_or_http(
        lambda: engine.generate_voice_clone(
            text=payload.text,
            language=payload.language,
            model_id=model_id,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text,
            voice_clone_prompt_path=voice_clone_prompt_path,
            x_vector_only_mode=payload.x_vector_only_mode,
            **generation_options_from_payload(payload),
        )
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="voice_clone",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        preset_id=payload.preset_id or "",
        source_ref_audio_path=ref_audio_path,
        source_ref_text=ref_text,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/model", response_model=GenerationResponse)
def generate_with_selected_model(payload: UniversalInferenceRequest) -> GenerationResponse:
    """선택한 모델 메타데이터에 맞춰 적절한 추론 경로로 분기한다.

    Args:
        payload: 모델 선택형 통합 추론 요청.

    Returns:
        저장된 생성 이력 응답.
    """

    model_info = model_catalog_by_id().get(payload.model_id)
    if not model_info:
        raise HTTPException(status_code=404, detail="Selected model was not found in the model catalog.")

    inference_mode = model_info.inference_mode or model_info.category
    if inference_mode == "custom_voice":
        speaker = (payload.speaker or model_info.default_speaker or "").strip()
        if not speaker:
            raise HTTPException(status_code=400, detail="speaker is required for CustomVoice inference.")
        return generate_custom_voice(
            CustomVoiceRequest(
                model_id=payload.model_id,
                text=payload.text,
                language=payload.language,
                speaker=speaker,
                instruct=payload.instruct,
                **generation_options_from_payload(payload),
            )
        )

    if inference_mode == "voice_design":
        instruct = payload.instruct.strip()
        if not instruct:
            raise HTTPException(status_code=400, detail="instruct is required for VoiceDesign inference.")
        return generate_voice_design(
            VoiceDesignRequest(
                model_id=payload.model_id,
                text=payload.text,
                language=payload.language,
                instruct=instruct,
                **generation_options_from_payload(payload),
            )
        )

    if inference_mode == "voice_clone":
        ref_audio_path = (payload.ref_audio_path or "").strip()
        ref_text = (payload.ref_text or "").strip()
        voice_clone_prompt_path = (payload.voice_clone_prompt_path or "").strip()
        if ref_audio_path and not ref_text and not voice_clone_prompt_path:
            ref_text = resolve_reference_text(ref_audio_path, ref_text)
        return generate_voice_clone(
            VoiceCloneRequest(
                model_id=payload.model_id,
                text=payload.text,
                language=payload.language,
                ref_audio_path=ref_audio_path or None,
                ref_text=ref_text or None,
                voice_clone_prompt_path=voice_clone_prompt_path or None,
                x_vector_only_mode=payload.x_vector_only_mode,
                **generation_options_from_payload(payload),
            )
        )

    raise HTTPException(status_code=400, detail=f"Unsupported inference mode: {inference_mode}")


@app.post("/api/generate/hybrid-clone-instruct", response_model=GenerationResponse)
def generate_hybrid_clone_instruct(payload: HybridCloneInstructRequest) -> GenerationResponse:
    """Base clone prompt와 CustomVoice instruct를 결합한 실험용 추론을 실행한다."""

    ref_text = (payload.ref_text or "").strip()
    if payload.ref_audio_path and not ref_text and not payload.x_vector_only_mode:
        ref_text = resolve_reference_text(payload.ref_audio_path, ref_text)

    audio_path, _, meta = run_generation_or_http(
        lambda: engine.generate_hybrid_clone_instruct(
            text=payload.text,
            language=payload.language,
            instruct=payload.instruct,
            base_model_id=payload.base_model_id,
            custom_model_id=payload.custom_model_id,
            ref_audio_path=payload.ref_audio_path,
            ref_text=ref_text,
            x_vector_only_mode=payload.x_vector_only_mode,
            **generation_options_from_payload(payload),
        )
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="hybrid_clone_instruct",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        instruction=payload.instruct,
        source_ref_audio_path=payload.ref_audio_path,
        source_ref_text=ref_text,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/clone-prompts/from-generated-sample", response_model=ClonePromptRecord)
def clone_prompt_from_generated_sample(payload: ClonePromptCreateFromSampleRequest) -> ClonePromptRecord:
    """VoiceDesign 생성 이력으로부터 clone prompt를 만든다.

    Args:
        payload: 생성 이력 기반 clone prompt 생성 요청.

    Returns:
        저장된 clone prompt 레코드.
    """

    generation = get_generation_record(payload.generation_id)
    if generation["mode"] != "voice_design":
        raise HTTPException(status_code=400, detail="Only voice design samples can be promoted from generated history.")

    return create_clone_prompt_record(
        source_type="generated_voice_design",
        model_id=payload.model_id or default_model_id("base_clone"),
        reference_audio_path=generation["output_audio_path"],
        reference_text=generation["input_text"],
        x_vector_only_mode=payload.x_vector_only_mode,
        meta={"generation_id": payload.generation_id},
    )


@app.post("/api/clone-prompts/from-upload", response_model=ClonePromptRecord)
def clone_prompt_from_upload(payload: ClonePromptCreateFromUploadRequest) -> ClonePromptRecord:
    """업로드한 참조 음성으로 clone prompt를 만든다.

    Args:
        payload: 업로드 기반 clone prompt 생성 요청.

    Returns:
        저장된 clone prompt 레코드.
    """

    reference_text = resolve_reference_text(payload.reference_audio_path, payload.reference_text)

    return create_clone_prompt_record(
        source_type="uploaded_reference",
        model_id=payload.model_id or default_model_id("base_clone"),
        reference_audio_path=payload.reference_audio_path,
        reference_text=reference_text,
        x_vector_only_mode=payload.x_vector_only_mode,
    )


@app.get("/api/presets", response_model=List[CharacterPreset])
def list_presets() -> List[CharacterPreset]:
    """저장된 캐릭터 프리셋 목록을 반환한다.

    Returns:
        최신순 프리셋 목록.
    """

    return list_preset_records()


@app.post("/api/presets", response_model=CharacterPreset)
def create_preset(payload: CharacterPresetCreateRequest) -> CharacterPreset:
    """새 고정 캐릭터 프리셋을 저장한다.

    Args:
        payload: 프리셋 생성 요청.

    Returns:
        저장된 프리셋 모델.
    """

    preset_id = storage.new_id("preset")
    created_at = utc_now()
    record = {
        "id": preset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "base_model": payload.base_model,
        "language": payload.language,
        "reference_text": payload.reference_text,
        "reference_audio_path": payload.reference_audio_path,
        "clone_prompt_path": payload.clone_prompt_path,
        "created_at": created_at,
        "notes": payload.notes,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.presets_dir,
            category=payload.source_type or "preset",
            label=payload.name,
            record_id=preset_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return CharacterPreset(**record)


@app.get("/api/presets/{preset_id}", response_model=CharacterPreset)
def get_preset(preset_id: str) -> CharacterPreset:
    """단일 캐릭터 프리셋을 조회한다.

    Args:
        preset_id: 조회할 프리셋 식별자.

    Returns:
        저장된 프리셋 모델.
    """

    return CharacterPreset(**get_preset_record(preset_id))


@app.post("/api/presets/{preset_id}/generate", response_model=GenerationResponse)
def generate_from_preset(preset_id: str, payload: PresetGenerateRequest) -> GenerationResponse:
    """프리셋을 불러와 clone 생성 요청으로 위임한다.

    Args:
        preset_id: 사용할 프리셋 식별자.
        payload: 프리셋 기반 생성 요청.

    Returns:
        저장된 생성 이력 응답.
    """

    preset = get_preset_record(preset_id)
    request = VoiceCloneRequest(
        text=payload.text,
        language=payload.language or preset["language"],
        preset_id=preset_id,
        seed=payload.seed,
        non_streaming_mode=payload.non_streaming_mode,
        do_sample=payload.do_sample,
        top_k=payload.top_k,
        top_p=payload.top_p,
        temperature=payload.temperature,
        repetition_penalty=payload.repetition_penalty,
        subtalker_dosample=payload.subtalker_dosample,
        subtalker_top_k=payload.subtalker_top_k,
        subtalker_top_p=payload.subtalker_top_p,
        subtalker_temperature=payload.subtalker_temperature,
        max_new_tokens=payload.max_new_tokens,
        extra_generate_kwargs=payload.extra_generate_kwargs,
    )
    return generate_voice_clone(request)


@app.post("/api/datasets", response_model=FineTuneDataset)
def create_dataset(payload: FineTuneDatasetCreateRequest) -> FineTuneDataset:
    """파인튜닝용 raw JSONL 데이터셋을 생성한다.

    Args:
        payload: 데이터셋 생성 요청.

    Returns:
        저장된 데이터셋 메타데이터.
    """

    if not payload.samples:
        raise HTTPException(status_code=400, detail="At least one sample is required.")

    normalized_samples = []
    for sample in payload.samples:
        if not sample.audio_path.strip():
            continue

        # 데이터셋 빌더는 음성만 먼저 모아두는 흐름이 많아서,
        # 텍스트가 비어 있으면 각 샘플을 자동 전사해 raw JSONL을 완성한다.
        transcript = resolve_reference_text(sample.audio_path, sample.text)
        normalized_samples.append(
            {
                "audio_path": sample.audio_path.strip(),
                "text": transcript,
            }
        )

    if not normalized_samples:
        raise HTTPException(status_code=400, detail="At least one valid sample with audio_path is required.")

    dataset_id = storage.unique_dataset_id(payload.name)
    dataset_dir = storage.dataset_dir(dataset_id)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    raw_jsonl_path = dataset_dir / "raw.jsonl"
    ref_source_name = Path(payload.ref_audio_path.strip()).stem or "reference"
    ref_suffix = Path(payload.ref_audio_path.strip()).suffix or ".wav"
    copied_ref_audio_path = copy_audio_into_dataset(
        dataset_dir,
        payload.ref_audio_path,
        f"reference_{storage.slugify(ref_source_name, default='reference')}{ref_suffix}",
    )

    dataset_local_samples = []
    for index, sample in enumerate(normalized_samples):
        source_stem = Path(sample["audio_path"]).stem or f"sample-{index + 1}"
        sample_suffix = Path(sample["audio_path"]).suffix or ".wav"
        copied_audio_path = copied_ref_audio_path
        if resolve_repo_audio_path(sample["audio_path"]) != resolve_repo_audio_path(payload.ref_audio_path):
            copied_audio_path = copy_audio_into_dataset(
                dataset_dir,
                sample["audio_path"],
                f"sample_{index + 1:04d}_{storage.slugify(source_stem, default='sample')}{sample_suffix}",
            )
        dataset_local_samples.append({"audio_path": copied_audio_path, "text": sample["text"]})

    write_dataset_jsonl(raw_jsonl_path, copied_ref_audio_path, dataset_local_samples)

    record = {
        "id": dataset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "dataset_root_path": storage.relpath(dataset_dir),
        "audio_dir_path": storage.relpath(dataset_dir / "audio"),
        "manifest_path": storage.relpath(storage.dataset_manifest_path(dataset_id)),
        "raw_jsonl_path": storage.relpath(raw_jsonl_path),
        "prepared_jsonl_path": None,
        "prepared_with_simulation": None,
        "prepared_tokenizer_model_path": None,
        "prepared_device": None,
        "ref_audio_path": copied_ref_audio_path,
        "speaker_name": payload.speaker_name,
        "sample_count": len(normalized_samples),
        "created_at": utc_now(),
    }
    storage.write_json(storage.dataset_record_path(dataset_id), record)
    storage.write_json(
        storage.dataset_manifest_path(dataset_id),
        dataset_manifest_payload(
            dataset_id=dataset_id,
            dataset_name=payload.name,
            dataset_dir=dataset_dir,
            record=record,
        ),
    )
    return FineTuneDataset(**record)


@app.get("/api/datasets", response_model=List[FineTuneDataset])
def list_datasets() -> List[FineTuneDataset]:
    """저장된 파인튜닝 데이터셋 목록을 반환한다.

    Returns:
        최신순 데이터셋 목록.
    """

    return list_dataset_records()


@app.get("/api/datasets/{dataset_id}", response_model=FineTuneDataset)
def get_dataset(dataset_id: str) -> FineTuneDataset:
    """단일 파인튜닝 데이터셋을 조회한다.

    Args:
        dataset_id: 조회할 데이터셋 식별자.

    Returns:
        저장된 데이터셋 메타데이터.
    """

    return FineTuneDataset(**get_dataset_record(dataset_id))


@app.post("/api/datasets/{dataset_id}/prepare-codes", response_model=FineTuneDataset)
def prepare_dataset(dataset_id: str, payload: PrepareDatasetRequest) -> FineTuneDataset:
    """raw JSONL에 audio code를 추가해 학습용 데이터셋을 준비한다.

    Args:
        dataset_id: 준비할 데이터셋 식별자.
        payload: 전처리 실행 옵션.

    Returns:
        prepared JSONL 경로가 채워진 데이터셋 메타데이터.
    """

    dataset = get_dataset_record(dataset_id)
    raw_jsonl_path = REPO_ROOT / dataset["raw_jsonl_path"]
    dataset_dir = storage.dataset_dir(dataset_id)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    prepared_jsonl_path = dataset_dir / "prepared.jsonl"
    normalize_dataset_jsonl_paths(raw_jsonl_path)

    simulate = payload.simulate_only or engine.simulation_mode
    if not simulate:
        run_prepare_data(
            raw_jsonl_path=raw_jsonl_path,
            prepared_jsonl_path=prepared_jsonl_path,
            tokenizer_model_path=payload.tokenizer_model_path,
            device=payload.device,
        )
    else:
        lines = []
        for line in raw_jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            # 시뮬레이션 모드에서도 후속 단계가 같은 키를 기대하므로
            # 최소한의 placeholder audio code 배열을 채워 넣는다.
            row["audio_codes"] = [[101] * 16, [202] * 16, [303] * 16, [404] * 16]
            lines.append(json.dumps(row, ensure_ascii=False))
        prepared_jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    dataset["prepared_jsonl_path"] = storage.relpath(prepared_jsonl_path)
    dataset["prepared_with_simulation"] = simulate
    dataset["prepared_tokenizer_model_path"] = payload.tokenizer_model_path
    dataset["prepared_device"] = payload.device
    dataset["dataset_root_path"] = storage.relpath(dataset_dir)
    dataset["audio_dir_path"] = storage.relpath(dataset_dir / "audio")
    dataset["manifest_path"] = storage.relpath(storage.dataset_manifest_path(dataset_id))
    storage.write_json(storage.dataset_record_path(dataset_id), dataset)
    storage.write_json(
        storage.dataset_manifest_path(dataset_id),
        dataset_manifest_payload(
            dataset_id=dataset_id,
            dataset_name=dataset.get("name", dataset_id),
            dataset_dir=dataset_dir,
            record=dataset,
        ),
    )
    return FineTuneDataset(**dataset)


@app.post("/api/finetune-runs", response_model=FineTuneRun)
def create_finetune_run(payload: FineTuneRunCreateRequest) -> FineTuneRun:
    """파인튜닝 실행을 시작하고 결과 메타데이터를 저장한다.

    Args:
        payload: 파인튜닝 실행 요청.

    Returns:
        실행 결과 메타데이터.
    """

    dataset = get_dataset_record(payload.dataset_id)
    prepared_jsonl_path = dataset.get("prepared_jsonl_path")
    if not prepared_jsonl_path:
        raise HTTPException(status_code=400, detail="Dataset must be prepared before starting fine-tuning.")

    run_id = storage.new_id("run")
    run_dir = storage.finetune_runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    output_model_path = run_dir / payload.output_name
    log_path = run_dir / "train.log"

    simulate = payload.simulate_only or engine.simulation_mode
    command: List[str] = []
    entrypoint = resolve_finetune_entrypoint(payload.training_mode)

    if not simulate:
        dataset = ensure_real_prepared_dataset(dataset, payload.device)
        prepared_jsonl_path = dataset["prepared_jsonl_path"]
        command = [
            "python3",
            entrypoint,
            "--init_model_path",
            payload.init_model_path,
            "--output_model_path",
            str(output_model_path),
            "--train_jsonl",
            str(REPO_ROOT / prepared_jsonl_path),
            "--batch_size",
            str(payload.batch_size),
            "--lr",
            str(payload.lr),
            "--num_epochs",
            str(payload.num_epochs),
            "--speaker_name",
            payload.speaker_name,
        ]
        if payload.training_mode == "custom_voice" and payload.speaker_encoder_model_path:
            command.extend(["--speaker_encoder_model_path", payload.speaker_encoder_model_path])
        result = run_upstream_command(command)
        log_path.write_text((result.stdout or "") + "\n" + (result.stderr or ""), encoding="utf-8")
        status = "completed" if result.returncode == 0 else "failed"
    else:
        # 시뮬레이션 경로에서도 결과 디렉터리와 로그 파일을 남겨
        # UI와 후속 검증이 실제 실행과 같은 인터페이스를 사용하게 한다.
        output_model_path.mkdir(parents=True, exist_ok=True)
        (output_model_path / "README.txt").write_text(
            "Simulation mode checkpoint placeholder.\n",
            encoding="utf-8",
        )
        log_path.write_text("Simulation mode fine-tuning completed.\n", encoding="utf-8")
        status = "completed"

    created_at = utc_now()
    record = {
        "id": run_id,
        "dataset_id": payload.dataset_id,
        "training_mode": payload.training_mode,
        "init_model_path": payload.init_model_path,
        "speaker_encoder_model_path": payload.speaker_encoder_model_path,
        "output_model_path": storage.relpath(output_model_path),
        "batch_size": payload.batch_size,
        "lr": payload.lr,
        "num_epochs": payload.num_epochs,
        "speaker_name": payload.speaker_name,
        "status": status,
        "created_at": created_at,
        "finished_at": utc_now(),
        "log_path": storage.relpath(log_path),
        "command": command,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.finetune_runs_dir,
            category=payload.training_mode,
            label=f"{payload.output_name} {payload.speaker_name}",
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return FineTuneRun(**record)


@app.get("/api/finetune-runs", response_model=List[FineTuneRun])
def list_finetune_runs() -> List[FineTuneRun]:
    """저장된 파인튜닝 실행 목록을 반환한다.

    Returns:
        최신순 파인튜닝 실행 목록.
    """

    return list_finetune_run_records()


@app.get("/api/finetune-runs/{run_id}", response_model=FineTuneRun)
def get_finetune_run(run_id: str) -> FineTuneRun:
    """단일 파인튜닝 실행 결과를 조회한다.

    Args:
        run_id: 조회할 파인튜닝 실행 식별자.

    Returns:
        저장된 파인튜닝 실행 메타데이터.
    """

    payload = storage.get_record(storage.finetune_runs_dir, run_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Fine-tuning run not found.")
    return FineTuneRun(**payload)
