import { FormEvent, useEffect, useRef, useState } from "react";

import { api } from "./lib/api";
import type {
  AudioAsset,
  CharacterPreset,
  ClonePromptRecord,
  FineTuneDataset,
  FineTuneRun,
  GenerationRecord,
  HealthResponse,
  ModelInfo,
  SpeakerInfo,
  UploadResponse,
} from "./lib/types";

type TabKey = "custom" | "design" | "character" | "inference" | "finetune";
type GenerationModeKey = "custom" | "design" | "clone";
type CharacterBuilderSource = "design" | "upload";
type FineTuneMode = "base" | "custom_voice";
type GenerationControlsForm = {
  seed: string;
  non_streaming_mode: boolean;
  do_sample: boolean;
  top_k: string;
  top_p: string;
  temperature: string;
  repetition_penalty: string;
  subtalker_dosample: boolean;
  subtalker_top_k: string;
  subtalker_top_p: string;
  subtalker_temperature: string;
  max_new_tokens: string;
  extra_generate_kwargs: string;
};

const tabs: { key: TabKey; label: string; description: string }[] = [
  { key: "custom", label: "Quick Check", description: "" },
  { key: "design", label: "Design Lab", description: "" },
  { key: "character", label: "Character Builder", description: "" },
  { key: "inference", label: "Inference Lab", description: "" },
  { key: "finetune", label: "Training Lab", description: "" },
];

const LANGUAGE_OPTIONS = [
  { value: "Auto", label: "자동 감지" },
  { value: "Korean", label: "한국어" },
  { value: "English", label: "영어" },
  { value: "Japanese", label: "일본어" },
  { value: "Chinese", label: "중국어" },
  { value: "Cantonese", label: "광동어" },
] as const;

function createEmptyDatasetSample() {
  return { audio_path: "", text: "", original_filename: "" };
}

function normalizeDatasetPath(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

function parseDatasetSampleBulkInput(value: string): Array<{ audio_path: string; text?: string; original_filename: string }> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawPath, ...rest] = line.split("|");
      const audioPath = normalizeDatasetPath(rawPath || "");
      const text = rest.join("|").trim();
      return {
        audio_path: audioPath,
        text: text || "",
        original_filename: basenameFromPath(audioPath),
      };
    })
    .filter((sample) => sample.audio_path);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

function basenameFromPath(value: string): string {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || value;
}

function getAudioDownloadName(record: GenerationRecord): string {
  const sourceName = basenameFromPath(record.output_audio_path || record.output_audio_url);
  const hasExtension = /\.[a-z0-9]+$/i.test(sourceName);
  return hasExtension ? sourceName : `${record.id}.wav`;
}

function getDatasetSourceLabel(value: string): string {
  if (value === "voice_design_batch") return "Voice Design 샘플 묶음";
  if (value === "uploaded_audio_batch") return "직접 업로드한 음성 묶음";
  return value;
}

function normalizeLanguageValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "auto") return "Auto";
  if (normalized === "korean" || normalized === "ko" || normalized === "한국어") return "Korean";
  if (normalized === "english" || normalized === "en" || normalized === "영어") return "English";
  if (normalized === "japanese" || normalized === "ja" || normalized === "일본어") return "Japanese";
  if (normalized === "chinese" || normalized === "zh" || normalized === "중국어") return "Chinese";
  if (normalized === "cantonese" || normalized === "yue" || normalized === "광동어") return "Cantonese";
  return value;
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedValue = normalizeLanguageValue(value);
  const hasKnownValue = LANGUAGE_OPTIONS.some((option) => option.value === normalizedValue);

  return (
    <select value={normalizedValue} onChange={(event) => onChange(event.target.value)}>
      {!hasKnownValue && normalizedValue ? <option value={normalizedValue}>{normalizedValue}</option> : null}
      {LANGUAGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function fileUrlFromPath(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("data/") ? `/files/${normalized.slice(5)}` : `/files/${normalized}`;
}

function createGenerationControls(mode: GenerationModeKey): GenerationControlsForm {
  return {
    seed: "",
    non_streaming_mode: mode === "clone" ? false : true,
    do_sample: true,
    top_k: "50",
    top_p: "1.0",
    temperature: "0.9",
    repetition_penalty: "1.05",
    subtalker_dosample: true,
    subtalker_top_k: "50",
    subtalker_top_p: "1.0",
    subtalker_temperature: "0.9",
    max_new_tokens: "2048",
    extra_generate_kwargs: "{}",
  };
}

function serializeGenerationControls(value: GenerationControlsForm): Record<string, unknown> {
  let extraGenerateKwargs: Record<string, unknown> = {};
  const raw = value.extra_generate_kwargs.trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      extraGenerateKwargs = parsed as Record<string, unknown>;
    } else {
      throw new Error("extra_generate_kwargs는 JSON object여야 합니다.");
    }
  }

  return {
    seed: value.seed.trim() ? Number(value.seed) : undefined,
    non_streaming_mode: value.non_streaming_mode,
    do_sample: value.do_sample,
    top_k: value.top_k.trim() ? Number(value.top_k) : undefined,
    top_p: value.top_p.trim() ? Number(value.top_p) : undefined,
    temperature: value.temperature.trim() ? Number(value.temperature) : undefined,
    repetition_penalty: value.repetition_penalty.trim() ? Number(value.repetition_penalty) : undefined,
    subtalker_dosample: value.subtalker_dosample,
    subtalker_top_k: value.subtalker_top_k.trim() ? Number(value.subtalker_top_k) : undefined,
    subtalker_top_p: value.subtalker_top_p.trim() ? Number(value.subtalker_top_p) : undefined,
    subtalker_temperature: value.subtalker_temperature.trim() ? Number(value.subtalker_temperature) : undefined,
    max_new_tokens: value.max_new_tokens.trim() ? Number(value.max_new_tokens) : undefined,
    extra_generate_kwargs: extraGenerateKwargs,
  };
}

function GenerationControlsEditor({
  value,
  onChange,
}: {
  value: GenerationControlsForm;
  onChange: (next: GenerationControlsForm) => void;
}) {
  return (
    <details className="advanced-controls">
      <summary>Advanced Controls</summary>
      <div className="advanced-controls__grid">
        <label>
          seed
          <input value={value.seed} onChange={(event) => onChange({ ...value, seed: event.target.value })} />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.non_streaming_mode}
            onChange={(event) => onChange({ ...value, non_streaming_mode: event.target.checked })}
          />
          non_streaming_mode
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.do_sample}
            onChange={(event) => onChange({ ...value, do_sample: event.target.checked })}
          />
          do_sample
        </label>
        <label>
          top_k
          <input value={value.top_k} onChange={(event) => onChange({ ...value, top_k: event.target.value })} />
        </label>
        <label>
          top_p
          <input value={value.top_p} onChange={(event) => onChange({ ...value, top_p: event.target.value })} />
        </label>
        <label>
          temperature
          <input value={value.temperature} onChange={(event) => onChange({ ...value, temperature: event.target.value })} />
        </label>
        <label>
          repetition_penalty
          <input
            value={value.repetition_penalty}
            onChange={(event) => onChange({ ...value, repetition_penalty: event.target.value })}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.subtalker_dosample}
            onChange={(event) => onChange({ ...value, subtalker_dosample: event.target.checked })}
          />
          subtalker_dosample
        </label>
        <label>
          subtalker_top_k
          <input
            value={value.subtalker_top_k}
            onChange={(event) => onChange({ ...value, subtalker_top_k: event.target.value })}
          />
        </label>
        <label>
          subtalker_top_p
          <input
            value={value.subtalker_top_p}
            onChange={(event) => onChange({ ...value, subtalker_top_p: event.target.value })}
          />
        </label>
        <label>
          subtalker_temperature
          <input
            value={value.subtalker_temperature}
            onChange={(event) => onChange({ ...value, subtalker_temperature: event.target.value })}
          />
        </label>
        <label>
          max_new_tokens
          <input
            value={value.max_new_tokens}
            onChange={(event) => onChange({ ...value, max_new_tokens: event.target.value })}
          />
        </label>
      </div>
      <label>
        extra_generate_kwargs
        <textarea
          className="json-textarea"
          value={value.extra_generate_kwargs}
          onChange={(event) => onChange({ ...value, extra_generate_kwargs: event.target.value })}
        />
      </label>
    </details>
  );
}

function AudioCard({
  title,
  subtitle,
  record,
}: {
  title: string;
  subtitle?: string;
  record: GenerationRecord;
}) {
  return (
    <article className="audio-card">
      <div className="audio-card__header">
        <div>
          <h4>{title}</h4>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="audio-card__actions">
          <span>{formatDate(record.created_at)}</span>
          <a className="secondary-button button-link" href={record.output_audio_url} download={getAudioDownloadName(record)}>
            다운로드
          </a>
        </div>
      </div>
      <p className="audio-card__text">{record.input_text}</p>
      <audio controls src={record.output_audio_url} className="audio-card__player" />
      <div className="audio-card__meta">
        <span>{record.mode}</span>
        <span>{record.language}</span>
        {record.speaker ? <span>{record.speaker}</span> : null}
      </div>
    </article>
  );
}

function ServerAudioPicker({
  assets,
  selectedPath,
  onSelect,
}: {
  assets: AudioAsset[];
  selectedPath: string;
  onSelect: (asset: AudioAsset) => void;
}) {
  if (assets.length === 0) {
    return (
      <div className="result-card result-card--empty">
        <strong>서버 오디오가 없습니다</strong>
        <p>먼저 음성을 생성하거나 업로드한 뒤 여기서 선택할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="audio-asset-list">
      {assets.map((asset) => (
        <article className={asset.path === selectedPath ? "audio-asset-card is-selected" : "audio-asset-card"} key={asset.id}>
          <div className="audio-asset-card__header">
            <div>
              <strong>{asset.filename}</strong>
              <span>{asset.source === "generated" ? "생성된 음성" : "업로드된 음성"}</span>
            </div>
            <button className="secondary-button" onClick={() => onSelect(asset)} type="button">
              선택
            </button>
          </div>
          <audio controls className="audio-card__player" src={asset.url} />
          {asset.text_preview ? <p className="audio-asset-card__preview">{asset.text_preview}</p> : null}
        </article>
      ))}
    </div>
  );
}

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
          <span className="meta-label">ID</span>
          <strong>{prompt.id}</strong>
        </div>
        <div>
          <span className="meta-label">Source</span>
          <strong>{prompt.source_type}</strong>
        </div>
        <div>
          <span className="meta-label">Base Model</span>
          <strong>{prompt.base_model}</strong>
        </div>
      </div>
      <div className="path-chip">{prompt.prompt_path}</div>
      <p>{prompt.reference_text}</p>
    </article>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("custom");
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
    text: "환영해. 오늘부터 넌 내 세계에 들어온 거야.",
    language: "Korean",
    instruct:
      "Young Korean woman, calm and slightly cool. Very clear articulation, restrained emotion, but a faint warmth at the end of each sentence.",
  });
  const [lastCustomRecord, setLastCustomRecord] = useState<GenerationRecord | null>(null);
  const [lastDesignRecord, setLastDesignRecord] = useState<GenerationRecord | null>(null);
  const [customControls, setCustomControls] = useState<GenerationControlsForm>(createGenerationControls("custom"));
  const [designControls, setDesignControls] = useState<GenerationControlsForm>(createGenerationControls("design"));
  const [inferenceForm, setInferenceForm] = useState({
    model_id: "",
    text: "今日は本当に納得できないよ。",
    language: "Japanese",
    speaker: "",
    instruct: "自然で落ち着いた口調で読んでください。",
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
    name: "voice-design-dataset",
    source_type: "voice_design_batch",
    speaker_name: "speaker_demo",
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
    text: "今日は本当に納得できないよ。",
    language: "Japanese",
    instruct: "Speak with heightened emotion, slightly breathy delivery, and a feminine manner.",
    ref_audio_path: "",
    ref_text: "",
    x_vector_only_mode: false,
  });
  const [hybridControls, setHybridControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));
  const [lastHybridRecord, setLastHybridRecord] = useState<GenerationRecord | null>(null);

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
  const selectedInferenceModel = inferenceModels.find((model) => model.model_id === inferenceForm.model_id) ?? null;
  const selectedInferenceMode = selectedInferenceModel?.inference_mode ?? null;

  useEffect(() => {
    if (customVoiceModels.length > 0 && !customForm.model_id) {
      const preferred = customVoiceModels.find((model) => model.recommended) ?? customVoiceModels[0];
      setCustomForm((prev) => ({ ...prev, model_id: preferred.model_id }));
    }
    if (voiceDesignModels.length > 0 && !designForm.model_id) {
      const preferred = voiceDesignModels.find((model) => model.recommended) ?? voiceDesignModels[0];
      setDesignForm((prev) => ({ ...prev, model_id: preferred.model_id }));
    }
    if (baseModels.length > 0 && !selectedBaseModelId) {
      const preferred = baseModels.find((model) => model.recommended) ?? baseModels[0];
      setSelectedBaseModelId(preferred.model_id);
      setRunForm((prev) => ({
        ...prev,
        init_model_path: prev.init_model_path || preferred.model_id,
        speaker_encoder_model_path: prev.speaker_encoder_model_path || preferred.model_id,
      }));
      setHybridForm((prev) => ({ ...prev, base_model_id: prev.base_model_id || preferred.model_id }));
    }
    if (customVoiceCapableModels.length > 0 && !hybridForm.custom_model_id) {
      const preferred = customVoiceCapableModels.find((model) => model.recommended) ?? customVoiceCapableModels[0];
      setHybridForm((prev) => ({ ...prev, custom_model_id: preferred.model_id }));
    }
    if (inferenceModels.length > 0 && !inferenceForm.model_id) {
      const preferred =
        inferenceModels.find((model) => model.source === "finetuned") ??
        inferenceModels.find((model) => model.recommended) ??
        inferenceModels[0];
      setInferenceForm((prev) => ({
        ...prev,
        model_id: preferred.model_id,
        speaker: preferred.default_speaker || prev.speaker,
      }));
    }
    if (tokenizerModels.length > 0 && !runForm.tokenizer_model_path) {
      setRunForm((prev) => ({ ...prev, tokenizer_model_path: tokenizerModels[0].model_id }));
    }
  }, [customVoiceModels, customVoiceCapableModels, voiceDesignModels, baseModels, inferenceModels, tokenizerModels, customForm.model_id, designForm.model_id, selectedBaseModelId, inferenceForm.model_id, hybridForm.custom_model_id, runForm.init_model_path, runForm.speaker_encoder_model_path, runForm.tokenizer_model_path]);

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
    setRunForm((prev) => {
      if (prev.training_mode === "custom_voice") {
        const preferredCustom =
          customVoiceCapableModels.find((model) => model.source === "stock") ??
          customVoiceCapableModels[0];
        const preferredBase = baseModels.find((model) => model.recommended) ?? baseModels[0];
        return {
          ...prev,
          init_model_path: preferredCustom?.model_id || prev.init_model_path,
          speaker_encoder_model_path: preferredBase?.model_id || prev.speaker_encoder_model_path,
        };
      }

      const preferredBase = baseModels.find((model) => model.recommended) ?? baseModels[0];
      return {
        ...prev,
        init_model_path: preferredBase?.model_id || prev.init_model_path,
      };
    });
  }, [runForm.training_mode, customVoiceCapableModels, baseModels]);

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
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const datasetReadyForTraining = Boolean(selectedDataset?.prepared_jsonl_path);
  const generatedAudioAssets = audioAssets.filter((asset) => asset.source === "generated");
  const selectableDatasetAssets = audioAssets.filter((asset) => asset.source === "generated" || asset.source === "upload");
  const assetTextByPath = new Map(
    audioAssets.map((asset) => [asset.path, (asset.transcript_text || "").trim()]),
  );

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
      const result = await api.generateVoiceDesign({
        ...designForm,
        ...serializeGenerationControls(designControls),
      });
      setLastDesignRecord(result.record);
      setSelectedDesignSampleId(result.record.id);
      await refreshAll();
      setMessage("디자인 샘플을 생성했습니다.");
    });
  }

  async function handleCreateCloneFromDesign() {
    if (!selectedDesignSampleId) {
      setMessage("먼저 디자인 샘플을 선택해주세요.");
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
      setMessage(options?.prepareAfterCreate ? "데이터셋 생성과 학습용 준비를 함께 완료했습니다." : "파인튜닝용 raw JSONL 데이터셋을 만들었습니다.");
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
      setMessage(runForm.simulate_only ? "시뮬레이션용 prepared JSONL을 만들었습니다." : "실학습용 prepared JSONL을 만들었습니다.");
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
      setMessage("clone prompt + instruct hybrid 추론을 완료했습니다.");
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
      <header className="hero">
        <div className="hero__copy">
          <span className="eyebrow">Voice Demo Tool</span>
          <h1>Voice Demo Tool</h1>
        </div>
      </header>

      <nav className="tab-strip">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={tab.key === activeTab ? "tab is-active" : "tab"}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </button>
        ))}
      </nav>

      {message ? <div className="message-banner">{message}</div> : null}
      {activeTab === "custom" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleCustomSubmit}>
            <h2>Quick Voice Check</h2>
            <label>
              텍스트
              <textarea
                value={customForm.text}
                onChange={(event) => setCustomForm({ ...customForm, text: event.target.value })}
              />
            </label>
            <div className="field-row">
              <label>
                모델
                <select
                  value={customForm.model_id}
                  onChange={(event) => setCustomForm({ ...customForm, model_id: event.target.value })}
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
              <label>
                speaker
                <select
                  value={customForm.speaker}
                  onChange={(event) => setCustomForm({ ...customForm, speaker: event.target.value })}
                >
                  {speakers.map((speaker) => (
                    <option key={speaker.speaker} value={speaker.speaker}>
                      {speaker.speaker}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              instruction
              <textarea
                value={customForm.instruct}
                onChange={(event) => setCustomForm({ ...customForm, instruct: event.target.value })}
              />
            </label>
            <GenerationControlsEditor value={customControls} onChange={setCustomControls} />
            <button className="primary-button" disabled={loading} type="submit">
              샘플 생성
            </button>
          </form>

          <aside className="panel">
            <h3>speaker 참고</h3>
            <div className="speaker-list">
              {speakers.map((speaker) => (
                <div className="speaker-card" key={speaker.speaker}>
                  <strong>{speaker.speaker}</strong>
                  <span>{speaker.nativeLanguage}</span>
                  <p>{speaker.description}</p>
                </div>
              ))}
            </div>
            {lastCustomRecord ? (
              <AudioCard title="방금 생성한 샘플" record={lastCustomRecord} />
            ) : null}
          </aside>
        </section>
      ) : null}

      {activeTab === "design" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleVoiceDesignSubmit}>
            <h2>Voice Design Studio</h2>
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
            <label>
              음성 설명문
              <textarea
                value={designForm.instruct}
                onChange={(event) => setDesignForm({ ...designForm, instruct: event.target.value })}
              />
            </label>
            <label>
              샘플 텍스트
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
            <GenerationControlsEditor value={designControls} onChange={setDesignControls} />
            <button className="primary-button" disabled={loading} type="submit">
              디자인 샘플 생성
            </button>
          </form>

          <aside className="panel">
            <h3>디자인 샘플 기록</h3>
              <div className="history-list">
                {voiceDesignHistory.slice(0, 6).map((record) => (
                  <article
                    key={record.id}
                    className={record.id === selectedDesignSampleId ? "history-item is-selected" : "history-item"}
                  >
                    <button className="history-item__button" onClick={() => setSelectedDesignSampleId(record.id)} type="button">
                      <strong>{record.id}</strong>
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
                title="방금 생성한 디자인 샘플"
                subtitle="독립적인 음성 디자인 실험 결과"
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
                <span className="eyebrow eyebrow--soft">Character Builder</span>
                <h2>참조 소스 {"->"} clone prompt {"->"} preset 저장</h2>
                <p>업로드 음성은 자동으로 Whisper 전사를 채우고, 필요하면 직접 수정한 뒤 prompt를 만들 수 있습니다.</p>
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
                        <span className="meta-label">업로드 경로</span>
                        <div className="path-chip">{uploadedRef.path}</div>
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
                        업로드 음성으로 clone prompt 만들기
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
                            <strong>{record.id}</strong>
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
                      디자인 샘플에서 clone prompt 만들기
                    </button>
                  </>
                )}
              </section>

              <section className="step-card">
                <span className="step-card__index">2</span>
                <PromptSummaryCard
                  title={builderSource === "upload" ? "업로드 참조 prompt" : "디자인 샘플 prompt"}
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
                  현재 prompt로 preset 저장
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
                  <span className="meta-label">선택된 preset</span>
                  <div className="path-chip">{selectedPreset.clone_prompt_path}</div>
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
              <h2>Preset Library</h2>
              <div className="preset-list">
                {presets.map((preset) => (
                  <article
                    className={preset.id === selectedPresetId ? "preset-card preset-card--selected" : "preset-card"}
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.source_type}</span>
                    <p>{preset.reference_text}</p>
                    <div className="path-chip">{preset.clone_prompt_path}</div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "inference" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
          <form className="panel inference-panel" onSubmit={handleModelInferenceSubmit}>
            <div className="result-card__header">
              <div>
                <span className="eyebrow eyebrow--soft">Inference Lab</span>
                <h2>모델 선택형 추론</h2>
                <p>Stock Base, Stock CustomVoice, 그리고 로컬 fine-tuned 체크포인트까지 한 화면에서 바로 테스트합니다.</p>
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
            </div>

            {selectedInferenceModel ? (
              <article className="status-card status-card--ready">
                <strong>{selectedInferenceModel.label}</strong>
                <p>{selectedInferenceModel.notes}</p>
                <div className="audio-card__meta">
                  <span>{selectedInferenceModel.source}</span>
                  <span>{selectedInferenceModel.category}</span>
                  <span>{selectedInferenceModel.inference_mode}</span>
                </div>
              </article>
            ) : null}

            <label>
              대사
              <textarea
                value={inferenceForm.text}
                onChange={(event) => setInferenceForm((prev) => ({ ...prev, text: event.target.value }))}
              />
            </label>

            {selectedInferenceMode === "custom_voice" ? (
              <label>
                speaker
                {selectedInferenceModel?.available_speakers?.length ? (
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
                ) : (
                  <input
                    value={inferenceForm.speaker}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, speaker: event.target.value }))}
                  />
                )}
              </label>
            ) : null}

            <label>
              instruct
              <textarea
                disabled={selectedInferenceModel ? !selectedInferenceModel.supports_instruction : false}
                placeholder={
                  selectedInferenceModel && !selectedInferenceModel.supports_instruction
                    ? "이 모델 경로에서는 instruct가 사용되지 않습니다."
                    : "스타일 지시문을 입력하세요."
                }
                value={inferenceForm.instruct}
                onChange={(event) => setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))}
              />
            </label>

            {selectedInferenceMode === "voice_clone" ? (
              <div className="inference-clone-grid">
                <label>
                  ref_audio_path
                  <input
                    value={inferenceForm.ref_audio_path}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))}
                  />
                </label>
                <label>
                  voice_clone_prompt_path
                  <input
                    value={inferenceForm.voice_clone_prompt_path}
                    onChange={(event) =>
                      setInferenceForm((prev) => ({ ...prev, voice_clone_prompt_path: event.target.value }))
                    }
                  />
                </label>
                <label className="inference-clone-grid__wide">
                  ref_text
                  <textarea
                    value={inferenceForm.ref_text}
                    onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_text: event.target.value }))}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={inferenceForm.x_vector_only_mode}
                    onChange={(event) =>
                      setInferenceForm((prev) => ({ ...prev, x_vector_only_mode: event.target.checked }))
                    }
                  />
                  x_vector_only_mode
                </label>
              </div>
            ) : null}

            <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
            <button className="primary-button" disabled={loading || !selectedInferenceModel} type="submit">
              선택한 모델로 추론
            </button>
          </form>

          <aside className="panel inference-side">
            <h3>참조 음성 빠른 선택</h3>
            <p className="field-hint">Base 계열 모델일 때 아래 파일을 선택하면 `ref_audio_path`와 `ref_text`를 바로 채웁니다.</p>
            <ServerAudioPicker
              assets={generatedAudioAssets}
              selectedPath={inferenceForm.ref_audio_path}
              onSelect={handleSelectInferenceAsset}
            />
            {lastInferenceRecord ? (
              <AudioCard title="방금 생성한 추론 결과" subtitle={lastInferenceRecord.mode} record={lastInferenceRecord} />
            ) : null}
          </aside>
          </div>

          <div className="panel-grid">
            <form className="panel inference-panel" onSubmit={handleHybridInferenceSubmit}>
              <div className="result-card__header">
                <div>
                  <span className="eyebrow eyebrow--soft">Experimental</span>
                  <h2>Clone Prompt + Instruct Hybrid</h2>
                  <p>Base 모델의 clone prompt와 CustomVoice 모델의 instruct를 함께 써보는 실험 경로입니다.</p>
                </div>
              </div>

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
                instruct
                <textarea
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
                  x_vector_only_mode
                </label>
              </div>
              <label>
                ref_audio_path
                <input
                  value={hybridForm.ref_audio_path}
                  onChange={(event) => setHybridForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))}
                />
              </label>
              <label>
                ref_text
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
              <h3>Hybrid 참조 음성 선택</h3>
              <p className="field-hint">생성/업로드 음성을 골라 `ref_audio_path`와 `ref_text`를 빠르게 채울 수 있습니다.</p>
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

      {activeTab === "finetune" ? (
        <section className="workspace workspace--stacked">
          <section className="panel finetune-flow">
            <div className="finetune-header">
              <div>
                <span className="eyebrow eyebrow--soft">Training Lab</span>
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
                <p>Training Lab은 파일 업로드 대신 경로 입력을 기본으로 사용합니다. 기준 음성 하나를 먼저 정하고, 나머지 샘플이 그 화자를 따라가게 만드세요.</p>
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
                ref_audio_path
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
                        <span>{asset.path}</span>
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
                  <details className="advanced-inline">
                    <summary>저장 경로 보기</summary>
                    <div className="path-chip">{datasetForm.ref_audio_path}</div>
                  </details>
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
                <p>한 줄에 하나씩 적고, 필요하면 `|` 뒤에 텍스트를 같이 붙이세요. 텍스트를 비우면 데이터셋 생성 시 Whisper 자동 전사를 시도합니다.</p>
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
                        <span>{asset.path}</span>
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
                        <strong>{record.id}</strong>
                        <span>{record.output_audio_path}</span>
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
                        <details className="advanced-inline">
                          <summary>저장 경로 보기</summary>
                          <div className="path-chip">{sample.audio_path}</div>
                        </details>
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
                        <strong>{record.id}</strong>
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
                  <h3>데이터셋 생성</h3>
                </div>
                <p>샘플이 준비되면 데이터셋을 만들고, 원하면 같은 단계에서 바로 학습용으로 준비까지 이어가세요.</p>
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={() => void handleCreateDataset()} type="button">
                  raw 데이터셋만 만들기
                </button>
                <button className="primary-button" onClick={() => void handleCreateDataset({ prepareAfterCreate: true })} type="button">
                  데이터셋 만들고 학습용 준비까지
                </button>
              </div>
              {selectedDataset ? (
                <article className="dataset-summary-card">
                  <strong>{selectedDataset.name}</strong>
                  <span>
                    {selectedDataset.sample_count}개 샘플 · {getDatasetSourceLabel(selectedDataset.source_type)}
                  </span>
                  <div>
                    <span className="meta-label">Raw JSONL</span>
                    <div className="path-chip">{selectedDataset.raw_jsonl_path}</div>
                    <a
                      className="secondary-button button-link"
                      href={fileUrlFromPath(selectedDataset.raw_jsonl_path)}
                      download={basenameFromPath(selectedDataset.raw_jsonl_path)}
                    >
                      raw JSONL 다운로드
                    </a>
                  </div>
                  {selectedDataset.prepared_jsonl_path ? (
                    <div>
                      <span className="meta-label">Prepared JSONL</span>
                      <div className="path-chip">{selectedDataset.prepared_jsonl_path}</div>
                      <a
                        className="secondary-button button-link"
                        href={fileUrlFromPath(selectedDataset.prepared_jsonl_path)}
                        download={basenameFromPath(selectedDataset.prepared_jsonl_path)}
                      >
                        prepared JSONL 다운로드
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
                  <strong>{datasetReadyForTraining ? "학습 준비 완료" : "학습 준비 필요"}</strong>
                  <p>
                    {datasetReadyForTraining
                      ? "학습용 파일이 준비되어 바로 학습을 시작할 수 있습니다."
                      : "3단계에서 `데이터셋 만들고 학습용 준비까지`를 누르거나, 아래 보조 액션으로 기존 데이터셋을 준비해야 합니다."}
                  </p>
                </article>
              ) : null}
              <div className="button-row">
                <button className="primary-button" disabled={!datasetReadyForTraining} onClick={handleCreateRun} type="button">
                  학습 시작
                </button>
              </div>
              {!datasetReadyForTraining && selectedDataset ? (
                <details className="advanced-inline">
                  <summary>기존 데이터셋을 학습용으로 준비</summary>
                  <button className="secondary-button" onClick={handlePrepareDataset} type="button">
                    선택한 데이터셋 준비 실행
                  </button>
                </details>
              ) : null}
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
                      speaker_encoder_model_path
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
                    <span>{dataset.prepared_jsonl_path ? "준비 완료" : "준비 전"}</span>
                    <div className="button-row">
                      <button className="secondary-button" onClick={() => setSelectedDatasetId(dataset.id)} type="button">
                        이 데이터셋 사용
                      </button>
                      <a
                        className="secondary-button button-link"
                        href={fileUrlFromPath(dataset.raw_jsonl_path)}
                        download={basenameFromPath(dataset.raw_jsonl_path)}
                      >
                        raw 다운로드
                      </a>
                      {dataset.prepared_jsonl_path ? (
                        <a
                          className="secondary-button button-link"
                          href={fileUrlFromPath(dataset.prepared_jsonl_path)}
                          download={basenameFromPath(dataset.prepared_jsonl_path)}
                        >
                          prepared 다운로드
                        </a>
                      ) : null}
                    </div>
                    <div className="path-chip">{dataset.raw_jsonl_path}</div>
                    {dataset.prepared_jsonl_path ? <div className="path-chip">{dataset.prepared_jsonl_path}</div> : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <h3>파인튜닝 실행 기록</h3>
              <div className="dataset-list">
                {runs.map((run) => (
                  <article className="dataset-card" key={run.id}>
                    <strong>{run.id}</strong>
                    <span>{run.status}</span>
                    <span>{run.training_mode}</span>
                    <code>{run.output_model_path}</code>
                    {run.speaker_encoder_model_path ? <code>{run.speaker_encoder_model_path}</code> : null}
                    {run.log_path ? <code>{run.log_path}</code> : null}
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
            <AudioCard key={record.id} title={record.id} subtitle={record.mode} record={record} />
          ))}
        </div>
      </section>
    </div>
  );
}
