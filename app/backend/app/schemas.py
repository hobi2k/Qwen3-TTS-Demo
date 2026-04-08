"""Pydantic schemas used by the Qwen3-TTS demo API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """헬스체크 응답 스키마다."""

    status: str
    simulation_mode: bool
    runtime_mode: str
    qwen_tts_available: bool
    device: str
    attention_implementation: str
    recommended_instruction_language: str
    data_dir: str


class ModelInfo(BaseModel):
    """프런트엔드에 노출할 모델 메타데이터 스키마다."""

    key: str
    category: str
    label: str
    model_id: str
    supports_instruction: bool = False
    notes: str = ""
    recommended: bool = False


class AudioAsset(BaseModel):
    """저장된 오디오 자산 참조 스키마다."""

    id: str
    path: str
    url: str


class GenerationRequestBase(BaseModel):
    """모든 음성 생성 요청이 공유하는 기본 입력 스키마다."""

    text: str = Field(..., min_length=1)
    language: str = "Auto"


class CustomVoiceRequest(GenerationRequestBase):
    """기본 화자 기반 CustomVoice 합성 요청 스키마다."""

    model_id: Optional[str] = None
    speaker: str = "Vivian"
    instruct: str = ""


class VoiceDesignRequest(GenerationRequestBase):
    """설명문 기반 VoiceDesign 합성 요청 스키마다."""

    model_id: Optional[str] = None
    instruct: str = Field(..., min_length=1)


class VoiceCloneRequest(GenerationRequestBase):
    """clone prompt 또는 참조 음성 기반 Base 합성 요청 스키마다."""

    model_id: Optional[str] = None
    preset_id: Optional[str] = None
    ref_audio_path: Optional[str] = None
    ref_text: Optional[str] = None
    voice_clone_prompt_path: Optional[str] = None
    x_vector_only_mode: bool = False


class GenerationRecord(BaseModel):
    """생성 이력 저장 및 응답에 사용하는 레코드 스키마다."""

    id: str
    mode: str
    input_text: str
    language: str
    speaker: Optional[str] = None
    instruction: Optional[str] = None
    preset_id: Optional[str] = None
    output_audio_path: str
    output_audio_url: str
    source_ref_audio_path: Optional[str] = None
    source_ref_text: Optional[str] = None
    created_at: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class GenerationResponse(BaseModel):
    """단일 생성 결과를 감싸는 응답 스키마다."""

    record: GenerationRecord


class ClonePromptCreateFromSampleRequest(BaseModel):
    """생성 이력으로부터 clone prompt를 만드는 요청 스키마다."""

    generation_id: str
    model_id: Optional[str] = None
    x_vector_only_mode: bool = False


class ClonePromptCreateFromUploadRequest(BaseModel):
    """업로드한 참조 음성으로 clone prompt를 만드는 요청 스키마다."""

    model_id: Optional[str] = None
    reference_audio_path: str
    reference_text: str
    x_vector_only_mode: bool = False


class ClonePromptRecord(BaseModel):
    """생성된 clone prompt 메타데이터 스키마다."""

    id: str
    source_type: str
    prompt_path: str
    reference_audio_path: str
    reference_text: str
    x_vector_only_mode: bool = False
    created_at: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class CharacterPresetCreateRequest(BaseModel):
    """고정 캐릭터 프리셋 생성 요청 스키마다."""

    name: str = Field(..., min_length=1)
    source_type: str
    language: str = "Auto"
    base_model: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    reference_text: str
    reference_audio_path: str
    clone_prompt_path: str
    notes: str = ""


class CharacterPreset(BaseModel):
    """저장된 고정 캐릭터 프리셋 스키마다."""

    id: str
    name: str
    source_type: str
    base_model: str
    language: str
    reference_text: str
    reference_audio_path: str
    clone_prompt_path: str
    created_at: str
    notes: str = ""


class PresetGenerateRequest(BaseModel):
    """프리셋 기반 음성 생성 요청 스키마다."""

    text: str = Field(..., min_length=1)
    language: str = "Auto"


class DatasetSampleInput(BaseModel):
    """파인튜닝 데이터셋 구성에 사용할 샘플 입력 스키마다."""

    audio_path: str
    text: str


class FineTuneDatasetCreateRequest(BaseModel):
    """파인튜닝용 JSONL 데이터셋 생성 요청 스키마다."""

    name: str = Field(..., min_length=1)
    source_type: str
    speaker_name: str = Field(..., min_length=1)
    ref_audio_path: str
    samples: List[DatasetSampleInput]


class FineTuneDataset(BaseModel):
    """저장된 파인튜닝 데이터셋 메타데이터 스키마다."""

    id: str
    name: str
    source_type: str
    raw_jsonl_path: str
    prepared_jsonl_path: Optional[str] = None
    ref_audio_path: str
    speaker_name: str
    sample_count: int
    created_at: str


class PrepareDatasetRequest(BaseModel):
    """audio code 전처리 실행 요청 스키마다."""

    tokenizer_model_path: str = "Qwen/Qwen3-TTS-Tokenizer-12Hz"
    device: str = "cuda:0"
    simulate_only: bool = False


class FineTuneRunCreateRequest(BaseModel):
    """파인튜닝 실행 요청 스키마다."""

    dataset_id: str
    init_model_path: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    output_name: str = "demo-run"
    batch_size: int = 2
    lr: float = 2e-5
    num_epochs: int = 3
    speaker_name: str = Field(..., min_length=1)
    device: str = "cuda:0"
    simulate_only: bool = False


class FineTuneRun(BaseModel):
    """파인튜닝 실행 결과 메타데이터 스키마다."""

    id: str
    dataset_id: str
    init_model_path: str
    output_model_path: str
    batch_size: int
    lr: float
    num_epochs: int
    speaker_name: str
    status: str
    created_at: str
    finished_at: Optional[str] = None
    log_path: Optional[str] = None
    command: Optional[List[str]] = None
