from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    simulation_mode: bool
    qwen_tts_available: bool
    data_dir: str


class ModelInfo(BaseModel):
    key: str
    label: str
    model_id: str
    supports_instruction: bool = False
    notes: str = ""


class AudioAsset(BaseModel):
    id: str
    path: str
    url: str


class GenerationRequestBase(BaseModel):
    text: str = Field(..., min_length=1)
    language: str = "Auto"


class CustomVoiceRequest(GenerationRequestBase):
    speaker: str = "Vivian"
    instruct: str = ""


class VoiceDesignRequest(GenerationRequestBase):
    instruct: str = Field(..., min_length=1)


class VoiceCloneRequest(GenerationRequestBase):
    preset_id: Optional[str] = None
    ref_audio_path: Optional[str] = None
    ref_text: Optional[str] = None
    voice_clone_prompt_path: Optional[str] = None
    x_vector_only_mode: bool = False


class GenerationRecord(BaseModel):
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
    record: GenerationRecord


class ClonePromptCreateFromSampleRequest(BaseModel):
    generation_id: str
    x_vector_only_mode: bool = False


class ClonePromptCreateFromUploadRequest(BaseModel):
    reference_audio_path: str
    reference_text: str
    x_vector_only_mode: bool = False


class ClonePromptRecord(BaseModel):
    id: str
    source_type: str
    prompt_path: str
    reference_audio_path: str
    reference_text: str
    x_vector_only_mode: bool = False
    created_at: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class CharacterPresetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    source_type: str
    language: str = "Auto"
    base_model: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    reference_text: str
    reference_audio_path: str
    clone_prompt_path: str
    notes: str = ""


class CharacterPreset(BaseModel):
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
    text: str = Field(..., min_length=1)
    language: str = "Auto"


class DatasetSampleInput(BaseModel):
    audio_path: str
    text: str


class FineTuneDatasetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    source_type: str
    speaker_name: str = Field(..., min_length=1)
    ref_audio_path: str
    samples: List[DatasetSampleInput]


class FineTuneDataset(BaseModel):
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
    tokenizer_model_path: str = "Qwen/Qwen3-TTS-Tokenizer-12Hz"
    device: str = "cuda:0"
    simulate_only: bool = False


class FineTuneRunCreateRequest(BaseModel):
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

