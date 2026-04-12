"""FastAPI application for the Qwen3-TTS demo backend."""

import json
import os
import pickle
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .qwen import QwenDemoEngine
from .schemas import (
    AudioAsset,
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
    PrepareDatasetRequest,
    PresetGenerateRequest,
    UniversalInferenceRequest,
    VoiceCloneRequest,
    VoiceDesignRequest,
)
from .storage import Storage, utc_now

JsonDict = Dict[str, Any]

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent
UPSTREAM_QWEN_DIR = REPO_ROOT / "Qwen3-TTS" / "finetuning"
load_dotenv(BACKEND_DIR / ".env")

storage = Storage(REPO_ROOT)
engine = QwenDemoEngine(storage)


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

        infos.append(
            ModelInfo(
                key=f"ft_{run_name}_{checkpoint_name}".replace("/", "_").replace(".", "_"),
                category=category,
                label=label,
                model_id=str(checkpoint_dir),
                supports_instruction=supports_instruction,
                notes=notes,
                recommended=False,
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
        return "sft_custom_voice_12hz.py"
    return "sft_12hz.py"

app = FastAPI(title="Qwen3-TTS Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=storage.data_dir), name="files")


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


def save_generation_record(payload: JsonDict) -> JsonDict:
    """생성 이력 레코드를 디스크에 저장한 뒤 그대로 반환한다.

    Args:
        payload: 저장할 생성 이력 데이터.

    Returns:
        저장된 생성 이력 데이터.
    """

    record_path = storage.generated_dir / f"{payload['id']}.json"
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
    prompt_path = storage.clone_prompts_dir / f"{prompt_id}.pkl"
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
        "created_at": utc_now(),
        "meta": meta or {},
    }
    storage.write_json(storage.clone_prompts_dir / f"{prompt_id}.json", record)
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

    result = run_upstream_command(
        [
            "python3",
            "prepare_data.py",
            "--device",
            device,
            "--tokenizer_model_path",
            tokenizer_model_path,
            "--input_jsonl",
            str(raw_jsonl_path),
            "--output_jsonl",
            str(prepared_jsonl_path),
        ]
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


def list_server_audio_assets() -> List[AudioAsset]:
    """서버 내부에 저장된 오디오 파일 목록을 최신순으로 반환한다."""

    assets: List[AudioAsset] = []
    generation_records = storage.list_json_records(storage.generated_dir)
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

    for path in sorted(storage.uploads_dir.glob("*")):
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
    return [GenerationRecord(**record) for record in records]


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
    return [FineTuneRun(**record) for record in records]


def basename_for_asset(value: str) -> str:
    normalized = value.replace(os.sep, "/")
    return normalized.split("/")[-1]


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
    )


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
    destination = storage.uploads_dir / f"{file_id}{extension}"
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
        mode="voice_design",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        instruction=payload.instruct,
        meta=meta,
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
    record = {
        "id": preset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "base_model": payload.base_model,
        "language": payload.language,
        "reference_text": payload.reference_text,
        "reference_audio_path": payload.reference_audio_path,
        "clone_prompt_path": payload.clone_prompt_path,
        "created_at": utc_now(),
        "notes": payload.notes,
    }
    storage.write_json(storage.presets_dir / f"{preset_id}.json", record)
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

    dataset_id = storage.new_id("dataset")
    dataset_dir = storage.dataset_dir(dataset_id)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    raw_jsonl_path = dataset_dir / "raw.jsonl"
    ref_suffix = Path(payload.ref_audio_path.strip()).suffix or ".wav"
    copied_ref_audio_path = copy_audio_into_dataset(dataset_dir, payload.ref_audio_path, f"ref{ref_suffix}")

    dataset_local_samples = []
    for index, sample in enumerate(normalized_samples):
        sample_suffix = Path(sample["audio_path"]).suffix or ".wav"
        copied_audio_path = copied_ref_audio_path
        if resolve_repo_audio_path(sample["audio_path"]) != resolve_repo_audio_path(payload.ref_audio_path):
            copied_audio_path = copy_audio_into_dataset(dataset_dir, sample["audio_path"], f"{index:05d}{sample_suffix}")
        dataset_local_samples.append({"audio_path": copied_audio_path, "text": sample["text"]})

    write_dataset_jsonl(raw_jsonl_path, copied_ref_audio_path, dataset_local_samples)

    record = {
        "id": dataset_id,
        "name": payload.name,
        "source_type": payload.source_type,
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
    storage.write_json(storage.dataset_record_path(dataset_id), dataset)
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
        "created_at": utc_now(),
        "finished_at": utc_now(),
        "log_path": storage.relpath(log_path),
        "command": command,
    }
    storage.write_json(storage.finetune_runs_dir / f"{run_id}.json", record)
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
