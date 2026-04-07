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

const tabs: { key: TabKey; label: string; description: string }[] = [
  { key: "custom", label: "CustomVoice", description: "빠른 품질 확인과 speaker 실험" },
  { key: "design", label: "VoiceDesign", description: "독립 음성 디자인 스튜디오" },
  { key: "character", label: "Fixed Character", description: "clone prompt와 캐릭터 프리셋" },
  { key: "finetune", label: "Fine-tuning", description: "데이터셋 빌더와 학습 실행" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
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
    text: "안녕하세요. 지금은 빠르게 음질을 확인하는 테스트예요.",
    language: "Korean",
    speaker: "Sohee",
    instruct: "친절하고 또렷하게 말해줘.",
  });
  const [designForm, setDesignForm] = useState({
    text: "환영해. 오늘부터 넌 내 세계에 들어온 거야.",
    language: "Korean",
    instruct:
      "차분하고 서늘한 20대 여성 캐릭터. 발음은 매우 또렷하고, 감정은 절제되어 있지만 문장 끝에 미묘한 온기가 남는다.",
  });
  const [lastCustomRecord, setLastCustomRecord] = useState<GenerationRecord | null>(null);
  const [lastDesignRecord, setLastDesignRecord] = useState<GenerationRecord | null>(null);

  const [selectedDesignSampleId, setSelectedDesignSampleId] = useState("");
  const [selectedClonePrompt, setSelectedClonePrompt] = useState<ClonePromptRecord | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    language: "Korean",
    notes: "",
  });
  const [presetGenerateText, setPresetGenerateText] = useState("이 캐릭터는 앞으로도 같은 목소리로 말해야 해.");
  const [selectedPresetId, setSelectedPresetId] = useState("");

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

  const voiceDesignHistory = history.filter((item) => item.mode === "voice_design");

  async function handleCustomSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.generateCustomVoice(customForm);
      setLastCustomRecord(result.record);
      await refreshAll();
      setMessage("CustomVoice 샘플을 생성했습니다.");
    });
  }

  async function handleVoiceDesignSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.generateVoiceDesign(designForm);
      setLastDesignRecord(result.record);
      setSelectedDesignSampleId(result.record.id);
      await refreshAll();
      setMessage("VoiceDesign 샘플을 생성했습니다.");
    });
  }

  async function handleCreateCloneFromDesign() {
    if (!selectedDesignSampleId) {
      setMessage("먼저 VoiceDesign 샘플을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.createCloneFromSample({ generation_id: selectedDesignSampleId });
      setSelectedClonePrompt(result);
      setPresetForm((prev) => ({ ...prev, name: prev.name || `design-${result.id}` }));
      setDatasetForm((prev) => ({
        ...prev,
        ref_audio_path: result.reference_audio_path,
      }));
      setMessage("VoiceDesign 샘플에서 clone prompt를 만들었습니다.");
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
        base_model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
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
        tokenizer_model_path: "Qwen/Qwen3-TTS-Tokenizer-12Hz",
        device: "cuda:0",
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
        init_model_path: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        output_name: runForm.output_name,
        batch_size: Number(runForm.batch_size),
        lr: Number(runForm.lr),
        num_epochs: Number(runForm.num_epochs),
        speaker_name: runForm.speaker_name,
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
          <span className="eyebrow">Qwen3-TTS Character Platform Demo</span>
          <h1>VoiceDesign, clone prompt, 고정 캐릭터 프리셋, 파인튜닝 흐름을 한 화면에서 연결합니다.</h1>
          <p>
            빠른 음질 확인부터 VoiceDesign 실험, Base 기반 캐릭터 고정화, 데이터셋 빌드와 파인튜닝
            진입점까지 한 번에 검증할 수 있는 로컬 데모입니다.
          </p>
        </div>
        <div className="status-grid">
          <div className="status-card">
            <strong>백엔드 상태</strong>
            <span>{health?.status ?? "loading"}</span>
          </div>
          <div className="status-card">
            <strong>실행 모드</strong>
            <span>{health?.simulation_mode ? "Simulation" : "Real qwen-tts"}</span>
          </div>
          <div className="status-card">
            <strong>모델 연동</strong>
            <span>{health?.qwen_tts_available ? "qwen-tts import OK" : "미설치 또는 미연동"}</span>
          </div>
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

      <section className="models-panel">
        <div>
          <h3>활성 모델 구성</h3>
          <p>현재 백엔드가 사용하는 모델 id와 역할입니다.</p>
        </div>
        <div className="model-list">
          {models.map((model) => (
            <article className="model-card" key={model.key}>
              <h4>{model.label}</h4>
              <code>{model.model_id}</code>
              <p>{model.notes}</p>
            </article>
          ))}
        </div>
      </section>

      {activeTab === "custom" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleCustomSubmit}>
            <h2>Quick CustomVoice Check</h2>
            <label>
              텍스트
              <textarea
                value={customForm.text}
                onChange={(event) => setCustomForm({ ...customForm, text: event.target.value })}
              />
            </label>
            <div className="field-row">
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
              <AudioCard title="방금 생성한 CustomVoice 결과" record={lastCustomRecord} />
            ) : null}
          </aside>
        </section>
      ) : null}

      {activeTab === "design" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleVoiceDesignSubmit}>
            <h2>VoiceDesign Studio</h2>
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
            <button className="primary-button" disabled={loading} type="submit">
              VoiceDesign 생성
            </button>
          </form>

          <aside className="panel">
            <h3>VoiceDesign 샘플 기록</h3>
            <p>여기서 만든 샘플은 나중에 Base clone prompt 생성이나 데이터셋 빌드에 재사용할 수 있습니다.</p>
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
                title="방금 생성한 VoiceDesign 결과"
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
              <h2>VoiceDesign {"->"} clone prompt {"->"} 프리셋</h2>
              <p>VoiceDesign 샘플을 선택해 Base에서 재사용 가능한 clone prompt를 만듭니다.</p>
              <label>
                VoiceDesign 샘플
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
              <p>참조 음성과 참조 텍스트를 넣어 업로드 기반 고정 캐릭터 음성의 출발점을 만듭니다.</p>
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
                  VoiceDesign 기반 프리셋 저장
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
              <h2>Fine-tuning Dataset Builder</h2>
              <p>`audio`, `text`, `ref_audio` 구조의 raw JSONL을 만드는 단계입니다.</p>
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
                  output_name
                  <input
                    value={runForm.output_name}
                    onChange={(event) => setRunForm({ ...runForm, output_name: event.target.value })}
                  />
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
          <p>CustomVoice, VoiceDesign, preset generation 결과가 모두 여기에 쌓입니다.</p>
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
