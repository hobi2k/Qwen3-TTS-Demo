import { FormEvent, useEffect, useRef, useState } from "react";

import { api } from "./lib/api";
import {
  AudioCard,
  basenameFromPath,
  CharacterBuilderSource,
  createEmptyDatasetSample,
  createGenerationControls,
  CUSTOM_RECIPES,
  DESIGN_RECIPES,
  fileUrlFromPath,
  FineTuneMode,
  formatDate,
  GenerationControlsEditor,
  GenerationControlsForm,
  getAudioDownloadName,
  getAudioToolJobDisplayTitle,
  getDatasetSourceLabel,
  getModeLabel,
  getModelDisplayLabel,
  getPresetSourceLabel,
  getRecordDisplayTitle,
  HeroMetric,
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
  AudioEffectsView,
} from "./lib/app-ui";
import type {
  AudioAsset,
  AudioToolCapability,
  AudioToolJob,
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [datasets, setDatasets] = useState<FineTuneDataset[]>([]);
  const [runs, setRuns] = useState<FineTuneRun[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const bootstrapLoadedRef = useRef(false);
  const actionQueueRef = useRef(Promise.resolve());

  const [customForm, setCustomForm] = useState({
    model_id: "",
    text: "안녕하세요. 지금은 빠르게 음질을 확인하는 테스트예요.",
    language: "Korean",
    speaker: "Sohee",
    instruct: "Speak warmly, clearly, and gently.",
  });
  const [designForm, setDesignForm] = useState({
    model_id: "",
    text: "장면 1\n오늘 회의는 여기서 끝내죠. 다들 자리에 남아 주세요.\n\n장면 2\n문이 닫히는 순간, 방 안 공기가 완전히 달라졌어.",
    language: "Korean",
    instruct:
      "Young Korean woman, calm and slightly cool. Very clear articulation, restrained emotion, but a faint warmth at the end of each sentence.",
    generation_mode: "voice_design",
    split_mode: "line",
    pause_ms: "350",
    speaker: "Sohee",
  });
  const [lastCustomRecord, setLastCustomRecord] = useState<GenerationRecord | null>(null);
  const [lastDesignRecord, setLastDesignRecord] = useState<GenerationRecord | null>(null);
  const [customControls, setCustomControls] = useState<GenerationControlsForm>(createGenerationControls("custom"));
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
  const [builderSource, setBuilderSource] = useState<CharacterBuilderSource>("upload");
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
  const [selectedDatasetAssetPaths, setSelectedDatasetAssetPaths] = useState<string[]>([]);
  const [selectedHistorySampleIds, setSelectedHistorySampleIds] = useState<string[]>([]);
  const [datasetForm, setDatasetForm] = useState({
    name: "",
    source_type: "voice_design_batch",
    speaker_name: "",
    ref_audio_path: "",
  });
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
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
  const [audioToolJobs, setAudioToolJobs] = useState<AudioToolJob[]>([]);
  const [voiceChangerModels, setVoiceChangerModels] = useState<VoiceChangerModelInfo[]>([]);
  const [audioEffectsView, setAudioEffectsView] = useState<AudioEffectsView>("explore");
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
    setAudioToolJobs(data.audio_tool_jobs || []);
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

  const customVoiceModels = models.filter((model) => model.category === "custom_voice");
  const customVoiceCapableModels = models.filter((model) => model.inference_mode === "custom_voice");
  const voiceDesignModels = models.filter((model) => model.category === "voice_design");
  const baseModels = models.filter((model) => model.category === "base_clone");
  const tokenizerModels = models.filter((model) => model.category === "tokenizer");
  const inferenceModels = models.filter((model) => model.inference_mode);
  const voiceDesignHistory = history.filter((item) => item.mode === "voice_design");
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
  const selectedCustomVoiceModel = customVoiceModels.find((model) => model.model_id === customForm.model_id) ?? preferredStockCustomVoiceModel ?? null;
  const customSpeakerOptions =
    selectedCustomVoiceModel?.available_speakers?.length ? selectedCustomVoiceModel.available_speakers : speakers.map((speaker) => speaker.speaker);
  const selectedInferenceModel = inferenceModels.find((model) => model.model_id === inferenceForm.model_id) ?? null;
  const selectedInferenceMode = selectedInferenceModel?.inference_mode ?? null;

  useEffect(() => {
    if (customVoiceModels.length > 0 && !customForm.model_id) {
      setCustomForm((prev) => ({ ...prev, model_id: preferredStockCustomVoiceModel?.model_id ?? prev.model_id }));
    }
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
  }, [customVoiceModels, customVoiceCapableModels, voiceDesignModels, baseModels, inferenceModels, tokenizerModels, customForm.model_id, designForm.model_id, selectedBaseModelId, inferenceForm.model_id, hybridForm.custom_model_id, runForm.init_model_path, runForm.speaker_encoder_model_path, runForm.tokenizer_model_path, preferredStockBaseModel, preferredStockCustomVoiceModel, preferredHybridCustomModel, preferredInferenceModel]);

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
    if (!customSpeakerOptions.length) {
      return;
    }
    if (!customSpeakerOptions.includes(customForm.speaker)) {
      setCustomForm((prev) => ({ ...prev, speaker: customSpeakerOptions[0] }));
    }
  }, [customSpeakerOptions, customForm.speaker]);

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

  const activeClonePrompt = builderSource === "design" ? selectedClonePrompt : uploadedClonePrompt;
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const selectedHybridPreset = presets.find((preset) => preset.id === selectedHybridPresetId) ?? null;
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const datasetReadyForTraining = Boolean(selectedDataset?.prepared_jsonl_path);
  const generatedAudioAssets = audioAssets.filter((asset) => asset.source === "generated");
  const selectableDatasetAssets = audioAssets.filter((asset) => asset.source === "generated" || asset.source === "upload");
  const finetunedModels = models.filter((model) => model.source === "finetuned");
  const stockModels = models.filter((model) => model.source === "stock" && model.inference_mode);
  const latestGeneratedRecord = history[0] ?? null;
  const audioToolCapabilityMap = new Map(audioToolCapabilities.map((capability) => [capability.key, capability]));
  const assetTextByPath = new Map(
    audioAssets.map((asset) => [asset.path, (asset.transcript_text || "").trim()]),
  );
  const soundEffectsAvailable = audioToolCapabilityMap.get("sound_effects")?.available ?? true;
  const voiceChangerAvailable = audioToolCapabilityMap.get("voice_changer")?.available ?? true;
  const audioSeparationAvailable = audioToolCapabilityMap.get("audio_separation")?.available ?? true;
  const pageMeta = PRODUCT_PAGES[activeTab];
  const soundEffectJobs = audioToolJobs.filter((job) => job.kind === "sound_effect");
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
    setCustomForm((prev) => ({
      ...prev,
      text: item.text || prev.text,
      instruct: item.instruction || prev.instruct,
      language: item.language || prev.language,
    }));
  }

  function applyDesignRecipe(item: { instruction?: string }) {
    setDesignForm((prev) => ({
      ...prev,
      instruct: item.instruction || prev.instruct,
    }));
  }

  function applyHybridRecipe(item: { instruction?: string }) {
    setHybridForm((prev) => ({
      ...prev,
      instruct: item.instruction || prev.instruct,
    }));
  }

  function applySoundEffectRecipe(prompt: string) {
    setSoundEffectForm((prev) => ({
      ...prev,
      prompt,
    }));
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

  async function handleCustomSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.generateCustomVoice({
        ...customForm,
        ...serializeGenerationControls(customControls),
      });
      setLastCustomRecord(result.record);
      await refreshAll();
      setMessage("빠른 샘플을 생성했습니다.");
    });
  }

  async function handleVoiceDesignSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.generateStoryStudio({
        model_id: designForm.model_id || undefined,
        text: designForm.text,
        language: designForm.language,
        instruct: designForm.instruct,
        generation_mode: designForm.generation_mode,
        split_mode: designForm.split_mode,
        pause_ms: Number(designForm.pause_ms || "350"),
        speaker: designForm.generation_mode === "custom_voice" ? designForm.speaker : undefined,
        ...serializeGenerationControls(designControls),
      });
      setLastDesignRecord(result.record);
      setSelectedDesignSampleId(result.record.id);
      await refreshAll();
      setMessage("장시간 대본 생성을 완료했습니다.");
    });
  }

  async function handleCreateCloneFromDesign() {
    if (!selectedDesignSampleId) {
      setMessage("먼저 디자인 샘플을 선택해주세요.");
      return;
    }
    if (!selectedBaseModelId) {
      setMessage("먼저 Base 모델을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.createCloneFromSample({
        generation_id: selectedDesignSampleId,
        model_id: selectedBaseModelId,
      });
      setBuilderSource("design");
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
      setBuilderSource("upload");
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
      language: selectedHybridPreset.language || prev.language,
      ref_audio_path: selectedHybridPreset.reference_audio_path,
      ref_text: selectedHybridPreset.reference_text,
    }));
  }, [selectedHybridPreset, preferredStockBaseModel]);

  async function handleGenerateFromPreset() {
    if (!selectedPresetId) {
      setMessage("프리셋을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      await api.generateFromPreset(selectedPresetId, {
        text: presetGenerateText,
        language: selectedPreset?.language ?? "",
        ...serializeGenerationControls(presetControls),
      });
      await refreshAll();
      setMessage("프리셋으로 음성을 생성했습니다.");
    });
  }

  async function handleCreateDataset(options?: { prepareAfterCreate?: boolean }) {
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
      let finalDataset = dataset;
      if (options?.prepareAfterCreate) {
        finalDataset = await api.prepareDataset(dataset.id, {
          tokenizer_model_path: runForm.tokenizer_model_path,
          device: health?.device ?? "cpu",
          simulate_only: runForm.simulate_only,
        });
      }
      setSelectedDatasetId(finalDataset.id);
      await refreshAll();
      setMessage(options?.prepareAfterCreate ? "데이터셋 생성과 학습 시작 준비를 함께 완료했습니다." : "데이터셋 JSONL 생성을 완료했습니다.");
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

  async function handlePrepareDataset() {
    if (!selectedDatasetId) {
      setMessage("데이터셋을 먼저 선택해주세요.");
      return;
    }
    await runAction(async () => {
      await api.prepareDataset(selectedDatasetId, {
        tokenizer_model_path: runForm.tokenizer_model_path,
        device: health?.device ?? "cpu",
        simulate_only: runForm.simulate_only,
      });
      await refreshAll();
      setMessage(runForm.simulate_only ? "학습 시작 전 점검용 파일 생성을 완료했습니다." : "학습 시작용 파일 생성을 완료했습니다.");
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

  function addHistorySample(record: GenerationRecord) {
    mergeDatasetSamples([
      {
        audio_path: record.output_audio_path,
        text: record.input_text,
        original_filename: basenameFromPath(record.output_audio_path),
      },
    ]);
  }

  function handleSelectDatasetRefAsset(asset: AudioAsset) {
    setDatasetForm((prev) => ({ ...prev, ref_audio_path: asset.path }));
    setMessage(`기준 음성으로 ${asset.filename}을(를) 선택했습니다.`);
  }

  function toggleDatasetAssetSelection(path: string) {
    setSelectedDatasetAssetPaths((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path],
    );
  }

  function toggleHistorySampleSelection(id: string) {
    setSelectedHistorySampleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
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

  function applySelectedDatasetAssets() {
    const selectedAssets = selectableDatasetAssets.filter((asset) => selectedDatasetAssetPaths.includes(asset.path));
    if (selectedAssets.length === 0) {
      setMessage("샘플로 추가할 서버 오디오를 먼저 체크해주세요.");
      return;
    }
    mergeDatasetSamples(
      selectedAssets.map((asset) => ({
        audio_path: asset.path,
        text: asset.transcript_text?.trim() || "",
        original_filename: asset.filename,
      })),
    );
    setSelectedDatasetAssetPaths([]);
    setMessage(`${selectedAssets.length}개 서버 오디오를 샘플 목록에 추가했습니다.`);
  }

  function applySelectedHistorySamples() {
    const selectedRecords = voiceDesignHistory.filter((record) => selectedHistorySampleIds.includes(record.id));
    if (selectedRecords.length === 0) {
      setMessage("가져올 생성 이력을 먼저 체크해주세요.");
      return;
    }
    mergeDatasetSamples(
      selectedRecords.map((record) => ({
        audio_path: record.output_audio_path,
        text: record.input_text,
        original_filename: basenameFromPath(record.output_audio_path),
      })),
    );
    setSelectedHistorySampleIds([]);
    setMessage(`${selectedRecords.length}개 생성 이력을 샘플 목록에 추가했습니다.`);
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
      setMessage("hybrid 추론에는 Base 모델, CustomVoice 모델, 참조 음성이 모두 필요합니다.");
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

  function handleSelectHybridAsset(asset: AudioAsset) {
    setHybridForm((prev) => ({
      ...prev,
      ref_audio_path: asset.path,
      ref_text: asset.transcript_text?.trim() || prev.ref_text,
    }));
    setMessage(`hybrid 참조 음성으로 ${asset.filename}을(를) 선택했습니다.`);
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
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">제품</span>
            <button className={activeTab === "custom" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("custom")} type="button">
              <span>빠르게 들어보기</span>
            </button>
            <button className={activeTab === "character" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("character")} type="button">
              <span>목소리 복제</span>
            </button>
            <button className={activeTab === "design" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("design")} type="button">
              <span>스토리 스튜디오</span>
            </button>
            <button className={activeTab === "hybrid" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("hybrid")} type="button">
              <span>스타일 프리셋 + 말투 지시</span>
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
            <span className="sidebar__section-title">실험 / 개발</span>
            <button className={activeTab === "finetune" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("finetune")} type="button">
              <span>훈련 랩</span>
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
                <p>텍스트 음성 변환, 음성 복제, 사운드 효과, 오디오 분리, 학습까지 한 화면 구조 안에서 정리했습니다.</p>
              </div>
              <div className="spotlight-grid">
                <SpotlightCard
                  eyebrow="빠른 시작"
                  title="빠르게 들어보기"
                  description="기본 CustomVoice로 짧게 미리 들어봅니다."
                  actionLabel="빠르게 들어보기"
                  onAction={() => setActiveTab("custom")}
                />
                <SpotlightCard
                  eyebrow="복제"
                  title="목소리 복제"
                  description="참조 음성에서 스타일을 추출하고 저장합니다."
                  actionLabel="목소리 복제"
                  onAction={() => setActiveTab("character")}
                />
                <SpotlightCard
                  eyebrow="효과"
                  title="텍스트 음성 변환"
                  description="모델을 직접 골라 원하는 문장을 음성으로 만듭니다."
                  actionLabel="텍스트 음성 변환"
                  onAction={() => setActiveTab("custom")}
                />
                <SpotlightCard
                  eyebrow="분리"
                  title="오디오 분리"
                  description="업로드한 파일에서 보컬과 반주를 가볍게 분리합니다."
                  actionLabel="오디오 분리"
                  onAction={() => setActiveTab("separation")}
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
              <h2>저장된 프리셋</h2>
              <p>저장해 둔 스타일을 다시 불러옵니다.</p>
              <div className="preset-list">
                {presets.length ? presets.map((preset) => (
                  <article className="preset-card" key={preset.id}>
                    <strong>{preset.name}</strong>
                    <span>{formatDate(preset.created_at)}</span>
                    <p>{preset.reference_text}</p>
                    <div className="button-row">
                      <button className="secondary-button" onClick={() => { setSelectedPresetId(preset.id); setSelectedHybridPresetId(preset.id); setActiveTab("character"); }} type="button">
                        프리셋 열기
                      </button>
                      <button className="secondary-button" onClick={() => { setSelectedHybridPresetId(preset.id); setActiveTab("hybrid"); }} type="button">
                        스타일 실험 열기
                      </button>
                    </div>
                  </article>
                )) : <p className="field-hint">아직 저장된 프리셋이 없습니다.</p>}
              </div>
            </section>

            <section className="panel">
              <h2>최근 생성 음성</h2>
              <p>최근 만든 음성을 바로 다시 사용할 수 있습니다.</p>
              <div className="history-list">
                {generatedAudioAssets.slice(0, 10).map((asset) => (
                  <article className="history-item" key={asset.id}>
                    <button className="history-item__button" onClick={() => setActiveTab("custom")} type="button">
                      <strong>{asset.filename}</strong>
                      <span>{asset.text_preview || "생성된 음성"}</span>
                      <small>{asset.created_at ? formatDate(asset.created_at) : "-"}</small>
                    </button>
                    <a className="history-item__download" href={asset.url} download={asset.filename}>
                      다운로드
                    </a>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="panel-grid">
            <section className="panel">
              <h2>Fine-tuned 체크포인트</h2>
              <div className="preset-list">
                {finetunedModels.length ? finetunedModels.map((model) => (
                  <article className="preset-card" key={model.key}>
                    <strong>{getModelDisplayLabel(model)}</strong>
                    <span>{model.category === "custom_voice_finetuned" ? "CustomVoice" : "Base"}</span>
                    <p>{model.default_speaker ? `${model.default_speaker} 화자 포함` : "추론용 체크포인트"}</p>
                    <button className="secondary-button" onClick={() => { setInferenceForm((prev) => ({ ...prev, model_id: model.model_id })); setActiveTab("custom"); }} type="button">
                      모델 선택 추론에서 열기
                    </button>
                  </article>
                )) : <p className="field-hint">아직 fine-tuned 체크포인트가 없습니다.</p>}
              </div>
            </section>

            <section className="panel">
              <h2>데이터셋 라이브러리</h2>
              <div className="preset-list">
                {datasets.length ? datasets.map((dataset) => (
                  <article className="preset-card" key={dataset.id}>
                    <strong>{dataset.name}</strong>
                    <span>{dataset.sample_count}개 샘플</span>
                    <p>{dataset.speaker_name} 화자 기준 데이터셋</p>
                    <button className="secondary-button" onClick={() => { setSelectedDatasetId(dataset.id); setActiveTab("finetune"); }} type="button">
                      학습 화면에서 열기
                    </button>
                  </article>
                )) : <p className="field-hint">아직 데이터셋이 없습니다.</p>}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "custom" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <form className="panel" onSubmit={handleCustomSubmit}>
              <h2>빠르게 들어보기</h2>
              <p className="field-hint">짧은 문장으로 음질과 화자 톤을 빠르게 확인합니다. 스타일 지시는 영어로 적어주세요.</p>
              <RecipeBar title="빠른 미리듣기 템플릿" items={CUSTOM_RECIPES} onApply={applyCustomRecipe} />
              <div className="field-row">
                <label>
                  CustomVoice 모델
                  <select
                    value={customForm.model_id}
                    onChange={(event) => {
                      const nextModelId = event.target.value;
                      const nextModel = customVoiceModels.find((model) => model.model_id === nextModelId) ?? null;
                      setCustomForm((prev) => ({
                        ...prev,
                        model_id: nextModelId,
                        speaker: nextModel?.default_speaker || nextModel?.available_speakers?.[0] || prev.speaker,
                      }));
                    }}
                  >
                    {customVoiceModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  언어
                  <LanguageSelect
                    value={customForm.language}
                    onChange={(language) => setCustomForm({ ...customForm, language })}
                  />
                </label>
                {customSpeakerOptions.length ? (
                  <label>
                    화자
                    <select
                      value={customForm.speaker}
                      onChange={(event) => setCustomForm({ ...customForm, speaker: event.target.value })}
                    >
                      {customSpeakerOptions.map((speaker) => (
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
                <textarea
                  value={customForm.text}
                  onChange={(event) => setCustomForm({ ...customForm, text: event.target.value })}
                />
              </label>
              <label>
                스타일 지시
                <textarea
                  placeholder="Write this in English. Example: Calm, clean, and natural. Warm but restrained."
                  value={customForm.instruct}
                  onChange={(event) => setCustomForm({ ...customForm, instruct: event.target.value })}
                />
              </label>
              <GenerationControlsEditor value={customControls} onChange={setCustomControls} />
              <button className="primary-button" disabled={loading} type="submit">
                빠르게 생성
              </button>
            </form>

            <aside className="panel">
              <h3>선택 가능한 화자</h3>
              <p className="field-hint">화자 선택형 모델에서만 화자를 고를 수 있습니다.</p>
              <div className="speaker-list">
                {customSpeakerOptions.map((speakerName) => {
                  const info = speakers.find((speaker) => speaker.speaker === speakerName);
                  return (
                    <div className="speaker-card" key={speakerName}>
                      <strong>{speakerName}</strong>
                      <span>{info?.nativeLanguage || "speaker"}</span>
                      <p>{info?.description || "이 모델에서 사용할 수 있는 화자입니다."}</p>
                    </div>
                  );
                })}
              </div>
              {lastCustomRecord ? <AudioCard title="방금 만든 빠른 샘플" record={lastCustomRecord} /> : null}
            </aside>
          </div>

          <div className="panel-grid">
            <form className="panel inference-panel" onSubmit={handleModelInferenceSubmit}>
              <div className="result-card__header">
                <div>
                  <span className="eyebrow eyebrow--soft">Text To Speech</span>
                  <h2>텍스트 음성 변환</h2>
                  <p>모델을 직접 골라 대사를 생성합니다. 스타일 지시와 사운드 효과 프롬프트는 영어로 적어주세요.</p>
                </div>
              </div>
              <div className="field-row">
                <label>
                  모델
                  <select
                    value={inferenceForm.model_id}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, model_id: event.target.value }))}
                  >
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
                  <LanguageSelect
                    value={inferenceForm.language}
                    onChange={(language) => setInferenceForm((prev) => ({ ...prev, language }))}
                  />
                </label>
                {selectedInferenceModel?.available_speakers?.length ? (
                  <label>
                    화자
                    <select
                      value={inferenceForm.speaker}
                      onChange={(event) => setInferenceForm((prev) => ({ ...prev, speaker: event.target.value }))}
                    >
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
                <textarea
                  value={inferenceForm.text}
                  onChange={(event) => setInferenceForm((prev) => ({ ...prev, text: event.target.value }))}
                />
              </label>
              {selectedInferenceModel?.supports_instruction ? (
                <label>
                  스타일 지시
                  <textarea
                    placeholder="Write this in English."
                    value={inferenceForm.instruct}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))}
                  />
                </label>
              ) : null}
              {selectedInferenceMode === "voice_clone" ? (
                <>
                  <label>
                    참조 음성
                    <input
                      value={inferenceForm.ref_audio_path}
                      onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))}
                    />
                  </label>
                  <label>
                    참조 문장
                    <textarea
                      value={inferenceForm.ref_text}
                      onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_text: event.target.value }))}
                    />
                  </label>
                </>
              ) : null}
              <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
              <button className="primary-button" disabled={loading || !selectedInferenceModel} type="submit">
                텍스트 음성 생성
              </button>
            </form>

            <aside className="panel inference-side">
              <h3>선택한 모델 안내</h3>
              {selectedInferenceModel ? (
                <article className="status-card status-card--ready">
                  <strong>{getModelDisplayLabel(selectedInferenceModel)}</strong>
                  <p>{selectedInferenceModel.notes}</p>
                  <div className="audio-card__meta">
                    <span>{selectedInferenceModel.source === "stock" ? "기본 모델" : "학습된 모델"}</span>
                    <span>{selectedInferenceMode === "voice_clone" ? "참조 음성 필요" : selectedInferenceMode === "custom_voice" ? "화자 선택 가능" : "설명문 기반"}</span>
                  </div>
                </article>
              ) : (
                <div className="result-card result-card--empty">
                  <strong>모델을 선택하세요</strong>
                  <p>빠르게 들어보기 아래에서 바로 원하는 모델로 텍스트 음성 변환을 실행할 수 있습니다.</p>
                </div>
              )}
              {selectedInferenceMode === "voice_clone" ? (
                <ServerAudioPicker assets={generatedAudioAssets} selectedPath={inferenceForm.ref_audio_path} onSelect={handleSelectInferenceAsset} />
              ) : null}
              {lastInferenceRecord ? <AudioCard title="방금 생성한 텍스트 음성" record={lastInferenceRecord} /> : null}
            </aside>
          </div>
        </section>
      ) : null}

      {activeTab === "design" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleVoiceDesignSubmit}>
            <h2>스토리 스튜디오</h2>
            <p className="field-hint">장시간 대본, 장면 지시, 캐릭터 톤을 함께 다루는 화면입니다.</p>
            <RecipeBar title="장면 지시 템플릿" items={DESIGN_RECIPES} onApply={applyDesignRecipe} />
            <div className="field-row">
              <label>
                생성 방식
                <select
                  value={designForm.generation_mode}
                  onChange={(event) => setDesignForm({ ...designForm, generation_mode: event.target.value })}
                >
                  <option value="voice_design">Voice Design</option>
                  <option value="custom_voice">CustomVoice</option>
                </select>
              </label>
              <label>
                모델
                <select
                  value={designForm.model_id}
                  onChange={(event) => setDesignForm({ ...designForm, model_id: event.target.value })}
                >
                  {(designForm.generation_mode === "custom_voice" ? customVoiceModels : voiceDesignModels).map((model) => (
                    <option key={model.key} value={model.model_id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                분할 방식
                <select
                  value={designForm.split_mode}
                  onChange={(event) => setDesignForm({ ...designForm, split_mode: event.target.value })}
                >
                  <option value="line">줄마다</option>
                  <option value="paragraph">문단마다</option>
                </select>
              </label>
              <label>
                문장 사이 간격(ms)
                <input
                  value={designForm.pause_ms}
                  onChange={(event) => setDesignForm({ ...designForm, pause_ms: event.target.value })}
                />
              </label>
            </div>
            {designForm.generation_mode === "custom_voice" ? (
              <label>
                화자
                <select
                  value={designForm.speaker}
                  onChange={(event) => setDesignForm({ ...designForm, speaker: event.target.value })}
                >
                  {speakers.map((speaker) => (
                    <option key={speaker.speaker} value={speaker.speaker}>
                      {speaker.speaker}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              스타일 지시
              <textarea
                placeholder="Write this in English. Example: Young Korean woman, calm and slightly cool..."
                value={designForm.instruct}
                onChange={(event) => setDesignForm({ ...designForm, instruct: event.target.value })}
              />
            </label>
            <label>
              대본
              <textarea
                className="bulk-path-textarea"
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
            <GenerationControlsEditor value={designControls} onChange={setDesignControls} />
            <button className="primary-button" disabled={loading} type="submit">
              장면 음성 생성
            </button>
          </form>

          <aside className="panel">
            <h3>스토리 스튜디오 기록</h3>
            <p className="field-hint">긴 대본은 줄마다 또는 문단마다 잘라 순서대로 합성한 뒤 하나의 오디오로 묶습니다.</p>
              <div className="history-list">
                {voiceDesignHistory.slice(0, 6).map((record) => (
                  <article
                    key={record.id}
                    className={record.id === selectedDesignSampleId ? "history-item is-selected" : "history-item"}
                  >
                    <button className="history-item__button" onClick={() => setSelectedDesignSampleId(record.id)} type="button">
                      <strong>{getAudioDownloadName(record)}</strong>
                      <span>{record.input_text.slice(0, 60)}</span>
                    </button>
                    <a
                      className="history-item__download"
                      href={record.output_audio_url}
                      download={getAudioDownloadName(record)}
                    >
                      다운로드
                    </a>
                  </article>
                ))}
              </div>
            {lastDesignRecord ? (
              <AudioCard
                title="방금 생성한 장면 음성"
                subtitle="장면 지시와 대본을 함께 적용한 결과"
                record={lastDesignRecord}
              />
            ) : null}
          </aside>
        </section>
      ) : null}

      {activeTab === "character" ? (
        <section className="workspace workspace--stacked">
          <section className="panel builder-panel">
            <div className="builder-header">
              <div>
                <span className="eyebrow eyebrow--soft">목소리 복제</span>
                <h2>참조 음성에서 스타일을 추출하고 프리셋으로 저장</h2>
                <p>업로드 음성은 자동으로 Whisper 전사를 채우고, 필요하면 직접 수정한 뒤 스타일 자산으로 저장할 수 있습니다.</p>
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

            <div className="source-toggle">
              <button
                className={builderSource === "upload" ? "tab is-active" : "tab"}
                onClick={() => setBuilderSource("upload")}
                type="button"
              >
                <span>참조 음성 파일</span>
              </button>
              <button
                className={builderSource === "design" ? "tab is-active" : "tab"}
                onClick={() => setBuilderSource("design")}
                type="button"
              >
                <span>Voice Design 결과</span>
              </button>
            </div>

            <div className="builder-grid">
              <section className="step-card">
                <span className="step-card__index">1</span>
                <h3>참조 소스 선택</h3>
                {builderSource === "upload" ? (
                  <>
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
                        업로드 음성에서 스타일 추출
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label>
                      Voice Design 샘플 선택
                      <select
                        value={selectedDesignSampleId}
                        onChange={(event) => setSelectedDesignSampleId(event.target.value)}
                      >
                        <option value="">선택하세요</option>
                        {voiceDesignHistory.map((record) => (
                          <option key={record.id} value={record.id}>
                            {record.id} · {record.input_text.slice(0, 24)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="history-list compact-list">
                      {voiceDesignHistory.slice(0, 4).map((record) => (
                        <article
                          key={record.id}
                          className={record.id === selectedDesignSampleId ? "history-item is-selected" : "history-item"}
                        >
                          <button
                            className="history-item__button"
                            onClick={() => setSelectedDesignSampleId(record.id)}
                            type="button"
                          >
                            <strong>{getAudioDownloadName(record)}</strong>
                            <span>{record.input_text.slice(0, 80)}</span>
                          </button>
                          <a
                            className="history-item__download"
                            href={record.output_audio_url}
                            download={getAudioDownloadName(record)}
                          >
                            다운로드
                          </a>
                        </article>
                      ))}
                    </div>
                    <button className="primary-button" onClick={handleCreateCloneFromDesign} type="button">
                      디자인 샘플에서 스타일 추출
                    </button>
                  </>
                )}
              </section>

              <section className="step-card">
                <span className="step-card__index">2</span>
                <PromptSummaryCard
                  title={builderSource === "upload" ? "업로드 스타일 자산" : "디자인 스타일 자산"}
                  prompt={activeClonePrompt}
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
                  disabled={!activeClonePrompt}
                  onClick={() => void handleCreatePreset(builderSource)}
                  type="button"
                >
                  현재 스타일로 프리셋 저장
                </button>
              </section>
            </div>
          </section>

          <div className="panel-grid">
            <section className="panel">
              <h2>저장된 프리셋으로 반복 합성</h2>
              <label>
                프리셋 선택
                <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPreset ? (
                <div className="source-summary">
                  <span className="meta-label">선택한 스타일</span>
                  <strong>{selectedPreset.name}</strong>
                  <span>{getPresetSourceLabel(selectedPreset.source_type)}</span>
                  <p>{selectedPreset.reference_text}</p>
                </div>
              ) : null}
              <label>
                새 대사
                <textarea value={presetGenerateText} onChange={(event) => setPresetGenerateText(event.target.value)} />
              </label>
              <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
              <button className="primary-button" onClick={handleGenerateFromPreset} type="button">
                프리셋으로 생성
              </button>
            </section>

            <section className="panel">
              <h2>스타일 라이브러리</h2>
              <div className="preset-list">
                {presets.map((preset) => (
                  <article
                    className={preset.id === selectedPresetId ? "preset-card preset-card--selected" : "preset-card"}
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{getPresetSourceLabel(preset.source_type)}</span>
                    <p>{preset.reference_text}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "hybrid" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <form className="panel inference-panel" onSubmit={handleHybridInferenceSubmit}>
              <div className="result-card__header">
                <div>
                  <span className="eyebrow eyebrow--soft">Style Layer</span>
                  <h2>스타일 프리셋 + 말투 지시</h2>
                  <p>저장한 스타일을 불러온 뒤, 그 위에 영어 스타일 지시를 덧씌워 결과 차이를 확인합니다.</p>
                </div>
              </div>
              <RecipeBar title="영어 스타일 템플릿" items={HYBRID_RECIPES} onApply={applyHybridRecipe} />

              <label>
                스타일 프리셋
                <select value={selectedHybridPresetId} onChange={(event) => setSelectedHybridPresetId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedHybridPreset ? (
                <div className="source-summary">
                  <span className="meta-label">현재 스타일 소스</span>
                  <strong>{selectedHybridPreset.name}</strong>
                  <span>{getPresetSourceLabel(selectedHybridPreset.source_type)}</span>
                  <p>{selectedHybridPreset.reference_text}</p>
                </div>
              ) : (
                <p className="field-hint">프리셋이 없으면 아래에서 참조 음성을 직접 골라 스타일 소스를 채우세요.</p>
              )}

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
                <textarea
                  value={hybridForm.text}
                  onChange={(event) => setHybridForm((prev) => ({ ...prev, text: event.target.value }))}
                />
              </label>
              <label>
                스타일 지시
                <textarea
                  placeholder="Write this in English."
                  value={hybridForm.instruct}
                  onChange={(event) => setHybridForm((prev) => ({ ...prev, instruct: event.target.value }))}
                />
              </label>
              <div className="field-row">
                <label>
                  언어
                  <LanguageSelect
                    value={hybridForm.language}
                    onChange={(language) => setHybridForm((prev) => ({ ...prev, language }))}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={hybridForm.x_vector_only_mode}
                    onChange={(event) => setHybridForm((prev) => ({ ...prev, x_vector_only_mode: event.target.checked }))}
                  />
                  빠른 음색 추출 모드
                </label>
              </div>
              <p className="field-hint">프리셋을 고르면 기준 음성과 참조 문장이 자동으로 채워집니다.</p>
              <label>
                기준 음성 경로
                <input
                  value={hybridForm.ref_audio_path}
                  onChange={(event) => setHybridForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))}
                />
              </label>
              <label>
                기준 음성 문장
                <textarea
                  value={hybridForm.ref_text}
                  onChange={(event) => setHybridForm((prev) => ({ ...prev, ref_text: event.target.value }))}
                />
              </label>

              <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
              <button className="primary-button" disabled={loading} type="submit">
                hybrid 추론 실행
              </button>
            </form>

            <aside className="panel inference-side">
              <h3>Hybrid 스타일 자산 확인</h3>
              <p className="field-hint">프리셋이 없을 때만 아래에서 참조 음성을 직접 골라 스타일 소스를 채우세요.</p>
              <ServerAudioPicker
                assets={generatedAudioAssets}
                selectedPath={hybridForm.ref_audio_path}
                onSelect={handleSelectHybridAsset}
              />
              {lastHybridRecord ? (
                <AudioCard title="방금 생성한 hybrid 결과" subtitle={lastHybridRecord.mode} record={lastHybridRecord} />
              ) : null}
            </aside>
          </div>
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
              <div className="sound-effects-tabs">
                <button
                  className={audioEffectsView === "explore" ? "sound-effects-tab is-active" : "sound-effects-tab"}
                  onClick={() => setAudioEffectsView("explore")}
                  type="button"
                >
                  탐색
                </button>
                <button
                  className={audioEffectsView === "history" ? "sound-effects-tab is-active" : "sound-effects-tab"}
                  onClick={() => setAudioEffectsView("history")}
                  type="button"
                >
                  히스토리
                </button>
              </div>
            </div>

            <div className="sound-effects-search">
              <input
                placeholder="효과음 검색"
                value={audioEffectsSearch}
                onChange={(event) => setAudioEffectsSearch(event.target.value)}
              />
            </div>

            {audioEffectsView === "explore" ? (
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
            ) : (
              <div className="sound-effects-list">
                {soundEffectJobs.length ? soundEffectJobs.map((job) => (
                  <article className="sound-effects-row" key={job.id}>
                    <div className="sound-effects-row__main">
                      <span className="sound-effects-dot sound-effects-dot--history" />
                      <div>
                        <strong>{getAudioToolJobDisplayTitle(job)}</strong>
                        <p>{formatDate(job.created_at)}</p>
                      </div>
                    </div>
                    <div className="sound-effects-row__player">
                      <span>{job.artifacts[0] ? "완료" : "-"}</span>
                      <MiniWaveform dense />
                      {job.artifacts[0] ? (
                        <a className="icon-button icon-button--link" href={job.artifacts[0].url} download={job.artifacts[0].filename}>
                          다운로드
                        </a>
                      ) : (
                        <button className="icon-button" disabled type="button">
                          없음
                        </button>
                      )}
                    </div>
                  </article>
                )) : (
                  <div className="sound-effects-empty">아직 생성한 효과음이 없습니다.</div>
                )}
              </div>
            )}

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
              <p>Applio 기반 RVC 변환을 사용합니다. 경로를 직접 쓰지 않고 서버가 찾은 모델만 선택합니다.</p>
              {!voiceChangerAvailable ? <p className="field-hint">Applio 또는 RVC 모델이 준비되지 않았습니다.</p> : null}
              <div className="field-row">
                <label>
                  RVC 모델
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
                  피치 이동
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
                  F0 방식
                  <select value={voiceChangerForm.f0_method} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: event.target.value })}>
                    <option value="rmvpe">rmvpe</option>
                    <option value="fcpe">fcpe</option>
                    <option value="crepe">crepe</option>
                  </select>
                </label>
                <label>
                  Index rate
                  <input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                </label>
                <label>
                  Protect
                  <input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Clean strength
                  <input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                </label>
                <label>
                  Embedder
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

          <section className="panel">
            <h2>최근 보이스 체인저 결과</h2>
            <div className="history-list">
              {audioToolJobs.filter((job) => job.kind === "voice_changer").map((job) => (
                <article className="history-item" key={job.id}>
                  <button className="history-item__button" type="button">
                    <strong>{getAudioToolJobDisplayTitle(job)}</strong>
                    <span>{formatDate(job.created_at)}</span>
                    <small>{job.message}</small>
                  </button>
                  {job.artifacts[0] ? <a className="history-item__download" href={job.artifacts[0].url} download={job.artifacts[0].filename}>다운로드</a> : null}
                </article>
              ))}
            </div>
            {lastAudioToolResult?.kind === "voice_changer" && lastAudioToolResult.record ? <AudioCard title="방금 변환한 결과" record={lastAudioToolResult.record} /> : null}
          </section>
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
              <p>선택한 오디오를 harmonic / percussive 두 갈래로 분리합니다.</p>
              {!audioSeparationAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <button className="primary-button" disabled={loading || !audioConvertForm.audio_path || !audioSeparationAvailable} type="submit">
                분리 실행
              </button>
            </form>
          </div>

          <section className="panel">
            <h2>최근 오디오 분리 결과</h2>
            <div className="history-list">
              {audioToolJobs.filter((job) => job.kind === "audio_separation").map((job) => (
                <article className="history-item" key={job.id}>
                  <button className="history-item__button" type="button">
                    <strong>{getAudioToolJobDisplayTitle(job)}</strong>
                    <span>{formatDate(job.created_at)}</span>
                    <small>{job.message}</small>
                  </button>
                  {job.artifacts[0] ? <a className="history-item__download" href={job.artifacts[0].url} download={job.artifacts[0].filename}>다운로드</a> : null}
                </article>
              ))}
            </div>
            {lastAudioToolResult?.kind === "audio_separation" && lastAudioToolResult.assets?.length ? (
              <div className="preset-list">
                {lastAudioToolResult.assets.map((asset) => (
                  <article className="preset-card" key={`${asset.path}-${asset.label}`}>
                    <strong>{asset.label}</strong>
                    <audio controls className="audio-card__player" src={asset.url} />
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "finetune" ? (
        <section className="workspace workspace--stacked">
          <section className="panel finetune-flow">
            <div className="finetune-header">
              <div>
                <span className="eyebrow eyebrow--soft">훈련 랩</span>
                <h2>데이터셋 만들기부터 학습 실행까지 한 흐름으로 정리</h2>
                <p>기준 음성을 정하고, 샘플을 채운 뒤, 데이터셋 생성과 학습 준비를 순서대로 진행하세요.</p>
              </div>
              <div className="finetune-steps">
                <span className="finetune-step-chip">1. 기준 음성</span>
                <span className="finetune-step-chip">2. 샘플 편집</span>
                <span className="finetune-step-chip">3. 데이터셋 생성</span>
                <span className="finetune-step-chip">4. 학습 실행</span>
              </div>
            </div>

            <section className="finetune-stage">
              <div className="finetune-stage__header">
                <div>
                  <span className="step-card__index">1</span>
                  <h3>기준 음성 경로 입력</h3>
                </div>
                <p>이 화면은 파일 업로드 대신 경로 입력을 기본으로 사용합니다. 기준 음성 하나를 먼저 정하고, 나머지 샘플이 그 화자를 따라가게 만드세요.</p>
              </div>
              <div className="field-row">
                <label>
                  데이터셋 이름
                  <input
                    value={datasetForm.name}
                    onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })}
                  />
                </label>
                <label>
                  화자 이름
                  <input
                    value={datasetForm.speaker_name}
                    onChange={(event) => setDatasetForm({ ...datasetForm, speaker_name: event.target.value })}
                  />
                </label>
              </div>
              <article className="status-card">
                <strong>권장 폴더 구조</strong>
                <p>`/dataset-root/ref/ref.wav`를 기준 음성으로 두고, 샘플은 `/dataset-root/wavs/0001.wav`, `/dataset-root/wavs/0002.wav`처럼 모아두는 구성을 권장합니다.</p>
                <p>텍스트 파일을 같이 정리할 때는 `/dataset-root/text/0001.txt`, `/dataset-root/text/0002.txt`처럼 같은 파일명을 맞춰 두면 검수하기 쉽습니다. WEB UI가 로컬 폴더를 직접 읽지는 않으므로, 아래에 절대 경로나 프로젝트 기준 경로를 입력해주세요.</p>
              </article>
              <label>
                기준 음성 경로
                <input
                  placeholder="예: D:/my_tts_dataset/mai/ref/ref.wav 또는 data/uploads/ref.wav"
                  value={datasetForm.ref_audio_path}
                  onChange={(event) =>
                    setDatasetForm({ ...datasetForm, ref_audio_path: normalizeDatasetPath(event.target.value) })
                  }
                />
              </label>
              <details className="advanced-inline">
                <summary>서버에 있는 오디오에서 기준 음성 고르기</summary>
                <div className="selection-checklist">
                  {selectableDatasetAssets.map((asset) => (
                    <label
                      className={asset.path === datasetForm.ref_audio_path ? "selection-checklist__item is-selected" : "selection-checklist__item"}
                      key={`dataset-ref-${asset.id}`}
                    >
                      <input
                        checked={asset.path === datasetForm.ref_audio_path}
                        name="dataset-ref-audio"
                        onChange={() => handleSelectDatasetRefAsset(asset)}
                        type="radio"
                      />
                      <div>
                        <strong>{asset.filename}</strong>
                        <span>{asset.created_at ? formatDate(asset.created_at) : "저장된 오디오"}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </details>

              {datasetForm.ref_audio_path ? (
                <article className="selected-audio-card">
                  <span className="meta-label">현재 선택된 기준 음성</span>
                  <strong>{basenameFromPath(datasetForm.ref_audio_path)}</strong>
                  <p>이 경로의 오디오가 전체 데이터셋의 대표 화자로 사용됩니다.</p>
                  <audio controls className="audio-card__player" src={fileUrlFromPath(datasetForm.ref_audio_path)} />
                </article>
              ) : null}

              <details className="advanced-inline">
                <summary>고급 분류 설정</summary>
                <label>
                  데이터 출처
                  <select
                    value={datasetForm.source_type}
                    onChange={(event) => setDatasetForm({ ...datasetForm, source_type: event.target.value })}
                  >
                    <option value="voice_design_batch">Voice Design 샘플 묶음</option>
                    <option value="uploaded_audio_batch">직접 업로드한 음성 묶음</option>
                  </select>
                </label>
              </details>
            </section>

            <section className="finetune-stage">
              <div className="finetune-stage__header">
                <div>
                  <span className="step-card__index">2</span>
                  <h3>학습 샘플 경로 정리</h3>
                </div>
                <p>샘플은 경로로 입력합니다. 경로 여러 개를 붙여넣거나, 서버에 있는 음성을 체크해서 한 번에 목록으로 가져오세요.</p>
              </div>
              <article className="status-card">
                <strong>경로 입력 형식</strong>
                <p>한 줄에 하나씩 적고, 필요하면 `|` 뒤에 텍스트를 같이 붙이세요. 텍스트를 비우면 데이터셋을 만들 때 자동 전사를 시도합니다.</p>
                <p>예시: `D:/my_tts_dataset/mai/wavs/0001.wav | 안녕하세요. 반갑습니다.`</p>
                <p>예시: `D:/my_tts_dataset/mai/wavs/0002.wav`</p>
              </article>
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
              </div>
              <details className="advanced-inline">
                <summary>서버 오디오를 체크해서 한 번에 가져오기</summary>
                <div className="selection-checklist">
                  {selectableDatasetAssets.map((asset) => (
                    <label
                      className={selectedDatasetAssetPaths.includes(asset.path) ? "selection-checklist__item is-selected" : "selection-checklist__item"}
                      key={`dataset-asset-${asset.id}`}
                    >
                      <input
                        checked={selectedDatasetAssetPaths.includes(asset.path)}
                        onChange={() => toggleDatasetAssetSelection(asset.path)}
                        type="checkbox"
                      />
                      <div>
                        <strong>{asset.filename}</strong>
                        <span>{asset.created_at ? formatDate(asset.created_at) : "저장된 오디오"}</span>
                        {asset.transcript_text ? <small>{asset.transcript_text}</small> : null}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="button-row">
                  <button className="secondary-button" onClick={applySelectedDatasetAssets} type="button">
                    체크한 오디오를 샘플 목록에 추가
                  </button>
                </div>
              </details>
              <details className="advanced-inline">
                <summary>최근 생성 이력을 체크해서 한 번에 가져오기</summary>
                <div className="selection-checklist">
                  {voiceDesignHistory.slice(0, 12).map((record) => (
                    <label
                      className={selectedHistorySampleIds.includes(record.id) ? "selection-checklist__item is-selected" : "selection-checklist__item"}
                      key={`dataset-history-${record.id}`}
                    >
                      <input
                        checked={selectedHistorySampleIds.includes(record.id)}
                        onChange={() => toggleHistorySampleSelection(record.id)}
                        type="checkbox"
                      />
                      <div>
                        <strong>{getRecordDisplayTitle(record)}</strong>
                        <span>{formatDate(record.created_at)}</span>
                        <small>{record.input_text}</small>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="button-row">
                  <button className="secondary-button" onClick={applySelectedHistorySamples} type="button">
                    체크한 생성 이력을 샘플 목록에 추가
                  </button>
                </div>
              </details>

              <div className="sample-builder">
                {datasetSamples.map((sample, index) => (
                  <article className="sample-card" key={`sample-${index}`}>
                    <div className="sample-card__header">
                      <div>
                        <strong>샘플 {index + 1}</strong>
                        <span>
                          {!sample.audio_path
                            ? "오디오 필요"
                            : sample.text?.trim()
                              ? "텍스트 있음"
                              : "전사 가능"}
                        </span>
                      </div>
                      <div className="sample-card__actions">
                        <button
                          className="secondary-button"
                          disabled={!sample.audio_path.trim()}
                          onClick={() => void handleTranscribeDatasetSample(index)}
                          type="button"
                        >
                          {sample.text?.trim() ? "다시 전사" : "이 샘플 전사"}
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
                        onChange={(event) =>
                          updateDatasetSample(index, {
                            audio_path: normalizeDatasetPath(event.target.value),
                            original_filename: basenameFromPath(event.target.value),
                          })
                        }
                      />
                    </label>

                    {sample.audio_path ? (
                      <article className="selected-audio-card selected-audio-card--sample">
                        <span className="meta-label">현재 선택된 샘플 오디오</span>
                        <strong>{sample.original_filename || basenameFromPath(sample.audio_path)}</strong>
                        <audio controls className="audio-card__player" src={fileUrlFromPath(sample.audio_path)} />
                      </article>
                    ) : null}

                    <label>
                      샘플 텍스트
                      <textarea
                        placeholder="비워두면 데이터셋 생성 시 Whisper 자동 전사"
                        value={sample.text ?? ""}
                        onChange={(event) => updateDatasetSample(index, { text: event.target.value })}
                      />
                    </label>
                  </article>
                ))}
              </div>

              <div className="button-row">
                <button className="secondary-button" onClick={addSampleRow} type="button">
                  빈 샘플 행 추가
                </button>
                <button className="secondary-button" onClick={handleTranscribeAllDatasetSamples} type="button">
                  빈 텍스트만 자동 전사
                </button>
              </div>

              <div className="sample-suggestions">
                <h4>최근 디자인 샘플 바로 가져오기</h4>
                <div className="history-list">
                  {voiceDesignHistory.slice(0, 4).map((record) => (
                    <article className="history-item" key={record.id}>
                      <button className="history-item__button" onClick={() => addHistorySample(record)} type="button">
                        <strong>{getAudioDownloadName(record)}</strong>
                        <span>{record.input_text.slice(0, 42)}</span>
                      </button>
                      <a
                        className="history-item__download"
                        href={record.output_audio_url}
                        download={getAudioDownloadName(record)}
                      >
                        다운로드
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="finetune-stage">
              <div className="finetune-stage__header">
                <div>
                  <span className="step-card__index">3</span>
                  <h3>데이터셋 만들기</h3>
                </div>
                <p>샘플이 준비되면 먼저 데이터셋을 만들고, 원하면 같은 흐름에서 바로 학습 시작 전 단계까지 끝낼 수 있습니다.</p>
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={() => void handleCreateDataset()} type="button">
                  JSONL만 만들기
                </button>
                <button className="primary-button" onClick={() => void handleCreateDataset({ prepareAfterCreate: true })} type="button">
                  JSONL + 학습 시작 준비까지
                </button>
              </div>
              {selectedDataset ? (
                <article className="dataset-summary-card">
                  <strong>{selectedDataset.name}</strong>
                  <span>
                    {selectedDataset.sample_count}개 샘플 · {getDatasetSourceLabel(selectedDataset.source_type)}
                  </span>
                  <div>
                    <span className="meta-label">데이터셋 원본</span>
                    <a
                      className="secondary-button button-link"
                      href={fileUrlFromPath(selectedDataset.raw_jsonl_path)}
                      download={basenameFromPath(selectedDataset.raw_jsonl_path)}
                    >
                      다운로드
                    </a>
                  </div>
                  {selectedDataset.prepared_jsonl_path ? (
                    <div>
                      <span className="meta-label">학습 파일</span>
                      <a
                        className="secondary-button button-link"
                        href={fileUrlFromPath(selectedDataset.prepared_jsonl_path)}
                        download={basenameFromPath(selectedDataset.prepared_jsonl_path)}
                      >
                        다운로드
                      </a>
                    </div>
                  ) : null}
                  {selectedDataset.manifest_path ? (
                    <div>
                      <span className="meta-label">데이터셋 정보</span>
                      <a
                        className="secondary-button button-link"
                        href={fileUrlFromPath(selectedDataset.manifest_path)}
                        download={basenameFromPath(selectedDataset.manifest_path)}
                      >
                        다운로드
                      </a>
                    </div>
                  ) : null}
                </article>
              ) : null}
            </section>

            <section className="finetune-stage">
              <div className="finetune-stage__header">
                <div>
                  <span className="step-card__index">4</span>
                  <h3>학습 실행</h3>
                </div>
                <p>준비가 끝난 데이터셋을 선택해 학습 설정을 확인하고 시작하세요.</p>
              </div>
              {selectedDataset ? (
                <article className="selected-audio-card">
                  <span className="meta-label">현재 작업 데이터셋</span>
                  <strong>{selectedDataset.name}</strong>
                  <p>
                    {selectedDataset.sample_count}개 샘플 · {getDatasetSourceLabel(selectedDataset.source_type)}
                  </p>
                </article>
              ) : (
                <article className="status-card">
                  <strong>작업 데이터셋이 아직 없습니다</strong>
                  <p>3단계에서 데이터셋을 만들거나, 아래에서 기존 데이터셋을 골라주세요.</p>
                </article>
              )}
              {!selectedDataset ? (
                <details className="advanced-inline">
                  <summary>기존 데이터셋 선택</summary>
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
                </details>
              ) : null}
              {selectedDataset ? (
                <article className={datasetReadyForTraining ? "status-card status-card--ready" : "status-card"}>
                  <strong>{datasetReadyForTraining ? "학습 가능" : "학습 시작 전 준비 필요"}</strong>
                  <p>
                    {datasetReadyForTraining
                      ? "학습용 파일이 준비되어 바로 학습을 시작할 수 있습니다."
                      : "3단계에서 `JSONL + 학습 시작 준비까지`를 누르거나, 아래 버튼으로 학습 시작 준비를 먼저 해주세요."}
                  </p>
                </article>
              ) : null}
              <div className="button-row">
                {!datasetReadyForTraining && selectedDataset ? (
                  <button className="secondary-button" onClick={handlePrepareDataset} type="button">
                    선택한 데이터셋 학습 시작 준비
                  </button>
                ) : null}
                <button className="primary-button" disabled={!datasetReadyForTraining} onClick={handleCreateRun} type="button">
                  학습 시작
                </button>
              </div>
              <details className="advanced-inline">
                <summary>학습 설정 열기</summary>
                <div className="field-row">
                  <label>
                    학습 모드
                    <select
                      value={runForm.training_mode}
                      onChange={(event) =>
                        setRunForm({ ...runForm, training_mode: event.target.value as FineTuneMode })
                      }
                    >
                      <option value="base">Base Fine-Tune</option>
                      <option value="custom_voice">CustomVoice Fine-Tune</option>
                    </select>
                  </label>
                  <label>
                    토크나이저
                    <select
                      value={runForm.tokenizer_model_path}
                      onChange={(event) => setRunForm({ ...runForm, tokenizer_model_path: event.target.value })}
                    >
                      {tokenizerModels.map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    출력 이름
                    <input
                      value={runForm.output_name}
                      onChange={(event) => setRunForm({ ...runForm, output_name: event.target.value })}
                    />
                  </label>
                  <label>
                    초기 모델
                    <select
                      value={runForm.init_model_path}
                      onChange={(event) => setRunForm({ ...runForm, init_model_path: event.target.value })}
                    >
                      {(runForm.training_mode === "custom_voice" ? customVoiceCapableModels : baseModels).map((model) => (
                        <option key={model.key} value={model.model_id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    학습용 화자 이름
                    <input
                      value={runForm.speaker_name}
                      onChange={(event) => setRunForm({ ...runForm, speaker_name: event.target.value })}
                    />
                  </label>
                </div>
                {runForm.training_mode === "custom_voice" ? (
                  <div className="field-row">
                    <label>
                      음색 인코더 기준 모델
                      <select
                        value={runForm.speaker_encoder_model_path}
                        onChange={(event) => setRunForm({ ...runForm, speaker_encoder_model_path: event.target.value })}
                      >
                        {baseModels.map((model) => (
                          <option key={model.key} value={model.model_id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      실행 스크립트
                      <input value="sft_custom_voice_12hz.py" readOnly />
                    </label>
                  </div>
                ) : (
                  <div className="field-row">
                    <label>
                      실행 스크립트
                      <input value="sft_12hz.py" readOnly />
                    </label>
                  </div>
                )}
                <div className="field-row">
                  <label>
                    배치 크기
                    <input
                      type="number"
                      value={runForm.batch_size}
                      onChange={(event) => setRunForm({ ...runForm, batch_size: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    epoch
                    <input
                      type="number"
                      value={runForm.num_epochs}
                      onChange={(event) => setRunForm({ ...runForm, num_epochs: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    학습률
                    <input
                      type="number"
                      step="0.000001"
                      value={runForm.lr}
                      onChange={(event) => setRunForm({ ...runForm, lr: Number(event.target.value) })}
                    />
                  </label>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={runForm.simulate_only}
                    onChange={(event) => setRunForm({ ...runForm, simulate_only: event.target.checked })}
                  />
                  시뮬레이션 모드로 먼저 확인
                </label>
              </details>
            </section>
          </section>

          <div className="panel-grid">
            <section className="panel">
              <h3>데이터셋 목록</h3>
              <div className="dataset-list">
                {datasets.map((dataset) => (
                  <article
                    className={dataset.id === selectedDatasetId ? "dataset-card preset-card--selected" : "dataset-card"}
                    key={dataset.id}
                  >
                    <strong>{dataset.name}</strong>
                    <span>{dataset.sample_count}개 샘플</span>
                    <span>{dataset.prepared_jsonl_path ? "학습 가능" : "학습 전"}</span>
                    <div className="button-row">
                      <button className="secondary-button" onClick={() => setSelectedDatasetId(dataset.id)} type="button">
                        이 데이터셋 사용
                      </button>
                      <a
                        className="secondary-button button-link"
                        href={fileUrlFromPath(dataset.raw_jsonl_path)}
                        download={basenameFromPath(dataset.raw_jsonl_path)}
                      >
                        원본 다운로드
                      </a>
                      {dataset.prepared_jsonl_path ? (
                        <a
                          className="secondary-button button-link"
                          href={fileUrlFromPath(dataset.prepared_jsonl_path)}
                          download={basenameFromPath(dataset.prepared_jsonl_path)}
                        >
                          학습 파일 다운로드
                        </a>
                      ) : null}
                      {dataset.manifest_path ? (
                        <a
                          className="secondary-button button-link"
                          href={fileUrlFromPath(dataset.manifest_path)}
                          download={basenameFromPath(dataset.manifest_path)}
                        >
                          데이터셋 정보 다운로드
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <h3>파인튜닝 실행 기록</h3>
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
          </div>
        </section>
      ) : null}

      <section className="history-section">
        <div className="history-section__header">
          <h2>최근 생성 이력</h2>
        </div>
        <div className="audio-grid">
          {history.slice(0, 8).map((record) => (
            <AudioCard key={record.id} title={getAudioDownloadName(record)} subtitle={record.mode} record={record} />
          ))}
        </div>
      </section>
        </main>
      </div>
    </div>
  );
}
