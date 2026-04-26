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

export interface AudioConvertRequest {
  audio_path: string;
  output_format: string;
  sample_rate: number;
  mono: boolean;
}

export interface AudioSeparationRequest {
  audio_path: string;
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
