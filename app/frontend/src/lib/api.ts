import type {
  AudioTranscriptionResponse,
  BootstrapResponse,
  CharacterPreset,
  CloneFromSampleRequest,
  CloneFromUploadRequest,
  ClonePromptRecord,
  CreateDatasetRequest,
  CreateFineTuneRunRequest,
  CreatePresetRequest,
  CustomVoiceRequest,
  FineTuneDataset,
  FineTuneRun,
  GenerateFromPresetRequest,
  GenerationRecord,
  GenerationResponse,
  HealthResponse,
  HybridCloneInstructRequest,
  ModelInfo,
  PrepareDatasetRequest,
  SpeakerInfo,
  UploadResponse,
  UniversalInferenceRequest,
  VoiceDesignRequest,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail || detail;
    } catch {
      // 서버가 JSON이 아닌 응답을 내려도 기본 상태 메시지로 오류를 전달한다.
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const api = {
  bootstrap(): Promise<BootstrapResponse> {
    return request<BootstrapResponse>("/api/bootstrap");
  },

  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/api/health");
  },

  models(): Promise<ModelInfo[]> {
    return request<ModelInfo[]>("/api/models");
  },

  speakers(): Promise<SpeakerInfo[]> {
    return request<SpeakerInfo[]>("/api/speakers");
  },

  history(): Promise<GenerationRecord[]> {
    return request<GenerationRecord[]>("/api/history");
  },

  presets(): Promise<CharacterPreset[]> {
    return request<CharacterPreset[]>("/api/presets");
  },

  datasets(): Promise<FineTuneDataset[]> {
    return request<FineTuneDataset[]>("/api/datasets");
  },

  runs(): Promise<FineTuneRun[]> {
    return request<FineTuneRun[]>("/api/finetune-runs");
  },

  generateCustomVoice(payload: CustomVoiceRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/custom-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateVoiceDesign(payload: VoiceDesignRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/voice-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateWithModel(payload: UniversalInferenceRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateHybridCloneInstruct(payload: HybridCloneInstructRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/hybrid-clone-instruct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  uploadAudio(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    return request<UploadResponse>("/api/uploads/reference-audio", {
      method: "POST",
      body: formData,
    });
  },

  createCloneFromSample(payload: CloneFromSampleRequest): Promise<ClonePromptRecord> {
    return request<ClonePromptRecord>("/api/clone-prompts/from-generated-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  createCloneFromUpload(payload: CloneFromUploadRequest): Promise<ClonePromptRecord> {
    return request<ClonePromptRecord>("/api/clone-prompts/from-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  transcribeAudio(audioPath: string): Promise<AudioTranscriptionResponse> {
    return request<AudioTranscriptionResponse>("/api/transcriptions/reference-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_path: audioPath }),
    });
  },

  createPreset(payload: CreatePresetRequest): Promise<CharacterPreset> {
    return request<CharacterPreset>("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateFromPreset(presetId: string, payload: GenerateFromPresetRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>(`/api/presets/${presetId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  createDataset(payload: CreateDatasetRequest): Promise<FineTuneDataset> {
    return request<FineTuneDataset>("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  prepareDataset(datasetId: string, payload: PrepareDatasetRequest): Promise<FineTuneDataset> {
    return request<FineTuneDataset>(`/api/datasets/${datasetId}/prepare-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  createFineTuneRun(payload: CreateFineTuneRunRequest): Promise<FineTuneRun> {
    return request<FineTuneRun>("/api/finetune-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
