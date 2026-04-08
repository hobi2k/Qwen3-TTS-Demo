"""FastAPI application for the Qwen3-TTS demo backend."""

import json
import os
import pickle
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .qwen import QwenDemoEngine
from .schemas import (
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
    ModelInfo,
    PrepareDatasetRequest,
    PresetGenerateRequest,
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
        "custom_voice": os.getenv("QWEN_DEMO_CUSTOM_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        "voice_design": os.getenv("QWEN_DEMO_DESIGN_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        "base_clone": os.getenv("QWEN_DEMO_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
        "tokenizer": os.getenv("QWEN_DEMO_TOKENIZER_MODEL", "Qwen/Qwen3-TTS-Tokenizer-12Hz"),
    }
    return defaults[category]


def model_path_or_repo(dirname: str, repo_id: str) -> str:
    local_path = REPO_ROOT / "data" / "models" / dirname
    if local_path.exists():
        return str(local_path)
    return repo_id

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
        jsonl_lines.append(
            json.dumps(
                {
                    "audio": sample.audio_path,
                    "text": sample.text,
                    "ref_audio": ref_audio_path,
                },
                ensure_ascii=False,
            )
        )
    dataset_path.write_text("\n".join(jsonl_lines) + "\n", encoding="utf-8")


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


@app.get("/api/models", response_model=List[ModelInfo])
def list_models() -> List[ModelInfo]:
    """프런트엔드가 표시할 데모 모델 목록을 반환한다.

    Returns:
        지원 모델 메타데이터 목록.
    """

    return [
        ModelInfo(
            key="custom_voice_0_6b",
            category="custom_voice",
            label="CustomVoice 0.6B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-0.6B-CustomVoice", default_model_id("custom_voice")),
            supports_instruction=True,
            notes="로컬 데모에서 가장 먼저 테스트할 현실적인 기본 모델",
            recommended=True,
        ),
        ModelInfo(
            key="custom_voice_1_7b",
            category="custom_voice",
            label="CustomVoice 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-CustomVoice", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
            supports_instruction=True,
            notes="더 무거운 고품질 CustomVoice",
        ),
        ModelInfo(
            key="voice_design_1_7b",
            category="voice_design",
            label="VoiceDesign 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-VoiceDesign", default_model_id("voice_design")),
            supports_instruction=True,
            notes="설명문 기반 새 목소리 설계용",
            recommended=True,
        ),
        ModelInfo(
            key="base_clone_0_6b",
            category="base_clone",
            label="Base 0.6B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-0.6B-Base", default_model_id("base_clone")),
            supports_instruction=False,
            notes="clone prompt 재사용과 CPU 환경 데모를 고려한 기본 모델",
            recommended=True,
        ),
        ModelInfo(
            key="base_clone_1_7b",
            category="base_clone",
            label="Base 1.7B",
            model_id=model_path_or_repo("Qwen3-TTS-12Hz-1.7B-Base", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
            supports_instruction=False,
            notes="고품질 Base clone과 파인튜닝용",
        ),
        ModelInfo(
            key="tokenizer_12hz",
            category="tokenizer",
            label="Tokenizer 12Hz",
            model_id=model_path_or_repo("Qwen3-TTS-Tokenizer-12Hz", default_model_id("tokenizer")),
            supports_instruction=False,
            notes="prepare_data와 tokenizer 처리용",
        ),
    ]


@app.get("/api/speakers")
def list_speakers() -> List[Dict[str, str]]:
    """CustomVoice용 기본 화자 목록을 반환한다.

    Returns:
        화자 이름과 설명을 담은 목록.
    """

    return engine.supported_speakers()


@app.get("/api/history", response_model=List[GenerationRecord])
def history() -> List[GenerationRecord]:
    """저장된 생성 이력을 최신순으로 반환한다.

    Returns:
        생성 이력 모델 목록.
    """

    records = storage.list_json_records(storage.generated_dir)
    return [GenerationRecord(**record) for record in records]


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

    audio_path, _, meta = engine.generate_custom_voice(
        text=payload.text,
        language=payload.language,
        speaker=payload.speaker,
        instruct=payload.instruct,
        model_id=payload.model_id or default_model_id("custom_voice"),
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

    audio_path, _, meta = engine.generate_voice_design(
        text=payload.text,
        language=payload.language,
        instruct=payload.instruct,
        model_id=payload.model_id or default_model_id("voice_design"),
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

    if not voice_clone_prompt_path and not (ref_audio_path and ref_text):
        raise HTTPException(status_code=400, detail="Preset or clone prompt/reference inputs are required.")

    audio_path, _, meta = engine.generate_voice_clone(
        text=payload.text,
        language=payload.language,
        model_id=model_id,
        ref_audio_path=ref_audio_path,
        ref_text=ref_text,
        voice_clone_prompt_path=voice_clone_prompt_path,
        x_vector_only_mode=payload.x_vector_only_mode,
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

    return create_clone_prompt_record(
        source_type="uploaded_reference",
        model_id=payload.model_id or default_model_id("base_clone"),
        reference_audio_path=payload.reference_audio_path,
        reference_text=payload.reference_text,
        x_vector_only_mode=payload.x_vector_only_mode,
    )


@app.get("/api/presets", response_model=List[CharacterPreset])
def list_presets() -> List[CharacterPreset]:
    """저장된 캐릭터 프리셋 목록을 반환한다.

    Returns:
        최신순 프리셋 목록.
    """

    records = storage.list_json_records(storage.presets_dir)
    return [CharacterPreset(**record) for record in records]


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

    dataset_id = storage.new_id("dataset")
    raw_jsonl_path = storage.datasets_dir / f"{dataset_id}_raw.jsonl"
    write_dataset_jsonl(raw_jsonl_path, payload.ref_audio_path, payload.samples)

    record = {
        "id": dataset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "raw_jsonl_path": storage.relpath(raw_jsonl_path),
        "prepared_jsonl_path": None,
        "ref_audio_path": payload.ref_audio_path,
        "speaker_name": payload.speaker_name,
        "sample_count": len(payload.samples),
        "created_at": utc_now(),
    }
    storage.write_json(storage.datasets_dir / f"{dataset_id}.json", record)
    return FineTuneDataset(**record)


@app.get("/api/datasets", response_model=List[FineTuneDataset])
def list_datasets() -> List[FineTuneDataset]:
    """저장된 파인튜닝 데이터셋 목록을 반환한다.

    Returns:
        최신순 데이터셋 목록.
    """

    records = storage.list_json_records(storage.datasets_dir)
    return [FineTuneDataset(**record) for record in records]


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
    prepared_jsonl_path = storage.datasets_dir / f"{dataset_id}_with_codes.jsonl"

    simulate = payload.simulate_only or engine.simulation_mode
    if not simulate:
        result = run_upstream_command(
            [
                "python3",
                "prepare_data.py",
                "--device",
                payload.device,
                "--tokenizer_model_path",
                payload.tokenizer_model_path,
                "--input_jsonl",
                str(raw_jsonl_path),
                "--output_jsonl",
                str(prepared_jsonl_path),
            ]
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr or result.stdout or "prepare_data.py failed")
    else:
        lines = []
        for line in raw_jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            # 시뮬레이션 모드에서도 후속 단계가 같은 키를 기대하므로
            # 최소한의 placeholder audio code 배열을 채워 넣는다.
            row["audio_codes"] = [101, 202, 303, 404]
            lines.append(json.dumps(row, ensure_ascii=False))
        prepared_jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    dataset["prepared_jsonl_path"] = storage.relpath(prepared_jsonl_path)
    storage.write_json(storage.datasets_dir / f"{dataset_id}.json", dataset)
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

    if not simulate:
        command = [
            "python3",
            "sft_12hz.py",
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
        "init_model_path": payload.init_model_path,
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

    records = storage.list_json_records(storage.finetune_runs_dir)
    return [FineTuneRun(**record) for record in records]


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
