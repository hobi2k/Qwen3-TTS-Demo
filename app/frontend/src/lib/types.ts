export interface HealthResponse {
  status: string;
  simulation_mode: boolean;
  runtime_mode: string;
  qwen_tts_available: boolean;
  device: string;
  attention_implementation: string;
  recommended_instruction_language: string;
  data_dir: string;
}

export interface ModelInfo {
  key: string;
  category: string;
  label: string;
  model_id: string;
  supports_instruction: boolean;
  notes: string;
  recommended: boolean;
  inference_mode?: string | null;
  source: string;
  available_speakers: string[];
  default_speaker?: string | null;
  model_family?: string | null;
  speaker_encoder_included?: boolean;
}

export interface SpeakerInfo {
  speaker: string;
  nativeLanguage: string;
  description: string;
}

export interface UploadResponse {
  id: string;
  path: string;
  url: string;
  filename: string;
}

export interface AudioAsset {
  id: string;
  path: string;
  url: string;
  filename: string;
  source: string;
  created_at?: string | null;
  text_preview?: string | null;
  transcript_text?: string | null;
}

export interface GenerationRecord {
  id: string;
  mode: string;
  input_text: string;
  language: string;
  speaker?: string | null;
  instruction?: string | null;
  preset_id?: string | null;
  output_audio_path: string;
  output_audio_url: string;
  source_ref_audio_path?: string | null;
  source_ref_text?: string | null;
  created_at: string;
  meta: Record<string, unknown>;
}

export interface GenerationResponse {
  record: GenerationRecord;
}

export interface GenerationDeleteResponse {
  deleted_count: number;
}

export interface ClonePromptRecord {
  id: string;
  source_type: string;
  base_model: string;
  prompt_path: string;
  reference_audio_path: string;
  reference_text: string;
  x_vector_only_mode: boolean;
  created_at: string;
  meta: Record<string, unknown>;
}

export interface GenerationRequestExtras {
  output_name?: string;
  model_id?: string;
  seed?: number;
  non_streaming_mode?: boolean;
  do_sample?: boolean;
  top_k?: number;
  top_p?: number;
  temperature?: number;
  repetition_penalty?: number;
  subtalker_dosample?: boolean;
  subtalker_top_k?: number;
  subtalker_top_p?: number;
  subtalker_temperature?: number;
  max_new_tokens?: number;
  extra_generate_kwargs?: Record<string, unknown>;
}

export interface CharacterPreset {
  id: string;
  name: string;
  source_type: string;
  base_model: string;
  language: string;
  reference_text: string;
  reference_audio_path: string;
  clone_prompt_path: string;
  created_at: string;
  notes: string;
}

export interface FineTuneDataset {
  id: string;
  name: string;
  source_type: string;
  dataset_root_path?: string | null;
  audio_dir_path?: string | null;
  manifest_path?: string | null;
  raw_jsonl_path: string;
  prepared_jsonl_path?: string | null;
  ref_audio_path: string;
  speaker_name: string;
  sample_count: number;
  created_at: string;
}

export interface FineTuneRun {
  id: string;
  dataset_id: string;
  training_mode: string;
  init_model_path: string;
  speaker_encoder_model_path?: string | null;
  output_model_path: string;
  final_checkpoint_path?: string | null;
  batch_size: number;
  lr: number;
  num_epochs: number;
  speaker_name: string;
  status: string;
  created_at: string;
  finished_at?: string | null;
  log_path?: string | null;
  command?: string[] | null;
}

export interface AudioToolCapability {
  key: string;
  label: string;
  description: string;
  available: boolean;
  notes: string;
}

export interface VoiceChangerModelInfo {
  id: string;
  label: string;
  model_path: string;
  index_path?: string | null;
}

export interface AudioToolAsset {
  label: string;
  path: string;
  url: string;
  filename: string;
}

export interface AudioToolJob {
  id: string;
  kind: string;
  status: string;
  input_summary: string;
  created_at: string;
  artifacts: AudioToolAsset[];
  message: string;
}

export interface BootstrapResponse {
  health: HealthResponse;
  models: ModelInfo[];
  speakers: SpeakerInfo[];
  gallery?: unknown[];
  audio_assets: AudioAsset[];
  history: GenerationRecord[];
  clone_prompts: ClonePromptRecord[];
  presets: CharacterPreset[];
  datasets: FineTuneDataset[];
  finetune_runs: FineTuneRun[];
  audio_tool_capabilities: AudioToolCapability[];
  audio_tool_jobs: AudioToolJob[];
  voice_changer_models: VoiceChangerModelInfo[];
}

export interface CloneFromSampleRequest {
  generation_id: string;
  model_id?: string;
  x_vector_only_mode?: boolean;
}

export interface CloneFromUploadRequest {
  model_id?: string;
  reference_audio_path: string;
  reference_text?: string;
  x_vector_only_mode?: boolean;
}

export interface CreatePresetRequest {
  name: string;
  source_type: string;
  language: string;
  base_model: string;
  reference_text: string;
  reference_audio_path: string;
  clone_prompt_path: string;
  notes: string;
}

export interface DatasetSampleInput {
  audio_path: string;
  text?: string;
}

export interface AudioTranscriptionResponse {
  audio_path: string;
  text: string;
  language?: string | null;
  simulation: boolean;
  model_id?: string | null;
}

export interface CreateDatasetRequest {
  name: string;
  source_type: string;
  speaker_name: string;
  ref_audio_path: string;
  samples: DatasetSampleInput[];
  sample_folder_path?: string;
}

export interface PrepareDatasetRequest {
  tokenizer_model_path: string;
  device: string;
  simulate_only: boolean;
}

export interface CreateFineTuneRunRequest {
  dataset_id: string;
  training_mode: string;
  init_model_path: string;
  speaker_encoder_model_path?: string;
  output_name: string;
  batch_size: number;
  lr: number;
  num_epochs: number;
  speaker_name: string;
  device?: string;
  simulate_only: boolean;
}

export interface VoiceBoxFusionRequest {
  input_checkpoint_path: string;
  speaker_encoder_source_path: string;
  output_name: string;
}

export interface VoiceBoxCloneRequest extends GenerationRequestExtras {
  model_id: string;
  output_name?: string;
  text: string;
  language: string;
  ref_audio_path: string;
  ref_text?: string;
  instruct?: string;
  speaker: string;
  strategy?: string;
}

export interface S2ProRuntimeResponse {
  available: boolean;
  server_running: boolean;
  source: string;
  endpoint_url: string;
  server_url: string;
  model: string;
  repo_root: string;
  model_dir: string;
  api_server_path: string;
  codec_path: string;
  repo_ready: boolean;
  model_ready: boolean;
  missing_model_files: string[];
  server_error: string;
  runtime_mode: "local" | "api";
  api_key_configured: boolean;
  available_runtimes: Array<"local" | "api">;
  features: string[];
}

export interface S2ProGenerateRequest {
  mode: "tagged" | "clone" | "multi_speaker" | "multilingual";
  runtime_source?: "auto" | "local" | "api";
  text: string;
  language: string;
  output_name?: string;
  instruction?: string;
  reference_audio_path?: string;
  reference_text?: string;
  reference_id?: string;
  reference_ids?: string[];
  temperature?: number;
  top_p?: number;
  max_new_tokens?: number;
  chunk_length?: number;
  output_format?: string;
  sample_rate?: number | null;
  speed?: number;
  volume?: number;
  normalize?: boolean;
  latency?: string;
  repetition_penalty?: number;
  min_chunk_length?: number;
  condition_on_previous_chunks?: boolean;
  early_stop_threshold?: number;
}

export interface S2ProVoiceRecord {
  id: string;
  name: string;
  reference_id: string;
  reference_audio_path: string;
  reference_audio_url: string;
  reference_text: string;
  language: string;
  created_at: string;
  notes: string;
  runtime_source: "local" | "api";
  qwen_clone_prompt_id?: string | null;
  qwen_clone_prompt_path?: string | null;
  fish_reference_present: boolean;
}

export interface S2ProVoiceCreateRequest {
  name: string;
  runtime_source?: "auto" | "local" | "api";
  reference_audio_path: string;
  reference_text: string;
  language: string;
  notes?: string;
  create_qwen_prompt?: boolean;
  qwen_model_id?: string;
}

export interface CustomVoiceRequest extends GenerationRequestExtras {
  text: string;
  language: string;
  speaker: string;
  instruct: string;
}

export interface VoiceDesignRequest extends GenerationRequestExtras {
  text: string;
  language: string;
  instruct: string;
}

export interface UniversalInferenceRequest extends GenerationRequestExtras {
  model_id: string;
  text: string;
  language: string;
  speaker?: string;
  instruct: string;
  ref_audio_path?: string;
  ref_text?: string;
  voice_clone_prompt_path?: string;
  x_vector_only_mode?: boolean;
}

export interface HybridCloneInstructRequest extends GenerationRequestExtras {
  base_model_id: string;
  custom_model_id: string;
  text: string;
  language: string;
  instruct: string;
  ref_audio_path: string;
  ref_text?: string;
  x_vector_only_mode?: boolean;
}

export interface GenerateFromPresetRequest extends GenerationRequestExtras {
  model_id?: string;
  text: string;
  language: string;
}

export interface SoundEffectRequest {
  prompt: string;
  model_profile: string;
  duration_sec: number;
  intensity: number;
  seed?: number;
  steps?: number;
  cfg_scale?: number;
  negative_prompt?: string;
}

export interface AceStepLoraRef {
  path: string;
  adapter_name?: string;
  scale?: number;
}

export interface AceStepBaseRequest {
  output_name?: string;
  caption?: string;
  prompt?: string;
  lyrics?: string;
  instrumental?: boolean;
  duration?: number;
  bpm?: number | null;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
  inference_steps?: number;
  guidance_scale?: number;
  seeds?: string;
  use_random_seed?: boolean;
  batch_size?: number;
  audio_format?: string;
  config_path?: string | null;
  lm_model_path?: string | null;
  lm_backend?: string | null;
  device?: string;
  cpu_offload?: boolean;
  offload_dit_to_cpu?: boolean;
  compile_model?: boolean;
  quantization?: string | null;
  vae_checkpoint?: string | null;
  use_adg?: boolean;
  cfg_interval_start?: number;
  cfg_interval_end?: number;
  shift?: number;
  infer_method?: "ode" | "sde";
  sampler_mode?: "euler" | "heun" | "pingpong";
  thinking?: boolean;
  lm_temperature?: number;
  lm_cfg_scale?: number;
  lm_top_k?: number;
  lm_top_p?: number;
  lm_negative_prompt?: string;
  use_cot_metas?: boolean;
  use_cot_caption?: boolean;
  use_cot_lyrics?: boolean;
  use_cot_language?: boolean;
  use_constrained_decoding?: boolean;
  enable_normalization?: boolean;
  normalization_db?: number;
  fade_in_duration?: number;
  fade_out_duration?: number;
  loras?: AceStepLoraRef[];
}

export interface MusicCompositionRequest extends AceStepBaseRequest {
  prompt: string;
  audio_duration?: number;
  infer_step?: number;
  scheduler_type?: string;
  cfg_type?: string;
  omega_scale?: number;
  manual_seeds?: string;
  guidance_interval?: number;
  guidance_interval_decay?: number;
  min_guidance_scale?: number;
  use_erg_tag?: boolean;
  use_erg_lyric?: boolean;
  use_erg_diffusion?: boolean;
  oss_steps?: string;
  guidance_scale_text?: number;
  guidance_scale_lyric?: number;
  bf16?: boolean;
  torch_compile?: boolean;
  overlapped_decode?: boolean;
  device_id?: number;
}

export interface AceStepCoverRequest extends AceStepBaseRequest {
  src_audio: string;
  audio_cover_strength?: number;
  cover_noise_strength?: number;
}

export interface AceStepRepaintRequest extends AceStepBaseRequest {
  src_audio: string;
  repainting_start: number;
  repainting_end: number;
  repaint_mode?: "conservative" | "balanced" | "aggressive";
  repaint_strength?: number;
  repaint_latent_crossfade_frames?: number;
  repaint_wav_crossfade_sec?: number;
  chunk_mask_mode?: "auto" | "explicit";
}

export interface AceStepExtendRequest extends AceStepBaseRequest {
  src_audio: string;
  complete_tracks?: string;
}

export interface AceStepExtractRequest extends AceStepBaseRequest {
  src_audio: string;
  extract_track: string;
}

export interface AceStepLegoRequest extends AceStepBaseRequest {
  src_audio: string;
  lego_track: string;
}

export interface AceStepCompleteRequest extends AceStepBaseRequest {
  src_audio: string;
  complete_tracks: string;
}

export interface AceStepUnderstandRequest {
  output_name?: string;
  src_audio: string;
  audio_codes?: string;
  config_path?: string;
  lm_model_path?: string;
  lm_backend?: string;
  device?: string;
  cpu_offload?: boolean;
  lm_temperature?: number;
  lm_top_k?: number;
  lm_top_p?: number;
  repetition_penalty?: number;
  use_constrained_decoding?: boolean;
}

export interface AceStepCreateSampleRequest {
  output_name?: string;
  query: string;
  instrumental?: boolean;
  vocal_language?: string;
  config_path?: string;
  lm_model_path?: string;
  lm_backend?: string;
  device?: string;
  cpu_offload?: boolean;
  lm_temperature?: number;
  lm_top_k?: number;
  lm_top_p?: number;
}

export interface AceStepFormatSampleRequest {
  output_name?: string;
  caption?: string;
  lyrics?: string;
  bpm?: number | null;
  duration?: number | null;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
  config_path?: string;
  lm_model_path?: string;
  lm_backend?: string;
  device?: string;
  cpu_offload?: boolean;
  lm_temperature?: number;
  lm_top_k?: number;
  lm_top_p?: number;
}

export interface AceStepRuntimeResponse {
  available: boolean;
  notes: string;
  ace_step_root: string;
  python_executable: string;
  checkpoint_path: string;
  lora_dir: string;
  model_variants: { name: string; available: boolean }[];
  lm_models: { name: string; available: boolean }[];
  lora_adapters: { name: string; path: string; size_bytes: number | null; relative_path: string }[];
  track_names: string[];
  supported_tasks: string[];
}

export interface AceStepUnderstandResponse {
  success: boolean;
  task: string;
  caption: string;
  lyrics: string;
  bpm?: number | null;
  duration?: number | null;
  keyscale: string;
  language: string;
  timesignature: string;
  instrumental?: boolean | null;
  status_message: string;
  error?: string | null;
  raw_meta: Record<string, unknown>;
}

export interface VoiceChangerRequest {
  audio_path: string;
  model_path?: string;
  index_path?: string;
  pitch_shift_semitones: number;
  f0_method: string;
  index_rate: number;
  protect: number;
  split_audio: boolean;
  f0_autotune: boolean;
  clean_audio: boolean;
  clean_strength: number;
  embedder_model: string;
}

export interface VoiceChangerBatchRequest extends Omit<VoiceChangerRequest, "audio_path"> {
  audio_paths: string[];
}

export interface VoiceModelBlendRequest {
  model_name: string;
  model_path_a: string;
  model_path_b: string;
  ratio: number;
}

export interface RvcTrainingRequest {
  model_name: string;
  dataset_path: string;
  sample_rate: number;
  total_epoch: number;
  batch_size: number;
  cpu_cores: number;
  gpu: string;
  f0_method: string;
  embedder_model: string;
  cut_preprocess: string;
  noise_reduction: boolean;
  clean_strength: number;
  chunk_len: number;
  overlap_len: number;
  index_algorithm: string;
  checkpointing: boolean;
}

export interface RvcTrainingResponse {
  status: string;
  message: string;
  model_name: string;
  model_path?: string | null;
  index_path?: string | null;
  meta: Record<string, unknown>;
}

export interface AudioConvertRequest {
  audio_path: string;
  output_format: string;
  sample_rate: number;
  mono: boolean;
}

export interface AudioSeparationRequest {
  audio_path: string;
  model_profile: string;
  output_format: string;
}

export interface AudioTranslateRequest {
  audio_path: string;
  target_language: string;
  translated_text: string;
  model_id?: string;
  speaker: string;
  instruct: string;
}

export interface AudioToolResponse {
  kind: string;
  status: string;
  message: string;
  assets: AudioToolAsset[];
  transcript_text?: string | null;
  translated_text?: string | null;
  record?: GenerationRecord | null;
}
