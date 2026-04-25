import { FormEvent, useEffect, useRef, useState } from "react";

import { api } from "./lib/api";
import {
  AudioCard,
  basenameFromPath,
  createEmptyDatasetSample,
  createGenerationControls,
  CUSTOM_RECIPES,
  DESIGN_RECIPES,
  FineTuneMode,
  formatDate,
  GenerationControlsEditor,
  GenerationControlsForm,
  getModeLabel,
  getRecordDisplayTitle,
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
  SOUND_EFFECT_LIBRARY,
  SpotlightCard,
  TabKey,
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
        <p>아직 clone prompt가 없습니다. 위 단계에서 먼저 prompt를 만드세요.</p>
      </div>
    );
  }

  return (
    <article className="result-card">
      <div className="result-card__header">
        <div>
          <span className="eyebrow eyebrow--soft">Clone Prompt</span>
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
          <strong>{prompt.x_vector_only_mode ? "x-vector only" : "full prompt"}</strong>
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

function sanitizeLongScript(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(장면|scene)\s*\d+\s*[:.)-]?\s*/i, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
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
    text: "차갑지만 고급스럽고 또렷한 젊은 여성 목소리. 서울말 억양, 숨이 너무 많지 않고 문장 끝이 단정하게 떨어지는 톤.",
    language: "Korean",
    instruct: "Young Korean woman, cool, polished, and articulate. Keep the tone restrained, modern, and elegant.",
  });
  const [storyForm, setStoryForm] = useState({
    model_id: "",
    text: "오늘은 정말 힘들었어. 그래도 여기서 멈출 수는 없어.\n\n조금만 더 가면 끝이 보일 거야.",
    language: "Korean",
    instruct: "Natural Korean narration for a long-form script. Keep the flow stable and easy to listen to over time.",
    generation_mode: "custom_voice",
    split_mode: "line",
    pause_ms: "350",
    speaker: "Sohee",
  });
  const [lastDesignRecord, setLastDesignRecord] = useState<GenerationRecord | null>(null);
  const [lastStoryRecord, setLastStoryRecord] = useState<GenerationRecord | null>(null);
  const [designControls, setDesignControls] = useState<GenerationControlsForm>(createGenerationControls("design"));
  const [inferenceForm, setInferenceForm] = useState({
    model_id: "",
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
  const [selectedClonePrompt, setSelectedClonePrompt] = useState<ClonePromptRecord | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    language: "Korean",
    notes: "",
  });
  const [presetGenerateText, setPresetGenerateText] = useState("이 캐릭터는 앞으로도 같은 목소리로 말해야 해.");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedHybridPresetId, setSelectedHybridPresetId] = useState("");
  const [presetControls, setPresetControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));

  const [uploadedRef, setUploadedRef] = useState<UploadResponse | null>(null);
  const [uploadRefText, setUploadRefText] = useState("");
  const [uploadTranscriptMeta, setUploadTranscriptMeta] = useState<string>("");
  const [uploadedClonePrompt, setUploadedClonePrompt] = useState<ClonePromptRecord | null>(null);

  const [datasetSamples, setDatasetSamples] = useState([createEmptyDatasetSample()]);
  const [datasetBulkInput, setDatasetBulkInput] = useState("");
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
  const [hybridForm, setHybridForm] = useState({
    base_model_id: "",
    custom_model_id: "",
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
  const [audioEffectsSearch, setAudioEffectsSearch] = useState("");
  const [soundEffectForm, setSoundEffectForm] = useState({
    prompt: "Cold rain on a metal roof with distant low thunder",
    duration_sec: "4.0",
    intensity: "0.9",
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
  const [audioConvertForm, setAudioConvertForm] = useState({
    audio_path: "",
    output_format: "wav",
    sample_rate: "24000",
    mono: true,
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
    inferenceModels.find((model) => model.source === "stock" && model.category === "custom_voice" && model.label.includes("1.7B")) ??
    inferenceModels.find((model) => model.source === "stock" && model.recommended) ??
    inferenceModels.find((model) => model.source === "stock") ??
    inferenceModels.find((model) => model.recommended) ??
    inferenceModels[0];
  const selectedInferenceModel = inferenceModels.find((model) => model.model_id === inferenceForm.model_id) ?? preferredInferenceModel ?? null;
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
    if (inferenceModels.length > 0 && !inferenceForm.model_id) {
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
    if (customVoiceModels.length > 0 && !storyForm.model_id) {
      setStoryForm((prev) => ({
        ...prev,
        model_id: preferredStockCustomVoiceModel?.model_id ?? prev.model_id,
        speaker: preferredStockCustomVoiceModel?.default_speaker ?? prev.speaker,
      }));
    }
  }, [customVoiceCapableModels, customVoiceModels, voiceDesignModels, baseModels, inferenceModels, tokenizerModels, designForm.model_id, selectedBaseModelId, inferenceForm.model_id, hybridForm.custom_model_id, runForm.init_model_path, runForm.speaker_encoder_model_path, runForm.tokenizer_model_path, storyForm.model_id, preferredStockBaseModel, preferredStockCustomVoiceModel, preferredHybridCustomModel, preferredInferenceModel]);

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
    setSelectedGalleryIds((prev) => prev.filter((id) => history.some((record) => record.id === id)));
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

      const preferredBase = preferredStockBaseModel;
      return {
        ...prev,
        init_model_path: preferredBase?.model_id || prev.init_model_path,
      };
    });
  }, [runForm.training_mode, preferredStockCustomVoiceModel, preferredStockBaseModel]);

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
  const assetTextByPath = new Map(
    audioAssets.map((asset) => [asset.path, (asset.transcript_text || "").trim()]),
  );
  const soundEffectsAvailable = audioToolCapabilityMap.get("sound_effects")?.available ?? true;
  const voiceChangerAvailable = audioToolCapabilityMap.get("voice_changer")?.available ?? true;
  const audioSeparationAvailable = audioToolCapabilityMap.get("audio_separation")?.available ?? true;
  const pageMeta = PRODUCT_PAGES[activeTab];
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
        : `Whisper 전사 완료${result.language ? ` · ${result.language}` : ""}`,
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

  function applySoundEffectRecipe(prompt: string) {
    setSoundEffectForm((prev) => ({
      ...prev,
      prompt,
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
      const selectedIds = [...selectedGalleryIds];
      setHistory((prev) => prev.filter((record) => !selectedIds.includes(record.id)));
      await api.deleteHistoryBatch(selectedGalleryIds);
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
        duration_sec: Number(soundEffectForm.duration_sec || "4"),
        intensity: Number(soundEffectForm.intensity || "0.9"),
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
      setMessage(`${result.filename} 파일을 불러왔습니다.`);
    });
  }

  function handleSelectAudioToolAsset(asset: AudioAsset) {
    setAudioToolUpload(null);
    setVoiceChangerForm((prev) => ({ ...prev, audio_path: asset.path }));
    setAudioConvertForm((prev) => ({ ...prev, audio_path: asset.path }));
    setMessage(`${asset.filename} 파일을 작업 입력으로 선택했습니다.`);
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

  async function handleAudioSeparation(audioPath: string) {
    await runAction(async () => {
      const result = await api.separateAudio({ audio_path: audioPath });
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

  async function handleStoryStudioSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.generateStoryStudio({
        model_id: storyForm.model_id || undefined,
        text: sanitizeLongScript(storyForm.text),
        language: storyForm.language,
        instruct: storyForm.instruct,
        generation_mode: storyForm.generation_mode,
        split_mode: storyForm.split_mode,
        pause_ms: Number(storyForm.pause_ms || "350"),
        speaker: storyForm.generation_mode === "custom_voice" ? storyForm.speaker : undefined,
        ...serializeGenerationControls(designControls),
      });
      setLastStoryRecord(result.record);
      await refreshAll();
      setMessage("장시간 대본 생성을 완료했습니다.");
    });
  }

  async function handleCreateCloneFromDesign() {
    const generationId = selectedDesignSampleId || lastDesignRecord?.id || "";
    if (!generationId) {
      setMessage("먼저 디자인 샘플을 선택해주세요.");
      return;
    }
    if (!selectedBaseModelId) {
      setMessage("먼저 Base 모델을 선택해주세요.");
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
      setMessage("디자인 샘플에서 clone prompt를 만들었습니다.");
    });
  }

  async function handleUploadReference(file: File) {
    await runAction(async () => {
      setUploadRefText("");
      setUploadTranscriptMeta("Whisper 전사를 준비하고 있습니다.");
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
      setMessage("먼저 Base 모델을 선택해주세요.");
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
      setMessage("업로드한 음성으로 clone prompt를 만들었습니다.");
    });
  }

  async function handleCreatePreset(source: "design" | "upload") {
    const prompt = source === "design" ? selectedClonePrompt : uploadedClonePrompt;
    if (!prompt) {
      setMessage("먼저 clone prompt를 만들어주세요.");
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
        text: presetGenerateText,
        language: presetForGeneration?.language ?? "",
        ...serializeGenerationControls(presetControls),
      });
      await refreshAll();
      setMessage("프리셋으로 음성을 생성했습니다.");
    });
  }

  async function handleCreateDataset() {
    const validSamples = datasetSamples
      .map((sample) => ({ audio_path: sample.audio_path.trim(), text: (sample.text ?? "").trim() }))
      .filter((sample) => sample.audio_path);
    if (!datasetForm.ref_audio_path || validSamples.length === 0) {
      setMessage("ref_audio와 최소 1개 이상의 음성 샘플을 채워주세요.");
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
            <span className="sidebar__section-title">제품</span>
            <button className={activeTab === "tts" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("tts")} type="button">
              <span>텍스트 음성 변환</span>
            </button>
            <button className={activeTab === "clone" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("clone")} type="button">
              <span>목소리 복제</span>
            </button>
            <button className={activeTab === "design" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("design")} type="button">
              <span>목소리 설계</span>
            </button>
            <button className={activeTab === "projects" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("projects")} type="button">
              <span>프리셋 기반 생성</span>
            </button>
            <button className={activeTab === "story" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("story" as TabKey)} type="button">
              <span>스토리 스튜디오</span>
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
            <span className="sidebar__section-title">학습</span>
            <button className={activeTab === "dataset" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("dataset")} type="button">
              <span>데이터셋 만들기</span>
            </button>
            <button className={activeTab === "training" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("training")} type="button">
              <span>학습 실행</span>
            </button>
            <button className={activeTab === "voicebox" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("voicebox")} type="button">
              <span>VoiceBox Lab</span>
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
                <p>텍스트 음성 변환, 목소리 복제, 목소리 설계, 프리셋 반복 생성, 장문 스크립트 생성, 학습 작업을 사용자 흐름에 맞게 나눴습니다.</p>
              </div>
              <div className="spotlight-grid">
                <SpotlightCard
                  eyebrow="생성"
                  title="텍스트 음성 변환"
                  description="기본 설정으로 바로 들어보고, 필요할 때만 고급 제어를 엽니다."
                  actionLabel="텍스트 음성 변환"
                  onAction={() => setActiveTab("tts")}
                />
                <SpotlightCard
                  eyebrow="복제"
                  title="목소리 복제"
                  description="참조 음성에서 스타일을 추출하고 저장합니다."
                  actionLabel="목소리 복제"
                  onAction={() => setActiveTab("clone")}
                />
                <SpotlightCard
                  eyebrow="설계"
                  title="목소리 설계"
                  description="설명문만으로 새 목소리를 만든 뒤 스타일 자산으로 저장합니다."
                  actionLabel="목소리 설계"
                  onAction={() => setActiveTab("design")}
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
              <h2>학습된 목소리</h2>
              <p>각 학습 결과에서 마지막 체크포인트만 보여줍니다.</p>
              <div className="preset-list">
                {finetunedModels.length ? finetunedModels.map((model) => (
                  <article className="preset-card" key={model.key}>
                    <strong>{model.category === "custom_voice_finetuned" ? "CustomVoice 학습 결과" : "Base 학습 결과"}</strong>
                    <span>{model.default_speaker ? `${model.default_speaker} 화자` : "학습된 목소리"}</span>
                    <p>{model.notes}</p>
                    <button className="secondary-button" onClick={() => { setInferenceForm((prev) => ({ ...prev, model_id: model.model_id })); setActiveTab("tts"); }} type="button">
                      텍스트 음성 변환에서 사용
                    </button>
                  </article>
                )) : <p className="field-hint">아직 fine-tuned 체크포인트가 없습니다.</p>}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "gallery" ? (
        <section className="workspace workspace--stacked">
          <section className="panel">
            <h2>생성 갤러리</h2>
            <div className="button-row">
              <button className="secondary-button" disabled={!history.length} onClick={() => setSelectedGalleryIds(history.map((record) => record.id))} type="button">
                모두 선택
              </button>
              <button className="secondary-button" disabled={!selectedGalleryIds.length} onClick={() => setSelectedGalleryIds([])} type="button">
                선택 해제
              </button>
              <button className="secondary-button" disabled={!selectedGalleryIds.length} onClick={handleDeleteSelectedHistory} type="button">
                선택 삭제
              </button>
            </div>
            <div className="audio-grid">
              {history.length ? history.map((record) => (
                <article className="preset-card" key={record.id}>
                  <label className="checkbox-row">
                    <input checked={selectedGalleryIds.includes(record.id)} onChange={() => toggleGallerySelection(record.id)} type="checkbox" />
                    선택
                  </label>
                  <AudioCard title={getRecordDisplayTitle(record)} subtitle={getModeLabel(record.mode)} record={record} />
                  <div className="button-row">
                    <button className="ghost-button" onClick={() => void handleDeleteHistoryRecord(record.id)} type="button">
                      삭제
                    </button>
                  </div>
                </article>
              )) : (
                <p className="field-hint">아직 생성한 음성이 없습니다.</p>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "tts" ? (
        <section className="workspace workspace--stacked">
          <form className="panel inference-panel" onSubmit={handleModelInferenceSubmit}>
            <h2>텍스트 음성 변환</h2>
            <RecipeBar title="빠른 테스트 문장" items={CUSTOM_RECIPES} onApply={applyCustomRecipe} />
            <div className="field-row">
              <label>
                모델
                <select value={inferenceForm.model_id} onChange={(event) => setInferenceForm((prev) => ({ ...prev, model_id: event.target.value }))}>
                  <option value="">선택하세요</option>
                  {inferenceModels.map((model) => (
                    <option key={model.key} value={model.model_id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                언어
                <LanguageSelect value={inferenceForm.language} onChange={(language) => setInferenceForm((prev) => ({ ...prev, language }))} />
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
            </div>
            <label>
              대사
              <textarea value={inferenceForm.text} onChange={(event) => setInferenceForm((prev) => ({ ...prev, text: event.target.value }))} />
            </label>
            {selectedInferenceModel?.supports_instruction ? (
              <label>
                말투 지시
                <textarea
                  placeholder="원하는 감정이나 말투를 짧게 적어주세요."
                  value={inferenceForm.instruct}
                  onChange={(event) => setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))}
                />
              </label>
            ) : null}
            {selectedInferenceMode === "voice_clone" ? (
              <details className="advanced-inline">
                <summary>참조 음성</summary>
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
              <summary>고급 제어</summary>
              <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
            </details>
            <button className="primary-button" disabled={loading || !selectedInferenceModel} type="submit">
              음성 생성
            </button>
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
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              설계 설명문
              <textarea
                placeholder="예: Young Korean woman, cool, polished, and articulate. Keep the tone restrained and elegant."
                value={designForm.instruct}
                onChange={(event) => setDesignForm({ ...designForm, instruct: event.target.value })}
              />
            </label>
            <label>
              시험 대사
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
              <summary>고급 제어</summary>
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
          </aside>
          </div>
        </section>
      ) : null}

      {activeTab === "story" ? (
        <section className="workspace workspace--stacked">
          <form className="panel" onSubmit={handleStoryStudioSubmit}>
            <h2>스토리 스튜디오</h2>
            <div className="field-row">
              <label>
                생성 방식
                <select value={storyForm.generation_mode} onChange={(event) => setStoryForm({ ...storyForm, generation_mode: event.target.value })}>
                  <option value="voice_design">Voice Design</option>
                  <option value="custom_voice">CustomVoice</option>
                </select>
              </label>
              <label>
                모델
                <select value={storyForm.model_id} onChange={(event) => setStoryForm({ ...storyForm, model_id: event.target.value })}>
                  {(storyForm.generation_mode === "custom_voice" ? customVoiceModels : voiceDesignModels).map((model) => (
                    <option key={model.key} value={model.model_id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                언어
                <LanguageSelect value={storyForm.language} onChange={(language) => setStoryForm({ ...storyForm, language })} />
              </label>
            </div>
            {storyForm.generation_mode === "custom_voice" ? (
              <label>
                목소리
                <select value={storyForm.speaker} onChange={(event) => setStoryForm({ ...storyForm, speaker: event.target.value })}>
                  {speakers.map((speaker) => (
                    <option key={speaker.speaker} value={speaker.speaker}>
                      {speaker.speaker}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              말투 지시
              <textarea value={storyForm.instruct} onChange={(event) => setStoryForm({ ...storyForm, instruct: event.target.value })} />
            </label>
            <label>
              긴 대본
              <textarea className="bulk-path-textarea" value={storyForm.text} onChange={(event) => setStoryForm({ ...storyForm, text: event.target.value })} />
            </label>
            <details className="advanced-inline">
              <summary>고급 제어</summary>
              <div className="field-row">
                <label>
                  분할 방식
                  <select value={storyForm.split_mode} onChange={(event) => setStoryForm({ ...storyForm, split_mode: event.target.value })}>
                    <option value="paragraph">문단마다</option>
                    <option value="line">줄마다</option>
                  </select>
                </label>
                <label>
                  문장 사이 간격(ms)
                  <input value={storyForm.pause_ms} onChange={(event) => setStoryForm({ ...storyForm, pause_ms: event.target.value })} />
                </label>
              </div>
              <GenerationControlsEditor value={designControls} onChange={setDesignControls} />
            </details>
            <button className="primary-button" disabled={loading} type="submit">
              장문 음성 생성
            </button>
          </form>

          {lastStoryRecord ? (
            <section className="panel">
              <h3>생성 결과</h3>
              <AudioCard title="방금 생성한 장문 음성" record={lastStoryRecord} />
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "clone" ? (
        <section className="workspace workspace--stacked">
          <section className="panel builder-panel">
            <div className="builder-header">
              <div>
                <span className="eyebrow eyebrow--soft">목소리 복제</span>
                <h2>참조 음성에서 복제용 스타일 저장</h2>
                <p>참조 음성에서 스타일 자산을 뽑고 저장합니다.</p>
              </div>
              <label>
                Base 모델
                <select value={selectedBaseModelId} onChange={(event) => setSelectedBaseModelId(event.target.value)}>
                  {baseModels.map((model) => (
                    <option key={model.key} value={model.model_id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
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
                    placeholder="비워두면 서버가 Whisper로 자동 전사합니다."
                    value={uploadRefText}
                    onChange={(event) => setUploadRefText(event.target.value)}
                  />
                </label>
                {uploadTranscriptMeta ? <p className="field-hint">{uploadTranscriptMeta}</p> : null}
                <div className="button-row">
                  <button className="secondary-button" onClick={handleTranscribeUploadText} type="button">
                    Whisper로 다시 전사
                  </button>
                  <button className="primary-button" onClick={handleCreateCloneFromUpload} type="button">
                    복제용 스타일 저장
                  </button>
                </div>
              </section>

              <section className="step-card">
                <span className="step-card__index">2</span>
                <PromptSummaryCard
                  title="복제 스타일 자산"
                  prompt={uploadedClonePrompt}
                />
              </section>

              <section className="step-card">
                <span className="step-card__index">3</span>
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
            {selectedHybridPreset ? (
              <article className="status-card">
                <strong>왜 모델이 두 개 필요한가</strong>
                <p>Base 모델은 프리셋의 기준 음성에서 스타일 신호를 읽고, CustomVoice 모델은 그 스타일을 유지한 채 새 대사와 말투 지시를 적용해 말합니다.</p>
              </article>
            ) : null}

            <div className="panel-grid">
              <form className="panel inference-panel" onSubmit={(event) => { event.preventDefault(); void handleGenerateFromPreset(); }}>
                <h3>프리셋 그대로 생성</h3>
                <label>
                  대사
                  <textarea value={presetGenerateText} onChange={(event) => setPresetGenerateText(event.target.value)} />
                </label>
                <details className="advanced-inline">
                  <summary>고급 제어</summary>
                  <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
                </details>
                <button className="secondary-button" disabled={!selectedHybridPreset} type="submit">
                  프리셋 그대로 생성
                </button>
              </form>

              <form className="panel inference-panel" onSubmit={handleHybridInferenceSubmit}>
                <h3>프리셋 + 말투 지시</h3>
                <RecipeBar title="말투 템플릿" items={HYBRID_RECIPES} onApply={applyHybridRecipe} />
                <div className="field-row">
                  <label>
                    Base 모델
                    <select
                      value={hybridForm.base_model_id}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, base_model_id: event.target.value }))}
                    >
                      <option value="">선택하세요</option>
                      {baseModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    CustomVoice 모델
                    <select
                      value={hybridForm.custom_model_id}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, custom_model_id: event.target.value }))}
                    >
                      <option value="">선택하세요</option>
                      {customVoiceCapableModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {model.label}
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
                  언어
                  <LanguageSelect
                    value={hybridForm.language}
                    onChange={(language) => setHybridForm((prev) => ({ ...prev, language }))}
                  />
                </label>
                <details className="advanced-inline">
                  <summary>고급 제어</summary>
                  <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
                </details>
                <button className="primary-button" disabled={loading || !selectedHybridPreset} type="submit">
                  말투 지시 적용 생성
                </button>
              </form>
            </div>
          </section>

          {lastHybridRecord ? (
            <section className="panel">
              <h3>생성 결과</h3>
              <AudioCard title="방금 생성한 프리셋 결과" subtitle={lastHybridRecord.mode} record={lastHybridRecord} />
            </section>
          ) : null}
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
                    <span className={`sound-effects-dot sound-effects-dot--${item.id}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="sound-effects-row__player">
                    <span>{item.duration}</span>
                    <MiniWaveform />
                    <button className="icon-button" onClick={() => applySoundEffectRecipe(item.prompt)} type="button">
                      프롬프트 넣기
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <form className="sound-effects-composer" onSubmit={handleSoundEffectSubmit}>
              <div className="sound-effects-composer__label">프롬프트</div>
              <textarea
                placeholder="Write the sound prompt in English."
                value={soundEffectForm.prompt}
                onChange={(event) => setSoundEffectForm({ ...soundEffectForm, prompt: event.target.value })}
              />
              <div className="field-row">
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
          <div className="panel-grid">
            <section className="panel">
              <h2>원본 오디오 선택</h2>
              <p className="field-hint">파일을 업로드하거나 서버에 저장된 오디오를 골라서 변환합니다.</p>
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
              <ServerAudioPicker assets={audioAssets} selectedPath={voiceChangerForm.audio_path} onSelect={handleSelectAudioToolAsset} />
            </section>

            <form className="panel" onSubmit={handleVoiceChangerSubmit}>
              <h2>보이스 체인저</h2>
              {!voiceChangerAvailable ? <p className="field-hint">보이스 체인저 모델이 아직 준비되지 않았습니다. 모델 다운로드 스크립트로 RVC 모델을 먼저 받아주세요.</p> : null}
              <div className="field-row">
                <label>
                  변환할 목소리
                  <select value={voiceChangerForm.selected_model_id} onChange={(event) => handleSelectVoiceChangerModel(event.target.value)}>
                    <option value="">선택하세요</option>
                    {voiceChangerModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  목소리 높낮이
                  <input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                </label>
              </div>
              {voiceChangerForm.selected_model_id ? (
                <div className="source-summary">
                  <span className="meta-label">선택한 모델</span>
                  <strong>{basenameFromPath(voiceChangerForm.model_path)}</strong>
                  {voiceChangerForm.index_path ? <span>{basenameFromPath(voiceChangerForm.index_path)}</span> : null}
                </div>
              ) : null}
              <div className="field-row">
                <label>
                  피치 추출 방식
                  <select value={voiceChangerForm.f0_method} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: event.target.value })}>
                    <option value="rmvpe">rmvpe</option>
                    <option value="fcpe">fcpe</option>
                    <option value="crepe">crepe</option>
                  </select>
                </label>
                <label>
                  음색 반영 강도
                  <input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                </label>
                <label>
                  원본 보존 비율
                  <input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                </label>
              </div>
              <div className="field-row">
                <label>
                  후처리 강도
                  <input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                </label>
                <label>
                  음색 추출기
                  <select value={voiceChangerForm.embedder_model} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, embedder_model: event.target.value })}>
                    <option value="contentvec">contentvec</option>
                    <option value="hubert">hubert</option>
                  </select>
                </label>
              </div>
              <div className="field-row">
                <label className="checkbox-row">
                  <input type="checkbox" checked={voiceChangerForm.split_audio} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, split_audio: event.target.checked })} />
                  긴 오디오 분할 처리
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={voiceChangerForm.f0_autotune} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_autotune: event.target.checked })} />
                  오토튠
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={voiceChangerForm.clean_audio} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_audio: event.target.checked })} />
                  후처리 정리
                </label>
              </div>
              <button className="primary-button" disabled={loading || !voiceChangerAvailable || !voiceChangerForm.audio_path || !voiceChangerForm.model_path} type="submit">
                목소리 바꾸기
              </button>
            </form>
          </div>

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
              <ServerAudioPicker assets={audioAssets} selectedPath={audioConvertForm.audio_path} onSelect={handleSelectAudioToolAsset} />
            </section>

            <form className="panel" onSubmit={(event) => {
              event.preventDefault();
              void handleAudioSeparation(audioConvertForm.audio_path);
            }}>
              <h2>오디오 분리</h2>
              <p>선택한 오디오를 두 갈래로 나눠 다시 확인합니다.</p>
              {!audioSeparationAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <button className="primary-button" disabled={loading || !audioConvertForm.audio_path || !audioSeparationAvailable} type="submit">
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
            <label>
              기준 음성 경로
              <input
                placeholder="예: D:/my_tts_dataset/mai/ref/ref.wav"
                value={datasetForm.ref_audio_path}
                onChange={(event) => setDatasetForm({ ...datasetForm, ref_audio_path: normalizeDatasetPath(event.target.value) })}
              />
            </label>
            <label>
              샘플 경로 일괄 입력
              <textarea
                className="bulk-path-textarea"
                placeholder={"D:/my_tts_dataset/mai/wavs/0001.wav | 첫 번째 문장\nD:/my_tts_dataset/mai/wavs/0002.wav"}
                value={datasetBulkInput}
                onChange={(event) => setDatasetBulkInput(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button className="secondary-button" onClick={applyBulkDatasetPaths} type="button">
                경로 목록 반영
              </button>
              <button className="secondary-button" onClick={handleTranscribeAllDatasetSamples} type="button">
                비어 있는 텍스트 자동 채우기
              </button>
            </div>
            <div className="sample-builder">
              {datasetSamples.map((sample, index) => (
                <article className="sample-card" key={`sample-${index}`}>
                  <div className="sample-card__header">
                    <div>
                      <strong>샘플 {index + 1}</strong>
                      <span>{!sample.audio_path ? "오디오 필요" : sample.text?.trim() ? "텍스트 있음" : "자동 전사 가능"}</span>
                    </div>
                    <div className="sample-card__actions">
                      <button className="secondary-button" disabled={!sample.audio_path.trim()} onClick={() => void handleTranscribeDatasetSample(index)} type="button">
                        이 샘플 자동 채우기
                      </button>
                      <button className="ghost-button" onClick={() => removeSampleRow(index)} type="button">
                        삭제
                      </button>
                    </div>
                  </div>
                  <label>
                    샘플 오디오 경로
                    <input
                      placeholder="예: D:/my_tts_dataset/mai/wavs/0001.wav"
                      value={sample.audio_path}
                      onChange={(event) => updateDatasetSample(index, { audio_path: normalizeDatasetPath(event.target.value), original_filename: basenameFromPath(event.target.value) })}
                    />
                  </label>
                  <label>
                    샘플 텍스트
                    <textarea
                      placeholder="비워두면 자동 전사를 시도합니다."
                      value={sample.text ?? ""}
                      onChange={(event) => updateDatasetSample(index, { text: event.target.value })}
                    />
                  </label>
                </article>
              ))}
            </div>
            <div className="button-row">
              <button className="secondary-button" onClick={addSampleRow} type="button">
                샘플 추가
              </button>
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
                    <option value="base">Base Fine-Tune</option>
                    <option value="custom_voice">CustomVoice Fine-Tune</option>
                  </select>
                </label>
                <label>
                  초기 모델
                  <select value={runForm.init_model_path} onChange={(event) => setRunForm({ ...runForm, init_model_path: event.target.value })}>
                    {(runForm.training_mode === "custom_voice" ? customVoiceCapableModels : baseModels).map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  화자 이름
                  <input value={runForm.speaker_name} onChange={(event) => setRunForm({ ...runForm, speaker_name: event.target.value })} />
                </label>
              </div>
              {runForm.training_mode === "custom_voice" ? (
                <label>
                  음색 인코더 기준 모델
                  <select value={runForm.speaker_encoder_model_path} onChange={(event) => setRunForm({ ...runForm, speaker_encoder_model_path: event.target.value })}>
                    {baseModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <details className="advanced-inline">
                <summary>세부 하이퍼파라미터</summary>
                <div className="field-row">
                  <label>
                    토크나이저
                    <select value={runForm.tokenizer_model_path} onChange={(event) => setRunForm({ ...runForm, tokenizer_model_path: event.target.value })}>
                      {tokenizerModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {model.label}
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
                  <strong>{run.training_mode === "custom_voice" ? "CustomVoice 학습" : "Base 학습"}</strong>
                  <span>{run.status}</span>
                  <span>{run.speaker_name}</span>
                  <span>{formatDate(run.created_at)}</span>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "voicebox" ? (
        <section className="workspace workspace--stacked">
          <section className="panel">
            <h2>VoiceBox 작업 흐름</h2>
            <p className="field-hint">
              VoiceBox는 CustomVoice에 Base 1.7B의 speaker encoder를 포함시킨 self-contained 체크포인트입니다. 훈련, 변환, 재훈련, clone, clone+instruct 스크립트는 Qwen3-TTS 내부 역할별 폴더에 분리되어 있습니다.
            </p>
            <div className="panel-grid">
              <article className="status-card">
                <strong>1. CustomVoice 화자 추가</strong>
                <p>Qwen3-TTS/finetuning/sft_custom_voice_12hz.py</p>
              </article>
              <article className="status-card">
                <strong>2. Encoder fusion</strong>
                <p>Qwen3-TTS/fusion/make_voicebox_checkpoint.py</p>
              </article>
              <article className="status-card">
                <strong>3. VoiceBox 재훈련</strong>
                <p>Qwen3-TTS/finetuning/sft_voicebox_12hz.py</p>
              </article>
              <article className="status-card">
                <strong>4. VoiceBox 추론</strong>
                <p>Qwen3-TTS/inference/voicebox/clone_instruct.py</p>
              </article>
            </div>
            <div className="button-row">
              <button className="secondary-button" onClick={() => setActiveTab("dataset")} type="button">
                데이터셋 만들기
              </button>
              <button className="secondary-button" onClick={() => setActiveTab("training")} type="button">
                일반 학습 실행
              </button>
              <button className="secondary-button" onClick={() => setActiveTab("clone")} type="button">
                Voice clone 확인
              </button>
              <button className="secondary-button" onClick={() => setActiveTab("projects")} type="button">
                clone prompt + instruct 확인
              </button>
            </div>
          </section>

          <section className="panel">
            <h3>현재 감지된 VoiceBox 후보</h3>
            <div className="preset-list">
              {models.filter((model) => model.category.includes("voicebox") || model.label.toLowerCase().includes("voicebox")).length ? (
                models
                  .filter((model) => model.category.includes("voicebox") || model.label.toLowerCase().includes("voicebox"))
                  .map((model) => (
                    <article className="preset-card" key={model.key}>
                      <strong>{model.label}</strong>
                      <span>{model.model_id}</span>
                      <p>{model.notes || "VoiceBox 체크포인트"}</p>
                      <button className="secondary-button" onClick={() => { setInferenceForm((prev) => ({ ...prev, model_id: model.model_id })); setActiveTab("tts"); }} type="button">
                        추론에서 사용
                      </button>
                    </article>
                  ))
              ) : (
                <p className="field-hint">아직 등록된 VoiceBox 체크포인트가 없습니다. 변환 후 bootstrap을 새로고침하면 이 영역에 나타납니다.</p>
              )}
            </div>
          </section>
        </section>
      ) : null}
        </main>
      </div>
    </div>
  );
}
