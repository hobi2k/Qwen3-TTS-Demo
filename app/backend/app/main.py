"""FastAPI application for the Qwen3-TTS demo backend."""

import gc
import json
import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional

import librosa
import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.background import BackgroundTask

from .ace_step import AceStepComposer, AceStepError
from .mmaudio import MMAudioError, MMAudioSoundEffectEngine
from .fish_speech import (
    FishSpeechError,
    S2ProEngine,
    fish_speech_model_dir,
    fish_speech_repo_root,
    fish_speech_status,
    generate_s2_pro_audio,
    list_s2_pro_references,
    managed_s2_pro_runtime_status,
    register_s2_pro_reference,
    stop_managed_s2_pro_server,
)
from .qwen import QwenDemoEngine
from .schemas import (
    AceStepCompleteRequest,
    AceStepCoverRequest,
    AceStepCreateSampleRequest,
    AceStepExtendRequest,
    AceStepExtractRequest,
    AceStepFormatSampleRequest,
    AceStepLegoRequest,
    AceStepRepaintRequest,
    AceStepRuntimeResponse,
    AceStepTrainingRequest,
    AceStepTrainingResponse,
    AceStepUnderstandRequest,
    AceStepUnderstandResponse,
    AudioAsset,
    AudioConvertRequest,
    AudioDenoiseRequest,
    AudioEditRequest,
    AudioSeparationRequest,
    AudioDatasetBuildRequest,
    AudioDatasetBuildResponse,
    AudioDatasetRecord,
    AudioToolAsset,
    AudioToolCapability,
    AudioToolJob,
    AudioToolResponse,
    BootstrapResponse,
    AudioTranscriptionRequest,
    AudioTranscriptionResponse,
    CharacterPreset,
    CharacterPresetCreateRequest,
    CharacterPresetUpdateRequest,
    ClonePromptCreateFromSampleRequest,
    ClonePromptCreateFromUploadRequest,
    ClonePromptRecord,
    CustomVoiceRequest,
    FineTuneDataset,
    FineTuneDatasetCreateRequest,
    FineTuneRun,
    FineTuneRunCreateRequest,
    FineTuneRunUpdateRequest,
    GalleryItem,
    GenerationDeleteBatchRequest,
    GenerationDeleteResponse,
    GenerationRecord,
    GenerationResponse,
    HealthResponse,
    HybridCloneInstructRequest,
    ModelInfo,
    MusicCompositionRequest,
    RvcTrainingRequest,
    RvcTrainingResponse,
    MMAudioTrainingRequest,
    MMAudioTrainingResponse,
    S2ProGenerateRequest,
    S2ProRuntimeResponse,
    S2ProTrainingRequest,
    S2ProTrainingResponse,
    S2ProVoiceCreateRequest,
    S2ProVoiceRecord,
    VoiceBoxCloneRequest,
    VoiceBoxFusionRequest,
    VoiceBoxSpeakerMorphRequest,
    VoiceChangerModelInfo,
    VoiceImageUploadResponse,
    VoiceAssetDeleteResponse,
    SoundEffectRequest,
    PrepareDatasetRequest,
    PresetGenerateRequest,
    AudioTranslateRequest,
    UniversalInferenceRequest,
    VibeVoiceASRRequest,
    VibeVoiceASRResponse,
    VibeVoiceModelAsset,
    VibeVoiceRuntimeResponse,
    VibeVoiceTTSRequest,
    VibeVoiceModelToolRequest,
    VibeVoiceModelToolResponse,
    VibeVoiceTrainingRequest,
    VibeVoiceTrainingResponse,
    VoiceChangerBatchRequest,
    VoiceChangerRequest,
    VoiceModelBlendRequest,
    VoiceCloneRequest,
    VoiceDesignRequest,
)
from .storage import Storage, utc_now
from .stem_separator import DEFAULT_VOCAL_MODEL, StemSeparatorEngine, StemSeparatorError
from .voice_changer import (
    ApplioVoiceChanger,
    VoiceChangerError,
    applio_voice_changer_available,
    list_available_voice_models,
)
from .vibevoice import VibeVoiceEngine, VibeVoiceError

JsonDict = Dict[str, Any]

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent
FRONTEND_DIR = REPO_ROOT / "app" / "frontend"
NEXT_FRONTEND_OUT_DIR = FRONTEND_DIR / "out"
API_LIKE_PREFIXES = (
    "api",
    "audio-tools",
    "generate",
    "music",
    "presets",
    "s2-pro",
    "vibevoice",
    "voice",
    "voicebox",
)
UPSTREAM_QWEN_DIR = REPO_ROOT / "vendor" / "Qwen3-TTS"
DEFAULT_QWEN_EXTENSIONS_DIR = REPO_ROOT / "qwen_extensions"
DEMO_SCRIPTS_DIR = REPO_ROOT / "scripts"
load_dotenv(BACKEND_DIR / ".env")


def prefer_upstream_qwen_imports() -> None:
    """Make in-process Qwen inference import the bundled upstream checkout first."""

    for path in (UPSTREAM_QWEN_DIR, UPSTREAM_QWEN_DIR / "finetuning"):
        if path.exists():
            path_text = str(path)
            if path_text not in sys.path:
                sys.path.insert(0, path_text)


prefer_upstream_qwen_imports()

storage = Storage(REPO_ROOT)
engine = QwenDemoEngine(storage)
s2_pro_engine = S2ProEngine(REPO_ROOT)
voice_changer = ApplioVoiceChanger(REPO_ROOT)
mmaudio_engine = MMAudioSoundEffectEngine(REPO_ROOT)
stem_separator_engine = StemSeparatorEngine(REPO_ROOT)
ace_step_composer = AceStepComposer(REPO_ROOT)
vibevoice_engine = VibeVoiceEngine(REPO_ROOT)


def release_qwen_runtime_before_external_engine() -> None:
    """Free Qwen GPU cache before launching a separate heavyweight runtime."""

    engine.release_runtime_cache()


def _python_cuda_status() -> Dict[str, Any]:
    """Return CUDA memory state for this backend process without loading models."""

    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on optional torch env
        return {"torch_available": False, "cuda_available": False, "error": str(exc)}

    if not bool(torch.cuda.is_available()):
        return {"torch_available": True, "cuda_available": False, "device_count": 0}

    device_index = torch.cuda.current_device()
    return {
        "torch_available": True,
        "cuda_available": True,
        "device_count": torch.cuda.device_count(),
        "current_device": device_index,
        "device_name": torch.cuda.get_device_name(device_index),
        "allocated_mb": round(float(torch.cuda.memory_allocated(device_index)) / 1024 / 1024, 2),
        "reserved_mb": round(float(torch.cuda.memory_reserved(device_index)) / 1024 / 1024, 2),
    }


def release_python_cuda_cache() -> Dict[str, Any]:
    """Run Python GC and return freeable CUDA cache to the driver."""

    gc.collect()
    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on optional torch env
        return {"released": False, "torch_available": False, "error": str(exc)}

    if bool(torch.cuda.is_available()):
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
    status = _python_cuda_status()
    status["released"] = True
    return status


def release_resident_runtime_before_external_engine() -> Dict[str, Any]:
    """Free resident model runtimes before launching another heavy engine.

    Qwen and ASR models live inside this FastAPI process. Local S2-Pro can live
    in a managed Fish Speech server process. ACE-Step, MMAudio, VibeVoice, and
    Applio mostly run as short-lived subprocesses, so they do not need an
    in-process unload hook here.
    """

    engine.release_runtime_cache()
    s2_pro_result = stop_managed_s2_pro_server()
    cuda_result = release_python_cuda_cache()
    return {
        "qwen": engine.runtime_cache_status(),
        "s2_pro": s2_pro_result,
        "cuda": cuda_result,
        "subprocess_engines": ["ace-step", "mmaudio", "vibevoice", "applio-rvc", "stem-separator"],
    }


def default_model_id(category: str) -> str:
    defaults = {
        "custom_voice": ("Qwen3-TTS-12Hz-0.6B-CustomVoice", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        "voice_design": ("Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        "base_clone": ("Qwen3-TTS-12Hz-1.7B-Base", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
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


def checkpoint_epoch(checkpoint_dir: Path) -> int:
    """Extract the numeric epoch from a checkpoint directory name.

    Args:
        checkpoint_dir: Directory named like ``checkpoint-epoch-2``.

    Returns:
        Parsed epoch number, or ``-1`` when parsing fails.
    """

    try:
        return int(checkpoint_dir.name.rsplit("-", 1)[-1])
    except Exception:
        return -1


def final_checkpoint_for_run(run_dir: Path) -> Optional[Path]:
    """Return the last checkpoint directory inside one finetune run folder.

    Args:
        run_dir: A run directory under ``data/finetune-runs``.

    Returns:
        Highest-epoch checkpoint directory, or ``None`` if the run has no checkpoints.
    """

    final_dir = run_dir / "final"
    if final_dir.exists():
        return final_dir

    checkpoints = [path for path in run_dir.glob("checkpoint-epoch-*") if path.is_dir()]
    if not checkpoints:
        return None
    checkpoints.sort(key=checkpoint_epoch)
    return checkpoints[-1]


def collapse_run_checkpoints(run_dir: Path) -> Optional[Path]:
    """여러 epoch 체크포인트를 `final` 하나만 남기도록 정리한다.

    Args:
        run_dir: `data/finetune-runs/<run_name>` 디렉터리.

    Returns:
        최종 선택 가능한 체크포인트 경로.
    """

    latest = final_checkpoint_for_run(run_dir)
    if latest is None:
        final_dir = run_dir / "final"
        return final_dir if final_dir.exists() else None

    final_dir = run_dir / "final"
    if latest != final_dir:
        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.copytree(latest, final_dir)

    for candidate in run_dir.glob("checkpoint-epoch-*"):
        if candidate.is_dir():
            shutil.rmtree(candidate)
    return final_dir if final_dir.exists() else latest


def infer_finetune_run_record(run_dir: Path) -> Optional[FineTuneRun]:
    """run 레코드 JSON이 없어도 최종 체크포인트만으로 실행 목록을 복구한다."""

    checkpoint_dir = collapse_run_checkpoints(run_dir)
    if checkpoint_dir is None:
        return None

    config_path = checkpoint_dir / "config.json"
    if not config_path.exists():
        return None

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return None

    talker_config = dict(config.get("talker_config", {}) or {})
    speaker_map = dict(talker_config.get("spk_id", {}) or {})
    model_family = str(config.get("demo_model_family") or "").strip().lower() or None
    speaker_encoder_included = bool(config.get("speaker_encoder_included"))
    stock_names = {name.lower() for name in stock_speaker_names()}
    custom_speakers = [name for name in speaker_map.keys() if name.lower() not in stock_names]
    speaker_name = custom_speakers[-1] if custom_speakers else (next(reversed(speaker_map.keys())) if speaker_map else "speaker")
    training_mode = str(config.get("tts_model_type") or "base").strip().lower() or "base"
    if model_family is None:
        model_family = "custom_voice" if training_mode == "custom_voice" else training_mode
    created_at = utc_now_from_stat(checkpoint_dir)
    if model_family == "voicebox":
        summary_label = "보이스박스 학습 모델"
    else:
        summary_label = "CustomVoice 학습 모델" if training_mode == "custom_voice" else "Base 학습 모델"

    return FineTuneRun(
        id=run_dir.name,
        dataset_id="unknown",
        training_mode=training_mode,
        init_model_path="",
        speaker_encoder_model_path=None,
        output_model_path=storage.relpath(run_dir),
        batch_size=0,
        lr=0.0,
        num_epochs=0,
        speaker_name=speaker_name,
        status="completed",
        created_at=created_at,
        finished_at=created_at,
        log_path=None,
        command=None,
        final_checkpoint_path=storage.relpath(checkpoint_dir),
        selectable_model_path=storage.relpath(checkpoint_dir),
        is_selectable=True,
        stage_label="학습 완료",
        summary_label=summary_label,
        output_name=run_dir.name,
        display_name=None,
        model_family=model_family,
        speaker_encoder_included=speaker_encoder_included,
    )


def scan_finetuned_model_infos() -> List[ModelInfo]:
    """로컬 fine-tuning 산출물 중 추론 가능한 체크포인트를 찾아 모델 목록으로 변환한다."""

    infos: List[ModelInfo] = []
    run_root = storage.finetune_runs_dir
    if not run_root.exists():
        return infos

    for run_dir in sorted([path for path in run_root.iterdir() if path.is_dir()], reverse=True):
        checkpoint_dir = final_checkpoint_for_run(run_dir)
        if checkpoint_dir is None:
            continue
        config_path = checkpoint_dir / "config.json"
        weights_path = checkpoint_dir / "model.safetensors"
        if not config_path.exists() or not weights_path.exists():
            continue

        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        tts_model_type = str(config.get("tts_model_type") or "").strip().lower()
        model_family = str(config.get("demo_model_family") or "").strip().lower() or None
        if model_family is None and tts_model_type:
            model_family = "custom_voice" if tts_model_type == "custom_voice" else tts_model_type
        speaker_encoder_included = bool(config.get("speaker_encoder_included"))
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
        run_record = storage.get_record(storage.finetune_runs_dir, run_dir.name) or {}
        label = str(run_record.get("display_name") or run_record.get("output_name") or run_name).strip() or run_name
        notes = f"바로 추론에 사용할 수 있는 최종 모델입니다."
        if custom_names:
            notes = f"{notes} 목소리: {', '.join(custom_names)}"
        if speaker_encoder_included:
            notes = f"{notes} 복제 실험에 필요한 정보가 모델 안에 포함되어 있습니다."
        recommended = run_name in {"mai_ko_base17b_full", "mai_ko_customvoice17b_full"}

        infos.append(
            ModelInfo(
                key=f"ft_{run_name}".replace("/", "_").replace(".", "_"),
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
                model_family=model_family,
                speaker_encoder_included=speaker_encoder_included,
                image_url=voice_image_url_for("trained", run_name),
            )
        )

    infos.sort(key=lambda item: item.label.lower())
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
            notes="짧은 문장으로 빠르게 들어보기 좋은 기본 목소리 모델",
            recommended=True,
            inference_mode="custom_voice",
            source="stock",
            available_speakers=stock_speaker_names(),
            default_speaker="Sohee",
            model_family="custom_voice",
        ),
        ModelInfo(
            key="custom_voice_1_7b",
            category="custom_voice",
            label="CustomVoice 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-CustomVoice", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
            supports_instruction=True,
            notes="말투 지시를 우선 확인할 때 쓰는 고품질 목소리 모델",
            inference_mode="custom_voice",
            source="stock",
            available_speakers=stock_speaker_names(),
            default_speaker="Sohee",
            model_family="custom_voice",
        ),
        ModelInfo(
            key="voice_design_1_7b",
            category="voice_design",
            label="VoiceDesign 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-VoiceDesign", default_model_id("voice_design")),
            supports_instruction=True,
            notes="설명만으로 새 목소리 방향을 만드는 모델",
            recommended=True,
            inference_mode="voice_design",
            source="stock",
            model_family="voice_design",
        ),
        ModelInfo(
            key="base_clone_0_6b",
            category="base_clone",
            label="Base 0.6B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-0.6B-Base", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
            supports_instruction=False,
            notes="참조 음성으로 목소리 스타일을 잡아볼 때 쓰는 가벼운 모델",
            inference_mode="voice_clone",
            source="stock",
            model_family="base",
        ),
        ModelInfo(
            key="base_clone_1_7b",
            category="base_clone",
            label="Base 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-Base", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
            supports_instruction=False,
            notes="목소리 복제와 학습 기준으로 쓰는 고품질 기본 모델",
            recommended=True,
            inference_mode="voice_clone",
            source="stock",
            model_family="base",
        ),
        ModelInfo(
            key="tokenizer_12hz",
            category="tokenizer",
            label="Tokenizer 12Hz",
            model_id=model_path_or_repo("Qwen3-TTS-Tokenizer-12Hz", default_model_id("tokenizer")),
            supports_instruction=False,
            notes="학습 데이터 준비에 필요한 음성 토큰 처리 모델",
            source="stock",
        ),
    ]
    return catalog + scan_finetuned_model_infos()


def model_catalog_by_id() -> Dict[str, ModelInfo]:
    """현재 모델 카탈로그를 model_id 기준으로 빠르게 조회할 수 있게 만든다."""

    return {item.model_id: item for item in build_model_catalog()}


def qwen_extensions_dir() -> Path:
    """Return the directory that owns demo-specific Qwen extension scripts.

    The stock Qwen checkout remains under ``vendor/Qwen3-TTS``. Scripts that were
    added by this demo are resolved from ``QWEN_EXTENSIONS`` first so backend
    execution does not depend on mutating the upstream tree.
    """

    configured = (os.getenv("QWEN_EXTENSIONS") or "").strip()
    if not configured:
        return DEFAULT_QWEN_EXTENSIONS_DIR
    candidate = Path(configured).expanduser()
    return candidate if candidate.is_absolute() else (REPO_ROOT / candidate)


def resolve_qwen_extension_script(relative_path: str) -> str:
    """Resolve a demo-maintained Qwen script path for CLI execution.

    Args:
        relative_path: Path inside ``qwen_extensions``.

    Returns:
        Absolute path to the extension script.
    """

    extension_path = qwen_extensions_dir() / relative_path
    if not extension_path.exists():
        raise HTTPException(status_code=500, detail=f"Qwen extension script not found: {relative_path}")
    return str(extension_path)


def resolve_finetune_entrypoint(training_mode: str) -> str:
    """파인튜닝 모드에 맞는 실행 스크립트 경로를 반환한다."""

    normalized = (training_mode or "base").strip().lower()
    if normalized == "base":
        return resolve_qwen_extension_script("finetuning/sft_base_12hz.py")
    if normalized == "custom_voice":
        return resolve_qwen_extension_script("finetuning/sft_custom_voice_12hz.py")
    if normalized == "voicebox":
        return resolve_qwen_extension_script("finetuning/sft_voicebox_12hz.py")
    return resolve_qwen_extension_script("finetuning/sft_base_12hz.py")


def qwen_training_python() -> str:
    """Return the Python executable used for Qwen prepare/fine-tuning jobs.

    Fine-tuning must run in the same dependency environment as the backend by
    default. A bare ``python3`` can point to the system interpreter and miss
    torch, qwen-tts, flash-attn, or local editable packages, so the backend uses
    ``QWEN_DEMO_PYTHON`` only when the user explicitly overrides it.
    """

    configured = (os.getenv("QWEN_DEMO_PYTHON") or "").strip()
    return configured or sys.executable


def qwen_subprocess_env() -> Dict[str, str]:
    """Build a stable environment for Qwen prepare/fine-tuning subprocesses."""

    env = os.environ.copy()
    pythonpath_parts = [
        str(UPSTREAM_QWEN_DIR),
        str(UPSTREAM_QWEN_DIR / "finetuning"),
        str(qwen_extensions_dir()),
    ]
    existing = env.get("PYTHONPATH", "")
    if existing:
        pythonpath_parts.append(existing)
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)
    env.setdefault("HF_HOME", str(REPO_ROOT / "data" / "cache" / "huggingface"))
    env.setdefault("TRANSFORMERS_CACHE", str(REPO_ROOT / "data" / "cache" / "huggingface" / "transformers"))
    env.setdefault("MPLCONFIGDIR", str(REPO_ROOT / "data" / "cache" / "matplotlib"))
    Path(env["HF_HOME"]).mkdir(parents=True, exist_ok=True)
    Path(env["TRANSFORMERS_CACHE"]).mkdir(parents=True, exist_ok=True)
    Path(env["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
    return env

app = FastAPI(title="Qwen3-TTS Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=storage.data_dir), name="files")


def frontend_build_dir() -> Path:
    """Return the built Next.js static export directory."""

    return NEXT_FRONTEND_OUT_DIR


if frontend_build_dir().exists():
    assets_dir = frontend_build_dir() / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")
    next_dir = frontend_build_dir() / "_next"
    if next_dir.exists():
        app.mount("/_next", StaticFiles(directory=next_dir), name="next-static")


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


def generated_audio_path(category: str, label: str, extension: str = "wav", exact_name: bool = False) -> Path:
    """사람이 읽을 수 있는 생성 오디오 경로를 만든다."""

    return storage.named_output_path(
        root=storage.generated_dir,
        category=category,
        label=readable_label(label, category),
        extension=extension,
        created_at=utc_now_datetime(),
        include_time=not exact_name,
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
        # Older generated audio may not have a JSON metadata record. The gallery
        # still materializes those files through list_generation_records(), so
        # deletion and reuse should be able to resolve them by their synthetic id.
        for record in list_generation_records():
            if record.id == record_id:
                return record.model_dump()
        raise HTTPException(status_code=404, detail="Generation record not found.")
    return payload


def delete_generation_record_files(record_id: str) -> int:
    """생성 갤러리 항목과 연결된 파일을 함께 삭제한다.

    Args:
        record_id: 삭제할 생성 이력 식별자.

    Returns:
        실제로 삭제한 레코드 수.
    """

    payload = get_generation_record(record_id)
    deleted_any = False

    audio_rel_path = str(payload.get("output_audio_path") or "").strip()
    if audio_rel_path:
        audio_path = REPO_ROOT / audio_rel_path
        if audio_path.exists():
            audio_path.unlink()
            deleted_any = True

    for record_path in storage.find_record_paths(storage.generated_dir, record_id):
        if record_path.exists():
            record_path.unlink()
            deleted_any = True

    return 1 if deleted_any else 0


VOICE_ASSET_KINDS = {"preset", "s2pro", "rvc", "trained"}
VOICE_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VOICE_IMAGE_MAX_BYTES = 4 * 1024 * 1024  # 4 MB cap keeps card images snappy.


def _voice_image_dir(kind: str) -> Path:
    if kind not in VOICE_ASSET_KINDS:
        raise HTTPException(status_code=400, detail=f"Unsupported voice asset kind: {kind}")
    return storage.voice_images_dir / kind


def _voice_image_paths_for(kind: str, asset_id: str) -> List[Path]:
    if not asset_id:
        return []
    base_dir = _voice_image_dir(kind)
    return [base_dir / f"{asset_id}{ext}" for ext in VOICE_IMAGE_EXTENSIONS if (base_dir / f"{asset_id}{ext}").exists()]


def voice_image_url_for(kind: str, asset_id: Optional[str]) -> Optional[str]:
    """Return the static `/files/...` URL for a voice asset image, or None when missing."""

    if not asset_id:
        return None
    matches = _voice_image_paths_for(kind, asset_id)
    if not matches:
        return None
    return audio_url_for(storage.relpath(matches[0]))


def _resolve_repo_path(value: Any) -> Optional[Path]:
    """레코드 안의 상대/절대 경로를 프로젝트 내부 실제 파일로 안전하게 해석한다."""

    if not value:
        return None
    candidate = Path(str(value))
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    try:
        resolved = candidate.resolve()
    except Exception:
        return None
    repo_root = REPO_ROOT.resolve()
    if repo_root not in (resolved, *resolved.parents):
        return None
    return resolved if resolved.exists() else None


def _add_archive_path(zip_file: zipfile.ZipFile, source: Path, archive_root: str, seen: set[str]) -> None:
    """파일 또는 디렉터리를 zip에 추가하되 중복과 프로젝트 외부 경로를 피한다."""

    try:
        resolved = source.resolve()
    except Exception:
        return
    if not resolved.exists():
        return

    if resolved.is_dir():
        for child in sorted(resolved.rglob("*")):
            if child.is_file():
                _add_archive_path(zip_file, child, f"{archive_root}/{resolved.name}", seen)
        return

    key = str(resolved)
    if key in seen:
        return
    seen.add(key)

    try:
        relative = resolved.relative_to(REPO_ROOT)
    except ValueError:
        relative = Path(resolved.name)
    zip_file.write(resolved, f"{archive_root}/{relative.as_posix()}")


def _archive_response(name: str, paths: List[Path], readme: str = "") -> FileResponse:
    """여러 자산 파일을 임시 zip으로 묶어 다운로드 응답을 만든다."""

    archive_name = f"{storage.slugify(name, default='voice-studio-asset')}.zip"
    temp = NamedTemporaryFile(delete=False, suffix=".zip", prefix="download_", dir=str(storage.data_dir))
    temp_path = Path(temp.name)
    temp.close()

    seen: set[str] = set()
    with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zip_file:
        for path in paths:
            _add_archive_path(zip_file, path, storage.slugify(name, default="asset"), seen)
        if readme or not seen:
            zip_file.writestr(f"{storage.slugify(name, default='asset')}/README.txt", readme or "No local files were available for this asset.")

    return FileResponse(
        temp_path,
        media_type="application/zip",
        filename=archive_name,
        background=BackgroundTask(lambda path: Path(path).unlink(missing_ok=True), str(temp_path)),
    )


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


def get_clone_prompt_record(prompt_id: str) -> JsonDict:
    """Clone prompt 레코드를 조회하고 없으면 404를 발생시킨다."""

    payload = storage.get_record(storage.clone_prompts_dir, prompt_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Clone prompt not found.")
    return payload


def get_dataset_record(dataset_id: str) -> JsonDict:
    """데이터셋 레코드를 조회하고 없으면 404를 발생시킨다.

    Args:
        dataset_id: 조회할 데이터셋 식별자.

    Returns:
        조회된 데이터셋 데이터.
    """

    record_path = storage.dataset_record_path(dataset_id)
    payload = storage.read_json(record_path) if record_path.exists() else None
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
    """참조 입력으로부터 upstream 호환 clone prompt 파일을 생성한다.

    Args:
        prompt_path: 저장할 torch serialized prompt 파일 경로.
        reference_audio_path: 참조 음성 상대 경로.
        reference_text: 참조 음성 텍스트.
        x_vector_only_mode: x-vector 전용 clone 모드 사용 여부.
    """

    if not engine.qwen_tts_available:
        raise HTTPException(status_code=503, detail="Qwen clone prompt를 만들 실제 Qwen 런타임이 준비되지 않았습니다.")

    model = engine._get_model("base_clone", model_id)
    prompt_payload = model.create_voice_clone_prompt(
        ref_audio=str(REPO_ROOT / reference_audio_path),
        ref_text=reference_text,
        x_vector_only_mode=x_vector_only_mode,
    )

    torch = engine._torch
    if torch is None:
        raise HTTPException(status_code=503, detail="Qwen clone prompt를 저장할 torch 런타임이 준비되지 않았습니다.")

    def to_cpu(value: Any) -> Any:
        if torch.is_tensor(value):
            return value.detach().cpu()
        return value

    payload = {"items": [{key: to_cpu(value) for key, value in asdict(item).items()} for item in prompt_payload]}
    torch.save(payload, str(prompt_path))


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
        extension="pt",
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

    raw_path = audio_path.strip().replace("\\", "/")
    windows_drive_match = re.match(r"^([A-Za-z]):/(.*)$", raw_path)
    if windows_drive_match:
        drive, rest = windows_drive_match.groups()
        wsl_path = Path(f"/mnt/{drive.lower()}/{rest}")
        if wsl_path.exists():
            return str(wsl_path)

    candidate = Path(raw_path)
    if candidate.is_absolute():
        return str(candidate)
    return str((REPO_ROOT / candidate).resolve())


def prepare_rvc_training_dataset_from_audio_paths(model_name: str, audio_paths: List[str]) -> Path:
    """선택한 생성/업로드 음성을 Applio가 읽을 학습 폴더로 복사한다."""

    seen: set[str] = set()
    deduped_paths: List[str] = []
    for raw_path in audio_paths:
        path = raw_path.strip()
        if path and path not in seen:
            deduped_paths.append(path)
            seen.add(path)
    if not deduped_paths:
        raise HTTPException(status_code=400, detail="RVC training needs a target voice folder or selected gallery audio.")

    created_at = datetime.now(timezone.utc)
    run_dir = storage.dated_child_dir(storage.data_dir, "rvc-datasets", created_at=created_at) / (
        f"{created_at.strftime('%H%M%S')}_{storage.slugify(model_name, default='rvc-dataset')}"
    )
    wav_dir = run_dir / "wavs"
    wav_dir.mkdir(parents=True, exist_ok=True)

    manifest: List[Dict[str, str]] = []
    for index, audio_path in enumerate(deduped_paths, start=1):
        source = Path(resolve_repo_audio_path(audio_path))
        if not source.exists() or not source.is_file():
            raise HTTPException(status_code=400, detail=f"Selected RVC training audio not found: {audio_path}")
        if source.suffix.lower() != ".wav":
            raise HTTPException(status_code=400, detail=f"RVC training currently expects WAV files. Convert first: {audio_path}")
        target = wav_dir / f"{index:04d}_{storage.slugify(source.stem, default='sample')}.wav"
        shutil.copy2(source, target)
        manifest.append({"source": audio_path, "copied_to": storage.relpath(target)})

    (run_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return wav_dir


def samples_from_audio_folder(folder_path: str) -> List[Dict[str, str]]:
    """오디오 폴더를 스캔해 데이터셋 샘플 목록으로 변환한다."""

    folder = Path(resolve_repo_audio_path(folder_path))
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Sample folder not found: {folder_path}")

    audio_extensions = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus"}
    text_roots = [
        folder,
        folder.parent / "text",
        folder.parent / "texts",
        folder.parent / "transcripts",
    ]
    samples: List[Dict[str, str]] = []
    for audio_path in sorted(path for path in folder.rglob("*") if path.is_file() and path.suffix.lower() in audio_extensions):
        text = ""
        for text_root in text_roots:
            for suffix in (".txt", ".lab"):
                candidate = text_root / f"{audio_path.stem}{suffix}"
                if candidate.exists():
                    text = candidate.read_text(encoding="utf-8").strip()
                    break
            if text:
                break
        samples.append({"audio_path": str(audio_path), "text": text})
    return samples


def copy_audio_as_dataset_wav(source_audio_path: str, target_path: Path) -> None:
    """Copy an audio file into a dataset folder as WAV when needed."""

    source = Path(resolve_repo_audio_path(source_audio_path))
    if not source.exists() or not source.is_file():
        raise HTTPException(status_code=400, detail=f"Dataset audio not found: {source_audio_path}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix.lower() == ".wav":
        shutil.copy2(source, target_path)
        return
    audio, sample_rate = librosa.load(str(source), sr=None, mono=False)
    if isinstance(audio, np.ndarray) and audio.ndim == 2:
        audio = audio.T
    sf.write(target_path, audio, sample_rate)


def normalize_tool_dataset_samples(payload: AudioDatasetBuildRequest) -> List[Dict[str, str]]:
    """Collect gallery or folder samples and fill missing text with ASR."""

    incoming_samples: List[Any] = list(payload.samples)
    if payload.source_type == "folder":
        if not payload.sample_folder_path:
            raise HTTPException(status_code=400, detail="sample_folder_path is required for folder datasets.")
        incoming_samples = samples_from_audio_folder(payload.sample_folder_path)

    normalized: List[Dict[str, str]] = []
    for sample in incoming_samples:
        audio_path = str(getattr(sample, "audio_path", "") if not isinstance(sample, dict) else sample.get("audio_path", "")).strip()
        text = str(getattr(sample, "text", "") if not isinstance(sample, dict) else sample.get("text", "") or "").strip()
        if not audio_path:
            continue
        if payload.transcribe and not text:
            text = transcribe_audio_or_raise(audio_path, model_id=payload.asr_model_id).text.strip()
        normalized.append({"audio_path": audio_path, "text": text})

    if not normalized:
        raise HTTPException(status_code=400, detail="At least one dataset sample is required.")
    return normalized


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
            qwen_training_python(),
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
        env=qwen_subprocess_env(),
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


def transcribe_audio_or_raise(audio_path: str, model_id: Optional[str] = None) -> AudioTranscriptionResponse:
    """저장된 음성 파일을 전사하고 HTTP 오류로 정규화한다.

    Args:
        audio_path: 프로젝트 루트 기준 상대 경로 또는 절대 경로.

    Returns:
        ASR 전사 결과 응답 모델.
    """

    if (model_id or "").startswith("vibevoice"):
        try:
            absolute_path = resolve_audio_absolute_path(audio_path)
            result = vibevoice_engine.transcribe(audio_path=absolute_path)
        except HTTPException:
            raise
        except VibeVoiceError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(status_code=500, detail=f"VibeVoice-ASR failed: {error}") from error

        return AudioTranscriptionResponse(
            audio_path=audio_path,
            text=str(result.get("text") or ""),
            language=result.get("language"),
            simulation=False,
            model_id="vibevoice/asr",
            provider="vibevoice",
        )

    try:
        result = engine.transcribe_reference_audio(audio_path, model_id=model_id)
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
    """참조 텍스트를 정리하고 비어 있으면 Qwen3-ASR 전사를 사용한다.

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


def requested_output_name(payload: Any) -> str:
    """사용자가 지정한 생성 파일 이름을 안전하게 정리한다."""

    return readable_label(str(getattr(payload, "output_name", "") or "").strip(), "")


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
                id=f"file_{hashlib.sha1(rel_path.encode('utf-8')).hexdigest()[:12]}",
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


def list_gallery_items() -> List[GalleryItem]:
    """최근 생성 결과를 하나의 갤러리 화면에서 다룰 수 있게 정리한다."""

    items: List[GalleryItem] = []
    for record in list_generation_records():
        filename = Path(record.output_audio_path).name
        title = (record.input_text or "").strip() or filename
        items.append(
            GalleryItem(
                id=record.id,
                kind=record.mode,
                title=title[:80],
                subtitle=(record.speaker or record.mode or "").replace("_", " "),
                created_at=record.created_at,
                audio_path=record.output_audio_path,
                audio_url=record.output_audio_url,
                filename=filename,
                source="generation",
                transcript_text=record.input_text,
                preview_text=(record.instruction or "")[:120] or None,
                meta=record.meta,
            )
        )

    items.sort(key=lambda item: item.created_at or "", reverse=True)
    return items


def list_preset_records() -> List[CharacterPreset]:
    records = storage.list_json_records(storage.presets_dir)
    presets: List[CharacterPreset] = []
    for record in records:
        record["image_url"] = voice_image_url_for("preset", record.get("id"))
        presets.append(CharacterPreset(**record))
    return presets


def list_clone_prompt_records() -> List[ClonePromptRecord]:
    """저장된 Qwen clone prompt 원본 자산을 최신순으로 반환한다."""

    prompts: List[ClonePromptRecord] = []
    for record in storage.list_json_records(storage.clone_prompts_dir):
        try:
            prompts.append(ClonePromptRecord(**record))
        except Exception:
            continue
    prompts.sort(key=lambda item: item.created_at or "", reverse=True)
    return prompts


def list_dataset_records() -> List[FineTuneDataset]:
    by_id: Dict[str, FineTuneDataset] = {}
    for path in storage.list_dataset_record_paths():
        try:
            record = storage.read_json(path)
        except Exception:
            continue

        try:
            record["training_ready"] = bool(record.get("prepared_jsonl_path"))
            record["status_label"] = "학습 가능" if record["training_ready"] else "데이터셋 생성 완료"
            record["next_step_label"] = "학습 시작" if record["training_ready"] else "학습용 준비 실행"
            dataset = FineTuneDataset(**record)
        except Exception:
            continue

        existing = by_id.get(dataset.id)
        if existing is None or (dataset.created_at or "") > (existing.created_at or ""):
            by_id[dataset.id] = dataset

    datasets = sorted(by_id.values(), key=lambda item: item.created_at or "", reverse=True)
    return datasets


def list_audio_dataset_records() -> List[AudioDatasetRecord]:
    """Qwen 외 엔진용 데이터셋 manifest를 최신순으로 반환한다."""

    records: List[AudioDatasetRecord] = []
    valid_targets = {"s2_pro", "vibevoice", "rvc", "mmaudio", "ace_step"}
    for path in sorted(storage.datasets_dir.glob("*/manifest.json"), reverse=True):
        try:
            record = storage.read_json(path)
        except Exception:
            continue
        if record.get("target") not in valid_targets:
            continue
        try:
            records.append(
                AudioDatasetRecord(
                    id=str(record.get("id") or path.parent.name),
                    name=str(record.get("name") or path.parent.name),
                    target=str(record["target"]),
                    dataset_root_path=str(record.get("dataset_root_path") or storage.relpath(path.parent)),
                    audio_dir_path=str(record.get("audio_dir_path") or ""),
                    lab_audio_dir_path=record.get("lab_audio_dir_path"),
                    train_jsonl_path=record.get("train_jsonl_path"),
                    validation_jsonl_path=record.get("validation_jsonl_path"),
                    dataset_json_path=record.get("dataset_json_path"),
                    manifest_path=str(record.get("manifest_path") or storage.relpath(path)),
                    sample_count=int(record.get("sample_count") or 0),
                    message=str(record.get("message") or ""),
                    source_type=str(record.get("source_type") or "gallery"),
                    reference_audio_path=record.get("reference_audio_path"),
                    created_at=record.get("created_at"),
                )
            )
        except Exception:
            continue
    return sorted(records, key=lambda item: item.created_at or "", reverse=True)


def list_finetune_run_records() -> List[FineTuneRun]:
    records = storage.list_json_records(storage.finetune_runs_dir)
    items: List[FineTuneRun] = []
    seen_ids = set()
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
        output_model_path = REPO_ROOT / record["output_model_path"]
        final_checkpoint = collapse_run_checkpoints(output_model_path)
        record["final_checkpoint_path"] = storage.relpath(final_checkpoint) if final_checkpoint else None
        record["selectable_model_path"] = record["final_checkpoint_path"]
        record["is_selectable"] = bool(record["final_checkpoint_path"]) and record.get("status") == "completed"
        record["stage_label"] = "학습 완료" if record.get("status") == "completed" else "학습 실패"
        record["summary_label"] = (
            "CustomVoice 학습 모델" if record.get("training_mode") == "custom_voice" else "Base 학습 모델"
        )
        output_name = str(record.get("output_name") or Path(str(record.get("output_model_path") or record["id"])).name)
        record["output_name"] = output_name
        record.setdefault("display_name", output_name)
        try:
            parsed = FineTuneRun(**record)
            items.append(parsed)
            seen_ids.add(parsed.id)
        except Exception:
            continue
    for run_dir in sorted([path for path in storage.finetune_runs_dir.iterdir() if path.is_dir()], reverse=True):
        if run_dir.name in seen_ids:
            continue
        inferred = infer_finetune_run_record(run_dir)
        if inferred is not None:
            items.append(inferred)
    items.sort(key=lambda item: item.created_at or "", reverse=True)
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


def clone_prompt_id_from_path(value: Any) -> Optional[str]:
    """`clone_xxxxx` 형태의 ID를 경로 문자열에서 추출한다."""

    if not value:
        return None
    match = re.search(r"(clone_[0-9a-fA-F]+)", str(value))
    return match.group(1) if match else None


def audio_tool_capabilities() -> List[AudioToolCapability]:
    """독립 오디오 기능 페이지에서 쓸 설명 목록을 반환한다.

    Returns:
        프런트가 각 오디오 기능 페이지의 제목과 안내 문구를 구성할 때 사용하는 capability 목록.
    """

    available_voice_models = list_voice_changer_models()

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
            label="Applio 변환",
            description="RVC/Applio로 기존 음성의 타이밍을 유지한 채 음색을 바꿉니다.",
            available=applio_voice_changer_available(REPO_ROOT) and bool(available_voice_models),
            notes="Applio 저장소만으로는 부족하고, RVC 모델(.pth)과 인덱스(.index)가 함께 있어야 합니다.",
        ),
        AudioToolCapability(
            key="audio_separation",
            label="오디오 분리",
            description=f"audio-separator/UVR 계열 stem 모델로 보컬과 반주를 분리합니다. 기본 모델: {DEFAULT_VOCAL_MODEL}.",
            available=stem_separator_engine.is_available(),
            notes=stem_separator_engine.availability_notes(),
        ),
        AudioToolCapability(
            key="audio_editor",
            label="오디오 편집",
            description="구간 자르기, 페이드, 게인, 정규화 같은 기본 편집을 적용합니다.",
            available=True,
            notes="로컬 soundfile/librosa 기반 편집입니다. 결과는 생성 갤러리에 저장됩니다.",
        ),
        AudioToolCapability(
            key="audio_denoise",
            label="음성 정제",
            description="스펙트럴 게이트, 저역 컷, 고역 히스 완화로 음성 배경 노이즈를 줄입니다.",
            available=True,
            notes="GPU 없이 로컬 DSP로 처리합니다. 강도를 높이면 노이즈는 줄지만 숨소리와 잔향도 함께 줄 수 있습니다.",
        ),
        AudioToolCapability(
            key="ace_step",
            label="ACE-Step 작곡",
            description="ACE-Step으로 태그와 가사를 바탕으로 완성형 음악을 생성합니다.",
            available=ace_step_composer.is_available(),
            notes=ace_step_composer.availability_notes(),
        ),
        AudioToolCapability(
            key="s2_pro",
            label="S2-Pro 음성 생성",
            description="S2-Pro 엔진으로 저장 목소리, 태그 기반 TTS, 대화, 다국어 음성을 생성합니다.",
            available=s2_pro_engine.is_available(),
            notes=s2_pro_engine.availability_notes(),
        ),
        AudioToolCapability(
            key="vibevoice",
            label="VibeVoice",
            description="Microsoft VibeVoice vendor로 ASR, Realtime TTS 0.5B, 1.5B TTS weights를 관리합니다.",
            available=vibevoice_engine.status()["available"],
            notes=vibevoice_engine.status()["notes"],
        ),
    ]


def available_asr_models() -> List[Dict[str, str]]:
    """ASR dropdown models across Qwen and VibeVoice providers."""

    models = list(engine.supported_asr_models())
    models.extend(vibevoice_engine.asr_models())
    return models


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


def readable_stem_label(path: Path) -> str:
    """Stem separator 출력 파일명을 화면용 라벨로 정리한다."""

    stem = path.stem.replace("_", " ").replace("-", " ").strip().lower()
    if "vocal" in stem:
        return "vocals"
    if "instrumental" in stem or "inst" in stem:
        return "instrumental"
    if "drum" in stem:
        return "drums"
    if "bass" in stem:
        return "bass"
    if "other" in stem:
        return "other"
    if "guitar" in stem:
        return "guitar"
    if "piano" in stem:
        return "piano"
    return path.stem


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
        env=qwen_subprocess_env(),
    )


def resolve_model_path_for_cli(model_path: str) -> str:
    """CLI 스크립트에 넘길 모델 경로를 절대 경로로 정규화한다."""

    candidate = Path(model_path.strip())
    if candidate.is_absolute():
        return str(candidate)
    repo_candidate = REPO_ROOT / candidate
    if repo_candidate.exists():
        return str(repo_candidate.resolve())
    return model_path


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
        asr_provider="qwen3-asr",
        default_asr_model=engine.resolve_transcription_model_id(),
    )


@app.get("/api/runtime/status")
def runtime_status() -> Dict[str, Any]:
    """Return currently resident runtime state for model switching diagnostics."""

    return {
        "qwen": engine.runtime_cache_status(),
        "s2_pro": managed_s2_pro_runtime_status(),
        "cuda": _python_cuda_status(),
        "external_engines": {
            "ace_step": "subprocess_per_request",
            "mmaudio": "subprocess_per_request",
            "vibevoice": "subprocess_per_request",
            "applio_rvc": "subprocess_per_request",
            "stem_separator": "subprocess_or_lazy_model",
        },
    }


@app.post("/api/runtime/unload")
def unload_runtime(include_s2_pro: bool = True) -> Dict[str, Any]:
    """Unload resident models so another studio feature can use the GPU.

    Args:
        include_s2_pro: When true, stop the backend-managed local S2-Pro server
            as well as the in-process Qwen cache. Set false before an S2-Pro
            request that only needs Qwen memory released.
    """

    engine.release_runtime_cache()
    s2_pro_result: Dict[str, Any] = {"stopped": False, "reason": "not_requested"}
    if include_s2_pro:
        s2_pro_result = stop_managed_s2_pro_server()
    cuda_result = release_python_cuda_cache()
    return {
        "status": "unloaded",
        "qwen": engine.runtime_cache_status(),
        "s2_pro": s2_pro_result,
        "cuda": cuda_result,
    }


@app.get("/api/bootstrap", response_model=BootstrapResponse)
def bootstrap() -> BootstrapResponse:
    """초기 화면 렌더에 필요한 공통 데이터를 한 번에 반환한다."""

    return BootstrapResponse(
        health=health(),
        models=list_models(),
        speakers=list_speakers(),
        gallery=list_gallery_items(),
        audio_assets=list_server_audio_assets(),
        history=list_generation_records(),
        clone_prompts=list_clone_prompt_records(),
        presets=list_preset_records(),
        datasets=list_dataset_records(),
        audio_datasets=list_audio_dataset_records(),
        finetune_runs=list_finetune_run_records(),
        audio_tool_capabilities=audio_tool_capabilities(),
        audio_tool_jobs=list_audio_tool_jobs(),
        voice_changer_models=list_voice_changer_models(),
        asr_models=available_asr_models(),
    )


@app.get("/api/gallery", response_model=List[GalleryItem])
def gallery() -> List[GalleryItem]:
    """최근 생성 결과를 갤러리 전용 화면에서 사용할 수 있게 반환한다."""

    return list_gallery_items()


def list_voice_changer_models() -> List[VoiceChangerModelInfo]:
    items: List[VoiceChangerModelInfo] = []
    for item in list_available_voice_models(REPO_ROOT, voice_changer.applio_root):
        item["image_url"] = voice_image_url_for("rvc", item.get("id"))
        items.append(VoiceChangerModelInfo(**item))
    return items


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


@app.get("/api/asr/models")
def list_asr_models() -> List[Dict[str, str]]:
    """전사 UI에서 선택할 수 있는 Qwen3-ASR 모델 목록을 반환한다."""

    return available_asr_models()


@app.post("/api/transcriptions/reference-audio", response_model=AudioTranscriptionResponse)
def transcribe_reference_audio(payload: AudioTranscriptionRequest) -> AudioTranscriptionResponse:
    """저장된 참조 음성을 Qwen3-ASR로 전사한다.

    Args:
        payload: 전사할 음성 경로 요청.

    Returns:
        전사 텍스트와 메타데이터.
    """

    return transcribe_audio_or_raise(payload.audio_path, model_id=payload.model_id)


@app.get("/api/vibevoice/runtime", response_model=VibeVoiceRuntimeResponse)
def vibevoice_runtime() -> VibeVoiceRuntimeResponse:
    """VibeVoice vendor checkout/model availability."""

    return VibeVoiceRuntimeResponse(**vibevoice_engine.status())


def _path_mtime_iso(path: Path) -> str:
    """Return a stable ISO timestamp for file-system discovered assets."""

    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    except OSError:
        return utc_now()


def list_vibevoice_model_assets() -> List[VibeVoiceModelAsset]:
    """List VibeVoice models/adapters that can be selected instead of typed paths."""

    records: Dict[str, VibeVoiceModelAsset] = {}

    def add_asset(path: Path, *, name: str, kind: str, notes: str = "") -> None:
        if not path.exists():
            return
        relpath = storage.relpath(path)
        records[relpath] = VibeVoiceModelAsset(
            id=hashlib.sha1(relpath.encode("utf-8")).hexdigest()[:12],
            name=name,
            kind=kind,
            path=relpath,
            created_at=_path_mtime_iso(path),
            notes=notes,
        )

    stock_profiles = [
        ("tts_15b", "VibeVoice-1.5B", "base_model", "기본 TTS 모델"),
        ("tts_7b", "VibeVoice-7B", "base_model", "대형 TTS 모델"),
        ("realtime", "VibeVoice-Realtime-0.5B", "base_model", "Realtime TTS 모델"),
        ("asr", "VibeVoice-ASR", "asr_model", "ASR 모델"),
    ]
    for profile, label, kind, notes in stock_profiles:
        try:
            add_asset(vibevoice_engine.model_path(profile), name=label, kind=kind, notes=notes)
        except Exception:
            continue

    model_root = vibevoice_engine.model_root
    if model_root.exists():
        stock_names = {"VibeVoice-ASR", "VibeVoice-Realtime-0.5B", "VibeVoice-1.5B", "VibeVoice-7B"}
        for candidate in sorted(model_root.iterdir(), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True):
            if candidate.name in stock_names:
                continue
            if candidate.is_dir():
                add_asset(candidate, name=candidate.name, kind="merged_model", notes="병합 또는 변환된 VibeVoice 모델")
            elif candidate.suffix.lower() in {".safetensors", ".bin", ".pt", ".pth"}:
                add_asset(candidate, name=candidate.stem, kind="model_file", notes="VibeVoice 모델 파일")

    training_root = storage.audio_tools_dir / "vibevoice_training"
    if training_root.exists():
        for adapter_dir in sorted(training_root.glob("**/adapter"), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True):
            if adapter_dir.is_dir():
                run_name = adapter_dir.parent.name
                add_asset(adapter_dir, name=run_name, kind="lora_adapter", notes="VibeVoice 학습 결과 LoRA adapter")

    return sorted(records.values(), key=lambda item: item.created_at or "", reverse=True)


@app.get("/api/vibevoice/model-assets", response_model=List[VibeVoiceModelAsset])
def vibevoice_model_assets() -> List[VibeVoiceModelAsset]:
    """Return selectable VibeVoice model assets for the Web UI."""

    return list_vibevoice_model_assets()


@app.post("/api/vibevoice/asr", response_model=VibeVoiceASRResponse)
def transcribe_vibevoice_audio(payload: VibeVoiceASRRequest) -> VibeVoiceASRResponse:
    """Run Microsoft VibeVoice-ASR on a stored audio file."""

    release_resident_runtime_before_external_engine()
    try:
        absolute_path = resolve_audio_absolute_path(payload.audio_path) if payload.audio_path.strip() else None
        audio_dir: Optional[Path] = None
        if payload.audio_dir.strip():
            audio_dir = Path(payload.audio_dir).expanduser()
            if not audio_dir.is_absolute():
                audio_dir = REPO_ROOT / audio_dir
        result = vibevoice_engine.transcribe(
            audio_path=absolute_path,
            audio_dir=audio_dir,
            dataset=payload.dataset,
            split=payload.split,
            max_duration=payload.max_duration,
            language=payload.language,
            task=payload.task,
            context_info=payload.context_info,
            device=payload.device,
            precision=payload.precision,
            attn_implementation=payload.attn_implementation,
            batch_size=payload.batch_size,
            max_new_tokens=payload.max_new_tokens,
            temperature=payload.temperature,
            top_p=payload.top_p,
            num_beams=payload.num_beams,
            return_timestamps=payload.return_timestamps,
        )
    except HTTPException:
        raise
    except VibeVoiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"VibeVoice-ASR failed: {error}") from error

    return VibeVoiceASRResponse(
        audio_path=payload.audio_path,
        text=str(result.get("text") or ""),
        language=result.get("language"),
        segments=list(result.get("segments") or []),
        meta=dict(result.get("meta") or {}),
    )


@app.post("/api/vibevoice/tts", response_model=GenerationResponse)
def generate_vibevoice_tts(payload: VibeVoiceTTSRequest) -> GenerationResponse:
    """Generate speech through VibeVoice Realtime 0.5B or 1.5B vendor path."""

    release_resident_runtime_before_external_engine()
    extension = audio_tool_format_or_422(payload.output_format)
    output_path = generated_audio_path("vibevoice-tts", payload.output_name or payload.text, extension)
    speaker_audio_path: Optional[Path] = None
    if payload.speaker_audio_path:
        speaker_audio_path = resolve_audio_absolute_path(payload.speaker_audio_path)
    speaker_audio_paths = [resolve_audio_absolute_path(path) for path in payload.speaker_audio_paths if path.strip()]
    if speaker_audio_path and not speaker_audio_paths:
        speaker_audio_paths = [speaker_audio_path]

    try:
        meta = vibevoice_engine.generate_tts(
            text=payload.text,
            output_path=output_path,
            model_profile=payload.model_profile,
            speaker_name=payload.speaker_name,
            speaker_audio_path=speaker_audio_path,
            speaker_names=payload.speaker_names,
            speaker_audio_paths=speaker_audio_paths,
            checkpoint_path=payload.checkpoint_path,
            cfg_scale=payload.cfg_scale,
            ddpm_steps=payload.ddpm_steps,
            seed=payload.seed,
            device=payload.device,
            attn_implementation=payload.attn_implementation,
            inference_steps=payload.inference_steps,
            max_length_times=payload.max_length_times,
            disable_prefill=payload.disable_prefill,
            show_progress=payload.show_progress,
            max_new_tokens=payload.max_new_tokens,
            extra_args=payload.extra_args,
        )
    except HTTPException:
        raise
    except VibeVoiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"VibeVoice TTS failed: {error}") from error

    record = write_audio_tool_generation_record(
        mode="vibevoice_tts",
        text=payload.text,
        language="auto",
        audio_path=output_path,
        instruction=payload.checkpoint_path,
        meta={
            "tool_kind": "vibevoice_tts",
            "model_profile": payload.model_profile,
            "speaker_name": payload.speaker_name,
            "speaker_audio_path": payload.speaker_audio_path,
            "speaker_names": payload.speaker_names,
            "speaker_audio_paths": payload.speaker_audio_paths,
            "checkpoint_path": payload.checkpoint_path,
            "cfg_scale": payload.cfg_scale,
            "ddpm_steps": payload.ddpm_steps,
            "seed": payload.seed,
            "device": payload.device,
            "attn_implementation": payload.attn_implementation,
            "inference_steps": payload.inference_steps,
            "max_length_times": payload.max_length_times,
            "disable_prefill": payload.disable_prefill,
            "max_new_tokens": payload.max_new_tokens,
            **meta,
        },
    )
    save_audio_tool_job(
        kind="vibevoice_tts",
        input_summary=readable_label(payload.output_name or payload.text, "vibevoice"),
        message="VibeVoice TTS completed.",
        assets=[create_audio_tool_asset(output_path, "vibevoice speech")],
    )
    return GenerationResponse(record=record)


@app.post("/api/vibevoice/train", response_model=VibeVoiceTrainingResponse)
def train_vibevoice(payload: VibeVoiceTrainingRequest) -> VibeVoiceTrainingResponse:
    """Run VibeVoice fine-tuning paths.

    The default vendor is the community fork, which exposes TTS fine-tuning.
    ASR LoRA remains available only when the selected checkout includes the
    Microsoft `finetuning-asr/lora_finetune.py` script.
    """

    release_resident_runtime_before_external_engine()
    status_info = vibevoice_engine.status()
    if not Path(status_info["repo_root"]).exists():
        raise HTTPException(status_code=400, detail=f"VibeVoice vendor repo not found: {status_info['repo_root']}")

    data_input = payload.data_dir.strip()
    data_dir = Path(data_input).expanduser()
    if not data_dir.is_absolute():
        data_dir = REPO_ROOT / data_dir
    data_ref = str(data_dir) if data_dir.exists() else data_input
    if payload.training_mode == "asr_lora" and not data_dir.exists():
        raise HTTPException(status_code=404, detail=f"VibeVoice ASR training data directory not found: {payload.data_dir}")

    run_id = storage.new_id("vibevoice_train")
    created_at = utc_now()
    run_label = readable_label(payload.output_name, "vibevoice-train")
    run_dir = storage.dated_child_dir(storage.audio_tools_dir, "vibevoice_training", created_at=parse_created_at(created_at)) / f"{run_id}_{storage.slugify(run_label, default='vibevoice-train')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    output_dir = Path(payload.output_dir.strip()).expanduser() if payload.output_dir.strip() else run_dir / "adapter"
    if not output_dir.is_absolute():
        output_dir = REPO_ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "train.log"

    python_bin = vibevoice_engine.python_executable
    torchrun_bin = os.getenv("VIBEVOICE_TORCHRUN", "").strip()
    if not torchrun_bin:
        python_path = Path(python_bin)
        torchrun_candidate = python_path.parent / "torchrun"
        torchrun_bin = str(torchrun_candidate if torchrun_candidate.exists() else "torchrun")
    if payload.training_mode == "asr_lora":
        model_path = payload.model_path.strip() or vibevoice_engine.model_id("asr")
        script_path = Path(status_info["repo_root"]) / "finetuning-asr" / "lora_finetune.py"
        if not script_path.exists():
            raise HTTPException(status_code=400, detail=f"VibeVoice ASR LoRA script not found: {script_path}")
        command = [
            torchrun_bin,
            f"--nproc_per_node={payload.nproc_per_node}",
            str(script_path),
            "--model_path",
            model_path,
            "--data_dir",
            str(data_dir),
            "--output_dir",
            str(output_dir),
            "--num_train_epochs",
            str(payload.num_train_epochs),
            "--per_device_train_batch_size",
            str(payload.per_device_train_batch_size),
            "--gradient_accumulation_steps",
            str(payload.gradient_accumulation_steps),
            "--learning_rate",
            str(payload.learning_rate),
            "--warmup_ratio",
            str(payload.warmup_ratio),
            "--weight_decay",
            str(payload.weight_decay),
            "--max_grad_norm",
            str(payload.max_grad_norm),
            "--logging_steps",
            str(payload.logging_steps),
            "--save_steps",
            str(payload.save_steps),
            "--lora_r",
            str(payload.lora_r),
            "--lora_alpha",
            str(payload.lora_alpha),
            "--lora_dropout",
            str(payload.lora_dropout),
            "--report_to",
            payload.report_to,
        ]
        if payload.bf16:
            command.append("--bf16")
        if payload.gradient_checkpointing:
            command.append("--gradient_checkpointing")
        if not payload.use_customized_context:
            command.extend(["--use_customized_context", "False"])
        if payload.max_audio_length is not None:
            command.extend(["--max_audio_length", str(payload.max_audio_length)])
        command.extend(payload.extra_args)
    else:
        template = os.getenv("VIBEVOICE_TTS_FINETUNE_COMMAND_TEMPLATE", "").strip()
        model_path = payload.model_path.strip() or vibevoice_engine.model_id("tts_15b")
        if template:
            values = {
                "python": python_bin,
                "repo": status_info["repo_root"],
                "model": model_path,
                "data_dir": data_ref,
                "output_dir": output_dir,
                "epochs": payload.num_train_epochs,
                "batch_size": payload.per_device_train_batch_size,
                "grad_accum": payload.gradient_accumulation_steps,
                "learning_rate": payload.learning_rate,
                "lora_r": payload.lora_r,
                "lora_alpha": payload.lora_alpha,
                "lora_dropout": payload.lora_dropout,
            }
            command = vibevoice_engine._format_template(template, values)
        else:
            train_module = Path(status_info["repo_root"]) / "vibevoice" / "finetune" / "train_vibevoice.py"
            if not train_module.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Community VibeVoice TTS fine-tuning module not found: {train_module}",
                )
            command = [
                python_bin,
                "-m",
                "vibevoice.finetune.train_vibevoice",
                "--model_name_or_path",
                model_path,
                "--dataset_name",
                data_ref,
                "--train_split_name",
                payload.train_split_name,
                "--text_column_name",
                payload.text_column_name,
                "--audio_column_name",
                payload.audio_column_name,
                "--voice_prompts_column_name",
                payload.voice_prompts_column_name,
                "--output_dir",
                str(output_dir),
                "--per_device_train_batch_size",
                str(payload.per_device_train_batch_size),
                "--gradient_accumulation_steps",
                str(payload.gradient_accumulation_steps),
                "--learning_rate",
                str(payload.learning_rate),
                "--num_train_epochs",
                str(payload.num_train_epochs),
                "--logging_steps",
                str(payload.logging_steps),
                "--save_steps",
                str(payload.save_steps),
                "--report_to",
                payload.report_to,
                "--remove_unused_columns",
                "False",
                "--warmup_ratio",
                str(payload.warmup_ratio),
                "--max_grad_norm",
                str(payload.max_grad_norm),
                "--lora_target_modules",
                payload.lora_target_modules,
                "--lr_scheduler_type",
                "cosine",
                "--voice_prompt_drop_rate",
                "0.2",
                "--ddpm_batch_mul",
                str(payload.ddpm_batch_mul),
                "--diffusion_loss_weight",
                str(payload.diffusion_loss_weight),
                "--ce_loss_weight",
                str(payload.ce_loss_weight),
                "--do_train",
                "--gradient_clipping",
            ]
            if payload.dataset_config_name:
                command.extend(["--dataset_config_name", payload.dataset_config_name])
            if payload.eval_split_name:
                command.extend(["--eval_split_name", payload.eval_split_name])
            if payload.train_jsonl:
                command.extend(["--train_jsonl", payload.train_jsonl])
            if payload.validation_jsonl:
                command.extend(["--validation_jsonl", payload.validation_jsonl])
            if payload.eval_split_size:
                command.extend(["--eval_split_size", str(payload.eval_split_size)])
            if payload.ignore_verifications:
                command.append("--ignore_verifications")
            if payload.max_length is not None:
                command.extend(["--max_length", str(payload.max_length)])
            if payload.lora_wrap_diffusion_head:
                command.extend(["--lora_wrap_diffusion_head", "True"])
            command.extend(["--train_diffusion_head", "True" if payload.train_diffusion_head else "False"])
            if payload.train_connectors:
                command.extend(["--train_connectors", "True"])
            if payload.layers_to_freeze:
                command.extend(["--layers_to_freeze", payload.layers_to_freeze])
            if payload.debug_save:
                command.append("--debug_save")
            if payload.debug_ce_details:
                command.append("--debug_ce_details")
            if payload.bf16:
                command.extend(["--bf16", "True"])
            if payload.gradient_checkpointing:
                command.append("--gradient_checkpointing")
            if payload.weight_decay:
                command.extend(["--weight_decay", str(payload.weight_decay)])
            if payload.max_audio_length is not None:
                command.extend(["--max_audio_length", str(payload.max_audio_length)])
            command.extend(payload.extra_args)

    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {' '.join(command)}\n\n")
        process = subprocess.run(
            command,
            cwd=str(REPO_ROOT),
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )

    status = "completed" if process.returncode == 0 else "failed"
    message = "VibeVoice training completed." if status == "completed" else f"VibeVoice training failed. See {storage.relpath(log_path)}"
    adapter_path = storage.relpath(output_dir) if output_dir.exists() else None
    save_audio_tool_job(kind="vibevoice_training", input_summary=payload.output_name, message=message, assets=[])
    return VibeVoiceTrainingResponse(
        status=status,
        message=message,
        run_id=run_id,
        output_name=payload.output_name,
        run_dir=storage.relpath(run_dir),
        log_path=storage.relpath(log_path),
        adapter_path=adapter_path,
        command=command,
        meta={
            "training_mode": payload.training_mode,
            "data_dir": str(data_dir),
            "output_dir": str(output_dir),
            "returncode": process.returncode,
        },
    )


@app.post("/api/vibevoice/model-tools", response_model=VibeVoiceModelToolResponse)
def run_vibevoice_model_tool(payload: VibeVoiceModelToolRequest) -> VibeVoiceModelToolResponse:
    """Run VibeVoice model merge, verification, or NnScaler conversion utilities."""

    release_resident_runtime_before_external_engine()
    status_info = vibevoice_engine.status()
    repo_root = Path(status_info["repo_root"])
    if not repo_root.exists():
        raise HTTPException(status_code=400, detail=f"VibeVoice vendor source not found: {repo_root}")

    run_id = storage.new_id("vibevoice_tool")
    created_at = utc_now()
    run_dir = storage.dated_child_dir(storage.audio_tools_dir, "vibevoice_tools", created_at=parse_created_at(created_at)) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "tool.log"
    output_path = Path(payload.output_path).expanduser()
    if not output_path.is_absolute():
        output_path = REPO_ROOT / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if payload.tool in {"merge", "verify_merge"}:
        if not payload.base_model_path.strip():
            raise HTTPException(status_code=400, detail="base_model_path is required for VibeVoice merge tools.")
        script = repo_root / "vibevoice" / "scripts" / "merge_vibevoice_models.py"
        command = [
            vibevoice_engine.python_executable,
            str(script),
            "--base_model_path",
            payload.base_model_path,
            "--output_path",
            str(output_path),
            "--output_format",
            payload.output_format,
        ]
        if payload.tool == "verify_merge":
            command.append("--verify_only")
        else:
            if not payload.checkpoint_path.strip():
                raise HTTPException(status_code=400, detail="checkpoint_path is required for VibeVoice merge.")
            command.extend(["--checkpoint_path", payload.checkpoint_path])
    else:
        if not payload.nnscaler_checkpoint_path.strip():
            raise HTTPException(status_code=400, detail="nnscaler_checkpoint_path is required for conversion.")
        script = repo_root / "vibevoice" / "scripts" / "convert_nnscaler_checkpoint_to_transformers.py"
        command = [
            vibevoice_engine.python_executable,
            str(script),
            "--nnscaler_checkpoint_path",
            payload.nnscaler_checkpoint_path,
            "--pytorch_dump_folder_path",
            str(output_path),
        ]
        if payload.config_path.strip():
            command.extend(["--config_path", payload.config_path])

    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {' '.join(command)}\n\n")
        process = subprocess.run(command, cwd=str(REPO_ROOT), stdout=log, stderr=subprocess.STDOUT, text=True)

    status = "completed" if process.returncode == 0 else "failed"
    message = "VibeVoice model utility completed." if status == "completed" else f"VibeVoice model utility failed. See {storage.relpath(log_path)}"
    save_audio_tool_job(kind="vibevoice_model_tool", input_summary=payload.tool, message=message, assets=[])
    return VibeVoiceModelToolResponse(
        status=status,
        message=message,
        run_id=run_id,
        run_dir=storage.relpath(run_dir),
        log_path=storage.relpath(log_path),
        output_path=storage.relpath(output_path),
        command=command,
        meta={"returncode": process.returncode, "tool": payload.tool},
    )


@app.get("/api/history", response_model=List[GenerationRecord])
def history() -> List[GenerationRecord]:
    """저장된 생성 이력을 최신순으로 반환한다.

    Returns:
        생성 이력 모델 목록.
    """

    return list_generation_records()


@app.delete("/api/history/{record_id}", response_model=GenerationDeleteResponse)
def delete_history_record(record_id: str) -> GenerationDeleteResponse:
    """생성 갤러리 항목 하나를 삭제한다.

    Args:
        record_id: 삭제할 생성 이력 식별자.

    Returns:
        삭제된 항목 수.
    """

    return GenerationDeleteResponse(deleted_count=delete_generation_record_files(record_id))


@app.post("/api/history/delete-batch", response_model=GenerationDeleteResponse)
def delete_history_records(payload: GenerationDeleteBatchRequest) -> GenerationDeleteResponse:
    """생성 갤러리 여러 항목을 한 번에 삭제한다.

    Args:
        payload: 삭제할 생성 이력 식별자 목록.

    Returns:
        삭제된 항목 수.
    """

    deleted_count = 0
    for record_id in payload.ids:
        try:
            deleted_count += delete_generation_record_files(record_id)
        except HTTPException:
            continue
    return GenerationDeleteResponse(deleted_count=deleted_count)


@app.delete("/api/history", response_model=GenerationDeleteResponse)
def delete_all_history_records() -> GenerationDeleteResponse:
    """생성 갤러리 전체 항목을 한 번에 삭제한다.

    Returns:
        삭제된 항목 수.
    """

    deleted_count = 0
    for record in list_generation_records():
        try:
            deleted_count += delete_generation_record_files(record.id)
        except HTTPException:
            continue
    return GenerationDeleteResponse(deleted_count=deleted_count)


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


@app.post("/api/audio-tools/rvc-train", response_model=RvcTrainingResponse)
def train_rvc_voice_model(payload: RvcTrainingRequest) -> RvcTrainingResponse:
    """Applio/RVC 목소리 모델을 데이터 폴더에서 학습한다.

    이 엔드포인트는 Applio의 RVC 모델 만들기 단계다. 결과로 생성된
    `.pth`와 `.index`는 같은 화면의 변환 탭에서 바로 선택할 수 있다.
    """
    release_resident_runtime_before_external_engine()
    if not voice_changer.is_available():
        raise HTTPException(status_code=400, detail="Applio repository is not available for RVC training.")

    if payload.sample_rate not in {32000, 40000, 48000}:
        raise HTTPException(status_code=400, detail="RVC sample rate must be 32000, 40000, or 48000.")

    if not payload.audio_paths and not payload.dataset_path.strip():
        raise HTTPException(status_code=400, detail="RVC training needs a target voice folder or selected gallery audio.")
    dataset_path = (
        prepare_rvc_training_dataset_from_audio_paths(payload.model_name, payload.audio_paths)
        if payload.audio_paths
        else Path(resolve_repo_audio_path(payload.dataset_path))
    )

    try:
        meta = voice_changer.train_rvc_model(
            model_name=payload.model_name,
            dataset_path=str(dataset_path),
            sample_rate=payload.sample_rate,
            total_epoch=payload.total_epoch,
            batch_size=payload.batch_size,
            cpu_cores=payload.cpu_cores,
            gpu=payload.gpu,
            f0_method=payload.f0_method,
            embedder_model=payload.embedder_model,
            cut_preprocess=payload.cut_preprocess,
            noise_reduction=payload.noise_reduction,
            clean_strength=payload.clean_strength,
            chunk_len=payload.chunk_len,
            overlap_len=payload.overlap_len,
            index_algorithm=payload.index_algorithm,
            checkpointing=payload.checkpointing,
        )
    except VoiceChangerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RVC training failed: {exc}") from exc

    return RvcTrainingResponse(
        status="completed",
        message="RVC voice model trained. You can now use it in the conversion tab.",
        model_name=str(meta.get("model_name") or payload.model_name),
        model_path=meta.get("model_path"),
        index_path=meta.get("index_path"),
        meta=meta,
    )


@app.get("/api/audio-tools/jobs", response_model=List[AudioToolJob])
def audio_tool_jobs() -> List[AudioToolJob]:
    """최근 오디오 도구 작업 이력을 반환한다."""

    return list_audio_tool_jobs()


@app.post("/api/audio-tools/sound-effects", response_model=AudioToolResponse)
def generate_sound_effect(payload: SoundEffectRequest) -> AudioToolResponse:
    """텍스트 프롬프트에서 MMAudio 기반 효과음을 생성한다."""

    release_resident_runtime_before_external_engine()
    output_path = generated_audio_path("sound-effects", payload.prompt, "wav")
    try:
        output_path, engine_meta = mmaudio_engine.generate(
            prompt=payload.prompt,
            duration_sec=payload.duration_sec,
            intensity=payload.intensity,
            seed=payload.seed,
            output_path=output_path,
            model_profile=payload.model_profile,
            steps=payload.steps,
            cfg_scale=payload.cfg_scale,
            negative_prompt=payload.negative_prompt,
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
            "model_profile": payload.model_profile,
            "duration_sec": payload.duration_sec,
            "intensity": payload.intensity,
            "seed": payload.seed,
            "steps": payload.steps,
            "cfg_scale": payload.cfg_scale,
            "negative_prompt": payload.negative_prompt,
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


@app.post("/api/audio-tools/mmaudio-train", response_model=MMAudioTrainingResponse)
def train_mmaudio(payload: MMAudioTrainingRequest) -> MMAudioTrainingResponse:
    """MMAudio full/continued training을 실행한다. LoRA/adapter 학습은 upstream에 없다."""

    release_resident_runtime_before_external_engine()
    mmaudio_root = mmaudio_engine.mmaudio_root
    if mmaudio_root is None or not mmaudio_root.exists():
        raise HTTPException(status_code=400, detail="MMAudio repository is not available.")
    train_py = mmaudio_root / "train.py"
    if not train_py.exists():
        raise HTTPException(status_code=400, detail=f"MMAudio train.py not found: {train_py}")

    weights_path = ""
    if payload.weights_path.strip():
        weights_path = str(_resolve_training_path(payload.weights_path, "weights_path"))
    checkpoint_path = ""
    if payload.checkpoint_path.strip():
        checkpoint_path = str(_resolve_training_path(payload.checkpoint_path, "checkpoint_path"))

    run_id = storage.new_id("mmtrain")
    created_at = utc_now()
    label = readable_label(payload.output_name, "mmaudio-training")
    run_dir = storage.audio_tools_dir / "mmaudio_training" / run_id
    output_dir = run_dir / "output"
    log_path = run_dir / "train.log"
    run_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "torch.distributed.run",
        "--standalone",
        f"--nproc_per_node={payload.nproc_per_node}",
        str(train_py),
        f"exp_id={label}__{run_id}",
        f"model={payload.model}",
        f"hydra.run.dir={output_dir}",
        f"num_iterations={payload.num_iterations}",
        f"batch_size={payload.batch_size}",
        f"learning_rate={payload.learning_rate}",
        f"compile={str(payload.compile)}",
        f"debug={str(payload.debug)}",
        f"example_train={str(payload.data_mode == 'example')}",
        f"save_weights_interval={payload.save_weights_interval}",
        f"save_checkpoint_interval={payload.save_checkpoint_interval}",
        f"ema.checkpoint_every={payload.ema_checkpoint_interval}",
        f"val_interval={payload.val_interval}",
        f"eval_interval={payload.eval_interval}",
        f"skip_final_sample={str(not payload.run_final_sample)}",
    ]
    if weights_path:
        command.append(f"weights={weights_path}")
    if checkpoint_path:
        command.append(f"checkpoint={checkpoint_path}")

    env = os.environ.copy()
    env.setdefault("OMP_NUM_THREADS", "4")
    matplotlib_cache_dir = storage.data_dir / "runtime" / "matplotlib"
    matplotlib_cache_dir.mkdir(parents=True, exist_ok=True)
    env.setdefault("MPLCONFIGDIR", str(matplotlib_cache_dir))
    result = _run_training_command(command, cwd=mmaudio_root, log_path=log_path, section="train", env=env)
    status = "completed" if result.returncode == 0 else "failed"
    weights = sorted(output_dir.glob("*.pth")) if output_dir.exists() else []
    latest_weights = weights[-1] if weights else None
    message = "MMAudio training completed." if status == "completed" else f"MMAudio training failed. See {storage.relpath(log_path)}"
    meta = {
        "training_kind": "full_or_continued",
        "lora_supported": False,
        "model": payload.model,
        "data_mode": payload.data_mode,
        "output_dir": str(output_dir),
        "weights_path": weights_path,
        "checkpoint_path": checkpoint_path,
        "command": command,
        "returncode": result.returncode,
    }
    record = {
        "id": run_id,
        "kind": "mmaudio_training",
        "status": status,
        "input_summary": payload.output_name,
        "created_at": created_at,
        "message": message,
        "meta": meta,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.audio_tools_dir,
            category="mmaudio_training",
            label=label,
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return MMAudioTrainingResponse(
        status=status,
        message=message,
        run_id=run_id,
        output_name=payload.output_name,
        run_dir=storage.relpath(run_dir),
        log_path=storage.relpath(log_path),
        final_weights_path=storage.relpath(latest_weights) if latest_weights else None,
        command=command,
        meta=meta,
    )


def _ace_step_base_payload(payload: Any) -> Dict[str, Any]:
    """공통 ACE-Step 입력을 subprocess가 이해하는 dict로 직렬화한다."""

    data = payload.model_dump()
    seeds_raw = data.get("seeds") or ""
    payload_dict = {
        "caption": data.get("caption") or data.get("prompt") or "",
        "prompt": data.get("prompt") or data.get("caption") or "",
        "lyrics": data.get("lyrics") or "",
        "instrumental": data.get("instrumental", False),
        "duration": data.get("duration", -1.0),
        "audio_duration": data.get("duration", -1.0),
        "bpm": data.get("bpm"),
        "keyscale": data.get("keyscale", ""),
        "timesignature": data.get("timesignature", ""),
        "vocal_language": data.get("vocal_language", "unknown"),
        "inference_steps": data.get("inference_steps", 8),
        "guidance_scale": data.get("guidance_scale", 7.0),
        "seeds": seeds_raw,
        "manual_seeds": seeds_raw,
        "use_random_seed": data.get("use_random_seed", True),
        "batch_size": data.get("batch_size", 1),
        "audio_format": data.get("audio_format", "wav"),
        "config_path": data.get("config_path"),
        "lm_model_path": data.get("lm_model_path"),
        "lm_backend": data.get("lm_backend"),
        "device": data.get("device", "auto"),
        "cpu_offload": data.get("cpu_offload", False),
        "offload_dit_to_cpu": data.get("offload_dit_to_cpu", False),
        "compile_model": data.get("compile_model", False),
        "quantization": data.get("quantization"),
        "vae_checkpoint": data.get("vae_checkpoint"),
        "use_adg": data.get("use_adg", False),
        "cfg_interval_start": data.get("cfg_interval_start", 0.0),
        "cfg_interval_end": data.get("cfg_interval_end", 1.0),
        "shift": data.get("shift", 1.0),
        "infer_method": data.get("infer_method", "ode"),
        "sampler_mode": data.get("sampler_mode", "euler"),
        "thinking": data.get("thinking", True),
        "lm_temperature": data.get("lm_temperature", 0.85),
        "lm_cfg_scale": data.get("lm_cfg_scale", 2.0),
        "lm_top_k": data.get("lm_top_k", 0),
        "lm_top_p": data.get("lm_top_p", 0.9),
        "lm_negative_prompt": data.get("lm_negative_prompt", "NO USER INPUT"),
        "use_cot_metas": data.get("use_cot_metas", True),
        "use_cot_caption": data.get("use_cot_caption", True),
        "use_cot_lyrics": data.get("use_cot_lyrics", False),
        "use_cot_language": data.get("use_cot_language", True),
        "use_constrained_decoding": data.get("use_constrained_decoding", True),
        "enable_normalization": data.get("enable_normalization", True),
        "normalization_db": data.get("normalization_db", -1.0),
        "fade_in_duration": data.get("fade_in_duration", 0.0),
        "fade_out_duration": data.get("fade_out_duration", 0.0),
        "loras": [
            {
                "path": resolve_repo_audio_path(item["path"]) if item.get("path") else item.get("path"),
                "adapter_name": item.get("adapter_name"),
                "scale": item.get("scale"),
            }
            for item in data.get("loras", [])
        ],
        "output_name": data.get("output_name"),
    }
    return payload_dict


def _run_ace_step_audio_task(
    *,
    task: str,
    payload: Any,
    extra_payload: Dict[str, Any],
    label_fields: List[str],
    record_mode: str,
    record_text_fields: List[str],
) -> GenerationResponse:
    """ACE-Step subprocess 호출과 GenerationRecord 저장을 한 번에 묶는다."""

    if not ace_step_composer.is_available():
        raise HTTPException(status_code=400, detail=ace_step_composer.availability_notes())

    release_resident_runtime_before_external_engine()
    payload_dict = _ace_step_base_payload(payload)
    payload_dict.update(extra_payload)

    label_seed = ""
    for field in label_fields:
        value = getattr(payload, field, "") or payload_dict.get(field, "")
        if value:
            label_seed = str(value)
            break
    label = requested_output_name(payload) or label_seed or task
    output_path = generated_audio_path(f"ace-step-{task}", label, payload_dict.get("audio_format", "wav"))

    try:
        audio_path, meta = ace_step_composer.run(
            task=task,
            output_path=output_path,
            payload=payload_dict,
        )
    except AceStepError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ACE-Step {task} failed: {exc}") from exc

    text_value = ""
    for field in record_text_fields:
        candidate = getattr(payload, field, "") or payload_dict.get(field, "")
        if candidate:
            text_value = str(candidate)
            break

    record = build_generation_record(
        record_id=storage.new_id("music"),
        mode=record_mode,
        text=text_value,
        language="Music",
        audio_path=audio_path,
        instruction=payload_dict.get("caption") or payload_dict.get("prompt") or "",
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.get("/api/music/ace-step/runtime", response_model=AceStepRuntimeResponse)
def ace_step_runtime() -> AceStepRuntimeResponse:
    """ACE-Step 런타임 가용성, 모델 변형, LoRA 어댑터 목록을 반환한다."""

    from .ace_step import SUPPORTED_TASKS, TRACK_NAMES

    return AceStepRuntimeResponse(
        available=ace_step_composer.is_available(),
        notes=ace_step_composer.availability_notes(),
        ace_step_root=str(ace_step_composer.ace_step_root),
        python_executable=ace_step_composer.python_executable,
        checkpoint_path=str(ace_step_composer.checkpoint_path),
        lora_dir=str(ace_step_composer.lora_dir),
        model_variants=ace_step_composer.list_model_variants(),
        lm_models=ace_step_composer.list_lm_models(),
        lora_adapters=ace_step_composer.list_lora_adapters(),
        track_names=list(TRACK_NAMES),
        supported_tasks=sorted(SUPPORTED_TASKS),
    )


@app.post("/api/music/ace-step/generate", response_model=GenerationResponse)
def generate_ace_step_music(payload: MusicCompositionRequest) -> GenerationResponse:
    """ACE-Step으로 태그와 가사를 바탕으로 음악을 생성한다 (text2music)."""

    if not ace_step_composer.is_available():
        raise HTTPException(status_code=400, detail=ace_step_composer.availability_notes())
    release_resident_runtime_before_external_engine()

    duration_value = payload.duration if payload.duration is not None else 60.0
    if payload.audio_duration is not None:
        duration_value = payload.audio_duration

    inference_steps = payload.inference_steps
    if payload.infer_step is not None:
        inference_steps = payload.infer_step

    seeds_raw = (payload.seeds or payload.manual_seeds or "").strip()

    base_payload = _ace_step_base_payload(payload)
    base_payload.update(
        {
            "duration": duration_value,
            "audio_duration": duration_value,
            "inference_steps": inference_steps,
            "seeds": seeds_raw,
            "manual_seeds": seeds_raw,
            "compile_model": payload.compile_model or payload.torch_compile,
            "cpu_offload": payload.cpu_offload,
        }
    )
    label = requested_output_name(payload) or payload.prompt or payload.caption or "ace-step-track"
    output_path = generated_audio_path("ace-step-music", label, base_payload.get("audio_format", "wav"))
    try:
        audio_path, meta = ace_step_composer.run(
            task="text2music",
            output_path=output_path,
            payload=base_payload,
        )
    except AceStepError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ACE-Step generation failed: {exc}") from exc

    record = build_generation_record(
        record_id=storage.new_id("music"),
        mode="ace_step_music",
        text=payload.lyrics or payload.prompt or payload.caption,
        language="Music",
        audio_path=audio_path,
        instruction=payload.prompt or payload.caption,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/music/ace-step/cover", response_model=GenerationResponse)
def generate_ace_step_cover(payload: AceStepCoverRequest) -> GenerationResponse:
    """원본 오디오를 참조해 새 스타일의 커버 곡을 만든다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "audio_cover_strength": payload.audio_cover_strength,
        "cover_noise_strength": payload.cover_noise_strength,
    }
    return _run_ace_step_audio_task(
        task="cover",
        payload=payload,
        extra_payload=extra,
        label_fields=["prompt", "caption", "output_name"],
        record_mode="ace_step_cover",
        record_text_fields=["lyrics", "caption", "prompt"],
    )


@app.post("/api/music/ace-step/repaint", response_model=GenerationResponse)
def generate_ace_step_repaint(payload: AceStepRepaintRequest) -> GenerationResponse:
    """원본 오디오의 [start,end) 구간을 새로운 프롬프트로 다시 그린다."""

    if payload.repainting_end != -1.0 and payload.repainting_end <= payload.repainting_start:
        raise HTTPException(
            status_code=400,
            detail="repainting_end must be greater than repainting_start (or -1 for end of clip).",
        )

    src_audio = resolve_repo_audio_path(payload.src_audio)
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "repainting_start": payload.repainting_start,
        "repainting_end": payload.repainting_end,
        "repaint_mode": payload.repaint_mode,
        "repaint_strength": payload.repaint_strength,
        "repaint_latent_crossfade_frames": payload.repaint_latent_crossfade_frames,
        "repaint_wav_crossfade_sec": payload.repaint_wav_crossfade_sec,
        "chunk_mask_mode": payload.chunk_mask_mode,
    }
    return _run_ace_step_audio_task(
        task="repaint",
        payload=payload,
        extra_payload=extra,
        label_fields=["prompt", "caption", "output_name"],
        record_mode="ace_step_repaint",
        record_text_fields=["lyrics", "caption", "prompt"],
    )


@app.post("/api/music/ace-step/extend", response_model=GenerationResponse)
def generate_ace_step_extend(payload: AceStepExtendRequest) -> GenerationResponse:
    """기존 트랙 뒤를 ACE-Step의 complete task로 채운다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    tracks = payload.complete_tracks or "vocals,drums,bass,guitar"
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "complete_tracks": tracks,
    }
    return _run_ace_step_audio_task(
        task="extend",
        payload=payload,
        extra_payload=extra,
        label_fields=["prompt", "caption", "output_name"],
        record_mode="ace_step_extend",
        record_text_fields=["lyrics", "caption", "prompt"],
    )


@app.post("/api/music/ace-step/extract", response_model=GenerationResponse)
def generate_ace_step_extract(payload: AceStepExtractRequest) -> GenerationResponse:
    """원본 오디오에서 단일 트랙(stem)을 분리한다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "extract_track": payload.extract_track,
    }
    return _run_ace_step_audio_task(
        task="extract",
        payload=payload,
        extra_payload=extra,
        label_fields=["extract_track", "output_name"],
        record_mode="ace_step_extract",
        record_text_fields=["extract_track", "caption"],
    )


@app.post("/api/music/ace-step/lego", response_model=GenerationResponse)
def generate_ace_step_lego(payload: AceStepLegoRequest) -> GenerationResponse:
    """기존 트랙에 새 트랙 한 개를 더한다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "lego_track": payload.lego_track,
    }
    return _run_ace_step_audio_task(
        task="lego",
        payload=payload,
        extra_payload=extra,
        label_fields=["lego_track", "prompt", "caption"],
        record_mode="ace_step_lego",
        record_text_fields=["lyrics", "caption", "prompt"],
    )


@app.post("/api/music/ace-step/complete", response_model=GenerationResponse)
def generate_ace_step_complete(payload: AceStepCompleteRequest) -> GenerationResponse:
    """누락 트랙 여러 개를 한 번에 채운다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    extra: Dict[str, Any] = {
        "src_audio": src_audio,
        "complete_tracks": payload.complete_tracks,
    }
    return _run_ace_step_audio_task(
        task="complete",
        payload=payload,
        extra_payload=extra,
        label_fields=["complete_tracks", "prompt", "caption"],
        record_mode="ace_step_complete",
        record_text_fields=["lyrics", "caption", "prompt"],
    )


def _run_lm_only_task(task: str, payload: Any, request_payload: Dict[str, Any]) -> AceStepUnderstandResponse:
    if not ace_step_composer.is_available():
        raise HTTPException(status_code=400, detail=ace_step_composer.availability_notes())
    label = getattr(payload, "output_name", None) or task
    output_path = generated_audio_path(f"ace-step-{task}", label, "json")
    try:
        _, meta = ace_step_composer.run(
            task=task,
            output_path=output_path,
            payload=request_payload,
        )
    except AceStepError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ACE-Step {task} failed: {exc}") from exc

    result = (meta or {}).get("result") or {}
    return AceStepUnderstandResponse(
        success=bool(result.get("success", True)),
        task=task,
        caption=result.get("caption", "") or "",
        lyrics=result.get("lyrics", "") or "",
        bpm=result.get("bpm"),
        duration=result.get("duration"),
        keyscale=result.get("keyscale", "") or "",
        language=result.get("language", "") or "",
        timesignature=result.get("timesignature", "") or "",
        instrumental=result.get("instrumental"),
        status_message=result.get("status_message", "") or "",
        error=result.get("error"),
        raw_meta=meta or {},
    )


def _resolve_ace_training_path(value: str, field_name: str) -> Path:
    """ACE-Step training 입력 경로를 절대 경로로 해석하고 존재 여부를 확인한다."""

    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail=f"{field_name} is required.")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    candidate = candidate.resolve()
    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"{field_name} not found: {raw}")
    return candidate


def _ace_step_subprocess_env() -> Dict[str, str]:
    """ACE-Step subprocess가 프로젝트 캐시와 모델 경로를 공유하도록 환경을 만든다."""

    env = os.environ.copy()
    env.setdefault("ACESTEP_CHECKPOINTS_DIR", str(ace_step_composer.checkpoint_path))
    env.setdefault("ACESTEP_PROJECT_ROOT", str(ace_step_composer.ace_step_root))
    cache_root = REPO_ROOT / "data" / "cache" / "ace-step"
    env.setdefault("HF_HOME", str(cache_root / "huggingface"))
    env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
    env.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
    Path(env["HF_HOME"]).mkdir(parents=True, exist_ok=True)
    Path(env["TRANSFORMERS_CACHE"]).mkdir(parents=True, exist_ok=True)
    Path(env["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
    return env


def _append_bool_arg(command: List[str], enabled: bool, name: str) -> None:
    command.append(f"--{name}" if enabled else f"--no-{name}")


def _run_ace_step_training_command(command: List[str], log_path: Path, section: str) -> subprocess.CompletedProcess[str]:
    """ACE-Step training CLI를 실행하고 stdout/stderr를 로그에 누적한다."""

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n\n===== {section} =====\n")
        handle.write(" ".join(command) + "\n\n")
    completed = subprocess.run(
        command,
        cwd=str(ace_step_composer.ace_step_root),
        capture_output=True,
        text=True,
        check=False,
        env=_ace_step_subprocess_env(),
    )
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(completed.stdout or "")
        if completed.stderr:
            handle.write("\n[stderr]\n")
            handle.write(completed.stderr)
    return completed


def _resolve_training_path(value: str, field_name: str) -> Path:
    """학습 입력 경로를 프로젝트 상대/절대 경로 모두에서 해석한다."""

    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail=f"{field_name} is required.")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    candidate = candidate.resolve()
    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"{field_name} not found: {raw}")
    return candidate


def _python_from_repo(repo_root: Path) -> str:
    """vendored repo의 venv python을 우선 사용하고 없으면 현재 인터프리터를 쓴다."""

    for candidate in [
        repo_root / ".venv" / "bin" / "python",
        repo_root / "venv" / "bin" / "python",
    ]:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def _run_training_command(
    command: List[str],
    *,
    cwd: Path,
    log_path: Path,
    section: str,
    env: Optional[Dict[str, str]] = None,
) -> subprocess.CompletedProcess[str]:
    """긴 학습 명령을 실행하고 재현 가능한 로그를 남긴다."""

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n\n===== {section} =====\n")
        handle.write(" ".join(command) + "\n\n")
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=False,
        env=env or os.environ.copy(),
    )
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(completed.stdout or "")
        if completed.stderr:
            handle.write("\n[stderr]\n")
            handle.write(completed.stderr)
    return completed


def _ace_step_train_command(
    payload: AceStepTrainingRequest,
    *,
    train_py: Path,
    checkpoint_dir: Path,
    tensor_dir: Path,
    output_dir: Path,
) -> List[str]:
    command = [
        ace_step_composer.python_executable,
        str(train_py),
        "--plain",
        "--yes",
        payload.trainer_mode,
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--model-variant",
        payload.model_variant,
        "--dataset-dir",
        str(tensor_dir),
        "--output-dir",
        str(output_dir),
        "--adapter-type",
        payload.adapter_type,
        "--device",
        payload.device,
        "--precision",
        payload.precision,
        "--lr",
        str(payload.learning_rate),
        "--batch-size",
        str(payload.batch_size),
        "--gradient-accumulation",
        str(payload.gradient_accumulation),
        "--epochs",
        str(payload.epochs),
        "--save-every",
        str(payload.save_every),
        "--seed",
        str(payload.seed),
        "--num-workers",
        str(payload.num_workers),
    ]
    if payload.base_model:
        command.extend(["--base-model", payload.base_model])
    _append_bool_arg(command, payload.gradient_checkpointing, "gradient-checkpointing")

    if payload.adapter_type == "lokr":
        command.extend(
            [
                "--lokr-linear-dim",
                str(payload.lokr_linear_dim),
                "--lokr-linear-alpha",
                str(payload.lokr_linear_alpha),
                "--lokr-factor",
                str(payload.lokr_factor),
            ]
        )
        if payload.lokr_decompose_both:
            command.append("--lokr-decompose-both")
        if payload.lokr_use_tucker:
            command.append("--lokr-use-tucker")
        if payload.lokr_use_scalar:
            command.append("--lokr-use-scalar")
        if payload.lokr_weight_decompose:
            command.append("--lokr-weight-decompose")
    else:
        command.extend(
            [
                "--rank",
                str(payload.rank),
                "--alpha",
                str(payload.alpha),
                "--dropout",
                str(payload.dropout),
            ]
        )
    return command


@app.post("/api/music/ace-step/train-adapter", response_model=AceStepTrainingResponse)
def ace_step_train_adapter(payload: AceStepTrainingRequest) -> AceStepTrainingResponse:
    """ACE-Step upstream CLI로 LoRA/LoKr adapter를 학습한다."""

    release_resident_runtime_before_external_engine()
    if not ace_step_composer.ace_step_root.exists():
        raise HTTPException(status_code=400, detail=ace_step_composer.availability_notes())

    train_py = ace_step_composer.ace_step_root / "train.py"
    if not train_py.exists():
        raise HTTPException(status_code=400, detail=f"ACE-Step training CLI not found: {train_py}")

    checkpoint_dir = Path(payload.checkpoint_dir).expanduser().resolve() if payload.checkpoint_dir else ace_step_composer.checkpoint_path
    if not checkpoint_dir.exists():
        raise HTTPException(status_code=404, detail=f"ACE-Step checkpoint dir not found: {checkpoint_dir}")

    run_id = storage.new_id("ace_train")
    created_at = utc_now()
    run_label = readable_label(payload.output_name, f"{payload.adapter_type}-adapter")
    run_dir = storage.audio_tools_dir / "ace_step_training" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "train.log"
    output_dir = ace_step_composer.lora_dir / f"{run_label}__{run_id}"
    output_dir.mkdir(parents=True, exist_ok=True)

    preprocess_command: List[str] = []
    if payload.source_type == "tensors":
        tensor_dir = _resolve_ace_training_path(payload.tensor_dir, "tensor_dir")
    else:
        tensor_dir = run_dir / "tensors"
        preprocess_command = [
            ace_step_composer.python_executable,
            str(train_py),
            "--plain",
            "--yes",
            payload.trainer_mode,
            "--preprocess",
            "--checkpoint-dir",
            str(checkpoint_dir),
            "--model-variant",
            payload.model_variant,
            "--dataset-dir",
            str(tensor_dir),
            "--output-dir",
            str(output_dir),
            "--tensor-output",
            str(tensor_dir),
            "--max-duration",
            str(payload.max_duration),
            "--device",
            payload.device,
            "--precision",
            payload.precision,
        ]
        if payload.source_type == "audio_dir":
            preprocess_command.extend(["--audio-dir", str(_resolve_ace_training_path(payload.audio_dir, "audio_dir"))])
        else:
            preprocess_command.extend(["--dataset-json", str(_resolve_ace_training_path(payload.dataset_json, "dataset_json"))])

        preprocess_result = _run_ace_step_training_command(preprocess_command, log_path, "preprocess")
        if preprocess_result.returncode != 0:
            record = {
                "id": run_id,
                "kind": "ace_step_adapter_training",
                "status": "failed",
                "input_summary": payload.output_name,
                "created_at": created_at,
                "artifacts": [],
                "message": "ACE-Step preprocessing failed.",
                "meta": {"log_path": storage.relpath(log_path), "preprocess_command": preprocess_command},
            }
            storage.write_json(
                storage.named_record_path(
                    root=storage.audio_tools_dir,
                    category="ace_step_adapter_training",
                    label=run_label,
                    record_id=run_id,
                    created_at=parse_created_at(created_at),
                ),
                record,
            )
            raise HTTPException(status_code=400, detail=f"ACE-Step preprocessing failed. See {storage.relpath(log_path)}")

    train_command = _ace_step_train_command(
        payload,
        train_py=train_py,
        checkpoint_dir=checkpoint_dir,
        tensor_dir=tensor_dir,
        output_dir=output_dir,
    )
    train_result = _run_ace_step_training_command(train_command, log_path, "train")
    status = "completed" if train_result.returncode == 0 else "failed"
    final_dir = output_dir / "final"
    final_adapter = final_dir if final_dir.exists() else output_dir
    final_adapter_path = storage.relpath(final_adapter) if status == "completed" and final_adapter.exists() else None
    message = (
        f"ACE-Step {payload.adapter_type.upper()} adapter training completed."
        if status == "completed"
        else f"ACE-Step {payload.adapter_type.upper()} adapter training failed. See {storage.relpath(log_path)}"
    )
    record = {
        "id": run_id,
        "kind": "ace_step_adapter_training",
        "status": status,
        "input_summary": payload.output_name,
        "created_at": created_at,
        "artifacts": [],
        "message": message,
        "meta": {
            "adapter_type": payload.adapter_type,
            "trainer_mode": payload.trainer_mode,
            "tensor_dir": str(tensor_dir),
            "output_dir": str(output_dir),
            "final_adapter_path": final_adapter_path,
            "log_path": storage.relpath(log_path),
            "preprocess_command": preprocess_command,
            "command": train_command,
            "returncode": train_result.returncode,
        },
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.audio_tools_dir,
            category="ace_step_adapter_training",
            label=run_label,
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return AceStepTrainingResponse(
        status=status,
        message=message,
        run_id=run_id,
        adapter_type=payload.adapter_type,
        trainer_mode=payload.trainer_mode,
        tensor_dir=str(tensor_dir),
        output_dir=str(output_dir),
        final_adapter_path=final_adapter_path,
        log_path=storage.relpath(log_path),
        command=train_command,
        preprocess_command=preprocess_command,
        meta=record["meta"],
    )


@app.post("/api/music/ace-step/understand", response_model=AceStepUnderstandResponse)
def ace_step_understand(payload: AceStepUnderstandRequest) -> AceStepUnderstandResponse:
    """오디오에서 BPM/캡션/가사/키 등을 LM으로 추정한다."""

    src_audio = resolve_repo_audio_path(payload.src_audio)
    request_payload = {
        "src_audio": src_audio,
        "audio_codes": payload.audio_codes,
        "config_path": payload.config_path,
        "lm_model_path": payload.lm_model_path,
        "lm_backend": payload.lm_backend,
        "device": payload.device,
        "cpu_offload": payload.cpu_offload,
        "lm_temperature": payload.lm_temperature,
        "lm_top_k": payload.lm_top_k,
        "lm_top_p": payload.lm_top_p,
        "repetition_penalty": payload.repetition_penalty,
        "use_constrained_decoding": payload.use_constrained_decoding,
    }
    return _run_lm_only_task("understand", payload, request_payload)


@app.post("/api/music/ace-step/create-sample", response_model=AceStepUnderstandResponse)
def ace_step_create_sample(payload: AceStepCreateSampleRequest) -> AceStepUnderstandResponse:
    """짧은 자연어 한 줄을 받아 caption/lyrics/메타데이터를 만들어 준다."""

    request_payload = payload.model_dump()
    return _run_lm_only_task("create_sample", payload, request_payload)


@app.post("/api/music/ace-step/format-sample", response_model=AceStepUnderstandResponse)
def ace_step_format_sample(payload: AceStepFormatSampleRequest) -> AceStepUnderstandResponse:
    """사용자가 적은 caption/lyrics를 공식 포맷으로 정리한다."""

    request_payload = payload.model_dump()
    return _run_lm_only_task("format_sample", payload, request_payload)


@app.post("/api/audio-tools/voice-changer", response_model=AudioToolResponse)
def change_voice(payload: VoiceChangerRequest) -> AudioToolResponse:
    """Applio/RVC로 기존 음성의 음색을 직접 바꾼다.

    Args:
        payload: 원본 오디오와 RVC 변환 설정.

    Returns:
        변환된 오디오 결과.
    """
    release_resident_runtime_before_external_engine()
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


@app.post("/api/audio-tools/voice-changer/batch", response_model=AudioToolResponse)
def change_voice_batch(payload: VoiceChangerBatchRequest) -> AudioToolResponse:
    """Applio/RVC로 여러 오디오를 같은 목소리 모델로 일괄 변환한다."""

    release_resident_runtime_before_external_engine()
    if not voice_changer.is_available():
        raise HTTPException(status_code=400, detail="Applio repository is not available for batch voice conversion.")
    if not payload.audio_paths:
        raise HTTPException(status_code=400, detail="At least one source audio is required for batch conversion.")

    assets: List[Any] = []
    first_record: Optional[GenerationRecord] = None
    converted_paths: List[str] = []
    for index, source_audio in enumerate(payload.audio_paths, start=1):
        output_path = generated_audio_path("voice-changer", f"batch voice conversion {index}", "wav")
        try:
            audio_path, meta = voice_changer.transform(
                input_audio_path=source_audio,
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
            raise HTTPException(status_code=500, detail=f"Batch voice changer failed: {exc}") from exc

        record = write_audio_tool_generation_record(
            mode="voice_changer",
            text=f"batch voice conversion {index}",
            language="N/A",
            audio_path=audio_path,
            meta={
                "tool_kind": "voice_changer_batch",
                "source_audio_path": source_audio,
                "batch_index": index,
                **meta,
            },
        )
        if first_record is None:
            first_record = record
        asset = create_audio_tool_asset(audio_path, f"voice changed speech {index}")
        assets.append(asset)
        converted_paths.append(asset.path)

    save_audio_tool_job(
        kind="voice_changer_batch",
        input_summary=f"{len(payload.audio_paths)} files",
        message="Batch voice conversion completed.",
        assets=assets,
    )
    return AudioToolResponse(
        kind="voice_changer_batch",
        status="completed",
        message=f"{len(converted_paths)} files converted.",
        assets=assets,
        record=first_record,
    )


@app.post("/api/audio-tools/voice-models/blend", response_model=RvcTrainingResponse)
def blend_voice_models(payload: VoiceModelBlendRequest) -> RvcTrainingResponse:
    """두 Applio/RVC 모델을 섞어 새 voice model을 만든다."""

    release_resident_runtime_before_external_engine()
    if not voice_changer.is_available():
        raise HTTPException(status_code=400, detail="Applio repository is not available for model blending.")

    try:
        model_path, meta = voice_changer.blend_models(
            model_name=payload.model_name,
            model_path_a=payload.model_path_a,
            model_path_b=payload.model_path_b,
            ratio=payload.ratio,
        )
    except VoiceChangerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice model blending failed: {exc}") from exc

    return RvcTrainingResponse(
        status="completed",
        message="Applio voice model blended. You can now use it in conversion.",
        model_name=str(meta.get("model_name") or payload.model_name),
        model_path=str(model_path),
        index_path=None,
        meta=meta,
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


@app.post("/api/audio-tools/edit", response_model=AudioToolResponse)
def edit_audio(payload: AudioEditRequest) -> AudioToolResponse:
    """오디오를 실제로 잘라내고 기본 마스터링 값을 적용해 새 파일로 저장한다."""

    source_path = resolve_audio_absolute_path(payload.audio_path)
    waveform, sample_rate = sf.read(str(source_path), dtype="float32", always_2d=False)
    if waveform.size == 0:
        raise HTTPException(status_code=422, detail="Audio file is empty.")

    total_samples = waveform.shape[0]
    start_sample = min(total_samples, int(round(payload.start_sec * sample_rate)))
    end_sec = payload.end_sec if payload.end_sec is not None else total_samples / sample_rate
    end_sample = min(total_samples, max(start_sample + 1, int(round(end_sec * sample_rate))))
    edited = np.asarray(waveform[start_sample:end_sample], dtype=np.float32).copy()
    if edited.size == 0:
        raise HTTPException(status_code=422, detail="Selected audio range is empty.")

    if payload.gain_db:
        edited *= float(10 ** (payload.gain_db / 20.0))

    def apply_linear_fade(audio: np.ndarray, seconds: float, *, fade_in: bool) -> np.ndarray:
        fade_samples = min(audio.shape[0], int(round(seconds * sample_rate)))
        if fade_samples <= 1:
            return audio
        ramp = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
        if not fade_in:
            ramp = ramp[::-1]
        if audio.ndim > 1:
            ramp = ramp[:, None]
        if fade_in:
            audio[:fade_samples] *= ramp
        else:
            audio[-fade_samples:] *= ramp
        return audio

    edited = apply_linear_fade(edited, payload.fade_in_sec, fade_in=True)
    edited = apply_linear_fade(edited, payload.fade_out_sec, fade_in=False)

    if payload.reverse:
        edited = edited[::-1].copy()

    if payload.normalize:
        peak = float(np.max(np.abs(edited)))
        if peak > 0:
            edited *= 0.98 / peak

    if payload.sample_rate != sample_rate:
        edited = librosa.resample(edited, orig_sr=sample_rate, target_sr=payload.sample_rate, axis=0)
        sample_rate = payload.sample_rate

    edited = np.clip(edited, -1.0, 1.0)
    extension = audio_tool_format_or_422(payload.output_format)
    label = payload.output_name or f"edit {asset_stem(payload.audio_path) or 'audio'}"
    output_path = generated_audio_path("audio-editor", label, extension)
    sf.write(str(output_path), edited, sample_rate)
    duration_sec = edited.shape[0] / sample_rate
    record = write_audio_tool_generation_record(
        mode="audio_editor",
        text=label,
        language="N/A",
        audio_path=output_path,
        meta={
            "tool_kind": "audio_editor",
            "source_audio_path": payload.audio_path,
            "start_sec": payload.start_sec,
            "end_sec": payload.end_sec,
            "duration_sec": duration_sec,
            "gain_db": payload.gain_db,
            "fade_in_sec": payload.fade_in_sec,
            "fade_out_sec": payload.fade_out_sec,
            "normalize": payload.normalize,
            "reverse": payload.reverse,
            "sample_rate": sample_rate,
            "output_format": extension,
        },
    )
    asset = create_audio_tool_asset(output_path, "edited audio")
    save_audio_tool_job(
        kind="audio_editor",
        input_summary=f"edit {basename_for_asset(payload.audio_path)}",
        message="Audio edit completed.",
        assets=[asset],
    )
    return AudioToolResponse(
        kind="audio_editor",
        status="completed",
        message="Audio edit completed.",
        assets=[asset],
        record=record,
    )


def _band_limit_audio(waveform: np.ndarray, sample_rate: int, *, highpass_hz: float, lowpass_hz: float) -> np.ndarray:
    """간단한 FFT 마스크로 저역 럼블과 고역 히스를 완만하게 줄인다."""

    if waveform.size == 0:
        return waveform
    nyquist = sample_rate / 2.0
    lowpass = min(max(lowpass_hz, 0.0), nyquist)
    highpass = min(max(highpass_hz, 0.0), nyquist)
    if highpass <= 0 and lowpass >= nyquist:
        return waveform

    def filter_channel(channel: np.ndarray) -> np.ndarray:
        spectrum = np.fft.rfft(channel.astype(np.float32))
        freqs = np.fft.rfftfreq(channel.shape[0], d=1.0 / sample_rate)
        mask = np.ones_like(freqs, dtype=np.float32)
        if highpass > 0:
            mask[freqs < highpass] = 0.08
        if lowpass < nyquist:
            mask[freqs > lowpass] = 0.12
        return np.fft.irfft(spectrum * mask, n=channel.shape[0]).astype(np.float32)

    if waveform.ndim == 1:
        return filter_channel(waveform)
    return np.stack([filter_channel(waveform[:, channel]) for channel in range(waveform.shape[1])], axis=1)


def _spectral_gate_channel(
    channel: np.ndarray,
    sample_rate: int,
    *,
    strength: float,
    noise_profile_sec: float,
    spectral_floor: float,
    voice_presence: float,
) -> np.ndarray:
    """첫 구간을 노이즈 프로파일로 삼아 부드러운 spectral gate를 적용한다."""

    if channel.size < 16:
        return channel.astype(np.float32)
    n_fft = 2048 if channel.size >= 2048 else 512
    hop_length = max(128, n_fft // 4)
    stft = librosa.stft(channel.astype(np.float32), n_fft=n_fft, hop_length=hop_length)
    magnitude = np.abs(stft)
    phase = np.exp(1j * np.angle(stft))
    frame_count = max(1, min(magnitude.shape[1], int(round(noise_profile_sec * sample_rate / hop_length))))
    noise_profile = np.percentile(magnitude[:, :frame_count], 70, axis=1, keepdims=True)
    threshold = noise_profile * (1.2 + strength * 3.2)
    soft_mask = magnitude / (magnitude + threshold + 1e-8)
    soft_mask = np.clip(soft_mask ** (1.0 + strength * 1.6), spectral_floor, 1.0)
    # 음성 대역의 에너지가 남아 있는 프레임은 과도하게 눌리지 않게 보존한다.
    voiced_floor = spectral_floor + (voice_presence * 0.22)
    soft_mask = np.maximum(soft_mask, voiced_floor)
    cleaned = librosa.istft(magnitude * soft_mask * phase, hop_length=hop_length, length=channel.shape[0])
    return cleaned.astype(np.float32)


@app.post("/api/audio-tools/denoise", response_model=AudioToolResponse)
def denoise_audio(payload: AudioDenoiseRequest) -> AudioToolResponse:
    """음성 파일의 배경 노이즈와 불필요한 대역을 줄여 새 파일로 저장한다."""

    source_path = resolve_audio_absolute_path(payload.audio_path)
    waveform, sample_rate = sf.read(str(source_path), dtype="float32", always_2d=False)
    if waveform.size == 0:
        raise HTTPException(status_code=422, detail="Audio file is empty.")

    audio = np.asarray(waveform, dtype=np.float32)
    audio = audio - np.mean(audio, axis=0, keepdims=True)
    audio = _band_limit_audio(audio, sample_rate, highpass_hz=payload.highpass_hz, lowpass_hz=payload.lowpass_hz)

    if audio.ndim == 1:
        cleaned = _spectral_gate_channel(
            audio,
            sample_rate,
            strength=payload.strength,
            noise_profile_sec=payload.noise_profile_sec,
            spectral_floor=payload.spectral_floor,
            voice_presence=payload.voice_presence,
        )
    else:
        cleaned = np.stack(
            [
                _spectral_gate_channel(
                    audio[:, channel],
                    sample_rate,
                    strength=payload.strength,
                    noise_profile_sec=payload.noise_profile_sec,
                    spectral_floor=payload.spectral_floor,
                    voice_presence=payload.voice_presence,
                )
                for channel in range(audio.shape[1])
            ],
            axis=1,
        )

    if payload.sample_rate != sample_rate:
        cleaned = librosa.resample(cleaned, orig_sr=sample_rate, target_sr=payload.sample_rate, axis=0)
        sample_rate = payload.sample_rate

    if payload.normalize:
        peak = float(np.max(np.abs(cleaned)))
        if peak > 0:
            cleaned = cleaned * (0.98 / peak)

    cleaned = np.clip(cleaned, -1.0, 1.0)
    extension = audio_tool_format_or_422(payload.output_format)
    label = payload.output_name or f"clean {asset_stem(payload.audio_path) or 'audio'}"
    output_path = generated_audio_path("audio-denoise", label, extension)
    sf.write(str(output_path), cleaned, sample_rate)
    duration_sec = cleaned.shape[0] / sample_rate
    record = write_audio_tool_generation_record(
        mode="audio_denoise",
        text=label,
        language="N/A",
        audio_path=output_path,
        meta={
            "tool_kind": "audio_denoise",
            "source_audio_path": payload.audio_path,
            "strength": payload.strength,
            "noise_profile_sec": payload.noise_profile_sec,
            "spectral_floor": payload.spectral_floor,
            "highpass_hz": payload.highpass_hz,
            "lowpass_hz": payload.lowpass_hz,
            "voice_presence": payload.voice_presence,
            "normalize": payload.normalize,
            "sample_rate": sample_rate,
            "duration_sec": duration_sec,
            "output_format": extension,
        },
    )
    asset = create_audio_tool_asset(output_path, "cleaned voice")
    save_audio_tool_job(
        kind="audio_denoise",
        input_summary=f"clean {basename_for_asset(payload.audio_path)}",
        message="Voice cleanup completed.",
        assets=[asset],
    )
    return AudioToolResponse(
        kind="audio_denoise",
        status="completed",
        message="Voice cleanup completed.",
        assets=[asset],
        record=record,
    )


@app.post("/api/audio-tools/separate", response_model=AudioToolResponse)
def separate_audio(payload: AudioSeparationRequest) -> AudioToolResponse:
    """AI stem separator 모델로 보컬/반주 또는 다중 stem을 분리한다."""

    release_resident_runtime_before_external_engine()
    source_path = resolve_audio_absolute_path(payload.audio_path)
    base_label = asset_stem(payload.audio_path) or "source"
    extension = audio_tool_format_or_422(payload.output_format)
    created_at = utc_now_datetime()
    run_output_dir = storage.dated_child_dir(storage.generated_dir, "audio-separation", created_at=created_at) / (
        f"{created_at.strftime('%H%M%S')}_{storage.slugify(f'{base_label} stems', default='stems')}"
    )
    run_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        stem_paths, meta = stem_separator_engine.separate(
            input_audio_path=source_path,
            output_dir=run_output_dir,
            model_profile=payload.model_profile,
            output_format=extension,
        )
    except StemSeparatorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stem separation failed: {exc}") from exc

    assets = [create_audio_tool_asset(path, readable_stem_label(path)) for path in stem_paths]
    primary_path = stem_paths[0]
    record = write_audio_tool_generation_record(
        mode="audio_separation",
        text=f"{base_label} stems",
        language="N/A",
        audio_path=primary_path,
        meta={
            "tool_kind": "audio_separation",
            "source_audio_path": payload.audio_path,
            "stems": [storage.relpath(path) for path in stem_paths],
            **meta,
        },
    )
    save_audio_tool_job(
        kind="audio_separation",
        input_summary=f"{base_label} split",
        message="Stem separation completed.",
        assets=assets,
    )
    return AudioToolResponse(
        kind="audio_separation",
        status="completed",
        message="Stem separation completed.",
        assets=assets,
        record=record,
    )


@app.post("/api/audio-tools/translate", response_model=AudioToolResponse)
def translate_audio(payload: AudioTranslateRequest) -> AudioToolResponse:
    """Qwen3-ASR 전사와 선택적 재합성을 묶은 번역 보조 흐름."""

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


def s2pro_text_with_instruction(text: str, instruction: str) -> str:
    """Apply S2-Pro inline instructions while keeping speech text explicit."""

    clean_text = text.strip()
    clean_instruction = instruction.strip()
    if not clean_instruction:
        return clean_text
    if clean_instruction.startswith("[") or "[" in clean_instruction:
        return f"{clean_instruction} {clean_text}".strip()
    return f"[{clean_instruction}] {clean_text}".strip()


def normalize_s2pro_runtime_source(value: str = "auto") -> str:
    """Normalize UI runtime selection to `auto`, `local`, or `api`."""

    normalized = (value or "auto").strip().lower()
    if normalized in {"api", "fish_audio_api", "fish-audio-api", "hosted"}:
        return "api"
    if normalized in {"local", "local_fish_speech_server", "fish-speech", "self-hosted"}:
        return "local"
    return "auto"


def fish_reference_id_for(name: str, voice_id: str) -> str:
    """Return a Fish Speech compatible reference id.

    Fish Speech accepts only ASCII letters, digits, spaces, hyphens, and
    underscores for persistent reference ids. User-facing S2-Pro names can be
    Korean or Japanese, so keep those in app metadata and use a stable ASCII id
    for the Fish runtime.
    """

    raw = storage.slugify(name, default="", max_length=48)
    ascii_slug = re.sub(r"[^A-Za-z0-9 _-]+", "-", raw)
    ascii_slug = re.sub(r"[-\s]+", "-", ascii_slug).strip("-_ ")
    suffix = voice_id.replace("_", "-")
    if ascii_slug:
        return f"{ascii_slug}-{suffix}"[:96].strip("-_ ")
    return suffix


def list_s2pro_voice_records() -> List[S2ProVoiceRecord]:
    """Return saved S2-Pro voices with local Fish reference presence attached."""

    fish_reference_ids = set(list_s2_pro_references(runtime_source="local"))
    records: List[S2ProVoiceRecord] = []
    for record in storage.list_json_records(storage.s2pro_voices_dir):
        runtime_source = normalize_s2pro_runtime_source(str(record.get("runtime_source") or "local"))
        record["runtime_source"] = runtime_source if runtime_source != "auto" else "local"
        record["fish_reference_present"] = (
            bool(record.get("reference_id")) if record["runtime_source"] == "api" else str(record.get("reference_id", "")) in fish_reference_ids
        )
        record["image_url"] = voice_image_url_for("s2pro", record.get("id"))
        try:
            records.append(S2ProVoiceRecord(**record))
        except Exception:
            continue
    return records


def get_s2pro_voice_record(voice_id: str) -> S2ProVoiceRecord:
    """Load one saved S2-Pro voice by internal id or Fish reference id."""

    for record in list_s2pro_voice_records():
        if record.id == voice_id or record.reference_id == voice_id:
            return record
    raise HTTPException(status_code=404, detail="S2-Pro voice not found.")


@app.get("/api/s2-pro/capabilities", response_model=S2ProRuntimeResponse)
def s2_pro_capabilities() -> S2ProRuntimeResponse:
    """Return S2-Pro engine readiness and supported feature groups."""

    status = fish_speech_status(check_server=True)
    return S2ProRuntimeResponse(
        **status,
        features=[
            "tagged_tts",
            "voice_clone",
            "multi_speaker",
            "multilingual_tts",
            "managed_local_engine",
            "hosted_fish_audio_api",
        ],
    )


@app.post("/api/s2-pro/train", response_model=S2ProTrainingResponse)
def train_s2_pro(payload: S2ProTrainingRequest) -> S2ProTrainingResponse:
    """Fish Speech S2-Pro text2semantic LoRA/full fine-tuning을 실행한다."""

    release_qwen_runtime_before_external_engine()
    repo_root = fish_speech_repo_root().resolve()
    if not repo_root.exists():
        raise HTTPException(status_code=400, detail=f"Fish Speech source is missing: {repo_root}")
    train_py = repo_root / "fish_speech" / "train.py"
    extract_vq_py = repo_root / "tools" / "vqgan" / "extract_vq.py"
    build_dataset_py = repo_root / "tools" / "llama" / "build_dataset.py"
    merge_lora_py = repo_root / "tools" / "llama" / "merge_lora.py"
    if not train_py.exists():
        raise HTTPException(status_code=400, detail=f"Fish Speech train.py not found: {train_py}")

    pretrained_ckpt = _resolve_training_path(payload.pretrained_ckpt_path, "pretrained_ckpt_path") if payload.pretrained_ckpt_path else fish_speech_model_dir().resolve()
    if not pretrained_ckpt.exists():
        raise HTTPException(status_code=404, detail=f"S2-Pro checkpoint dir not found: {pretrained_ckpt}")

    run_id = storage.new_id("s2train")
    created_at = utc_now()
    label = readable_label(payload.output_name, "s2pro-training")
    project_name = f"{label}__{run_id}"
    run_dir = storage.audio_tools_dir / "s2_pro_training" / run_id
    result_dir = run_dir / "results"
    proto_dir = run_dir / "protos"
    log_path = run_dir / "train.log"
    run_dir.mkdir(parents=True, exist_ok=True)
    preprocess_commands: List[List[str]] = []

    python_exe = _python_from_repo(repo_root)
    env = os.environ.copy()
    env.setdefault("HF_HOME", str(REPO_ROOT / "data" / "cache" / "fish-speech" / "huggingface"))
    env.setdefault("TRANSFORMERS_CACHE", str(REPO_ROOT / "data" / "cache" / "fish-speech" / "huggingface" / "transformers"))
    Path(env["HF_HOME"]).mkdir(parents=True, exist_ok=True)
    Path(env["TRANSFORMERS_CACHE"]).mkdir(parents=True, exist_ok=True)

    if payload.source_type == "lab_audio_dir":
        source_dir = _resolve_training_path(payload.lab_audio_dir, "lab_audio_dir")
        codec_checkpoint = _resolve_training_path(payload.codec_checkpoint_path, "codec_checkpoint_path") if payload.codec_checkpoint_path else pretrained_ckpt / "codec.pth"
        if not codec_checkpoint.exists():
            raise HTTPException(status_code=404, detail=f"codec checkpoint not found: {codec_checkpoint}")
        if not extract_vq_py.exists() or not build_dataset_py.exists():
            raise HTTPException(status_code=400, detail="Fish Speech preprocessing tools are missing.")
        extract_command = [
            python_exe,
            str(extract_vq_py),
            str(source_dir),
            "--num-workers",
            str(payload.vq_num_workers),
            "--batch-size",
            str(payload.vq_batch_size),
            "--config-name",
            "modded_dac_vq",
            "--checkpoint-path",
            str(codec_checkpoint),
        ]
        preprocess_commands.append(extract_command)
        extract_result = _run_training_command(extract_command, cwd=repo_root, log_path=log_path, section="extract_vq", env=env)
        if extract_result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"S2-Pro semantic token extraction failed. See {storage.relpath(log_path)}")
        build_command = [
            python_exe,
            str(build_dataset_py),
            "--input",
            str(source_dir),
            "--output",
            str(proto_dir),
            "--text-extension",
            ".lab",
            "--num-workers",
            str(payload.num_workers),
        ]
        preprocess_commands.append(build_command)
        build_result = _run_training_command(build_command, cwd=repo_root, log_path=log_path, section="build_dataset", env=env)
        if build_result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"S2-Pro protobuf dataset build failed. See {storage.relpath(log_path)}")
    else:
        proto_dir = _resolve_training_path(payload.proto_dir, "proto_dir")

    train_command = [
        python_exe,
        str(train_py),
        "--config-name",
        "text2semantic_finetune",
        f"project={project_name}",
        f"paths.run_dir={result_dir}",
        f"pretrained_ckpt_path={pretrained_ckpt}",
        f"tokenizer.model_path={pretrained_ckpt}",
        f"train_dataset.proto_files=[{proto_dir}]",
        f"val_dataset.proto_files=[{proto_dir}]",
        f"data.batch_size={payload.batch_size}",
        f"data.num_workers={payload.num_workers}",
        f"trainer.max_steps={payload.max_steps}",
        f"trainer.val_check_interval={payload.val_check_interval}",
        f"trainer.accumulate_grad_batches={payload.accumulate_grad_batches}",
        f"trainer.precision={payload.precision}",
        f"trainer.accelerator={payload.accelerator}",
        f"trainer.devices={payload.devices}",
        f"trainer.strategy.process_group_backend={payload.strategy_backend}",
        f"model.optimizer.lr={payload.learning_rate}",
    ]
    if payload.training_type == "lora":
        train_command.append(f"+lora@model.model.lora_config={payload.lora_config}")

    train_result = _run_training_command(train_command, cwd=repo_root, log_path=log_path, section="train", env=env)
    status = "completed" if train_result.returncode == 0 else "failed"
    checkpoints_dir = result_dir / "checkpoints"
    checkpoint_candidates = sorted(checkpoints_dir.glob("*.ckpt")) if checkpoints_dir.exists() else []
    final_checkpoint = checkpoint_candidates[-1] if checkpoint_candidates else None
    merged_model_path: Optional[str] = None
    merge_command: List[str] = []

    if status == "completed" and payload.training_type == "lora" and payload.merge_lora and final_checkpoint:
        if not merge_lora_py.exists():
            raise HTTPException(status_code=400, detail=f"Fish Speech merge_lora.py not found: {merge_lora_py}")
        merge_output = REPO_ROOT / "data" / "models" / "fish-speech" / f"{label}__{run_id}"
        merge_command = [
            python_exe,
            str(merge_lora_py),
            "--lora-config",
            payload.lora_config,
            "--base-weight",
            str(pretrained_ckpt),
            "--lora-weight",
            str(final_checkpoint),
            "--output",
            str(merge_output),
        ]
        merge_result = _run_training_command(merge_command, cwd=repo_root, log_path=log_path, section="merge_lora", env=env)
        if merge_result.returncode == 0 and merge_output.exists():
            merged_model_path = storage.relpath(merge_output)
        else:
            status = "failed"

    message = "S2-Pro training completed." if status == "completed" else f"S2-Pro training failed. See {storage.relpath(log_path)}"
    meta = {
        "training_type": payload.training_type,
        "source_type": payload.source_type,
        "proto_dir": str(proto_dir),
        "run_dir": str(run_dir),
        "result_dir": str(result_dir),
        "final_checkpoint_path": storage.relpath(final_checkpoint) if final_checkpoint else None,
        "merged_model_path": merged_model_path,
        "command": train_command,
        "preprocess_commands": preprocess_commands,
        "merge_command": merge_command,
        "returncode": train_result.returncode,
    }
    record = {
        "id": run_id,
        "kind": "s2_pro_training",
        "status": status,
        "input_summary": payload.output_name,
        "created_at": created_at,
        "message": message,
        "meta": meta,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.audio_tools_dir,
            category="s2_pro_training",
            label=label,
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return S2ProTrainingResponse(
        status=status,
        message=message,
        run_id=run_id,
        output_name=payload.output_name,
        training_type=payload.training_type,
        run_dir=storage.relpath(run_dir),
        result_dir=storage.relpath(result_dir),
        log_path=storage.relpath(log_path),
        final_checkpoint_path=storage.relpath(final_checkpoint) if final_checkpoint else None,
        merged_model_path=merged_model_path,
        command=train_command,
        preprocess_commands=preprocess_commands,
        merge_command=merge_command,
        meta=meta,
    )


@app.get("/api/s2-pro/voices", response_model=List[S2ProVoiceRecord])
def s2_pro_voices() -> List[S2ProVoiceRecord]:
    """List S2-Pro voices saved for repeat generation."""

    return list_s2pro_voice_records()


@app.post("/api/s2-pro/voices", response_model=S2ProVoiceRecord)
def create_s2_pro_voice(payload: S2ProVoiceCreateRequest) -> S2ProVoiceRecord:
    """Register a reusable S2-Pro voice and save it as an app asset."""

    release_qwen_runtime_before_external_engine()
    reference_audio_path = resolve_audio_absolute_path(payload.reference_audio_path)
    reference_audio_rel = storage.relpath(reference_audio_path)
    runtime_source = normalize_s2pro_runtime_source(payload.runtime_source)
    created_at = utc_now()
    voice_id = storage.new_id("s2voice")
    created_moment = parse_created_at(created_at)
    reference_id = fish_reference_id_for(payload.name, voice_id)

    # Avoid colliding with an existing local Fish reference id while keeping the
    # user-facing model name stable in the app record. Hosted Fish Audio returns
    # its own immutable model id, so the requested reference id is only a title.
    existing_references = set(list_s2_pro_references(runtime_source="local")) if runtime_source != "api" else set()
    unique_reference_id = reference_id
    suffix = 2
    while unique_reference_id in existing_references:
        unique_reference_id = f"{reference_id}-{suffix}"
        suffix += 1

    try:
        registration = register_s2_pro_reference(
            reference_id=unique_reference_id,
            audio_path=reference_audio_path,
            reference_text=payload.reference_text,
            runtime_source=runtime_source,
        )
    except FishSpeechError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if runtime_source == "api":
        unique_reference_id = str(registration.get("reference_id") or unique_reference_id)

    qwen_clone_prompt_id: Optional[str] = None
    qwen_clone_prompt_path: Optional[str] = None
    if payload.create_qwen_prompt:
        qwen_prompt = create_clone_prompt_record(
            source_type="s2-pro-voice",
            model_id=payload.qwen_model_id or "base-1.7b",
            reference_audio_path=reference_audio_rel,
            reference_text=payload.reference_text,
            x_vector_only_mode=False,
            meta={"s2_pro_voice_id": voice_id, "s2_pro_reference_id": unique_reference_id, "s2_pro_runtime_source": runtime_source},
        )
        qwen_clone_prompt_id = qwen_prompt.id
        qwen_clone_prompt_path = qwen_prompt.prompt_path

    record = {
        "id": voice_id,
        "name": payload.name.strip(),
        "reference_id": unique_reference_id,
        "reference_audio_path": reference_audio_rel,
        "reference_audio_url": audio_url_for(reference_audio_rel),
        "reference_text": payload.reference_text.strip(),
        "language": payload.language,
        "created_at": created_at,
        "notes": payload.notes,
        "runtime_source": runtime_source if runtime_source != "auto" else "local",
        "qwen_clone_prompt_id": qwen_clone_prompt_id,
        "qwen_clone_prompt_path": qwen_clone_prompt_path,
        "fish_reference_present": True,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.s2pro_voices_dir,
            category="voices",
            label=payload.name,
            record_id=voice_id,
            created_at=created_moment,
        ),
        record,
    )
    return S2ProVoiceRecord(**record)


@app.post("/api/s2-pro/generate", response_model=GenerationResponse)
def generate_s2_pro(payload: S2ProGenerateRequest) -> GenerationResponse:
    """Generate audio through a local or hosted S2-Pro runtime and save it."""

    release_qwen_runtime_before_external_engine()
    output_format = audio_tool_format_or_422(payload.output_format)
    runtime_source = normalize_s2pro_runtime_source(payload.runtime_source)
    reference_audio_path: Optional[Path] = None
    reference_audio_rel = ""
    if payload.reference_audio_path:
        reference_audio_path = resolve_audio_absolute_path(payload.reference_audio_path)
        reference_audio_rel = storage.relpath(reference_audio_path)

    reference_id = payload.reference_id
    selected_voice_runtime_source: Optional[str] = None
    selected_voice_audio_path: Optional[Path] = None
    selected_voice_audio_rel = ""
    selected_voice_ref_text = ""
    if reference_id:
        try:
            voice_record = get_s2pro_voice_record(reference_id)
            reference_id = voice_record.reference_id
            selected_voice_runtime_source = normalize_s2pro_runtime_source(voice_record.runtime_source)
            selected_voice_audio_rel = voice_record.reference_audio_path
            selected_voice_audio_path = resolve_audio_absolute_path(voice_record.reference_audio_path)
            selected_voice_ref_text = voice_record.reference_text
        except HTTPException:
            # Fish Speech also accepts raw reference ids; keep that path for
            # users who already registered voices in the local Fish runtime.
            reference_id = payload.reference_id
    if runtime_source == "auto" and selected_voice_runtime_source:
        runtime_source = selected_voice_runtime_source

    resolved_reference_ids: List[str] = []
    fallback_voice_audio_path = selected_voice_audio_path
    fallback_voice_audio_rel = selected_voice_audio_rel
    fallback_voice_ref_text = selected_voice_ref_text
    for item in payload.reference_ids:
        if not item:
            continue
        try:
            voice_record = get_s2pro_voice_record(item)
            resolved_reference_ids.append(voice_record.reference_id)
            if runtime_source == "auto":
                runtime_source = normalize_s2pro_runtime_source(voice_record.runtime_source)
            if fallback_voice_audio_path is None:
                fallback_voice_audio_rel = voice_record.reference_audio_path
                fallback_voice_audio_path = resolve_audio_absolute_path(voice_record.reference_audio_path)
                fallback_voice_ref_text = voice_record.reference_text
        except HTTPException:
            resolved_reference_ids.append(item)

    final_text = s2pro_text_with_instruction(payload.text, payload.instruction)
    output_path = generated_audio_path("s2-pro", requested_output_name(payload) or final_text, output_format)
    try:
        meta = generate_s2_pro_audio(
            text=final_text,
            output_path=output_path,
            reference_audio_path=reference_audio_path,
            reference_text=payload.reference_text or "",
            reference_id=reference_id,
            reference_ids=resolved_reference_ids,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_new_tokens=payload.max_new_tokens,
            chunk_length=payload.chunk_length,
            output_format=output_format,
            sample_rate=payload.sample_rate,
            speed=payload.speed,
            volume=payload.volume,
            normalize=payload.normalize,
            latency=payload.latency,
            repetition_penalty=payload.repetition_penalty,
            min_chunk_length=payload.min_chunk_length,
            condition_on_previous_chunks=payload.condition_on_previous_chunks,
            early_stop_threshold=payload.early_stop_threshold,
            runtime_source=runtime_source,
        )
    except FishSpeechError as exc:
        if fallback_voice_audio_path is None or reference_audio_path is not None:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        try:
            meta = generate_s2_pro_audio(
                text=final_text,
                output_path=output_path,
                reference_audio_path=fallback_voice_audio_path,
                reference_text=fallback_voice_ref_text,
                reference_id=None,
                reference_ids=[],
                temperature=payload.temperature,
                top_p=payload.top_p,
                max_new_tokens=payload.max_new_tokens,
                chunk_length=payload.chunk_length,
                output_format=output_format,
                sample_rate=payload.sample_rate,
                speed=payload.speed,
                volume=payload.volume,
                normalize=payload.normalize,
                latency=payload.latency,
                repetition_penalty=payload.repetition_penalty,
                min_chunk_length=payload.min_chunk_length,
                condition_on_previous_chunks=payload.condition_on_previous_chunks,
                early_stop_threshold=payload.early_stop_threshold,
                runtime_source=runtime_source,
            )
            meta["reference_id_fallback_error"] = str(exc)
            reference_audio_rel = fallback_voice_audio_rel
        except FishSpeechError as retry_exc:
            raise HTTPException(status_code=503, detail=str(retry_exc)) from retry_exc

    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode=f"s2_pro_{payload.mode}",
        text=payload.text,
        language=payload.language,
        audio_path=output_path,
        instruction=payload.instruction,
        source_ref_audio_path=reference_audio_rel,
        source_ref_text=payload.reference_text or "",
        meta={
            **meta,
            "display_name": requested_output_name(payload) or None,
            "final_text": final_text,
            "s2_pro_mode": payload.mode,
            "s2_pro_reference_id": reference_id,
            "s2_pro_runtime_source": runtime_source,
            "max_new_tokens": payload.max_new_tokens,
        },
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


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
            output_name=requested_output_name(payload),
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
        meta={**meta, "display_name": requested_output_name(payload) or None},
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
            output_name=requested_output_name(payload),
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
        meta={**meta, "display_name": requested_output_name(payload) or None},
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
        # 참조 텍스트가 비어 있으면 서버가 Qwen3-ASR 전사를 보완한다.
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
            speaker_anchor=payload.speaker_anchor,
            output_name=requested_output_name(payload),
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
        meta={**meta, "display_name": requested_output_name(payload) or None},
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
                output_name=payload.output_name,
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
                output_name=payload.output_name,
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
                output_name=payload.output_name,
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

    preset_id = (payload.preset_id or "").strip()
    base_model_id = payload.base_model_id
    ref_audio_path = (payload.ref_audio_path or "").strip()
    ref_text = (payload.ref_text or "").strip()
    voice_clone_prompt_path = (payload.voice_clone_prompt_path or "").strip()

    if preset_id:
        preset = get_preset_record(preset_id)
        # 프리셋 기반 하이브리드 생성은 브라우저 상태값보다 저장된
        # 프리셋 레코드를 기준으로 삼아 백엔드 단독 실행과 일치시킨다.
        base_model_id = str(preset["base_model"])
        ref_audio_path = str(preset["reference_audio_path"])
        ref_text = str(preset["reference_text"])
        voice_clone_prompt_path = str(preset["clone_prompt_path"])

    if ref_audio_path and not ref_text and not payload.x_vector_only_mode:
        ref_text = resolve_reference_text(ref_audio_path, ref_text)

    if not voice_clone_prompt_path and not (ref_audio_path and ref_text):
        raise HTTPException(status_code=400, detail="Preset or clone prompt/reference inputs are required.")

    audio_path, _, meta = run_generation_or_http(
        lambda: engine.generate_hybrid_clone_instruct(
            text=payload.text,
            language=payload.language,
            instruct=payload.instruct,
            base_model_id=base_model_id,
            custom_model_id=payload.custom_model_id,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text,
            voice_clone_prompt_path=voice_clone_prompt_path,
            x_vector_only_mode=payload.x_vector_only_mode,
            speaker_anchor=payload.speaker_anchor,
            output_name=requested_output_name(payload),
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
        preset_id=preset_id,
        source_ref_audio_path=ref_audio_path,
        source_ref_text=ref_text,
        meta={**meta, "display_name": requested_output_name(payload) or None},
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/voicebox/fusion", response_model=FineTuneRun)
def create_voicebox_fusion(payload: VoiceBoxFusionRequest) -> FineTuneRun:
    """CustomVoice checkpoint와 Base speaker encoder를 합쳐 VoiceBox checkpoint를 만든다."""

    run_id = storage.new_id("voicebox")
    run_name = storage.slugify(payload.output_name, default=run_id)
    run_dir = storage.finetune_runs_dir / run_name
    output_checkpoint = run_dir / "final"
    log_path = run_dir / "fusion.log"
    run_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        resolve_qwen_extension_script("fusion/make_voicebox_checkpoint.py"),
        "--input-checkpoint",
        resolve_model_path_for_cli(payload.input_checkpoint_path),
        "--speaker-encoder-source",
        resolve_model_path_for_cli(payload.speaker_encoder_source_path),
        "--output-checkpoint",
        str(output_checkpoint),
    ]
    result = run_upstream_command(command)
    log_path.write_text((result.stdout or "") + "\n" + (result.stderr or ""), encoding="utf-8")
    status = "completed" if result.returncode == 0 else "failed"
    if status != "completed":
        raise HTTPException(status_code=500, detail=f"VoiceBox fusion failed. See {storage.relpath(log_path)}")

    created_at = utc_now()
    record = {
        "id": run_id,
        "dataset_id": "fusion",
        "training_mode": "voicebox",
        "init_model_path": payload.input_checkpoint_path,
        "speaker_encoder_model_path": payload.speaker_encoder_source_path,
        "output_model_path": storage.relpath(run_dir),
        "batch_size": 0,
        "lr": 0.0,
        "num_epochs": 0,
        "speaker_name": "",
        "status": status,
        "created_at": created_at,
        "finished_at": utc_now(),
        "log_path": storage.relpath(log_path),
        "command": command,
        "final_checkpoint_path": storage.relpath(output_checkpoint),
        "selectable_model_path": storage.relpath(output_checkpoint),
        "is_selectable": True,
        "stage_label": "완료",
        "summary_label": payload.output_name,
        "model_family": "voicebox",
        "speaker_encoder_included": True,
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.finetune_runs_dir,
            category="voicebox",
            label=payload.output_name,
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    return FineTuneRun(**record)


@app.post("/api/voicebox/speaker-morph", response_model=FineTuneRun)
def create_voicebox_speaker_morph(payload: VoiceBoxSpeakerMorphRequest) -> FineTuneRun:
    """언어별 anchor speaker를 복사해 새 영구 VoiceBox 화자 row를 만든다."""

    ref_audio_path = (payload.ref_audio_path or "").strip()
    voice_clone_prompt_path = (payload.voice_clone_prompt_path or "").strip()
    preset_id = (payload.preset_id or "").strip()
    clone_prompt_id = (payload.clone_prompt_id or "").strip()

    if preset_id:
        preset = get_preset_record(preset_id)
        ref_audio_path = str(preset.get("reference_audio_path") or ref_audio_path)
        voice_clone_prompt_path = str(preset.get("clone_prompt_path") or voice_clone_prompt_path)
    if clone_prompt_id:
        clone_prompt = get_clone_prompt_record(clone_prompt_id)
        ref_audio_path = str(clone_prompt.get("reference_audio_path") or ref_audio_path)
        voice_clone_prompt_path = str(clone_prompt.get("prompt_path") or voice_clone_prompt_path)

    if not ref_audio_path and not voice_clone_prompt_path:
        raise HTTPException(status_code=400, detail="ref_audio_path or voice_clone_prompt_path is required.")

    run_id = storage.new_id("morph")
    created_at = utc_now()
    run_label = readable_label(payload.output_name or payload.target_speaker, "voicebox-morph")
    run_dir = storage.finetune_runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    model_cli_path = resolve_model_path_for_cli(payload.model_id)
    update_existing = bool(payload.update_existing)
    output_model_path = Path(model_cli_path) if update_existing else run_dir / "final"
    selectable_model_path = payload.model_id if update_existing else storage.relpath(output_model_path)
    log_path = run_dir / "speaker_morph.log"

    command = [
        qwen_training_python(),
        resolve_qwen_extension_script("voicebox_morph/create_morphed_speaker.py"),
        "--model-path",
        model_cli_path,
        "--target-speaker",
        payload.target_speaker,
        "--language",
        payload.language,
        "--anchor-speaker",
        payload.anchor_speaker,
        "--timbre-strength",
        str(payload.timbre_strength),
    ]
    if update_existing:
        command.append("--update-in-place")
    else:
        command.extend(["--output-model-path", str(output_model_path)])
    if payload.preserve_norm:
        command.append("--preserve-norm")
    else:
        command.append("--no-preserve-norm")
    if voice_clone_prompt_path:
        prompt_path = Path(voice_clone_prompt_path)
        command.extend(["--voice-clone-prompt-path", str(prompt_path if prompt_path.is_absolute() else REPO_ROOT / prompt_path)])
    if ref_audio_path:
        command.extend(["--ref-audio", str(resolve_audio_absolute_path(ref_audio_path))])

    result = run_upstream_command(command)
    log_path.write_text((result.stdout or "") + "\n" + (result.stderr or ""), encoding="utf-8")
    status = "completed" if result.returncode == 0 else "failed"
    morph_meta_path = output_model_path / "voicebox_morph.json"
    morph_meta = storage.read_json(morph_meta_path) if morph_meta_path.exists() else {}
    record = {
        "id": run_id,
        "dataset_id": "speaker_morph",
        "training_mode": "voicebox_speaker_morph",
        "init_model_path": payload.model_id,
        "speaker_encoder_model_path": None,
        "output_model_path": storage.relpath(run_dir),
        "batch_size": 0,
        "lr": 0.0,
        "num_epochs": 0,
        "speaker_name": payload.target_speaker,
        "status": status,
        "created_at": created_at,
        "finished_at": utc_now(),
        "log_path": storage.relpath(log_path),
        "command": command,
        "final_checkpoint_path": selectable_model_path if status == "completed" else None,
        "selectable_model_path": selectable_model_path if status == "completed" else None,
        "is_selectable": status == "completed",
        "stage_label": ("기존 모델에 화자 추가 완료" if update_existing else "화자 변형 완료") if status == "completed" else "화자 변형 실패",
        "summary_label": "VoiceBox speaker morph",
        "output_name": run_label,
        "display_name": run_label,
        "model_family": "voicebox",
        "speaker_encoder_included": True,
        "morph": {
            "update_existing": update_existing,
            "language": payload.language,
            "requested_anchor_speaker": payload.anchor_speaker,
            "anchor_speaker": payload.anchor_speaker,
            "target_speaker": payload.target_speaker,
            "preset_id": preset_id or None,
            "clone_prompt_id": clone_prompt_id or None,
            "ref_audio_path": ref_audio_path,
            "voice_clone_prompt_path": voice_clone_prompt_path,
            "timbre_strength": payload.timbre_strength,
            "preserve_norm": payload.preserve_norm,
            **morph_meta,
        },
    }
    storage.write_json(
        storage.named_record_path(
            root=storage.finetune_runs_dir,
            category="voicebox_speaker_morph",
            label=f"{run_label} {payload.target_speaker}",
            record_id=run_id,
            created_at=parse_created_at(created_at),
        ),
        record,
    )
    if status != "completed":
        raise HTTPException(
            status_code=500,
            detail=f"VoiceBox speaker morph failed.\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}",
        )
    return FineTuneRun(**record)


def generate_voicebox_clone_common(payload: VoiceBoxCloneRequest, *, mode: str, fallback_strategy: str) -> GenerationResponse:
    """VoiceBox 단일 모델로 clone 계열 추론을 실행하고 생성 이력으로 등록한다."""

    ref_text = resolve_reference_text(payload.ref_audio_path, payload.ref_text)
    strategy = (payload.strategy or fallback_strategy).strip() or fallback_strategy
    record_id = storage.new_id("gen")
    output_dir = storage.generated_dir / "voicebox" / record_id
    command = [
        sys.executable,
        resolve_qwen_extension_script("inference/voicebox/clone_low_level.py"),
        "--model-path",
        resolve_model_path_for_cli(payload.model_id),
        "--ref-audio",
        str(resolve_audio_absolute_path(payload.ref_audio_path)),
        "--ref-text",
        ref_text,
        "--voice-clone-prompt-path",
        str(REPO_ROOT / payload.voice_clone_prompt_path) if payload.voice_clone_prompt_path else "",
        "--text",
        payload.text,
        "--language",
        payload.language,
        "--instruct",
        payload.instruct,
        "--speaker",
        payload.speaker or "auto",
        "--output-dir",
        str(output_dir),
        "--generation-options",
        json.dumps(generation_options_from_payload(payload), ensure_ascii=False),
        "--strategies",
        strategy,
    ]
    result = run_upstream_command(command)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"VoiceBox inference failed.\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}",
        )

    summary_path = output_dir / "summary.json"
    if not summary_path.exists():
        raise HTTPException(status_code=500, detail="VoiceBox inference did not write summary.json.")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary["instruct"] = payload.instruct
    summary["strategy"] = strategy
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    resolved_speaker = str(summary.get("speaker") or payload.speaker or "auto")
    result_item = next((item for item in summary.get("results", []) if item.get("name") == strategy and item.get("ok")), None)
    if not result_item or not result_item.get("output_path"):
        raise HTTPException(status_code=500, detail=f"VoiceBox strategy did not produce audio: {strategy}")

    source_audio = Path(result_item["output_path"])
    final_audio = generated_audio_path(mode, requested_output_name(payload) or payload.text, "wav")
    shutil.copyfile(source_audio, final_audio)
    record = build_generation_record(
        record_id=record_id,
        mode=mode,
        text=payload.text,
        language=payload.language,
        audio_path=final_audio,
        speaker=payload.speaker,
        instruction=payload.instruct,
        source_ref_audio_path=payload.ref_audio_path,
        source_ref_text=ref_text,
        meta={
            "display_name": requested_output_name(payload) or None,
            "model_id": payload.model_id,
            "strategy": strategy,
            "requested_speaker": payload.speaker,
            "resolved_speaker": resolved_speaker,
            "voice_clone_prompt_path": payload.voice_clone_prompt_path or None,
            "summary_path": storage.relpath(summary_path),
        },
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/voicebox-clone", response_model=GenerationResponse)
def generate_voicebox_clone(payload: VoiceBoxCloneRequest) -> GenerationResponse:
    """VoiceBox 하나만 사용해 참조 음성의 음색을 복제한다."""

    return generate_voicebox_clone_common(payload, mode="voicebox_clone", fallback_strategy="speaker_anchor_with_ref_code")


@app.post("/api/generate/voicebox-clone-instruct", response_model=GenerationResponse)
def generate_voicebox_clone_instruct(payload: VoiceBoxCloneRequest) -> GenerationResponse:
    """VoiceBox 하나만 사용해 참조 음성 복제와 말투 지시를 함께 적용한다."""

    if not payload.strategy:
        payload.strategy = "speaker_anchor_with_ref_code"
    return generate_voicebox_clone_common(payload, mode="voicebox_clone_instruct", fallback_strategy="speaker_anchor_with_ref_code")


@app.post("/api/clone-prompts/from-generated-sample", response_model=ClonePromptRecord)
def clone_prompt_from_generated_sample(payload: ClonePromptCreateFromSampleRequest) -> ClonePromptRecord:
    """생성 갤러리 이력으로부터 clone prompt를 만든다.

    Args:
        payload: 생성 이력 기반 clone prompt 생성 요청.

    Returns:
        저장된 clone prompt 레코드.
    """

    generation = get_generation_record(payload.generation_id)
    mode = str(generation.get("mode") or "generated")
    reference_text = str(payload.reference_text or generation.get("input_text") or "").strip()

    return create_clone_prompt_record(
        source_type="generated_voice_design" if mode == "voice_design" else "generated_gallery",
        model_id=payload.model_id or default_model_id("base_clone"),
        reference_audio_path=generation["output_audio_path"],
        reference_text=reference_text,
        x_vector_only_mode=payload.x_vector_only_mode,
        meta={"generation_id": payload.generation_id, "generation_mode": mode},
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


@app.get("/api/clone-prompts/{prompt_id}/download")
def download_clone_prompt(prompt_id: str) -> FileResponse:
    """Qwen clone prompt 자산과 참조 파일을 zip으로 다운로드한다."""

    record = storage.get_record(storage.clone_prompts_dir, prompt_id)
    if not record:
        raise HTTPException(status_code=404, detail="Clone prompt not found.")

    paths = storage.find_record_paths(storage.clone_prompts_dir, prompt_id)
    for key in ("prompt_path", "reference_audio_path"):
        resolved = _resolve_repo_path(record.get(key))
        if resolved:
            paths.append(resolved)

    return _archive_response(
        str(record.get("name") or record.get("source_type") or prompt_id),
        paths,
        readme="Qwen clone prompt archive. Import the .pkl prompt and metadata back into Voice Studio when needed.",
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

    record = get_preset_record(preset_id)
    record["image_url"] = voice_image_url_for("preset", preset_id)
    return CharacterPreset(**record)


@app.patch("/api/presets/{preset_id}", response_model=CharacterPreset)
def update_preset(preset_id: str, payload: CharacterPresetUpdateRequest) -> CharacterPreset:
    """프리셋의 사용자 표시 이름과 설명을 수정한다."""

    record = get_preset_record(preset_id)
    updates: Dict[str, Any] = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Preset name cannot be empty.")
        updates["name"] = name
    if payload.notes is not None:
        updates["notes"] = payload.notes.strip()

    if updates:
        record.update(updates)
        paths = storage.find_record_paths(storage.presets_dir, preset_id)
        if not paths:
            raise HTTPException(status_code=404, detail="Preset metadata file not found.")
        for path in paths:
            storage.write_json(path, record)

    record["image_url"] = voice_image_url_for("preset", preset_id)
    return CharacterPreset(**record)


@app.get("/api/presets/{preset_id}/download")
def download_preset(preset_id: str) -> FileResponse:
    """Qwen 프리셋 메타데이터, clone prompt, 참조 음성, 이미지를 zip으로 다운로드한다."""

    record = get_preset_record(preset_id)
    paths = storage.find_record_paths(storage.presets_dir, preset_id)

    for key in ("reference_audio_path", "clone_prompt_path"):
        resolved = _resolve_repo_path(record.get(key))
        if resolved:
            paths.append(resolved)

    clone_prompt_id = clone_prompt_id_from_path(record.get("clone_prompt_path"))
    if clone_prompt_id:
        paths.extend(storage.find_record_paths(storage.clone_prompts_dir, clone_prompt_id))

    paths.extend(_voice_image_paths_for("preset", preset_id))
    return _archive_response(
        str(record.get("name") or preset_id),
        paths,
        readme="Qwen preset archive. Contains preset metadata, clone prompt assets, reference audio, and optional card image.",
    )


@app.delete("/api/presets/{preset_id}", response_model=VoiceAssetDeleteResponse)
def delete_preset(preset_id: str) -> VoiceAssetDeleteResponse:
    """저장된 캐릭터 프리셋과 부속 이미지를 함께 삭제한다.

    Args:
        preset_id: 삭제할 프리셋 식별자.

    Returns:
        삭제 결과와 제거된 파일 개수.
    """

    record = get_preset_record(preset_id)
    removed = 0
    for record_path in storage.find_record_paths(storage.presets_dir, record["id"]):
        try:
            record_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    for image_path in _voice_image_paths_for("preset", preset_id):
        try:
            image_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    return VoiceAssetDeleteResponse(kind="preset", asset_id=preset_id, removed_files=removed)


@app.get("/api/s2-pro/voices/{voice_id}/download")
def download_s2_pro_voice(voice_id: str) -> FileResponse:
    """S2-Pro 저장 목소리 메타데이터와 참조 음성을 zip으로 다운로드한다."""

    record = get_s2pro_voice_record(voice_id)
    paths = storage.find_record_paths(storage.s2pro_voices_dir, record.id)
    for key in ("reference_audio_path", "qwen_clone_prompt_path"):
        resolved = _resolve_repo_path(getattr(record, key, None))
        if resolved:
            paths.append(resolved)
    paths.extend(_voice_image_paths_for("s2pro", record.id))
    return _archive_response(
        record.name or record.id,
        paths,
        readme="S2-Pro voice archive. Contains reusable voice metadata, reference audio, optional Qwen bridge prompt, and card image.",
    )


@app.delete("/api/s2-pro/voices/{voice_id}", response_model=VoiceAssetDeleteResponse)
def delete_s2_pro_voice(voice_id: str) -> VoiceAssetDeleteResponse:
    """저장된 S2-Pro 보이스를 메타데이터와 부속 이미지까지 삭제한다.

    Args:
        voice_id: 삭제할 보이스 식별자.

    Returns:
        삭제 결과와 제거된 파일 개수.
    """

    record = get_s2pro_voice_record(voice_id)
    removed = 0
    for record_path in storage.find_record_paths(storage.s2pro_voices_dir, record.id):
        try:
            record_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    for image_path in _voice_image_paths_for("s2pro", record.id):
        try:
            image_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    return VoiceAssetDeleteResponse(kind="s2pro", asset_id=record.id, removed_files=removed)


@app.get("/api/audio-tools/voice-models/{model_id}/download")
def download_voice_changer_model(model_id: str) -> FileResponse:
    """RVC 모델의 `.pth`, `.index`, 카드 이미지를 zip으로 다운로드한다."""

    matches = [item for item in list_voice_changer_models() if item.id == model_id]
    if not matches:
        raise HTTPException(status_code=404, detail="Voice changer model not found.")
    target = matches[0]
    paths: List[Path] = []
    for path_str in (target.model_path, target.index_path):
        resolved = _resolve_repo_path(path_str)
        if resolved:
            paths.append(resolved)
    paths.extend(_voice_image_paths_for("rvc", model_id))
    return _archive_response(
        target.label or model_id,
        paths,
        readme="RVC model archive. Contains the model checkpoint, optional index, and optional card image.",
    )


@app.delete("/api/audio-tools/voice-models/{model_id}", response_model=VoiceAssetDeleteResponse)
def delete_voice_changer_model(model_id: str) -> VoiceAssetDeleteResponse:
    """등록된 RVC 모델 파일과 부속 이미지를 삭제한다.

    Args:
        model_id: 삭제할 모델 식별자(`.pth` 파일 stem).

    Returns:
        삭제 결과와 제거된 파일 개수.
    """

    matches = [item for item in list_voice_changer_models() if item.id == model_id]
    if not matches:
        raise HTTPException(status_code=404, detail="Voice changer model not found.")
    target = matches[0]
    removed = 0
    for path_str in (target.model_path, target.index_path):
        if not path_str:
            continue
        candidate = Path(path_str)
        if candidate.exists():
            try:
                candidate.unlink()
                removed += 1
            except FileNotFoundError:
                continue
    for image_path in _voice_image_paths_for("rvc", model_id):
        try:
            image_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    return VoiceAssetDeleteResponse(kind="rvc", asset_id=model_id, removed_files=removed)


@app.post("/api/voice-images/{kind}/{asset_id}", response_model=VoiceImageUploadResponse)
async def upload_voice_image(
    kind: str,
    asset_id: str,
    file: UploadFile = File(...),
) -> VoiceImageUploadResponse:
    """프리셋, 훈련 모델, S2-Pro 보이스, RVC 모델 카드에 사용할 이미지를 업로드한다.

    Args:
        kind: 자산 종류 (`preset`, `trained`, `s2pro`, `rvc`).
        asset_id: 자산 식별자.
        file: 업로드한 이미지 파일.

    Returns:
        저장된 이미지 정보와 정적 URL.
    """

    base_dir = _voice_image_dir(kind)
    extension = Path(file.filename or "image.png").suffix.lower() or ".png"
    if extension not in VOICE_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {extension}. Allowed: {', '.join(sorted(VOICE_IMAGE_EXTENSIONS))}",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image upload.")
    if len(contents) > VOICE_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(contents)} bytes). Max {VOICE_IMAGE_MAX_BYTES} bytes.",
        )

    base_dir.mkdir(parents=True, exist_ok=True)

    # Replace any previous image for the same asset (different extensions allowed).
    for existing in _voice_image_paths_for(kind, asset_id):
        try:
            existing.unlink()
        except FileNotFoundError:
            continue

    target = base_dir / f"{asset_id}{extension}"
    target.write_bytes(contents)
    image_url = audio_url_for(storage.relpath(target))
    return VoiceImageUploadResponse(kind=kind, asset_id=asset_id, image_url=image_url)


@app.delete("/api/voice-images/{kind}/{asset_id}", response_model=VoiceAssetDeleteResponse)
def delete_voice_image(kind: str, asset_id: str) -> VoiceAssetDeleteResponse:
    """프리셋, 훈련 모델, S2-Pro 보이스, RVC 모델 카드에 등록된 이미지를 제거한다."""

    _voice_image_dir(kind)  # validates kind
    removed = 0
    for image_path in _voice_image_paths_for(kind, asset_id):
        try:
            image_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    return VoiceAssetDeleteResponse(kind=kind, asset_id=asset_id, removed_files=removed)


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
    requested_language = (payload.language or "").strip()
    preset_language = str(preset.get("language") or "Auto").strip() or "Auto"
    generation_language = preset_language if not requested_language or requested_language.lower() == "auto" else requested_language
    request = VoiceCloneRequest(
        model_id=preset.get("base_model"),
        text=payload.text,
        language=generation_language,
        output_name=payload.output_name,
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

    incoming_samples: List[Any] = list(payload.samples)
    if payload.sample_folder_path and payload.sample_folder_path.strip():
        incoming_samples.extend(samples_from_audio_folder(payload.sample_folder_path))

    if not incoming_samples:
        raise HTTPException(status_code=400, detail="At least one sample is required.")

    normalized_samples = []
    for sample in incoming_samples:
        audio_path = str(getattr(sample, "audio_path", "") if not isinstance(sample, dict) else sample.get("audio_path", "")).strip()
        sample_text = getattr(sample, "text", None) if not isinstance(sample, dict) else sample.get("text")
        if not audio_path:
            continue

        # 데이터셋 빌더는 음성만 먼저 모아두는 흐름이 많아서,
        # 텍스트가 비어 있으면 각 샘플을 자동 전사해 raw JSONL을 완성한다.
        transcript = resolve_reference_text(audio_path, sample_text)
        normalized_samples.append(
            {
                "audio_path": audio_path,
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
        "training_ready": False,
        "status_label": "데이터셋 생성 완료",
        "next_step_label": "학습용 준비 실행",
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


@app.post("/api/audio-datasets/build", response_model=AudioDatasetBuildResponse)
def build_audio_tool_dataset(payload: AudioDatasetBuildRequest) -> AudioDatasetBuildResponse:
    """Create a model-specific dataset folder from gallery audio or a folder path.

    The endpoint gives non-Qwen training flows the same basic UX as the Qwen
    dataset builder: generated-gallery selection, folder-path intake, optional
    ASR for missing transcripts, and a concrete prepared path to hand to each
    trainer. It does not launch training; it only creates organized assets.
    """

    samples = normalize_tool_dataset_samples(payload)
    dataset_id = storage.unique_dataset_id(f"{payload.target}_{payload.name}")
    dataset_dir = storage.dataset_dir(dataset_id)
    audio_dir = dataset_dir / "audio"
    lab_audio_dir = dataset_dir / "lab_audio"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)
    lab_audio_dir.mkdir(parents=True, exist_ok=True)

    manifest_samples: List[Dict[str, Any]] = []
    jsonl_records: List[str] = []
    ace_records: List[Dict[str, Any]] = []

    ref_audio_path = payload.ref_audio_path or samples[0]["audio_path"]
    ref_target = dataset_dir / "reference.wav"
    copy_audio_as_dataset_wav(ref_audio_path, ref_target)

    for index, sample in enumerate(samples, start=1):
        source = Path(resolve_repo_audio_path(sample["audio_path"]))
        slug = storage.slugify(source.stem, default=f"sample-{index}")
        wav_name = f"{index:05d}_{slug}.wav"
        audio_target = audio_dir / wav_name
        lab_target = lab_audio_dir / wav_name
        copy_audio_as_dataset_wav(sample["audio_path"], audio_target)
        copy_audio_as_dataset_wav(sample["audio_path"], lab_target)
        text = sample["text"].strip()
        (lab_target.with_suffix(".lab")).write_text(text + "\n", encoding="utf-8")

        audio_rel = storage.relpath(audio_target)
        lab_audio_rel = storage.relpath(lab_target)
        manifest_samples.append(
            {
                "source_audio_path": sample["audio_path"],
                "audio_path": audio_rel,
                "lab_audio_path": lab_audio_rel,
                "lab_path": storage.relpath(lab_target.with_suffix(".lab")),
                "text": text,
            }
        )
        jsonl_records.append(
            json.dumps(
                {
                    "audio": audio_rel,
                    "audio_path": audio_rel,
                    "text": text,
                    "voice_prompts": [storage.relpath(ref_target)],
                },
                ensure_ascii=False,
            )
        )
        ace_records.append({"audio_path": audio_rel, "prompt": text})

    train_jsonl_path = dataset_dir / "train.jsonl"
    validation_jsonl_path = dataset_dir / "validation.jsonl"
    dataset_json_path = dataset_dir / "dataset.json"
    manifest_path = storage.dataset_manifest_path(dataset_id)

    train_jsonl_path.write_text("\n".join(jsonl_records) + "\n", encoding="utf-8")
    validation_jsonl_path.write_text((jsonl_records[-1] if jsonl_records else "") + "\n", encoding="utf-8")
    dataset_json_path.write_text(json.dumps({"samples": ace_records}, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {
        "id": dataset_id,
        "name": payload.name,
        "target": payload.target,
        "source_type": payload.source_type,
        "dataset_root_path": storage.relpath(dataset_dir),
        "audio_dir_path": storage.relpath(audio_dir),
        "lab_audio_dir_path": storage.relpath(lab_audio_dir),
        "reference_audio_path": storage.relpath(ref_target),
        "train_jsonl_path": storage.relpath(train_jsonl_path),
        "validation_jsonl_path": storage.relpath(validation_jsonl_path),
        "dataset_json_path": storage.relpath(dataset_json_path),
        "sample_count": len(manifest_samples),
        "samples": manifest_samples,
        "created_at": utc_now(),
    }
    storage.write_json(manifest_path, manifest)

    return AudioDatasetBuildResponse(
        id=dataset_id,
        name=payload.name,
        target=payload.target,
        dataset_root_path=storage.relpath(dataset_dir),
        audio_dir_path=storage.relpath(audio_dir),
        lab_audio_dir_path=storage.relpath(lab_audio_dir),
        train_jsonl_path=storage.relpath(train_jsonl_path),
        validation_jsonl_path=storage.relpath(validation_jsonl_path),
        dataset_json_path=storage.relpath(dataset_json_path),
        manifest_path=storage.relpath(manifest_path),
        sample_count=len(manifest_samples),
        message=f"{payload.target} dataset prepared with {len(manifest_samples)} samples.",
    )


@app.get("/api/datasets", response_model=List[FineTuneDataset])
def list_datasets() -> List[FineTuneDataset]:
    """저장된 파인튜닝 데이터셋 목록을 반환한다.

    Returns:
        최신순 데이터셋 목록.
    """

    return list_dataset_records()


@app.delete("/api/datasets/{dataset_id}", response_model=VoiceAssetDeleteResponse)
def delete_finetune_dataset(dataset_id: str) -> VoiceAssetDeleteResponse:
    """Qwen 계열 파인튜닝 데이터셋을 삭제한다.

    Args:
        dataset_id: 삭제할 Qwen 데이터셋 식별자.

    Returns:
        삭제된 파일 개수와 데이터셋 식별자.
    """

    get_dataset_record(dataset_id)
    dataset_dir = storage.dataset_dir(dataset_id)
    removed = 0
    if dataset_dir.exists():
        removed += sum(1 for item in dataset_dir.rglob("*") if item.is_file())
        shutil.rmtree(dataset_dir)

    for record_path in storage.find_record_paths(storage.datasets_dir, dataset_id):
        try:
            if record_path.exists():
                record_path.unlink()
                removed += 1
        except FileNotFoundError:
            continue

    return VoiceAssetDeleteResponse(kind="dataset", asset_id=dataset_id, removed_files=removed)


@app.get("/api/datasets/{dataset_id}/download")
def download_finetune_dataset(dataset_id: str) -> FileResponse:
    """Qwen 계열 데이터셋 폴더와 레거시 레코드를 zip으로 다운로드한다."""

    record = get_dataset_record(dataset_id)
    paths: List[Path] = []
    dataset_dir = storage.dataset_dir(dataset_id)
    if dataset_dir.exists():
        paths.append(dataset_dir)
    paths.extend(storage.find_record_paths(storage.datasets_dir, dataset_id))
    for key in ("raw_jsonl_path", "prepared_jsonl_path", "manifest_path", "ref_audio_path"):
        resolved = _resolve_repo_path(record.get(key))
        if resolved:
            paths.append(resolved)
    return _archive_response(
        str(record.get("name") or dataset_id),
        paths,
        readme="Qwen fine-tuning dataset archive. Contains audio assets, transcript JSONL files, manifest, and reference audio when available.",
    )


@app.get("/api/audio-datasets", response_model=List[AudioDatasetRecord])
def list_audio_datasets() -> List[AudioDatasetRecord]:
    """Qwen 외 엔진용으로 준비된 데이터셋 목록을 반환한다."""

    return list_audio_dataset_records()


@app.delete("/api/audio-datasets/{dataset_id}", response_model=VoiceAssetDeleteResponse)
def delete_audio_dataset(dataset_id: str) -> VoiceAssetDeleteResponse:
    """공용 오디오 데이터셋 폴더 전체를 삭제한다.

    Args:
        dataset_id: 삭제할 데이터셋 식별자.

    Returns:
        삭제된 파일 개수와 데이터셋 식별자.
    """

    dataset_dir = storage.dataset_dir(dataset_id)
    manifest_path = dataset_dir / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Audio dataset not found.")

    try:
        record = storage.read_json(manifest_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid audio dataset manifest: {exc}") from exc

    if record.get("target") not in {"s2_pro", "vibevoice", "rvc", "mmaudio", "ace_step"}:
        raise HTTPException(status_code=400, detail="This endpoint only deletes cross-engine audio datasets.")

    removed = sum(1 for item in dataset_dir.rglob("*") if item.is_file())
    shutil.rmtree(dataset_dir)
    return VoiceAssetDeleteResponse(kind="audio_dataset", asset_id=dataset_id, removed_files=removed)


@app.get("/api/audio-datasets/{dataset_id}/download")
def download_audio_dataset(dataset_id: str) -> FileResponse:
    """S2-Pro/VibeVoice/RVC/MMAudio/ACE-Step용 공용 데이터셋을 zip으로 다운로드한다."""

    dataset_dir = storage.dataset_dir(dataset_id)
    manifest_path = dataset_dir / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Audio dataset not found.")
    try:
        record = storage.read_json(manifest_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid audio dataset manifest: {exc}") from exc
    if record.get("target") not in {"s2_pro", "vibevoice", "rvc", "mmaudio", "ace_step"}:
        raise HTTPException(status_code=400, detail="This endpoint only downloads cross-engine audio datasets.")
    return _archive_response(
        str(record.get("name") or dataset_id),
        [dataset_dir],
        readme="Cross-engine dataset archive. Contains normalized audio, manifests, transcripts, and engine-specific prepared files.",
    )


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

    simulate = payload.simulate_only
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
    dataset["training_ready"] = True
    dataset["status_label"] = "학습 가능"
    dataset["next_step_label"] = "학습 시작"
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


@app.post("/api/datasets/{dataset_id}/prepare-for-training", response_model=FineTuneDataset)
def prepare_dataset_for_training(dataset_id: str, payload: PrepareDatasetRequest) -> FineTuneDataset:
    """사용자 용어 기준의 학습 시작 준비 엔드포인트.

    내부적으로는 audio code 전처리를 수행하지만, UI에는 raw/prepared 같은
    구현 용어 대신 '학습 시작 준비' 단계로만 노출할 수 있게 별칭을 제공한다.
    """

    return prepare_dataset(dataset_id, payload)


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

    simulate = payload.simulate_only
    command: List[str] = []
    entrypoint = resolve_finetune_entrypoint(payload.training_mode)

    if not simulate:
        dataset = ensure_real_prepared_dataset(dataset, payload.device)
        prepared_jsonl_path = dataset["prepared_jsonl_path"]
        command = [
            qwen_training_python(),
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

    final_checkpoint = collapse_run_checkpoints(output_model_path) if status == "completed" else None
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
        "final_checkpoint_path": storage.relpath(final_checkpoint) if final_checkpoint else None,
        "selectable_model_path": storage.relpath(final_checkpoint) if final_checkpoint else None,
        "is_selectable": bool(final_checkpoint) and status == "completed",
        "stage_label": "학습 완료" if status == "completed" else "학습 실패",
        "summary_label": "CustomVoice 학습 모델" if payload.training_mode == "custom_voice" else "Base 학습 모델",
        "output_name": payload.output_name,
        "display_name": payload.output_name,
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


@app.patch("/api/finetune-runs/{run_id}", response_model=FineTuneRun)
def update_finetune_run(run_id: str, payload: FineTuneRunUpdateRequest) -> FineTuneRun:
    """학습 결과 모델의 라이브러리 표시명을 수정한다.

    기존 체크포인트 파일명은 바꾸지 않고 메타데이터만 갱신한다. 이렇게 해야
    이미 연결된 추론 경로와 다운로드 아카이브가 깨지지 않는다.
    """

    display_name = (payload.display_name or "").strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Model name cannot be empty.")

    record_paths = storage.find_record_paths(storage.finetune_runs_dir, run_id)
    record = storage.get_record(storage.finetune_runs_dir, run_id)

    if not record:
        run_root = storage.finetune_runs_dir.resolve()
        run_dir = (storage.finetune_runs_dir / run_id).resolve()
        if run_root not in (run_dir, *run_dir.parents) or not run_dir.exists():
            raise HTTPException(status_code=404, detail="Fine-tuning run not found.")
        inferred = infer_finetune_run_record(run_dir)
        if inferred is None:
            raise HTTPException(status_code=404, detail="Fine-tuning run metadata not found.")
        record = inferred.model_dump()
        created_at = parse_created_at(str(record.get("created_at") or utc_now()))
        record_paths = [
            storage.named_record_path(
                root=storage.finetune_runs_dir,
                category=str(record.get("training_mode") or "finetuned"),
                label=display_name,
                record_id=run_id,
                created_at=created_at,
            )
        ]

    output_name = str(record.get("output_name") or Path(str(record.get("output_model_path") or run_id)).name)
    record["output_name"] = output_name
    record["display_name"] = display_name

    if not record_paths:
        record_paths = [storage.record_path(storage.finetune_runs_dir, run_id)]
    for path in record_paths:
        storage.write_json(path, record)

    return FineTuneRun(**record)


@app.get("/api/finetune-runs/{run_id}/download")
def download_finetune_run(run_id: str) -> FileResponse:
    """완료된 fine-tuned 모델 run 폴더와 실행 메타데이터를 zip으로 다운로드한다."""

    payload = storage.get_record(storage.finetune_runs_dir, run_id)
    run_root = storage.finetune_runs_dir.resolve()
    run_dir = (storage.finetune_runs_dir / run_id).resolve()
    if run_root not in (run_dir, *run_dir.parents):
        raise HTTPException(status_code=400, detail="Invalid fine-tuning run id.")

    record_paths = storage.find_record_paths(storage.finetune_runs_dir, run_id)
    if not run_dir.exists() and not payload and not record_paths:
        raise HTTPException(status_code=404, detail="Fine-tuning run not found.")

    paths: List[Path] = []
    if run_dir.exists():
        paths.append(run_dir)
    paths.extend(record_paths)
    paths.extend(_voice_image_paths_for("trained", run_id))
    if payload:
        for key in ("dataset_path", "final_checkpoint_path", "log_path"):
            resolved = _resolve_repo_path(payload.get(key))
            if resolved:
                paths.append(resolved)

    archive_label = str((payload or {}).get("display_name") or (payload or {}).get("output_name") or run_id)
    return _archive_response(
        archive_label,
        paths,
        readme="Fine-tuned model archive. Contains the run folder, final checkpoint files, logs, and run metadata when available.",
    )


@app.delete("/api/finetune-runs/{run_id}", response_model=VoiceAssetDeleteResponse)
def delete_finetune_run(run_id: str) -> VoiceAssetDeleteResponse:
    """완료된 Qwen fine-tuned 모델 run 폴더와 실행 레코드를 삭제한다.

    기본 모델은 `data/finetune-runs` 밖에 있으므로 이 엔드포인트로 삭제되지 않는다.

    Args:
        run_id: 삭제할 fine-tuning 실행 식별자.

    Returns:
        삭제 결과와 제거된 파일 개수.
    """

    run_root = storage.finetune_runs_dir.resolve()
    run_dir = (storage.finetune_runs_dir / run_id).resolve()
    if run_root not in (run_dir, *run_dir.parents):
        raise HTTPException(status_code=400, detail="Invalid fine-tuning run id.")

    record_paths = storage.find_record_paths(storage.finetune_runs_dir, run_id)
    if not run_dir.exists() and not record_paths:
        raise HTTPException(status_code=404, detail="Fine-tuning run not found.")

    removed = 0
    if run_dir.exists():
        removed += sum(1 for item in run_dir.rglob("*") if item.is_file())
        shutil.rmtree(run_dir)

    for record_path in record_paths:
        try:
            if record_path.exists():
                record_path.unlink()
                removed += 1
        except FileNotFoundError:
            continue

    for image_path in _voice_image_paths_for("trained", run_id):
        try:
            image_path.unlink()
            removed += 1
        except FileNotFoundError:
            continue

    return VoiceAssetDeleteResponse(kind="finetune_run", asset_id=run_id, removed_files=removed)


@app.get("/", include_in_schema=False)
def serve_frontend_root() -> FileResponse:
    """Serve the built frontend entrypoint from the backend.

    Returns:
        Built ``index.html`` when the frontend bundle exists.
    """

    build_dir = frontend_build_dir()
    index_path = build_dir / "index.html"
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend build not found. Run `npm run build` in `app/frontend` first.",
        )
    return FileResponse(index_path)


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
def health_alias() -> HealthResponse:
    """Expose the API health payload on the legacy root health path."""

    return health()


@app.get("/{frontend_path:path}", include_in_schema=False)
def serve_frontend_spa(frontend_path: str) -> FileResponse:
    """Serve static frontend files and SPA routes from the backend.

    Args:
        frontend_path: Requested browser path below the site root.

    Returns:
        The matching built file, or ``index.html`` for SPA routes.
    """

    if not frontend_path:
        return serve_frontend_root()

    first_segment = frontend_path.split("/", 1)[0].strip().lower()
    if first_segment in API_LIKE_PREFIXES:
        raise HTTPException(status_code=404, detail=f"API route not found: /{frontend_path}")

    build_dir = frontend_build_dir()
    candidate = build_dir / frontend_path
    if candidate.exists() and candidate.is_file():
        return FileResponse(candidate)

    index_path = build_dir / "index.html"
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend build not found. Run `npm run build` in `app/frontend` first.",
        )
    return FileResponse(index_path)
