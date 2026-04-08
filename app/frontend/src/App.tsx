import { FormEvent, useEffect, useState } from "react";

import { api } from "./lib/api";
import type {
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

type TabKey = "custom" | "design" | "character" | "finetune";
type GenerationModeKey = "custom" | "design" | "clone";
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
  { key: "finetune", label: "Training Lab", description: "" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
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
        <span>{formatDate(record.created_at)}</span>
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("custom");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [datasets, setDatasets] = useState<FineTuneDataset[]>([]);
  const [runs, setRuns] = useState<FineTuneRun[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
  const [presetControls, setPresetControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));

  const [uploadedRef, setUploadedRef] = useState<UploadResponse | null>(null);
  const [uploadRefText, setUploadRefText] = useState("안녕하세요. 이 목소리를 기준으로 계속 말하게 해주세요.");
  const [uploadedClonePrompt, setUploadedClonePrompt] = useState<ClonePromptRecord | null>(null);

  const [datasetSamples, setDatasetSamples] = useState([{ audio_path: "", text: "" }]);
  const [datasetForm, setDatasetForm] = useState({
    name: "voice-design-dataset",
    source_type: "voice_design_batch",
    speaker_name: "speaker_demo",
    ref_audio_path: "",
  });
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [runForm, setRunForm] = useState({
    init_model_path: "",
    tokenizer_model_path: "",
    output_name: "demo-run",
    speaker_name: "speaker_demo",
    batch_size: 2,
    lr: 0.00002,
    num_epochs: 3,
    simulate_only: true,
  });

  async function refreshAll() {
    const [healthData, modelData, speakerData, historyData, presetData, datasetData, runData] =
      await Promise.all([
        api.health(),
        api.models(),
        api.speakers(),
        api.history(),
        api.presets(),
        api.datasets(),
        api.runs(),
      ]);
    setHealth(healthData);
    setModels(modelData);
    setSpeakers(speakerData);
    setHistory(historyData);
    setPresets(presetData);
    setDatasets(datasetData);
    setRuns(runData);
  }

  useEffect(() => {
    refreshAll().catch((error: Error) => {
      setMessage(error.message);
    });
  }, []);

  async function runAction(action: () => Promise<void>) {
    try {
      setLoading(true);
      setMessage("");
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const customVoiceModels = models.filter((model) => model.category === "custom_voice");
  const voiceDesignModels = models.filter((model) => model.category === "voice_design");
  const baseModels = models.filter((model) => model.category === "base_clone");
  const tokenizerModels = models.filter((model) => model.category === "tokenizer");
  const voiceDesignHistory = history.filter((item) => item.mode === "voice_design");

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
      setRunForm((prev) => ({ ...prev, init_model_path: prev.init_model_path || preferred.model_id }));
    }
    if (tokenizerModels.length > 0 && !runForm.tokenizer_model_path) {
      setRunForm((prev) => ({ ...prev, tokenizer_model_path: tokenizerModels[0].model_id }));
    }
  }, [customVoiceModels, voiceDesignModels, baseModels, tokenizerModels, customForm.model_id, designForm.model_id, selectedBaseModelId, runForm.init_model_path, runForm.tokenizer_model_path]);

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
      const result = await api.uploadAudio(file);
      setUploadedRef(result);
      setDatasetForm((prev) => ({ ...prev, ref_audio_path: result.path }));
      setMessage("참조 음성을 업로드했습니다.");
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
        reference_text: uploadRefText,
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
        base_model: selectedBaseModelId,
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
        language: "Auto",
        ...serializeGenerationControls(presetControls),
      });
      await refreshAll();
      setMessage("프리셋으로 음성을 생성했습니다.");
    });
  }

  async function handleCreateDataset() {
    const validSamples = datasetSamples.filter((sample) => sample.audio_path && sample.text);
    if (!datasetForm.ref_audio_path || validSamples.length === 0) {
      setMessage("ref_audio와 최소 1개 이상의 샘플을 채워주세요.");
      return;
    }
    await runAction(async () => {
      const dataset = await api.createDataset({
        ...datasetForm,
        samples: validSamples,
      });
      setSelectedDatasetId(dataset.id);
      await refreshAll();
      setMessage("파인튜닝용 raw JSONL 데이터셋을 만들었습니다.");
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
        simulate_only: health?.simulation_mode ?? true,
      });
      await refreshAll();
      setMessage("audio_codes 포함 JSONL을 준비했습니다.");
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
        init_model_path: runForm.init_model_path,
        output_name: runForm.output_name,
        batch_size: Number(runForm.batch_size),
        lr: Number(runForm.lr),
        num_epochs: Number(runForm.num_epochs),
        speaker_name: runForm.speaker_name,
        device: health?.device ?? "cpu",
        simulate_only: runForm.simulate_only,
      });
      await refreshAll();
      setMessage("파인튜닝 실행 기록을 만들었습니다.");
    });
  }

  function addSampleRow() {
    setDatasetSamples((prev) => [...prev, { audio_path: "", text: "" }]);
  }

  function addHistorySample(record: GenerationRecord) {
    setDatasetSamples((prev) => [
      ...prev,
      {
        audio_path: record.output_audio_path,
        text: record.input_text,
      },
    ]);
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
                <input
                  value={customForm.language}
                  onChange={(event) => setCustomForm({ ...customForm, language: event.target.value })}
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
              <input
                value={designForm.language}
                onChange={(event) => setDesignForm({ ...designForm, language: event.target.value })}
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
                <button
                  key={record.id}
                  className={record.id === selectedDesignSampleId ? "history-item is-selected" : "history-item"}
                  onClick={() => setSelectedDesignSampleId(record.id)}
                  type="button"
                >
                  <strong>{record.id}</strong>
                  <span>{record.input_text.slice(0, 60)}</span>
                </button>
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
          <div className="panel-grid">
            <section className="panel">
              <h2>Design Sample {"->"} Clone Prompt {"->"} Preset</h2>
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
              <label>
                디자인 샘플
                <select
                  value={selectedDesignSampleId}
                  onChange={(event) => setSelectedDesignSampleId(event.target.value)}
                >
                  <option value="">선택하세요</option>
                  {voiceDesignHistory.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" onClick={handleCreateCloneFromDesign} type="button">
                clone prompt 생성
              </button>
              {selectedClonePrompt ? (
                <div className="info-block">
                  <strong>{selectedClonePrompt.id}</strong>
                  <span>{selectedClonePrompt.prompt_path}</span>
                </div>
              ) : null}
            </section>

            <section className="panel">
              <h2>사용자 음성 업로드 {"->"} clone prompt</h2>
              <label className="upload-field">
                음성 파일 업로드
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
              {uploadedRef ? <div className="info-block">{uploadedRef.path}</div> : null}
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
              <label>
                참조 텍스트
                <textarea value={uploadRefText} onChange={(event) => setUploadRefText(event.target.value)} />
              </label>
              <button className="secondary-button" onClick={handleCreateCloneFromUpload} type="button">
                업로드 음성으로 clone prompt 생성
              </button>
              {uploadedClonePrompt ? (
                <div className="info-block">
                  <strong>{uploadedClonePrompt.id}</strong>
                  <span>{uploadedClonePrompt.prompt_path}</span>
                </div>
              ) : null}
            </section>
          </div>

          <div className="panel-grid">
            <section className="panel">
              <h2>캐릭터 프리셋 저장</h2>
              <label>
                프리셋 이름
                <input
                  value={presetForm.name}
                  onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })}
                />
              </label>
              <label>
                기본 언어
                <input
                  value={presetForm.language}
                  onChange={(event) => setPresetForm({ ...presetForm, language: event.target.value })}
                />
              </label>
              <label>
                메모
                <textarea
                  value={presetForm.notes}
                  onChange={(event) => setPresetForm({ ...presetForm, notes: event.target.value })}
                />
              </label>
              <div className="button-row">
                <button className="primary-button" onClick={() => void handleCreatePreset("design")} type="button">
                  디자인 샘플 기반 프리셋 저장
                </button>
                <button className="secondary-button" onClick={() => void handleCreatePreset("upload")} type="button">
                  업로드 기반 프리셋 저장
                </button>
              </div>
            </section>

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
              <label>
                새 대사
                <textarea value={presetGenerateText} onChange={(event) => setPresetGenerateText(event.target.value)} />
              </label>
              <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
              <button className="primary-button" onClick={handleGenerateFromPreset} type="button">
                프리셋으로 생성
              </button>
              <div className="preset-list">
                {presets.map((preset) => (
                  <article className="preset-card" key={preset.id}>
                    <strong>{preset.name}</strong>
                    <span>{preset.source_type}</span>
                    <p>{preset.reference_text}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "finetune" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <section className="panel">
              <h2>Training Dataset Builder</h2>
              <label>
                데이터셋 이름
                <input
                  value={datasetForm.name}
                  onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })}
                />
              </label>
              <div className="field-row">
                <label>
                  sourceType
                  <select
                    value={datasetForm.source_type}
                    onChange={(event) => setDatasetForm({ ...datasetForm, source_type: event.target.value })}
                  >
                    <option value="voice_design_batch">voice_design_batch</option>
                    <option value="uploaded_audio_batch">uploaded_audio_batch</option>
                  </select>
                </label>
                <label>
                  speakerName
                  <input
                    value={datasetForm.speaker_name}
                    onChange={(event) => setDatasetForm({ ...datasetForm, speaker_name: event.target.value })}
                  />
                </label>
              </div>
              <label>
                ref_audio_path
                <input
                  value={datasetForm.ref_audio_path}
                  onChange={(event) => setDatasetForm({ ...datasetForm, ref_audio_path: event.target.value })}
                />
              </label>
              <div className="sample-builder">
                {datasetSamples.map((sample, index) => (
                  <div className="sample-row" key={`sample-${index}`}>
                    <input
                      placeholder="audio path"
                      value={sample.audio_path}
                      onChange={(event) => {
                        const next = [...datasetSamples];
                        next[index].audio_path = event.target.value;
                        setDatasetSamples(next);
                      }}
                    />
                    <input
                      placeholder="text"
                      value={sample.text}
                      onChange={(event) => {
                        const next = [...datasetSamples];
                        next[index].text = event.target.value;
                        setDatasetSamples(next);
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={addSampleRow} type="button">
                  샘플 행 추가
                </button>
                <button className="primary-button" onClick={handleCreateDataset} type="button">
                  raw JSONL 만들기
                </button>
              </div>
              <div className="history-list">
                {voiceDesignHistory.slice(0, 4).map((record) => (
                  <button
                    className="history-item"
                    key={record.id}
                    onClick={() => addHistorySample(record)}
                    type="button"
                  >
                    <strong>{record.id}</strong>
                    <span>이 샘플을 데이터셋에 추가</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>prepare_data.py / sft_12hz.py 실행</h2>
              <label>
                데이터셋 선택
                <select value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" onClick={handlePrepareDataset} type="button">
                prepare_data 실행
              </button>
              <div className="field-row">
                <label>
                  tokenizer
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
                  output_name
                  <input
                    value={runForm.output_name}
                    onChange={(event) => setRunForm({ ...runForm, output_name: event.target.value })}
                  />
                </label>
                <label>
                  init_model
                  <select
                    value={runForm.init_model_path}
                    onChange={(event) => setRunForm({ ...runForm, init_model_path: event.target.value })}
                  >
                    {baseModels.map((model) => (
                      <option key={model.key} value={model.model_id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  speaker_name
                  <input
                    value={runForm.speaker_name}
                    onChange={(event) => setRunForm({ ...runForm, speaker_name: event.target.value })}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  batch_size
                  <input
                    type="number"
                    value={runForm.batch_size}
                    onChange={(event) => setRunForm({ ...runForm, batch_size: Number(event.target.value) })}
                  />
                </label>
                <label>
                  num_epochs
                  <input
                    type="number"
                    value={runForm.num_epochs}
                    onChange={(event) => setRunForm({ ...runForm, num_epochs: Number(event.target.value) })}
                  />
                </label>
                <label>
                  lr
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
                시뮬레이션 모드로 실행
              </label>
              <button className="primary-button" onClick={handleCreateRun} type="button">
                sft_12hz 실행
              </button>
            </section>
          </div>

          <div className="panel-grid">
            <section className="panel">
              <h3>데이터셋 목록</h3>
              <div className="dataset-list">
                {datasets.map((dataset) => (
                  <article className="dataset-card" key={dataset.id}>
                    <strong>{dataset.name}</strong>
                    <span>{dataset.sample_count} samples</span>
                    <code>{dataset.raw_jsonl_path}</code>
                    {dataset.prepared_jsonl_path ? <code>{dataset.prepared_jsonl_path}</code> : null}
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
                    <code>{run.output_model_path}</code>
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
