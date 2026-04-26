"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

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
  MiniWaveform,
  normalizeDatasetPath,
  PageHeader,
  parseDatasetSampleBulkInput,
  PRODUCT_PAGES,
  RecipeBar,
  serializeGenerationControls,
  ServerAudioPicker,
  S2_PRO_FEATURES,
  S2_PRO_TAG_CATEGORIES,
  S2ProMode,
  SOUND_EFFECT_LIBRARY,
  SpotlightCard,
  TabKey,
  VOICEBOX_ACTIONS,
  VOICEBOX_STEPS,
} from "./lib/app-ui";
import type {
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

function trainedVoiceTitle(model: ModelInfo): string {
  return displayModelName(model);
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

function gallerySelectionKey(record: GenerationRecord): string {
  return `${record.id}::${record.output_audio_path}`;
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [activeGuideTitle, setActiveGuideTitle] = useState<string>(GUIDE_SECTIONS[0]?.title || "");
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(true);
  const [ttsSideView, setTtsSideView] = useState<"settings" | "history">("settings");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<string[]>([]);
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
    output_name: "s2pro-tagged-voice",
    text: "[breath] 오늘은 조금 천천히 말해볼게. [super happy] 그래도 결국 해냈어!",
    language: "Korean",
    reference_audio_path: "",
    reference_text: "",
    speaker_script:
      "<|speaker:0|> [calm] 오늘 회의는 여기서 정리하겠습니다.\n<|speaker:1|> [excited] 좋아요, 다음 단계로 바로 넘어가죠.",
    clone_text: "[whispers] 이 목소리로 아주 가까이서 말하는 느낌을 확인해볼게.",
    instruction: "[professional broadcast tone] Keep articulation clean and stable.",
    temperature: "0.7",
    top_p: "0.8",
    max_tokens: "2048",
  });
  const [s2ProVoiceForm, setS2ProVoiceForm] = useState({
    name: "my-s2pro-voice",
    reference_audio_path: "",
    reference_text: "",
    language: "Korean",
    notes: "",
    create_qwen_prompt: true,
  });
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
  const [voiceChangerWorkflow, setVoiceChangerWorkflow] = useState<"train" | "convert">("convert");
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
  const finetunedModels = latestFineTunedModels;
  const audioToolCapabilityMap = new Map(audioToolCapabilities.map((capability) => [capability.key, capability]));
  const audioAssetByPath = new Map(audioAssets.map((asset) => [asset.path, asset]));
  const assetTextByPath = new Map(
    audioAssets.map((asset) => [asset.path, (asset.transcript_text || "").trim()]),
  );
  const soundEffectsAvailable = audioToolCapabilityMap.get("sound_effects")?.available ?? true;
  const voiceChangerAvailable = audioToolCapabilityMap.get("voice_changer")?.available ?? true;
  const audioSeparationAvailable = audioToolCapabilityMap.get("audio_separation")?.available ?? true;
  const pageMeta = PRODUCT_PAGES[activeTab];
  const selectedGuideSection = GUIDE_SECTIONS.find((section) => section.title === activeGuideTitle) ?? GUIDE_SECTIONS[0];
  const currentS2ProMode = isS2ProTab(activeTab) ? s2ProTabToMode(activeTab) : s2ProMode;
  const selectedS2Voice = s2ProVoices.find((voice) => voice.id === selectedS2VoiceId || voice.reference_id === selectedS2VoiceId) ?? null;
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

  function applyS2ProTag(prompt: string) {
    setS2ProForm((prev) => ({
      ...prev,
      text: prev.text.trim() ? `${prev.text.trim()} ${prompt}` : prompt,
    }));
  }

  function applyTtsTag(tag: string) {
    setInferenceForm((prev) => ({
      ...prev,
      text: prev.text.trim() ? `${prev.text.trim()} ${tag}` : tag,
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
      name: prev.name === "my-s2pro-voice" ? basenameFromPath(asset.path).replace(/\.[^.]+$/, "") : prev.name,
    }));
    setMessage(`${asset.filename}을 S2-Pro 참조 음성으로 선택했습니다.`);
  }

  function useS2VoiceInQwen(voice: S2ProVoiceRecord, target: "tts" | "clone") {
    if (target === "clone") {
      setUploadedRef({
        id: voice.id,
        filename: basenameFromPath(voice.reference_audio_path),
        path: voice.reference_audio_path,
        url: voice.reference_audio_url,
      });
      setUploadRefText(voice.reference_text);
      setActiveTab("clone");
    } else {
      setInferenceForm((prev) => ({
        ...prev,
        ref_audio_path: voice.reference_audio_path,
        ref_text: voice.reference_text,
        output_name: voice.name,
      }));
      setActiveTab("tts");
    }
    setMessage(`${voice.name}을 Qwen 작업에 연결했습니다.`);
  }

  function handleCreateS2ProVoice(event?: FormEvent) {
    event?.preventDefault();
    runAction(async () => {
      const voice = await api.createS2ProVoice({
        name: s2ProVoiceForm.name,
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

  function handleS2ProSubmit(event: FormEvent) {
    event.preventDefault();
    const textByMode =
      currentS2ProMode === "clone"
        ? s2ProForm.clone_text
        : currentS2ProMode === "multi_speaker"
          ? s2ProForm.speaker_script
          : s2ProForm.text;
    runAction(async () => {
      const response = await api.generateS2Pro({
        mode: currentS2ProMode,
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
      setMessage("S2-Pro 로컬 생성이 완료되어 생성 갤러리에 저장했습니다.");
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

  async function handleSoundEffectSubmit(event: FormEvent) {
    event.preventDefault();
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

  async function handleAudioToolUpload(file: File) {
    await runAction(async () => {
      const result = await api.uploadAudio(file);
      setAudioToolUpload(result);
      setVoiceChangerForm((prev) => ({ ...prev, audio_path: result.path }));
      setAudioConvertForm((prev) => ({ ...prev, audio_path: result.path }));
      setAudioSeparationForm((prev) => ({ ...prev, audio_path: result.path }));
      setMessage(`${result.filename} 파일을 불러왔습니다.`);
    });
  }

  function handleSelectAudioToolAsset(asset: AudioAsset) {
    setAudioToolUpload(null);
    setVoiceChangerForm((prev) => ({ ...prev, audio_path: asset.path }));
    setAudioConvertForm((prev) => ({ ...prev, audio_path: asset.path }));
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

  async function handleVoiceChangerSubmit(event: FormEvent) {
    event.preventDefault();
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

  async function handleRvcTrainSubmit(event: FormEvent) {
    event.preventDefault();
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
      setVoiceChangerWorkflow("convert");
      setMessage("RVC 모델을 만들었습니다. 변환 탭에서 바로 선택할 수 있습니다.");
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

  async function handleVoiceDesignSubmit(event: FormEvent) {
    event.preventDefault();
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
      await refreshAll();
      setMessage("새 목소리 설계를 완료했습니다.");
    });
  }

  async function handleCreateCloneFromDesign() {
    const generationId = selectedDesignSampleId || lastDesignRecord?.id || "";
    if (!generationId) {
      setMessage("먼저 디자인 샘플을 선택해주세요.");
      return;
    }
    if (!selectedBaseModelId) {
      setMessage("먼저 스타일 분석 모델을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.createCloneFromSample({
        generation_id: generationId,
        model_id: selectedBaseModelId,
      });
      setSelectedClonePrompt(result);
      setPresetForm((prev) => ({ ...prev, name: prev.name || `design-${result.id}` }));
      setDatasetForm((prev) => ({
        ...prev,
        ref_audio_path: result.reference_audio_path,
      }));
      setMessage("디자인 샘플에서 목소리 스타일을 만들었습니다.");
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

    setHybridForm((prev) => ({
      ...prev,
      base_model_id: selectedHybridPreset.base_model || prev.base_model_id || preferredStockBaseModel?.model_id || "",
      custom_model_id: guessMatchingCustomVoiceModel(
        selectedHybridPreset.base_model,
        customVoiceCapableModels,
        prev.custom_model_id || preferredHybridCustomModel?.model_id || "",
      ),
      language: selectedHybridPreset.language || prev.language,
      ref_audio_path: selectedHybridPreset.reference_audio_path,
      ref_text: selectedHybridPreset.reference_text,
    }));
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

  async function handleGenerateVoiceBoxFromPreset(event: FormEvent) {
    event.preventDefault();
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

  async function handleGenerateVoiceBoxInstructFromPreset(event: FormEvent) {
    event.preventDefault();
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

  async function handleCreateVoiceBoxFusion(event: FormEvent) {
    event.preventDefault();
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

  async function handleModelInferenceSubmit(event: FormEvent) {
    event.preventDefault();
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

  async function handleHybridInferenceSubmit(event: FormEvent) {
    event.preventDefault();
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

  return (
    <div className="page-shell">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar__brand">
            <div className="sidebar__brand-row">
              <div className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <strong>Voice Studio</strong>
            </div>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">홈</span>
            <button className={activeTab === "home" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("home")} type="button">
              <span>홈</span>
            </button>
            <button className={activeTab === "voices" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("voices")} type="button">
              <span>나의 목소리들</span>
            </button>
            <button className={activeTab === "gallery" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("gallery")} type="button">
              <span>생성 갤러리</span>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">Qwen</span>
            <button className={activeTab === "design" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("design")} type="button">
              <span>목소리 설계</span>
            </button>
            <button className={activeTab === "tts" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("tts")} type="button">
              <span>텍스트 음성 변환</span>
            </button>
            <button className={activeTab === "clone" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("clone")} type="button">
              <span>목소리 복제</span>
            </button>
            <button className={activeTab === "projects" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("projects")} type="button">
              <span>프리셋 기반 생성</span>
            </button>
            <button className={activeTab === "effects" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("effects")} type="button">
              <span>사운드 효과</span>
            </button>
            <button className={activeTab === "separation" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("separation")} type="button">
              <span>오디오 분리</span>
            </button>
            <button className={activeTab === "changer" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("changer")} type="button">
              <span>보이스 체인저</span>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">S2-Pro</span>
            <button className={activeTab === "s2pro_tagged" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => openS2ProTab("s2pro_tagged")} type="button">
              <span>태그 생성</span>
            </button>
            <button className={activeTab === "s2pro_clone" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => openS2ProTab("s2pro_clone")} type="button">
              <span>목소리 복제</span>
            </button>
            <button className={activeTab === "s2pro_multi_speaker" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => openS2ProTab("s2pro_multi_speaker")} type="button">
              <span>멀티 스피커</span>
            </button>
            <button className={activeTab === "s2pro_multilingual" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => openS2ProTab("s2pro_multilingual")} type="button">
              <span>다국어 생성</span>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">Qwen 학습</span>
            <button className={activeTab === "dataset" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("dataset")} type="button">
              <span>데이터셋 만들기</span>
            </button>
            <button className={activeTab === "training" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("training")} type="button">
              <span>학습 실행</span>
            </button>
            <button className={activeTab === "voicebox_fusion" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("voicebox_fusion")} type="button">
              <span>VoiceBox 융합</span>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">도움말</span>
            <button className={activeTab === "guide" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("guide")} type="button">
              <span>가이드</span>
            </button>
          </div>
        </aside>

        <main className="page-main">
          <div className="topbar">
            <strong>{activeTab === "home" ? "홈" : pageMeta.title}</strong>
          </div>
          {activeTab === "home" ? (
            <header className="hero">
              <div className="hero__copy">
                <span className="hero__section-label">기능</span>
                <h1>오늘 필요한 작업을 바로 시작하세요</h1>
                <p>텍스트 음성 변환, 목소리 복제, 목소리 설계, 프리셋 반복 생성, 학습 작업을 사용자 흐름에 맞게 나눴습니다.</p>
              </div>
              <div className="spotlight-grid">
                <SpotlightCard
                  eyebrow="설계"
                  title="목소리 설계"
                  description="설명문만으로 새 목소리를 만든 뒤 스타일 자산으로 저장합니다."
                  actionLabel="목소리 설계"
                  onAction={() => setActiveTab("design")}
                />
                <SpotlightCard
                  eyebrow="복제"
                  title="목소리 복제"
                  description="참조 음성에서 스타일을 추출하고 저장합니다."
                  actionLabel="목소리 복제"
                  onAction={() => setActiveTab("clone")}
                />
                <SpotlightCard
                  eyebrow="생성"
                  title="텍스트 음성 변환"
                  description="기본 설정으로 바로 들어보고, 필요할 때만 고급 제어를 엽니다."
                  actionLabel="텍스트 음성 변환"
                  onAction={() => setActiveTab("tts")}
                />
                <SpotlightCard
                  eyebrow="프로젝트"
                  title="프리셋 기반 생성"
                  description="저장한 스타일을 그대로 쓰거나 말투 지시를 얹어 다시 생성합니다."
                  actionLabel="프리셋 기반 생성"
                  onAction={() => setActiveTab("projects")}
                />
              </div>
            </header>
          ) : (
            <PageHeader title={pageMeta.title} description={pageMeta.description} />
          )}

          {message ? <div className="message-banner">{message}</div> : null}
      {activeTab === "voices" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <section className="panel">
              <h2>저장된 스타일</h2>
              <p>복제나 설계에서 저장한 스타일을 다시 불러와 생성에 씁니다.</p>
              <div className="preset-list">
                {presets.length ? presets.map((preset) => (
                  <article className="preset-card" key={preset.id}>
                    <strong>{preset.name}</strong>
                    <span>{formatDate(preset.created_at)}</span>
                    <p>{preset.reference_text}</p>
                    <div className="button-row">
                      <button className="secondary-button" onClick={() => { setSelectedPresetId(preset.id); setSelectedHybridPresetId(preset.id); setActiveTab("projects"); }} type="button">
                        생성에 사용
                      </button>
                    </div>
                  </article>
                )) : <p className="field-hint">아직 저장된 스타일이 없습니다.</p>}
              </div>
            </section>

            <section className="panel">
              <h2>모델</h2>
              <p>바로 선택해서 쓸 수 있는 학습 결과만 보여줍니다.</p>
              <div className="preset-list">
                {finetunedModels.length ? finetunedModels.map((model) => (
                  <article className="voice-list-item" key={model.key}>
                    <div className="voice-list-item__mark" aria-hidden="true">
                      <MiniWaveform dense />
                    </div>
                    <div>
                      <strong>{trainedVoiceTitle(model)}</strong>
                    </div>
                    <button className="secondary-button" onClick={() => { setInferenceForm((prev) => ({ ...prev, model_id: model.model_id })); setActiveTab("tts"); }} type="button">
                      사용하기
                    </button>
                  </article>
                )) : <p className="field-hint">아직 표시할 모델이 없습니다.</p>}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "gallery" ? (
        <section className="workspace workspace--stacked">
          <section className="panel gallery-panel">
            <div className="gallery-toolbar">
              <div>
                <h2>생성 갤러리</h2>
                <p>결과를 듣고, 필요한 항목만 내려받거나 정리합니다.</p>
              </div>
              <div className="gallery-toolbar__actions">
                <button className="secondary-button" disabled={!history.length} onClick={() => setSelectedGalleryIds(history.map((record) => gallerySelectionKey(record)))} type="button">
                  모두 선택
                </button>
                <button className="secondary-button" disabled={!selectedGalleryIds.length} onClick={() => setSelectedGalleryIds([])} type="button">
                  선택 해제
                </button>
                <button className="secondary-button" disabled={!selectedGalleryIds.length} onClick={handleDeleteSelectedHistory} type="button">
                  선택 삭제
                </button>
              </div>
            </div>
            <div className="gallery-list">
              {history.length ? history.map((record) => {
                const selectionKey = gallerySelectionKey(record);
                return (
                <article className={selectedGalleryIds.includes(selectionKey) ? "gallery-row is-selected" : "gallery-row"} key={selectionKey}>
                  <label className="gallery-row__select" aria-label={`${getRecordDisplayTitle(record)} 선택`}>
                    <input checked={selectedGalleryIds.includes(selectionKey)} onChange={() => toggleGallerySelection(selectionKey)} type="checkbox" />
                    <span />
                  </label>
                  <div className="gallery-row__title">
                    <strong>{getRecordDisplayTitle(record)}</strong>
                    <span>{getModeLabel(record.mode)} · {formatDate(record.created_at)}</span>
                  </div>
                  <div className="gallery-row__wave" aria-hidden="true">
                    <MiniWaveform dense />
                  </div>
                  <audio controls src={record.output_audio_url} className="gallery-row__player" />
                  <div className="gallery-row__actions">
                    <a className="icon-button" href={record.output_audio_url} download={getAudioDownloadName(record)} aria-label="다운로드">
                      내려받기
                    </a>
                    <button className="icon-button icon-button--danger" onClick={() => void handleDeleteHistoryRecord(record.id)} type="button">
                      삭제
                    </button>
                  </div>
                </article>
                );
              }) : (
                <p className="field-hint">아직 생성한 음성이 없습니다.</p>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "tts" ? (
        <section className="workspace workspace--stacked">
          <form className={ttsSettingsOpen ? "fish-tts-shell" : "fish-tts-shell is-panel-closed"} onSubmit={handleModelInferenceSubmit}>
            <section className="fish-tts-editor">
              <div className="fish-editor-card">
                <div className="fish-editor-card__top">
                  <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                  <span className="voice-pill">
                    <span className="voice-pill__avatar">{(inferenceForm.speaker || selectedInferenceModel?.label || "V").slice(0, 1)}</span>
                    <span>{inferenceForm.speaker || (selectedInferenceModel ? displayModelName(selectedInferenceModel) : "목소리 선택")}</span>
                  </span>
                  <button className="icon-button" onClick={() => setTtsSettingsOpen((open) => !open)} type="button">
                    {ttsSettingsOpen ? "설정 접기" : "설정 열기"}
                  </button>
                </div>
                <textarea
                  className="fish-editor-textarea"
                  placeholder="[laugh]와 같은 오디오 태그를 사용하여 텍스트를 입력하고 표현력 있는 음성으로 변환..."
                  value={inferenceForm.text}
                  onChange={(event) => setInferenceForm((prev) => ({ ...prev, text: event.target.value }))}
                />
              </div>

              {selectedInferenceModel?.supports_instruction ? (
                <label className="fish-instruction-strip">
                  Instruction
                  <textarea
                    placeholder="Keep the tone breathy, unstable, and emotionally heightened."
                    value={inferenceForm.instruct}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))}
                  />
                </label>
              ) : null}

              <div className="fish-composer-dock">
                <details className="tag-popover">
                  <summary>태그</summary>
                  <div className="tag-popover__panel">
                    <p>S2 방식의 bracket tag를 대사에 삽입합니다. 필요한 표현은 직접 `[natural language tag]`로 써도 됩니다.</p>
                    {S2_PRO_TAG_CATEGORIES.slice(0, 3).map((category) => (
                      <section key={category.label}>
                        <strong>{category.label}</strong>
                        <div className="tag-cloud">
                          {category.tags.slice(0, 18).map((tag) => (
                            <button className="tag-chip" key={tag} onClick={() => applyTtsTag(tag)} type="button">
                              {tag}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
                <span className="credit-indicator">로컬 생성</span>
                <span className="byte-counter">{new Blob([inferenceForm.text]).size} / 500 바이트</span>
                <button className="primary-button" disabled={loading || !selectedInferenceModel} type="submit">
                  음성 생성
                </button>
              </div>
            </section>

            {ttsSettingsOpen ? (
              <aside className="studio-side-panel">
                <div className="studio-side-tabs">
                  <button className={ttsSideView === "settings" ? "is-active" : ""} onClick={() => setTtsSideView("settings")} type="button">
                    설정
                  </button>
                  <button className={ttsSideView === "history" ? "is-active" : ""} onClick={() => setTtsSideView("history")} type="button">
                    역사
                  </button>
                </div>

                {ttsSideView === "settings" ? (
                  <div className="studio-settings-stack">
                    <label>
                      TTS 모델
                      <select value={inferenceForm.model_id} onChange={(event) => setInferenceForm((prev) => ({ ...prev, model_id: event.target.value }))}>
                        <option value="">선택하세요</option>
                        {ttsModels.map((model) => (
                          <option key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedInferenceModel?.available_speakers?.length ? (
                      <label>
                        목소리
                        <select value={inferenceForm.speaker} onChange={(event) => setInferenceForm((prev) => ({ ...prev, speaker: event.target.value }))}>
                          {selectedInferenceModel.available_speakers.map((speaker) => (
                            <option key={speaker} value={speaker}>
                              {speaker}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      언어
                      <LanguageSelect value={inferenceForm.language} onChange={(language) => setInferenceForm((prev) => ({ ...prev, language }))} />
                    </label>
                    <label>
                      파일 이름
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
                          참조 음성 경로
                          <input value={inferenceForm.ref_audio_path} onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))} />
                        </label>
                        <label>
                          참조 음성 문장
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
                        <audio controls src={record.output_audio_url} />
                      </article>
                    ))}
                    {!history.length ? <p className="field-hint">아직 생성 이력이 없습니다.</p> : null}
                  </div>
                )}
              </aside>
            ) : null}
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
            <h3>설계 결과를 스타일로 저장</h3>
            <p className="field-hint">방금 만든 설계 결과만 바로 스타일 자산으로 저장합니다.</p>
            <div className="button-row">
              <button className="primary-button" disabled={!lastDesignRecord} onClick={handleCreateCloneFromDesign} type="button">
                방금 결과를 스타일로 저장
              </button>
            </div>
            <PromptSummaryCard title="설계 스타일 자산" prompt={selectedClonePrompt} />
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
            <button className="secondary-button" disabled={!selectedClonePrompt} onClick={() => void handleCreatePreset("design")} type="button">
              현재 설계 스타일을 프리셋으로 저장
            </button>
            {lastDesignRecord ? (
              <AudioCard
                title="방금 생성한 설계 음성"
                subtitle="설명문 기반 결과"
                record={lastDesignRecord}
              />
            ) : null}
            {lastDesignRecord ? (
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setVoiceBoxCloneForm((prev) => ({
                      ...prev,
                      ref_audio_path: lastDesignRecord.output_audio_path,
                      ref_text: lastDesignRecord.input_text,
                    }));
                    setCloneEngine("voicebox");
                    setActiveTab("clone");
                  }}
                  type="button"
                >
                  VoiceBox 복제에 사용
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    mergeDatasetSamples([{ audio_path: lastDesignRecord.output_audio_path, text: lastDesignRecord.input_text }]);
                    setDatasetForm((prev) => ({ ...prev, ref_audio_path: lastDesignRecord.output_audio_path }));
                    setActiveTab("dataset");
                  }}
                  type="button"
                >
                  데이터셋에 추가
                </button>
              </div>
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
          <section className="s2pro-hero">
            <div>
              <span className="eyebrow eyebrow--soft">Fish Speech</span>
              <h2>{pageMeta.title}</h2>
              <p>{pageMeta.description}</p>
            </div>
            <div className="s2pro-feature-cloud">
              {S2_PRO_FEATURES.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </div>
            {s2ProRuntime ? (
              <p className={s2ProRuntime.server_running ? "runtime-pill is-ready" : "runtime-pill"}>
                {s2ProRuntime.server_running ? "로컬 S2-Pro 서버 연결됨" : "로컬 S2-Pro 서버 대기 중"} · {s2ProRuntime.model}
              </p>
            ) : null}
          </section>

          <section className="panel s2pro-workspace">
            <form className="s2pro-form" onSubmit={handleS2ProSubmit}>
              <div className="s2pro-form__main">
                {currentS2ProMode === "tagged" ? (
                  <>
                    <h3>태그 기반 음성 생성</h3>
                    <p className="field-hint">S2-Pro는 고정 프리셋만 쓰는 모델이 아니라 bracket 형식의 자연어 태그를 읽습니다. 아래 목록은 공식 문서와 모델 설명에 나온 기준 태그를 S2 방식으로 정리한 것입니다.</p>
                    <input
                      className="s2pro-tag-search"
                      placeholder="Search tags, e.g. whisper, angry, pause"
                      value={s2TagSearch}
                      onChange={(event) => setS2TagSearch(event.target.value)}
                    />
                    <div className="s2pro-tag-library" aria-label="S2-Pro tag library">
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

                {currentS2ProMode === "clone" ? (
                  <>
                    <h3>목소리 저장</h3>
                    <p className="field-hint">참조 음성을 Fish Speech reference voice로 등록합니다. 저장한 뒤에는 S2-Pro 모든 탭에서 계속 선택할 수 있고, Qwen 복제 화면에도 바로 넘길 수 있습니다.</p>
                    <div className="s2pro-voice-form">
                      <label>
                        Voice name
                        <input value={s2ProVoiceForm.name} onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, name: event.target.value })} />
                      </label>
                      <div className="dataset-source-grid">
                        <section className="status-card">
                          <strong>참조 음성</strong>
                          <ServerAudioPicker assets={audioAssets} selectedPath={s2ProVoiceForm.reference_audio_path} onSelect={handleSelectS2ProReference} />
                          {s2ProVoiceForm.reference_audio_path ? (
                            <audio controls src={fileUrlFromPath(s2ProVoiceForm.reference_audio_path)} />
                          ) : null}
                        </section>
                        <section className="status-card">
                          <strong>Reference text</strong>
                          <textarea
                            placeholder="Reference audio transcript"
                            value={s2ProVoiceForm.reference_text}
                            onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, reference_text: event.target.value })}
                          />
                          <label className="inline-check">
                            <input
                              checked={s2ProVoiceForm.create_qwen_prompt}
                              onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, create_qwen_prompt: event.target.checked })}
                              type="checkbox"
                            />
                            Qwen clone prompt도 함께 생성
                          </label>
                        </section>
                      </div>
                      <button className="primary-button" onClick={() => handleCreateS2ProVoice()} type="button">
                        목소리 저장
                      </button>
                    </div>
                    <h3>저장 목소리로 생성</h3>
                    <div className="s2pro-voice-grid">
                      {s2ProVoices.map((voice) => (
                        <article className={selectedS2VoiceId === voice.id ? "s2pro-voice-card is-selected" : "s2pro-voice-card"} key={voice.id}>
                          <button onClick={() => setSelectedS2VoiceId(voice.id)} type="button">
                            <strong>{voice.name}</strong>
                            <span>{voice.fish_reference_present ? "S2-Pro ready" : "Fish server 재등록 필요"}</span>
                          </button>
                          <audio controls src={voice.reference_audio_url} />
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
                    <div className="dataset-source-grid">
                      <section className="status-card">
                        <strong>이번 생성에 사용할 목소리</strong>
                        <select value={selectedS2VoiceId} onChange={(event) => setSelectedS2VoiceId(event.target.value)}>
                          <option value="">저장 목소리 없이 참조 음성 직접 사용</option>
                          {s2ProVoices.map((voice) => (
                            <option key={voice.id} value={voice.id}>
                              {voice.name}
                            </option>
                          ))}
                        </select>
                      </section>
                    </div>
                    <label>
                      Text
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
                    <h3>멀티 스피커 대화</h3>
                    <p className="field-hint">Fish Speech는 참조 음성의 화자 정보를 기반으로 speaker tag를 읽습니다. 저장 목소리를 골라 기준 음색을 고정하고, 대사 안에는 speaker tag를 직접 넣습니다.</p>
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
                    <h3>다국어 생성</h3>
                    <p className="field-hint">저장 목소리를 유지한 채 여러 언어 문장을 섞어 생성합니다. 언어 선택은 메타데이터이고, 실제 언어 전환은 Text에 들어간 문장과 태그가 결정합니다.</p>
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
                <label>
                  Output name
                  <input value={s2ProForm.output_name} onChange={(event) => setS2ProForm({ ...s2ProForm, output_name: event.target.value })} />
                </label>
                <label>
                  Language
                  <LanguageSelect value={s2ProForm.language} onChange={(language) => setS2ProForm({ ...s2ProForm, language })} />
                </label>
                <label>
                  Instruction
                  <textarea
                    value={s2ProForm.instruction}
                    onChange={(event) => setS2ProForm({ ...s2ProForm, instruction: event.target.value })}
                  />
                </label>
                <details className="advanced-inline">
                  <summary>Advanced controls</summary>
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

      {activeTab === "changer" ? (
        <section className="workspace workspace--stacked">
          <div className="subtab-row subtab-row--wide">
            <button className={voiceChangerWorkflow === "train" ? "subtab is-active" : "subtab"} type="button" onClick={() => setVoiceChangerWorkflow("train")}>
              RVC 모델 훈련
            </button>
            <button className={voiceChangerWorkflow === "convert" ? "subtab is-active" : "subtab"} type="button" onClick={() => setVoiceChangerWorkflow("convert")}>
              목소리 변환
            </button>
          </div>

          {voiceChangerWorkflow === "train" ? (
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
          ) : (
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
                {voiceChangerForm.audio_path ? (
                  <div className="selected-source-card">
                    <span className="meta-label">선택한 원본</span>
                    <strong>{selectedVoiceChangerAsset?.filename || audioToolUpload?.filename || basenameFromPath(voiceChangerForm.audio_path)}</strong>
                    <audio controls src={fileUrlFromPath(voiceChangerForm.audio_path)} />
                  </div>
                ) : (
                  <p className="field-hint">업로드하거나 아래 목록에서 변환할 원본 음성을 선택하세요.</p>
                )}
                <ServerAudioPicker assets={audioAssets} selectedPath={voiceChangerForm.audio_path} onSelect={handleSelectAudioToolAsset} />
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
          )}

          {lastAudioToolResult?.kind === "voice_changer" && lastAudioToolResult.record ? (
            <section className="panel">
              <h2>방금 변환한 결과</h2>
              <AudioCard title="보이스 체인저 결과" record={lastAudioToolResult.record} />
            </section>
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
                    <option value="vocal_rvc">RVC vocal preset - 보이스 체인저용 보컬 추출</option>
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
                    <audio controls className="audio-card__player" src={asset.url} />
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
                      <audio controls className="audio-card__player" src={selectedDatasetReferenceAsset.url} />
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
                        {asset ? <audio controls className="selected-sample-row__player" src={asset.url} /> : null}
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
  );
}
