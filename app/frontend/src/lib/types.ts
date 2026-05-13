export interface HealthResponse {
  status: string;
  simulation_mode: boolean;
  runtime_mode: string;
  qwen_tts_available: boolean;
  device: string;
  attention_implementation: string;
  recommended_instruction_language: string;
  data_dir: string;
  asr_provider: string;
  default_asr_model: string;
}

export interface AsrModelInfo {
  id: string;
  label: string;
  description: string;
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
  image_url?: string | null;
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
  image_url?: string | null;
}

export interface UpdatePresetRequest {
  name?: string;
  notes?: string;
}

export type VoiceAssetKind = "preset" | "s2pro" | "rvc" | "trained";

export interface VoiceImageUploadResponse {
  kind: VoiceAssetKind;
  asset_id: string;
  image_url: string;
}

export interface VoiceAssetDeleteResponse {
  kind: string;
  asset_id: string;
  deleted: boolean;
  removed_files: number;
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
  selectable_model_path?: string | null;
  is_selectable?: boolean;
  stage_label?: string;
  summary_label?: string;
  model_family?: string | null;
  speaker_encoder_included?: boolean;
  batch_size: number;
  lr: number;
  num_epochs: number;
  speaker_name: string;
  status: string;
  created_at: string;
  finished_at?: string | null;
  log_path?: string | null;
  command?: string[] | null;
  output_name?: string | null;
  display_name?: string | null;
}

export interface UpdateFineTuneRunRequest {
  display_name: string;
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
  image_url?: string | null;
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

export interface VibeVoiceRuntimeResponse {
  available: boolean;
  repo_root: string;
  model_root: string;
  python_executable: string;
  repo_ready: boolean;
  asr_ready: boolean;
  realtime_tts_ready: boolean;
  longform_tts_ready: boolean;
  large_tts_ready: boolean;
  asr_model: string;
  realtime_tts_model: string;
  longform_tts_model: string;
  large_tts_model: string;
  tts_entrypoints: string[];
  features: string[];
  notes: string;
}

export interface VibeVoiceTTSRequest {
  text: string;
  output_name?: string;
  model_profile: "realtime" | "tts_15b" | "1.5b" | "longform" | "tts_7b" | "7b" | "large";
  speaker_name: string;
  speaker_audio_path?: string;
  speaker_names: string[];
  speaker_audio_paths: string[];
  checkpoint_path: string;
  cfg_scale: number;
  ddpm_steps: number;
  seed?: number;
  device: string;
  attn_implementation: string;
  inference_steps: number;
  max_length_times: number;
  disable_prefill: boolean;
  show_progress: boolean;
  max_new_tokens: number;
  output_format: string;
  extra_args: string[];
}

export interface VibeVoiceASRRequest {
  audio_path?: string;
  audio_dir?: string;
  dataset?: string;
  split: string;
  max_duration: number;
  language: string;
  task: string;
  context_info: string;
  device: string;
  precision: string;
  attn_implementation: string;
  batch_size: number;
  max_new_tokens: number;
  temperature: number;
  top_p: number;
  num_beams: number;
  return_timestamps: boolean;
}

export interface VibeVoiceASRResponse {
  audio_path: string;
  text: string;
  language?: string | null;
  model_id: string;
  provider: string;
  segments: Record<string, unknown>[];
  meta: Record<string, unknown>;
}

export interface VibeVoiceTrainingRequest {
  training_mode: "asr_lora" | "tts_lora";
  output_name: string;
  model_path: string;
  data_dir: string;
  output_dir: string;
  dataset_config_name: string;
  train_split_name: string;
  eval_split_name: string;
  text_column_name: string;
  audio_column_name: string;
  voice_prompts_column_name: string;
  train_jsonl: string;
  validation_jsonl: string;
  eval_split_size: number;
  ignore_verifications: boolean;
  max_length?: number;
  nproc_per_node: number;
  num_train_epochs: number;
  per_device_train_batch_size: number;
  gradient_accumulation_steps: number;
  learning_rate: number;
  warmup_ratio: number;
  weight_decay: number;
  max_grad_norm: number;
  logging_steps: number;
  save_steps: number;
  lora_r: number;
  lora_alpha: number;
  lora_dropout: number;
  lora_target_modules: string;
  lora_wrap_diffusion_head: boolean;
  train_diffusion_head: boolean;
  train_connectors: boolean;
  layers_to_freeze: string;
  ddpm_batch_mul: number;
  ce_loss_weight: number;
  diffusion_loss_weight: number;
  debug_save: boolean;
  debug_ce_details: boolean;
  bf16: boolean;
  gradient_checkpointing: boolean;
  use_customized_context: boolean;
  max_audio_length?: number;
  report_to: string;
  extra_args: string[];
}

export interface VibeVoiceTrainingResponse {
  status: string;
  message: string;
  run_id: string;
  output_name: string;
  run_dir: string;
  log_path: string;
  adapter_path?: string | null;
  command: string[];
  meta: Record<string, unknown>;
}

export interface VibeVoiceModelToolRequest {
  tool: "merge" | "verify_merge" | "convert_nnscaler";
  base_model_path: string;
  checkpoint_path: string;
  output_path: string;
  output_format: "safetensors" | "bin";
  nnscaler_checkpoint_path: string;
  config_path: string;
}

export interface VibeVoiceModelToolResponse {
  status: string;
  message: string;
  run_id: string;
  run_dir: string;
  log_path: string;
  output_path: string;
  command: string[];
  meta: Record<string, unknown>;
}

export interface VibeVoiceModelAsset {
  id: string;
  name: string;
  kind: "base_model" | "asr_model" | "merged_model" | "model_file" | "lora_adapter" | string;
  path: string;
  created_at?: string | null;
  notes: string;
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
  audio_datasets: AudioDatasetRecord[];
  finetune_runs: FineTuneRun[];
  audio_tool_capabilities: AudioToolCapability[];
  audio_tool_jobs: AudioToolJob[];
  voice_changer_models: VoiceChangerModelInfo[];
  asr_models: AsrModelInfo[];
}

export interface CloneFromSampleRequest {
  generation_id: string;
  model_id?: string;
  reference_text?: string;
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
  provider: string;
}

export interface CreateDatasetRequest {
  name: string;
  source_type: string;
  speaker_name: string;
  ref_audio_path: string;
  samples: DatasetSampleInput[];
  sample_folder_path?: string;
}

export interface BuildAudioDatasetRequest {
  name: string;
  target: "s2_pro" | "vibevoice" | "rvc" | "mmaudio" | "ace_step";
  source_type: "gallery" | "folder";
  samples: DatasetSampleInput[];
  sample_folder_path?: string;
  ref_audio_path?: string;
  transcribe: boolean;
  asr_model_id?: string;
}

export interface AudioDatasetBuildResponse {
  id: string;
  name: string;
  target: string;
  dataset_root_path: string;
  audio_dir_path: string;
  lab_audio_dir_path?: string | null;
  train_jsonl_path?: string | null;
  validation_jsonl_path?: string | null;
  dataset_json_path?: string | null;
  manifest_path: string;
  sample_count: number;
  message: string;
}

export interface AudioDatasetRecord extends AudioDatasetBuildResponse {
  source_type: string;
  reference_audio_path?: string | null;
  created_at?: string | null;
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

export interface VoiceBoxSpeakerMorphRequest {
  model_id: string;
  output_name: string;
  target_speaker: string;
  language: string;
  anchor_speaker: string;
  update_existing: boolean;
  preset_id?: string;
  clone_prompt_id?: string;
  ref_audio_path?: string;
  voice_clone_prompt_path?: string;
  timbre_strength: number;
  preserve_norm: boolean;
}

export interface VoiceBoxCloneRequest extends GenerationRequestExtras {
  model_id: string;
  output_name?: string;
  text: string;
  language: string;
  ref_audio_path: string;
  ref_text?: string;
  voice_clone_prompt_path?: string;
  instruct?: string;
  speaker: string;
  strategy?: string;
}

export interface S2ProRuntimeResponse {
  available: boolean;
  notes: string;
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
  managed_server: boolean;
  auto_start: boolean;
  recommended_vram_mb: number;
  local_gpu_vram_mb: number | null;
  local_gpu_vram_ok: boolean;
  local_gpu_vram_warning: string;
  allow_low_vram_local: boolean;
  features: string[];
}

export interface S2ProGenerateRequest {
  mode: "tagged" | "clone" | "multi_speaker" | "multilingual";
  runtime_source?: "local" | "api";
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
  image_url?: string | null;
}

export interface S2ProVoiceCreateRequest {
  name: string;
  runtime_source?: "local" | "api";
  reference_audio_path: string;
  reference_text: string;
  language: string;
  notes?: string;
  create_qwen_prompt?: boolean;
  qwen_model_id?: string;
}

export interface S2ProTrainingRequest {
  output_name: string;
  training_type: "lora" | "full";
  source_type: "protos" | "lab_audio_dir";
  proto_dir?: string;
  lab_audio_dir?: string;
  pretrained_ckpt_path?: string | null;
  lora_config: string;
  merge_lora: boolean;
  max_steps: number;
  val_check_interval: number;
  batch_size: number;
  accumulate_grad_batches: number;
  learning_rate: number;
  num_workers: number;
  precision: string;
  accelerator: string;
  devices: string;
  strategy_backend: string;
  codec_checkpoint_path?: string | null;
  vq_batch_size: number;
  vq_num_workers: number;
}

export interface S2ProTrainingResponse {
  status: string;
  message: string;
  run_id: string;
  output_name: string;
  training_type: string;
  run_dir: string;
  result_dir: string;
  log_path: string;
  final_checkpoint_path?: string | null;
  merged_model_path?: string | null;
  command: string[];
  preprocess_commands: string[][];
  merge_command: string[];
  meta: Record<string, unknown>;
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
  speaker_anchor?: string;
}

export interface HybridCloneInstructRequest extends GenerationRequestExtras {
  base_model_id: string;
  custom_model_id: string;
  text: string;
  language: string;
  instruct: string;
  preset_id?: string;
  ref_audio_path?: string;
  ref_text?: string;
  voice_clone_prompt_path?: string;
  x_vector_only_mode?: boolean;
  speaker_anchor?: string;
}

export interface GenerateFromPresetRequest extends GenerationRequestExtras {
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

export interface AceStepTrainingRequest {
  output_name: string;
  adapter_type: "lora" | "lokr";
  trainer_mode: "fixed" | "vanilla";
  source_type: "tensors" | "audio_dir" | "dataset_json";
  tensor_dir?: string;
  audio_dir?: string;
  dataset_json?: string;
  checkpoint_dir?: string | null;
  model_variant: string;
  base_model?: string | null;
  device: string;
  precision: "auto" | "bf16" | "fp16" | "fp32";
  max_duration: number;
  learning_rate: number;
  batch_size: number;
  gradient_accumulation: number;
  epochs: number;
  save_every: number;
  seed: number;
  num_workers: number;
  gradient_checkpointing: boolean;
  rank: number;
  alpha: number;
  dropout: number;
  lokr_linear_dim: number;
  lokr_linear_alpha: number;
  lokr_factor: number;
  lokr_decompose_both: boolean;
  lokr_use_tucker: boolean;
  lokr_use_scalar: boolean;
  lokr_weight_decompose: boolean;
}

export interface AceStepTrainingResponse {
  status: string;
  message: string;
  run_id: string;
  adapter_type: string;
  trainer_mode: string;
  tensor_dir: string;
  output_dir: string;
  final_adapter_path?: string | null;
  log_path: string;
  command: string[];
  preprocess_command: string[];
  meta: Record<string, unknown>;
}

export interface MMAudioTrainingRequest {
  output_name: string;
  model: string;
  weights_path?: string;
  checkpoint_path?: string;
  data_mode: "configured" | "example";
  nproc_per_node: number;
  num_iterations: number;
  batch_size: number;
  learning_rate: number;
  compile: boolean;
  debug: boolean;
  save_weights_interval: number;
  save_checkpoint_interval: number;
  ema_checkpoint_interval: number;
  val_interval: number;
  eval_interval: number;
  run_final_sample: boolean;
}

export interface MMAudioTrainingResponse {
  status: string;
  message: string;
  run_id: string;
  output_name: string;
  run_dir: string;
  log_path: string;
  final_weights_path?: string | null;
  command: string[];
  meta: Record<string, unknown>;
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
  audio_paths: string[];
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

export interface AudioEditRequest {
  audio_path: string;
  output_name?: string;
  start_sec: number;
  end_sec?: number;
  gain_db: number;
  fade_in_sec: number;
  fade_out_sec: number;
  normalize: boolean;
  reverse: boolean;
  output_format: string;
  sample_rate: number;
}

export interface AudioDenoiseRequest {
  audio_path: string;
  output_name?: string;
  strength: number;
  noise_profile_sec: number;
  spectral_floor: number;
  highpass_hz: number;
  lowpass_hz: number;
  voice_presence: number;
  normalize: boolean;
  output_format: string;
  sample_rate: number;
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

export interface CosyVoice3RuntimeResponse {
  available: boolean;
  notes: string;
  cosyvoice_root: string;
  python_executable: string;
  model_dir: string;
  voice_dir: string;
  model_variants: Array<{ name: string; available: boolean }>;
  voice_presets: CosyVoice3VoicePreset[];
  supported_tasks: string[];
  supported_languages: string[];
}

export type CosyVoice3Task = "zero_shot" | "cross_lingual" | "instruct2" | "sft" | "vc";

export interface CosyVoice3GenerateRequest {
  task: CosyVoice3Task;
  text: string;
  language?: string;
  prompt_text?: string;
  prompt_audio_path?: string;
  instruct_text?: string;
  speaker?: string;
  source_audio_path?: string;
  zero_shot_spk_id?: string;
  model_dir?: string;
  model_name?: string;
  stream?: boolean;
  seed?: number;
  label?: string;
  audio_format?: "wav" | "flac" | "mp3" | "ogg";
}

export interface CosyVoice3VoicePreset {
  name: string;
  path: string;
  prompt_text?: string;
  prompt_audio_path?: string;
  language?: string;
  task?: string;
  notes?: string;
}

export interface CosyVoice3VoicePresetCreateRequest {
  name: string;
  prompt_text?: string;
  prompt_audio_path: string;
  language?: string;
  task?: "zero_shot" | "cross_lingual" | "instruct2";
  notes?: string;
}

export interface CosyVoice3TrainingRequest {
  dataset_id: string;
  cv_dataset_id?: string;
  submodels: Array<"llm" | "flow" | "hifigan">;
  train_engine: "torch_ddp" | "deepspeed";
  base_model?: string;
  max_epoch?: number;
  batch_size?: number;
  learning_rate?: number;
  num_workers?: number;
  run_name?: string;
  extra_args?: string[];
}

export interface CosyVoice3TrainingResponse {
  run_id: string;
  status: string;
  run_dir: string;
  base_model: string;
  submodels: string[];
  train_engine: string;
  checkpoint_dir?: string;
  log_tail?: string;
  stderr_tail?: string;
  stages: Array<Record<string, unknown>>;
}

export interface VoxCPM2RuntimeResponse {
  available: boolean;
  notes: string;
  voxcpm_root: string;
  python_executable: string;
  model_dir: string;
  voice_dir: string;
  model_variants: Array<{ name: string; available: boolean }>;
  voice_presets: VoxCPM2VoicePreset[];
  supported_tasks: string[];
  supported_languages: string[];
}

export type VoxCPM2Task = "voice_design" | "voice_cloning" | "ultimate_cloning";

export interface VoxCPM2GenerateRequest {
  task: VoxCPM2Task;
  text: string;
  language?: string;
  prompt_text?: string;
  prompt_wav_path?: string;
  reference_wav_path?: string;
  voice_description?: string;
  model_dir?: string;
  model_name?: string;
  cfg_value?: number;
  inference_timesteps?: number;
  min_len?: number;
  max_len?: number;
  normalize?: boolean;
  denoise?: boolean;
  enable_denoiser?: boolean;
  optimize?: boolean;
  device?: string;
  seed?: number;
  lora_weights_path?: string;
  label?: string;
  audio_format?: "wav" | "flac" | "mp3" | "ogg";
}

export interface VoxCPM2VoicePreset {
  name: string;
  path: string;
  task: VoxCPM2Task;
  prompt_text?: string;
  prompt_wav_path?: string;
  reference_wav_path?: string;
  voice_description?: string;
  language?: string;
  notes?: string;
}

export interface VoxCPM2VoicePresetCreateRequest {
  name: string;
  task: VoxCPM2Task;
  prompt_text?: string;
  prompt_wav_path?: string;
  reference_wav_path?: string;
  voice_description?: string;
  language?: string;
  notes?: string;
}

export interface VoxCPM2LoRAConfig {
  enable_lm: boolean;
  enable_dit: boolean;
  enable_proj: boolean;
}

export interface VoxCPM2TrainingRequest {
  dataset_id: string;
  cv_dataset_id?: string;
  base_model?: string;
  lora: VoxCPM2LoRAConfig;
  batch_size?: number;
  grad_accum_steps?: number;
  num_workers?: number;
  num_iters?: number;
  max_steps?: number;
  learning_rate?: number;
  warmup_steps?: number;
  log_interval?: number;
  valid_interval?: number;
  save_interval?: number;
  weight_decay?: number;
  max_grad_norm?: number;
  sample_rate?: number;
  run_name?: string;
  extra_args?: string[];
}

export interface VoxCPM2TrainingResponse {
  run_id: string;
  status: string;
  run_dir: string;
  base_model: string;
  checkpoint_dir?: string;
  tensorboard_dir?: string;
  log_tail?: string;
  stderr_tail?: string;
  stages: Array<Record<string, unknown>>;
}

export interface Supertonic3RuntimeResponse {
  available: boolean;
  notes: string;
  supertonic_root: string;
  model_dir: string;
  voice_dir: string;
  onnx_dir: string;
  onnx_assets: Array<{ name: string; available: boolean }>;
  builtin_voice_styles: Array<{ name: string; available: boolean }>;
  voice_presets: Supertonic3VoicePreset[];
  supported_languages: string[];
  supported_expression_tags: string[];
  training_supported: boolean;
  training_notes: string;
}

export interface Supertonic3GenerateRequest {
  text: string;
  language: string;
  voice_style: string;
  total_step?: number;
  speed?: number;
  silence_duration?: number;
  use_gpu?: boolean;
  label?: string;
  audio_format?: "wav" | "flac" | "mp3" | "ogg";
}

export interface Supertonic3VoicePreset {
  name: string;
  path: string;
  voice_style?: string;
  voice_style_path?: string;
  language?: string;
  notes?: string;
}

export interface Supertonic3VoicePresetCreateRequest {
  name: string;
  voice_style: string;
  language?: string;
  notes?: string;
}

export interface OmniVoiceRuntimeResponse {
  available: boolean;
  notes: string;
  omnivoice_root: string;
  python_executable: string;
  model_dir: string;
  voice_dir: string;
  model_variants: Array<{ name: string; available: boolean }>;
  voice_presets: OmniVoiceVoicePreset[];
  supported_tasks: OmniVoiceTask[];
  supported_languages: string[];
  supported_language_options: Array<{ id: string; name: string; display: string }>;
  voice_design_templates: Array<{ label: string; options: string[] }>;
  batch_supported: boolean;
  training_supported: boolean;
  data_prep_supported: boolean;
}

export type OmniVoiceTask = "auto_voice" | "voice_design" | "voice_cloning";

export interface OmniVoiceGenerateRequest {
  task: OmniVoiceTask;
  text: string;
  language?: string;
  instruct?: string;
  ref_audio?: string;
  ref_text?: string;
  model_dir?: string;
  model_name?: string;
  device?: string;
  seed?: number;
  num_step?: number;
  guidance_scale?: number;
  speed?: number;
  duration?: number;
  t_shift?: number;
  denoise?: boolean;
  preprocess_prompt?: boolean;
  postprocess_output?: boolean;
  layer_penalty_factor?: number;
  position_temperature?: number;
  class_temperature?: number;
  audio_chunk_duration?: number;
  audio_chunk_threshold?: number;
  label?: string;
  audio_format?: "wav" | "flac" | "mp3" | "ogg";
}

export interface OmniVoiceVoicePreset {
  name: string;
  path: string;
  task: OmniVoiceTask;
  language?: string;
  instruct?: string;
  ref_audio?: string;
  ref_text?: string;
  model_name?: string;
  notes?: string;
  defaults?: Record<string, unknown>;
}

export interface OmniVoiceVoicePresetCreateRequest {
  name: string;
  task: OmniVoiceTask;
  language?: string;
  instruct?: string;
  ref_audio?: string;
  ref_text?: string;
  model_name?: string;
  notes?: string;
  defaults?: Record<string, unknown>;
}

export interface OmniVoiceBatchRequest {
  model_name?: string;
  samples_jsonl: string;
  defaults?: Record<string, unknown>;
  run_name?: string;
  batch_duration?: number;
  batch_size?: number;
  warmup?: number;
  nj_per_gpu?: number;
  lang_id?: string;
}

export interface OmniVoiceBatchResponse {
  run_id: string;
  status: string;
  run_dir: string;
  output_dir?: string;
  generated_files: Array<Record<string, unknown>>;
  log_tail?: string;
  stderr_tail?: string;
}

export interface OmniVoiceTrainingRequest {
  base_model?: string;
  train_config_json: string;
  data_config_json: string;
  run_name?: string;
  accelerate_args?: string[];
  extra_args?: string[];
}

export interface OmniVoiceTrainingResponse {
  run_id: string;
  status: string;
  run_dir: string;
  base_model: string;
  checkpoint_dir?: string;
  train_config_path?: string;
  data_config_path?: string;
  log_tail?: string;
  stderr_tail?: string;
}

export interface OmniVoiceDataPrepRequest {
  mode?: "jsonl_to_webdataset" | "extract_audio_tokens" | "full_pipeline";
  run_name?: string;
  input_jsonl?: string;
  input_manifest?: string;
  raw_output_dir?: string;
  token_output_dir?: string;
  tokenizer_path?: string;
  workers?: number;
  threads?: number;
  shard_size?: number;
  sr?: number;
  shuffle?: boolean;
  shuffle_seed?: number;
  min_duration?: number;
  max_duration?: number;
  samples_per_shard?: number;
  min_num_shards?: number;
  skip_errors?: boolean;
  min_length?: number;
  max_length?: number;
  num_machines?: number;
  machine_index?: number;
  nj_per_gpu?: number;
  loader_workers?: number;
}

export interface OmniVoiceDataPrepResponse {
  run_id: string;
  status: string;
  run_dir: string;
  mode: string;
  raw_data_lst_path?: string;
  token_data_lst_path?: string;
  raw_output_dir?: string;
  token_output_dir?: string;
  log_tail?: string;
  stderr_tail?: string;
}
