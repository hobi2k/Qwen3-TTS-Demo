import type {
  AudioTranscriptionResponse,
  AudioConvertRequest,
  AudioSeparationRequest,
  AudioToolCapability,
  AudioToolJob,
  AudioToolResponse,
  AudioTranslateRequest,
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
  GenerationDeleteResponse,
  GenerateFromPresetRequest,
  GenerationRecord,
  GenerationResponse,
  HealthResponse,
  HybridCloneInstructRequest,
  ModelInfo,
  MusicCompositionRequest,
  PrepareDatasetRequest,
  RvcTrainingRequest,
  RvcTrainingResponse,
  S2ProGenerateRequest,
  S2ProRuntimeResponse,
  S2ProVoiceCreateRequest,
  S2ProVoiceRecord,
  SoundEffectRequest,
  SpeakerInfo,
  UploadResponse,
  UniversalInferenceRequest,
  VoiceBoxCloneRequest,
  VoiceBoxFusionRequest,
  VoiceChangerBatchRequest,
  VoiceChangerRequest,
  VoiceChangerModelInfo,
  VoiceDesignRequest,
  VoiceModelBlendRequest,
} from "./types";

function apiCandidates(path: string): string[] {
  const configuredBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const candidates = [path];

  if (configuredBase) {
    candidates.push(`${configuredBase}${path}`);
  }

  return Array.from(new Set(candidates));
}

function friendlyError(status: number, detail: string): string {
  if (status === 404 && detail.toLowerCase() === "not found") {
    return "서버 API를 찾지 못했습니다. 백엔드가 켜져 있는지 확인해 주세요.";
  }
  return detail;
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

async function readResponseDetail(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;

  if (isJsonResponse(response)) {
    try {
      const payload = (await response.json()) as { detail?: string };
      return payload.detail || fallback;
    } catch {
      return response.statusText || fallback;
    }
  }

  const body = await response.text();
  const trimmed = body.trim().toLowerCase();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    return "프런트가 백엔드 API 대신 화면 HTML을 받았습니다. 개발 서버 프록시와 백엔드 포트를 확인해 주세요.";
  }

  return response.statusText || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!isJsonResponse(response)) {
    throw new Error(await readResponseDetail(response));
  }

  return (await response.json()) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError = "서버 API에 연결하지 못했습니다.";

  for (const url of apiCandidates(path)) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const detail = await readResponseDetail(response);
        lastError = friendlyError(response.status, detail);
        if (response.status === 404 && path.startsWith("/api/")) {
          continue;
        }
        throw new Error(lastError);
      }

      return await readJson<T>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : lastError;
      lastError = message === "Failed to fetch" ? "서버 API에 연결하지 못했습니다. 백엔드가 켜져 있는지 확인해 주세요." : message;
    }
  }

  throw new Error(lastError);
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

  deleteHistoryRecord(recordId: string): Promise<GenerationDeleteResponse> {
    return request<GenerationDeleteResponse>(`/api/history/${recordId}`, {
      method: "DELETE",
    });
  },

  deleteHistoryBatch(ids: string[]): Promise<GenerationDeleteResponse> {
    return request<GenerationDeleteResponse>("/api/history/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  },

  deleteAllHistory(): Promise<GenerationDeleteResponse> {
    return request<GenerationDeleteResponse>("/api/history", {
      method: "DELETE",
    });
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

  audioToolCapabilities(): Promise<AudioToolCapability[]> {
    return request<AudioToolCapability[]>("/api/audio-tools/capabilities");
  },

  audioToolJobs(): Promise<AudioToolJob[]> {
    return request<AudioToolJob[]>("/api/audio-tools/jobs");
  },

  voiceChangerModels(): Promise<VoiceChangerModelInfo[]> {
    return request<VoiceChangerModelInfo[]>("/api/audio-tools/voice-models");
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

  createVoiceBoxFusion(payload: VoiceBoxFusionRequest): Promise<FineTuneRun> {
    return request<FineTuneRun>("/api/voicebox/fusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateVoiceBoxClone(payload: VoiceBoxCloneRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/voicebox-clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateVoiceBoxCloneInstruct(payload: VoiceBoxCloneRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/generate/voicebox-clone-instruct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  s2ProCapabilities(): Promise<S2ProRuntimeResponse> {
    return request<S2ProRuntimeResponse>("/api/s2-pro/capabilities");
  },

  s2ProVoices(): Promise<S2ProVoiceRecord[]> {
    return request<S2ProVoiceRecord[]>("/api/s2-pro/voices");
  },

  createS2ProVoice(payload: S2ProVoiceCreateRequest): Promise<S2ProVoiceRecord> {
    return request<S2ProVoiceRecord>("/api/s2-pro/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateS2Pro(payload: S2ProGenerateRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/s2-pro/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateSoundEffect(payload: SoundEffectRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/sound-effects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  generateAceStepMusic(payload: MusicCompositionRequest): Promise<GenerationResponse> {
    return request<GenerationResponse>("/api/music/ace-step/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  changeVoice(payload: VoiceChangerRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/voice-changer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  changeVoiceBatch(payload: VoiceChangerBatchRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/voice-changer/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  blendVoiceModels(payload: VoiceModelBlendRequest): Promise<RvcTrainingResponse> {
    return request<RvcTrainingResponse>("/api/audio-tools/voice-models/blend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  trainRvcModel(payload: RvcTrainingRequest): Promise<RvcTrainingResponse> {
    return request<RvcTrainingResponse>("/api/audio-tools/rvc-train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  convertAudio(payload: AudioConvertRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  separateAudio(payload: AudioSeparationRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/separate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  translateAudio(payload: AudioTranslateRequest): Promise<AudioToolResponse> {
    return request<AudioToolResponse>("/api/audio-tools/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
