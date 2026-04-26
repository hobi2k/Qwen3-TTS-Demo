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
    inference_mode: Optional[str] = None
    source: str = "stock"
    available_speakers: List[str] = Field(default_factory=list)
    default_speaker: Optional[str] = None
    model_family: Optional[str] = None
    speaker_encoder_included: bool = False


class AudioAsset(BaseModel):
    """저장된 오디오 자산 참조 스키마다."""

    id: str
    path: str
    url: str
    filename: str
    source: str
    created_at: Optional[str] = None
    text_preview: Optional[str] = None
    transcript_text: Optional[str] = None


class GalleryItem(BaseModel):
    """하나의 갤러리 화면에서 다루는 오디오 결과물 요약 스키마다."""

    id: str
    kind: str
    title: str
    subtitle: str = ""
    created_at: str
    audio_path: str
    audio_url: str
    filename: str
    source: str
    transcript_text: Optional[str] = None
    preview_text: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class GenerationRequestBase(BaseModel):
    """모든 음성 생성 요청이 공유하는 기본 입력 스키마다."""

    text: str = Field(..., min_length=1)
    language: str = "Auto"
    output_name: Optional[str] = None
    seed: Optional[int] = None
    non_streaming_mode: Optional[bool] = None
    do_sample: Optional[bool] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    subtalker_dosample: Optional[bool] = None
    subtalker_top_k: Optional[int] = None
    subtalker_top_p: Optional[float] = None
    subtalker_temperature: Optional[float] = None
    max_new_tokens: Optional[int] = None
    extra_generate_kwargs: Dict[str, Any] = Field(default_factory=dict)


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


class UniversalInferenceRequest(GenerationRequestBase):
    """모델 선택형 통합 추론 요청 스키마다."""

    model_id: str = Field(..., min_length=1)
    speaker: Optional[str] = None
    instruct: str = ""
    ref_audio_path: Optional[str] = None
    ref_text: Optional[str] = None
    voice_clone_prompt_path: Optional[str] = None
    x_vector_only_mode: bool = False


class HybridCloneInstructRequest(GenerationRequestBase):
    """Base clone prompt와 CustomVoice instruct를 함께 쓰는 실험용 요청."""

    base_model_id: str = Field(..., min_length=1)
    custom_model_id: str = Field(..., min_length=1)
    instruct: str = ""
    ref_audio_path: str = Field(..., min_length=1)
    ref_text: Optional[str] = None
    x_vector_only_mode: bool = False


class VoiceBoxFusionRequest(BaseModel):
    """Plain CustomVoice checkpoint를 VoiceBox checkpoint로 변환하는 요청."""

    input_checkpoint_path: str = Field(..., min_length=1)
    speaker_encoder_source_path: str = Field(..., min_length=1)
    output_name: str = Field(..., min_length=1)


class VoiceBoxCloneRequest(GenerationRequestBase):
    """VoiceBox 단일 모델로 clone 또는 clone+instruct를 실행하는 요청."""

    model_id: str = Field(..., min_length=1)
    ref_audio_path: str = Field(..., min_length=1)
    ref_text: Optional[str] = None
    instruct: str = ""
    speaker: str = "mai"
    strategy: str = ""


class S2ProRuntimeResponse(BaseModel):
    """로컬 Fish Speech S2-Pro 런타임 상태 응답."""

    available: bool
    server_running: bool
    source: str
    endpoint_url: str
    server_url: str
    model: str
    repo_root: str
    model_dir: str
    api_server_path: str
    codec_path: str
    repo_ready: bool
    model_ready: bool
    missing_model_files: List[str] = Field(default_factory=list)
    server_error: str = ""
    features: List[str] = Field(default_factory=list)


class S2ProGenerateRequest(BaseModel):
    """Fish Speech S2-Pro 로컬 런타임 생성 요청."""

    mode: str = "tagged"
    text: str = Field(..., min_length=1)
    language: str = "Auto"
    output_name: Optional[str] = None
    instruction: str = ""
    reference_audio_path: Optional[str] = None
    reference_text: Optional[str] = None
    reference_id: Optional[str] = None
    reference_ids: List[str] = Field(default_factory=list)
    temperature: float = 0.7
    top_p: float = 0.8
    max_new_tokens: int = 2048
    chunk_length: int = 300
    output_format: str = "wav"
    sample_rate: Optional[int] = 44100
    speed: float = 1.0
    volume: float = 0.0
    normalize: bool = True
    latency: str = "normal"
    repetition_penalty: float = 1.2
    min_chunk_length: int = 50
    condition_on_previous_chunks: bool = True
    early_stop_threshold: float = 1.0


class S2ProVoiceCreateRequest(BaseModel):
    """S2-Pro에서 계속 재사용할 reference voice 생성 요청."""

    name: str = Field(..., min_length=1)
    reference_audio_path: str = Field(..., min_length=1)
    reference_text: str = Field(..., min_length=1)
    language: str = "Auto"
    notes: str = ""
    create_qwen_prompt: bool = False
    qwen_model_id: Optional[str] = None


class S2ProVoiceRecord(BaseModel):
    """S2-Pro persistent reference voice와 Qwen 브릿지 정보를 담는 레코드."""

    id: str
    name: str
    reference_id: str
    reference_audio_path: str
    reference_audio_url: str
    reference_text: str
    language: str
    created_at: str
    notes: str = ""
    qwen_clone_prompt_id: Optional[str] = None
    qwen_clone_prompt_path: Optional[str] = None
    fish_reference_present: bool = False


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
    reference_text: Optional[str] = None
    x_vector_only_mode: bool = False


class ClonePromptRecord(BaseModel):
    """생성된 clone prompt 메타데이터 스키마다."""

    id: str
    source_type: str
    base_model: str
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

    model_id: Optional[str] = None
    text: str = Field(..., min_length=1)
    language: str = "Auto"
    output_name: Optional[str] = None
    seed: Optional[int] = None
    non_streaming_mode: Optional[bool] = None
    do_sample: Optional[bool] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    subtalker_dosample: Optional[bool] = None
    subtalker_top_k: Optional[int] = None
    subtalker_top_p: Optional[float] = None
    subtalker_temperature: Optional[float] = None
    max_new_tokens: Optional[int] = None
    extra_generate_kwargs: Dict[str, Any] = Field(default_factory=dict)


class DatasetSampleInput(BaseModel):
    """파인튜닝 데이터셋 구성에 사용할 샘플 입력 스키마다."""

    audio_path: str
    text: Optional[str] = None


class AudioTranscriptionRequest(BaseModel):
    """저장된 음성 파일을 Whisper로 전사하는 요청 스키마다."""

    audio_path: str


class AudioTranscriptionResponse(BaseModel):
    """Whisper 전사 결과를 담는 응답 스키마다."""

    audio_path: str
    text: str
    language: Optional[str] = None
    simulation: bool = False
    model_id: Optional[str] = None


class SoundEffectRequest(BaseModel):
    """텍스트 설명에서 로컬 procedural 효과음을 생성하는 요청 스키마다."""

    prompt: str = Field(..., min_length=1)
    model_profile: str = "mmaudio"
    duration_sec: float = Field(4.0, ge=0.5, le=15.0)
    intensity: float = Field(0.8, ge=0.1, le=1.5)
    seed: Optional[int] = None
    steps: Optional[int] = Field(None, ge=1, le=200)
    cfg_scale: Optional[float] = Field(None, ge=0.1, le=20.0)
    negative_prompt: str = ""


class VoiceChangerRequest(BaseModel):
    """RVC/Applio 기반 audio-to-audio 보이스 체인저 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    model_path: Optional[str] = None
    index_path: Optional[str] = None
    pitch_shift_semitones: float = 0.0
    f0_method: str = "rmvpe"
    index_rate: float = Field(0.3, ge=0.0, le=1.0)
    protect: float = Field(0.33, ge=0.0, le=0.5)
    split_audio: bool = False
    f0_autotune: bool = False
    clean_audio: bool = False
    clean_strength: float = Field(0.7, ge=0.0, le=1.0)
    embedder_model: str = "contentvec"


class RvcTrainingRequest(BaseModel):
    """Applio/RVC 목소리 모델 학습 요청 스키마다."""

    model_name: str = Field(..., min_length=1, max_length=80)
    dataset_path: str = Field(..., min_length=1)
    sample_rate: int = Field(40000)
    total_epoch: int = Field(100, ge=1, le=10000)
    batch_size: int = Field(4, ge=1, le=50)
    cpu_cores: int = Field(4, ge=1, le=64)
    gpu: str = "0"
    f0_method: str = "rmvpe"
    embedder_model: str = "contentvec"
    cut_preprocess: str = "Automatic"
    noise_reduction: bool = True
    clean_strength: float = Field(0.7, ge=0.0, le=1.0)
    chunk_len: float = Field(3.0, ge=0.5, le=5.0)
    overlap_len: float = Field(0.3, ge=0.0, le=0.4)
    index_algorithm: str = "Auto"
    checkpointing: bool = True


class RvcTrainingResponse(BaseModel):
    """Applio/RVC 학습 시작 또는 완료 결과."""

    status: str
    message: str
    model_name: str
    model_path: Optional[str] = None
    index_path: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class AudioConvertRequest(BaseModel):
    """오디오 포맷/샘플레이트 변환 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    output_format: str = "wav"
    sample_rate: int = Field(24000, ge=8000, le=96000)
    mono: bool = True


class AudioSeparationRequest(BaseModel):
    """AI stem separator 기반 오디오 분리 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    model_profile: str = "roformer_vocals"
    output_format: str = "wav"


class AudioTranslateRequest(BaseModel):
    """전사 기반 오디오 번역/재합성 보조 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    target_language: str = "English"
    translated_text: str = ""
    model_id: Optional[str] = None
    speaker: str = "Sohee"
    instruct: str = ""


class AudioToolAsset(BaseModel):
    """오디오 도구가 반환하는 결과 자산 스키마다."""

    label: str
    path: str
    url: str
    filename: str


class AudioToolResponse(BaseModel):
    """사운드 효과/보이스 체인저/오디오 툴 공통 응답 스키마다."""

    kind: str
    status: str
    message: str
    assets: List[AudioToolAsset] = Field(default_factory=list)
    transcript_text: Optional[str] = None
    translated_text: Optional[str] = None
    record: Optional[GenerationRecord] = None


class AudioToolCapability(BaseModel):
    """프런트엔드가 렌더링할 오디오 도구 기능 메타데이터."""

    key: str
    label: str
    description: str
    available: bool = True
    notes: str = ""


class VoiceChangerModelInfo(BaseModel):
    """보이스 체인저에서 선택할 수 있는 RVC 모델 메타데이터."""

    id: str
    label: str
    model_path: str
    index_path: Optional[str] = None


class AudioToolJob(BaseModel):
    """최근 실행된 오디오 도구 작업 이력 스키마다."""

    id: str
    kind: str
    status: str
    input_summary: str
    created_at: str
    artifacts: List[AudioToolAsset] = Field(default_factory=list)
    message: str = ""


class BootstrapResponse(BaseModel):
    """프런트엔드 초기 렌더에 필요한 공통 데이터 묶음."""

    health: HealthResponse
    models: List[ModelInfo]
    speakers: List[Dict[str, str]]
    gallery: List[GalleryItem] = Field(default_factory=list)
    audio_assets: List[AudioAsset]
    history: List[GenerationRecord]
    presets: List[CharacterPreset]
    datasets: List["FineTuneDataset"]
    finetune_runs: List["FineTuneRun"]
    audio_tool_capabilities: List[AudioToolCapability] = Field(default_factory=list)
    audio_tool_jobs: List[AudioToolJob] = Field(default_factory=list)
    voice_changer_models: List[VoiceChangerModelInfo] = Field(default_factory=list)


class GenerationDeleteBatchRequest(BaseModel):
    """생성 갤러리에서 여러 항목을 한 번에 삭제할 때 사용하는 요청 스키마다."""

    ids: List[str] = Field(default_factory=list)


class GenerationDeleteResponse(BaseModel):
    """생성 갤러리 삭제 결과를 돌려주는 응답 스키마다."""

    deleted_count: int


class FineTuneDatasetCreateRequest(BaseModel):
    """파인튜닝용 JSONL 데이터셋 생성 요청 스키마다."""

    name: str = Field(..., min_length=1)
    source_type: str
    speaker_name: str = Field(..., min_length=1)
    ref_audio_path: str
    samples: List[DatasetSampleInput]
    sample_folder_path: Optional[str] = None


class FineTuneDataset(BaseModel):
    """저장된 파인튜닝 데이터셋 메타데이터 스키마다."""

    id: str
    name: str
    source_type: str
    dataset_root_path: Optional[str] = None
    audio_dir_path: Optional[str] = None
    manifest_path: Optional[str] = None
    raw_jsonl_path: str
    prepared_jsonl_path: Optional[str] = None
    prepared_with_simulation: Optional[bool] = None
    prepared_tokenizer_model_path: Optional[str] = None
    prepared_device: Optional[str] = None
    ref_audio_path: str
    speaker_name: str
    sample_count: int
    created_at: str
    training_ready: bool = False
    status_label: str = ""
    next_step_label: str = ""


class PrepareDatasetRequest(BaseModel):
    """audio code 전처리 실행 요청 스키마다."""

    tokenizer_model_path: str = "Qwen/Qwen3-TTS-Tokenizer-12Hz"
    device: str = "cuda:0"
    simulate_only: bool = False


class FineTuneRunCreateRequest(BaseModel):
    """파인튜닝 실행 요청 스키마다."""

    dataset_id: str
    training_mode: str = "base"
    init_model_path: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    speaker_encoder_model_path: Optional[str] = None
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
    training_mode: str = "base"
    init_model_path: str
    speaker_encoder_model_path: Optional[str] = None
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
    final_checkpoint_path: Optional[str] = None
    selectable_model_path: Optional[str] = None
    is_selectable: bool = False
    stage_label: str = ""
    summary_label: str = ""
    model_family: Optional[str] = None
    speaker_encoder_included: bool = False
