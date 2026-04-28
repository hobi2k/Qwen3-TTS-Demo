"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { I18nProvider, useTranslation } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { StudioTopBar } from "./components/StudioTopBar";

import { api } from "./lib/api";
import {
  AudioCard,
  basenameFromPath,
  createEmptyDatasetSample,
  createGenerationControls,
  CUSTOM_RECIPES,
  DESIGN_RECIPES,
  fileUrlFromPath,
  FineTuneMode,
  getAudioDownloadName,
  formatDate,
  GenerationControlsEditor,
  GenerationControlsForm,
  getModeLabel,
  getRecordDisplayTitle,
  GUIDE_SECTIONS,
  HYBRID_RECIPES,
  LanguageSelect,
  mediaUrl,
  MiniWaveform,
  normalizeDatasetPath,
  parseDatasetSampleBulkInput,
  PRODUCT_PAGES,
  RecipeBar,
  serializeGenerationControls,
  ServerAudioPicker,
  S2_PRO_TAG_CATEGORIES,
  S2ProMode,
  SOUND_EFFECT_LIBRARY,
  SpotlightCard,
  TabKey,
  VOICEBOX_ACTIONS,
  VOICEBOX_STEPS,
} from "./lib/app-ui";
import type {
  AceStepRuntimeResponse,
  AceStepUnderstandResponse,
  AudioAsset,
  AudioToolCapability,
  AudioToolResponse,
  CharacterPreset,
  ClonePromptRecord,
  FineTuneDataset,
  FineTuneRun,
  GenerationRecord,
  HealthResponse,
  ModelInfo,
  S2ProRuntimeResponse,
  S2ProVoiceRecord,
  SpeakerInfo,
  UploadResponse,
  VoiceChangerModelInfo,
} from "./lib/types";

type AceStepMode =
  | "text2music"
  | "cover"
  | "repaint"
  | "extend"
  | "extract"
  | "lego"
  | "complete"
  | "understand"
  | "create_sample"
  | "format_sample";

type AceStepTabKey = Extract<
  TabKey,
  | "ace_music"
  | "ace_cover"
  | "ace_repaint"
  | "ace_extend"
  | "ace_extract"
  | "ace_lego"
  | "ace_complete"
  | "ace_understand"
  | "ace_create_sample"
  | "ace_format_sample"
>;

const ACE_STEP_TAB_TO_MODE: Record<AceStepTabKey, AceStepMode> = {
  ace_music: "text2music",
  ace_cover: "cover",
  ace_repaint: "repaint",
  ace_extend: "extend",
  ace_extract: "extract",
  ace_lego: "lego",
  ace_complete: "complete",
  ace_understand: "understand",
  ace_create_sample: "create_sample",
  ace_format_sample: "format_sample",
};

const ACE_STEP_TRACK_OPTIONS = [
  "vocals",
  "backing_vocals",
  "drums",
  "percussion",
  "bass",
  "guitar",
  "keyboard",
  "synth",
  "strings",
  "brass",
  "woodwinds",
  "fx",
] as const;

const ACE_STEP_STYLE_PRESETS = [
  {
    label: "City pop",
    prompt: "Korean city pop, warm analog synths, clean female vocal, night drive, glossy drums, melodic bass",
  },
  {
    label: "Dark trap",
    prompt: "dark trap, distorted 808 bass, sparse piano, whispered female vocal hook, tense cinematic atmosphere",
  },
  {
    label: "Anime rock",
    prompt: "anime opening rock, fast drums, bright electric guitar, energetic female vocal, uplifting chorus",
  },
  {
    label: "Ballad",
    prompt: "Korean emotional ballad, intimate piano, soft strings, breathy female vocal, slow build, dramatic chorus",
  },
] as const;

function PromptSummaryCard({
  title,
  prompt,
  actionLabel,
  onAction,
}: {
  title: string;
  prompt: ClonePromptRecord | null;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (!prompt) {
    return (
      <div className="result-card result-card--empty">
        <strong>{title}</strong>
        <p>아직 저장된 목소리 스타일이 없습니다. 먼저 참조 음성으로 스타일을 만들어 주세요.</p>
      </div>
    );
  }

  return (
    <article className="result-card">
      <div className="result-card__header">
        <div>
          <span className="eyebrow eyebrow--soft">목소리 스타일</span>
          <h3>{title}</h3>
        </div>
        {actionLabel && onAction ? (
          <button className="secondary-button" onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="result-card__grid">
        <div>
          <span className="meta-label">생성 방식</span>
          <strong>{prompt.source_type === "generated_sample" ? "생성 음성에서 추출" : "참조 음성에서 추출"}</strong>
        </div>
        <div>
          <span className="meta-label">모드</span>
          <strong>{prompt.x_vector_only_mode ? "가벼운 복제" : "전체 스타일"}</strong>
        </div>
      </div>
      <p>{prompt.reference_text}</p>
    </article>
  );
}

function getCheckpointEpoch(model: ModelInfo): number {
  const match = model.model_id.match(/checkpoint-epoch-(\d+)/);
  return match ? Number(match[1]) : -1;
}

function getCheckpointGroupKey(model: ModelInfo): string {
  return model.model_id.replace(/\/checkpoint-epoch-\d+$/, "");
}

function keepLatestFineTunedModels(models: ModelInfo[]): ModelInfo[] {
  const latestByGroup = new Map<string, ModelInfo>();

  models.forEach((model) => {
    if (model.source !== "finetuned") {
      return;
    }

    const groupKey = getCheckpointGroupKey(model);
    const current = latestByGroup.get(groupKey);
    if (!current || getCheckpointEpoch(model) > getCheckpointEpoch(current)) {
      latestByGroup.set(groupKey, model);
    }
  });

  return Array.from(latestByGroup.values());
}

function isVoiceBoxModel(model: ModelInfo): boolean {
  return (
    model.model_family === "voicebox" ||
    model.speaker_encoder_included === true ||
    model.category.toLowerCase().includes("voicebox") ||
    model.label.toLowerCase().includes("voicebox")
  );
}

function displayModelName(model: ModelInfo): string {
  return model.label
    .replace(/^(보이스박스|학습된)\s+/g, "")
    .replace(/^(VoiceBox|Fine-tuned)\s+/gi, "")
    .trim();
}

function s2ProTabToMode(tab: TabKey): S2ProMode {
  if (tab === "s2pro_clone") return "clone";
  if (tab === "s2pro_multi_speaker") return "multi_speaker";
  if (tab === "s2pro_multilingual") return "multilingual";
  return "tagged";
}

function isS2ProTab(tab: TabKey): boolean {
  return tab === "s2pro_tagged" || tab === "s2pro_clone" || tab === "s2pro_multi_speaker" || tab === "s2pro_multilingual";
}

function isAceStepTab(tab: TabKey): tab is AceStepTabKey {
  return tab in ACE_STEP_TAB_TO_MODE;
}

function gallerySelectionKey(record: GenerationRecord): string {
  return `${record.id}::${record.output_audio_path}`;
}

function galleryAccentForMode(mode: string): string {
  if (mode.includes("ace")) return "music";
  if (mode.includes("sound")) return "effect";
  if (mode.includes("voice_changer") || mode.includes("audio_separation")) return "audio";
  if (mode.includes("clone") || mode.includes("voicebox")) return "voice";
  if (mode.includes("design")) return "design";
  return "speech";
}

function formatShortDate(value: string): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function recordLanguageLabel(record: GenerationRecord): string {
  const language = (record.language || record.meta?.language || "auto").toString();
  const labels: Record<string, string> = {
    ko: "KO",
    korean: "KO",
    en: "EN",
    english: "EN",
    ja: "JA",
    japanese: "JA",
    auto: "AUTO",
  };
  return labels[language.toLowerCase()] || language.toUpperCase();
}

function getRecordModelLabel(record: GenerationRecord): string {
  const model = record.meta?.model_id || record.meta?.model || record.meta?.model_profile || record.meta?.runtime_source || "";
  return typeof model === "string" && model.trim() ? basenameFromPath(model).replace(/\.[^.]+$/, "") : getModeLabel(record.mode);
}

function makeWaveBars(seed: string, count = 48): number[] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((hash + index * 19) * 0.31) + Math.cos((hash + index * 7) * 0.17);
    return 18 + Math.round(Math.abs(value) * 18 + ((index % 7) * 2));
  });
}

function aceMetricValue(value: string, fallback: string): string {
  return value?.toString().trim() || fallback;
}

function guessMatchingCustomVoiceModel(
  presetBaseModelId: string,
  availableModels: ModelInfo[],
  fallbackModelId: string,
): string {
  const normalized = presetBaseModelId.toLowerCase();
  const familyHint = normalized.includes("1.7b") ? "1.7B" : normalized.includes("0.6b") ? "0.6B" : "";
  const stockModels = availableModels.filter((model) => model.source === "stock");
  const matched =
    (familyHint ? stockModels.find((model) => model.label.includes(familyHint)) : null) ??
    stockModels.find((model) => model.recommended) ??
    stockModels[0];
  return matched?.model_id || fallbackModelId;
}

function StudioApp() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [voiceGalleryView, setVoiceGalleryView] = useState<"trained" | "qwen" | "s2pro" | "rvc">("trained");
  const [activeGuideTitle, setActiveGuideTitle] = useState<string>(GUIDE_SECTIONS[0]?.title || "");
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(true);
  const [ttsSideView, setTtsSideView] = useState<"settings" | "history">("settings");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<string[]>([]);
  const [clonePrompts, setClonePrompts] = useState<ClonePromptRecord[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [datasets, setDatasets] = useState<FineTuneDataset[]>([]);
  const [runs, setRuns] = useState<FineTuneRun[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const bootstrapLoadedRef = useRef(false);
  const actionQueueRef = useRef(Promise.resolve());

  const [designForm, setDesignForm] = useState({
    model_id: "",
    output_name: "새-목소리-샘플",
    text: "오늘은 정말 힘들었어. 언제쯤 끝날까?",
    language: "Korean",
    instruct: "Young Korean woman, cool, polished, and articulate. Keep the tone restrained, modern, and elegant.",
  });
  const [lastDesignRecord, setLastDesignRecord] = useState<GenerationRecord | null>(null);
  const [designControls, setDesignControls] = useState<GenerationControlsForm>(createGenerationControls("design"));
  const [inferenceForm, setInferenceForm] = useState({
    model_id: "",
    output_name: "오늘은-정말-힘들었어",
    text: "오늘은 정말 힘들었어. 언제쯤 끝날까?",
    language: "Korean",
    speaker: "",
    instruct: "Tired, restrained, and clear. Keep the delivery controlled and slightly dry.",
    ref_audio_path: "",
    ref_text: "",
    voice_clone_prompt_path: "",
    x_vector_only_mode: false,
  });
  const [inferenceControls, setInferenceControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));
  const [lastInferenceRecord, setLastInferenceRecord] = useState<GenerationRecord | null>(null);

  const [selectedDesignSampleId, setSelectedDesignSampleId] = useState("");
  const [selectedBaseModelId, setSelectedBaseModelId] = useState("");
  const [cloneEngine, setCloneEngine] = useState<"base_prompt" | "voicebox">("base_prompt");
  const [presetWorkflow, setPresetWorkflow] = useState<"base" | "hybrid" | "voicebox" | "voicebox_instruct">("base");
  const [datasetInputMode, setDatasetInputMode] = useState<"gallery" | "paths">("gallery");
  const [selectedClonePrompt, setSelectedClonePrompt] = useState<ClonePromptRecord | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    language: "Korean",
    notes: "",
  });
  const [presetGenerateText, setPresetGenerateText] = useState("이 캐릭터는 앞으로도 같은 목소리로 말해야 해.");
  const [presetOutputName, setPresetOutputName] = useState("프리셋-생성");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedHybridPresetId, setSelectedHybridPresetId] = useState("");
  const [presetControls, setPresetControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));

  const [uploadedRef, setUploadedRef] = useState<UploadResponse | null>(null);
  const [uploadRefText, setUploadRefText] = useState("");
  const [uploadTranscriptMeta, setUploadTranscriptMeta] = useState<string>("");
  const [uploadedClonePrompt, setUploadedClonePrompt] = useState<ClonePromptRecord | null>(null);

  const [datasetSamples, setDatasetSamples] = useState([createEmptyDatasetSample()]);
  const [datasetBulkInput, setDatasetBulkInput] = useState("");
  const [datasetSampleFolderPath, setDatasetSampleFolderPath] = useState("");
  const [datasetForm, setDatasetForm] = useState({
    name: "",
    source_type: "voice_design_batch",
    speaker_name: "",
    ref_audio_path: "",
  });
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [lastCreatedDatasetId, setLastCreatedDatasetId] = useState("");
  const [runForm, setRunForm] = useState({
    training_mode: "base" as FineTuneMode,
    init_model_path: "",
    speaker_encoder_model_path: "",
    tokenizer_model_path: "",
    output_name: "demo-run",
    speaker_name: "speaker_demo",
    batch_size: 2,
    lr: 0.00002,
    num_epochs: 3,
    simulate_only: false,
  });
  const [voiceBoxFusionForm, setVoiceBoxFusionForm] = useState({
    input_checkpoint_path: "",
    speaker_encoder_source_path: "",
    output_name: "voicebox-model",
  });
  const [voiceBoxCloneForm, setVoiceBoxCloneForm] = useState({
    model_id: "",
    output_name: "voicebox-clone",
    text: "오늘은 정말 힘들었어. 언제쯤 끝날까?",
    language: "Korean",
    ref_audio_path: "",
    ref_text: "",
    speaker: "mai",
    instruct: "",
    strategy: "embedded_encoder_only",
  });
  const [voiceBoxPresetForm, setVoiceBoxPresetForm] = useState({
    model_id: "",
    output_name: "voicebox-preset",
    text: "이 캐릭터는 앞으로도 같은 목소리로 말해야 해.",
    language: "Korean",
  });
  const [voiceBoxPresetInstructForm, setVoiceBoxPresetInstructForm] = useState({
    model_id: "",
    output_name: "voicebox-preset-instruct",
    text: "오늘은 정말 힘들었어. 언제쯤 끝날까?",
    language: "Korean",
    instruct: "Breathy, emotionally unstable, and barely holding composure. Keep the diction clear.",
  });
  const [lastVoiceBoxCloneRecord, setLastVoiceBoxCloneRecord] = useState<GenerationRecord | null>(null);
  const [lastVoiceBoxPresetRecord, setLastVoiceBoxPresetRecord] = useState<GenerationRecord | null>(null);
  const [lastVoiceBoxPresetInstructRecord, setLastVoiceBoxPresetInstructRecord] = useState<GenerationRecord | null>(null);
  const [hybridForm, setHybridForm] = useState({
    base_model_id: "",
    custom_model_id: "",
    output_name: "프리셋-말투-테스트",
    text: "오늘은 정말 힘들었어. 언제쯤 끝날까?",
    language: "Korean",
    instruct: "Breathing lightly, emotionally unstable, and barely holding composure. Keep the diction clear.",
    ref_audio_path: "",
    ref_text: "",
    x_vector_only_mode: false,
  });
  const [hybridControls, setHybridControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));
  const [lastHybridRecord, setLastHybridRecord] = useState<GenerationRecord | null>(null);
  const [audioToolCapabilities, setAudioToolCapabilities] = useState<AudioToolCapability[]>([]);
  const [voiceChangerModels, setVoiceChangerModels] = useState<VoiceChangerModelInfo[]>([]);
  const [s2ProRuntime, setS2ProRuntime] = useState<S2ProRuntimeResponse | null>(null);
  const [s2ProMode, setS2ProMode] = useState<S2ProMode>("tagged");
  const [s2ProVoices, setS2ProVoices] = useState<S2ProVoiceRecord[]>([]);
  const [selectedS2VoiceId, setSelectedS2VoiceId] = useState("");
  const [s2TagSearch, setS2TagSearch] = useState("");
  const [s2ProForm, setS2ProForm] = useState({
    runtime_source: "local" as "auto" | "local" | "api",
    output_name: "s2pro-voice-tts",
    text: "[breath] 오늘은 조금 천천히 말해볼게. [super happy] 그래도 결국 해냈어!",
    language: "Korean",
    reference_audio_path: "",
    reference_text: "",
    speaker_script:
      "<|speaker:0|> [calm] 오늘 회의는 여기서 정리하겠습니다.\n<|speaker:1|> [excited] 좋아요, 다음 단계로 바로 넘어가죠.",
    clone_text: "[whispers] 이 목소리로 아주 가까이서 말하는 느낌을 확인해볼게.",
    instruction: "",
    temperature: "0.7",
    top_p: "0.8",
    max_tokens: "2048",
  });
  const [s2ProVoiceForm, setS2ProVoiceForm] = useState({
    name: "새-s2pro-목소리",
    runtime_source: "local" as "auto" | "local" | "api",
    reference_audio_path: "",
    reference_text: "",
    language: "Korean",
    notes: "",
    create_qwen_prompt: true,
  });
  const [s2ProCloneSource, setS2ProCloneSource] = useState<"gallery" | "upload">("gallery");
  const [s2ProUploadedRef, setS2ProUploadedRef] = useState<UploadResponse | null>(null);
  const [lastS2ProRecord, setLastS2ProRecord] = useState<GenerationRecord | null>(null);
  const [audioEffectsSearch, setAudioEffectsSearch] = useState("");
  const [soundEffectForm, setSoundEffectForm] = useState({
    model_profile: "mmaudio",
    prompt: "Cold rain on a metal roof with distant low thunder",
    duration_sec: "4.0",
    intensity: "0.9",
    seed: "",
    steps: "25",
    cfg_scale: "5.0",
    negative_prompt: "",
  });
  const [aceStepForm, setAceStepForm] = useState({
    output_name: "midnight-city-demo",
    prompt: "Korean city pop, warm analog synths, clean female vocal, night drive, glossy drums, melodic bass",
    lyrics:
      "[verse]\n오늘 밤도 불빛은 천천히 흐르고\n창밖의 도시는 말없이 반짝여\n\n[chorus]\n우린 멀리 가도 같은 노래를 기억해\n끝나지 않을 밤처럼 다시 시작해",
    audio_duration: "60",
    infer_step: "27",
    guidance_scale: "15",
    scheduler_type: "euler",
    cfg_type: "apg",
    omega_scale: "10",
    manual_seeds: "42",
    guidance_interval: "0.5",
    guidance_interval_decay: "0",
    min_guidance_scale: "3",
    use_erg_tag: true,
    use_erg_lyric: true,
    use_erg_diffusion: false,
    oss_steps: "",
    guidance_scale_text: "0",
    guidance_scale_lyric: "0",
    bf16: true,
    torch_compile: false,
    cpu_offload: false,
    overlapped_decode: false,
    device_id: "0",
  });
  const [lastAceStepRecord, setLastAceStepRecord] = useState<GenerationRecord | null>(null);
  const [aceStepMode, setAceStepMode] = useState<AceStepMode>("text2music");
  const [aceStepRuntime, setAceStepRuntime] = useState<AceStepRuntimeResponse | null>(null);
  const [aceStepCommonForm, setAceStepCommonForm] = useState({
    config_path: "",
    lm_model_path: "",
    lora_path: "",
    lora_scale: "1.0",
    lora_adapter_name: "",
  });
  const [aceStepAudioForm, setAceStepAudioForm] = useState({
    src_audio: "",
  });
  const [aceStepCoverForm, setAceStepCoverForm] = useState({
    audio_cover_strength: "1.0",
    cover_noise_strength: "0.0",
  });
  const [aceStepRepaintForm, setAceStepRepaintForm] = useState({
    repainting_start: "0",
    repainting_end: "-1",
    repaint_mode: "balanced",
    repaint_strength: "0.5",
  });
  const [aceStepExtendForm, setAceStepExtendForm] = useState({
    complete_tracks: "vocals,drums,bass,guitar",
  });
  const [aceStepExtractForm, setAceStepExtractForm] = useState({
    extract_track: "vocals",
  });
  const [aceStepLegoForm, setAceStepLegoForm] = useState({
    lego_track: "vocals",
  });
  const [aceStepCompleteForm, setAceStepCompleteForm] = useState({
    complete_tracks: "vocals,drums,bass,guitar",
  });
  const [aceStepCreateSampleForm, setAceStepCreateSampleForm] = useState({
    query: "a soft Bengali love song for a quiet evening",
    instrumental: false,
    vocal_language: "",
  });
  const [aceStepUnderstandResult, setAceStepUnderstandResult] = useState<AceStepUnderstandResponse | null>(null);
  const [voiceChangerForm, setVoiceChangerForm] = useState({
    audio_path: "",
    selected_model_id: "",
    model_path: "",
    index_path: "",
    pitch_shift_semitones: "0",
    f0_method: "rmvpe",
    index_rate: "0.3",
    protect: "0.33",
    split_audio: false,
    f0_autotune: false,
    clean_audio: false,
    clean_strength: "0.7",
    embedder_model: "contentvec",
  });
  const [applioBatchPaths, setApplioBatchPaths] = useState<string[]>([]);
  const [applioBatchManualPath, setApplioBatchManualPath] = useState("");
  const [applioBlendForm, setApplioBlendForm] = useState({
    model_name: "blended-rvc-voice",
    model_path_a: "",
    model_path_b: "",
    ratio: "0.5",
  });
  const [rvcTrainForm, setRvcTrainForm] = useState({
    model_name: "my-rvc-voice",
    dataset_path: "",
    sample_rate: "40000",
    total_epoch: "100",
    batch_size: "4",
    cpu_cores: "4",
    gpu: "0",
    f0_method: "rmvpe",
    embedder_model: "contentvec",
    cut_preprocess: "Automatic",
    noise_reduction: true,
    clean_strength: "0.7",
    chunk_len: "3.0",
    overlap_len: "0.3",
    index_algorithm: "Auto",
    checkpointing: true,
  });
  const [lastRvcTrainingResult, setLastRvcTrainingResult] = useState<string>("");
  const [audioConvertForm, setAudioConvertForm] = useState({
    audio_path: "",
    output_format: "wav",
    sample_rate: "24000",
    mono: true,
  });
  const [audioEditorSource, setAudioEditorSource] = useState<"gallery" | "upload" | "path">("gallery");
  const [audioEditorDuration, setAudioEditorDuration] = useState(0);
  const [audioEditorForm, setAudioEditorForm] = useState({
    audio_path: "",
    output_name: "edited-audio",
    start_sec: "0",
    end_sec: "",
    gain_db: "0",
    fade_in_sec: "0.02",
    fade_out_sec: "0.02",
    normalize: true,
    reverse: false,
    output_format: "wav",
    sample_rate: "44100",
  });
  const [audioDenoiseSource, setAudioDenoiseSource] = useState<"gallery" | "upload" | "path">("gallery");
  const [audioDenoiseForm, setAudioDenoiseForm] = useState({
    audio_path: "",
    output_name: "clean-voice",
    strength: "0.55",
    noise_profile_sec: "0.6",
    spectral_floor: "0.08",
    highpass_hz: "70",
    lowpass_hz: "16000",
    voice_presence: "0.35",
    normalize: true,
    output_format: "wav",
    sample_rate: "44100",
  });
  const [audioSeparationForm, setAudioSeparationForm] = useState({
    audio_path: "",
    model_profile: "roformer_vocals",
    output_format: "wav",
  });
  const [audioToolUpload, setAudioToolUpload] = useState<UploadResponse | null>(null);
  const [lastAudioToolResult, setLastAudioToolResult] = useState<AudioToolResponse | null>(null);

  async function refreshAll() {
    const data = await api.bootstrap();
    setHealth(data.health);
    setModels(data.models);
    setSpeakers(data.speakers);
    setAudioAssets(data.audio_assets);
    setHistory(data.history);
    setClonePrompts(data.clone_prompts || []);
    setPresets(data.presets);
    setDatasets(data.datasets);
    setRuns(data.finetune_runs);
    setAudioToolCapabilities(data.audio_tool_capabilities || []);
    setVoiceChangerModels(data.voice_changer_models || []);
    try {
      setS2ProRuntime(await api.s2ProCapabilities());
      setS2ProVoices(await api.s2ProVoices());
    } catch {
      setS2ProRuntime(null);
      setS2ProVoices([]);
    }
  }

  useEffect(() => {
    if (bootstrapLoadedRef.current) {
      return;
    }
    bootstrapLoadedRef.current = true;
    const tab = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (tab && Object.prototype.hasOwnProperty.call(PRODUCT_PAGES, tab)) {
      setActiveTab(tab);
    }
    refreshAll().catch((error: Error) => {
      setMessage(error.message);
    });
  }, []);

  useEffect(() => {
    setMessage("");
  }, [activeTab]);

  async function runAction(action: () => Promise<void>) {
    const run = async () => {
      try {
        setLoading(true);
        setMessage("");
        await action();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    const queued = actionQueueRef.current.then(run);
    actionQueueRef.current = queued.catch(() => undefined);
    await queued;
  }

  const latestFineTunedModels = keepLatestFineTunedModels(models);
  const visibleModels = [
    ...models.filter((model) => model.source !== "finetuned"),
    ...latestFineTunedModels,
  ];
  const customVoiceModels = visibleModels.filter((model) => model.category === "custom_voice");
  const customVoiceCapableModels = visibleModels.filter((model) => model.inference_mode === "custom_voice");
  const voiceDesignModels = visibleModels.filter((model) => model.category === "voice_design");
  const baseModels = visibleModels.filter((model) => model.category === "base_clone");
  const tokenizerModels = models.filter((model) => model.category === "tokenizer");
  const inferenceModels = visibleModels.filter((model) => model.inference_mode);
  const ttsModels = inferenceModels.filter((model) => model.category !== "voice_design");
  const voiceBoxModels = visibleModels.filter((model) => isVoiceBoxModel(model));
  const plainCustomVoiceModels = visibleModels.filter(
    (model) => model.source === "finetuned" && model.inference_mode === "custom_voice" && !isVoiceBoxModel(model),
  );
  const trainingModelOptions =
    runForm.training_mode === "custom_voice"
      ? customVoiceCapableModels.filter((model) => !isVoiceBoxModel(model))
      : runForm.training_mode === "voicebox"
        ? voiceBoxModels
        : baseModels;
  const preferredStockBaseModel =
    baseModels.find((model) => model.label.includes("1.7B")) ??
    baseModels.find((model) => model.recommended) ??
    baseModels[0];
  const preferredStockCustomVoiceModel =
    customVoiceModels.find((model) => model.label.includes("1.7B")) ??
    customVoiceModels.find((model) => model.recommended) ??
    customVoiceModels[0];
  const preferredHybridCustomModel =
    customVoiceCapableModels.find((model) => model.source === "stock" && model.label.includes("1.7B")) ??
    customVoiceCapableModels.find((model) => model.source === "stock" && model.recommended) ??
    customVoiceCapableModels.find((model) => model.source === "stock") ??
    customVoiceCapableModels.find((model) => model.recommended) ??
    customVoiceCapableModels[0];
  const preferredInferenceModel =
    ttsModels.find((model) => model.source === "stock" && model.category === "custom_voice" && model.label.includes("1.7B")) ??
    ttsModels.find((model) => model.source === "stock" && model.recommended) ??
    ttsModels.find((model) => model.source === "stock") ??
    ttsModels.find((model) => model.recommended) ??
    ttsModels[0];
  const preferredVoiceBoxModel = voiceBoxModels[0];
  const selectedInferenceModel = ttsModels.find((model) => model.model_id === inferenceForm.model_id) ?? preferredInferenceModel ?? null;
  const selectedInferenceMode = selectedInferenceModel?.inference_mode ?? null;

  useEffect(() => {
    if (voiceDesignModels.length > 0 && !designForm.model_id) {
      const preferred = voiceDesignModels.find((model) => model.recommended) ?? voiceDesignModels[0];
      setDesignForm((prev) => ({ ...prev, model_id: preferred.model_id }));
    }
    if (baseModels.length > 0 && !selectedBaseModelId) {
      const preferred = preferredStockBaseModel;
      setSelectedBaseModelId(preferred.model_id);
      setRunForm((prev) => ({
        ...prev,
        init_model_path: prev.init_model_path || preferred.model_id,
        speaker_encoder_model_path: prev.speaker_encoder_model_path || preferred.model_id,
      }));
      setHybridForm((prev) => ({ ...prev, base_model_id: prev.base_model_id || preferred.model_id }));
    }
    if (customVoiceCapableModels.length > 0 && !hybridForm.custom_model_id) {
      const preferred = preferredHybridCustomModel;
      setHybridForm((prev) => ({ ...prev, custom_model_id: preferred.model_id }));
    }
    if (ttsModels.length > 0 && !inferenceForm.model_id) {
      const preferred = preferredInferenceModel;
      setInferenceForm((prev) => ({
        ...prev,
        model_id: preferred.model_id,
        speaker: preferred.default_speaker || prev.speaker,
      }));
    }
    if (tokenizerModels.length > 0 && !runForm.tokenizer_model_path) {
      setRunForm((prev) => ({ ...prev, tokenizer_model_path: tokenizerModels[0].model_id }));
    }
    if (plainCustomVoiceModels.length > 0 && !voiceBoxFusionForm.input_checkpoint_path) {
      setVoiceBoxFusionForm((prev) => ({ ...prev, input_checkpoint_path: plainCustomVoiceModels[0].model_id }));
    }
    if (baseModels.length > 0 && !voiceBoxFusionForm.speaker_encoder_source_path) {
      const preferred = preferredStockBaseModel;
      setVoiceBoxFusionForm((prev) => ({ ...prev, speaker_encoder_source_path: preferred.model_id }));
    }
    if (voiceBoxModels.length > 0) {
      const preferred = voiceBoxModels[0];
      if (!voiceBoxCloneForm.model_id) {
        setVoiceBoxCloneForm((prev) => ({ ...prev, model_id: preferred.model_id, speaker: preferred.default_speaker || prev.speaker }));
      }
      if (!voiceBoxPresetForm.model_id) {
        setVoiceBoxPresetForm((prev) => ({ ...prev, model_id: preferred.model_id }));
      }
      if (!voiceBoxPresetInstructForm.model_id) {
        setVoiceBoxPresetInstructForm((prev) => ({ ...prev, model_id: preferred.model_id }));
      }
    }
  }, [customVoiceCapableModels, customVoiceModels, voiceDesignModels, baseModels, ttsModels, tokenizerModels, plainCustomVoiceModels, voiceBoxModels, designForm.model_id, selectedBaseModelId, inferenceForm.model_id, hybridForm.custom_model_id, runForm.init_model_path, runForm.speaker_encoder_model_path, runForm.tokenizer_model_path, voiceBoxFusionForm.input_checkpoint_path, voiceBoxFusionForm.speaker_encoder_source_path, voiceBoxCloneForm.model_id, voiceBoxPresetForm.model_id, voiceBoxPresetInstructForm.model_id, preferredStockBaseModel, preferredStockCustomVoiceModel, preferredHybridCustomModel, preferredInferenceModel]);

  useEffect(() => {
    if (!selectedInferenceModel) {
      return;
    }

    setInferenceForm((prev) => {
      const next = { ...prev };
      if (prev.model_id !== selectedInferenceModel.model_id) {
        next.model_id = selectedInferenceModel.model_id;
      }
      if (selectedInferenceMode === "custom_voice") {
        next.speaker = selectedInferenceModel.default_speaker || prev.speaker || "";
      } else {
        next.speaker = "";
      }
      if (selectedInferenceMode !== "voice_clone") {
        next.ref_audio_path = "";
        next.ref_text = "";
        next.voice_clone_prompt_path = "";
        next.x_vector_only_mode = false;
      }
      if (!selectedInferenceModel.supports_instruction && prev.instruct) {
        next.instruct = prev.instruct;
      }
      return next;
    });
  }, [selectedInferenceModel, selectedInferenceMode]);

  useEffect(() => {
    if (!voiceChangerModels.length || voiceChangerForm.selected_model_id) {
      return;
    }
    const firstModel = voiceChangerModels[0];
    setVoiceChangerForm((prev) => ({
      ...prev,
      selected_model_id: firstModel.id,
      model_path: firstModel.model_path,
      index_path: firstModel.index_path || "",
    }));
  }, [voiceChangerModels, voiceChangerForm.selected_model_id]);

  useEffect(() => {
    setSelectedGalleryIds((prev) => prev.filter((id) => history.some((record) => gallerySelectionKey(record) === id)));
  }, [history]);

  useEffect(() => {
    setRunForm((prev) => {
      if (prev.training_mode === "custom_voice") {
        const preferredCustom = preferredStockCustomVoiceModel;
        const preferredBase = preferredStockBaseModel;
        return {
          ...prev,
          init_model_path: preferredCustom?.model_id || prev.init_model_path,
          speaker_encoder_model_path: preferredBase?.model_id || prev.speaker_encoder_model_path,
        };
      }

      if (prev.training_mode === "voicebox") {
        return {
          ...prev,
          init_model_path: preferredVoiceBoxModel?.model_id || prev.init_model_path,
          speaker_encoder_model_path: "",
        };
      }

      const preferredBase = preferredStockBaseModel;
      return {
        ...prev,
        init_model_path: preferredBase?.model_id || prev.init_model_path,
      };
    });
  }, [runForm.training_mode, preferredStockCustomVoiceModel, preferredStockBaseModel, preferredVoiceBoxModel]);

  useEffect(() => {
    if (!health) {
      return;
    }
    setRunForm((prev) => {
      if (health.simulation_mode && !prev.simulate_only) {
        return { ...prev, simulate_only: true };
      }
      return prev;
    });
  }, [health]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const selectedHybridPreset = presets.find((preset) => preset.id === selectedHybridPresetId) ?? null;
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const lastCreatedDataset = datasets.find((dataset) => dataset.id === lastCreatedDatasetId) ?? null;
  const datasetReadyForTraining = Boolean(selectedDataset?.prepared_jsonl_path);
  const generatedAudioAssets = audioAssets.filter((asset) => asset.source === "generated");
  const selectedAudioEditorAsset = audioAssets.find((asset) => asset.path === audioEditorForm.audio_path) ?? null;
  const selectedAudioDenoiseAsset = audioAssets.find((asset) => asset.path === audioDenoiseForm.audio_path) ?? null;
  const audioEditorBars = makeWaveBars(
    `${audioEditorForm.audio_path}|${audioEditorForm.start_sec}|${audioEditorForm.end_sec}|${audioEditorForm.gain_db}`,
    96,
  );
  const audioEditorDurationLimit = Math.max(audioEditorDuration || 0, Number(audioEditorForm.end_sec || "0"), Number(audioEditorForm.start_sec || "0"), 1);
  const audioEditorStart = Math.min(audioEditorDurationLimit, Math.max(0, Number(audioEditorForm.start_sec || "0")));
  const audioEditorEnd = audioEditorForm.end_sec.trim()
    ? Math.min(audioEditorDurationLimit, Math.max(audioEditorStart, Number(audioEditorForm.end_sec || "0")))
    : audioEditorDurationLimit;
  const audioEditorRegionLeft = `${(audioEditorStart / audioEditorDurationLimit) * 100}%`;
  const audioEditorRegionWidth = `${Math.max(1, ((audioEditorEnd - audioEditorStart) / audioEditorDurationLimit) * 100)}%`;
  const audioDenoiseBars = makeWaveBars(
    `${audioDenoiseForm.audio_path}|${audioDenoiseForm.strength}|${audioDenoiseForm.highpass_hz}|${audioDenoiseForm.lowpass_hz}`,
    96,
  );
  const audioToolCapabilityMap = new Map(audioToolCapabilities.map((capability) => [capability.key, capability]));
  const audioAssetByPath = new Map(audioAssets.map((asset) => [asset.path, asset]));
  const assetTextByPath = new Map(
    audioAssets.map((asset) => [asset.path, (asset.transcript_text || "").trim()]),
  );
  const soundEffectsAvailable = audioToolCapabilityMap.get("sound_effects")?.available ?? true;
  const voiceChangerAvailable = audioToolCapabilityMap.get("voice_changer")?.available ?? true;
  const audioSeparationAvailable = audioToolCapabilityMap.get("audio_separation")?.available ?? true;
  const aceStepAvailable = audioToolCapabilityMap.get("ace_step")?.available ?? false;
  const aceStepNotes = audioToolCapabilityMap.get("ace_step")?.notes || "";
  const pageMeta = PRODUCT_PAGES[activeTab];
  const pageTitle = t(`page.${activeTab}.title`, pageMeta.title);
  const pageDescription = t(`page.${activeTab}.description`, pageMeta.description);
  const selectedGuideSection = GUIDE_SECTIONS.find((section) => section.title === activeGuideTitle) ?? GUIDE_SECTIONS[0];
  const currentS2ProMode = isS2ProTab(activeTab) ? s2ProTabToMode(activeTab) : s2ProMode;
  const currentAceStepMode = isAceStepTab(activeTab) ? ACE_STEP_TAB_TO_MODE[activeTab] : aceStepMode;
  const aceComposerBars = makeWaveBars(`${aceStepForm.prompt}|${aceStepForm.lyrics}|${aceStepForm.audio_duration}`, 72);
  const galleryStats = {
    total: history.length,
    speech: history.filter((record) => galleryAccentForMode(record.mode) === "speech" || galleryAccentForMode(record.mode) === "voice").length,
    music: history.filter((record) => galleryAccentForMode(record.mode) === "music").length,
    audio: history.filter((record) => ["audio", "effect"].includes(galleryAccentForMode(record.mode))).length,
  };
  const selectedS2Voice = s2ProVoices.find((voice) => voice.id === selectedS2VoiceId || voice.reference_id === selectedS2VoiceId) ?? null;
  const activeStudioModel =
    selectedInferenceModel ??
    voiceDesignModels.find((model) => model.model_id === designForm.model_id) ??
    preferredVoiceBoxModel ??
    preferredInferenceModel ??
    visibleModels[0] ??
    null;
  const activeVoiceName =
    selectedS2Voice?.name ||
    activeStudioModel?.default_speaker ||
    inferenceForm.speaker ||
    "Mai";
  const activeModelLabel = activeStudioModel ? displayModelName(activeStudioModel) : "No model";
  const activeModelFamily =
    activeStudioModel?.model_family ||
    activeStudioModel?.category ||
    (isS2ProTab(activeTab) ? "S2-Pro" : isAceStepTab(activeTab) ? "ACE-Step" : "Voice Studio");
  const latestGalleryItem = history[0] ?? null;
  const s2VoiceProjects = s2ProVoices.map((voice) => {
    const relatedHistory = history.filter((record) => {
      const metaReferenceId = String(record.meta?.reference_id || record.meta?.s2_reference_id || record.meta?.voice_id || "");
      return (
        record.source_ref_audio_path === voice.reference_audio_path ||
        metaReferenceId === voice.id ||
        metaReferenceId === voice.reference_id
      );
    });
    const relatedPresets = presets.filter(
      (preset) =>
        preset.reference_audio_path === voice.reference_audio_path ||
        (!!voice.qwen_clone_prompt_path && preset.clone_prompt_path === voice.qwen_clone_prompt_path),
    );
    return { voice, relatedHistory, relatedPresets };
  });
  const presetPromptPaths = new Set(presets.map((preset) => preset.clone_prompt_path).filter(Boolean));
  const rawQwenClonePrompts = clonePrompts.filter((prompt) => !presetPromptPaths.has(prompt.prompt_path));
  const qwenVoiceAssetCount = presets.length + rawQwenClonePrompts.length;
  const filteredS2TagCategories = S2_PRO_TAG_CATEGORIES.map((category) => ({
    ...category,
    tags: category.tags.filter((tag) => {
      const query = s2TagSearch.trim().toLowerCase();
      return !query || `${category.label} ${tag}`.toLowerCase().includes(query);
    }),
  })).filter((category) => category.tags.length > 0);
  const cloneModelOptions = [...baseModels, ...voiceBoxModels];
  const selectedCloneModelId = cloneEngine === "voicebox" ? voiceBoxCloneForm.model_id : selectedBaseModelId;
  const selectedVoiceChangerModel = voiceChangerModels.find((item) => item.id === voiceChangerForm.selected_model_id) ?? null;
  const selectedVoiceChangerAsset = voiceChangerForm.audio_path ? audioAssetByPath.get(voiceChangerForm.audio_path) ?? null : null;
  const selectedApplioBatchAssets = applioBatchPaths.map((path) => audioAssetByPath.get(path)).filter((asset): asset is AudioAsset => Boolean(asset));
  const selectedApplioBatchExternalPaths = applioBatchPaths.filter((path) => !audioAssetByPath.has(path));
  const selectedBlendModelA = voiceChangerModels.find((item) => item.model_path === applioBlendForm.model_path_a) ?? null;
  const selectedBlendModelB = voiceChangerModels.find((item) => item.model_path === applioBlendForm.model_path_b) ?? null;
  const selectedDatasetReferenceAsset = datasetForm.ref_audio_path ? audioAssetByPath.get(datasetForm.ref_audio_path) ?? null : null;
  const selectedDatasetSampleAssets = datasetSamples
    .filter((sample) => sample.audio_path.trim())
    .map((sample, index) => ({ sample, index, asset: audioAssetByPath.get(sample.audio_path) ?? null }));
  const filteredSoundEffectLibrary = SOUND_EFFECT_LIBRARY.filter((item) => {
    const query = audioEffectsSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.title} ${item.subtitle} ${item.prompt}`.toLowerCase().includes(query);
  });
  function updateDatasetSample(
    index: number,
    patch: {
      audio_path?: string;
      text?: string;
      original_filename?: string;
    },
  ) {
    setDatasetSamples((prev) =>
      prev.map((sample, sampleIndex) => (sampleIndex === index ? { ...sample, ...patch } : sample)),
    );
  }

  function mergeDatasetSamples(nextSamples: Array<{ audio_path: string; text?: string; original_filename?: string }>) {
    setDatasetSamples((prev) => {
      const merged = [...prev];
      const existingIndexByPath = new Map(
        merged
          .map((sample, index) => [normalizeDatasetPath(sample.audio_path), index] as const)
          .filter(([path]) => path),
      );

      nextSamples.forEach((sample) => {
        const normalizedPath = normalizeDatasetPath(sample.audio_path);
        if (!normalizedPath) {
          return;
        }

        const existingIndex = existingIndexByPath.get(normalizedPath);
        if (existingIndex !== undefined) {
          const current = merged[existingIndex];
          merged[existingIndex] = {
            ...current,
            audio_path: normalizedPath,
            original_filename: sample.original_filename || current.original_filename || basenameFromPath(normalizedPath),
            text: sample.text?.trim() || current.text || "",
          };
          return;
        }

        merged.push({
          audio_path: normalizedPath,
          text: sample.text?.trim() || "",
          original_filename: sample.original_filename || basenameFromPath(normalizedPath),
        });
        existingIndexByPath.set(normalizedPath, merged.length - 1);
      });

      return merged.length > 0 ? merged : [createEmptyDatasetSample()];
    });
  }

  async function transcribeUploadedReference(audioPath: string) {
    const result = await api.transcribeAudio(audioPath);
    setUploadRefText(result.text);
    setUploadTranscriptMeta(
      result.simulation
        ? "자동 전사 placeholder가 채워졌습니다. 실제 문장으로 꼭 수정하세요."
        : `자동 전사 완료${result.language ? ` · ${result.language}` : ""}`,
    );
  }

  function applyCustomRecipe(item: { text?: string; instruction?: string; language?: string }) {
    setInferenceForm((prev) => ({
      ...prev,
      text: item.text || prev.text,
      instruct: item.instruction || prev.instruct,
      language: item.language || prev.language,
      model_id: preferredStockCustomVoiceModel?.model_id || prev.model_id,
      speaker: preferredStockCustomVoiceModel?.default_speaker || prev.speaker,
    }));
  }

  function applyDesignRecipe(item: { instruction?: string }) {
    setDesignForm((prev) => ({
      ...prev,
      instruct: item.instruction || prev.instruct,
    }));
  }

  function applyHybridRecipe(item: { text?: string; instruction?: string; language?: string }) {
    setHybridForm((prev) => ({
      ...prev,
      text: item.text || prev.text,
      instruct: item.instruction || prev.instruct,
      language: item.language || prev.language,
    }));
  }

  function openS2ProTab(tab: Extract<TabKey, "s2pro_tagged" | "s2pro_clone" | "s2pro_multi_speaker" | "s2pro_multilingual">) {
    setS2ProMode(s2ProTabToMode(tab));
    setActiveTab(tab);
  }

  function openAceStepTab(tab: AceStepTabKey) {
    setAceStepMode(ACE_STEP_TAB_TO_MODE[tab]);
    setActiveTab(tab);
  }

  function applyS2ProTag(prompt: string) {
    setS2ProForm((prev) => ({
      ...prev,
      text: prev.text.trim() ? `${prev.text.trim()} ${prompt}` : prompt,
    }));
  }

  function handleSelectS2ProReference(asset: AudioAsset) {
    setS2ProForm((prev) => ({
      ...prev,
      reference_audio_path: asset.path,
      reference_text: asset.transcript_text?.trim() || prev.reference_text,
    }));
    setS2ProVoiceForm((prev) => ({
      ...prev,
      reference_audio_path: asset.path,
      reference_text: asset.transcript_text?.trim() || prev.reference_text,
      name: prev.name === "새-s2pro-목소리" ? basenameFromPath(asset.path).replace(/\.[^.]+$/, "") : prev.name,
    }));
    setMessage(`${asset.filename}을 S2-Pro 참조 음성으로 선택했습니다.`);
  }

  async function handleUploadS2ProReference(file: File) {
    await runAction(async () => {
      const result = await api.uploadAudio(file);
      setS2ProUploadedRef(result);
      setS2ProCloneSource("upload");
      setS2ProVoiceForm((prev) => ({
        ...prev,
        reference_audio_path: result.path,
        name: prev.name === "새-s2pro-목소리" ? basenameFromPath(result.path).replace(/\.[^.]+$/, "") : prev.name,
      }));
      await refreshAll();
      setMessage(`${result.filename}을 S2-Pro 참조 음성으로 불러왔습니다.`);
    });
  }

  async function handleTranscribeS2ProReference() {
    if (!s2ProVoiceForm.reference_audio_path) {
      setMessage("먼저 S2-Pro 참조 음성을 선택하거나 업로드하세요.");
      return;
    }
    const savedTranscript = assetTextByPath.get(s2ProVoiceForm.reference_audio_path);
    if (savedTranscript) {
      setS2ProVoiceForm((prev) => ({ ...prev, reference_text: savedTranscript }));
      setMessage("생성 갤러리에 저장된 대사를 참조 텍스트로 불러왔습니다.");
      return;
    }
    await runAction(async () => {
      const result = await api.transcribeAudio(s2ProVoiceForm.reference_audio_path);
      setS2ProVoiceForm((prev) => ({ ...prev, reference_text: result.text }));
      setMessage(result.simulation ? "전사 placeholder가 채워졌습니다. 실제 문장으로 수정하세요." : "S2-Pro 참조 음성을 전사했습니다.");
    });
  }

  function useS2VoiceInQwen(voice: S2ProVoiceRecord, target: "tts" | "clone") {
    if (target === "clone") {
      setUploadedRef({
        id: voice.id,
        filename: basenameFromPath(voice.reference_audio_path),
        path: voice.reference_audio_path,
        url: mediaUrl(voice.reference_audio_url),
      });
      setUploadRefText(voice.reference_text);
      setActiveTab("clone");
    } else {
      setInferenceForm((prev) => ({
        ...prev,
        ref_audio_path: voice.reference_audio_path,
        ref_text: voice.reference_text,
        voice_clone_prompt_path: voice.qwen_clone_prompt_path || prev.voice_clone_prompt_path,
        output_name: voice.name,
      }));
      setActiveTab("tts");
    }
    setMessage(`${voice.name}을 Qwen 작업에 연결했습니다.`);
  }

  function createS2VoiceFromQwenAsset(asset: {
    name: string;
    reference_audio_path: string;
    reference_text: string;
    language?: string;
  }) {
    runAction(async () => {
      if (!asset.reference_audio_path || !asset.reference_text.trim()) {
        setMessage("S2-Pro 목소리로 저장하려면 참조 음성과 참조 텍스트가 모두 필요합니다.");
        return;
      }
      const voice = await api.createS2ProVoice({
        name: asset.name,
        runtime_source: s2ProVoiceForm.runtime_source,
        reference_audio_path: asset.reference_audio_path,
        reference_text: asset.reference_text,
        language: asset.language || "Auto",
        notes: "Qwen 목소리 자산에서 만든 S2-Pro 목소리",
        create_qwen_prompt: false,
      });
      setSelectedS2VoiceId(voice.id);
      await refreshAll();
      setMessage(`${voice.name}을 S2-Pro 목소리로 저장했습니다.`);
    });
  }

  function handleCreateS2ProVoice(event?: FormEvent) {
    event?.preventDefault();
    runAction(async () => {
      const voice = await api.createS2ProVoice({
        name: s2ProVoiceForm.name,
        runtime_source: s2ProVoiceForm.runtime_source,
        reference_audio_path: s2ProVoiceForm.reference_audio_path,
        reference_text: s2ProVoiceForm.reference_text,
        language: s2ProVoiceForm.language,
        notes: s2ProVoiceForm.notes,
        create_qwen_prompt: s2ProVoiceForm.create_qwen_prompt,
        qwen_model_id: selectedBaseModelId,
      });
      setSelectedS2VoiceId(voice.id);
      await refreshAll();
      setMessage(`${voice.name}을 S2-Pro 목소리로 저장했습니다.`);
    });
  }

  async function handleS2ProSubmit(event?: FormEvent) {
    event?.preventDefault();
    const textByMode =
      currentS2ProMode === "clone"
        ? s2ProForm.clone_text
        : currentS2ProMode === "multi_speaker"
          ? s2ProForm.speaker_script
          : s2ProForm.text;
    await runAction(async () => {
      const response = await api.generateS2Pro({
        mode: currentS2ProMode,
        runtime_source: s2ProForm.runtime_source,
        text: textByMode,
        language: s2ProForm.language,
        output_name: s2ProForm.output_name,
        instruction: s2ProForm.instruction,
        reference_audio_path: currentS2ProMode === "clone" && !selectedS2Voice ? s2ProForm.reference_audio_path || undefined : undefined,
        reference_text: currentS2ProMode === "clone" && !selectedS2Voice ? s2ProForm.reference_text || undefined : undefined,
        reference_id: selectedS2Voice?.id || undefined,
        reference_ids: currentS2ProMode === "multi_speaker" && selectedS2Voice ? [selectedS2Voice.id] : undefined,
        temperature: Number(s2ProForm.temperature || "0.7"),
        top_p: Number(s2ProForm.top_p || "0.8"),
        max_new_tokens: Number(s2ProForm.max_tokens || "2048"),
        output_format: "wav",
        sample_rate: 44100,
      });
      setLastS2ProRecord(response.record);
      await refreshAll();
      setMessage("S2-Pro 생성이 완료되어 생성 갤러리에 저장했습니다.");
    });
  }

  function applySoundEffectRecipe(item: { prompt: string; profile?: string; duration?: string }) {
    const seconds = item.duration?.includes(":")
      ? Number(item.duration.split(":").pop() || "4")
      : Number(item.duration || soundEffectForm.duration_sec);
    setSoundEffectForm((prev) => ({
      ...prev,
      prompt: item.prompt,
      model_profile: item.profile || prev.model_profile,
      duration_sec: Number.isFinite(seconds) && seconds > 0 ? String(seconds) : prev.duration_sec,
    }));
  }

  function toggleGallerySelection(recordId: string) {
    setSelectedGalleryIds((prev) => (prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]));
  }

  async function handleDeleteHistoryRecord(recordId: string) {
    await runAction(async () => {
      setHistory((prev) => prev.filter((record) => record.id !== recordId));
      setSelectedGalleryIds((prev) => prev.filter((id) => id !== recordId));
      await api.deleteHistoryRecord(recordId);
      await refreshAll();
      setMessage("선택한 생성 음성을 삭제했습니다.");
    });
  }

  async function handleDeleteSelectedHistory() {
    if (selectedGalleryIds.length === 0) {
      setMessage("먼저 삭제할 음성을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const selectedKeys = [...selectedGalleryIds];
      const selectedRecords = history.filter((record) => selectedKeys.includes(gallerySelectionKey(record)));
      setHistory((prev) => prev.filter((record) => !selectedKeys.includes(gallerySelectionKey(record))));
      await api.deleteHistoryBatch(Array.from(new Set(selectedRecords.map((record) => record.id))));
      setSelectedGalleryIds([]);
      await refreshAll();
      setMessage("선택한 생성 음성을 삭제했습니다.");
    });
  }

  async function handleSoundEffectSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.generateSoundEffect({
        prompt: soundEffectForm.prompt,
        model_profile: soundEffectForm.model_profile,
        duration_sec: Number(soundEffectForm.duration_sec || "4"),
        intensity: Number(soundEffectForm.intensity || "0.9"),
        seed: soundEffectForm.seed.trim() ? Number(soundEffectForm.seed) : undefined,
        steps: soundEffectForm.steps.trim() ? Number(soundEffectForm.steps) : undefined,
        cfg_scale: soundEffectForm.cfg_scale.trim() ? Number(soundEffectForm.cfg_scale) : undefined,
        negative_prompt: soundEffectForm.negative_prompt.trim() || undefined,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("사운드 이펙트를 생성했습니다.");
    });
  }

  async function handleAceStepSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.generateAceStepMusic({
        output_name: aceStepForm.output_name,
        prompt: aceStepForm.prompt,
        lyrics: aceStepForm.lyrics,
        audio_duration: Number(aceStepForm.audio_duration || "60"),
        infer_step: Number(aceStepForm.infer_step || "27"),
        guidance_scale: Number(aceStepForm.guidance_scale || "15"),
        scheduler_type: aceStepForm.scheduler_type,
        cfg_type: aceStepForm.cfg_type,
        omega_scale: Number(aceStepForm.omega_scale || "10"),
        manual_seeds: aceStepForm.manual_seeds,
        guidance_interval: Number(aceStepForm.guidance_interval || "0.5"),
        guidance_interval_decay: Number(aceStepForm.guidance_interval_decay || "0"),
        min_guidance_scale: Number(aceStepForm.min_guidance_scale || "3"),
        use_erg_tag: aceStepForm.use_erg_tag,
        use_erg_lyric: aceStepForm.use_erg_lyric,
        use_erg_diffusion: aceStepForm.use_erg_diffusion,
        oss_steps: aceStepForm.oss_steps,
        guidance_scale_text: Number(aceStepForm.guidance_scale_text || "0"),
        guidance_scale_lyric: Number(aceStepForm.guidance_scale_lyric || "0"),
        bf16: aceStepForm.bf16,
        torch_compile: aceStepForm.torch_compile,
        cpu_offload: aceStepForm.cpu_offload,
        overlapped_decode: aceStepForm.overlapped_decode,
        device_id: Number(aceStepForm.device_id || "0"),
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage("ACE-Step 음악 생성이 완료되어 생성 갤러리에 저장했습니다.");
    });
  }

  function aceStepCommonPayload() {
    const seedsRaw = (aceStepForm.manual_seeds || "").trim();
    const lorasInput: { path: string; adapter_name?: string; scale?: number }[] = [];
    if (aceStepCommonForm.lora_path.trim()) {
      const entry: { path: string; adapter_name?: string; scale?: number } = {
        path: aceStepCommonForm.lora_path.trim(),
      };
      if (aceStepCommonForm.lora_adapter_name.trim()) entry.adapter_name = aceStepCommonForm.lora_adapter_name.trim();
      if (aceStepCommonForm.lora_scale.trim()) entry.scale = Number(aceStepCommonForm.lora_scale);
      lorasInput.push(entry);
    }
    return {
      output_name: aceStepForm.output_name,
      caption: aceStepForm.prompt,
      prompt: aceStepForm.prompt,
      lyrics: aceStepForm.lyrics,
      duration: Number(aceStepForm.audio_duration || "60"),
      inference_steps: Number(aceStepForm.infer_step || "27"),
      guidance_scale: Number(aceStepForm.guidance_scale || "15"),
      seeds: seedsRaw,
      use_random_seed: !seedsRaw,
      cpu_offload: aceStepForm.cpu_offload,
      compile_model: aceStepForm.torch_compile,
      config_path: aceStepCommonForm.config_path || undefined,
      lm_model_path: aceStepCommonForm.lm_model_path || undefined,
      loras: lorasInput,
    };
  }

  async function loadAceStepRuntime() {
    try {
      const data = await api.aceStepRuntime();
      setAceStepRuntime(data);
    } catch {
      setAceStepRuntime(null);
    }
  }

  async function handleAceStepCoverSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepCover({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        audio_cover_strength: Number(aceStepCoverForm.audio_cover_strength || "1"),
        cover_noise_strength: Number(aceStepCoverForm.cover_noise_strength || "0"),
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage("Cover 생성이 완료되어 갤러리에 저장했습니다.");
    });
  }

  async function handleAceStepRepaintSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepRepaint({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        repainting_start: Number(aceStepRepaintForm.repainting_start || "0"),
        repainting_end: Number(aceStepRepaintForm.repainting_end || "-1"),
        repaint_mode: aceStepRepaintForm.repaint_mode as "balanced" | "conservative" | "aggressive",
        repaint_strength: Number(aceStepRepaintForm.repaint_strength || "0.5"),
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage("Repaint 결과를 갤러리에 저장했습니다.");
    });
  }

  async function handleAceStepExtendSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepExtend({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        complete_tracks: aceStepExtendForm.complete_tracks,
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage("Extend 결과를 갤러리에 저장했습니다.");
    });
  }

  async function handleAceStepExtractSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepExtract({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        extract_track: aceStepExtractForm.extract_track,
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage(`Extract(${aceStepExtractForm.extract_track}) 결과를 갤러리에 저장했습니다.`);
    });
  }

  async function handleAceStepLegoSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepLego({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        lego_track: aceStepLegoForm.lego_track,
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage(`Lego(${aceStepLegoForm.lego_track}) 트랙을 추가했습니다.`);
    });
  }

  async function handleAceStepCompleteSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.aceStepComplete({
        ...aceStepCommonPayload(),
        src_audio: aceStepAudioForm.src_audio,
        complete_tracks: aceStepCompleteForm.complete_tracks,
      });
      setLastAceStepRecord(response.record);
      await refreshAll();
      setMessage("Complete 결과를 갤러리에 저장했습니다.");
    });
  }

  async function handleAceStepUnderstandSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.aceStepUnderstand({
        src_audio: aceStepAudioForm.src_audio,
        config_path: aceStepCommonForm.config_path || undefined,
        lm_model_path: aceStepCommonForm.lm_model_path || undefined,
        cpu_offload: aceStepForm.cpu_offload,
      });
      setAceStepUnderstandResult(result);
      setMessage(result.success ? "오디오 메타데이터 추출이 끝났습니다." : `Understand 실패: ${result.error || ""}`);
    });
  }

  async function handleAceStepCreateSampleSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.aceStepCreateSample({
        query: aceStepCreateSampleForm.query,
        instrumental: aceStepCreateSampleForm.instrumental,
        vocal_language: aceStepCreateSampleForm.vocal_language || undefined,
        config_path: aceStepCommonForm.config_path || undefined,
        lm_model_path: aceStepCommonForm.lm_model_path || undefined,
      });
      setAceStepUnderstandResult(result);
      if (result.success) {
        setAceStepForm((prev) => ({
          ...prev,
          prompt: result.caption || prev.prompt,
          lyrics: result.lyrics || prev.lyrics,
        }));
      }
      setMessage(result.success ? "Inspiration 결과를 가져왔습니다. text2music 폼으로 옮겨두었어요." : `Inspiration 실패: ${result.error || ""}`);
    });
  }

  async function handleAceStepFormatSampleSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.aceStepFormatSample({
        caption: aceStepForm.prompt,
        lyrics: aceStepForm.lyrics,
        config_path: aceStepCommonForm.config_path || undefined,
        lm_model_path: aceStepCommonForm.lm_model_path || undefined,
      });
      setAceStepUnderstandResult(result);
      if (result.success) {
        setAceStepForm((prev) => ({
          ...prev,
          prompt: result.caption || prev.prompt,
          lyrics: result.lyrics || prev.lyrics,
        }));
      }
      setMessage(result.success ? "Format 결과를 폼에 반영했습니다." : `Format 실패: ${result.error || ""}`);
    });
  }

  useEffect(() => {
    if (isAceStepTab(activeTab) && aceStepRuntime === null) {
      loadAceStepRuntime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleAudioToolUpload(file: File) {
    await runAction(async () => {
      const result = await api.uploadAudio(file);
      setAudioToolUpload(result);
      setVoiceChangerForm((prev) => ({ ...prev, audio_path: result.path }));
      setAudioConvertForm((prev) => ({ ...prev, audio_path: result.path }));
      setAudioEditorForm((prev) => ({ ...prev, audio_path: result.path, output_name: prev.output_name || basenameFromPath(result.filename) }));
      setAudioDenoiseForm((prev) => ({ ...prev, audio_path: result.path, output_name: prev.output_name || `clean-${basenameFromPath(result.filename)}` }));
      setAudioSeparationForm((prev) => ({ ...prev, audio_path: result.path }));
      setMessage(`${result.filename} 파일을 불러왔습니다.`);
    });
  }

  function handleSelectAudioToolAsset(asset: AudioAsset) {
    setAudioToolUpload(null);
    setVoiceChangerForm((prev) => ({ ...prev, audio_path: asset.path }));
    setAudioConvertForm((prev) => ({ ...prev, audio_path: asset.path }));
    setAudioEditorForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || basenameFromPath(asset.filename) }));
    setAudioDenoiseForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || `clean-${basenameFromPath(asset.filename)}` }));
    setAudioSeparationForm((prev) => ({ ...prev, audio_path: asset.path }));
    setMessage(`${asset.filename} 파일을 작업 입력으로 선택했습니다.`);
  }

  function handleAddGeneratedAssetToDataset(asset: AudioAsset) {
    mergeDatasetSamples([
      {
        audio_path: asset.path,
        text: asset.transcript_text || asset.text_preview || "",
        original_filename: asset.filename,
      },
    ]);
    if (!datasetForm.ref_audio_path) {
      setDatasetForm((prev) => ({ ...prev, ref_audio_path: asset.path }));
    }
    setMessage(`${asset.filename} 파일을 데이터셋 샘플에 추가했습니다.`);
  }

  function handleSelectDatasetReferenceAsset(asset: AudioAsset) {
    setDatasetForm((prev) => ({ ...prev, ref_audio_path: asset.path }));
    setMessage(`${asset.filename} 파일을 기준 음성으로 선택했습니다.`);
  }

  function handleSelectCloneModel(modelId: string) {
    const model = cloneModelOptions.find((item) => item.model_id === modelId);
    if (model && isVoiceBoxModel(model)) {
      setCloneEngine("voicebox");
      setVoiceBoxCloneForm((prev) => ({ ...prev, model_id: modelId, speaker: model.default_speaker || prev.speaker }));
      return;
    }

    setCloneEngine("base_prompt");
    setSelectedBaseModelId(modelId);
  }

  function handleSelectVoiceChangerModel(modelId: string) {
    const selected = voiceChangerModels.find((item) => item.id === modelId);
    setVoiceChangerForm((prev) => ({
      ...prev,
      selected_model_id: modelId,
      model_path: selected?.model_path || "",
      index_path: selected?.index_path || "",
    }));
  }

  async function handleVoiceChangerSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.changeVoice({
        audio_path: voiceChangerForm.audio_path,
        model_path: voiceChangerForm.model_path || undefined,
        index_path: voiceChangerForm.index_path || undefined,
        pitch_shift_semitones: Number(voiceChangerForm.pitch_shift_semitones || "0"),
        f0_method: voiceChangerForm.f0_method,
        index_rate: Number(voiceChangerForm.index_rate || "0.3"),
        protect: Number(voiceChangerForm.protect || "0.33"),
        split_audio: voiceChangerForm.split_audio,
        f0_autotune: voiceChangerForm.f0_autotune,
        clean_audio: voiceChangerForm.clean_audio,
        clean_strength: Number(voiceChangerForm.clean_strength || "0.7"),
        embedder_model: voiceChangerForm.embedder_model,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("원본 음성의 음색을 변환했습니다.");
    });
  }

  async function handleRvcTrainSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.trainRvcModel({
        model_name: rvcTrainForm.model_name,
        dataset_path: rvcTrainForm.dataset_path,
        sample_rate: Number(rvcTrainForm.sample_rate || "40000"),
        total_epoch: Number(rvcTrainForm.total_epoch || "100"),
        batch_size: Number(rvcTrainForm.batch_size || "4"),
        cpu_cores: Number(rvcTrainForm.cpu_cores || "4"),
        gpu: rvcTrainForm.gpu,
        f0_method: rvcTrainForm.f0_method,
        embedder_model: rvcTrainForm.embedder_model,
        cut_preprocess: rvcTrainForm.cut_preprocess,
        noise_reduction: rvcTrainForm.noise_reduction,
        clean_strength: Number(rvcTrainForm.clean_strength || "0.7"),
        chunk_len: Number(rvcTrainForm.chunk_len || "3.0"),
        overlap_len: Number(rvcTrainForm.overlap_len || "0.3"),
        index_algorithm: rvcTrainForm.index_algorithm,
        checkpointing: rvcTrainForm.checkpointing,
      });
      setLastRvcTrainingResult(`${result.model_name} 모델 학습이 끝났습니다.`);
      await refreshAll();
      setActiveTab("applio_convert");
      setMessage("RVC 모델을 만들었습니다. 변환 탭에서 바로 선택할 수 있습니다.");
    });
  }

  async function handleVoiceChangerBatchSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.changeVoiceBatch({
        audio_paths: applioBatchPaths,
        model_path: voiceChangerForm.model_path || undefined,
        index_path: voiceChangerForm.index_path || undefined,
        pitch_shift_semitones: Number(voiceChangerForm.pitch_shift_semitones || "0"),
        f0_method: voiceChangerForm.f0_method,
        index_rate: Number(voiceChangerForm.index_rate || "0.3"),
        protect: Number(voiceChangerForm.protect || "0.33"),
        split_audio: voiceChangerForm.split_audio,
        f0_autotune: voiceChangerForm.f0_autotune,
        clean_audio: voiceChangerForm.clean_audio,
        clean_strength: Number(voiceChangerForm.clean_strength || "0.7"),
        embedder_model: voiceChangerForm.embedder_model,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage(`${result.assets.length}개 음성을 변환했습니다.`);
    });
  }

  async function handleVoiceModelBlendSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.blendVoiceModels({
        model_name: applioBlendForm.model_name,
        model_path_a: applioBlendForm.model_path_a,
        model_path_b: applioBlendForm.model_path_b,
        ratio: Number(applioBlendForm.ratio || "0.5"),
      });
      setLastRvcTrainingResult(`${result.model_name} 블렌딩 모델이 생성됐습니다.`);
      await refreshAll();
      setMessage("Applio 모델 블렌딩을 완료했습니다.");
    });
  }

  function addApplioBatchAsset(asset: AudioAsset) {
    setApplioBatchPaths((prev) => (prev.includes(asset.path) ? prev : [...prev, asset.path]));
  }

  function addApplioBatchManualPath() {
    const path = applioBatchManualPath.trim();
    if (!path) {
      setMessage("추가할 오디오 경로를 입력하세요.");
      return;
    }
    setApplioBatchPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setApplioBatchManualPath("");
    setMessage(`${basenameFromPath(path)} 경로를 배치 변환 목록에 추가했습니다.`);
  }

  async function handleApplioBatchUpload(file: File) {
    await runAction(async () => {
      const result = await api.uploadAudio(file);
      setApplioBatchPaths((prev) => (prev.includes(result.path) ? prev : [...prev, result.path]));
      await refreshAll();
      setMessage(`${result.filename} 파일을 배치 변환 목록에 추가했습니다.`);
    });
  }

  async function handleAudioSeparation() {
    await runAction(async () => {
      const result = await api.separateAudio({
        audio_path: audioSeparationForm.audio_path,
        model_profile: audioSeparationForm.model_profile,
        output_format: audioSeparationForm.output_format,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("오디오 분리를 완료했습니다.");
    });
  }

  async function handleAudioEditSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!audioEditorForm.audio_path.trim()) {
      setMessage("편집할 오디오를 먼저 선택하세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.editAudio({
        audio_path: audioEditorForm.audio_path,
        output_name: audioEditorForm.output_name || undefined,
        start_sec: Math.max(0, Number(audioEditorForm.start_sec || "0")),
        end_sec: audioEditorForm.end_sec.trim() ? Math.max(0, Number(audioEditorForm.end_sec)) : undefined,
        gain_db: Number(audioEditorForm.gain_db || "0"),
        fade_in_sec: Math.max(0, Number(audioEditorForm.fade_in_sec || "0")),
        fade_out_sec: Math.max(0, Number(audioEditorForm.fade_out_sec || "0")),
        normalize: audioEditorForm.normalize,
        reverse: audioEditorForm.reverse,
        output_format: audioEditorForm.output_format,
        sample_rate: Number(audioEditorForm.sample_rate || "44100"),
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("편집한 오디오를 생성 갤러리에 저장했습니다.");
    });
  }

  async function handleAudioDenoiseSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!audioDenoiseForm.audio_path.trim()) {
      setMessage("정제할 오디오를 먼저 선택하세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.denoiseAudio({
        audio_path: audioDenoiseForm.audio_path,
        output_name: audioDenoiseForm.output_name || undefined,
        strength: Number(audioDenoiseForm.strength || "0.55"),
        noise_profile_sec: Number(audioDenoiseForm.noise_profile_sec || "0.6"),
        spectral_floor: Number(audioDenoiseForm.spectral_floor || "0.08"),
        highpass_hz: Number(audioDenoiseForm.highpass_hz || "70"),
        lowpass_hz: Number(audioDenoiseForm.lowpass_hz || "16000"),
        voice_presence: Number(audioDenoiseForm.voice_presence || "0.35"),
        normalize: audioDenoiseForm.normalize,
        output_format: audioDenoiseForm.output_format,
        sample_rate: Number(audioDenoiseForm.sample_rate || "44100"),
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("정제한 음성을 생성 갤러리에 저장했습니다.");
    });
  }

  async function handleVoiceDesignSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.generateVoiceDesign({
        model_id: designForm.model_id || undefined,
        output_name: designForm.output_name || undefined,
        text: designForm.text,
        language: designForm.language,
        instruct: designForm.instruct,
        ...serializeGenerationControls(designControls),
      });
      setLastDesignRecord(result.record);
      setSelectedDesignSampleId(result.record.id);
      setPresetForm((prev) => ({
        ...prev,
        name: prev.name || result.record.meta?.display_name?.toString() || designForm.output_name || "voice-design-preset",
        language: result.record.language || prev.language,
      }));
      await refreshAll();
      setMessage("새 목소리 설계를 완료했습니다.");
    });
  }

  function getDesignPresetName(generationId: string): string {
    if (!lastDesignRecord) return `design-${generationId}`;
    return (
      presetForm.name.trim() ||
      lastDesignRecord.meta?.display_name?.toString() ||
      basenameFromPath(lastDesignRecord.output_audio_path).replace(/\.[^.]+$/, "") ||
      `design-${generationId}`
    );
  }

  async function handleSaveDesignAsQwenPreset() {
    const generationId = selectedDesignSampleId || lastDesignRecord?.id || "";
    if (!generationId || !lastDesignRecord) {
      setMessage("먼저 목소리 설계 음성을 생성해주세요.");
      return;
    }
    if (!selectedBaseModelId) {
      setMessage("Qwen 프리셋을 만들 기본 모델이 아직 준비되지 않았습니다.");
      return;
    }
    await runAction(async () => {
      const presetName = getDesignPresetName(generationId);

      const prompt = await api.createCloneFromSample({
        generation_id: generationId,
        model_id: selectedBaseModelId,
      });

      await api.createPreset({
        name: presetName,
        source_type: "voice_design",
        language: presetForm.language,
        base_model: prompt.base_model,
        reference_text: prompt.reference_text,
        reference_audio_path: prompt.reference_audio_path,
        clone_prompt_path: prompt.prompt_path,
        notes: presetForm.notes,
      });

      setSelectedClonePrompt(prompt);
      await refreshAll();
      setMessage("Qwen 프리셋을 저장했습니다.");
    });
  }

  async function handleSaveDesignAsS2ProPreset() {
    const generationId = selectedDesignSampleId || lastDesignRecord?.id || "";
    if (!generationId || !lastDesignRecord) {
      setMessage("먼저 목소리 설계 음성을 생성해주세요.");
      return;
    }
    await runAction(async () => {
      const presetName = getDesignPresetName(generationId);

      const s2Voice = await api.createS2ProVoice({
        name: presetName,
        runtime_source: s2ProVoiceForm.runtime_source,
        reference_audio_path: lastDesignRecord.output_audio_path,
        reference_text: lastDesignRecord.input_text,
        language: presetForm.language,
        notes: presetForm.notes || "목소리 설계 결과에서 저장한 S2-Pro 목소리",
        create_qwen_prompt: false,
      });
      setSelectedS2VoiceId(s2Voice.id);
      await refreshAll();
      setMessage("S2-Pro 목소리 프리셋을 저장했습니다.");
    });
  }

  async function handleUploadReference(file: File) {
    await runAction(async () => {
      setUploadRefText("");
      setUploadTranscriptMeta("자동 전사를 준비하고 있습니다.");
      const result = await api.uploadAudio(file);
      setUploadedRef(result);
      setUploadedClonePrompt(null);
      setDatasetForm((prev) => ({ ...prev, ref_audio_path: result.path }));
      await transcribeUploadedReference(result.path);
      setMessage("참조 음성을 업로드하고 자동 전사했습니다.");
    });
  }

  async function handleTranscribeUploadText() {
    if (!uploadedRef) {
      setMessage("먼저 참조 음성을 업로드해주세요.");
      return;
    }

    await runAction(async () => {
      await transcribeUploadedReference(uploadedRef.path);
      setMessage("참조 음성을 다시 전사했습니다.");
    });
  }

  async function handleCreateCloneFromUpload() {
    if (!uploadedRef) {
      setMessage("먼저 참조 음성을 업로드해주세요.");
      return;
    }
    if (!selectedBaseModelId) {
      setMessage("먼저 스타일 분석 모델을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.createCloneFromUpload({
        model_id: selectedBaseModelId,
        reference_audio_path: uploadedRef.path,
        reference_text: uploadRefText.trim() || undefined,
      });
      setUploadedClonePrompt(result);
      setPresetForm((prev) => ({ ...prev, name: prev.name || `upload-${result.id}` }));
      setMessage("업로드한 음성으로 목소리 스타일을 만들었습니다.");
    });
  }

  async function handleVoiceBoxCloneFromUpload() {
    if (!uploadedRef) {
      setMessage("먼저 참조 음성을 업로드해주세요.");
      return;
    }
    if (!voiceBoxCloneForm.model_id) {
      setMessage("먼저 VoiceBox 모델을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.generateVoiceBoxClone({
        ...voiceBoxCloneForm,
        ref_audio_path: uploadedRef.path,
        ref_text: uploadRefText.trim() || undefined,
        output_name: voiceBoxCloneForm.output_name || undefined,
      });
      setLastVoiceBoxCloneRecord(result.record);
      await refreshAll();
      setMessage("VoiceBox로 참조 음성을 복제했습니다.");
    });
  }

  async function handleCreatePreset(source: "design" | "upload") {
    const prompt = source === "design" ? selectedClonePrompt : uploadedClonePrompt;
    if (!prompt) {
      setMessage("먼저 목소리 스타일을 만들어주세요.");
      return;
    }
    await runAction(async () => {
      await api.createPreset({
        name: presetForm.name || `preset-${prompt.id}`,
        source_type: source === "design" ? "voice_design" : "uploaded_reference",
        language: presetForm.language,
        base_model: prompt.base_model,
        reference_text: prompt.reference_text,
        reference_audio_path: prompt.reference_audio_path,
        clone_prompt_path: prompt.prompt_path,
        notes: presetForm.notes,
      });
      await refreshAll();
      setMessage("캐릭터 프리셋을 저장했습니다.");
    });
  }

  useEffect(() => {
    if (presets.length > 0 && !selectedHybridPresetId) {
      setSelectedHybridPresetId(presets[0].id);
    }
  }, [presets, selectedHybridPresetId]);

  useEffect(() => {
    if (!selectedHybridPreset) {
      return;
    }

    setHybridForm((prev) => {
      const nextBaseModelId = selectedHybridPreset.base_model || prev.base_model_id || preferredStockBaseModel?.model_id || "";
      const nextCustomModelId = guessMatchingCustomVoiceModel(
        selectedHybridPreset.base_model,
        customVoiceCapableModels,
        prev.custom_model_id || preferredHybridCustomModel?.model_id || "",
      );
      const nextLanguage = selectedHybridPreset.language || prev.language;
      const nextRefAudioPath = selectedHybridPreset.reference_audio_path;
      const nextRefText = selectedHybridPreset.reference_text;

      if (
        prev.base_model_id === nextBaseModelId &&
        prev.custom_model_id === nextCustomModelId &&
        prev.language === nextLanguage &&
        prev.ref_audio_path === nextRefAudioPath &&
        prev.ref_text === nextRefText
      ) {
        return prev;
      }

      return {
        ...prev,
        base_model_id: nextBaseModelId,
        custom_model_id: nextCustomModelId,
        language: nextLanguage,
        ref_audio_path: nextRefAudioPath,
        ref_text: nextRefText,
      };
    });
  }, [selectedHybridPreset, preferredStockBaseModel, customVoiceCapableModels, preferredHybridCustomModel]);

  async function handleGenerateFromPreset() {
    const presetId = selectedPresetId || selectedHybridPresetId;
    const presetForGeneration = selectedPreset ?? selectedHybridPreset;
    if (!presetId) {
      setMessage("프리셋을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      await api.generateFromPreset(presetId, {
        model_id: selectedBaseModelId || undefined,
        text: presetGenerateText,
        language: presetForGeneration?.language ?? "",
        output_name: presetOutputName || undefined,
        ...serializeGenerationControls(presetControls),
      });
      await refreshAll();
      setMessage("프리셋으로 음성을 생성했습니다.");
    });
  }

  async function handleGenerateVoiceBoxFromPreset(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedHybridPreset) {
      setMessage("프리셋을 선택해주세요.");
      return;
    }
    if (!voiceBoxPresetForm.model_id) {
      setMessage("VoiceBox 모델을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.generateVoiceBoxClone({
        model_id: voiceBoxPresetForm.model_id,
        output_name: voiceBoxPresetForm.output_name || undefined,
        text: voiceBoxPresetForm.text,
        language: voiceBoxPresetForm.language || selectedHybridPreset.language,
        ref_audio_path: selectedHybridPreset.reference_audio_path,
        ref_text: selectedHybridPreset.reference_text || undefined,
        speaker: "mai",
        strategy: "embedded_encoder_only",
        ...serializeGenerationControls(presetControls),
      });
      setLastVoiceBoxPresetRecord(result.record);
      await refreshAll();
      setMessage("VoiceBox 프리셋 생성을 완료했습니다.");
    });
  }

  async function handleGenerateVoiceBoxInstructFromPreset(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedHybridPreset) {
      setMessage("프리셋을 선택해주세요.");
      return;
    }
    if (!voiceBoxPresetInstructForm.model_id) {
      setMessage("VoiceBox 모델을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.generateVoiceBoxCloneInstruct({
        model_id: voiceBoxPresetInstructForm.model_id,
        output_name: voiceBoxPresetInstructForm.output_name || undefined,
        text: voiceBoxPresetInstructForm.text,
        language: voiceBoxPresetInstructForm.language || selectedHybridPreset.language,
        ref_audio_path: selectedHybridPreset.reference_audio_path,
        ref_text: selectedHybridPreset.reference_text || undefined,
        speaker: "mai",
        instruct: voiceBoxPresetInstructForm.instruct,
        strategy: "embedded_encoder_with_ref_code",
        ...serializeGenerationControls(hybridControls),
      });
      setLastVoiceBoxPresetInstructRecord(result.record);
      await refreshAll();
      setMessage("VoiceBox 프리셋 + 말투 지시 생성을 완료했습니다.");
    });
  }

  async function handleCreateDataset() {
    const validSamples =
      datasetInputMode === "paths" && datasetSampleFolderPath.trim()
        ? []
        : datasetSamples
            .map((sample) => ({ audio_path: sample.audio_path.trim(), text: (sample.text ?? "").trim() }))
            .filter((sample) => sample.audio_path);
    if (!datasetForm.ref_audio_path || (validSamples.length === 0 && !datasetSampleFolderPath.trim())) {
      setMessage("기준 음성과 샘플 음성 또는 샘플 폴더를 채워주세요.");
      return;
    }
    await runAction(async () => {
      const normalizedSamples = [...validSamples];
      const blankTargets = normalizedSamples
        .map((sample, index) => ({ sample, index }))
        .filter(({ sample }) => !sample.text);

      const whisperTargets = blankTargets.filter(({ sample, index }) => {
        const cachedText = assetTextByPath.get(sample.audio_path)?.trim();
        if (cachedText) {
          normalizedSamples[index].text = cachedText;
          updateDatasetSample(index, { text: cachedText });
          return false;
        }
        return true;
      });

      if (whisperTargets.length > 0) {
        const transcripts = await Promise.all(
          whisperTargets.map(({ sample }) => api.transcribeAudio(sample.audio_path)),
        );
        transcripts.forEach((result, resultIndex) => {
          const targetIndex = whisperTargets[resultIndex].index;
          normalizedSamples[targetIndex].text = result.text;
          updateDatasetSample(targetIndex, { text: result.text });
        });
      }

      const dataset = await api.createDataset({
        ...datasetForm,
        samples: normalizedSamples,
        sample_folder_path: datasetInputMode === "paths" ? normalizeDatasetPath(datasetSampleFolderPath) || undefined : undefined,
      });
      const finalDataset = await api.prepareDataset(dataset.id, {
        tokenizer_model_path: runForm.tokenizer_model_path,
        device: health?.device ?? "cpu",
        simulate_only: runForm.simulate_only,
      });
      setSelectedDatasetId(finalDataset.id);
      setLastCreatedDatasetId(finalDataset.id);
      await refreshAll();
      setMessage("데이터셋 저장과 학습용 준비를 함께 완료했습니다.");
    });
  }

  async function handleTranscribeDatasetSample(index: number) {
    const sample = datasetSamples[index];
    if (!sample?.audio_path.trim()) {
      setMessage("먼저 전사할 샘플 오디오 경로를 채워주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.transcribeAudio(sample.audio_path.trim());
      updateDatasetSample(index, { text: result.text });
      setMessage(`샘플 ${index + 1}번 텍스트를 자동 전사했습니다.`);
    });
  }

  async function handleTranscribeAllDatasetSamples() {
    const targets = datasetSamples
      .map((sample, index) => ({ sample, index }))
      .filter(({ sample }) => sample.audio_path.trim() && !sample.text?.trim());

    if (targets.length === 0) {
      setMessage("자동 전사할 빈 텍스트 샘플이 없습니다.");
      return;
    }

    await runAction(async () => {
      const results = await Promise.all(targets.map(({ sample }) => api.transcribeAudio(sample.audio_path.trim())));
      results.forEach((result, resultIndex) => {
        updateDatasetSample(targets[resultIndex].index, { text: result.text });
      });
      setMessage(`빈 텍스트 ${results.length}개를 자동 전사했습니다.`);
    });
  }

  async function handleCreateRun() {
    if (!selectedDatasetId) {
      setMessage("파인튜닝할 데이터셋을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      await api.createFineTuneRun({
        dataset_id: selectedDatasetId,
        training_mode: runForm.training_mode,
        init_model_path: runForm.init_model_path,
        speaker_encoder_model_path: runForm.speaker_encoder_model_path || undefined,
        output_name: runForm.output_name,
        batch_size: Number(runForm.batch_size),
        lr: Number(runForm.lr),
        num_epochs: Number(runForm.num_epochs),
        speaker_name: runForm.speaker_name,
        device: health?.device ?? "cpu",
        simulate_only: runForm.simulate_only,
      });
      await refreshAll();
      setMessage(runForm.simulate_only ? "시뮬레이션 학습 실행 기록을 만들었습니다." : "실제 파인튜닝 실행을 시작했습니다.");
    });
  }

  async function handleCreateVoiceBoxFusion(event?: FormEvent) {
    event?.preventDefault();
    if (!voiceBoxFusionForm.input_checkpoint_path || !voiceBoxFusionForm.speaker_encoder_source_path) {
      setMessage("VoiceBox로 합칠 CustomVoice 모델과 Base encoder 모델을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      await api.createVoiceBoxFusion(voiceBoxFusionForm);
      await refreshAll();
      setMessage(`${voiceBoxFusionForm.output_name} 모델을 만들었습니다.`);
    });
  }

  function addSampleRow() {
    setDatasetSamples((prev) => [...prev, createEmptyDatasetSample()]);
  }

  function removeSampleRow(index: number) {
    setDatasetSamples((prev) => {
      if (prev.length === 1) {
        return [createEmptyDatasetSample()];
      }
      return prev.filter((_, sampleIndex) => sampleIndex !== index);
    });
  }

  function applyBulkDatasetPaths() {
    const parsed = parseDatasetSampleBulkInput(datasetBulkInput);
    if (parsed.length === 0) {
      setMessage("붙여넣은 경로가 없습니다. 한 줄에 하나씩 넣어주세요.");
      return;
    }
    mergeDatasetSamples(parsed);
    setDatasetBulkInput("");
    setMessage(`${parsed.length}개 경로를 샘플 목록에 반영했습니다.`);
  }

  async function handleModelInferenceSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedInferenceModel) {
      setMessage("먼저 추론할 모델을 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.generateWithModel({
        model_id: inferenceForm.model_id,
        output_name: inferenceForm.output_name || undefined,
        text: inferenceForm.text,
        language: inferenceForm.language,
        speaker: inferenceForm.speaker || undefined,
        instruct: inferenceForm.instruct,
        ref_audio_path: inferenceForm.ref_audio_path || undefined,
        ref_text: inferenceForm.ref_text || undefined,
        voice_clone_prompt_path: inferenceForm.voice_clone_prompt_path || undefined,
        x_vector_only_mode: inferenceForm.x_vector_only_mode,
        ...serializeGenerationControls(inferenceControls),
      });
      setLastInferenceRecord(result.record);
      await refreshAll();
      setMessage(`${selectedInferenceModel.label} 추론을 완료했습니다.`);
    });
  }

  async function handleHybridInferenceSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!hybridForm.base_model_id || !hybridForm.custom_model_id || !hybridForm.ref_audio_path.trim()) {
      setMessage("선택한 프리셋의 기준 정보가 아직 준비되지 않았습니다. 프리셋을 다시 선택해주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.generateHybridCloneInstruct({
        ...serializeGenerationControls(hybridControls),
        base_model_id: hybridForm.base_model_id,
        custom_model_id: hybridForm.custom_model_id,
        output_name: hybridForm.output_name || undefined,
        text: hybridForm.text,
        language: hybridForm.language,
        instruct: hybridForm.instruct,
        ref_audio_path: hybridForm.ref_audio_path,
        ref_text: hybridForm.ref_text || undefined,
        x_vector_only_mode: hybridForm.x_vector_only_mode,
      });
      setLastHybridRecord(result.record);
      await refreshAll();
      setMessage("스타일 프리셋과 말투 지시를 함께 적용한 생성을 완료했습니다.");
    });
  }

  function handleSelectInferenceAsset(asset: AudioAsset) {
    setInferenceForm((prev) => ({
      ...prev,
      ref_audio_path: asset.path,
      ref_text: asset.transcript_text?.trim() || prev.ref_text,
    }));
    setMessage(`추론 참조 음성으로 ${asset.filename}을(를) 선택했습니다.`);
  }

  const renderableTabs = new Set<TabKey>([
    "design",
    "tts",
    "clone",
    "projects",
    "s2pro_tagged",
    "s2pro_clone",
    "s2pro_multi_speaker",
    "s2pro_multilingual",
    "effects",
    "audio_editor",
    "audio_denoise",
    "separation",
    "applio_train",
    "applio_convert",
    "applio_batch",
    "applio_blend",
    "ace_music",
    "ace_cover",
    "ace_repaint",
    "ace_extend",
    "ace_extract",
    "ace_lego",
    "ace_complete",
    "ace_understand",
    "ace_create_sample",
    "ace_format_sample",
    "dataset",
    "training",
    "voicebox_fusion",
  ]);
  const canRunCurrentTab = renderableTabs.has(activeTab);

  async function handleShareWorkspace() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("현재 작업 링크를 클립보드에 복사했습니다.");
    } catch {
      setMessage(url);
    }
  }

  async function handleRunCurrentTab() {
    if (!canRunCurrentTab) {
      return;
    }

    if (activeTab === "design") return handleVoiceDesignSubmit();
    if (activeTab === "tts") return handleModelInferenceSubmit();
    if (activeTab === "clone") return handleCreateCloneFromUpload();
    if (activeTab === "projects") {
      if (selectedHybridPreset && hybridForm.custom_model_id) return handleHybridInferenceSubmit();
      return handleGenerateFromPreset();
    }
    if (isS2ProTab(activeTab)) return handleS2ProSubmit();
    if (activeTab === "effects") return handleSoundEffectSubmit();
    if (activeTab === "audio_editor") return handleAudioEditSubmit();
    if (activeTab === "audio_denoise") return handleAudioDenoiseSubmit();
    if (activeTab === "separation") return handleAudioSeparation();
    if (activeTab === "applio_train") return handleRvcTrainSubmit();
    if (activeTab === "applio_convert") return handleVoiceChangerSubmit();
    if (activeTab === "applio_batch") return handleVoiceChangerBatchSubmit();
    if (activeTab === "applio_blend") return handleVoiceModelBlendSubmit();
    if (activeTab === "ace_music") return handleAceStepSubmit();
    if (activeTab === "ace_cover") return handleAceStepCoverSubmit();
    if (activeTab === "ace_repaint") return handleAceStepRepaintSubmit();
    if (activeTab === "ace_extend") return handleAceStepExtendSubmit();
    if (activeTab === "ace_extract") return handleAceStepExtractSubmit();
    if (activeTab === "ace_lego") return handleAceStepLegoSubmit();
    if (activeTab === "ace_complete") return handleAceStepCompleteSubmit();
    if (activeTab === "ace_understand") return handleAceStepUnderstandSubmit();
    if (activeTab === "ace_create_sample") return handleAceStepCreateSampleSubmit();
    if (activeTab === "ace_format_sample") return handleAceStepFormatSampleSubmit();
    if (activeTab === "dataset") return handleCreateDataset();
    if (activeTab === "training") return handleCreateRun();
    if (activeTab === "voicebox_fusion") return handleCreateVoiceBoxFusion();
  }

  return (
    <>
    <StudioTopBar
      onRender={canRunCurrentTab ? handleRunCurrentTab : undefined}
      onShare={handleShareWorkspace}
      renderDisabled={loading}
      title={pageTitle}
    />
    <div className="page-shell">
      <div className="app-shell">
        <aside className="sidebar studio-nav">
          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.workspace")}</span></div>
            <button className={activeTab === "home" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("home")} type="button">
              <span>{t("tab.home")}</span>
            </button>
            <button className={activeTab === "voices" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("voices")} type="button">
              <span>{t("tab.voices")}</span>
            </button>
            <button className={activeTab === "gallery" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("gallery")} type="button">
              <span>{t("tab.gallery")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.qwen")}</span></div>
            <button className={activeTab === "design" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("design")} type="button">
              <span>{t("tab.design")}</span>
            </button>
            <button className={activeTab === "tts" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("tts")} type="button">
              <span>{t("tab.tts")}</span>
            </button>
            <button className={activeTab === "clone" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("clone")} type="button">
              <span>{t("tab.clone")}</span>
            </button>
            <button className={activeTab === "projects" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("projects")} type="button">
              <span>{t("tab.projects")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.s2pro")}</span></div>
            <button className={activeTab === "s2pro_tagged" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openS2ProTab("s2pro_tagged")} type="button">
              <span>{t("tab.s2pro_tagged")}</span>
            </button>
            <button className={activeTab === "s2pro_clone" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openS2ProTab("s2pro_clone")} type="button">
              <span>{t("tab.s2pro_clone")}</span>
            </button>
            <button className={activeTab === "s2pro_multi_speaker" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openS2ProTab("s2pro_multi_speaker")} type="button">
              <span>{t("tab.s2pro_multi_speaker")}</span>
            </button>
            <button className={activeTab === "s2pro_multilingual" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openS2ProTab("s2pro_multilingual")} type="button">
              <span>{t("tab.s2pro_multilingual")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.audiolab")}</span></div>
            <button className={activeTab === "effects" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("effects")} type="button">
              <span>{t("tab.effects")}</span>
            </button>
            <button className={activeTab === "audio_editor" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("audio_editor")} type="button">
              <span>{t("tab.audio_editor")}</span>
            </button>
            <button className={activeTab === "audio_denoise" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("audio_denoise")} type="button">
              <span>{t("tab.audio_denoise")}</span>
            </button>
            <button className={activeTab === "separation" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("separation")} type="button">
              <span>{t("tab.separation")}</span>
            </button>
            <button className={activeTab === "applio_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("applio_train")} type="button">
              <span>{t("tab.applio_train")}</span>
            </button>
            <button className={activeTab === "applio_convert" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("applio_convert")} type="button">
              <span>{t("tab.applio_convert")}</span>
            </button>
            <button className={activeTab === "applio_batch" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("applio_batch")} type="button">
              <span>{t("tab.applio_batch")}</span>
            </button>
            <button className={activeTab === "applio_blend" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("applio_blend")} type="button">
              <span>{t("tab.applio_blend")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.music")}</span></div>
            <button className={activeTab === "ace_music" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_music")} type="button">
              <span>{t("tab.ace_music")}</span>
              <span className="studio-nav__chip">10</span>
            </button>
            <button className={activeTab === "ace_cover" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_cover")} type="button">
              <span>{t("tab.ace_cover")}</span>
            </button>
            <button className={activeTab === "ace_repaint" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_repaint")} type="button">
              <span>{t("tab.ace_repaint")}</span>
            </button>
            <button className={activeTab === "ace_extend" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_extend")} type="button">
              <span>{t("tab.ace_extend")}</span>
            </button>
            <button className={activeTab === "ace_extract" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_extract")} type="button">
              <span>{t("tab.ace_extract")}</span>
            </button>
            <button className={activeTab === "ace_lego" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_lego")} type="button">
              <span>{t("tab.ace_lego")}</span>
            </button>
            <button className={activeTab === "ace_complete" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_complete")} type="button">
              <span>{t("tab.ace_complete")}</span>
            </button>
            <button className={activeTab === "ace_understand" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_understand")} type="button">
              <span>{t("tab.ace_understand")}</span>
            </button>
            <button className={activeTab === "ace_create_sample" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_create_sample")} type="button">
              <span>{t("tab.ace_create_sample")}</span>
            </button>
            <button className={activeTab === "ace_format_sample" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_format_sample")} type="button">
              <span>{t("tab.ace_format_sample")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.training")}</span></div>
            <button className={activeTab === "dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("dataset")} type="button">
              <span>{t("tab.dataset")}</span>
            </button>
            <button className={activeTab === "training" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("training")} type="button">
              <span>{t("tab.train")}</span>
            </button>
            <button className={activeTab === "voicebox_fusion" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("voicebox_fusion")} type="button">
              <span>{t("tab.fuse")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.help")}</span></div>
            <button className={activeTab === "guide" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("guide")} type="button">
              <span>{t("tab.guide")}</span>
            </button>
          </div>
        </aside>

        <main className="page-main">
          {activeTab === "home" ? (
            <header className="hero">
              <div className="hero__copy">
                <span className="hero__section-label">{t("home.eyebrow")}</span>
                <h1>{t("home.title")}</h1>
                <p>{t("home.description")}</p>
              </div>
              <div className="spotlight-grid">
                <SpotlightCard
                  eyebrow={t("home.card.design.eyebrow")}
                  title={t("home.card.design.title")}
                  description={t("home.card.design.description")}
                  actionLabel={t("tab.design")}
                  onAction={() => setActiveTab("design")}
                />
                <SpotlightCard
                  eyebrow={t("home.card.clone.eyebrow")}
                  title={t("home.card.clone.title")}
                  description={t("home.card.clone.description")}
                  actionLabel={t("tab.clone")}
                  onAction={() => setActiveTab("clone")}
                />
                <SpotlightCard
                  eyebrow={t("home.card.tts.eyebrow")}
                  title={t("home.card.tts.title")}
                  description={t("home.card.tts.description")}
                  actionLabel={t("tab.tts")}
                  onAction={() => setActiveTab("tts")}
                />
                <SpotlightCard
                  eyebrow={t("home.card.projects.eyebrow")}
                  title={t("home.card.projects.title")}
                  description={t("home.card.projects.description")}
                  actionLabel={t("tab.projects")}
                  onAction={() => setActiveTab("projects")}
                />
              </div>
            </header>
          ) : null}

          {message ? <div className="message-banner">{message}</div> : null}
      {activeTab === "voices" ? (
        <section className="workspace workspace--stacked">
          <section className="voice-gallery-shell">
            <div className="voice-gallery-toolbar">
              <div>
                <h2>목소리 프로젝트</h2>
                <p>직접 만든 목소리 자산만 모아 관리합니다. 기본 목소리는 여기서 제외합니다.</p>
              </div>
              <div className="voice-gallery-tabs" aria-label="목소리 보기 필터">
                <button className={voiceGalleryView === "trained" ? "is-active" : ""} onClick={() => setVoiceGalleryView("trained")} type="button">
                  훈련한 모델 <span>{latestFineTunedModels.length}</span>
                </button>
                <button className={voiceGalleryView === "qwen" ? "is-active" : ""} onClick={() => setVoiceGalleryView("qwen")} type="button">
                  Qwen 프리셋 <span>{qwenVoiceAssetCount}</span>
                </button>
                <button className={voiceGalleryView === "s2pro" ? "is-active" : ""} onClick={() => setVoiceGalleryView("s2pro")} type="button">
                  S2-Pro 프리셋 <span>{s2VoiceProjects.length}</span>
                </button>
                <button className={voiceGalleryView === "rvc" ? "is-active" : ""} onClick={() => setVoiceGalleryView("rvc")} type="button">
                  RVC 모델 <span>{voiceChangerModels.length}</span>
                </button>
              </div>
            </div>

            <div className="voice-project-list">
              {voiceGalleryView === "trained" ? (
                latestFineTunedModels.length ? (
                  latestFineTunedModels.map((model) => (
                    <article className="voice-project-row" key={model.model_id}>
                      <div className="voice-project-avatar" aria-hidden="true">
                        <MiniWaveform dense />
                      </div>
                      <div className="voice-project-main">
                        <div className="voice-project-title">
                          <strong>{displayModelName(model)}</strong>
                          <span>{model.default_speaker ? `${model.default_speaker} 목소리` : "학습 모델"}</span>
                        </div>
                        <p>{model.notes || "바로 선택해서 텍스트 음성 변환에 사용할 수 있는 학습 결과입니다."}</p>
                        <div className="voice-project-assets">
                          <span>{model.source}</span>
                          <span>{model.default_speaker || "speaker"}</span>
                          <span>{model.speaker_encoder_included ? "speaker encoder 포함" : "speaker encoder 없음"}</span>
                        </div>
                      </div>
                      <div className="voice-project-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setInferenceForm((prev) => ({
                              ...prev,
                              model_id: model.model_id,
                              speaker: model.default_speaker || prev.speaker,
                            }));
                            setActiveTab("tts");
                          }}
                          type="button"
                        >
                          텍스트 음성 변환에서 사용
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="voice-project-empty">
                    <strong>훈련한 모델이 없습니다.</strong>
                    <p>Qwen 학습을 완료한 모델만 이 영역에 표시됩니다.</p>
                    <button className="primary-button" onClick={() => setActiveTab("training")} type="button">
                      학습 실행으로 이동
                    </button>
                  </div>
                )
              ) : null}

              {voiceGalleryView === "qwen" ? (
                qwenVoiceAssetCount ? (
                  <>
                    {presets.map((preset) => (
                      <article className="voice-project-row" key={preset.id}>
                        <div className="voice-project-avatar" aria-hidden="true">
                          <MiniWaveform dense />
                        </div>
                        <div className="voice-project-main">
                          <div className="voice-project-title">
                            <strong>{preset.name}</strong>
                            <span>{preset.language} · {formatDate(preset.created_at)}</span>
                          </div>
                          <p>{preset.reference_text}</p>
                          <div className="voice-project-assets">
                            <span>Qwen 프리셋</span>
                            <span>{preset.source_type}</span>
                          </div>
                        </div>
                        <div className="voice-project-actions">
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setSelectedPresetId(preset.id);
                              setSelectedHybridPresetId(preset.id);
                              setActiveTab("projects");
                            }}
                            type="button"
                          >
                            프리셋 기반 생성
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              createS2VoiceFromQwenAsset({
                                name: preset.name,
                                reference_audio_path: preset.reference_audio_path,
                                reference_text: preset.reference_text,
                                language: preset.language,
                              })
                            }
                            type="button"
                          >
                            S2-Pro 프리셋으로 저장
                          </button>
                        </div>
                      </article>
                    ))}
                    {rawQwenClonePrompts.map((prompt) => (
                      <article className="voice-project-row" key={prompt.id}>
                        <div className="voice-project-avatar" aria-hidden="true">
                          <MiniWaveform dense />
                        </div>
                        <div className="voice-project-main">
                          <div className="voice-project-title">
                            <strong>{basenameFromPath(prompt.prompt_path).replace(/\.[^.]+$/, "")}</strong>
                            <span>{formatDate(prompt.created_at)}</span>
                          </div>
                          <p>{prompt.reference_text || "참조 텍스트가 저장되지 않았습니다."}</p>
                          <div className="voice-project-assets">
                            <span>Qwen clone prompt</span>
                            <span>{prompt.source_type}</span>
                            <span>{prompt.x_vector_only_mode ? "x-vector" : "full style"}</span>
                          </div>
                        </div>
                        <div className="voice-project-actions">
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setUploadedClonePrompt(prompt);
                              setActiveTab("projects");
                            }}
                            type="button"
                          >
                            프리셋으로 저장
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              createS2VoiceFromQwenAsset({
                                name: basenameFromPath(prompt.prompt_path).replace(/\.[^.]+$/, ""),
                                reference_audio_path: prompt.reference_audio_path,
                                reference_text: prompt.reference_text,
                                language: "Auto",
                              })
                            }
                            type="button"
                          >
                            S2-Pro 프리셋으로 저장
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : (
                  <div className="voice-project-empty">
                    <strong>Qwen 프리셋이 없습니다.</strong>
                    <p>목소리 복제나 목소리 설계에서 저장한 프리셋만 이 영역에 표시됩니다.</p>
                    <button className="primary-button" onClick={() => setActiveTab("clone")} type="button">
                      목소리 복제로 이동
                    </button>
                  </div>
                )
              ) : null}

              {voiceGalleryView === "s2pro" ? (
                s2VoiceProjects.length ? (
                  s2VoiceProjects.map(({ voice, relatedHistory, relatedPresets }) => (
                    <article className="voice-project-row" key={voice.id}>
                      <div className="voice-project-avatar" aria-hidden="true">
                        <MiniWaveform dense />
                      </div>
                      <div className="voice-project-main">
                        <div className="voice-project-title">
                          <strong>{voice.name}</strong>
                          <span>{voice.language} · {formatDate(voice.created_at)}</span>
                        </div>
                        <p>{voice.reference_text || "참조 문장이 아직 없습니다."}</p>
                        <div className="voice-project-assets">
                          <span>S2-Pro 프리셋</span>
                          <span>생성 결과 {relatedHistory.length}개</span>
                          <span>Qwen 연결 {relatedPresets.length + (voice.qwen_clone_prompt_path ? 1 : 0)}개</span>
                          <span>{voice.runtime_source === "api" ? "Fish Audio API" : "Local Fish Speech"}</span>
                        </div>
                        <audio controls src={mediaUrl(voice.reference_audio_url)} />
                      </div>
                      <div className="voice-project-actions">
                        <button className="secondary-button" onClick={() => { setSelectedS2VoiceId(voice.id); openS2ProTab("s2pro_tagged"); }} type="button">
                          S2-Pro에서 사용
                        </button>
                        <button className="secondary-button" onClick={() => useS2VoiceInQwen(voice, "clone")} type="button">
                          Qwen 복제로 보내기
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setDatasetForm((prev) => ({ ...prev, ref_audio_path: voice.reference_audio_path, speaker_name: voice.name || prev.speaker_name }));
                            mergeDatasetSamples([{ audio_path: voice.reference_audio_path, text: voice.reference_text }]);
                            setActiveTab("dataset");
                          }}
                          type="button"
                        >
                          데이터셋에 사용
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="voice-project-empty">
                    <strong>S2-Pro 프리셋이 없습니다.</strong>
                    <p>S2-Pro 목소리 저장에서 만든 재사용 목소리만 이 영역에 표시됩니다.</p>
                    <button className="primary-button" onClick={() => openS2ProTab("s2pro_clone")} type="button">
                      S2-Pro 목소리 저장으로 이동
                    </button>
                  </div>
                )
              ) : null}

              {voiceGalleryView === "rvc" ? (
                voiceChangerModels.length ? (
                  voiceChangerModels.map((model) => (
                    <article className="voice-project-row" key={model.id}>
                      <div className="voice-project-avatar" aria-hidden="true">
                        <MiniWaveform dense />
                      </div>
                      <div className="voice-project-main">
                        <div className="voice-project-title">
                          <strong>{model.label}</strong>
                          <span>RVC / Applio</span>
                        </div>
                        <p>기존 음성을 이 목소리로 변환할 때 사용하는 RVC 모델입니다.</p>
                        <div className="voice-project-assets">
                          <span>{basenameFromPath(model.model_path)}</span>
                          <span>{model.index_path ? basenameFromPath(model.index_path) : "index 없음"}</span>
                        </div>
                      </div>
                      <div className="voice-project-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            handleSelectVoiceChangerModel(model.id);
                            setActiveTab("applio_convert");
                          }}
                          type="button"
                        >
                          단일 변환에서 사용
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            handleSelectVoiceChangerModel(model.id);
                            setActiveTab("applio_batch");
                          }}
                          type="button"
                        >
                          배치 변환에서 사용
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="voice-project-empty">
                    <strong>RVC 모델이 없습니다.</strong>
                    <p>Applio 학습을 완료하거나 모델 다운로드를 마친 RVC 모델만 이 영역에 표시됩니다.</p>
                    <button className="primary-button" onClick={() => setActiveTab("applio_train")} type="button">
                      RVC 모델 학습으로 이동
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </section>

        </section>
      ) : null}

      {activeTab === "gallery" ? (
        <section className="gallery-studio">
          <div className="gallery-studio__header">
            <div>
              <span className="studio-page-head__eyebrow"><i /> {t("gallery.eyebrow")}</span>
              <h2>{t("gallery.title")}</h2>
              <p>{t("gallery.description")}</p>
            </div>
            <div className="gallery-stats" aria-label="생성 통계">
              <span><b>{galleryStats.total}</b>{t("gallery.total")}</span>
              <span><b>{galleryStats.speech}</b>{t("gallery.speech")}</span>
              <span><b>{galleryStats.music}</b>{t("gallery.music")}</span>
              <span><b>{galleryStats.audio}</b>{t("gallery.audio")}</span>
            </div>
          </div>

          <section className="gallery-console">
            <div className="gallery-console__toolbar">
              <div className="gallery-console__selection">
                <strong>{selectedGalleryIds.length ? t("gallery.selectedCount").replace("{count}", String(selectedGalleryIds.length)) : t("gallery.noneSelected")}</strong>
                <span>{t("gallery.selectionHint")}</span>
              </div>
              <div className="gallery-toolbar__actions">
                <button className="secondary-button" disabled={!history.length} onClick={() => setSelectedGalleryIds(history.map((record) => gallerySelectionKey(record)))} type="button">
                  {t("action.selectAll")}
                </button>
                <button className="secondary-button" disabled={!selectedGalleryIds.length} onClick={() => setSelectedGalleryIds([])} type="button">
                  {t("action.clearSelection")}
                </button>
                <button className="secondary-button icon-button--danger" disabled={!selectedGalleryIds.length} onClick={handleDeleteSelectedHistory} type="button">
                  {t("action.deleteSelection")}
                </button>
              </div>
            </div>
            <div className="gallery-render-list">
              {history.length ? history.map((record) => {
                const selectionKey = gallerySelectionKey(record);
                const accent = galleryAccentForMode(record.mode);
                const waveBars = makeWaveBars(selectionKey, 54);
                return (
                <article className={selectedGalleryIds.includes(selectionKey) ? `render-row render-row--${accent} is-selected` : `render-row render-row--${accent}`} key={selectionKey}>
                  <label className="gallery-row__select" aria-label={`${getRecordDisplayTitle(record)} 선택`}>
                    <input checked={selectedGalleryIds.includes(selectionKey)} onChange={() => toggleGallerySelection(selectionKey)} type="checkbox" />
                    <span />
                  </label>
                  <div className="render-row__title">
                    <small>{getModeLabel(record.mode)} · {recordLanguageLabel(record)}</small>
                    <strong>{getRecordDisplayTitle(record)}</strong>
                    <span>{getRecordModelLabel(record)}</span>
                  </div>
                  <div className="render-row__wave" aria-hidden="true">
                    {waveBars.map((height, index) => (
                      <i key={`${selectionKey}-${index}`} style={{ height }} />
                    ))}
                  </div>
                  <time className="render-row__date">{formatShortDate(record.created_at)}</time>
                  <audio controls src={mediaUrl(record.output_audio_url)} className="render-row__player" />
                  <div className="render-row__actions">
                    <a className="secondary-button" href={mediaUrl(record.output_audio_url)} download={getAudioDownloadName(record)} aria-label="다운로드">
                      {t("action.download")}
                    </a>
                    <button className="secondary-button icon-button--danger" onClick={() => void handleDeleteHistoryRecord(record.id)} type="button">
                      {t("action.delete")}
                    </button>
                  </div>
                </article>
                );
              }) : (
                <div className="gallery-empty-state">
                  <strong>{t("gallery.emptyTitle")}</strong>
                  <p>{t("gallery.emptyDescription")}</p>
                  <button className="primary-button" onClick={() => setActiveTab("tts")} type="button">{t("action.firstVoice")}</button>
                </div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "tts" ? (
        <section className="workspace workspace--stacked studio-workspace">
          <form className="speech-console speech-console--qwen" onSubmit={handleModelInferenceSubmit}>
            <div className="speech-console__header">
              <div>
                <span className="studio-page-head__eyebrow"><i />QWEN · SPEECH</span>
                <h2>Text → Speech</h2>
                <p>Qwen 모델, 화자, 말투 지시, 샘플링 값을 골라 바로 생성합니다.</p>
              </div>
              <button className="studio-cta" disabled={loading || !selectedInferenceModel} type="submit">
                음성 생성
              </button>
            </div>

            <div className="speech-console__grid">
              <section className="speech-script-panel">
                <div className="speech-script-panel__toolbar">
                  <span className="voice-pill">
                    <span className="voice-pill__avatar">{(inferenceForm.speaker || selectedInferenceModel?.label || "V").slice(0, 1)}</span>
                    <span>{inferenceForm.speaker || (selectedInferenceModel ? displayModelName(selectedInferenceModel) : "목소리 선택")}</span>
                  </span>
                  <span className="byte-counter">{new Blob([inferenceForm.text]).size} / 500 bytes</span>
                </div>
                <label>
                  Text
                  <textarea
                    className="speech-script-panel__textarea"
                    placeholder="생성할 대사를 입력하세요."
                    value={inferenceForm.text}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, text: event.target.value }))}
                  />
                </label>
                {selectedInferenceModel?.supports_instruction ? (
                  <label>
                    Style instruction
                    <textarea
                      className="speech-script-panel__instruction"
                      placeholder="Keep the tone breathy, unstable, and emotionally heightened."
                      value={inferenceForm.instruct}
                      onChange={(event) => setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))}
                    />
                  </label>
                ) : null}
              </section>

              <aside className="speech-settings-panel">
                <div className="speech-settings-panel__tabs">
                  <button className={ttsSideView === "settings" ? "is-active" : ""} onClick={() => setTtsSideView("settings")} type="button">Settings</button>
                  <button className={ttsSideView === "history" ? "is-active" : ""} onClick={() => setTtsSideView("history")} type="button">History</button>
                </div>
                {ttsSideView === "settings" ? (
                  <div className="studio-settings-stack">
                    <label>
                      Model
                      <select value={inferenceForm.model_id} onChange={(event) => setInferenceForm((prev) => ({ ...prev, model_id: event.target.value }))}>
                        <option value="">모델 선택</option>
                        {ttsModels.map((model) => (
                          <option key={model.key} value={model.model_id}>{displayModelName(model)}</option>
                        ))}
                      </select>
                    </label>
                    {selectedInferenceModel?.available_speakers?.length ? (
                      <label>
                        Speaker
                        <select value={inferenceForm.speaker} onChange={(event) => setInferenceForm((prev) => ({ ...prev, speaker: event.target.value }))}>
                          {selectedInferenceModel.available_speakers.map((speaker) => (
                            <option key={speaker} value={speaker}>{speaker}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      Language
                      <LanguageSelect value={inferenceForm.language} onChange={(language) => setInferenceForm((prev) => ({ ...prev, language }))} />
                    </label>
                    <label>
                      Output name
                      <input
                        placeholder="예: mai-지친-대사"
                        value={inferenceForm.output_name}
                        onChange={(event) => setInferenceForm((prev) => ({ ...prev, output_name: event.target.value }))}
                      />
                    </label>
                    {selectedInferenceMode === "voice_clone" ? (
                      <details className="advanced-inline">
                        <summary>Reference voice</summary>
                        <label>
                          Reference audio path
                          <input value={inferenceForm.ref_audio_path} onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))} />
                        </label>
                        <label>
                          Reference text
                          <textarea value={inferenceForm.ref_text} onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_text: event.target.value }))} />
                        </label>
                        <ServerAudioPicker assets={generatedAudioAssets} selectedPath={inferenceForm.ref_audio_path} onSelect={handleSelectInferenceAsset} />
                      </details>
                    ) : null}
                    <details className="advanced-inline">
                      <summary>Advanced controls</summary>
                      <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
                    </details>
                  </div>
                ) : (
                  <div className="studio-history-stack">
                    {history.slice(0, 6).map((record) => (
                      <article className="studio-history-item" key={gallerySelectionKey(record)}>
                        <strong>{getRecordDisplayTitle(record)}</strong>
                        <audio controls src={mediaUrl(record.output_audio_url)} />
                      </article>
                    ))}
                    {!history.length ? <p className="field-hint">아직 생성 이력이 없습니다.</p> : null}
                  </div>
                )}
              </aside>
            </div>
          </form>
          {lastInferenceRecord ? (
            <section className="panel">
              <h3>생성 결과</h3>
              <AudioCard title="방금 생성한 음성" record={lastInferenceRecord} />
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "design" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
          <form className="panel" onSubmit={handleVoiceDesignSubmit}>
            <h2>목소리 설계</h2>
            <p className="field-hint">설명문으로 새 목소리를 만든 뒤, 마음에 드는 결과를 스타일 자산으로 저장합니다.</p>
            <RecipeBar title="목소리 설명 템플릿" items={DESIGN_RECIPES} onApply={applyDesignRecipe} />
            <div className="field-row">
              <label>
                모델
                <select
                  value={designForm.model_id}
                  onChange={(event) => setDesignForm({ ...designForm, model_id: event.target.value })}
                >
                  {voiceDesignModels.map((model) => (
                    <option key={model.key} value={model.model_id}>
                      {displayModelName(model)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                파일 이름
                <input
                  placeholder="예: 차가운-여성-목소리"
                  value={designForm.output_name}
                  onChange={(event) => setDesignForm({ ...designForm, output_name: event.target.value })}
                />
              </label>
            </div>
            <label>
              목소리 설명
              <textarea
                placeholder="예: Young Korean woman, cool, polished, and articulate. Keep the tone restrained and elegant."
                value={designForm.instruct}
                onChange={(event) => setDesignForm({ ...designForm, instruct: event.target.value })}
              />
            </label>
            <label>
              대사
              <textarea
                value={designForm.text}
                onChange={(event) => setDesignForm({ ...designForm, text: event.target.value })}
              />
            </label>
            <label>
              언어
              <LanguageSelect
                value={designForm.language}
                onChange={(language) => setDesignForm({ ...designForm, language })}
              />
            </label>
            <details className="advanced-inline">
              <summary>Advanced controls</summary>
              <GenerationControlsEditor value={designControls} onChange={setDesignControls} />
            </details>
            <button className="primary-button" disabled={loading} type="submit">
              설계 음성 생성
            </button>
          </form>

          <aside className="panel">
            <h3>프리셋으로 저장</h3>
            <p className="field-hint">마음에 드는 설계 결과를 필요한 서비스의 프리셋으로 따로 저장합니다.</p>
            <label>
              프리셋 이름
              <input value={presetForm.name} onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })} />
            </label>
            <label>
              기본 언어
              <LanguageSelect value={presetForm.language} onChange={(language) => setPresetForm({ ...presetForm, language })} />
            </label>
            <label>
              메모
              <textarea value={presetForm.notes} onChange={(event) => setPresetForm({ ...presetForm, notes: event.target.value })} />
            </label>
            <div className="button-row">
              <button className="primary-button" disabled={!lastDesignRecord || loading} onClick={() => void handleSaveDesignAsQwenPreset()} type="button">
                Qwen 프리셋 저장
              </button>
              <button className="secondary-button" disabled={!lastDesignRecord || loading} onClick={() => void handleSaveDesignAsS2ProPreset()} type="button">
                S2-Pro 프리셋 저장
              </button>
            </div>
            {lastDesignRecord ? (
              <AudioCard
                title="방금 생성한 설계 음성"
                subtitle="설명문 기반 결과"
                record={lastDesignRecord}
              />
            ) : null}
          </aside>
          </div>
        </section>
      ) : null}

      {activeTab === "clone" ? (
        <section className="workspace workspace--stacked">
          <section className="panel builder-panel">
            <div className="builder-header">
              <div>
                <span className="eyebrow eyebrow--soft">목소리 복제</span>
                <h2>참조 음성으로 스타일 저장 또는 직접 복제</h2>
                <p>프리셋으로 반복 사용할 스타일을 저장하거나, VoiceBox 모델로 바로 새 대사를 생성합니다.</p>
              </div>
            </div>

            <div className="builder-grid">
              <section className="step-card">
                <span className="step-card__index">1</span>
                <h3>참조 음성 선택</h3>
                <label className="upload-field">
                  음성 파일 불러오기
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUploadReference(file);
                      }
                    }}
                  />
                </label>
                {uploadedRef ? (
                  <div className="source-summary">
                    <span className="meta-label">선택한 참조 음성</span>
                    <strong>{uploadedRef.filename}</strong>
                  </div>
                ) : null}
                <label>
                  참조 텍스트
                  <textarea
                    placeholder="비워두면 서버가 자동으로 전사합니다."
                    value={uploadRefText}
                    onChange={(event) => setUploadRefText(event.target.value)}
                  />
                </label>
                {uploadTranscriptMeta ? <p className="field-hint">{uploadTranscriptMeta}</p> : null}
                <div className="button-row">
                  <button className="secondary-button" onClick={handleTranscribeUploadText} type="button">
                    다시 전사
                  </button>
                  {cloneEngine === "base_prompt" ? (
                    <button className="primary-button" onClick={handleCreateCloneFromUpload} type="button">
                      복제용 스타일 저장
                    </button>
                  ) : (
                    <button className="primary-button" onClick={handleVoiceBoxCloneFromUpload} type="button">
                      VoiceBox 복제 생성
                    </button>
                  )}
                </div>
              </section>

              <section className="step-card">
                <span className="step-card__index">2</span>
                <label>
                  Model
                  <select value={selectedCloneModelId} onChange={(event) => handleSelectCloneModel(event.target.value)}>
                    <option value="">Select model</option>
                    {cloneModelOptions.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
                {cloneEngine === "base_prompt" ? (
                  <>
                    <PromptSummaryCard title="복제 스타일 자산" prompt={uploadedClonePrompt} />
                  </>
                ) : (
                  <div className="voicebox-inline-form">
                    <label>
                      대사
                      <textarea value={voiceBoxCloneForm.text} onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, text: event.target.value })} />
                    </label>
                    <div className="field-row">
                      <label>
                        화자명
                        <input value={voiceBoxCloneForm.speaker} onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, speaker: event.target.value })} />
                      </label>
                      <label>
                        파일 이름
                        <input value={voiceBoxCloneForm.output_name} onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, output_name: event.target.value })} />
                      </label>
                    </div>
                    {lastVoiceBoxCloneRecord ? (
                      <AudioCard title={getRecordDisplayTitle(lastVoiceBoxCloneRecord)} record={lastVoiceBoxCloneRecord} />
                    ) : null}
                  </div>
                )}
              </section>

              <section className="step-card">
                <span className="step-card__index">3</span>
                {cloneEngine === "base_prompt" ? (
                  <>
                    <h3>프리셋 저장</h3>
                    <label>
                      프리셋 이름
                      <input
                        value={presetForm.name}
                        onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })}
                      />
                    </label>
                    <label>
                      기본 언어
                      <LanguageSelect
                        value={presetForm.language}
                        onChange={(language) => setPresetForm({ ...presetForm, language })}
                      />
                    </label>
                    <label>
                      메모
                      <textarea
                        value={presetForm.notes}
                        onChange={(event) => setPresetForm({ ...presetForm, notes: event.target.value })}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={!uploadedClonePrompt}
                      onClick={() => void handleCreatePreset("upload")}
                      type="button"
                    >
                      현재 스타일로 프리셋 저장
                    </button>
                  </>
                ) : (
                  <>
                    <h3>생성 데이터 활용</h3>
                    <p className="field-hint">VoiceBox로 만든 결과는 생성 갤러리에 저장되고, 필요하면 데이터셋 샘플로 이어서 쓸 수 있습니다.</p>
                    <button
                      className="secondary-button"
                      disabled={!lastVoiceBoxCloneRecord}
                      onClick={() => {
                        if (!lastVoiceBoxCloneRecord) return;
                        mergeDatasetSamples([{ audio_path: lastVoiceBoxCloneRecord.output_audio_path, text: lastVoiceBoxCloneRecord.input_text }]);
                        setDatasetForm((prev) => ({ ...prev, ref_audio_path: prev.ref_audio_path || lastVoiceBoxCloneRecord.output_audio_path }));
                        setActiveTab("dataset");
                      }}
                      type="button"
                    >
                      방금 결과를 데이터셋에 추가
                    </button>
                  </>
                )}
              </section>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "projects" ? (
        <section className="workspace workspace--stacked">
          <section className="panel">
            <h2>프리셋 기반 생성</h2>
            <label>
              프리셋
              <select value={selectedHybridPresetId} onChange={(event) => { setSelectedHybridPresetId(event.target.value); setSelectedPresetId(event.target.value); }}>
                <option value="">선택하세요</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedHybridPreset ? (
              <article className="selected-audio-card">
                <span className="meta-label">선택한 프리셋</span>
                <strong>{selectedHybridPreset.name}</strong>
                <p>{selectedHybridPreset.reference_text}</p>
              </article>
            ) : (
              <p className="field-hint">먼저 저장된 프리셋을 고르세요.</p>
            )}
            <div className="mini-tab-strip" role="tablist" aria-label="Preset generation mode">
              <button className={presetWorkflow === "base" ? "mini-tab is-active" : "mini-tab"} onClick={() => setPresetWorkflow("base")} type="button">Base Preset</button>
              <button className={presetWorkflow === "hybrid" ? "mini-tab is-active" : "mini-tab"} onClick={() => setPresetWorkflow("hybrid")} type="button">Base + Instruction</button>
              <button className={presetWorkflow === "voicebox" ? "mini-tab is-active" : "mini-tab"} onClick={() => setPresetWorkflow("voicebox")} type="button">VoiceBox Preset</button>
              <button className={presetWorkflow === "voicebox_instruct" ? "mini-tab is-active" : "mini-tab"} onClick={() => setPresetWorkflow("voicebox_instruct")} type="button">VoiceBox + Instruction</button>
            </div>

            <div className="workflow-panel">
              {presetWorkflow === "base" ? (
              <form className="inference-panel" onSubmit={(event) => { event.preventDefault(); void handleGenerateFromPreset(); }}>
                <h3>Base 프리셋 생성</h3>
                <label>
                  Base 모델
                  <select value={selectedBaseModelId} onChange={(event) => setSelectedBaseModelId(event.target.value)}>
                    <option value="">선택하세요</option>
                    {baseModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  대사
                  <textarea value={presetGenerateText} onChange={(event) => setPresetGenerateText(event.target.value)} />
                </label>
                <label>
                  파일 이름
                  <input
                    placeholder="예: 프리셋-첫-대사"
                    value={presetOutputName}
                    onChange={(event) => setPresetOutputName(event.target.value)}
                  />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
                  <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
                </details>
                <button className="secondary-button" disabled={!selectedHybridPreset} type="submit">
                  Base 프리셋 생성
                </button>
              </form>
              ) : null}

              {presetWorkflow === "hybrid" ? (
              <form className="inference-panel" onSubmit={handleHybridInferenceSubmit}>
                <h3>Base + CustomVoice 지시 생성</h3>
                <RecipeBar title="말투 템플릿" items={HYBRID_RECIPES} onApply={applyHybridRecipe} />
                <div className="field-row">
                  <label>
                    스타일 분석 모델
                    <select
                      value={hybridForm.base_model_id}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, base_model_id: event.target.value }))}
                    >
                      <option value="">선택하세요</option>
                      {baseModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {displayModelName(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    말투 지시용 모델
                    <select
                      value={hybridForm.custom_model_id}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, custom_model_id: event.target.value }))}
                    >
                      <option value="">선택하세요</option>
                      {customVoiceCapableModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {displayModelName(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  대사
                  <textarea value={hybridForm.text} onChange={(event) => setHybridForm((prev) => ({ ...prev, text: event.target.value }))} />
                </label>
                <label>
                  말투 지시
                  <textarea
                    placeholder="원하는 감정이나 분위기를 적어주세요."
                    value={hybridForm.instruct}
                    onChange={(event) => setHybridForm((prev) => ({ ...prev, instruct: event.target.value }))}
                  />
                </label>
                <label>
                  파일 이름
                  <input
                    value={hybridForm.output_name}
                    onChange={(event) => setHybridForm((prev) => ({ ...prev, output_name: event.target.value }))}
                  />
                </label>
                <label>
                  언어
                  <LanguageSelect
                    value={hybridForm.language}
                    onChange={(language) => setHybridForm((prev) => ({ ...prev, language }))}
                  />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
                  <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
                </details>
                <button className="primary-button" disabled={loading || !selectedHybridPreset} type="submit">
                  말투 지시 적용 생성
                </button>
              </form>
              ) : null}

              {presetWorkflow === "voicebox" ? (
              <form className="inference-panel" onSubmit={handleGenerateVoiceBoxFromPreset}>
                <h3>VoiceBox 프리셋 생성</h3>
                <label>
                  VoiceBox 모델
                  <select value={voiceBoxPresetForm.model_id} onChange={(event) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, model_id: event.target.value })}>
                    <option value="">선택하세요</option>
                    {voiceBoxModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  대사
                  <textarea value={voiceBoxPresetForm.text} onChange={(event) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, text: event.target.value })} />
                </label>
                <label>
                  파일 이름
                  <input value={voiceBoxPresetForm.output_name} onChange={(event) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, output_name: event.target.value })} />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
                  <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
                </details>
                <button className="secondary-button" disabled={loading || !selectedHybridPreset || !voiceBoxModels.length} type="submit">
                  VoiceBox 프리셋 생성
                </button>
              </form>
              ) : null}

              {presetWorkflow === "voicebox_instruct" ? (
              <form className="inference-panel" onSubmit={handleGenerateVoiceBoxInstructFromPreset}>
                <h3>VoiceBox 프리셋 + 말투 지시</h3>
                <RecipeBar title="말투 템플릿" items={HYBRID_RECIPES} onApply={(item) => setVoiceBoxPresetInstructForm((prev) => ({ ...prev, instruct: item.instruction || prev.instruct, text: item.text || prev.text, language: item.language || prev.language }))} />
                <label>
                  VoiceBox 모델
                  <select value={voiceBoxPresetInstructForm.model_id} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, model_id: event.target.value })}>
                    <option value="">선택하세요</option>
                    {voiceBoxModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  대사
                  <textarea value={voiceBoxPresetInstructForm.text} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, text: event.target.value })} />
                </label>
                <label>
                  말투 지시
                  <textarea value={voiceBoxPresetInstructForm.instruct} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, instruct: event.target.value })} />
                </label>
                <label>
                  파일 이름
                  <input value={voiceBoxPresetInstructForm.output_name} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, output_name: event.target.value })} />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
                  <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
                </details>
                <button className="primary-button" disabled={loading || !selectedHybridPreset || !voiceBoxModels.length} type="submit">
                  VoiceBox 지시 생성
                </button>
              </form>
              ) : null}
            </div>
          </section>

          {lastHybridRecord || lastVoiceBoxPresetRecord || lastVoiceBoxPresetInstructRecord ? (
            <section className="panel">
              <h3>생성 결과</h3>
              <div className="panel-grid">
                {lastHybridRecord ? <AudioCard title="Base + CustomVoice 결과" subtitle={lastHybridRecord.mode} record={lastHybridRecord} /> : null}
                {lastVoiceBoxPresetRecord ? <AudioCard title="VoiceBox 프리셋 결과" subtitle={lastVoiceBoxPresetRecord.mode} record={lastVoiceBoxPresetRecord} /> : null}
                {lastVoiceBoxPresetInstructRecord ? <AudioCard title="VoiceBox 지시 결과" subtitle={lastVoiceBoxPresetInstructRecord.mode} record={lastVoiceBoxPresetInstructRecord} /> : null}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {isS2ProTab(activeTab) ? (
        <section className="workspace workspace--stacked">
          <section className="s2pro-workspace">
            {s2ProRuntime ? (
              <span className={s2ProRuntime.server_running ? "runtime-pill is-ready" : "runtime-pill"}>
                {s2ProRuntime.runtime_mode === "api"
                  ? s2ProRuntime.api_key_configured
                    ? "Fish Audio API"
                    : "API key required"
                  : s2ProRuntime.server_running
                    ? "Local Fish Speech"
                    : "Local offline"}{" "}
                · {s2ProRuntime.model}
              </span>
            ) : (
              <span className="runtime-pill">Runtime 확인 중</span>
            )}
            <form className="s2pro-form" onSubmit={handleS2ProSubmit}>
              <div className="s2pro-form__main">
                {currentS2ProMode === "tagged" ? (
                  <>
                    <div className="s2pro-section-heading">
                      <span className="step-badge">1</span>
                      <div>
                        <h3>저장 목소리로 대사 만들기</h3>
                        <p>저장한 목소리를 선택해 새 대사를 생성합니다.</p>
                      </div>
                    </div>
                    <section className="s2pro-voice-selector">
                      <label>
                        Saved voice
                        <select value={selectedS2VoiceId} onChange={(event) => setSelectedS2VoiceId(event.target.value)}>
                          <option value="">저장 목소리 없이 기본 S2-Pro로 생성</option>
                          {s2ProVoices.map((voice) => (
                            <option key={voice.id} value={voice.id}>
                              {voice.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedS2Voice ? (
                        <div className="s2pro-selected-voice s2pro-selected-voice--wide">
                          <strong>{selectedS2Voice.name}</strong>
                          <span>{selectedS2Voice.reference_text || "저장된 참조 문장 없음"}</span>
                          <audio controls src={mediaUrl(selectedS2Voice.reference_audio_url)} />
                        </div>
                      ) : (
                        <div className="s2pro-empty-voice">
                          <strong>목소리 저장을 먼저 하면 여기서 계속 재사용할 수 있습니다.</strong>
                          <button className="secondary-button" onClick={() => openS2ProTab("s2pro_clone")} type="button">
                            목소리 저장으로 이동
                          </button>
                        </div>
                      )}
                    </section>
                    <label>
                      대사
                      <textarea
                        className="s2pro-textarea"
                        value={s2ProForm.text}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, text: event.target.value })}
                      />
                    </label>
                    <div className="s2pro-composer-dock">
                      <details className="tag-popover s2pro-tag-popover">
                        <summary>태그</summary>
                        <div className="tag-popover__panel s2pro-tag-popover__panel">
                          <p>대사 사이에 넣을 표현 태그를 고릅니다. 선택한 태그는 Text에 바로 삽입됩니다.</p>
                          <input
                            className="s2pro-tag-search"
                            placeholder="Search tags, e.g. whisper, angry, pause"
                            value={s2TagSearch}
                            onChange={(event) => setS2TagSearch(event.target.value)}
                          />
                          <div className="s2pro-tag-library" aria-label="S2-Pro expression tag library">
                            {filteredS2TagCategories.map((category) => (
                              <section className="s2pro-tag-category" key={category.label}>
                                <strong>{category.label}</strong>
                                <div className="tag-cloud">
                                  {category.tags.map((tag) => (
                                    <button className="tag-chip" key={tag} onClick={() => applyS2ProTag(tag)} type="button">
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      </details>
                      <span className="credit-indicator">{selectedS2Voice ? selectedS2Voice.name : "기본 S2-Pro voice"}</span>
                      <span className="byte-counter">{new Blob([s2ProForm.text]).size} / 500 바이트</span>
                      <button className="primary-button" type="submit">
                        음성 생성
                      </button>
                    </div>
                  </>
                ) : null}

                {currentS2ProMode === "clone" ? (
                  <>
                    <div className="s2pro-section-heading">
                      <span className="step-badge">1</span>
                      <div>
                        <h3>목소리 저장</h3>
                        <p>생성 갤러리 음성이나 업로드 파일을 재사용 가능한 목소리로 저장합니다.</p>
                      </div>
                    </div>
                    <div className="s2pro-clone-builder">
                      <div className="s2pro-source-switch" aria-label="S2-Pro 목소리 저장 입력 방식">
                        <button className={s2ProCloneSource === "gallery" ? "is-active" : ""} onClick={() => setS2ProCloneSource("gallery")} type="button">
                          생성 갤러리에서 선택
                        </button>
                        <button className={s2ProCloneSource === "upload" ? "is-active" : ""} onClick={() => setS2ProCloneSource("upload")} type="button">
                          새 파일 업로드
                        </button>
                      </div>

                      {s2ProCloneSource === "gallery" ? (
                        <section className="s2pro-source-panel">
                          <div className="s2pro-source-panel__head">
                            <strong>생성한 음성 선택</strong>
                            <span>목소리 설계, Qwen, S2-Pro에서 만든 결과를 바로 목소리 자산으로 저장합니다.</span>
                          </div>
                          <ServerAudioPicker assets={generatedAudioAssets} selectedPath={s2ProVoiceForm.reference_audio_path} onSelect={handleSelectS2ProReference} />
                        </section>
                      ) : (
                        <section className="s2pro-source-panel s2pro-upload-panel">
                          <label className="s2pro-upload-drop">
                            <span>참조 음성 업로드</span>
                            <strong>WAV, MP3, FLAC 파일을 선택하세요</strong>
                            <input
                              accept="audio/*"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  void handleUploadS2ProReference(file);
                                }
                              }}
                              type="file"
                            />
                          </label>
                          {s2ProUploadedRef ? (
                            <div className="s2pro-selected-reference">
                              <strong>{s2ProUploadedRef.filename}</strong>
                              <audio controls src={s2ProUploadedRef.url} />
                            </div>
                          ) : null}
                        </section>
                      )}

                      <section className="s2pro-voice-meta">
                        <div className="s2pro-selected-reference">
                          <strong>{s2ProVoiceForm.reference_audio_path ? basenameFromPath(s2ProVoiceForm.reference_audio_path) : "선택된 참조 음성이 없습니다"}</strong>
                          {s2ProVoiceForm.reference_audio_path ? <audio controls src={fileUrlFromPath(s2ProVoiceForm.reference_audio_path)} /> : null}
                        </div>
                        <label>
                          Voice name
                          <input value={s2ProVoiceForm.name} onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, name: event.target.value })} />
                        </label>
                        <label>
                          Runtime
                          <select
                            value={s2ProVoiceForm.runtime_source}
                            onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, runtime_source: event.target.value as "auto" | "local" | "api" })}
                          >
                            <option value="local">Local Fish Speech</option>
                            <option value="api">Fish Audio API</option>
                          </select>
                        </label>
                        <label className="s2pro-reference-transcript">
                          Reference transcript
                          <textarea
                            placeholder="비워두지 말고 실제 참조 음성의 대사를 넣으세요."
                            value={s2ProVoiceForm.reference_text}
                            onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, reference_text: event.target.value })}
                          />
                        </label>
                        <div className="button-row">
                          <button className="primary-button" disabled={!s2ProVoiceForm.reference_audio_path || !s2ProVoiceForm.name.trim()} onClick={() => handleCreateS2ProVoice()} type="button">
                            목소리 저장
                          </button>
                        </div>
                        <details className="advanced-inline">
                          <summary>Advanced controls</summary>
                          <div className="button-row">
                            <button className="secondary-button" disabled={!s2ProVoiceForm.reference_audio_path} onClick={handleTranscribeS2ProReference} type="button">
                              참조 텍스트 불러오기 / Whisper 전사
                            </button>
                            <label className="inline-check">
                              <input
                                checked={s2ProVoiceForm.create_qwen_prompt}
                                onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, create_qwen_prompt: event.target.checked })}
                                type="checkbox"
                              />
                              Qwen clone prompt도 함께 생성
                            </label>
                          </div>
                          <p className="field-hint">
                            생성 갤러리 음성은 저장된 생성 기록의 대사를 먼저 사용하고, 업로드 파일처럼 대사가 없는 경우에만 Whisper를 실행합니다.
                          </p>
                        </details>
                      </section>
                    </div>
                    <div className="s2pro-section-heading">
                      <span className="step-badge">2</span>
                      <div>
                        <h3>저장된 목소리</h3>
                        <p>저장된 목소리를 선택해 테스트하거나 다른 생성 흐름으로 보냅니다.</p>
                      </div>
                    </div>
                    <div className="s2pro-voice-grid">
                      {s2ProVoices.map((voice) => (
                        <article className={selectedS2VoiceId === voice.id ? "s2pro-voice-card is-selected" : "s2pro-voice-card"} key={voice.id}>
                          <button onClick={() => setSelectedS2VoiceId(voice.id)} type="button">
                            <strong>{voice.name}</strong>
                            <span>
                              {voice.runtime_source === "api"
                                ? "Fish Audio API voice"
                                : voice.fish_reference_present
                                  ? "Local Fish Speech ready"
                                  : "Fish server 재등록 필요"}
                            </span>
                          </button>
                          <audio controls src={mediaUrl(voice.reference_audio_url)} />
                          <div className="voice-card-actions">
                            <button onClick={() => useS2VoiceInQwen(voice, "clone")} type="button">
                              Qwen 복제로 보내기
                            </button>
                            <button onClick={() => useS2VoiceInQwen(voice, "tts")} type="button">
                              Qwen TTS로 보내기
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    <label>
                      저장 목소리 테스트 대사
                      <textarea
                        className="s2pro-textarea"
                        value={s2ProForm.clone_text}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, clone_text: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {currentS2ProMode === "multi_speaker" ? (
                  <>
                    <div className="s2pro-section-heading">
                      <span className="step-badge">1</span>
                      <div>
                        <h3>저장 목소리로 대화 만들기</h3>
                        <p>대사 안에 speaker tag를 넣어 장면을 나눕니다. 목소리 자산이 없으면 먼저 목소리를 저장하세요.</p>
                      </div>
                    </div>
                    <label>
                      Saved voice
                      <select value={selectedS2VoiceId} onChange={(event) => setSelectedS2VoiceId(event.target.value)}>
                        <option value="">저장 목소리 선택</option>
                        {s2ProVoices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Speaker script
                      <textarea
                        className="s2pro-textarea s2pro-textarea--tall"
                        value={s2ProForm.speaker_script}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, speaker_script: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {currentS2ProMode === "multilingual" ? (
                  <>
                    <div className="s2pro-section-heading">
                      <span className="step-badge">1</span>
                      <div>
                        <h3>저장 목소리로 다국어 문장 읽기</h3>
                        <p>같은 voice asset을 기준으로 한국어, 영어, 일본어 등 여러 언어 문장을 이어서 확인합니다.</p>
                      </div>
                    </div>
                    <label>
                      Saved voice
                      <select value={selectedS2VoiceId} onChange={(event) => setSelectedS2VoiceId(event.target.value)}>
                        <option value="">저장 목소리 없이 생성</option>
                        {s2ProVoices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Text
                      <textarea
                        className="s2pro-textarea"
                        value={s2ProForm.text}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, text: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <aside className="s2pro-form__side">
                <div className="s2pro-side-title">
                  <strong>Generation settings</strong>
                  <span>{selectedS2Voice ? selectedS2Voice.name : "기본 S2-Pro voice"}</span>
                </div>
                <label>
                  Runtime
                  <select
                    value={s2ProForm.runtime_source}
                    onChange={(event) => setS2ProForm({ ...s2ProForm, runtime_source: event.target.value as "auto" | "local" | "api" })}
                  >
                    <option value="local">Local Fish Speech</option>
                    <option value="api">Fish Audio API</option>
                    <option value="auto">Auto from selected voice</option>
                  </select>
                </label>
                <label>
                  Output name
                  <input value={s2ProForm.output_name} onChange={(event) => setS2ProForm({ ...s2ProForm, output_name: event.target.value })} />
                </label>
                <label>
                  Language
                  <LanguageSelect value={s2ProForm.language} onChange={(language) => setS2ProForm({ ...s2ProForm, language })} />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
                  <label>
                    Inline style instruction
                    <textarea
                      value={s2ProForm.instruction}
                      onChange={(event) => setS2ProForm({ ...s2ProForm, instruction: event.target.value })}
                    />
                    <span className="field-caption">문장 앞에 표현 태그를 더해 톤과 호흡을 보정합니다. 보통은 접어두고 필요할 때만 사용하세요.</span>
                  </label>
                  <div className="field-row">
                    <label>
                      Temperature
                      <input value={s2ProForm.temperature} onChange={(event) => setS2ProForm({ ...s2ProForm, temperature: event.target.value })} />
                    </label>
                    <label>
                      Top P
                      <input value={s2ProForm.top_p} onChange={(event) => setS2ProForm({ ...s2ProForm, top_p: event.target.value })} />
                    </label>
                    <label>
                      Max tokens
                      <input value={s2ProForm.max_tokens} onChange={(event) => setS2ProForm({ ...s2ProForm, max_tokens: event.target.value })} />
                    </label>
                  </div>
                </details>
                <button className="primary-button" type="submit">
                  S2-Pro 생성
                </button>
                {selectedS2Voice ? (
                  <div className="s2pro-selected-voice">
                    <strong>{selectedS2Voice.name}</strong>
                    <span>{selectedS2Voice.reference_id}</span>
                  </div>
                ) : null}
              </aside>
            </form>
            {lastS2ProRecord ? (
              <div className="result-stack">
                <AudioCard title="S2-Pro 생성 결과" subtitle={lastS2ProRecord.mode} record={lastS2ProRecord} />
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "effects" ? (
        <section className="workspace workspace--stacked">
          <section className="sound-effects-shell">
            <div className="sound-effects-top">
              <div>
                <h2>사운드 효과</h2>
                <p>영어 프롬프트와 길이, 강도를 직접 조절해 효과음을 생성합니다.</p>
              </div>
            </div>

            <div className="sound-effects-search">
              <input
                placeholder="효과음 검색"
                value={audioEffectsSearch}
                onChange={(event) => setAudioEffectsSearch(event.target.value)}
              />
            </div>

            <div className="sound-effects-list">
              {filteredSoundEffectLibrary.map((item) => (
                <article className="sound-effects-row" key={item.id}>
                  <div className="sound-effects-row__main">
                    <span className={`sound-effects-dot ${item.profile === "mmaudio_nsfw" ? "sound-effects-dot--nsfw" : `sound-effects-dot--${item.id}`}`}>
                      {item.profile === "mmaudio_nsfw" ? "19" : ""}
                    </span>
                    <div>
                      <strong>
                        {item.title}
                        {item.profile === "mmaudio_nsfw" ? <span className="sound-effects-badge">19+</span> : null}
                      </strong>
                      <p>{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="sound-effects-row__player">
                    <span>{item.duration}</span>
                    <MiniWaveform />
                    <button className="icon-button" onClick={() => applySoundEffectRecipe(item)} type="button">
                      Use prompt
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <form className="sound-effects-composer" onSubmit={handleSoundEffectSubmit}>
              <div className="sound-effects-composer__label">Prompt</div>
              <textarea
                placeholder="Write the sound prompt in English."
                value={soundEffectForm.prompt}
                onChange={(event) => setSoundEffectForm({ ...soundEffectForm, prompt: event.target.value })}
              />
              <div className="field-row">
                <label>
                  모델
                  <select
                    value={soundEffectForm.model_profile}
                    onChange={(event) => setSoundEffectForm({ ...soundEffectForm, model_profile: event.target.value })}
                  >
                    <option value="mmaudio">MMAudio</option>
                    <option value="mmaudio_nsfw">MMAudio NSFW</option>
                  </select>
                </label>
                <label>
                  길이(초)
                  <input
                    value={soundEffectForm.duration_sec}
                    onChange={(event) => setSoundEffectForm({ ...soundEffectForm, duration_sec: event.target.value })}
                  />
                </label>
                <label>
                  강도
                  <input
                    value={soundEffectForm.intensity}
                    onChange={(event) => setSoundEffectForm({ ...soundEffectForm, intensity: event.target.value })}
                  />
                </label>
              </div>
              <details className="advanced-inline">
                <summary>Advanced settings</summary>
                <div className="field-row">
                  <label>
                    Seed
                    <input
                      placeholder="비우면 자동"
                      value={soundEffectForm.seed}
                      onChange={(event) => setSoundEffectForm({ ...soundEffectForm, seed: event.target.value })}
                    />
                  </label>
                  <label>
                    Steps
                    <input
                      value={soundEffectForm.steps}
                      onChange={(event) => setSoundEffectForm({ ...soundEffectForm, steps: event.target.value })}
                    />
                  </label>
                  <label>
                    CFG
                    <input
                      value={soundEffectForm.cfg_scale}
                      onChange={(event) => setSoundEffectForm({ ...soundEffectForm, cfg_scale: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  제외할 소리
                  <textarea
                    placeholder="예: speech, music, harsh clipping"
                    value={soundEffectForm.negative_prompt}
                    onChange={(event) => setSoundEffectForm({ ...soundEffectForm, negative_prompt: event.target.value })}
                  />
                </label>
              </details>
              <div className="sound-effects-composer__meta">
                <span>{soundEffectsAvailable ? "MMAudio 기반 생성기 연결 상태를 사용합니다." : "사운드 효과 엔진이 아직 준비되지 않았습니다."}</span>
                <button className="primary-button" disabled={loading || !soundEffectsAvailable} type="submit">
                  생성
                </button>
              </div>
            </form>
            {lastAudioToolResult?.kind === "sound_effect" && lastAudioToolResult.record ? (
              <section className="panel">
                <h3>방금 생성한 사운드 효과</h3>
                <AudioCard title="사운드 효과" record={lastAudioToolResult.record} />
              </section>
            ) : null}
          </section>
        </section>
      ) : null}

      {isAceStepTab(activeTab) ? (
        <section className="workspace workspace--stacked">
          <section className="ace-step-shell">
            {currentAceStepMode !== "text2music" && currentAceStepMode !== "create_sample" && currentAceStepMode !== "format_sample" ? (
              <div className="panel ace-step-source-panel">
                <h3>Source audio</h3>
                <p className="text-muted">업로드, 직접 경로, 생성 갤러리 중 하나로 작업할 원본을 고릅니다.</p>
                <label>
                  Source audio path
                  <input
                    placeholder="data/uploads/... 또는 절대경로"
                    value={aceStepAudioForm.src_audio}
                    onChange={(event) => setAceStepAudioForm({ ...aceStepAudioForm, src_audio: event.target.value })}
                  />
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    await runAction(async () => {
                      const result = await api.uploadAudio(file);
                      setAceStepAudioForm((prev) => ({ ...prev, src_audio: result.path }));
                      setMessage(`${result.filename} 업로드 완료`);
                    });
                  }}
                />
                <ServerAudioPicker assets={generatedAudioAssets} selectedPath={aceStepAudioForm.src_audio} onSelect={(asset) => setAceStepAudioForm({ src_audio: asset.path })} />
              </div>
            ) : null}

            {currentAceStepMode !== "text2music" ? (
              <div className="panel ace-step-common-panel">
                <h3>Model & LoRA</h3>
                <p className="text-muted">모델을 비워두면 다운로드된 turbo 계열을 우선 사용합니다. LoRA는 특정 스타일을 더 강하게 입힐 때만 선택하세요.</p>
                <div className="field-row">
                  <label>
                    DiT 모델
                    <select
                      value={aceStepCommonForm.config_path}
                      onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, config_path: event.target.value })}
                    >
                      <option value="">자동 (turbo 우선)</option>
                      {(aceStepRuntime?.model_variants || []).map((variant) => (
                        <option key={variant.name} value={variant.name}>
                          {variant.name}
                          {variant.available ? "" : " (다운로드 필요)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    5Hz LM
                    <select
                      value={aceStepCommonForm.lm_model_path}
                      onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lm_model_path: event.target.value })}
                    >
                      <option value="">자동 (1.7B 우선)</option>
                      {(aceStepRuntime?.lm_models || []).map((variant) => (
                        <option key={variant.name} value={variant.name}>
                          {variant.name}
                          {variant.available ? "" : " (다운로드 필요)"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    LoRA 경로
                    <select
                      value={aceStepCommonForm.lora_path}
                      onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lora_path: event.target.value })}
                    >
                      <option value="">사용 안 함</option>
                      {(aceStepRuntime?.lora_adapters || []).map((lora) => (
                        <option key={lora.path} value={lora.path}>
                          {lora.relative_path || lora.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    LoRA scale
                    <input
                      value={aceStepCommonForm.lora_scale}
                      onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lora_scale: event.target.value })}
                    />
                  </label>
                  <label>
                    Adapter name
                    <input
                      placeholder="예: voice / style"
                      value={aceStepCommonForm.lora_adapter_name}
                      onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lora_adapter_name: event.target.value })}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {currentAceStepMode === "text2music" ? (
              <form className="music-console" onSubmit={handleAceStepSubmit}>
                <div className="music-console__head">
                  <div>
                    <span className="studio-page-head__eyebrow"><i /> ACE-Step 1.5</span>
                    <h2>Composer</h2>
                    <p>스타일 프롬프트와 가사를 바로 생성 요청으로 보내는 작곡 콘솔입니다.</p>
                  </div>
                  <label className="music-console__name">
                    Track name
                    <input
                      value={aceStepForm.output_name}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, output_name: event.target.value })}
                    />
                  </label>
                </div>

                <div className="music-preset-strip">
                  {ACE_STEP_STYLE_PRESETS.map((preset) => (
                    <button
                      className="pill-button"
                      key={preset.label}
                      onClick={() => setAceStepForm((prev) => ({ ...prev, prompt: preset.prompt }))}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="music-arrangement">
                  <section className="music-track music-track--prompt">
                    <div className="music-track__label">
                      <b>STYLE</b>
                      <span>prompt lane</span>
                    </div>
                    <textarea
                      className="music-track__input"
                      value={aceStepForm.prompt}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                    />
                  </section>
                  <section className="music-track music-track--lyrics">
                    <div className="music-track__label">
                      <b>LYRICS</b>
                      <span>vocal lane</span>
                    </div>
                    <textarea
                      className="music-track__input"
                      value={aceStepForm.lyrics}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, lyrics: event.target.value })}
                    />
                  </section>
                  <div className="music-wave-lane" aria-hidden="true">
                    {aceComposerBars.map((height, index) => (
                      <i key={`ace-wave-${index}`} style={{ height }} />
                    ))}
                  </div>
                  <div className="music-spectrum" aria-hidden="true">
                    {Array.from({ length: 72 }, (_, index) => (
                      <span
                        key={`ace-spectrum-${index}`}
                        style={{
                          height: 22 + Math.abs(Math.sin(index * 0.21) * 86) + (index % 6) * 4,
                          opacity: 0.35 + ((index % 9) / 14),
                        }}
                      />
                    ))}
                    <b />
                  </div>
                </div>

                <div className="music-control-rack">
                  <label>
                    Duration
                    <input
                      value={aceStepForm.audio_duration}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, audio_duration: event.target.value })}
                    />
                  </label>
                  <label>
                    Steps
                    <input
                      value={aceStepForm.infer_step}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, infer_step: event.target.value })}
                    />
                  </label>
                  <label>
                    Guidance
                    <input
                      value={aceStepForm.guidance_scale}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_scale: event.target.value })}
                    />
                  </label>
                  <label>
                    Seed
                    <input
                      value={aceStepForm.manual_seeds}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, manual_seeds: event.target.value })}
                    />
                  </label>
                </div>

                <details className="advanced-inline music-advanced">
                  <summary>Advanced controls</summary>
                  <div className="field-row">
                    <label>
                      Scheduler
                      <select
                        value={aceStepForm.scheduler_type}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, scheduler_type: event.target.value })}
                      >
                        <option value="euler">euler</option>
                        <option value="heun">heun</option>
                        <option value="pingpong">pingpong</option>
                      </select>
                    </label>
                    <label>
                      CFG type
                      <select
                        value={aceStepForm.cfg_type}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, cfg_type: event.target.value })}
                      >
                        <option value="apg">apg</option>
                        <option value="cfg">cfg</option>
                      </select>
                    </label>
                    <label>
                      Omega scale
                      <input
                        value={aceStepForm.omega_scale}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, omega_scale: event.target.value })}
                      />
                    </label>
                    <label>
                      Guidance interval
                      <input
                        value={aceStepForm.guidance_interval}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_interval: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Guidance decay
                      <input
                        value={aceStepForm.guidance_interval_decay}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_interval_decay: event.target.value })}
                      />
                    </label>
                    <label>
                      Min guidance
                      <input
                        value={aceStepForm.min_guidance_scale}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, min_guidance_scale: event.target.value })}
                      />
                    </label>
                    <label>
                      Text guidance
                      <input
                        value={aceStepForm.guidance_scale_text}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_scale_text: event.target.value })}
                      />
                    </label>
                    <label>
                      Lyric guidance
                      <input
                        value={aceStepForm.guidance_scale_lyric}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_scale_lyric: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      OSS steps
                      <input
                        placeholder="예: 10,20"
                        value={aceStepForm.oss_steps}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, oss_steps: event.target.value })}
                      />
                    </label>
                    <label>
                      Device ID
                      <input
                        value={aceStepForm.device_id}
                        onChange={(event) => setAceStepForm({ ...aceStepForm, device_id: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="ace-step-toggle-grid">
                    <label><input checked={aceStepForm.use_erg_tag} onChange={(event) => setAceStepForm({ ...aceStepForm, use_erg_tag: event.target.checked })} type="checkbox" /> ERG tag</label>
                    <label><input checked={aceStepForm.use_erg_lyric} onChange={(event) => setAceStepForm({ ...aceStepForm, use_erg_lyric: event.target.checked })} type="checkbox" /> ERG lyric</label>
                    <label><input checked={aceStepForm.use_erg_diffusion} onChange={(event) => setAceStepForm({ ...aceStepForm, use_erg_diffusion: event.target.checked })} type="checkbox" /> ERG diffusion</label>
                    <label><input checked={aceStepForm.bf16} onChange={(event) => setAceStepForm({ ...aceStepForm, bf16: event.target.checked })} type="checkbox" /> BF16</label>
                    <label><input checked={aceStepForm.torch_compile} onChange={(event) => setAceStepForm({ ...aceStepForm, torch_compile: event.target.checked })} type="checkbox" /> torch.compile</label>
                    <label><input checked={aceStepForm.cpu_offload} onChange={(event) => setAceStepForm({ ...aceStepForm, cpu_offload: event.target.checked })} type="checkbox" /> CPU offload</label>
                    <label><input checked={aceStepForm.overlapped_decode} onChange={(event) => setAceStepForm({ ...aceStepForm, overlapped_decode: event.target.checked })} type="checkbox" /> Overlapped decode</label>
                  </div>
                </details>

                <div className="music-analysis">
                  <div className="music-analysis__metric"><h6>Duration</h6><div className="v">{aceMetricValue(aceStepForm.audio_duration, "60")}<small>sec</small></div><div className="delta">target length</div></div>
                  <div className="music-analysis__metric"><h6>Steps</h6><div className="v">{aceMetricValue(aceStepForm.infer_step, "27")}</div><div className="delta">diffusion</div></div>
                  <div className="music-analysis__metric"><h6>Guidance</h6><div className="v">{aceMetricValue(aceStepForm.guidance_scale, "15")}</div><div className="delta">prompt strength</div></div>
                  <div className="music-analysis__metric"><h6>Render</h6><div className="v">{aceStepForm.bf16 ? "BF16" : "FP32"}</div><div className="delta">{aceStepForm.cpu_offload ? "cpu offload" : "gpu first"}</div></div>
                </div>

                <button className="primary-button music-render-button" disabled={loading || !aceStepAvailable} type="submit">
                  음악 생성
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "cover" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepCoverSubmit}>
                <h3>커버 만들기</h3>
                <p className="text-muted">원본 오디오의 흐름은 남기고 장르, 악기 질감, 보컬 분위기를 새 프롬프트 쪽으로 바꿉니다.</p>
                <div className="field-row">
                  <label>
                    Style prompt
                    <textarea
                      className="ace-step-textarea"
                      value={aceStepForm.prompt}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                    />
                  </label>
                  <label>
                    Lyrics (선택)
                    <textarea
                      className="ace-step-textarea ace-step-textarea--lyrics"
                      value={aceStepForm.lyrics}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, lyrics: event.target.value })}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Cover strength (0=완전 새로, 1=원곡 가깝게)
                    <input
                      value={aceStepCoverForm.audio_cover_strength}
                      onChange={(event) => setAceStepCoverForm({ ...aceStepCoverForm, audio_cover_strength: event.target.value })}
                    />
                  </label>
                  <label>
                    Cover noise strength
                    <input
                      value={aceStepCoverForm.cover_noise_strength}
                      onChange={(event) => setAceStepCoverForm({ ...aceStepCoverForm, cover_noise_strength: event.target.value })}
                    />
                  </label>
                </div>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Cover 생성
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "repaint" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepRepaintSubmit}>
                <h3>구간 다시 만들기</h3>
                <p className="text-muted">전체 곡을 버리지 않고, 타임라인에서 지정한 초 단위 구간만 새로 합성합니다.</p>
                <div className="field-row">
                  <label>
                    Style prompt
                    <textarea
                      className="ace-step-textarea"
                      value={aceStepForm.prompt}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                    />
                  </label>
                  <label>
                    Lyrics
                    <textarea
                      className="ace-step-textarea ace-step-textarea--lyrics"
                      value={aceStepForm.lyrics}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, lyrics: event.target.value })}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Repaint start (초)
                    <input
                      value={aceStepRepaintForm.repainting_start}
                      onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repainting_start: event.target.value })}
                    />
                  </label>
                  <label>
                    Repaint end (초, -1=끝까지)
                    <input
                      value={aceStepRepaintForm.repainting_end}
                      onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repainting_end: event.target.value })}
                    />
                  </label>
                  <label>
                    Mode
                    <select
                      value={aceStepRepaintForm.repaint_mode}
                      onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_mode: event.target.value })}
                    >
                      <option value="conservative">conservative</option>
                      <option value="balanced">balanced</option>
                      <option value="aggressive">aggressive</option>
                    </select>
                  </label>
                  <label>
                    Strength (balanced 전용)
                    <input
                      value={aceStepRepaintForm.repaint_strength}
                      onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_strength: event.target.value })}
                    />
                  </label>
                </div>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Repaint 생성
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "extend" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepExtendSubmit}>
                <h3>뒤를 이어붙이기</h3>
                <p className="text-muted">소스 오디오 뒤에 이어질 파트를 만듭니다. 어떤 트랙을 이어갈지 콤마로 적습니다.</p>
                <label>
                  Style prompt
                  <textarea
                    className="ace-step-textarea"
                    value={aceStepForm.prompt}
                    onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                  />
                </label>
                <label>
                  Tracks (콤마로 구분)
                  <input
                    value={aceStepExtendForm.complete_tracks}
                    onChange={(event) => setAceStepExtendForm({ ...aceStepExtendForm, complete_tracks: event.target.value })}
                  />
                </label>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Extend 실행
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "extract" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepExtractSubmit}>
                <h3>트랙 하나만 분리하기</h3>
                <p className="text-muted">원본에서 보컬, 드럼, 베이스처럼 하나의 stem만 뽑아 새 파일로 저장합니다.</p>
                <label>
                  Track
                  <select
                    value={aceStepExtractForm.extract_track}
                    onChange={(event) => setAceStepExtractForm({ ...aceStepExtractForm, extract_track: event.target.value })}
                  >
                    {ACE_STEP_TRACK_OPTIONS.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Extract
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "lego" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepLegoSubmit}>
                <h3>트랙 추가하기</h3>
                <p className="text-muted">기존 믹스는 유지하고, 선택한 악기나 보컬 lane 하나를 새로 얹습니다.</p>
                <label>
                  Style prompt
                  <textarea
                    className="ace-step-textarea"
                    value={aceStepForm.prompt}
                    onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                  />
                </label>
                <label>
                  Track
                  <select
                    value={aceStepLegoForm.lego_track}
                    onChange={(event) => setAceStepLegoForm({ ...aceStepLegoForm, lego_track: event.target.value })}
                  >
                    {ACE_STEP_TRACK_OPTIONS.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Lego 추가
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "complete" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepCompleteSubmit}>
                <h3>부족한 트랙 채우기</h3>
                <p className="text-muted">드럼, 베이스, 보컬처럼 비어 있거나 약한 여러 트랙을 한 번에 보강합니다.</p>
                <label>
                  Style prompt
                  <textarea
                    className="ace-step-textarea"
                    value={aceStepForm.prompt}
                    onChange={(event) => setAceStepForm({ ...aceStepForm, prompt: event.target.value })}
                  />
                </label>
                <label>
                  Tracks (콤마로 구분)
                  <input
                    value={aceStepCompleteForm.complete_tracks}
                    onChange={(event) => setAceStepCompleteForm({ ...aceStepCompleteForm, complete_tracks: event.target.value })}
                  />
                </label>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  Complete 실행
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "understand" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepUnderstandSubmit}>
                <h3>오디오 분석하기</h3>
                <p className="text-muted">오디오를 듣고 BPM, 키, 언어, 가사, 스타일 캡션을 추정해 다음 작곡 입력으로 재사용합니다.</p>
                <button className="primary-button" disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit">
                  분석 실행
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "create_sample" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepCreateSampleSubmit}>
                <h3>아이디어를 작곡 초안으로 바꾸기</h3>
                <p className="text-muted">“비 오는 밤의 한국 시티팝” 같은 한 줄 아이디어를 스타일 설명과 가사 초안으로 펼칩니다.</p>
                <label>
                  Query
                  <textarea
                    className="ace-step-textarea"
                    value={aceStepCreateSampleForm.query}
                    onChange={(event) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, query: event.target.value })}
                  />
                </label>
                <div className="field-row">
                  <label>
                    Vocal language (선택)
                    <input
                      placeholder="예: ko, en, ja"
                      value={aceStepCreateSampleForm.vocal_language}
                      onChange={(event) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, vocal_language: event.target.value })}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={aceStepCreateSampleForm.instrumental}
                      onChange={(event) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, instrumental: event.target.checked })}
                    />
                    Instrumental
                  </label>
                </div>
                <button className="primary-button" disabled={loading || !aceStepAvailable} type="submit">
                  샘플 만들기
                </button>
              </form>
            ) : null}

            {currentAceStepMode === "format_sample" ? (
              <form className="panel ace-step-task-form" onSubmit={handleAceStepFormatSampleSubmit}>
                <h3>프롬프트와 가사를 정리하기</h3>
                <p className="text-muted">
                  이 기능은 오디오를 바꾸는 기능이 아닙니다. 현재 작곡 폼의 Style prompt와 Lyrics를 ACE-Step이 안정적으로 읽는 입력문으로 다듬고,
                  정리된 결과를 다시 작곡 폼에 반영합니다.
                </p>
                <button className="primary-button" disabled={loading || !aceStepAvailable} type="submit">
                  작곡 입력 정리
                </button>
              </form>
            ) : null}

            {aceStepUnderstandResult ? (
              <section className="panel">
                <h3>분석 / 메타 결과</h3>
                <ul className="ace-step-meta-list">
                  <li>
                    <strong>Caption:</strong> {aceStepUnderstandResult.caption || "-"}
                  </li>
                  <li>
                    <strong>BPM:</strong> {aceStepUnderstandResult.bpm ?? "-"} | <strong>Duration:</strong> {aceStepUnderstandResult.duration ?? "-"}s
                  </li>
                  <li>
                    <strong>Key:</strong> {aceStepUnderstandResult.keyscale || "-"} | <strong>Time signature:</strong>{" "}
                    {aceStepUnderstandResult.timesignature || "-"} | <strong>Language:</strong> {aceStepUnderstandResult.language || "-"}
                  </li>
                  <li>
                    <strong>Lyrics:</strong>
                    <pre className="ace-step-meta-lyrics">{aceStepUnderstandResult.lyrics || "-"}</pre>
                  </li>
                  {aceStepUnderstandResult.error ? <li className="text-error">Error: {aceStepUnderstandResult.error}</li> : null}
                </ul>
              </section>
            ) : null}

            {lastAceStepRecord ? (
              <div className="result-stack">
                <AudioCard title={getRecordDisplayTitle(lastAceStepRecord)} subtitle="ACE-Step" record={lastAceStepRecord} />
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "applio_train" || activeTab === "applio_convert" ? (
        <section className="workspace workspace--stacked">
          {activeTab === "applio_train" ? (
            <form className="panel voice-changer-panel" onSubmit={handleRvcTrainSubmit}>
              <div className="section-heading">
                <span className="step-badge">1</span>
                <div>
                  <h2>목표 목소리 모델 만들기</h2>
                  <p>Applio/RVC는 참고 음성 하나를 바로 쓰는 방식이 아니라, 목표 목소리 데이터로 모델을 만든 뒤 변환에 사용합니다.</p>
                </div>
              </div>
              <div className="rvc-train-hero">
                <div>
                  <strong>준비물</strong>
                  <p>목표 목소리만 깨끗하게 들어 있는 WAV 폴더를 넣으세요. 같은 화자 음성 10분 이상을 권장합니다.</p>
                </div>
                <div>
                  <strong>결과물</strong>
                  <p>학습이 끝나면 `.pth` 모델과 `.index`가 생기고, 변환 탭의 목소리 목록에 나타납니다.</p>
                </div>
              </div>
              <div className="field-row">
                <label>
                  모델 이름
                  <input value={rvcTrainForm.model_name} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, model_name: event.target.value })} />
                  <span className="field-caption">예: mai-rvc, narrator-clean. 화면에는 이 이름으로 표시됩니다.</span>
                </label>
                <label>
                  목표 목소리 폴더
                  <input placeholder="/mnt/d/voice/rvc_dataset/wavs" value={rvcTrainForm.dataset_path} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, dataset_path: event.target.value })} />
                  <span className="field-caption">이 폴더 안의 WAV 파일들이 RVC 모델의 목표 음색이 됩니다.</span>
                </label>
              </div>
              <div className="field-row">
                <label>
                  샘플레이트
                  <select value={rvcTrainForm.sample_rate} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, sample_rate: event.target.value })}>
                    <option value="40000">40k - 일반 권장</option>
                    <option value="48000">48k - 고음질</option>
                    <option value="32000">32k - 가벼움</option>
                  </select>
                </label>
                <label>
                  학습 에포크
                  <input value={rvcTrainForm.total_epoch} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, total_epoch: event.target.value })} />
                </label>
                <label>
                  배치 크기
                  <input value={rvcTrainForm.batch_size} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, batch_size: event.target.value })} />
                </label>
              </div>
              <details className="advanced-controls">
                <summary>Advanced controls</summary>
                <div className="field-row">
                  <label>
                    F0 method
                    <select value={rvcTrainForm.f0_method} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, f0_method: event.target.value })}>
                      <option value="rmvpe">rmvpe</option>
                      <option value="fcpe">fcpe</option>
                      <option value="crepe">crepe</option>
                    </select>
                  </label>
                  <label>
                    Content embedder
                    <select value={rvcTrainForm.embedder_model} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, embedder_model: event.target.value })}>
                      <option value="contentvec">contentvec</option>
                      <option value="korean-hubert-base">korean-hubert-base</option>
                      <option value="spin">spin</option>
                      <option value="spin-v2">spin-v2</option>
                    </select>
                  </label>
                  <label>
                    CPU cores
                    <input value={rvcTrainForm.cpu_cores} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, cpu_cores: event.target.value })} />
                  </label>
                  <label>
                    GPU
                    <input value={rvcTrainForm.gpu} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, gpu: event.target.value })} />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Cut mode
                    <select value={rvcTrainForm.cut_preprocess} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, cut_preprocess: event.target.value })}>
                      <option value="Automatic">Automatic</option>
                      <option value="Simple">Simple</option>
                      <option value="Skip">Skip</option>
                    </select>
                  </label>
                  <label>
                    Chunk length
                    <input value={rvcTrainForm.chunk_len} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, chunk_len: event.target.value })} />
                  </label>
                  <label>
                    Overlap
                    <input value={rvcTrainForm.overlap_len} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, overlap_len: event.target.value })} />
                  </label>
                  <label>
                    Index
                    <select value={rvcTrainForm.index_algorithm} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, index_algorithm: event.target.value })}>
                      <option value="Auto">Auto</option>
                      <option value="Faiss">Faiss</option>
                      <option value="KMeans">KMeans</option>
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={rvcTrainForm.noise_reduction} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, noise_reduction: event.target.checked })} />
                    Noise reduction
                  </label>
                  <label>
                    Clean strength
                    <input value={rvcTrainForm.clean_strength} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, clean_strength: event.target.value })} />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={rvcTrainForm.checkpointing} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, checkpointing: event.target.checked })} />
                    Memory-efficient training
                  </label>
                </div>
              </details>
              {lastRvcTrainingResult ? <p className="field-hint">{lastRvcTrainingResult}</p> : null}
              <button className="primary-button" disabled={loading || !rvcTrainForm.model_name || !rvcTrainForm.dataset_path} type="submit">
                RVC 모델 만들기
              </button>
            </form>
          ) : null}

          {activeTab === "applio_convert" ? (
            <div className="voice-changer-layout">
              <section className="panel voice-changer-source">
                <div className="section-heading">
                  <span className="step-badge">1</span>
                  <div>
                    <h2>변환할 원본 오디오</h2>
                    <p>말소리나 분리된 보컬을 넣고, 오른쪽에서 학습된 RVC 목소리를 선택합니다.</p>
                  </div>
                </div>
                <label className="upload-field upload-field--compact">
                  새 음성 업로드
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleAudioToolUpload(file);
                      }
                    }}
                  />
                </label>
                <label>
                  직접 경로 입력
                  <input
                    placeholder="data/generated/... 또는 /mnt/d/..."
                    value={voiceChangerForm.audio_path}
                    onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, audio_path: event.target.value })}
                  />
                </label>
                {voiceChangerForm.audio_path ? (
                  <div className="selected-source-card">
                    <span className="meta-label">선택한 원본</span>
                    <strong>{selectedVoiceChangerAsset?.filename || audioToolUpload?.filename || basenameFromPath(voiceChangerForm.audio_path)}</strong>
                    <audio controls src={fileUrlFromPath(voiceChangerForm.audio_path)} />
                  </div>
                ) : (
                  <p className="field-hint">업로드하거나 아래 목록에서 변환할 원본 음성을 선택하세요.</p>
                )}
                <ServerAudioPicker assets={generatedAudioAssets} selectedPath={voiceChangerForm.audio_path} onSelect={handleSelectAudioToolAsset} />
              </section>

              <form className="panel voice-changer-panel" onSubmit={handleVoiceChangerSubmit}>
                <div className="section-heading">
                  <span className="step-badge">2</span>
                  <div>
                    <h2>학습된 목소리로 변환</h2>
                    <p>훈련 탭에서 만든 RVC 모델이나 다운로드한 RVC 모델을 선택합니다.</p>
                  </div>
                </div>
                {!voiceChangerAvailable ? <p className="field-hint">사용 가능한 RVC 목소리 모델이 없습니다. 모델 다운로드나 RVC 학습을 먼저 실행해 주세요.</p> : null}
                <label>
                  바꿀 목소리
                  <select value={voiceChangerForm.selected_model_id} onChange={(event) => handleSelectVoiceChangerModel(event.target.value)}>
                    <option value="">목소리 선택</option>
                    {voiceChangerModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedVoiceChangerModel ? (
                  <div className="voice-model-summary">
                    <span className="voice-model-summary__avatar" aria-hidden="true" />
                    <div>
                      <span className="meta-label">선택한 목소리</span>
                      <strong>{selectedVoiceChangerModel.label}</strong>
                      <p>RVC 모델과 검색 인덱스를 사용해 원본 음성의 음색을 바꿉니다.</p>
                    </div>
                  </div>
                ) : null}
                <div className="field-row">
                  <label>
                    음정 추적 방식
                    <select value={voiceChangerForm.f0_method} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: event.target.value })}>
                      <option value="rmvpe">RMVPE - 기본 권장</option>
                      <option value="fcpe">FCPE - 빠른 처리</option>
                      <option value="crepe">CREPE - 선율 민감</option>
                    </select>
                  </label>
                  <label>
                    음색 반영 강도
                    <input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                  </label>
                  <label>
                    발음 보존
                    <input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                  </label>
                </div>
                <details className="advanced-controls voice-changer-advanced">
                  <summary>Advanced controls</summary>
                  <div className="field-row">
                    <label>
                      RVC model path
                      <input value={voiceChangerForm.model_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, model_path: event.target.value })} />
                    </label>
                    <label>
                      Index path
                      <input value={voiceChangerForm.index_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_path: event.target.value })} />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Pitch shift
                      <input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                    </label>
                    <label>
                      Clean strength
                      <input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                    </label>
                    <label>
                      Content embedder
                      <select value={voiceChangerForm.embedder_model} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, embedder_model: event.target.value })}>
                        <option value="contentvec">contentvec</option>
                        <option value="hubert">hubert</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={voiceChangerForm.split_audio} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, split_audio: event.target.checked })} />
                      Split long audio
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={voiceChangerForm.f0_autotune} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_autotune: event.target.checked })} />
                      F0 autotune
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={voiceChangerForm.clean_audio} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_audio: event.target.checked })} />
                      Clean output audio
                    </label>
                  </div>
                </details>
                <button className="primary-button" disabled={loading || !voiceChangerAvailable || !voiceChangerForm.audio_path || !voiceChangerForm.model_path} type="submit">
                  목소리 바꾸기
                </button>
              </form>
            </div>
          ) : null}

          {lastAudioToolResult?.kind === "voice_changer" && lastAudioToolResult.record ? (
            <section className="panel">
              <h2>방금 변환한 결과</h2>
              <AudioCard title="Applio 변환 결과" record={lastAudioToolResult.record} />
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "applio_batch" ? (
        <section className="workspace workspace--stacked">
          <div className="voice-changer-layout">
            <section className="panel voice-changer-source">
              <div className="section-heading">
                <span className="step-badge">1</span>
                <div>
                  <h2>배치 변환할 오디오</h2>
                  <p>생성 갤러리에서 여러 음성을 고르거나 새 파일을 업로드해 같은 RVC 모델로 한 번에 변환합니다.</p>
                </div>
              </div>
              <label className="upload-field upload-field--compact">
                배치에 파일 추가
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleApplioBatchUpload(file);
                    }
                  }}
                />
              </label>
              <div className="field-row field-row--with-action">
                <label>
                  직접 경로 추가
                  <input
                    placeholder="data/generated/... 또는 /mnt/d/..."
                    value={applioBatchManualPath}
                    onChange={(event) => setApplioBatchManualPath(event.target.value)}
                  />
                </label>
                <button className="secondary-button" onClick={addApplioBatchManualPath} type="button">
                  경로 추가
                </button>
              </div>
              <ServerAudioPicker assets={generatedAudioAssets} selectedPath="" onSelect={addApplioBatchAsset} />
            </section>

            <form className="panel voice-changer-panel" onSubmit={handleVoiceChangerBatchSubmit}>
              <div className="section-heading">
                <span className="step-badge">2</span>
                <div>
                  <h2>같은 목소리로 일괄 변환</h2>
                  <p>목소리 모델과 변환 설정은 단일 변환과 동일하게 적용됩니다.</p>
                </div>
              </div>
              <div className="selected-source-card">
                <span className="meta-label">선택된 오디오</span>
                <strong>{applioBatchPaths.length}개</strong>
                <div className="voice-card-actions">
                  <button onClick={() => setApplioBatchPaths([])} type="button">목록 비우기</button>
                </div>
                <div className="audio-asset-list">
                  {selectedApplioBatchAssets.map((asset) => (
                    <article className="audio-asset-card is-selected" key={asset.path}>
                      <div className="audio-asset-card__header">
                        <div>
                          <strong>{asset.filename}</strong>
                          <span>{asset.source === "generated" ? "생성 갤러리" : "업로드"}</span>
                        </div>
                        <button className="secondary-button" onClick={() => setApplioBatchPaths((prev) => prev.filter((path) => path !== asset.path))} type="button">
                          제거
                        </button>
                      </div>
                      <audio controls className="audio-card__player" src={mediaUrl(asset.url)} />
                    </article>
                  ))}
                  {selectedApplioBatchExternalPaths.map((path) => (
                    <article className="audio-asset-card is-selected" key={path}>
                      <div className="audio-asset-card__header">
                        <div>
                          <strong>{basenameFromPath(path)}</strong>
                          <span>직접 경로</span>
                        </div>
                        <button className="secondary-button" onClick={() => setApplioBatchPaths((prev) => prev.filter((item) => item !== path))} type="button">
                          제거
                        </button>
                      </div>
                      {path.startsWith("data/") ? (
                        <audio controls className="audio-card__player" src={fileUrlFromPath(path)} />
                      ) : (
                        <span className="field-hint">외부 경로는 변환 실행 시 백엔드가 직접 읽습니다.</span>
                      )}
                    </article>
                  ))}
                </div>
              </div>
              <label>
                바꿀 목소리
                <select value={voiceChangerForm.selected_model_id} onChange={(event) => handleSelectVoiceChangerModel(event.target.value)}>
                  <option value="">목소리 선택</option>
                  {voiceChangerModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-row">
                <label>
                  음정 추적 방식
                  <select value={voiceChangerForm.f0_method} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: event.target.value })}>
                    <option value="rmvpe">RMVPE - 기본 권장</option>
                    <option value="fcpe">FCPE - 빠른 처리</option>
                    <option value="crepe">CREPE - 선율 민감</option>
                  </select>
                </label>
                <label>
                  음색 반영 강도
                  <input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                </label>
                <label>
                  발음 보존
                  <input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                </label>
              </div>
              <details className="advanced-controls voice-changer-advanced">
                <summary>Advanced controls</summary>
                <div className="field-row">
                  <label>
                    RVC model path
                    <input value={voiceChangerForm.model_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, model_path: event.target.value })} />
                  </label>
                  <label>
                    Index path
                    <input value={voiceChangerForm.index_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_path: event.target.value })} />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Pitch shift
                    <input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                  </label>
                  <label>
                    Clean strength
                    <input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                  </label>
                  <label>
                    Content embedder
                    <select value={voiceChangerForm.embedder_model} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, embedder_model: event.target.value })}>
                      <option value="contentvec">contentvec</option>
                      <option value="hubert">hubert</option>
                    </select>
                  </label>
                </div>
              </details>
              <button className="primary-button" disabled={loading || !voiceChangerAvailable || !applioBatchPaths.length || !voiceChangerForm.model_path} type="submit">
                {applioBatchPaths.length}개 변환
              </button>
            </form>
          </div>

          {lastAudioToolResult?.kind === "voice_changer_batch" ? (
            <section className="panel">
              <h2>배치 변환 결과</h2>
              <div className="audio-grid">
                {lastAudioToolResult.assets.map((asset) => (
                  <article className="audio-asset-card" key={asset.path}>
                    <strong>{asset.filename}</strong>
                    <audio controls src={mediaUrl(asset.url)} />
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "applio_blend" ? (
        <section className="workspace workspace--stacked">
          <form className="panel voice-changer-panel" onSubmit={handleVoiceModelBlendSubmit}>
            <div className="section-heading">
              <span className="step-badge">1</span>
              <div>
                <h2>두 RVC 모델을 섞어 새 목소리 만들기</h2>
                <p>Applio Voice Blender처럼 모델 A와 모델 B의 가중치를 비율로 합쳐 새로운 `.pth` 모델을 만듭니다.</p>
              </div>
            </div>
            <label>
              새 모델 이름
              <input value={applioBlendForm.model_name} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, model_name: event.target.value })} />
            </label>
            <div className="field-row">
              <label>
                모델 A
                <select value={applioBlendForm.model_path_a} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, model_path_a: event.target.value })}>
                  <option value="">모델 선택</option>
                  {voiceChangerModels.map((model) => (
                    <option key={model.model_path} value={model.model_path}>{model.label}</option>
                  ))}
                </select>
              </label>
              <label>
                모델 B
                <select value={applioBlendForm.model_path_b} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, model_path_b: event.target.value })}>
                  <option value="">모델 선택</option>
                  {voiceChangerModels.map((model) => (
                    <option key={model.model_path} value={model.model_path}>{model.label}</option>
                  ))}
                </select>
              </label>
              <label>
                A 반영 비율
                <input value={applioBlendForm.ratio} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, ratio: event.target.value })} />
              </label>
            </div>
            <div className="voice-model-summary">
              <span className="voice-model-summary__avatar" aria-hidden="true" />
              <div>
                <span className="meta-label">블렌딩 미리보기</span>
                <strong>{selectedBlendModelA?.label || "모델 A"} + {selectedBlendModelB?.label || "모델 B"}</strong>
                <p>비율 {applioBlendForm.ratio || "0.5"}는 모델 A 쪽 성향을 얼마나 강하게 둘지 결정합니다.</p>
              </div>
            </div>
            {lastRvcTrainingResult ? <p className="field-hint">{lastRvcTrainingResult}</p> : null}
            <button className="primary-button" disabled={loading || !applioBlendForm.model_name || !applioBlendForm.model_path_a || !applioBlendForm.model_path_b} type="submit">
              모델 블렌딩
            </button>
          </form>
        </section>
      ) : null}

      {activeTab === "audio_editor" ? (
        <section className="workspace workspace--stacked audio-editor-workspace">
          <section className="audio-editor-console">
            <div className="audio-editor-console__header">
              <div>
                <span className="eyebrow">AUDIO EDITOR</span>
                <h2>구간을 고르고 바로 편집하기</h2>
                <p>생성 갤러리, 업로드 파일, 직접 경로 중 하나를 골라 자르기, 페이드, 볼륨, 정규화를 적용합니다.</p>
              </div>
              <div className="audio-editor-source-tabs" role="tablist" aria-label="오디오 소스">
                {(["gallery", "upload", "path"] as const).map((source) => (
                  <button
                    className={audioEditorSource === source ? "mini-tab is-active" : "mini-tab"}
                    key={source}
                    onClick={() => setAudioEditorSource(source)}
                    type="button"
                  >
                    {source === "gallery" ? "생성 갤러리" : source === "upload" ? "파일 업로드" : "경로 입력"}
                  </button>
                ))}
              </div>
            </div>

            <div className="audio-editor-console__body">
              <section className="audio-editor-source-panel">
                {audioEditorSource === "gallery" ? (
                  <>
                    <h3>편집할 음성 선택</h3>
                    <ServerAudioPicker assets={audioAssets} selectedPath={audioEditorForm.audio_path} onSelect={(asset) => {
                      setAudioToolUpload(null);
                      setAudioEditorForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || basenameFromPath(asset.filename) }));
                      setAudioEditorDuration(0);
                    }} />
                  </>
                ) : null}

                {audioEditorSource === "upload" ? (
                  <label className="upload-field upload-field--editor">
                    <strong>새 오디오 파일 불러오기</strong>
                    <span>WAV, FLAC, MP3 등 브라우저가 선택할 수 있는 오디오를 업로드합니다.</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleAudioToolUpload(file);
                          setAudioEditorSource("upload");
                          setAudioEditorDuration(0);
                        }
                      }}
                    />
                  </label>
                ) : null}

                {audioEditorSource === "path" ? (
                  <label className="editor-path-field">
                    서버 오디오 경로
                    <input
                      placeholder="data/generated/.../voice.wav"
                      value={audioEditorForm.audio_path}
                      onChange={(event) => {
                        setAudioEditorForm((prev) => ({ ...prev, audio_path: event.target.value }));
                        setAudioEditorDuration(0);
                      }}
                    />
                  </label>
                ) : null}
              </section>

              <form className="audio-editor-stage" onSubmit={handleAudioEditSubmit}>
                <div className="audio-editor-stage__top">
                  <div>
                    <span className="meta-label">SELECTED TAKE</span>
                    <h3>{selectedAudioEditorAsset?.filename || audioToolUpload?.filename || basenameFromPath(audioEditorForm.audio_path) || "아직 선택된 오디오 없음"}</h3>
                  </div>
                  <label>
                    저장 이름
                    <input value={audioEditorForm.output_name} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, output_name: event.target.value })} />
                  </label>
                </div>

                {audioEditorForm.audio_path ? (
                  <audio
                    className="audio-editor-player"
                    controls
                    onLoadedMetadata={(event) => setAudioEditorDuration(event.currentTarget.duration || 0)}
                    src={selectedAudioEditorAsset ? mediaUrl(selectedAudioEditorAsset.url) : mediaUrl(fileUrlFromPath(audioEditorForm.audio_path))}
                  />
                ) : null}

                <div className="audio-editor-waveform" aria-label="편집 구간">
                  <div className="audio-editor-region" style={{ left: audioEditorRegionLeft, width: audioEditorRegionWidth }} />
                  {audioEditorBars.map((height, index) => (
                    <span key={`${audioEditorForm.audio_path}-${index}`} style={{ height }} />
                  ))}
                </div>

                <div className="audio-editor-range-pair">
                  <label>
                    Start
                    <input
                      max={audioEditorDurationLimit}
                      min="0"
                      step="0.01"
                      type="range"
                      value={audioEditorStart}
                      onChange={(event) => setAudioEditorForm((prev) => ({ ...prev, start_sec: event.target.value }))}
                    />
                    <input value={audioEditorForm.start_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, start_sec: event.target.value })} />
                  </label>
                  <label>
                    End
                    <input
                      max={audioEditorDurationLimit}
                      min="0"
                      step="0.01"
                      type="range"
                      value={audioEditorEnd}
                      onChange={(event) => setAudioEditorForm((prev) => ({ ...prev, end_sec: event.target.value }))}
                    />
                    <input placeholder="끝까지" value={audioEditorForm.end_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, end_sec: event.target.value })} />
                  </label>
                </div>

                <div className="audio-editor-rack">
                  <label>
                    Gain dB
                    <input min="-24" max="18" step="0.5" type="range" value={audioEditorForm.gain_db} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, gain_db: event.target.value })} />
                    <input value={audioEditorForm.gain_db} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, gain_db: event.target.value })} />
                  </label>
                  <label>
                    Fade in
                    <input value={audioEditorForm.fade_in_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, fade_in_sec: event.target.value })} />
                  </label>
                  <label>
                    Fade out
                    <input value={audioEditorForm.fade_out_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, fade_out_sec: event.target.value })} />
                  </label>
                  <label>
                    Sample rate
                    <select value={audioEditorForm.sample_rate} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, sample_rate: event.target.value })}>
                      <option value="24000">24 kHz</option>
                      <option value="44100">44.1 kHz</option>
                      <option value="48000">48 kHz</option>
                    </select>
                  </label>
                  <label>
                    Format
                    <select value={audioEditorForm.output_format} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, output_format: event.target.value })}>
                      <option value="wav">WAV</option>
                      <option value="flac">FLAC</option>
                      <option value="ogg">OGG</option>
                    </select>
                  </label>
                  <label className="checkbox-line">
                    <input checked={audioEditorForm.normalize} type="checkbox" onChange={(event) => setAudioEditorForm({ ...audioEditorForm, normalize: event.target.checked })} />
                    Normalize peak
                  </label>
                  <label className="checkbox-line">
                    <input checked={audioEditorForm.reverse} type="checkbox" onChange={(event) => setAudioEditorForm({ ...audioEditorForm, reverse: event.target.checked })} />
                    Reverse
                  </label>
                </div>

                <button className="primary-button" disabled={loading || !audioEditorForm.audio_path} type="submit">
                  편집본 저장
                </button>
              </form>
            </div>
          </section>

          {lastAudioToolResult?.kind === "audio_editor" && lastAudioToolResult.record ? (
            <AudioCard title="편집 결과" subtitle="생성 갤러리에 저장됨" record={lastAudioToolResult.record} />
          ) : null}
        </section>
      ) : null}

      {activeTab === "audio_denoise" ? (
        <section className="workspace workspace--stacked audio-editor-workspace">
          <section className="audio-editor-console audio-denoise-console">
            <div className="audio-editor-console__header">
              <div>
                <span className="eyebrow">VOICE CLEANUP</span>
                <h2>노이즈를 줄이고 목소리만 또렷하게</h2>
                <p>생성 갤러리, 업로드 파일, 서버 경로에서 음성을 가져와 배경 노이즈와 불필요한 대역을 정리합니다.</p>
              </div>
              <div className="audio-editor-source-tabs" role="tablist" aria-label="음성 정제 소스">
                {(["gallery", "upload", "path"] as const).map((source) => (
                  <button
                    className={audioDenoiseSource === source ? "mini-tab is-active" : "mini-tab"}
                    key={source}
                    onClick={() => setAudioDenoiseSource(source)}
                    type="button"
                  >
                    {source === "gallery" ? "생성 갤러리" : source === "upload" ? "파일 업로드" : "경로 입력"}
                  </button>
                ))}
              </div>
            </div>

            <div className="audio-editor-console__body">
              <section className="audio-editor-source-panel">
                {audioDenoiseSource === "gallery" ? (
                  <>
                    <h3>정제할 음성 선택</h3>
                    <ServerAudioPicker assets={audioAssets} selectedPath={audioDenoiseForm.audio_path} onSelect={(asset) => {
                      setAudioToolUpload(null);
                      setAudioDenoiseForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || `clean-${basenameFromPath(asset.filename)}` }));
                    }} />
                  </>
                ) : null}

                {audioDenoiseSource === "upload" ? (
                  <label className="upload-field upload-field--editor">
                    <strong>새 오디오 파일 불러오기</strong>
                    <span>노이즈를 줄일 원본 음성을 업로드합니다. 결과는 생성 갤러리에 저장됩니다.</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleAudioToolUpload(file);
                          setAudioDenoiseSource("upload");
                        }
                      }}
                    />
                  </label>
                ) : null}

                {audioDenoiseSource === "path" ? (
                  <label className="editor-path-field">
                    서버 오디오 경로
                    <input
                      placeholder="data/generated/.../voice.wav"
                      value={audioDenoiseForm.audio_path}
                      onChange={(event) => setAudioDenoiseForm((prev) => ({ ...prev, audio_path: event.target.value }))}
                    />
                  </label>
                ) : null}
              </section>

              <form className="audio-editor-stage audio-denoise-stage" onSubmit={handleAudioDenoiseSubmit}>
                <div className="audio-editor-stage__top">
                  <div>
                    <span className="meta-label">SOURCE VOICE</span>
                    <h3>{selectedAudioDenoiseAsset?.filename || audioToolUpload?.filename || basenameFromPath(audioDenoiseForm.audio_path) || "아직 선택된 오디오 없음"}</h3>
                  </div>
                  <label>
                    저장 이름
                    <input value={audioDenoiseForm.output_name} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, output_name: event.target.value })} />
                  </label>
                </div>

                {audioDenoiseForm.audio_path ? (
                  <audio
                    className="audio-editor-player"
                    controls
                    src={selectedAudioDenoiseAsset ? mediaUrl(selectedAudioDenoiseAsset.url) : mediaUrl(fileUrlFromPath(audioDenoiseForm.audio_path))}
                  />
                ) : null}

                <div className="audio-editor-waveform audio-denoise-waveform" aria-label="정제 강도 미리보기">
                  {audioDenoiseBars.map((height, index) => (
                    <span key={`${audioDenoiseForm.audio_path}-${index}`} style={{ height }} />
                  ))}
                </div>

                <div className="audio-editor-rack audio-denoise-rack">
                  <label>
                    Noise reduction
                    <input min="0" max="1" step="0.01" type="range" value={audioDenoiseForm.strength} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, strength: event.target.value })} />
                    <input value={audioDenoiseForm.strength} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, strength: event.target.value })} />
                  </label>
                  <label>
                    Voice preserve
                    <input min="0" max="1" step="0.01" type="range" value={audioDenoiseForm.voice_presence} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, voice_presence: event.target.value })} />
                    <input value={audioDenoiseForm.voice_presence} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, voice_presence: event.target.value })} />
                  </label>
                  <label>
                    Noise profile sec
                    <input value={audioDenoiseForm.noise_profile_sec} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, noise_profile_sec: event.target.value })} />
                  </label>
                  <label>
                    High-pass Hz
                    <input value={audioDenoiseForm.highpass_hz} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, highpass_hz: event.target.value })} />
                  </label>
                  <label>
                    Low-pass Hz
                    <input value={audioDenoiseForm.lowpass_hz} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, lowpass_hz: event.target.value })} />
                  </label>
                  <label>
                    Spectral floor
                    <input value={audioDenoiseForm.spectral_floor} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, spectral_floor: event.target.value })} />
                  </label>
                  <label>
                    Sample rate
                    <select value={audioDenoiseForm.sample_rate} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, sample_rate: event.target.value })}>
                      <option value="24000">24 kHz</option>
                      <option value="44100">44.1 kHz</option>
                      <option value="48000">48 kHz</option>
                    </select>
                  </label>
                  <label>
                    Format
                    <select value={audioDenoiseForm.output_format} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, output_format: event.target.value })}>
                      <option value="wav">WAV</option>
                      <option value="flac">FLAC</option>
                      <option value="ogg">OGG</option>
                    </select>
                  </label>
                  <label className="checkbox-line">
                    <input checked={audioDenoiseForm.normalize} type="checkbox" onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, normalize: event.target.checked })} />
                    Normalize peak
                  </label>
                </div>

                <button className="primary-button" disabled={loading || !audioDenoiseForm.audio_path} type="submit">
                  정제본 저장
                </button>
              </form>
            </div>
          </section>

          {lastAudioToolResult?.kind === "audio_denoise" && lastAudioToolResult.record ? (
            <AudioCard title="정제 결과" subtitle="생성 갤러리에 저장됨" record={lastAudioToolResult.record} />
          ) : null}
        </section>
      ) : null}

      {activeTab === "separation" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <section className="panel">
              <h2>분리할 오디오 선택</h2>
              <p className="field-hint">파일을 업로드하거나 서버에 저장된 오디오를 골라 분리합니다.</p>
              <label className="upload-field">
                새 파일 업로드
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleAudioToolUpload(file);
                    }
                  }}
                />
              </label>
              {audioToolUpload ? (
                <div className="source-summary">
                  <span className="meta-label">업로드한 파일</span>
                  <strong>{audioToolUpload.filename}</strong>
                </div>
              ) : null}
              <ServerAudioPicker assets={audioAssets} selectedPath={audioSeparationForm.audio_path} onSelect={handleSelectAudioToolAsset} />
            </section>

            <form className="panel" onSubmit={(event) => {
              event.preventDefault();
              void handleAudioSeparation();
            }}>
              <h2>오디오 분리</h2>
              <p>AI stem separator로 보컬과 반주를 분리합니다. 안정적인 분리를 위해 10초 이상의 오디오를 사용하세요.</p>
              {!audioSeparationAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <div className="field-row">
                <label>
                  분리 모델
                  <select value={audioSeparationForm.model_profile} onChange={(event) => setAudioSeparationForm({ ...audioSeparationForm, model_profile: event.target.value })}>
                    <option value="roformer_vocals">Roformer vocals - 최신 보컬 분리</option>
                    <option value="vocal_rvc">RVC vocal preset - Applio 변환용 보컬 추출</option>
                    <option value="demucs_4stem">Demucs 4-stem - 보컬/드럼/베이스/기타</option>
                  </select>
                </label>
                <label>
                  출력 형식
                  <select value={audioSeparationForm.output_format} onChange={(event) => setAudioSeparationForm({ ...audioSeparationForm, output_format: event.target.value })}>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                    <option value="ogg">OGG</option>
                  </select>
                </label>
              </div>
              <article className="status-card">
                <strong>현재 기본 모델</strong>
                <p>audio-separator 0.44.1 모델 목록에서 보컬 분리 상위로 확인한 `vocals_mel_band_roformer.ckpt`를 기본으로 사용합니다. 모델 파일은 최초 실행 시 자동으로 내려받습니다.</p>
              </article>
              <button className="primary-button" disabled={loading || !audioSeparationForm.audio_path || !audioSeparationAvailable} type="submit">
                분리 실행
              </button>
            </form>
          </div>

          {lastAudioToolResult?.kind === "audio_separation" && lastAudioToolResult.assets?.length ? (
            <section className="panel">
              <h2>방금 분리한 결과</h2>
              <div className="preset-list">
                {lastAudioToolResult.assets.map((asset) => (
                  <article className="preset-card" key={`${asset.path}-${asset.label}`}>
                    <strong>{asset.label}</strong>
                    <audio controls className="audio-card__player" src={mediaUrl(asset.url)} />
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "dataset" ? (
        <section className="workspace workspace--stacked">
          <section className="panel finetune-flow">
            <div className="finetune-stage__header">
              <div>
                <span className="eyebrow eyebrow--soft">데이터셋 만들기</span>
                <h2>학습용 데이터셋 준비</h2>
              </div>
              <p>이 탭에서는 데이터셋만 만듭니다. 만들기가 끝나면 자동으로 학습 가능한 상태까지 준비하고, 학습은 다음 탭에서 시작합니다.</p>
            </div>
            <article className="status-card">
              <strong>권장 샘플 수</strong>
              <p>최소 20개 이상, 가능하면 50개 이상을 권장합니다. 문장 길이와 억양이 다양할수록 결과가 안정적입니다.</p>
            </article>
            <div className="field-row">
              <label>
                데이터셋 이름
                <input value={datasetForm.name} onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })} />
              </label>
              <label>
                화자 이름
                <input value={datasetForm.speaker_name} onChange={(event) => setDatasetForm({ ...datasetForm, speaker_name: event.target.value })} />
              </label>
            </div>

            <div className="mini-tab-strip" role="tablist" aria-label="Dataset input source">
              <button className={datasetInputMode === "gallery" ? "mini-tab is-active" : "mini-tab"} onClick={() => setDatasetInputMode("gallery")} type="button">
                생성 갤러리에서 선택
              </button>
              <button className={datasetInputMode === "paths" ? "mini-tab is-active" : "mini-tab"} onClick={() => setDatasetInputMode("paths")} type="button">
                경로로 불러오기
              </button>
            </div>

            {datasetInputMode === "gallery" ? (
              <div className="dataset-source-grid">
                <section className="status-card">
                  <strong>기준 음성</strong>
                  <p>학습 결과를 대표할 기준 음성을 하나 고릅니다.</p>
                  <ServerAudioPicker assets={generatedAudioAssets} selectedPath={datasetForm.ref_audio_path} onSelect={handleSelectDatasetReferenceAsset} />
                  {selectedDatasetReferenceAsset ? (
                    <article className="selected-audio-card">
                      <span className="meta-label">선택한 기준 음성</span>
                      <strong>{selectedDatasetReferenceAsset.filename}</strong>
                      <audio controls className="audio-card__player" src={mediaUrl(selectedDatasetReferenceAsset.url)} />
                    </article>
                  ) : null}
                </section>
                <section className="status-card">
                  <strong>샘플 음성</strong>
                  <p>학습에 넣을 생성 음성을 계속 추가합니다.</p>
                  <ServerAudioPicker assets={generatedAudioAssets} selectedPath="" onSelect={handleAddGeneratedAssetToDataset} />
                  <div className="selected-sample-list">
                    {selectedDatasetSampleAssets.length ? selectedDatasetSampleAssets.map(({ sample, index, asset }) => (
                      <article className="selected-sample-row" key={`${sample.audio_path}-${index}`}>
                        <div>
                          <strong>{asset?.filename || basenameFromPath(sample.audio_path)}</strong>
                          <span>{sample.text?.trim() || asset?.text_preview || "자동 전사 예정"}</span>
                        </div>
                        {asset ? <audio controls className="selected-sample-row__player" src={mediaUrl(asset.url)} /> : null}
                        <button className="ghost-button" onClick={() => removeSampleRow(index)} type="button">
                          삭제
                        </button>
                      </article>
                    )) : <p className="field-hint">아직 선택한 샘플이 없습니다.</p>}
                  </div>
                </section>
              </div>
            ) : (
              <>
                <label>
                  기준 음성 경로
                  <input
                    placeholder="예: D:/my_tts_dataset/mai/ref/ref.wav"
                    value={datasetForm.ref_audio_path}
                    onChange={(event) => setDatasetForm({ ...datasetForm, ref_audio_path: normalizeDatasetPath(event.target.value) })}
                  />
                </label>
                <label>
                  샘플 폴더 경로
                  <input
                    placeholder="예: D:/tts_data/mai_ko/wavs"
                    value={datasetSampleFolderPath}
                    onChange={(event) => setDatasetSampleFolderPath(normalizeDatasetPath(event.target.value))}
                  />
                </label>
                <details className="advanced-inline">
                  <summary>직접 샘플 목록 붙여넣기</summary>
                  <label>
                    샘플 경로 일괄 입력
                    <textarea
                      className="bulk-path-textarea"
                      placeholder={"D:/my_tts_dataset/mai/wavs/0001.wav | 첫 번째 문장\nD:/my_tts_dataset/mai/wavs/0002.wav"}
                      value={datasetBulkInput}
                      onChange={(event) => setDatasetBulkInput(event.target.value)}
                    />
                  </label>
                </details>
                <div className="button-row">
                  <button className="secondary-button" onClick={applyBulkDatasetPaths} type="button">
                    직접 목록 반영
                  </button>
                  <button className="secondary-button" onClick={handleTranscribeAllDatasetSamples} type="button">
                    비어 있는 텍스트 자동 채우기
                  </button>
                </div>
              </>
            )}
            {datasetInputMode === "paths" && datasetSamples.some((sample) => sample.audio_path.trim()) ? (
            <div className="selected-sample-list">
              {datasetSamples.map((sample, index) => (
                sample.audio_path.trim() ? (
                <article className="selected-sample-row" key={`sample-${index}`}>
                  <div>
                    <strong>{basenameFromPath(sample.audio_path)}</strong>
                    <span>{sample.text?.trim() || "자동 전사 예정"}</span>
                  </div>
                  <button className="secondary-button" onClick={() => void handleTranscribeDatasetSample(index)} type="button">
                    자동 전사
                  </button>
                  <button className="ghost-button" onClick={() => removeSampleRow(index)} type="button">
                    삭제
                  </button>
                </article>
                ) : null
              ))}
            </div>
            ) : null}
            <div className="button-row">
              <button className="primary-button" onClick={() => void handleCreateDataset()} type="button">
                데이터셋 저장
              </button>
            </div>
            {lastCreatedDataset ? (
              <article className="status-card status-card--ready">
                <strong>{lastCreatedDataset.name}</strong>
                <p>{lastCreatedDataset.sample_count}개 샘플 · 학습 가능</p>
                <div className="button-row">
                  <button className="secondary-button" onClick={() => { setSelectedDatasetId(lastCreatedDataset.id); setActiveTab("training"); }} type="button">
                    학습 실행으로 이동
                  </button>
                </div>
              </article>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "training" ? (
        <section className="workspace workspace--stacked">
          <section className="panel">
            <h2>학습 실행</h2>
            <p className="field-hint">학습할 데이터셋을 고르고, 모델과 화자 이름을 확인한 뒤 바로 시작합니다.</p>
            <label>
              사용할 데이터셋
              <select value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)}>
                <option value="">선택하세요</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedDataset ? (
              <article className="selected-audio-card">
                <span className="meta-label">선택한 데이터셋</span>
                <strong>{selectedDataset.name}</strong>
                <p>{selectedDataset.sample_count}개 샘플 · {datasetReadyForTraining ? "학습 가능" : "학습 전 준비 필요"}</p>
              </article>
            ) : null}
            {selectedDataset && !datasetReadyForTraining ? (
              <article className="status-card">
                <strong>학습 준비가 끝나지 않았습니다</strong>
                <p>데이터셋 탭에서 다시 저장하면 학습용 준비까지 함께 진행됩니다.</p>
              </article>
            ) : null}
            <details className="advanced-inline" open>
              <summary>학습 설정</summary>
              <div className="field-row">
                <label>
                  학습 방식
                  <select value={runForm.training_mode} onChange={(event) => setRunForm({ ...runForm, training_mode: event.target.value as FineTuneMode })}>
                    <option value="base">Base</option>
                    <option value="custom_voice">CustomVoice</option>
                    <option value="voicebox">VoiceBox</option>
                  </select>
                </label>
                <label>
                  초기 모델
                  <select value={runForm.init_model_path} onChange={(event) => setRunForm({ ...runForm, init_model_path: event.target.value })}>
                    {trainingModelOptions.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  화자 이름
                  <input value={runForm.speaker_name} onChange={(event) => setRunForm({ ...runForm, speaker_name: event.target.value })} />
                </label>
                <label>
                  모델 이름
                  <input
                    placeholder="예: mai-korean-narrator"
                    value={runForm.output_name}
                    onChange={(event) => setRunForm({ ...runForm, output_name: event.target.value })}
                  />
                </label>
              </div>
              {runForm.training_mode === "custom_voice" ? (
                <label>
                  목소리 기준 모델
                  <select value={runForm.speaker_encoder_model_path} onChange={(event) => setRunForm({ ...runForm, speaker_encoder_model_path: event.target.value })}>
                    {baseModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <details className="advanced-inline">
                <summary>고급 학습 설정</summary>
                <div className="field-row">
                  <label>
                    토크나이저
                    <select value={runForm.tokenizer_model_path} onChange={(event) => setRunForm({ ...runForm, tokenizer_model_path: event.target.value })}>
                      {tokenizerModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {displayModelName(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    배치 크기
                    <input type="number" value={runForm.batch_size} onChange={(event) => setRunForm({ ...runForm, batch_size: Number(event.target.value) })} />
                  </label>
                  <label>
                    epoch
                    <input type="number" value={runForm.num_epochs} onChange={(event) => setRunForm({ ...runForm, num_epochs: Number(event.target.value) })} />
                  </label>
                  <label>
                    학습률
                    <input type="number" step="0.000001" value={runForm.lr} onChange={(event) => setRunForm({ ...runForm, lr: Number(event.target.value) })} />
                  </label>
                </div>
              </details>
            </details>
            <button className="primary-button" disabled={!datasetReadyForTraining} onClick={handleCreateRun} type="button">
              학습 시작
            </button>
          </section>

          <section className="panel">
            <h3>학습 실행 기록</h3>
            <div className="dataset-list">
              {runs.map((run) => (
                <article className="dataset-card" key={run.id}>
                  <strong>{run.output_model_path.split("/").pop() || run.output_model_path}</strong>
                  <span>{run.status}</span>
                  <span>{run.speaker_name}</span>
                  <span>{formatDate(run.created_at)}</span>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "voicebox_fusion" ? (
        <section className="workspace workspace--stacked">
          <form className="panel" onSubmit={handleCreateVoiceBoxFusion}>
            <h2>VoiceBox 융합</h2>
            <div className="panel-grid">
              {VOICEBOX_STEPS.map((step, index) => (
                <article className="status-card" key={step.title}>
                  <strong>{index + 1}. {step.title}</strong>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
            <label>
              CustomVoice 모델
              <select value={voiceBoxFusionForm.input_checkpoint_path} onChange={(event) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, input_checkpoint_path: event.target.value })}>
                <option value="">선택하세요</option>
                {plainCustomVoiceModels.map((model) => (
                  <option key={model.key} value={model.model_id}>
                    {displayModelName(model)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Base encoder 모델
              <select value={voiceBoxFusionForm.speaker_encoder_source_path} onChange={(event) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, speaker_encoder_source_path: event.target.value })}>
                <option value="">선택하세요</option>
                {baseModels.map((model) => (
                  <option key={model.key} value={model.model_id}>
                    {displayModelName(model)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              모델명
              <input value={voiceBoxFusionForm.output_name} onChange={(event) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, output_name: event.target.value })} />
            </label>
            <button className="primary-button" type="submit">
              VoiceBox 만들기
            </button>
          </form>

          <section className="panel">
            <h3>사용 가능한 모델</h3>
            <div className="preset-list">
              {voiceBoxModels.map((model) => (
                <article className="preset-card" key={model.key}>
                  <strong>{displayModelName(model)}</strong>
                  <button className="secondary-button" onClick={() => { setVoiceBoxCloneForm((prev) => ({ ...prev, model_id: model.model_id, speaker: model.default_speaker || prev.speaker })); setCloneEngine("voicebox"); setActiveTab("clone"); }} type="button">
                    복제에서 사용
                  </button>
                </article>
              ))}
              {!voiceBoxModels.length ? (
                <p className="field-hint">아직 사용할 수 있는 VoiceBox 모델이 없습니다.</p>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "guide" ? (
        <section className="workspace workspace--stacked">
          <section className="guide-hero">
            <div>
              <span className="eyebrow eyebrow--soft">사용 가이드</span>
              <h2>작업별로 무엇을 어디서 하는지 정리했습니다</h2>
              <p>Qwen 생성, Qwen 학습, VoiceBox, S2-Pro, 오디오 도구를 처음 쓰는 사람도 순서대로 따라갈 수 있게 묶었습니다.</p>
            </div>
          </section>
          <section className="guide-doc-shell">
            <nav className="guide-doc-nav" aria-label="Guide documents">
              {GUIDE_SECTIONS.map((section) => (
                <button
                  className={selectedGuideSection.title === section.title ? "guide-doc-link is-active" : "guide-doc-link"}
                  key={section.title}
                  onClick={() => setActiveGuideTitle(section.title)}
                  type="button"
                >
                  {section.title}
                </button>
              ))}
            </nav>
            <article className="guide-doc-page">
              <span className="eyebrow eyebrow--soft">Guide</span>
              <h3>{selectedGuideSection.title}</h3>
              <p>{selectedGuideSection.summary}</p>
              <ol>
                {selectedGuideSection.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          </section>
        </section>
      ) : null}

        </main>
      </div>
    </div>
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <StudioApp />
      </ThemeProvider>
    </I18nProvider>
  );
}
