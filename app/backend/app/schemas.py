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
    asr_provider: str = "qwen3-asr"
    default_asr_model: str = "Qwen/Qwen3-ASR-1.7B"


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
    image_url: Optional[str] = None


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
    """백엔드가 관리하는 S2-Pro 엔진/Provider 상태 응답."""

    available: bool
    notes: str = ""
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
    runtime_mode: str = "local"
    api_key_configured: bool = False
    available_runtimes: List[str] = Field(default_factory=list)
    managed_server: bool = False
    auto_start: bool = True
    features: List[str] = Field(default_factory=list)


class S2ProGenerateRequest(BaseModel):
    """Fish Speech local / Fish Audio API S2-Pro 생성 요청."""

    mode: str = "tagged"
    runtime_source: str = "auto"
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
    runtime_source: str = "auto"
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
    runtime_source: str = "local"
    qwen_clone_prompt_id: Optional[str] = None
    qwen_clone_prompt_path: Optional[str] = None
    fish_reference_present: bool = False
    image_url: Optional[str] = None


class S2ProTrainingRequest(BaseModel):
    """Fish Speech S2-Pro LoRA/full fine-tuning 요청."""

    output_name: str = Field("my-s2pro-voice", min_length=1, max_length=120)
    training_type: str = Field("lora", pattern="^(lora|full)$")
    source_type: str = Field("protos", pattern="^(protos|lab_audio_dir)$")
    proto_dir: str = ""
    lab_audio_dir: str = ""
    pretrained_ckpt_path: Optional[str] = None
    lora_config: str = "r_8_alpha_16"
    merge_lora: bool = True
    max_steps: int = Field(10000, ge=1, le=1000000)
    val_check_interval: int = Field(100, ge=1, le=1000000)
    batch_size: int = Field(4, ge=1, le=128)
    accumulate_grad_batches: int = Field(1, ge=1, le=128)
    learning_rate: float = Field(1e-4, gt=0.0, le=1.0)
    num_workers: int = Field(4, ge=0, le=64)
    precision: str = "bf16-true"
    accelerator: str = "gpu"
    devices: str = "auto"
    strategy_backend: str = "nccl"
    codec_checkpoint_path: Optional[str] = None
    vq_batch_size: int = Field(16, ge=1, le=256)
    vq_num_workers: int = Field(1, ge=0, le=64)


class S2ProTrainingResponse(BaseModel):
    """Fish Speech S2-Pro fine-tuning 실행 결과."""

    status: str
    message: str
    run_id: str
    output_name: str
    training_type: str
    run_dir: str
    result_dir: str
    log_path: str
    final_checkpoint_path: Optional[str] = None
    merged_model_path: Optional[str] = None
    command: List[str] = Field(default_factory=list)
    preprocess_commands: List[List[str]] = Field(default_factory=list)
    merge_command: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


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


class CharacterPresetUpdateRequest(BaseModel):
    """저장된 캐릭터 프리셋의 표시 정보를 수정하는 요청."""

    name: Optional[str] = None
    notes: Optional[str] = None


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
    image_url: Optional[str] = None


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


class AudioDatasetBuildRequest(BaseModel):
    """모델별 학습 탭에 넘길 raw/prepared 오디오 데이터셋 생성 요청."""

    name: str = Field(..., min_length=1)
    target: str = Field(..., pattern="^(s2_pro|vibevoice|rvc|mmaudio|ace_step)$")
    source_type: str = Field("gallery", pattern="^(gallery|folder)$")
    samples: List[DatasetSampleInput] = Field(default_factory=list)
    sample_folder_path: Optional[str] = None
    ref_audio_path: Optional[str] = None
    transcribe: bool = True
    asr_model_id: Optional[str] = None


class AudioDatasetBuildResponse(BaseModel):
    """모델별 raw/prepared 데이터셋 생성 결과."""

    id: str
    name: str
    target: str
    dataset_root_path: str
    audio_dir_path: str
    lab_audio_dir_path: Optional[str] = None
    train_jsonl_path: Optional[str] = None
    validation_jsonl_path: Optional[str] = None
    dataset_json_path: Optional[str] = None
    manifest_path: str
    sample_count: int
    message: str


class AudioDatasetRecord(AudioDatasetBuildResponse):
    """프런트엔드가 학습 탭에서 다시 선택할 수 있는 모델별 데이터셋 레코드."""

    source_type: str = "gallery"
    reference_audio_path: Optional[str] = None
    created_at: Optional[str] = None


class AudioTranscriptionRequest(BaseModel):
    """저장된 음성 파일을 Qwen3-ASR로 전사하는 요청 스키마."""

    audio_path: str
    model_id: Optional[str] = None


class AudioTranscriptionResponse(BaseModel):
    """ASR 전사 결과를 담는 응답 스키마."""

    audio_path: str
    text: str
    language: Optional[str] = None
    simulation: bool = False
    model_id: Optional[str] = None
    provider: str = "qwen3-asr"


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


class AceStepLoraRef(BaseModel):
    """ACE-Step LoRA 어댑터 참조."""

    path: str = Field(..., min_length=1)
    adapter_name: Optional[str] = None
    scale: Optional[float] = Field(None, ge=0.0, le=2.0)


class AceStepGenerateBaseRequest(BaseModel):
    """ACE-Step 1.5 공통 입력 스키마.

    각 task별 엔드포인트가 이 스키마를 상속해 추가 필드를 더한다.
    """

    output_name: str = "ace-step-track"
    caption: str = Field("", max_length=12000)
    prompt: Optional[str] = Field(None, max_length=12000)
    lyrics: str = Field("", max_length=24000)
    instrumental: bool = False
    duration: float = Field(60.0, ge=-1.0, le=600.0)
    bpm: Optional[int] = Field(None, ge=20, le=300)
    keyscale: str = ""
    timesignature: str = ""
    vocal_language: str = "unknown"
    inference_steps: int = Field(8, ge=1, le=200)
    guidance_scale: float = Field(7.0, ge=0.1, le=50.0)
    seeds: str = ""
    use_random_seed: bool = True
    batch_size: int = Field(1, ge=1, le=4)
    audio_format: str = Field("wav", pattern="^(wav|wav32|flac|mp3|opus|aac|ogg)$")

    # Model selection
    config_path: Optional[str] = None
    lm_model_path: Optional[str] = None
    lm_backend: Optional[str] = None
    device: str = "auto"
    cpu_offload: bool = False
    offload_dit_to_cpu: bool = False
    compile_model: bool = False
    quantization: Optional[str] = None
    vae_checkpoint: Optional[str] = None

    # CFG / sampler
    use_adg: bool = False
    cfg_interval_start: float = Field(0.0, ge=0.0, le=1.0)
    cfg_interval_end: float = Field(1.0, ge=0.0, le=1.0)
    shift: float = Field(1.0, ge=0.0, le=20.0)
    infer_method: str = Field("ode", pattern="^(ode|sde)$")
    sampler_mode: str = Field("euler", pattern="^(euler|heun|pingpong)$")

    # 5Hz LM CoT
    thinking: bool = True
    lm_temperature: float = Field(0.85, ge=0.0, le=2.0)
    lm_cfg_scale: float = Field(2.0, ge=0.0, le=20.0)
    lm_top_k: int = Field(0, ge=0, le=200)
    lm_top_p: float = Field(0.9, ge=0.0, le=1.0)
    lm_negative_prompt: str = "NO USER INPUT"
    use_cot_metas: bool = True
    use_cot_caption: bool = True
    use_cot_lyrics: bool = False
    use_cot_language: bool = True
    use_constrained_decoding: bool = True

    # Audio post processing
    enable_normalization: bool = True
    normalization_db: float = Field(-1.0, ge=-30.0, le=0.0)
    fade_in_duration: float = Field(0.0, ge=0.0, le=10.0)
    fade_out_duration: float = Field(0.0, ge=0.0, le=10.0)

    loras: List[AceStepLoraRef] = Field(default_factory=list)


class MusicCompositionRequest(AceStepGenerateBaseRequest):
    """ACE-Step text2music 요청."""

    audio_duration: Optional[float] = Field(None, ge=-1.0, le=600.0)
    infer_step: Optional[int] = Field(None, ge=1, le=200)
    scheduler_type: str = "euler"
    cfg_type: str = "apg"
    omega_scale: float = Field(10.0, ge=0.0, le=50.0)
    manual_seeds: str = "42"
    guidance_interval: float = Field(0.5, ge=0.0, le=1.0)
    guidance_interval_decay: float = Field(0.0, ge=0.0, le=1.0)
    min_guidance_scale: float = Field(3.0, ge=0.0, le=50.0)
    use_erg_tag: bool = True
    use_erg_lyric: bool = True
    use_erg_diffusion: bool = False
    oss_steps: str = ""
    guidance_scale_text: float = Field(0.0, ge=0.0, le=50.0)
    guidance_scale_lyric: float = Field(0.0, ge=0.0, le=50.0)
    bf16: bool = True
    torch_compile: bool = False
    overlapped_decode: bool = False
    device_id: int = Field(0, ge=0)


class AceStepCoverRequest(AceStepGenerateBaseRequest):
    """Cover / style transfer 요청 (src_audio 필수)."""

    src_audio: str = Field(..., min_length=1)
    audio_cover_strength: float = Field(1.0, ge=0.0, le=1.0)
    cover_noise_strength: float = Field(0.0, ge=0.0, le=1.0)


class AceStepRepaintRequest(AceStepGenerateBaseRequest):
    """Repaint 요청. ``[start, end)`` 구간만 다시 그린다."""

    src_audio: str = Field(..., min_length=1)
    repainting_start: float = Field(0.0, ge=0.0)
    repainting_end: float = Field(-1.0, ge=-1.0)
    repaint_mode: str = Field("balanced", pattern="^(conservative|balanced|aggressive)$")
    repaint_strength: float = Field(0.5, ge=0.0, le=1.0)
    repaint_latent_crossfade_frames: int = Field(10, ge=0, le=120)
    repaint_wav_crossfade_sec: float = Field(0.0, ge=0.0, le=5.0)
    chunk_mask_mode: str = Field("auto", pattern="^(auto|explicit)$")


class AceStepExtendRequest(AceStepGenerateBaseRequest):
    """Extend / continuation 요청. ACE-Step의 ``complete`` task로 라우팅된다."""

    src_audio: str = Field(..., min_length=1)
    complete_tracks: str = "vocals,drums,bass,guitar"


class AceStepExtractRequest(AceStepGenerateBaseRequest):
    """단일 트랙 stem 추출."""

    src_audio: str = Field(..., min_length=1)
    extract_track: str = Field("vocals", min_length=1)


class AceStepLegoRequest(AceStepGenerateBaseRequest):
    """기존 트랙 위에 한 가지 새 트랙 레이어를 만든다."""

    src_audio: str = Field(..., min_length=1)
    lego_track: str = Field("vocals", min_length=1)


class AceStepCompleteRequest(AceStepGenerateBaseRequest):
    """누락된 다중 트랙을 한 번에 채워 넣는다."""

    src_audio: str = Field(..., min_length=1)
    complete_tracks: str = "vocals,drums,bass,guitar"


class AceStepUnderstandRequest(BaseModel):
    """오디오에서 BPM/캡션/가사를 추출하는 LM 전용 요청."""

    output_name: str = "ace-step-understand"
    src_audio: str = Field(..., min_length=1)
    audio_codes: str = ""
    config_path: Optional[str] = None
    lm_model_path: Optional[str] = None
    lm_backend: Optional[str] = None
    device: str = "auto"
    cpu_offload: bool = False
    lm_temperature: float = Field(0.85, ge=0.0, le=2.0)
    lm_top_k: int = Field(0, ge=0, le=200)
    lm_top_p: float = Field(0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(1.0, ge=0.5, le=2.0)
    use_constrained_decoding: bool = True


class AceStepCreateSampleRequest(BaseModel):
    """자연어 한 줄로 캡션/가사/BPM 등을 생성한다."""

    output_name: str = "ace-step-sample"
    query: str = Field(..., min_length=1)
    instrumental: bool = False
    vocal_language: Optional[str] = None
    config_path: Optional[str] = None
    lm_model_path: Optional[str] = None
    lm_backend: Optional[str] = None
    device: str = "auto"
    cpu_offload: bool = False
    lm_temperature: float = Field(0.85, ge=0.0, le=2.0)
    lm_top_k: int = Field(0, ge=0, le=200)
    lm_top_p: float = Field(0.9, ge=0.0, le=1.0)


class AceStepFormatSampleRequest(BaseModel):
    """사용자가 적은 caption/lyrics를 정리한다."""

    output_name: str = "ace-step-format"
    caption: str = ""
    lyrics: str = ""
    bpm: Optional[int] = Field(None, ge=20, le=300)
    duration: Optional[float] = Field(None, ge=0.0, le=600.0)
    keyscale: str = ""
    timesignature: str = ""
    vocal_language: Optional[str] = None
    config_path: Optional[str] = None
    lm_model_path: Optional[str] = None
    lm_backend: Optional[str] = None
    device: str = "auto"
    cpu_offload: bool = False
    lm_temperature: float = Field(0.85, ge=0.0, le=2.0)
    lm_top_k: int = Field(0, ge=0, le=200)
    lm_top_p: float = Field(0.9, ge=0.0, le=1.0)


class AceStepTrainingRequest(BaseModel):
    """ACE-Step LoRA/LoKr adapter 학습 요청."""

    output_name: str = Field("my-ace-step-adapter", min_length=1, max_length=120)
    adapter_type: str = Field("lora", pattern="^(lora|lokr)$")
    trainer_mode: str = Field("fixed", pattern="^(fixed|vanilla)$")
    source_type: str = Field("tensors", pattern="^(tensors|audio_dir|dataset_json)$")
    tensor_dir: str = ""
    audio_dir: str = ""
    dataset_json: str = ""
    checkpoint_dir: Optional[str] = None
    model_variant: str = "turbo"
    base_model: Optional[str] = None
    device: str = "auto"
    precision: str = "auto"
    max_duration: float = Field(240.0, ge=1.0, le=1200.0)
    learning_rate: float = Field(1e-4, gt=0.0, le=1.0)
    batch_size: int = Field(1, ge=1, le=16)
    gradient_accumulation: int = Field(4, ge=1, le=128)
    epochs: int = Field(100, ge=1, le=10000)
    save_every: int = Field(10, ge=1, le=10000)
    seed: int = Field(42, ge=0)
    num_workers: int = Field(4, ge=0, le=64)
    gradient_checkpointing: bool = True
    rank: int = Field(64, ge=1, le=512)
    alpha: int = Field(128, ge=1, le=1024)
    dropout: float = Field(0.1, ge=0.0, le=1.0)
    lokr_linear_dim: int = Field(64, ge=1, le=512)
    lokr_linear_alpha: int = Field(128, ge=1, le=1024)
    lokr_factor: int = Field(-1, ge=-1, le=64)
    lokr_decompose_both: bool = False
    lokr_use_tucker: bool = False
    lokr_use_scalar: bool = False
    lokr_weight_decompose: bool = True


class AceStepTrainingResponse(BaseModel):
    """ACE-Step LoRA/LoKr adapter 학습 결과."""

    status: str
    message: str
    run_id: str
    adapter_type: str
    trainer_mode: str
    tensor_dir: str
    output_dir: str
    final_adapter_path: Optional[str] = None
    log_path: str
    command: List[str] = Field(default_factory=list)
    preprocess_command: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class AceStepRuntimeResponse(BaseModel):
    """ACE-Step 런타임/모델/LoRA 상태 응답."""

    available: bool
    notes: str
    ace_step_root: str
    python_executable: str
    checkpoint_path: str
    lora_dir: str
    model_variants: List[Dict[str, Any]] = Field(default_factory=list)
    lm_models: List[Dict[str, Any]] = Field(default_factory=list)
    lora_adapters: List[Dict[str, Any]] = Field(default_factory=list)
    track_names: List[str] = Field(default_factory=list)
    supported_tasks: List[str] = Field(default_factory=list)


class AceStepUnderstandResponse(BaseModel):
    """understand_music / create_sample / format_sample 공통 응답."""

    success: bool
    task: str
    caption: str = ""
    lyrics: str = ""
    bpm: Optional[int] = None
    duration: Optional[float] = None
    keyscale: str = ""
    language: str = ""
    timesignature: str = ""
    instrumental: Optional[bool] = None
    status_message: str = ""
    error: Optional[str] = None
    raw_meta: Dict[str, Any] = Field(default_factory=dict)


class VoiceChangerRequest(BaseModel):
    """Applio/RVC 기반 audio-to-audio 단일 변환 요청 스키마다."""

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


class VoiceChangerBatchRequest(BaseModel):
    """여러 오디오를 같은 Applio/RVC 모델로 일괄 변환하는 요청."""

    audio_paths: List[str] = Field(default_factory=list)
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


class VoiceModelBlendRequest(BaseModel):
    """두 Applio/RVC 모델을 비율로 섞어 새 모델을 만드는 요청."""

    model_name: str = Field(..., min_length=1, max_length=80)
    model_path_a: str = Field(..., min_length=1)
    model_path_b: str = Field(..., min_length=1)
    ratio: float = Field(0.5, ge=0.0, le=1.0)


class RvcTrainingRequest(BaseModel):
    """Applio/RVC 목소리 모델 학습 요청 스키마다."""

    model_name: str = Field(..., min_length=1, max_length=80)
    dataset_path: str = ""
    audio_paths: List[str] = Field(default_factory=list)
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


class MMAudioTrainingRequest(BaseModel):
    """MMAudio full/continued training 요청."""

    output_name: str = Field("my-mmaudio-run", min_length=1, max_length=120)
    model: str = "small_16k"
    weights_path: str = ""
    checkpoint_path: str = ""
    data_mode: str = Field("configured", pattern="^(configured|example)$")
    nproc_per_node: int = Field(1, ge=1, le=16)
    num_iterations: int = Field(10000, ge=1, le=1000000)
    batch_size: int = Field(1, ge=1, le=2048)
    learning_rate: float = Field(1e-4, gt=0.0, le=1.0)
    compile: bool = False
    debug: bool = False
    save_weights_interval: int = Field(1000, ge=1, le=1000000)
    save_checkpoint_interval: int = Field(1000, ge=1, le=1000000)
    ema_checkpoint_interval: int = Field(5000, ge=1, le=1000000)
    val_interval: int = Field(5000, ge=1, le=1000000)
    eval_interval: int = Field(20000, ge=1, le=1000000)
    run_final_sample: bool = False


class MMAudioTrainingResponse(BaseModel):
    """MMAudio training 실행 결과."""

    status: str
    message: str
    run_id: str
    output_name: str
    run_dir: str
    log_path: str
    final_weights_path: Optional[str] = None
    command: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class VibeVoiceRuntimeResponse(BaseModel):
    """VibeVoice vendor runtime 상태."""

    available: bool = False
    repo_root: str
    model_root: str
    python_executable: str
    repo_ready: bool = False
    asr_ready: bool = False
    realtime_tts_ready: bool = False
    longform_tts_ready: bool = False
    large_tts_ready: bool = False
    asr_model: str
    realtime_tts_model: str
    longform_tts_model: str
    large_tts_model: str
    tts_entrypoints: List[str] = Field(default_factory=list)
    features: List[str] = Field(default_factory=list)
    notes: str = ""


class VibeVoiceTTSRequest(BaseModel):
    """VibeVoice TTS 생성 요청."""

    text: str = Field(..., min_length=1)
    output_name: Optional[str] = None
    model_profile: str = Field("realtime", pattern="^(realtime|tts_15b|1\\.5b|longform|tts_7b|7b|large)$")
    speaker_name: str = "Speaker 1"
    speaker_audio_path: Optional[str] = None
    speaker_names: List[str] = Field(default_factory=list)
    speaker_audio_paths: List[str] = Field(default_factory=list)
    checkpoint_path: str = ""
    cfg_scale: float = Field(1.3, ge=0.0, le=20.0)
    ddpm_steps: int = Field(5, ge=1, le=200)
    seed: Optional[int] = None
    device: str = "auto"
    attn_implementation: str = "auto"
    inference_steps: int = Field(10, ge=1, le=200)
    max_length_times: float = Field(2.0, ge=0.1, le=20.0)
    disable_prefill: bool = False
    show_progress: bool = False
    max_new_tokens: int = Field(2048, ge=1, le=32768)
    output_format: str = "wav"
    extra_args: List[str] = Field(default_factory=list)


class VibeVoiceASRRequest(BaseModel):
    """VibeVoice-ASR 전사 요청."""

    audio_path: str = ""
    audio_dir: str = ""
    dataset: str = ""
    split: str = "test"
    max_duration: float = Field(3600.0, gt=0.0)
    language: str = "auto"
    task: str = "transcribe"
    context_info: str = ""
    device: str = "auto"
    precision: str = "auto"
    attn_implementation: str = "auto"
    batch_size: int = Field(2, ge=1, le=64)
    max_new_tokens: int = Field(256, ge=1, le=4096)
    temperature: float = Field(0.0, ge=0.0, le=2.0)
    top_p: float = Field(1.0, ge=0.0, le=1.0)
    num_beams: int = Field(1, ge=1, le=16)
    return_timestamps: bool = False


class VibeVoiceASRResponse(BaseModel):
    """VibeVoice-ASR 전사 결과."""

    audio_path: str
    text: str
    language: Optional[str] = None
    model_id: str = "vibevoice/asr"
    provider: str = "vibevoice"
    segments: List[Dict[str, Any]] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class VibeVoiceTrainingRequest(BaseModel):
    """VibeVoice fine-tuning 실행 요청."""

    training_mode: str = Field("tts_lora", pattern="^(asr_lora|tts_lora)$")
    output_name: str = Field("vibevoice-lora", min_length=1, max_length=120)
    model_path: str = ""
    data_dir: str = Field(..., min_length=1)
    output_dir: str = ""
    dataset_config_name: str = ""
    train_split_name: str = "train"
    eval_split_name: str = "validation"
    text_column_name: str = "text"
    audio_column_name: str = "audio"
    voice_prompts_column_name: str = "voice_prompts"
    train_jsonl: str = ""
    validation_jsonl: str = ""
    eval_split_size: float = Field(0.0, ge=0.0, le=1.0)
    ignore_verifications: bool = False
    max_length: Optional[int] = Field(default=None, gt=0)
    nproc_per_node: int = Field(1, ge=1, le=16)
    num_train_epochs: float = Field(3.0, gt=0.0, le=1000.0)
    per_device_train_batch_size: int = Field(1, ge=1, le=128)
    gradient_accumulation_steps: int = Field(4, ge=1, le=1024)
    learning_rate: float = Field(1e-4, gt=0.0, le=1.0)
    warmup_ratio: float = Field(0.1, ge=0.0, le=1.0)
    weight_decay: float = Field(0.01, ge=0.0, le=1.0)
    max_grad_norm: float = Field(1.0, ge=0.0, le=1000.0)
    logging_steps: int = Field(10, ge=1, le=1000000)
    save_steps: int = Field(100, ge=1, le=1000000)
    lora_r: int = Field(16, ge=1, le=1024)
    lora_alpha: int = Field(32, ge=1, le=4096)
    lora_dropout: float = Field(0.05, ge=0.0, le=1.0)
    lora_target_modules: str = "q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj"
    lora_wrap_diffusion_head: bool = False
    train_diffusion_head: bool = True
    train_connectors: bool = False
    layers_to_freeze: str = ""
    ddpm_batch_mul: int = Field(4, ge=1, le=1024)
    ce_loss_weight: float = Field(0.04, ge=0.0, le=1000.0)
    diffusion_loss_weight: float = Field(1.4, ge=0.0, le=1000.0)
    debug_save: bool = False
    debug_ce_details: bool = False
    bf16: bool = True
    gradient_checkpointing: bool = True
    use_customized_context: bool = True
    max_audio_length: Optional[float] = Field(default=None, gt=0.0)
    report_to: str = "none"
    extra_args: List[str] = Field(default_factory=list)


class VibeVoiceTrainingResponse(BaseModel):
    """VibeVoice fine-tuning 실행 결과."""

    status: str
    message: str
    run_id: str
    output_name: str
    run_dir: str
    log_path: str
    adapter_path: Optional[str] = None
    command: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class VibeVoiceModelToolRequest(BaseModel):
    """VibeVoice 모델 병합/변환 유틸리티 요청."""

    tool: str = Field("merge", pattern="^(merge|verify_merge|convert_nnscaler)$")
    base_model_path: str = ""
    checkpoint_path: str = ""
    output_path: str = Field(..., min_length=1)
    output_format: str = Field("safetensors", pattern="^(safetensors|bin)$")
    nnscaler_checkpoint_path: str = ""
    config_path: str = ""


class VibeVoiceModelToolResponse(BaseModel):
    """VibeVoice 모델 유틸리티 실행 결과."""

    status: str
    message: str
    run_id: str
    run_dir: str
    log_path: str
    output_path: str
    command: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class VibeVoiceModelAsset(BaseModel):
    """VibeVoice 도구에서 선택할 수 있는 로컬 모델/어댑터 자산."""

    id: str
    name: str
    kind: str
    path: str
    created_at: Optional[str] = None
    notes: str = ""


class AudioConvertRequest(BaseModel):
    """오디오 포맷/샘플레이트 변환 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    output_format: str = "wav"
    sample_rate: int = Field(24000, ge=8000, le=96000)
    mono: bool = True


class AudioEditRequest(BaseModel):
    """오디오 구간 편집과 기본 마스터링 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    output_name: Optional[str] = None
    start_sec: float = Field(0.0, ge=0.0)
    end_sec: Optional[float] = Field(default=None, gt=0.0)
    gain_db: float = Field(0.0, ge=-48.0, le=24.0)
    fade_in_sec: float = Field(0.0, ge=0.0, le=30.0)
    fade_out_sec: float = Field(0.0, ge=0.0, le=30.0)
    normalize: bool = True
    reverse: bool = False
    output_format: str = "wav"
    sample_rate: int = Field(44100, ge=8000, le=96000)


class AudioDenoiseRequest(BaseModel):
    """음성 노이즈 제거와 기본 정제 요청 스키마다."""

    audio_path: str = Field(..., min_length=1)
    output_name: Optional[str] = None
    strength: float = Field(0.55, ge=0.0, le=1.0)
    noise_profile_sec: float = Field(0.6, ge=0.05, le=5.0)
    spectral_floor: float = Field(0.08, ge=0.0, le=0.5)
    highpass_hz: float = Field(70.0, ge=0.0, le=1000.0)
    lowpass_hz: float = Field(16000.0, ge=1000.0, le=48000.0)
    voice_presence: float = Field(0.35, ge=0.0, le=1.0)
    normalize: bool = True
    output_format: str = "wav"
    sample_rate: int = Field(44100, ge=8000, le=96000)


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
    """사운드 효과/Applio/오디오 툴 공통 응답 스키마다."""

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
    """Applio 변환에서 선택할 수 있는 RVC 모델 메타데이터."""

    id: str
    label: str
    model_path: str
    index_path: Optional[str] = None
    image_url: Optional[str] = None


class VoiceImageUploadResponse(BaseModel):
    """음성 자산에 부착된 이미지 업로드 결과."""

    kind: str
    asset_id: str
    image_url: str


class VoiceAssetDeleteResponse(BaseModel):
    """프리셋 또는 모델 삭제 응답."""

    kind: str
    asset_id: str
    deleted: bool = True
    removed_files: int = 0


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
    clone_prompts: List[ClonePromptRecord] = Field(default_factory=list)
    presets: List[CharacterPreset]
    datasets: List["FineTuneDataset"]
    audio_datasets: List[AudioDatasetRecord] = Field(default_factory=list)
    finetune_runs: List["FineTuneRun"]
    audio_tool_capabilities: List[AudioToolCapability] = Field(default_factory=list)
    audio_tool_jobs: List[AudioToolJob] = Field(default_factory=list)
    voice_changer_models: List[VoiceChangerModelInfo] = Field(default_factory=list)
    asr_models: List[Dict[str, str]] = Field(default_factory=list)


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


class FineTuneRunUpdateRequest(BaseModel):
    """파인튜닝 결과 모델의 라이브러리 표시명을 수정하는 요청."""

    display_name: Optional[str] = None


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
    output_name: Optional[str] = None
    display_name: Optional[str] = None
    model_family: Optional[str] = None
    speaker_encoder_included: bool = False
