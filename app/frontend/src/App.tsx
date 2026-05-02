"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { I18nProvider, useTranslation } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { StudioTopBar } from "./components/StudioTopBar";
import { Providers } from "./components/Providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, AudioWaveform, Sparkles, Clock, Wand2, Mic, Layers, Music2, Music, Drum, AudioLines, Scissors, FileAudio, Volume2, GitMerge, Database, Cog, BookOpen, Home as HomeIcon, Library, FolderOpen, Headphones, Save } from "lucide-react";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceResultHeader,
  WorkspaceFieldLabel,
} from "./components/workspace";
import { VoiceAssetAvatar, DeleteAssetButton, DownloadAssetButton } from "./components/voice-asset";
import { toast } from "sonner";

import { api, apiUrl } from "./lib/api";
import {
  AudioCard,
  basenameFromPath,
  createEmptyDatasetSample,
  createGenerationControls,
  fileUrlFromPath,
  FineTuneMode,
  getAudioDownloadName,
  formatDate,
  GenerationControlsEditor,
  GenerationControlsForm,
  getGuideSections,
  getModeLabel,
  getRecordDisplayTitle,
  LanguageSelect,
  mediaUrl,
  MiniWaveform,
  normalizeDatasetPath,
  parseDatasetSampleBulkInput,
  PRODUCT_PAGES,
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
  AceStepTrainingResponse,
  AceStepUnderstandResponse,
  AudioDatasetBuildResponse,
  AsrModelInfo,
  AudioAsset,
  AudioToolCapability,
  AudioToolResponse,
  CharacterPreset,
  ClonePromptRecord,
  FineTuneDataset,
  AudioDatasetRecord,
  FineTuneRun,
  GenerationRecord,
  HealthResponse,
  MMAudioTrainingResponse,
  ModelInfo,
  S2ProRuntimeResponse,
  S2ProTrainingResponse,
  S2ProVoiceRecord,
  SpeakerInfo,
  UploadResponse,
  VibeVoiceASRResponse,
  VibeVoiceModelAsset,
  VibeVoiceModelToolResponse,
  VibeVoiceRuntimeResponse,
  VibeVoiceTrainingResponse,
  VoiceChangerModelInfo,
} from "./lib/types";

const DEFAULT_ASR_MODELS: AsrModelInfo[] = [
  { id: "Qwen/Qwen3-ASR-1.7B", label: "Qwen3-ASR 1.7B", description: "정확도 우선" },
  { id: "Qwen/Qwen3-ASR-0.6B", label: "Qwen3-ASR 0.6B", description: "가벼운 전사" },
];

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
  | "format_sample"
  | "lora_train";

type VoiceLibraryView = "trained" | "qwen" | "s2pro" | "rvc" | "datasets";
type DatasetLibraryTarget = "qwen" | "s2_pro" | "vibevoice" | "rvc" | "mmaudio" | "ace_step";
type GalleryFilter = "all" | "speech" | "qwen_preset" | "s2pro_preset" | "effect" | "music" | "rvc" | "utility";

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
  | "ace_lora_train"
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
  ace_lora_train: "lora_train",
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
    prompt: "dark trap, distorted 808 bass, sparse piano, hushed female vocal hook, tense cinematic atmosphere",
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

type SoundEffectPromptLanguage = "ko" | "ja" | "en";

const SOUND_EFFECT_PROMPT_LANGUAGES: Array<{ value: SoundEffectPromptLanguage; label: string }> = [
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

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
  const { t } = useTranslation();
  if (!prompt) {
    return (
      <div className="rounded-md border border-dashed border-line bg-sunken/40 p-3 flex flex-col gap-1">
        <strong className="text-sm font-medium text-ink">{title}</strong>
        <p className="text-xs text-ink-muted">
          {t("promptSummary.empty", "아직 저장된 목소리 스타일이 없습니다. 먼저 참조 음성으로 스타일을 만들어 주세요.")}
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">
            {t("promptSummary.styleEyebrow", "목소리 스타일")}
          </span>
          <h3 className="text-sm font-medium text-ink">{title}</h3>
        </div>
        {actionLabel && onAction ? (
          <Button variant="outline" size="sm" onClick={onAction} type="button">
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">
            {t("promptSummary.sourceLabel", "생성 방식")}
          </span>
          <strong className="text-xs font-medium text-ink">
            {prompt.source_type === "generated_sample"
              ? t("promptSummary.sourceFromGenerated", "생성 음성에서 추출")
              : t("promptSummary.sourceFromReference", "참조 음성에서 추출")}
          </strong>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">
            {t("promptSummary.modeLabel", "모드")}
          </span>
          <strong className="text-xs font-medium text-ink">
            {prompt.x_vector_only_mode
              ? t("promptSummary.modeLight", "가벼운 복제")
              : t("promptSummary.modeFull", "전체 스타일")}
          </strong>
        </div>
      </div>
      <p className="text-xs text-ink-muted">{prompt.reference_text}</p>
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

function storageFriendlyName(value: string): string {
  const stem = basenameFromPath(value).replace(/\.[^.]+$/, "");
  return stem.replace(/[^\p{L}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "") || "rvc-voice";
}

function AudioUploadField({
  id,
  buttonLabel,
  statusLabel,
  accept = "audio/*",
  onFile,
}: {
  id: string;
  buttonLabel: string;
  statusLabel: string;
  accept?: string;
  onFile: (file: File) => void | Promise<void>;
}) {
  return (
    <div className="flex h-11 w-full items-center gap-3 rounded-md border border-line bg-canvas/60 px-2">
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void onFile(file);
          }
        }}
      />
      <button
        type="button"
        className="inline-flex h-8 min-w-[104px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink transition hover:border-line-strong hover:bg-canvas"
        onClick={() => document.getElementById(id)?.click()}
      >
        {buttonLabel}
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{statusLabel}</span>
    </div>
  );
}

const ACE_VOCAL_LANGUAGE_OPTIONS = [
  { value: "unknown", label: "Auto / unknown" },
  { value: "English", label: "English" },
  { value: "Korean", label: "Korean" },
  { value: "Japanese", label: "Japanese" },
  { value: "Chinese", label: "Chinese" },
  { value: "Cantonese", label: "Cantonese" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Russian", label: "Russian" },
];

type AceCommonGenerationForm = {
  audio_duration: string;
  infer_step: string;
  guidance_scale: string;
  manual_seeds: string;
  bpm: string;
  keyscale: string;
  timesignature: string;
  batch_size: string;
  audio_format: string;
  instrumental: boolean;
};

function AcePromptLaneGrid({
  prompt,
  lyrics,
  vocalLanguage,
  lyricsOptional = false,
  onPromptChange,
  onLyricsChange,
  onVocalLanguageChange,
}: {
  prompt: string;
  lyrics: string;
  vocalLanguage: string;
  lyricsOptional?: boolean;
  onPromptChange: (value: string) => void;
  onLyricsChange: (value: string) => void;
  onVocalLanguageChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
      <section className="flex min-h-[228px] flex-col gap-2 rounded-md border border-line bg-canvas/60 p-3">
        <div className="flex min-h-9 items-center gap-2">
          <b className="font-mono text-xs uppercase tracking-allcaps text-ink-muted">STYLE</b>
          <span className="text-[10px] text-ink-subtle">prompt lane</span>
        </div>
        <Textarea
          className="h-40 min-h-40 flex-1 resize-none border-line bg-canvas"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </section>
      <section className="flex min-h-[228px] flex-col gap-2 rounded-md border border-line bg-canvas/60 p-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <b className="font-mono text-xs uppercase tracking-allcaps text-ink-muted">LYRICS</b>
            <span className="text-[10px] text-ink-subtle">vocal lane{lyricsOptional ? " · optional" : ""}</span>
          </div>
          <Select value={vocalLanguage || "unknown"} onValueChange={onVocalLanguageChange}>
            <SelectTrigger className="h-8 w-[168px]">
              <SelectValue placeholder="Vocal language" />
            </SelectTrigger>
            <SelectContent>
              {ACE_VOCAL_LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          className="h-40 min-h-40 flex-1 resize-none border-line bg-canvas"
          value={lyrics}
          onChange={(event) => onLyricsChange(event.target.value)}
        />
      </section>
    </div>
  );
}

function AceCommonGenerationControls({
  form,
  onChange,
}: {
  form: AceCommonGenerationForm;
  onChange: (patch: Partial<AceCommonGenerationForm>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas/60 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Duration</Label>
          <Input value={form.audio_duration} onChange={(event) => onChange({ audio_duration: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Steps</Label>
          <Input value={form.infer_step} onChange={(event) => onChange({ infer_step: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Guidance</Label>
          <Input value={form.guidance_scale} onChange={(event) => onChange({ guidance_scale: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Seed</Label>
          <Input value={form.manual_seeds} onChange={(event) => onChange({ manual_seeds: event.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">BPM</Label>
          <Input placeholder="auto" value={form.bpm} onChange={(event) => onChange({ bpm: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Key</Label>
          <Input placeholder="auto" value={form.keyscale} onChange={(event) => onChange({ keyscale: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Time signature</Label>
          <Input placeholder="auto" value={form.timesignature} onChange={(event) => onChange({ timesignature: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">Format</Label>
          <Select value={form.audio_format || undefined} onValueChange={(audio_format) => onChange({ audio_format })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="wav">wav</SelectItem>
              <SelectItem value="flac">flac</SelectItem>
              <SelectItem value="mp3">mp3</SelectItem>
              <SelectItem value="ogg">ogg</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="m-0 flex min-h-9 items-center gap-2 self-end text-xs text-ink-muted">
          <Switch checked={form.instrumental} onCheckedChange={(instrumental) => onChange({ instrumental })} />
          Instrumental
        </label>
      </div>
    </div>
  );
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

function galleryFilterForRecord(record: GenerationRecord): GalleryFilter {
  const mode = record.mode.toLowerCase();
  const meta = record.meta || {};
  if (mode.includes("ace") || mode.includes("music")) return "music";
  if (mode.includes("sound") || mode.includes("mmaudio")) return "effect";
  if (mode.includes("voice_changer") || mode.includes("rvc")) return "rvc";
  if (mode.includes("audio_separation") || mode.includes("denoise") || mode.includes("convert")) return "utility";
  if (
    mode.startsWith("s2_pro") &&
    (typeof meta.s2_pro_reference_id === "string" || typeof meta.reference_id === "string" || Boolean(record.source_ref_audio_path))
  ) {
    return "s2pro_preset";
  }
  if (
    mode.includes("preset") ||
    mode.includes("hybrid") ||
    Boolean(record.preset_id) ||
    typeof meta.preset_id === "string" ||
    typeof meta.clone_prompt_path === "string"
  ) {
    return "qwen_preset";
  }
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

function audioDatasetTargetLabel(target: string): string {
  const labels: Record<string, string> = {
    qwen: "Qwen",
    s2_pro: "S2-Pro",
    vibevoice: "VibeVoice",
    rvc: "RVC",
    mmaudio: "MMAudio",
    ace_step: "ACE-Step",
  };
  return labels[target] || target;
}

function audioDatasetTargetShort(target: string): string {
  const labels: Record<string, string> = {
    qwen: "QW",
    s2_pro: "S2",
    vibevoice: "VB",
    rvc: "RV",
    mmaudio: "MM",
    ace_step: "AC",
  };
  return labels[target] || target.slice(0, 2).toUpperCase();
}

function clonePromptDisplayName(prompt: ClonePromptRecord): string {
  const sourceLabels: Record<string, string> = {
    voice_design: "목소리 설계 스타일",
    uploaded_reference: "업로드 스타일",
    generated_sample: "생성 음성 스타일",
  };
  const label = sourceLabels[prompt.source_type] || "Qwen 스타일";
  return `${label} · ${formatShortDate(prompt.created_at)}`;
}

function fineTuneRunIdFromModel(model: ModelInfo): string {
  const pathParts = model.model_id.replace(/\\/g, "/").split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || "";
  if (lastPart === "final" || lastPart.startsWith("checkpoint")) {
    return pathParts[pathParts.length - 2] || model.key.replace(/^ft_/, "");
  }
  return lastPart || model.key.replace(/^ft_/, "");
}

function vibeVoiceAssetKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    base_model: "Base model",
    asr_model: "ASR model",
    merged_model: "Merged model",
    model_file: "Model file",
    lora_adapter: "LoRA adapter",
  };
  return labels[kind] || kind;
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

function ToolDatasetBuilder({
  title,
  subtitle,
  source,
  setSource,
  assets,
  selectedPaths,
  onAddAsset,
  onRemoveAsset,
  folderPath,
  setFolderPath,
  datasetName,
  setDatasetName,
  onBuild,
  lastBuild,
  asrModelId,
  setAsrModelId,
  asrModels,
  preparedLabel,
  preparedPath,
  setPreparedPath,
  onUsePrepared,
}: {
  title: string;
  subtitle: string;
  source: "gallery" | "folder" | "prepared";
  setSource: (value: "gallery" | "folder" | "prepared") => void;
  assets: AudioAsset[];
  selectedPaths: string[];
  onAddAsset: (asset: AudioAsset) => void;
  onRemoveAsset: (path: string) => void;
  folderPath: string;
  setFolderPath: (value: string) => void;
  datasetName: string;
  setDatasetName: (value: string) => void;
  onBuild: () => void;
  lastBuild?: AudioDatasetBuildResponse | null;
  asrModelId: string;
  setAsrModelId: (value: string) => void;
  asrModels: AsrModelInfo[];
  preparedLabel?: string;
  preparedPath?: string;
  setPreparedPath?: (value: string) => void;
  onUsePrepared?: () => void;
}) {
  const selectedAssets = selectedPaths
    .map((path) => assets.find((asset) => asset.path === path))
    .filter((asset): asset is AudioAsset => Boolean(asset));

  return (
    <WorkspaceCard className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="max-w-4xl text-sm leading-relaxed text-ink-muted">{subtitle}</p>
      </div>

      <Tabs value={source} onValueChange={(value) => setSource(value as "gallery" | "folder" | "prepared")}>
        <TabsList className={`grid h-auto w-full gap-1 border border-line bg-canvas p-1 ${preparedLabel ? "grid-cols-3" : "grid-cols-2"}`}>
          <TabsTrigger value="gallery" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">
            생성 갤러리
          </TabsTrigger>
          <TabsTrigger value="folder" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">
            폴더 경로
          </TabsTrigger>
          {preparedLabel ? (
            <TabsTrigger value="prepared" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">
              {preparedLabel}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="gallery" className="m-0 mt-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <ServerAudioPicker assets={assets} selectedPath="" onSelect={onAddAsset} />
            <section className="rounded-md border border-line bg-canvas/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <strong className="text-sm font-medium text-ink">선택한 샘플</strong>
                  <p className="mt-1 text-xs text-ink-muted">전사가 없는 샘플은 ASR로 자동 전사됩니다.</p>
                </div>
                <Badge variant="outline">{selectedAssets.length}</Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Label className="text-xs font-medium text-ink-muted">ASR 모델</Label>
                <Select value={asrModelId} onValueChange={setAsrModelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {asrModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                {selectedAssets.length ? (
                  selectedAssets.map((asset) => (
                    <article key={asset.path} className="rounded-md border border-line bg-surface p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm font-medium text-ink">{asset.filename}</strong>
                          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{asset.transcript_text || asset.text_preview || "자동 전사 예정"}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveAsset(asset.path)}>
                          제거
                        </Button>
                      </div>
                      <audio controls className="mt-3 h-8 w-full" src={mediaUrl(asset.url)} />
                    </article>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-line bg-sunken/40 p-4 text-xs text-ink-muted">
                    왼쪽 생성 갤러리에서 학습에 넣을 음성을 선택하세요.
                  </p>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="folder" className="m-0 mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-ink-muted">샘플 폴더 경로</Label>
              <Input
                placeholder="/mnt/d/tts_data/my_voice/wavs"
                value={folderPath}
                onChange={(event) => setFolderPath(normalizeDatasetPath(event.target.value))}
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                폴더 안의 wav/mp3/flac 파일을 가져옵니다. 같은 이름의 txt/lab 파일이 있으면 전사로 쓰고, 없으면 선택한 ASR 모델로 전사합니다.
              </p>
            </div>
            <article className="rounded-md border border-line bg-canvas/60 p-3">
              <strong className="text-sm font-medium text-ink">정리 결과</strong>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                생성 후 `audio`, `lab_audio`, `train.jsonl`, `validation.jsonl`, `dataset.json`, `manifest.json`이 한 데이터셋 폴더에 모입니다.
              </p>
            </article>
          </div>
        </TabsContent>

        {preparedLabel ? (
          <TabsContent value="prepared" className="m-0 mt-4">
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-ink-muted">{preparedLabel} 경로</Label>
                <Input
                  placeholder="data/prepared/my_dataset"
                  value={preparedPath || ""}
                  onChange={(event) => setPreparedPath?.(normalizeDatasetPath(event.target.value))}
                />
                <p className="text-xs leading-relaxed text-ink-muted">
                  이미 전처리가 끝난 데이터는 다시 복사하지 않고 학습 탭으로 바로 연결합니다.
                </p>
              </div>
              <Button type="button" onClick={onUsePrepared} className="h-11 self-start lg:mt-6">
                학습으로 보내기
              </Button>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      {source !== "prepared" ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-ink-muted">데이터셋 이름</Label>
            <Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} />
          </div>
          <Button type="button" onClick={onBuild} className="self-end">
            데이터셋 만들기
          </Button>
        </div>
      ) : null}

      {lastBuild ? (
        <article className="rounded-md border border-line bg-accent-soft/40 p-3 text-sm text-ink">
          <strong className="font-medium">{lastBuild.name}</strong>
          <span className="ml-2 text-ink-muted">{audioDatasetTargetLabel(lastBuild.target)} · 샘플 {lastBuild.sample_count}개 준비됨</span>
        </article>
      ) : null}
    </WorkspaceCard>
  );
}

function TrainingDatasetConnector({
  title,
  target,
  datasets,
  activePath,
  pathLabel,
  onUse,
  onCreateDataset,
  guidance,
}: {
  title: string;
  target: "s2_pro" | "vibevoice" | "rvc" | "mmaudio" | "ace_step";
  datasets: AudioDatasetRecord[];
  activePath: string;
  pathLabel: string;
  onUse: (dataset: AudioDatasetRecord) => void;
  onCreateDataset: () => void;
  guidance: string;
}) {
  const compatibleDatasets = datasets.filter((dataset) => dataset.target === target);
  const [selectedId, setSelectedId] = useState("");
  const selectedDataset =
    compatibleDatasets.find((dataset) => dataset.id === selectedId) ??
    compatibleDatasets.find((dataset) => dataset.dataset_root_path === activePath || dataset.audio_dir_path === activePath) ??
    compatibleDatasets[0] ??
    null;

  return (
    <WorkspaceCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-muted">{guidance}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-ink-muted">준비된 데이터셋</Label>
          <Select
            value={selectedDataset?.id || ""}
            onValueChange={setSelectedId}
            disabled={!compatibleDatasets.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="먼저 데이터셋을 준비하세요" />
            </SelectTrigger>
            <SelectContent>
              {compatibleDatasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  {dataset.name} · {dataset.sample_count} samples
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => selectedDataset && onUse(selectedDataset)} disabled={!selectedDataset} className="self-end">
          학습 입력에 적용
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="rounded-md border border-line bg-canvas/60 px-3 py-2">
          <span className="text-[11px] uppercase tracking-allcaps text-ink-subtle">{pathLabel}</span>
          <p className="mt-1 text-sm text-ink">
            {activePath ? "학습 입력에 데이터셋이 연결되어 있습니다." : "아직 연결된 데이터셋이 없습니다."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCreateDataset} className="self-end">
          데이터셋 만들기
        </Button>
      </div>
    </WorkspaceCard>
  );
}

function StudioApp() {
  const { t, locale } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [voiceGalleryView, setVoiceGalleryView] = useState<VoiceLibraryView>("trained");
  const [datasetLibraryTarget, setDatasetLibraryTarget] = useState<DatasetLibraryTarget>("qwen");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [activeGuideIndex, setActiveGuideIndex] = useState(0);
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(true);
  const [ttsSideView, setTtsSideView] = useState<"settings" | "history">("settings");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [asrModels, setAsrModels] = useState<AsrModelInfo[]>(DEFAULT_ASR_MODELS);
  const [asrModelId, setAsrModelId] = useState("Qwen/Qwen3-ASR-1.7B");
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<string[]>([]);
  const [clonePrompts, setClonePrompts] = useState<ClonePromptRecord[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [datasets, setDatasets] = useState<FineTuneDataset[]>([]);
  const [audioDatasets, setAudioDatasets] = useState<AudioDatasetRecord[]>([]);
  const [selectedMMAudioDatasetId, setSelectedMMAudioDatasetId] = useState("");
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
  const [toolDatasetSource, setToolDatasetSource] = useState<Record<string, "gallery" | "folder" | "prepared">>({
    s2_pro: "gallery",
    vibevoice: "gallery",
    rvc: "gallery",
    mmaudio: "gallery",
    ace_step: "folder",
  });
  const [toolDatasetSamples, setToolDatasetSamples] = useState<Record<string, string[]>>({
    s2_pro: [],
    vibevoice: [],
    rvc: [],
    mmaudio: [],
    ace_step: [],
  });
  const [toolDatasetFolders, setToolDatasetFolders] = useState<Record<string, string>>({
    s2_pro: "",
    vibevoice: "",
    rvc: "",
    mmaudio: "",
    ace_step: "",
  });
  const [toolDatasetNames, setToolDatasetNames] = useState<Record<string, string>>({
    s2_pro: "s2pro-voice-dataset",
    vibevoice: "vibevoice-voice-dataset",
    rvc: "rvc-voice-dataset",
    mmaudio: "mmaudio-effect-dataset",
    ace_step: "ace-step-music-dataset",
  });
  const [toolDatasetLastBuild, setToolDatasetLastBuild] = useState<AudioDatasetBuildResponse | null>(null);
  const [selectedClonePrompt, setSelectedClonePrompt] = useState<ClonePromptRecord | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    language: "Korean",
    notes: "",
  });
  const [createS2ProWithPreset, setCreateS2ProWithPreset] = useState(false);
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
  const [vibeVoiceModelAssets, setVibeVoiceModelAssets] = useState<VibeVoiceModelAsset[]>([]);
  const [s2ProMode, setS2ProMode] = useState<S2ProMode>("tagged");
  const [s2ProVoices, setS2ProVoices] = useState<S2ProVoiceRecord[]>([]);
  const [selectedS2VoiceId, setSelectedS2VoiceId] = useState("");
  const [s2TagSearch, setS2TagSearch] = useState("");
  const [s2ProForm, setS2ProForm] = useState({
    runtime_source: "local" as "local" | "api",
    output_name: "s2pro-voice-tts",
    text: "[breath] 오늘은 조금 천천히 말해볼게. [super happy] 그래도 결국 해냈어!",
    language: "Korean",
    reference_audio_path: "",
    reference_text: "",
    speaker_script:
      "<|speaker:0|> [calm] 오늘 회의는 여기서 정리하겠습니다.\n<|speaker:1|> [excited] 좋아요, 다음 단계로 바로 넘어가죠.",
    instruction: "",
    temperature: "0.7",
    top_p: "0.8",
    max_tokens: "2048",
  });
  const [s2ProVoiceForm, setS2ProVoiceForm] = useState({
    name: "새-s2pro-목소리",
    runtime_source: "local" as "local" | "api",
    reference_audio_path: "",
    reference_text: "",
    language: "Korean",
    notes: "",
    create_qwen_prompt: true,
  });
  const [s2ProCloneSource, setS2ProCloneSource] = useState<"gallery" | "upload">("gallery");
  const [s2ProUploadedRef, setS2ProUploadedRef] = useState<UploadResponse | null>(null);
  const [lastS2ProRecord, setLastS2ProRecord] = useState<GenerationRecord | null>(null);
  const [s2ProTrainSource, setS2ProTrainSource] = useState<"protos" | "lab_audio_dir">("protos");
  const [s2ProTrainResult, setS2ProTrainResult] = useState<S2ProTrainingResponse | null>(null);
  const [s2ProTrainForm, setS2ProTrainForm] = useState({
    output_name: "my-s2pro-voice",
    training_type: "lora" as "lora" | "full",
    proto_dir: "",
    lab_audio_dir: "",
    pretrained_ckpt_path: "",
    lora_config: "r_8_alpha_16",
    merge_lora: true,
    max_steps: "10000",
    val_check_interval: "100",
    batch_size: "4",
    accumulate_grad_batches: "1",
    learning_rate: "0.0001",
    num_workers: "4",
    precision: "bf16-true",
    accelerator: "gpu",
    devices: "auto",
    strategy_backend: "nccl",
    codec_checkpoint_path: "",
    vq_batch_size: "16",
    vq_num_workers: "1",
  });
  const [vibeVoiceRuntime, setVibeVoiceRuntime] = useState<VibeVoiceRuntimeResponse | null>(null);
  const [vibeVoiceUploadedRef, setVibeVoiceUploadedRef] = useState<UploadResponse | null>(null);
  const [lastVibeVoiceRecord, setLastVibeVoiceRecord] = useState<GenerationRecord | null>(null);
  const [vibeVoiceAsrResult, setVibeVoiceAsrResult] = useState<VibeVoiceASRResponse | null>(null);
  const [vibeVoiceModelToolResult, setVibeVoiceModelToolResult] = useState<VibeVoiceModelToolResponse | null>(null);
  const [vibeVoiceAsrSource, setVibeVoiceAsrSource] = useState<"audio" | "folder" | "dataset">("audio");
  const [vibeVoiceTtsForm, setVibeVoiceTtsForm] = useState({
    model_profile: "realtime" as "realtime" | "tts_15b" | "tts_7b",
    output_name: "vibevoice-tts",
    text: "오늘은 조금 낮은 목소리로, 또렷하지만 자연스럽게 말해볼게.",
    speaker_name: "Speaker 1",
    speaker_audio_path: "",
    speaker_names: "Speaker 1",
    speaker_audio_paths: "",
    checkpoint_path: "",
    cfg_scale: "1.3",
    ddpm_steps: "5",
    seed: "",
    device: "auto",
    attn_implementation: "auto",
    inference_steps: "10",
    max_length_times: "2.0",
    disable_prefill: false,
    show_progress: false,
    max_new_tokens: "2048",
    output_format: "wav",
    extra_args: "",
  });
  const [vibeVoiceAsrForm, setVibeVoiceAsrForm] = useState({
    audio_path: "",
    audio_dir: "",
    dataset: "",
    split: "test",
    max_duration: "3600",
    language: "auto",
    task: "transcribe",
    context_info: "",
    device: "auto",
    precision: "auto",
    attn_implementation: "auto",
    batch_size: "2",
    max_new_tokens: "256",
    temperature: "0.0",
    top_p: "1.0",
    num_beams: "1",
    return_timestamps: false,
  });
  const [vibeVoiceTrainResult, setVibeVoiceTrainResult] = useState<VibeVoiceTrainingResponse | null>(null);
  const [vibeVoiceTrainForm, setVibeVoiceTrainForm] = useState({
    training_mode: "tts_lora" as "asr_lora" | "tts_lora",
    output_name: "vibevoice-tts-lora",
    model_path: "",
    data_dir: "",
    dataset_config_name: "",
    train_split_name: "train",
    eval_split_name: "validation",
    text_column_name: "text",
    audio_column_name: "audio",
    voice_prompts_column_name: "voice_prompts",
    train_jsonl: "",
    validation_jsonl: "",
    eval_split_size: "0",
    ignore_verifications: false,
    max_length: "",
    nproc_per_node: "1",
    num_train_epochs: "3",
    per_device_train_batch_size: "1",
    gradient_accumulation_steps: "4",
    learning_rate: "0.0001",
    warmup_ratio: "0.1",
    weight_decay: "0.01",
    max_grad_norm: "1.0",
    logging_steps: "10",
    save_steps: "100",
    lora_r: "16",
    lora_alpha: "32",
    lora_dropout: "0.05",
    lora_target_modules: "q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj",
    lora_wrap_diffusion_head: false,
    train_diffusion_head: true,
    train_connectors: false,
    layers_to_freeze: "",
    ddpm_batch_mul: "4",
    ce_loss_weight: "0.04",
    diffusion_loss_weight: "1.4",
    debug_save: false,
    debug_ce_details: false,
    bf16: true,
    gradient_checkpointing: true,
    use_customized_context: true,
    max_audio_length: "",
    report_to: "none",
    extra_args: "",
  });
  const [vibeVoiceModelToolForm, setVibeVoiceModelToolForm] = useState({
    tool: "merge" as "merge" | "verify_merge" | "convert_nnscaler",
    base_model_path: "data/models/vibevoice/VibeVoice-1.5B",
    checkpoint_path: "",
    output_name: "merged-vibevoice",
    output_format: "safetensors" as "safetensors" | "bin",
    nnscaler_checkpoint_path: "",
    config_path: "",
  });
  const [vibeVoiceModelToolSource, setVibeVoiceModelToolSource] = useState({
    base: "library" as "library" | "path",
    checkpoint: "library" as "library" | "path",
    nnscaler: "library" as "library" | "path",
  });
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
  const [mmaudioTrainResult, setMMAudioTrainResult] = useState<MMAudioTrainingResponse | null>(null);
  const [mmaudioTrainForm, setMMAudioTrainForm] = useState({
    output_name: "my-mmaudio-run",
    model: "small_16k",
    weights_path: "",
    checkpoint_path: "",
    data_mode: "configured" as "configured" | "example",
    nproc_per_node: "1",
    num_iterations: "10000",
    batch_size: "1",
    learning_rate: "0.0001",
    compile: false,
    debug: false,
    save_weights_interval: "1000",
    save_checkpoint_interval: "1000",
    val_interval: "5000",
    eval_interval: "20000",
  });
  const [aceStepForm, setAceStepForm] = useState({
    output_name: "midnight-city-demo",
    prompt: "Korean city pop, warm analog synths, clean female vocal, night drive, glossy drums, melodic bass",
    lyrics:
      "[verse]\n오늘 밤도 불빛은 천천히 흐르고\n창밖의 도시는 말없이 반짝여\n\n[chorus]\n우린 멀리 가도 같은 노래를 기억해\n끝나지 않을 밤처럼 다시 시작해",
    vocal_language: "Korean",
    instrumental: false,
    bpm: "",
    keyscale: "",
    timesignature: "",
    batch_size: "1",
    audio_format: "wav",
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
    chunk_mask_mode: "auto",
    repaint_latent_crossfade_frames: "10",
    repaint_wav_crossfade_sec: "0.0",
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
    vocal_language: "unknown",
  });
  const [aceStepUnderstandResult, setAceStepUnderstandResult] = useState<AceStepUnderstandResponse | null>(null);
  const [aceStepTrainSource, setAceStepTrainSource] = useState<"tensors" | "audio_dir" | "dataset_json">("tensors");
  const [aceStepTrainResult, setAceStepTrainResult] = useState<AceStepTrainingResponse | null>(null);
  const [aceStepTrainForm, setAceStepTrainForm] = useState({
    output_name: "my-ace-style",
    adapter_type: "lokr" as "lora" | "lokr",
    trainer_mode: "fixed" as "fixed" | "vanilla",
    tensor_dir: "",
    audio_dir: "",
    dataset_json: "",
    model_variant: "turbo",
    device: "auto",
    precision: "auto" as "auto" | "bf16" | "fp16" | "fp32",
    max_duration: "240",
    learning_rate: "0.03",
    batch_size: "1",
    gradient_accumulation: "4",
    epochs: "500",
    save_every: "10",
    seed: "42",
    num_workers: "4",
    gradient_checkpointing: true,
    rank: "64",
    alpha: "128",
    dropout: "0.1",
    lokr_linear_dim: "64",
    lokr_linear_alpha: "128",
    lokr_factor: "-1",
    lokr_decompose_both: false,
    lokr_use_tucker: false,
    lokr_use_scalar: false,
    lokr_weight_decompose: true,
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
    setAsrModels(data.asr_models?.length ? data.asr_models : DEFAULT_ASR_MODELS);
    setAsrModelId((prev) => prev || data.health.default_asr_model || "Qwen/Qwen3-ASR-1.7B");
    setAudioAssets(data.audio_assets);
    setHistory(data.history);
    setClonePrompts(data.clone_prompts || []);
    setPresets(data.presets);
    setDatasets(data.datasets);
    setAudioDatasets(data.audio_datasets || []);
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
    try {
      setVibeVoiceRuntime(await api.vibeVoiceRuntime());
      setVibeVoiceModelAssets(await api.vibeVoiceModelAssets());
    } catch {
      setVibeVoiceRuntime(null);
      setVibeVoiceModelAssets([]);
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
  const vibeVoiceBaseAssets = vibeVoiceModelAssets.filter((asset) =>
    ["base_model", "merged_model", "model_file"].includes(asset.kind),
  );
  const vibeVoiceAdapterAssets = vibeVoiceModelAssets.filter((asset) => asset.kind === "lora_adapter");
  const vibeVoiceNnScalerAssets = vibeVoiceModelAssets.filter((asset) =>
    ["model_file", "merged_model", "lora_adapter"].includes(asset.kind),
  );
  const vibeVoiceTtsTrainingAssets = vibeVoiceModelAssets.filter(
    (asset) => ["base_model", "merged_model", "model_file"].includes(asset.kind) && !asset.name.toLowerCase().includes("asr"),
  );
  const vibeVoiceAsrTrainingAssets = vibeVoiceModelAssets.filter((asset) => asset.kind === "asr_model" || asset.name.toLowerCase().includes("asr"));
  const pageMeta = PRODUCT_PAGES[activeTab];
  const pageTitle = t(`page.${activeTab}.title`, pageMeta.title);
  const pageDescription = t(`page.${activeTab}.description`, pageMeta.description);
  const guideSections = getGuideSections(locale);
  const selectedGuideSection = guideSections[activeGuideIndex] ?? guideSections[0];
  const currentS2ProMode = isS2ProTab(activeTab) ? s2ProTabToMode(activeTab) : s2ProMode;
  const currentAceStepMode = isAceStepTab(activeTab) ? ACE_STEP_TAB_TO_MODE[activeTab] : aceStepMode;
  const aceComposerBars = makeWaveBars(`${aceStepForm.prompt}|${aceStepForm.lyrics}|${aceStepForm.audio_duration}`, 72);

  useEffect(() => {
    const firstBase = vibeVoiceBaseAssets[0]?.path;
    const firstAdapter = vibeVoiceAdapterAssets[0]?.path;
    setVibeVoiceModelToolForm((prev) => ({
      ...prev,
      base_model_path: prev.base_model_path || firstBase || "",
      checkpoint_path: prev.checkpoint_path || firstAdapter || "",
    }));
  }, [vibeVoiceBaseAssets[0]?.path, vibeVoiceAdapterAssets[0]?.path]);

  const galleryBuckets = {
    all: history.length,
    speech: history.filter((record) => galleryFilterForRecord(record) === "speech").length,
    qwen_preset: history.filter((record) => galleryFilterForRecord(record) === "qwen_preset").length,
    s2pro_preset: history.filter((record) => galleryFilterForRecord(record) === "s2pro_preset").length,
    effect: history.filter((record) => galleryFilterForRecord(record) === "effect").length,
    music: history.filter((record) => galleryFilterForRecord(record) === "music").length,
    rvc: history.filter((record) => galleryFilterForRecord(record) === "rvc").length,
    utility: history.filter((record) => galleryFilterForRecord(record) === "utility").length,
  };
  const filteredHistory = history.filter((record) => galleryFilter === "all" || galleryFilterForRecord(record) === galleryFilter);
  const datasetLibraryBuckets: Record<DatasetLibraryTarget, number> = {
    qwen: datasets.length,
    s2_pro: audioDatasets.filter((dataset) => dataset.target === "s2_pro").length,
    vibevoice: audioDatasets.filter((dataset) => dataset.target === "vibevoice").length,
    rvc: audioDatasets.filter((dataset) => dataset.target === "rvc").length,
    mmaudio: audioDatasets.filter((dataset) => dataset.target === "mmaudio").length,
    ace_step: audioDatasets.filter((dataset) => dataset.target === "ace_step").length,
  };
  const visibleAudioDatasets = audioDatasets.filter((dataset) => dataset.target === datasetLibraryTarget);
  const selectedS2Voice = s2ProVoices.find((voice) => voice.id === selectedS2VoiceId || voice.reference_id === selectedS2VoiceId) ?? null;
  function selectS2ProVoice(voiceId: string) {
    const voice = s2ProVoices.find((item) => item.id === voiceId || item.reference_id === voiceId);
    setSelectedS2VoiceId(voiceId);
    if (voice?.runtime_source) {
      setS2ProForm((prev) => ({ ...prev, runtime_source: voice.runtime_source }));
    }
  }
  function AsrModelSelect({ compact = false }: { compact?: boolean }) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-ink-muted">{t("asr.model.label", "음성 인식 모델")}</Label>
        <Select value={asrModelId} onValueChange={setAsrModelId}>
          <SelectTrigger className={compact ? "h-9" : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {asrModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
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
  function galleryPresetDescription(record: GenerationRecord): string {
    const filterKind = galleryFilterForRecord(record);
    const meta = record.meta || {};
    if (filterKind === "s2pro_preset") {
      const referenceId = String(meta.s2_pro_reference_id || meta.reference_id || meta.voice_id || "");
      const voice = s2ProVoices.find(
        (item) =>
          item.id === referenceId ||
          item.reference_id === referenceId ||
          item.reference_audio_path === record.source_ref_audio_path,
      );
      return voice ? `S2-Pro 프리셋 · ${voice.name}` : "S2-Pro 프리셋";
    }
    if (filterKind === "qwen_preset") {
      const clonePromptPath = typeof meta.clone_prompt_path === "string" ? meta.clone_prompt_path : "";
      const metaPresetId = typeof meta.preset_id === "string" ? meta.preset_id : "";
      const preset = presets.find(
        (item) =>
          item.id === record.preset_id ||
          item.id === metaPresetId ||
          (!!clonePromptPath && item.clone_prompt_path === clonePromptPath) ||
          item.reference_audio_path === record.source_ref_audio_path,
      );
      return preset ? `Qwen 프리셋 · ${preset.name}` : "Qwen 프리셋";
    }
    if (filterKind === "effect") return "사운드 이펙트";
    if (filterKind === "music") return "ACE-Step 음악";
    if (filterKind === "rvc") return "RVC 변환";
    if (filterKind === "utility") return "정제/분리 결과";
    return "음성 생성";
  }
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
  const selectedAudioSeparationAsset = audioSeparationForm.audio_path ? audioAssetByPath.get(audioSeparationForm.audio_path) ?? null : null;
  const selectedAudioSeparationName =
    selectedAudioSeparationAsset?.filename ||
    (audioToolUpload?.path === audioSeparationForm.audio_path ? audioToolUpload.filename : "") ||
    basenameFromPath(audioSeparationForm.audio_path);
  const separationModelHelp =
    audioSeparationForm.model_profile === "vocal_rvc"
      ? t("separation.modelHelp.vocalRvc", "Applio/RVC 변환 전에 보컬만 뽑기 위한 프리셋입니다. 일반 보컬/반주 분리와 목적은 겹치지만, RVC 전처리용 설정을 묶어 둔 선택지입니다.")
      : audioSeparationForm.model_profile === "demucs_4stem"
        ? t("separation.modelHelp.demucs", "보컬, 드럼, 베이스, 기타/기타 stem을 나누는 다중 stem 분리입니다. RVC 보컬 추출용 기본 선택은 아닙니다.")
        : t("separation.modelHelp.roformer", "일반 보컬/반주 분리 기본값입니다. 단일 Roformer 모델로 보컬과 나머지 소리를 나눕니다.");
  const selectedApplioBatchAssets = applioBatchPaths.map((path) => audioAssetByPath.get(path)).filter((asset): asset is AudioAsset => Boolean(asset));
  const selectedApplioBatchExternalPaths = applioBatchPaths.filter((path) => !audioAssetByPath.has(path));
  const selectedBlendModelA = voiceChangerModels.find((item) => item.model_path === applioBlendForm.model_path_a) ?? null;
  const selectedBlendModelB = voiceChangerModels.find((item) => item.model_path === applioBlendForm.model_path_b) ?? null;
  const selectedMMAudioDataset = audioDatasets.find((dataset) => dataset.id === selectedMMAudioDatasetId && dataset.target === "mmaudio") ?? null;
  const selectedDatasetReferenceAsset = datasetForm.ref_audio_path ? audioAssetByPath.get(datasetForm.ref_audio_path) ?? null : null;
  const selectedDatasetSampleAssets = datasetSamples
    .filter((sample) => sample.audio_path.trim())
    .map((sample, index) => ({ sample, index, asset: audioAssetByPath.get(sample.audio_path) ?? null }));
  const rvcTrainSourceReady = Boolean(rvcTrainForm.dataset_path.trim());
  const filteredSoundEffectLibrary = SOUND_EFFECT_LIBRARY.filter((item) => {
    const query = audioEffectsSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.title} ${item.subtitle} ${item.prompt} ${Object.values(item.prompts || {}).join(" ")}`.toLowerCase().includes(query);
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
    const result = await api.transcribeAudio(audioPath, asrModelId);
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
    const metadataText = asset.transcript_text?.trim() || assetTextByPath.get(asset.path)?.trim() || "";
    setS2ProForm((prev) => ({
      ...prev,
      reference_audio_path: asset.path,
      reference_text: metadataText || prev.reference_text,
    }));
    setS2ProVoiceForm((prev) => ({
      ...prev,
      reference_audio_path: asset.path,
      reference_text: metadataText || prev.reference_text,
      name: prev.name === "새-s2pro-목소리" ? basenameFromPath(asset.path).replace(/\.[^.]+$/, "") : prev.name,
    }));
    if (metadataText) {
      setMessage(`${asset.filename}의 저장된 대사를 참조 텍스트로 불러왔습니다.`);
      return;
    }
    void runAction(async () => {
      const result = await api.transcribeAudio(asset.path, asrModelId);
      setS2ProVoiceForm((prev) => ({ ...prev, reference_text: result.text }));
      setS2ProForm((prev) => ({ ...prev, reference_text: result.text }));
      setMessage(result.simulation ? "전사 placeholder가 채워졌습니다. 실제 문장으로 수정하세요." : `${asset.filename}을 전사해 참조 텍스트로 채웠습니다.`);
    });
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
      const transcription = await api.transcribeAudio(result.path, asrModelId);
      setS2ProVoiceForm((prev) => ({ ...prev, reference_text: transcription.text }));
      await refreshAll();
      setMessage(transcription.simulation ? `${result.filename}을 불러오고 전사 placeholder를 채웠습니다.` : `${result.filename}을 불러오고 Qwen3-ASR 전사로 참조 텍스트를 채웠습니다.`);
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
      setS2ProForm((prev) => ({ ...prev, runtime_source: voice.runtime_source }));
      await refreshAll();
      setMessage(`${voice.name}을 S2-Pro 목소리로 저장했습니다.`);
    });
  }

  function handleCreateS2ProVoice(event?: FormEvent) {
    event?.preventDefault();
    runAction(async () => {
      if (!s2ProVoiceForm.reference_audio_path || !s2ProVoiceForm.name.trim() || !s2ProVoiceForm.reference_text.trim()) {
        setMessage("S2-Pro 목소리로 저장하려면 참조 음성, 목소리 이름, 참조 텍스트가 모두 필요합니다.");
        return;
      }
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
      setS2ProForm((prev) => ({ ...prev, runtime_source: voice.runtime_source }));
      await refreshAll();
      setMessage(`${voice.name}을 S2-Pro 목소리로 저장했습니다.`);
    });
  }

  async function handleS2ProSubmit(event?: FormEvent) {
    event?.preventDefault();
    const textByMode =
      currentS2ProMode === "multi_speaker"
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

  function handleSelectVibeVoiceAsset(asset: AudioAsset) {
    setVibeVoiceTtsForm((prev) => ({
      ...prev,
      speaker_audio_path: asset.path,
      speaker_audio_paths: prev.speaker_audio_paths.trim() ? prev.speaker_audio_paths : asset.path,
    }));
    setVibeVoiceAsrForm((prev) => ({ ...prev, audio_path: asset.path }));
    setMessage(`${asset.filename}을 VibeVoice 참조/ASR 음성으로 선택했습니다.`);
  }

  async function handleUploadVibeVoiceReference(file: File) {
    await runAction(async () => {
      const result = await api.uploadAudio(file);
      setVibeVoiceUploadedRef(result);
      setVibeVoiceTtsForm((prev) => ({ ...prev, speaker_audio_path: result.path }));
      setVibeVoiceAsrForm((prev) => ({ ...prev, audio_path: result.path }));
      await refreshAll();
      setMessage(`${result.filename}을 VibeVoice 입력으로 불러왔습니다.`);
    });
  }

  async function handleVibeVoiceTTSSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.generateVibeVoiceTTS({
        text: vibeVoiceTtsForm.text,
        output_name: vibeVoiceTtsForm.output_name || undefined,
        model_profile: vibeVoiceTtsForm.model_profile,
        speaker_name: vibeVoiceTtsForm.speaker_name,
        speaker_audio_path: vibeVoiceTtsForm.speaker_audio_path || undefined,
        speaker_names: vibeVoiceTtsForm.speaker_names.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        speaker_audio_paths: vibeVoiceTtsForm.speaker_audio_paths.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        checkpoint_path: vibeVoiceTtsForm.checkpoint_path,
        cfg_scale: Number(vibeVoiceTtsForm.cfg_scale || "1.3"),
        ddpm_steps: Number(vibeVoiceTtsForm.ddpm_steps || "5"),
        seed: vibeVoiceTtsForm.seed.trim() ? Number(vibeVoiceTtsForm.seed) : undefined,
        device: vibeVoiceTtsForm.device,
        attn_implementation: vibeVoiceTtsForm.attn_implementation,
        inference_steps: Number(vibeVoiceTtsForm.inference_steps || "10"),
        max_length_times: Number(vibeVoiceTtsForm.max_length_times || "2.0"),
        disable_prefill: vibeVoiceTtsForm.disable_prefill,
        show_progress: vibeVoiceTtsForm.show_progress,
        max_new_tokens: Number(vibeVoiceTtsForm.max_new_tokens || "2048"),
        output_format: vibeVoiceTtsForm.output_format,
        extra_args: vibeVoiceTtsForm.extra_args.split(/\s+/).map((item) => item.trim()).filter(Boolean),
      });
      setLastVibeVoiceRecord(response.record);
      await refreshAll();
      setMessage("VibeVoice TTS 생성을 완료했습니다.");
    });
  }

  async function handleVibeVoiceASRSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      if (!vibeVoiceAsrReady) {
        setMessage("전사할 오디오, 폴더, 또는 데이터셋을 먼저 선택하세요.");
        return;
      }
      const result = await api.transcribeVibeVoice({
        audio_path: vibeVoiceAsrSource === "audio" ? vibeVoiceAsrForm.audio_path : undefined,
        audio_dir: vibeVoiceAsrSource === "folder" ? vibeVoiceAsrForm.audio_dir : undefined,
        dataset: vibeVoiceAsrSource === "dataset" ? vibeVoiceAsrForm.dataset : undefined,
        split: vibeVoiceAsrForm.split,
        max_duration: Number(vibeVoiceAsrForm.max_duration || "3600"),
        language: vibeVoiceAsrForm.language,
        task: vibeVoiceAsrForm.task,
        context_info: vibeVoiceAsrForm.context_info,
        device: vibeVoiceAsrForm.device,
        precision: vibeVoiceAsrForm.precision,
        attn_implementation: vibeVoiceAsrForm.attn_implementation,
        batch_size: Number(vibeVoiceAsrForm.batch_size || "2"),
        max_new_tokens: Number(vibeVoiceAsrForm.max_new_tokens || "256"),
        temperature: Number(vibeVoiceAsrForm.temperature || "0.0"),
        top_p: Number(vibeVoiceAsrForm.top_p || "1.0"),
        num_beams: Number(vibeVoiceAsrForm.num_beams || "1"),
        return_timestamps: vibeVoiceAsrForm.return_timestamps,
      });
      setVibeVoiceAsrResult(result);
      setMessage("VibeVoice-ASR 전사를 완료했습니다.");
    });
  }

  async function handleVibeVoiceTrainSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const result = await api.trainVibeVoice({
        training_mode: activeTab === "vibevoice_asr_train" ? "asr_lora" : "tts_lora",
        output_name: vibeVoiceTrainForm.output_name,
        model_path: vibeVoiceTrainForm.model_path,
        data_dir: vibeVoiceTrainForm.data_dir,
        output_dir: "",
        dataset_config_name: vibeVoiceTrainForm.dataset_config_name,
        train_split_name: vibeVoiceTrainForm.train_split_name,
        eval_split_name: vibeVoiceTrainForm.eval_split_name,
        text_column_name: vibeVoiceTrainForm.text_column_name,
        audio_column_name: vibeVoiceTrainForm.audio_column_name,
        voice_prompts_column_name: vibeVoiceTrainForm.voice_prompts_column_name,
        train_jsonl: vibeVoiceTrainForm.train_jsonl,
        validation_jsonl: vibeVoiceTrainForm.validation_jsonl,
        eval_split_size: Number(vibeVoiceTrainForm.eval_split_size || "0"),
        ignore_verifications: vibeVoiceTrainForm.ignore_verifications,
        max_length: vibeVoiceTrainForm.max_length.trim() ? Number(vibeVoiceTrainForm.max_length) : undefined,
        nproc_per_node: Number(vibeVoiceTrainForm.nproc_per_node || "1"),
        num_train_epochs: Number(vibeVoiceTrainForm.num_train_epochs || "3"),
        per_device_train_batch_size: Number(vibeVoiceTrainForm.per_device_train_batch_size || "1"),
        gradient_accumulation_steps: Number(vibeVoiceTrainForm.gradient_accumulation_steps || "4"),
        learning_rate: Number(vibeVoiceTrainForm.learning_rate || "0.0001"),
        warmup_ratio: Number(vibeVoiceTrainForm.warmup_ratio || "0.1"),
        weight_decay: Number(vibeVoiceTrainForm.weight_decay || "0.01"),
        max_grad_norm: Number(vibeVoiceTrainForm.max_grad_norm || "1.0"),
        logging_steps: Number(vibeVoiceTrainForm.logging_steps || "10"),
        save_steps: Number(vibeVoiceTrainForm.save_steps || "100"),
        lora_r: Number(vibeVoiceTrainForm.lora_r || "16"),
        lora_alpha: Number(vibeVoiceTrainForm.lora_alpha || "32"),
        lora_dropout: Number(vibeVoiceTrainForm.lora_dropout || "0.05"),
        lora_target_modules: vibeVoiceTrainForm.lora_target_modules,
        lora_wrap_diffusion_head: vibeVoiceTrainForm.lora_wrap_diffusion_head,
        train_diffusion_head: vibeVoiceTrainForm.train_diffusion_head,
        train_connectors: vibeVoiceTrainForm.train_connectors,
        layers_to_freeze: vibeVoiceTrainForm.layers_to_freeze,
        ddpm_batch_mul: Number(vibeVoiceTrainForm.ddpm_batch_mul || "4"),
        ce_loss_weight: Number(vibeVoiceTrainForm.ce_loss_weight || "0.04"),
        diffusion_loss_weight: Number(vibeVoiceTrainForm.diffusion_loss_weight || "1.4"),
        debug_save: vibeVoiceTrainForm.debug_save,
        debug_ce_details: vibeVoiceTrainForm.debug_ce_details,
        bf16: vibeVoiceTrainForm.bf16,
        gradient_checkpointing: vibeVoiceTrainForm.gradient_checkpointing,
        use_customized_context: vibeVoiceTrainForm.use_customized_context,
        max_audio_length: vibeVoiceTrainForm.max_audio_length.trim() ? Number(vibeVoiceTrainForm.max_audio_length) : undefined,
        report_to: vibeVoiceTrainForm.report_to,
        extra_args: vibeVoiceTrainForm.extra_args.split(/\s+/).map((item) => item.trim()).filter(Boolean),
      });
      setVibeVoiceTrainResult(result);
      await refreshAll();
      setMessage(result.message);
    });
  }

  async function handleVibeVoiceModelToolSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const outputName = storageFriendlyName(vibeVoiceModelToolForm.output_name || "merged-vibevoice");
      const result = await api.runVibeVoiceModelTool({
        tool: vibeVoiceModelToolForm.tool,
        base_model_path: vibeVoiceModelToolForm.base_model_path,
        checkpoint_path: vibeVoiceModelToolForm.checkpoint_path,
        output_path: `data/models/vibevoice/${outputName}`,
        output_format: vibeVoiceModelToolForm.output_format,
        nnscaler_checkpoint_path: vibeVoiceModelToolForm.nnscaler_checkpoint_path,
        config_path: vibeVoiceModelToolForm.config_path,
      });
      setVibeVoiceModelToolResult(result);
      await refreshAll();
      setMessage(result.message);
    });
  }

  async function handleS2ProTrainSubmit(event?: FormEvent) {
    event?.preventDefault();
    const sourceValue = s2ProTrainSource === "protos" ? s2ProTrainForm.proto_dir : s2ProTrainForm.lab_audio_dir;
    if (!sourceValue.trim()) {
      setMessage("S2-Pro 학습 데이터셋을 먼저 연결하세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.trainS2Pro({
        output_name: s2ProTrainForm.output_name,
        training_type: s2ProTrainForm.training_type,
        source_type: s2ProTrainSource,
        proto_dir: s2ProTrainForm.proto_dir,
        lab_audio_dir: s2ProTrainForm.lab_audio_dir,
        pretrained_ckpt_path: s2ProTrainForm.pretrained_ckpt_path || null,
        lora_config: s2ProTrainForm.lora_config,
        merge_lora: s2ProTrainForm.merge_lora,
        max_steps: Number(s2ProTrainForm.max_steps || "10000"),
        val_check_interval: Number(s2ProTrainForm.val_check_interval || "100"),
        batch_size: Number(s2ProTrainForm.batch_size || "4"),
        accumulate_grad_batches: Number(s2ProTrainForm.accumulate_grad_batches || "1"),
        learning_rate: Number(s2ProTrainForm.learning_rate || "0.0001"),
        num_workers: Number(s2ProTrainForm.num_workers || "4"),
        precision: s2ProTrainForm.precision,
        accelerator: s2ProTrainForm.accelerator,
        devices: s2ProTrainForm.devices,
        strategy_backend: s2ProTrainForm.strategy_backend,
        codec_checkpoint_path: s2ProTrainForm.codec_checkpoint_path || null,
        vq_batch_size: Number(s2ProTrainForm.vq_batch_size || "16"),
        vq_num_workers: Number(s2ProTrainForm.vq_num_workers || "1"),
      });
      setS2ProTrainResult(result);
      await refreshAll();
      setMessage(result.message);
    });
  }

  function applySoundEffectRecipe(item: { prompt: string; prompts?: Partial<Record<SoundEffectPromptLanguage, string>>; profile?: string; duration?: string }, promptLanguage: SoundEffectPromptLanguage) {
    const seconds = item.duration?.includes(":")
      ? Number(item.duration.split(":").pop() || "4")
      : Number(item.duration || soundEffectForm.duration_sec);
    setSoundEffectForm((prev) => ({
      ...prev,
      prompt: item.prompts?.[promptLanguage] || item.prompt,
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

  async function handleMMAudioTrainSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedMMAudioDataset) {
      setMessage("MMAudio 학습 데이터셋을 먼저 연결하세요.");
      return;
    }
    await runAction(async () => {
      const result = await api.trainMMAudio({
        output_name: mmaudioTrainForm.output_name,
        model: mmaudioTrainForm.model,
        weights_path: mmaudioTrainForm.weights_path,
        checkpoint_path: mmaudioTrainForm.checkpoint_path,
        data_mode: mmaudioTrainForm.data_mode,
        nproc_per_node: Number(mmaudioTrainForm.nproc_per_node || "1"),
        num_iterations: Number(mmaudioTrainForm.num_iterations || "10000"),
        batch_size: Number(mmaudioTrainForm.batch_size || "1"),
        learning_rate: Number(mmaudioTrainForm.learning_rate || "0.0001"),
        compile: mmaudioTrainForm.compile,
        debug: mmaudioTrainForm.debug,
        save_weights_interval: Number(mmaudioTrainForm.save_weights_interval || "1000"),
        save_checkpoint_interval: Number(mmaudioTrainForm.save_checkpoint_interval || "1000"),
        val_interval: Number(mmaudioTrainForm.val_interval || "5000"),
        eval_interval: Number(mmaudioTrainForm.eval_interval || "20000"),
      });
      setMMAudioTrainResult(result);
      await refreshAll();
      setMessage(result.message);
    });
  }

  async function handleAceStepSubmit(event?: FormEvent) {
    event?.preventDefault();
    await runAction(async () => {
      const response = await api.generateAceStepMusic({
        output_name: aceStepForm.output_name,
        prompt: aceStepForm.prompt,
        lyrics: aceStepForm.lyrics,
        vocal_language: aceStepForm.vocal_language || "unknown",
        use_cot_language: (aceStepForm.vocal_language || "unknown") === "unknown",
        instrumental: aceStepForm.instrumental,
        bpm: aceStepForm.bpm ? Number(aceStepForm.bpm) : null,
        keyscale: aceStepForm.keyscale,
        timesignature: aceStepForm.timesignature,
        batch_size: Number(aceStepForm.batch_size || "1"),
        audio_format: aceStepForm.audio_format,
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
      vocal_language: aceStepForm.vocal_language || "unknown",
      use_cot_language: (aceStepForm.vocal_language || "unknown") === "unknown",
      instrumental: aceStepForm.instrumental,
      bpm: aceStepForm.bpm ? Number(aceStepForm.bpm) : null,
      keyscale: aceStepForm.keyscale,
      timesignature: aceStepForm.timesignature,
      duration: Number(aceStepForm.audio_duration || "60"),
      inference_steps: Number(aceStepForm.infer_step || "27"),
      guidance_scale: Number(aceStepForm.guidance_scale || "15"),
      seeds: seedsRaw,
      use_random_seed: !seedsRaw,
      batch_size: Number(aceStepForm.batch_size || "1"),
      audio_format: aceStepForm.audio_format,
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
        chunk_mask_mode: aceStepRepaintForm.chunk_mask_mode as "auto" | "explicit",
        repaint_latent_crossfade_frames: Number(aceStepRepaintForm.repaint_latent_crossfade_frames || "10"),
        repaint_wav_crossfade_sec: Number(aceStepRepaintForm.repaint_wav_crossfade_sec || "0"),
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
        vocal_language: aceStepCreateSampleForm.vocal_language === "unknown" ? undefined : aceStepCreateSampleForm.vocal_language,
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
        bpm: aceStepForm.bpm.trim() ? Number(aceStepForm.bpm) : undefined,
        duration: aceStepForm.audio_duration.trim() ? Number(aceStepForm.audio_duration) : undefined,
        keyscale: aceStepForm.keyscale,
        timesignature: aceStepForm.timesignature,
        vocal_language: aceStepForm.vocal_language === "unknown" ? undefined : aceStepForm.vocal_language,
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

  async function handleAceStepTrainAdapterSubmit(event?: FormEvent) {
    event?.preventDefault();
    const sourceValue =
      aceStepTrainSource === "tensors"
        ? aceStepTrainForm.tensor_dir
        : aceStepTrainSource === "audio_dir"
          ? aceStepTrainForm.audio_dir
          : aceStepTrainForm.dataset_json;
    if (!sourceValue.trim()) {
      setMessage("ACE-Step 학습 입력 경로를 먼저 넣어주세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.trainAceStepAdapter({
        output_name: aceStepTrainForm.output_name,
        adapter_type: aceStepTrainForm.adapter_type,
        trainer_mode: aceStepTrainForm.trainer_mode,
        source_type: aceStepTrainSource,
        tensor_dir: aceStepTrainForm.tensor_dir,
        audio_dir: aceStepTrainForm.audio_dir,
        dataset_json: aceStepTrainForm.dataset_json,
        model_variant: aceStepTrainForm.model_variant,
        device: aceStepTrainForm.device,
        precision: aceStepTrainForm.precision,
        max_duration: Number(aceStepTrainForm.max_duration || "240"),
        learning_rate: Number(aceStepTrainForm.learning_rate || (aceStepTrainForm.adapter_type === "lokr" ? "0.03" : "0.0001")),
        batch_size: Number(aceStepTrainForm.batch_size || "1"),
        gradient_accumulation: Number(aceStepTrainForm.gradient_accumulation || "4"),
        epochs: Number(aceStepTrainForm.epochs || "100"),
        save_every: Number(aceStepTrainForm.save_every || "10"),
        seed: Number(aceStepTrainForm.seed || "42"),
        num_workers: Number(aceStepTrainForm.num_workers || "4"),
        gradient_checkpointing: aceStepTrainForm.gradient_checkpointing,
        rank: Number(aceStepTrainForm.rank || "64"),
        alpha: Number(aceStepTrainForm.alpha || "128"),
        dropout: Number(aceStepTrainForm.dropout || "0.1"),
        lokr_linear_dim: Number(aceStepTrainForm.lokr_linear_dim || "64"),
        lokr_linear_alpha: Number(aceStepTrainForm.lokr_linear_alpha || "128"),
        lokr_factor: Number(aceStepTrainForm.lokr_factor || "-1"),
        lokr_decompose_both: aceStepTrainForm.lokr_decompose_both,
        lokr_use_tucker: aceStepTrainForm.lokr_use_tucker,
        lokr_use_scalar: aceStepTrainForm.lokr_use_scalar,
        lokr_weight_decompose: aceStepTrainForm.lokr_weight_decompose,
      });
      setAceStepTrainResult(result);
      await loadAceStepRuntime();
      setMessage(result.message);
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

  function addToolDatasetAsset(target: string, asset: AudioAsset) {
    setToolDatasetSamples((prev) => {
      const current = prev[target] ?? [];
      if (current.includes(asset.path)) return prev;
      return { ...prev, [target]: [...current, asset.path] };
    });
    setMessage(`${asset.filename} 파일을 ${target} 데이터셋 샘플로 추가했습니다.`);
  }

  function removeToolDatasetAsset(target: string, audioPath: string) {
    setToolDatasetSamples((prev) => ({
      ...prev,
      [target]: (prev[target] ?? []).filter((item) => item !== audioPath),
    }));
  }

  async function buildToolDataset(target: "s2_pro" | "vibevoice" | "rvc" | "mmaudio" | "ace_step") {
    const source = toolDatasetSource[target] ?? "gallery";
    const selectedPaths = toolDatasetSamples[target] ?? [];
    const folder = normalizeDatasetPath(toolDatasetFolders[target] ?? "");
    const name = toolDatasetNames[target]?.trim() || `${target}-dataset`;

    if (source === "gallery" && selectedPaths.length === 0) {
      setMessage("생성 갤러리에서 데이터셋에 넣을 음성을 먼저 선택하세요.");
      return;
    }
    if (source === "folder" && !folder) {
      setMessage("데이터셋으로 사용할 폴더 경로를 입력하세요.");
      return;
    }

    await runAction(async () => {
      const result = await api.buildAudioDataset({
        name,
        target,
        source_type: source === "folder" ? "folder" : "gallery",
        samples: source === "gallery" ? selectedPaths.map((audio_path) => ({ audio_path, text: assetTextByPath.get(audio_path) || "" })) : [],
        sample_folder_path: source === "folder" ? folder : undefined,
        ref_audio_path: selectedPaths[0],
        transcribe: true,
        asr_model_id: asrModelId,
      });
      setToolDatasetLastBuild(result);
      const record: AudioDatasetRecord = {
        ...result,
        source_type: source === "folder" ? "folder" : "gallery",
        reference_audio_path: selectedPaths[0] || undefined,
        created_at: new Date().toISOString(),
      };
      setAudioDatasets((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);

      if (target === "s2_pro") {
        setS2ProTrainSource("lab_audio_dir");
        setS2ProTrainForm((prev) => ({
          ...prev,
          lab_audio_dir: result.lab_audio_dir_path || result.audio_dir_path,
          output_name: prev.output_name || name,
        }));
      } else if (target === "vibevoice") {
        setVibeVoiceTrainForm((prev) => ({
          ...prev,
          data_dir: result.dataset_root_path,
          train_jsonl: result.train_jsonl_path || prev.train_jsonl,
          validation_jsonl: result.validation_jsonl_path || prev.validation_jsonl,
          output_name: prev.output_name || name,
        }));
      } else if (target === "rvc") {
        setRvcTrainForm((prev) => ({ ...prev, dataset_path: result.audio_dir_path, model_name: prev.model_name || name }));
      } else if (target === "ace_step") {
        setAceStepTrainSource("dataset_json");
        setAceStepTrainForm((prev) => ({ ...prev, dataset_json: result.dataset_json_path || prev.dataset_json, audio_dir: result.audio_dir_path, output_name: prev.output_name || name }));
      } else if (target === "mmaudio") {
        setSelectedMMAudioDatasetId(record.id);
        setMMAudioTrainForm((prev) => ({
          ...prev,
          output_name: prev.output_name || name,
          data_mode: "configured",
        }));
      }

      setMessage(`${name} 데이터셋을 준비했습니다. 샘플 ${result.sample_count}개를 학습 탭으로 넘길 수 있습니다.`);
    });
  }

  function sendAudioDatasetToTraining(dataset: AudioDatasetRecord) {
    const name = dataset.name || dataset.id;
    if (dataset.target === "s2_pro") {
      setS2ProTrainSource("lab_audio_dir");
      setS2ProTrainForm((prev) => ({
        ...prev,
        lab_audio_dir: dataset.lab_audio_dir_path || dataset.audio_dir_path,
        output_name: prev.output_name || name,
      }));
      setActiveTab("s2pro_train");
    } else if (dataset.target === "vibevoice") {
      setVibeVoiceTrainForm((prev) => ({
        ...prev,
        data_dir: dataset.dataset_root_path,
        train_jsonl: dataset.train_jsonl_path || prev.train_jsonl,
        validation_jsonl: dataset.validation_jsonl_path || prev.validation_jsonl,
        output_name: prev.output_name || name,
      }));
      setActiveTab("vibevoice_tts_train");
    } else if (dataset.target === "rvc") {
      setRvcTrainForm((prev) => ({ ...prev, dataset_path: dataset.audio_dir_path, model_name: prev.model_name || name }));
      setActiveTab("applio_train");
    } else if (dataset.target === "ace_step") {
      setAceStepTrainSource("dataset_json");
      setAceStepTrainForm((prev) => ({
        ...prev,
        dataset_json: dataset.dataset_json_path || prev.dataset_json,
        audio_dir: dataset.audio_dir_path,
        output_name: prev.output_name || name,
      }));
      setActiveTab("ace_lora_train");
    } else if (dataset.target === "mmaudio") {
      setSelectedMMAudioDatasetId(dataset.id);
      setMMAudioTrainForm((prev) => ({ ...prev, output_name: prev.output_name || name, data_mode: "configured" }));
      setActiveTab("mmaudio_train");
    }
    setMessage(`${name} 데이터셋을 ${audioDatasetTargetLabel(dataset.target)} 학습 탭에 연결했습니다.`);
  }

  function sendQwenDatasetToTraining(dataset: FineTuneDataset) {
    setSelectedDatasetId(dataset.id);
    setRunForm((prev) => ({
      ...prev,
      speaker_name: dataset.speaker_name || prev.speaker_name,
      output_name: prev.output_name || dataset.name,
    }));
    setActiveTab("training");
    setMessage(`${dataset.name} 데이터셋을 Qwen 학습 탭에 연결했습니다.`);
  }

  async function handleDeleteQwenDataset(dataset: FineTuneDataset) {
    await runAction(async () => {
      setDatasets((prev) => prev.filter((item) => item.id !== dataset.id));
      if (selectedDatasetId === dataset.id) {
        setSelectedDatasetId("");
      }
      await api.deleteDataset(dataset.id);
      await refreshAll();
      setMessage(`${dataset.name} 데이터셋을 삭제했습니다.`);
    });
  }

  async function handleDeleteAudioDataset(dataset: AudioDatasetRecord) {
    await runAction(async () => {
      setAudioDatasets((prev) => prev.filter((item) => item.id !== dataset.id));
      if (selectedMMAudioDatasetId === dataset.id) {
        setSelectedMMAudioDatasetId("");
      }
      await api.deleteAudioDataset(dataset.id);
      await refreshAll();
      setMessage(`${dataset.name || dataset.id} 데이터셋을 삭제했습니다.`);
    });
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
    const datasetPath = rvcTrainForm.dataset_path.trim();
    if (!datasetPath) {
      setMessage(t("applio_train.datasetRequired", "학습할 RVC 데이터셋을 먼저 연결하세요."));
      return;
    }
    await runAction(async () => {
      const result = await api.trainRvcModel({
        model_name: rvcTrainForm.model_name,
        dataset_path: datasetPath,
        audio_paths: [],
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
      setS2ProForm((prev) => ({ ...prev, runtime_source: s2Voice.runtime_source }));
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
    if (source === "design" && !selectedClonePrompt) {
      setMessage("먼저 목소리 설계 결과를 선택해주세요.");
      return;
    }
    if (source === "upload" && !uploadedRef) {
      setMessage("먼저 참조 음성을 업로드해주세요.");
      return;
    }
    if (source === "upload" && !selectedBaseModelId) {
      setMessage("먼저 스타일 분석 모델을 선택해주세요.");
      return;
    }
    await runAction(async () => {
      let prompt = source === "design" ? selectedClonePrompt : uploadedClonePrompt;
      if (!prompt && source === "upload" && uploadedRef) {
        prompt = await api.createCloneFromUpload({
          model_id: selectedBaseModelId,
          reference_audio_path: uploadedRef.path,
          reference_text: uploadRefText.trim() || undefined,
        });
        setUploadedClonePrompt(prompt);
      }
      if (!prompt) {
        setMessage("프리셋을 만들 목소리 정보를 준비하지 못했습니다.");
        return;
      }
      const presetName = presetForm.name || `preset-${prompt.id}`;
      await api.createPreset({
        name: presetName,
        source_type: source === "design" ? "voice_design" : "uploaded_reference",
        language: presetForm.language,
        base_model: prompt.base_model,
        reference_text: prompt.reference_text,
        reference_audio_path: prompt.reference_audio_path,
        clone_prompt_path: prompt.prompt_path,
        notes: presetForm.notes,
      });
      if (createS2ProWithPreset) {
        const voice = await api.createS2ProVoice({
          name: presetName,
          runtime_source: s2ProVoiceForm.runtime_source,
          reference_audio_path: prompt.reference_audio_path,
          reference_text: prompt.reference_text,
          language: presetForm.language,
          notes: presetForm.notes || "Qwen 프리셋 저장과 함께 만든 S2-Pro 목소리",
          create_qwen_prompt: false,
        });
        setSelectedS2VoiceId(voice.id);
        setS2ProForm((prev) => ({ ...prev, runtime_source: voice.runtime_source }));
      }
      await refreshAll();
      setMessage(createS2ProWithPreset ? "캐릭터 프리셋과 S2-Pro 목소리를 함께 저장했습니다." : "캐릭터 프리셋을 저장했습니다.");
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

      const asrTargets = blankTargets.filter(({ sample, index }) => {
        const cachedText = assetTextByPath.get(sample.audio_path)?.trim();
        if (cachedText) {
          normalizedSamples[index].text = cachedText;
          updateDatasetSample(index, { text: cachedText });
          return false;
        }
        return true;
      });

      if (asrTargets.length > 0) {
        const transcripts = await Promise.all(
          asrTargets.map(({ sample }) => api.transcribeAudio(sample.audio_path, asrModelId)),
        );
        transcripts.forEach((result, resultIndex) => {
          const targetIndex = asrTargets[resultIndex].index;
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
      const result = await api.transcribeAudio(sample.audio_path.trim(), asrModelId);
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
      const results = await Promise.all(targets.map(({ sample }) => api.transcribeAudio(sample.audio_path.trim(), asrModelId)));
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
    "s2pro_train",
    "vibevoice_tts",
    "vibevoice_asr",
    "vibevoice_tts_train",
    "vibevoice_asr_train",
    "vibevoice_model_tools",
    "effects",
    "mmaudio_train",
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
    "ace_lora_train",
    "dataset",
    "training",
    "voicebox_fusion",
  ]);
  const canRunCurrentTab = renderableTabs.has(activeTab);
  const vibeVoiceAsrReady =
    (vibeVoiceAsrSource === "audio" && Boolean(vibeVoiceAsrForm.audio_path.trim())) ||
    (vibeVoiceAsrSource === "folder" && Boolean(vibeVoiceAsrForm.audio_dir.trim())) ||
    (vibeVoiceAsrSource === "dataset" && Boolean(vibeVoiceAsrForm.dataset.trim()));
  const vibeVoiceModelToolReady =
    Boolean(vibeVoiceModelToolForm.output_name.trim()) &&
    (vibeVoiceModelToolForm.tool === "convert_nnscaler"
      ? Boolean(vibeVoiceModelToolForm.nnscaler_checkpoint_path.trim())
      : Boolean(vibeVoiceModelToolForm.base_model_path.trim()) &&
        (vibeVoiceModelToolForm.tool === "verify_merge" || Boolean(vibeVoiceModelToolForm.checkpoint_path.trim())));

  async function handleRunCurrentTab() {
    if (!canRunCurrentTab) {
      return;
    }

    if (activeTab === "design") return handleVoiceDesignSubmit();
    if (activeTab === "tts") return handleModelInferenceSubmit();
    if (activeTab === "clone") {
      if (cloneEngine === "voicebox") return handleVoiceBoxCloneFromUpload();
      return handleCreatePreset("upload");
    }
    if (activeTab === "projects") {
      if (selectedHybridPreset && hybridForm.custom_model_id) return handleHybridInferenceSubmit();
      return handleGenerateFromPreset();
    }
    if (isS2ProTab(activeTab)) return handleS2ProSubmit();
    if (activeTab === "s2pro_train") return handleS2ProTrainSubmit();
    if (activeTab === "vibevoice_tts") return handleVibeVoiceTTSSubmit();
    if (activeTab === "vibevoice_asr") return handleVibeVoiceASRSubmit();
    if (activeTab === "vibevoice_tts_train" || activeTab === "vibevoice_asr_train") return handleVibeVoiceTrainSubmit();
    if (activeTab === "vibevoice_model_tools") return handleVibeVoiceModelToolSubmit();
    if (activeTab === "effects") return handleSoundEffectSubmit();
    if (activeTab === "mmaudio_train") return handleMMAudioTrainSubmit();
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
    if (activeTab === "ace_lora_train") return handleAceStepTrainAdapterSubmit();
    if (activeTab === "dataset") return handleCreateDataset();
    if (activeTab === "training") return handleCreateRun();
    if (activeTab === "voicebox_fusion") return handleCreateVoiceBoxFusion();
  }

  function sendS2DatasetToTraining() {
    const sourceReady =
      s2ProTrainSource === "lab_audio_dir"
        ? Boolean(s2ProTrainForm.lab_audio_dir.trim())
        : Boolean(s2ProTrainForm.proto_dir.trim());
    if (!sourceReady) {
      setMessage("S2-Pro 데이터셋을 먼저 준비하거나 선택하세요.");
      return;
    }
    setActiveTab("s2pro_train");
    setMessage("S2-Pro 데이터셋 설정을 학습 실행 탭에 반영했습니다.");
  }

  function sendVibeVoiceDatasetToTraining(mode: "tts_lora" | "asr_lora") {
    const hasDataset =
      Boolean(vibeVoiceTrainForm.data_dir.trim()) ||
      Boolean(vibeVoiceTrainForm.train_jsonl.trim()) ||
      Boolean(vibeVoiceTrainForm.validation_jsonl.trim());
    if (!hasDataset) {
      setMessage("VibeVoice 데이터셋을 먼저 준비하거나 선택하세요.");
      return;
    }
    setVibeVoiceTrainForm((prev) => ({ ...prev, training_mode: mode }));
    setActiveTab(mode === "asr_lora" ? "vibevoice_asr_train" : "vibevoice_tts_train");
    setMessage(mode === "asr_lora" ? "VibeVoice ASR 학습 탭으로 이동했습니다." : "VibeVoice TTS 학습 탭으로 이동했습니다.");
  }

  function sendRvcDatasetToTraining() {
    if (!rvcTrainSourceReady) {
      setMessage("RVC 학습 데이터셋을 먼저 준비하거나 선택하세요.");
      return;
    }
    setActiveTab("applio_train");
    setMessage("Applio/RVC 데이터셋 설정을 학습 탭에 반영했습니다.");
  }

  function sendAceDatasetToTraining() {
    const hasDataset =
      (aceStepTrainSource === "tensors" && aceStepTrainForm.tensor_dir.trim()) ||
      (aceStepTrainSource === "audio_dir" && aceStepTrainForm.audio_dir.trim()) ||
      (aceStepTrainSource === "dataset_json" && aceStepTrainForm.dataset_json.trim());
    if (!hasDataset) {
      setMessage("ACE-Step 학습 데이터셋을 먼저 준비하거나 선택하세요.");
      return;
    }
    setActiveTab("ace_lora_train");
    setMessage("ACE-Step 데이터셋 설정을 LoRA / LoKr 학습 탭에 반영했습니다.");
  }

  function sendMMAudioDatasetToTraining() {
    if (!selectedMMAudioDataset && toolDatasetLastBuild?.target !== "mmaudio") {
      setMessage("먼저 MMAudio 데이터셋을 만들거나 선택하세요.");
      return;
    }
    if (!selectedMMAudioDataset && toolDatasetLastBuild?.target === "mmaudio") {
      setSelectedMMAudioDatasetId(toolDatasetLastBuild.id);
    }
    setActiveTab("mmaudio_train");
    setMessage("MMAudio 데이터셋을 학습 탭에 연결했습니다.");
  }

  return (
    <>
    <StudioTopBar title={pageTitle} />
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
            <button className={activeTab === "s2pro_dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("s2pro_dataset")} type="button">
              <span>{t("tab.s2pro_dataset", "S2-Pro 데이터셋")}</span>
            </button>
            <button className={activeTab === "s2pro_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("s2pro_train")} type="button">
              <span>{t("tab.s2pro_train")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.vibevoice")}</span></div>
            <button className={activeTab === "vibevoice_tts" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("vibevoice_tts")} type="button">
              <span>{t("tab.vibevoice_tts")}</span>
            </button>
            <button className={activeTab === "vibevoice_asr" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("vibevoice_asr")} type="button">
              <span>{t("tab.vibevoice_asr")}</span>
            </button>
            <button className={activeTab === "vibevoice_dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("vibevoice_dataset")} type="button">
              <span>{t("tab.vibevoice_dataset", "VibeVoice 데이터셋")}</span>
            </button>
            <button className={activeTab === "vibevoice_tts_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => { setVibeVoiceTrainForm((prev) => ({ ...prev, training_mode: "tts_lora" })); setActiveTab("vibevoice_tts_train"); }} type="button">
              <span>{t("tab.vibevoice_tts_train")}</span>
            </button>
            <button className={activeTab === "vibevoice_asr_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => { setVibeVoiceTrainForm((prev) => ({ ...prev, training_mode: "asr_lora" })); setActiveTab("vibevoice_asr_train"); }} type="button">
              <span>{t("tab.vibevoice_asr_train")}</span>
            </button>
            <button className={activeTab === "vibevoice_model_tools" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("vibevoice_model_tools")} type="button">
              <span>{t("tab.vibevoice_model_tools")}</span>
            </button>
          </div>

          <div className="studio-nav__group">
            <div className="studio-nav__label"><span>{t("section.audiolab")}</span></div>
            <button className={activeTab === "effects" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("effects")} type="button">
              <span>{t("tab.effects")}</span>
            </button>
            <button className={activeTab === "mmaudio_dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("mmaudio_dataset")} type="button">
              <span>{t("tab.mmaudio_dataset", "MMAudio 데이터셋")}</span>
            </button>
            <button className={activeTab === "mmaudio_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("mmaudio_train")} type="button">
              <span>{t("tab.mmaudio_train")}</span>
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
            <button className={activeTab === "applio_dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("applio_dataset")} type="button">
              <span>{t("tab.applio_dataset", "Applio 데이터셋")}</span>
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
            <button className={activeTab === "ace_dataset" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => setActiveTab("ace_dataset")} type="button">
              <span>{t("tab.ace_dataset", "ACE-Step 데이터셋")}</span>
            </button>
            <button className={activeTab === "ace_lora_train" ? "studio-nav__item is-active" : "studio-nav__item"} onClick={() => openAceStepTab("ace_lora_train")} type="button">
              <span>{t("tab.ace_lora_train")}</span>
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
            <WorkspaceShell>
              <WorkspaceHeader
                eyebrow={t("home.eyebrow")}
                eyebrowIcon={HomeIcon}
                title={t("home.title")}
                subtitle={t("home.description")}
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
            </WorkspaceShell>
          ) : null}

          {message ? <div className="message-banner">{message}</div> : null}
      {activeTab === "voices" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("voices.eyebrow", "VOICE LIBRARY")}
            eyebrowIcon={Library}
            title={t("voices.title", "목소리 프로젝트")}
            subtitle={t("voices.subtitle", "직접 만든 목소리 자산만 모아 관리합니다. 기본 목소리는 여기서 제외합니다.")}
          />

          <Tabs
            value={voiceGalleryView}
            onValueChange={(value) => setVoiceGalleryView(value as typeof voiceGalleryView)}
            className="flex flex-col gap-5"
          >
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 bg-surface border border-line p-1 h-auto">
              <TabsTrigger value="trained" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">
                {t("voices.tab.trained", "훈련한 모델")} <span className="ml-1 font-mono text-[10px] text-ink-subtle">{latestFineTunedModels.length}</span>
              </TabsTrigger>
              <TabsTrigger value="qwen" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">
                {t("voices.tab.qwen", "Qwen 프리셋")} <span className="ml-1 font-mono text-[10px] text-ink-subtle">{qwenVoiceAssetCount}</span>
              </TabsTrigger>
              <TabsTrigger value="s2pro" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">
                {t("voices.tab.s2pro", "S2-Pro 프리셋")} <span className="ml-1 font-mono text-[10px] text-ink-subtle">{s2VoiceProjects.length}</span>
              </TabsTrigger>
              <TabsTrigger value="rvc" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">
                {t("voices.tab.rvc", "RVC 모델")} <span className="ml-1 font-mono text-[10px] text-ink-subtle">{voiceChangerModels.length}</span>
              </TabsTrigger>
              <TabsTrigger value="datasets" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">
                {t("voices.tab.datasets", "데이터셋")} <span className="ml-1 font-mono text-[10px] text-ink-subtle">{datasets.length + audioDatasets.length}</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col gap-3">
              <TabsContent value="trained" className="m-0 flex flex-col gap-3">
                {latestFineTunedModels.length ? (
                  latestFineTunedModels.map((model) => (
                    <WorkspaceCard key={model.model_id} className="flex flex-wrap items-center gap-4">
                      <div className="grid size-12 place-items-center rounded-md bg-canvas border border-line shrink-0">
                        <MiniWaveform dense />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-sm font-medium text-ink">{displayModelName(model)}</strong>
                          <span className="text-xs text-ink-muted">{model.default_speaker ? t("voices.trained.speaker", "{name} 목소리").replace("{name}", model.default_speaker) : t("voices.trained.fallback", "학습 모델")}</span>
                        </div>
                        <p className="text-sm text-ink-muted">{model.notes || t("voices.trained.note", "바로 선택해서 텍스트 음성 변환에 사용할 수 있는 학습 결과입니다.")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{model.source}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{model.default_speaker || "speaker"}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{model.speaker_encoder_included ? t("voices.trained.encoderYes", "speaker encoder 포함") : t("voices.trained.encoderNo", "speaker encoder 없음")}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <DownloadAssetButton
                          href={apiUrl(`/api/finetune-runs/${encodeURIComponent(fineTuneRunIdFromModel(model))}/download`)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
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
                          {t("voices.trained.useInTts", "텍스트 음성 변환에서 사용")}
                        </Button>
                        <DeleteAssetButton
                          kind="trained"
                          assetId={fineTuneRunIdFromModel(model)}
                          assetName={displayModelName(model)}
                          onDeleted={() => {
                            const runId = fineTuneRunIdFromModel(model);
                            setModels((items) => items.filter((item) => item.model_id !== model.model_id));
                            setRuns((items) => items.filter((item) => item.id !== runId));
                            void refreshAll();
                          }}
                        />
                      </div>
                    </WorkspaceCard>
                  ))
                ) : (
                  <WorkspaceEmptyState
                    icon={Library}
                    title={t("voices.trained.emptyTitle", "훈련한 모델이 없습니다.")}
                    body={t("voices.trained.emptyBody", "Qwen 학습을 완료한 모델만 이 영역에 표시됩니다.")}
                    action={
                      <Button onClick={() => setActiveTab("training")} type="button">
                        {t("voices.trained.gotoTraining", "학습 실행으로 이동")}
                      </Button>
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="qwen" className="m-0 flex flex-col gap-3">
                {qwenVoiceAssetCount ? (
                  <>
                    {presets.map((preset) => (
                      <WorkspaceCard key={preset.id} className="flex flex-wrap items-center gap-4">
                        <VoiceAssetAvatar
                          kind="preset"
                          assetId={preset.id}
                          imageUrl={preset.image_url}
                          alt={preset.name}
                          fallback={<MiniWaveform dense />}
                          onChange={(nextUrl) =>
                            setPresets((items) =>
                              items.map((item) => (item.id === preset.id ? { ...item, image_url: nextUrl } : item)),
                            )
                          }
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <strong className="text-sm font-medium text-ink">{preset.name}</strong>
                            <span className="text-xs text-ink-muted">{preset.language} · {formatDate(preset.created_at)}</span>
                          </div>
                          <p className="text-sm text-ink-muted line-clamp-2">{preset.reference_text}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">Qwen 프리셋</Badge>
                            <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{preset.source_type}</Badge>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <DownloadAssetButton
                            href={apiUrl(`/api/presets/${encodeURIComponent(preset.id)}/download`)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPresetId(preset.id);
                              setSelectedHybridPresetId(preset.id);
                              setActiveTab("projects");
                            }}
                            type="button"
                          >
                            {t("voices.qwen.usePreset", "프리셋 기반 생성")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
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
                            {t("voices.qwen.saveAsS2Pro", "S2-Pro 프리셋으로 저장")}
                          </Button>
                          <DeleteAssetButton
                            kind="preset"
                            assetId={preset.id}
                            assetName={preset.name}
                            onDeleted={() => setPresets((items) => items.filter((item) => item.id !== preset.id))}
                          />
                        </div>
                      </WorkspaceCard>
                    ))}
                    {rawQwenClonePrompts.map((prompt) => (
                      <WorkspaceCard key={prompt.id} className="flex flex-wrap items-center gap-4">
                        <div className="grid size-12 place-items-center rounded-md bg-canvas border border-line shrink-0">
                          <MiniWaveform dense />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <strong className="text-sm font-medium text-ink">{clonePromptDisplayName(prompt)}</strong>
                            <span className="text-xs text-ink-muted">{formatDate(prompt.created_at)}</span>
                          </div>
                          <p className="text-sm text-ink-muted line-clamp-2">{prompt.reference_text || t("voices.qwen.noText", "참조 텍스트가 저장되지 않았습니다.")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">Qwen clone prompt</Badge>
                            <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{prompt.source_type}</Badge>
                            <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{prompt.x_vector_only_mode ? "x-vector" : "full style"}</Badge>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <DownloadAssetButton
                            href={apiUrl(`/api/clone-prompts/${encodeURIComponent(prompt.id)}/download`)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUploadedClonePrompt(prompt);
                              setActiveTab("projects");
                            }}
                            type="button"
                          >
                            {t("voices.qwen.savePreset", "프리셋으로 저장")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              createS2VoiceFromQwenAsset({
                                name: clonePromptDisplayName(prompt),
                                reference_audio_path: prompt.reference_audio_path,
                                reference_text: prompt.reference_text,
                                language: "Auto",
                              })
                            }
                            type="button"
                          >
                            {t("voices.qwen.saveAsS2Pro", "S2-Pro 프리셋으로 저장")}
                          </Button>
                        </div>
                      </WorkspaceCard>
                    ))}
                  </>
                ) : (
                  <WorkspaceEmptyState
                    icon={Library}
                    title={t("voices.qwen.emptyTitle", "Qwen 프리셋이 없습니다.")}
                    body={t("voices.qwen.emptyBody", "목소리 복제나 목소리 설계에서 저장한 프리셋만 이 영역에 표시됩니다.")}
                    action={
                      <Button onClick={() => setActiveTab("clone")} type="button">
                        {t("voices.qwen.gotoClone", "목소리 복제로 이동")}
                      </Button>
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="s2pro" className="m-0 flex flex-col gap-3">
                {s2VoiceProjects.length ? (
                  s2VoiceProjects.map(({ voice, relatedHistory, relatedPresets }) => (
                    <WorkspaceCard key={voice.id} className="flex flex-wrap items-start gap-4">
                      <VoiceAssetAvatar
                        kind="s2pro"
                        assetId={voice.id}
                        imageUrl={voice.image_url}
                        alt={voice.name}
                        fallback={<MiniWaveform dense />}
                        onChange={(nextUrl) =>
                          setS2ProVoices((items) =>
                            items.map((item) => (item.id === voice.id ? { ...item, image_url: nextUrl } : item)),
                          )
                        }
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-sm font-medium text-ink">{voice.name}</strong>
                          <span className="text-xs text-ink-muted">{voice.language} · {formatDate(voice.created_at)}</span>
                        </div>
                        <p className="text-sm text-ink-muted line-clamp-2">{voice.reference_text || t("voices.s2pro.noText", "참조 문장이 아직 없습니다.")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">S2-Pro 프리셋</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{t("voices.s2pro.histCount", "생성 결과 {n}개").replace("{n}", String(relatedHistory.length))}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{t("voices.s2pro.qwenLinks", "Qwen 연결 {n}개").replace("{n}", String(relatedPresets.length + (voice.qwen_clone_prompt_path ? 1 : 0)))}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{voice.runtime_source === "api" ? "Fish Audio API" : "Local S2-Pro"}</Badge>
                        </div>
                        <audio controls src={mediaUrl(voice.reference_audio_url)} className="mt-1 h-8 w-full" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <DownloadAssetButton
                          href={apiUrl(`/api/s2-pro/voices/${encodeURIComponent(voice.id)}/download`)}
                        />
                        <Button variant="outline" size="sm" onClick={() => { selectS2ProVoice(voice.id); openS2ProTab("s2pro_tagged"); }} type="button">
                          {t("voices.s2pro.useInS2Pro", "S2-Pro에서 사용")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => useS2VoiceInQwen(voice, "clone")} type="button">
                          {t("voices.s2pro.toQwenClone", "Qwen 복제로 보내기")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDatasetForm((prev) => ({ ...prev, ref_audio_path: voice.reference_audio_path, speaker_name: voice.name || prev.speaker_name }));
                            mergeDatasetSamples([{ audio_path: voice.reference_audio_path, text: voice.reference_text }]);
                            setActiveTab("dataset");
                          }}
                          type="button"
                        >
                          {t("voices.s2pro.toDataset", "데이터셋에 사용")}
                        </Button>
                        <DeleteAssetButton
                          kind="s2pro"
                          assetId={voice.id}
                          assetName={voice.name}
                          onDeleted={() => setS2ProVoices((items) => items.filter((item) => item.id !== voice.id))}
                        />
                      </div>
                    </WorkspaceCard>
                  ))
                ) : (
                  <WorkspaceEmptyState
                    icon={Library}
                    title={t("voices.s2pro.emptyTitle", "S2-Pro 프리셋이 없습니다.")}
                    body={t("voices.s2pro.emptyBody", "S2-Pro 목소리 저장에서 만든 재사용 목소리만 이 영역에 표시됩니다.")}
                    action={
                      <Button onClick={() => openS2ProTab("s2pro_clone")} type="button">
                        {t("voices.s2pro.gotoClone", "S2-Pro 목소리 저장으로 이동")}
                      </Button>
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="rvc" className="m-0 flex flex-col gap-3">
                {voiceChangerModels.length ? (
                  voiceChangerModels.map((model) => (
                    <WorkspaceCard key={model.id} className="flex flex-wrap items-center gap-4">
                      <VoiceAssetAvatar
                        kind="rvc"
                        assetId={model.id}
                        imageUrl={model.image_url}
                        alt={model.label}
                        fallback={<MiniWaveform dense />}
                        onChange={(nextUrl) =>
                          setVoiceChangerModels((items) =>
                            items.map((item) => (item.id === model.id ? { ...item, image_url: nextUrl } : item)),
                          )
                        }
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-sm font-medium text-ink">{model.label}</strong>
                          <span className="text-xs text-ink-muted">RVC / Applio</span>
                        </div>
                        <p className="text-sm text-ink-muted">{t("voices.rvc.note", "기존 음성을 이 목소리로 변환할 때 사용하는 RVC 모델입니다.")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{model.id}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{model.index_path ? t("voices.rvc.hasIndex", "index 포함") : t("voices.rvc.noIndex", "index 없음")}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <DownloadAssetButton
                          href={apiUrl(`/api/audio-tools/voice-models/${encodeURIComponent(model.id)}/download`)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleSelectVoiceChangerModel(model.id);
                            setActiveTab("applio_convert");
                          }}
                          type="button"
                        >
                          {t("voices.rvc.useInConvert", "단일 변환에서 사용")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleSelectVoiceChangerModel(model.id);
                            setActiveTab("applio_batch");
                          }}
                          type="button"
                        >
                          {t("voices.rvc.useInBatch", "배치 변환에서 사용")}
                        </Button>
                        <DeleteAssetButton
                          kind="rvc"
                          assetId={model.id}
                          assetName={model.label}
                          onDeleted={() => setVoiceChangerModels((items) => items.filter((item) => item.id !== model.id))}
                        />
                      </div>
                    </WorkspaceCard>
                  ))
                ) : (
                  <WorkspaceEmptyState
                    icon={Library}
                    title={t("voices.rvc.emptyTitle", "RVC 모델이 없습니다.")}
                    body={t("voices.rvc.emptyBody", "Applio 학습을 완료하거나 모델 다운로드를 마친 RVC 모델만 이 영역에 표시됩니다.")}
                    action={
                      <Button onClick={() => setActiveTab("applio_train")} type="button">
                        {t("voices.rvc.gotoTrain", "RVC 모델 학습으로 이동")}
                      </Button>
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="datasets" className="m-0 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {([
                    ["qwen", "Qwen"],
                    ["s2_pro", "S2-Pro"],
                    ["vibevoice", "VibeVoice"],
                    ["rvc", "RVC"],
                    ["mmaudio", "MMAudio"],
                    ["ace_step", "ACE-Step"],
                  ] as Array<[DatasetLibraryTarget, string]>).map(([target, label]) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setDatasetLibraryTarget(target)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        datasetLibraryTarget === target
                          ? "border-accent-edge bg-accent-soft text-accent-ink"
                          : "border-line bg-canvas text-ink-muted hover:border-line-strong"
                      }`}
                    >
                      <b className="mr-1 text-ink">{datasetLibraryBuckets[target]}</b>{label}
                    </button>
                  ))}
                </div>

                {datasetLibraryTarget === "qwen" && datasets.length ? (
                  datasets.map((dataset) => (
                    <WorkspaceCard key={dataset.id} className="flex flex-wrap items-center gap-4">
                      <div className="grid size-12 place-items-center rounded-md bg-canvas border border-line shrink-0">
                        <span className="font-mono text-xs font-semibold text-accent">{audioDatasetTargetShort("qwen")}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-sm font-medium text-ink">{dataset.name}</strong>
                          <span className="text-xs text-ink-muted">Qwen · {dataset.sample_count} samples · {dataset.speaker_name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{dataset.source_type}</Badge>
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">raw.jsonl</Badge>
                          {dataset.prepared_jsonl_path ? <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">prepared</Badge> : null}
                          {dataset.manifest_path ? <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">manifest</Badge> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <DownloadAssetButton
                          href={apiUrl(`/api/datasets/${encodeURIComponent(dataset.id)}/download`)}
                        />
                        <Button variant="outline" size="sm" onClick={() => sendQwenDatasetToTraining(dataset)} type="button">
                          {t("voices.datasets.useInTraining", "학습에 연결")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => void handleDeleteQwenDataset(dataset)}
                          type="button"
                        >
                          {t("action.delete", "삭제")}
                        </Button>
                      </div>
                    </WorkspaceCard>
                  ))
                ) : null}

                {datasetLibraryTarget !== "qwen" && visibleAudioDatasets.length ? (
                  visibleAudioDatasets.map((dataset) => (
                    <WorkspaceCard key={dataset.id} className="flex flex-wrap items-center gap-4">
                      <div className="grid size-12 place-items-center rounded-md bg-canvas border border-line shrink-0">
                        <span className="font-mono text-xs font-semibold text-accent">{audioDatasetTargetShort(dataset.target)}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-sm font-medium text-ink">{dataset.name}</strong>
                          <span className="text-xs text-ink-muted">{audioDatasetTargetLabel(dataset.target)} · {dataset.sample_count} samples</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">{dataset.source_type}</Badge>
                          {dataset.train_jsonl_path ? <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">train.jsonl</Badge> : null}
                          {dataset.lab_audio_dir_path ? <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">lab audio</Badge> : null}
                          {dataset.dataset_json_path ? <Badge variant="secondary" className="bg-canvas text-ink-muted text-[10px]">dataset.json</Badge> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <DownloadAssetButton
                          href={apiUrl(`/api/audio-datasets/${encodeURIComponent(dataset.id)}/download`)}
                        />
                        <Button variant="outline" size="sm" onClick={() => sendAudioDatasetToTraining(dataset)} type="button">
                          {t("voices.datasets.useInTraining", "학습에 연결")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => void handleDeleteAudioDataset(dataset)}
                          type="button"
                        >
                          {t("action.delete", "삭제")}
                        </Button>
                      </div>
                    </WorkspaceCard>
                  ))
                ) : null}

                {datasetLibraryBuckets[datasetLibraryTarget] === 0 ? (
                  <WorkspaceEmptyState
                    icon={Database}
                    title={t("voices.datasets.emptyTitle", "{target} 데이터셋이 없습니다.").replace("{target}", audioDatasetTargetLabel(datasetLibraryTarget))}
                    body={t("voices.datasets.emptyBody", "각 엔진의 학습 탭에서 생성 갤러리나 폴더로 데이터셋을 만들면 여기에서 확인하고 삭제할 수 있습니다.")}
                    action={
                      <Button onClick={() => setActiveTab(datasetLibraryTarget === "qwen" ? "dataset" : datasetLibraryTarget === "s2_pro" ? "s2pro_dataset" : datasetLibraryTarget === "vibevoice" ? "vibevoice_dataset" : datasetLibraryTarget === "rvc" ? "applio_dataset" : datasetLibraryTarget === "mmaudio" ? "mmaudio_dataset" : "ace_dataset")} type="button">
                        {t("voices.datasets.gotoDataset", "Qwen 데이터셋 만들기")}
                      </Button>
                    }
                  />
                ) : null}
              </TabsContent>
            </div>
          </Tabs>
        </WorkspaceShell>
      ) : null}

      {activeTab === "gallery" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("gallery.eyebrow")}
            eyebrowIcon={Headphones}
            title={t("gallery.title")}
            subtitle={t("gallery.description")}
            meta={
              <div className="mt-2 flex flex-wrap gap-2" aria-label="생성 통계">
                {([
                  ["all", t("gallery.total", "전체")],
                  ["speech", t("gallery.speech", "음성")],
                  ["qwen_preset", t("gallery.qwenPreset", "Qwen 프리셋 음성")],
                  ["s2pro_preset", t("gallery.s2proPreset", "S2-Pro 프리셋 음성")],
                  ["effect", t("gallery.effect", "사운드 이펙트")],
                  ["music", t("gallery.music", "ACE-Step 음악")],
                  ["rvc", t("gallery.rvc", "RVC 변환")],
                  ["utility", t("gallery.utility", "정제/분리")],
                ] as Array<[GalleryFilter, string]>).map(([filter, label]) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setGalleryFilter(filter);
                      setSelectedGalleryIds([]);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      galleryFilter === filter
                        ? "border-accent-edge bg-accent-soft text-accent-ink"
                        : "border-line bg-canvas text-ink-muted hover:border-line-strong"
                    }`}
                  >
                    <b className="mr-1 text-ink">{galleryBuckets[filter]}</b>{label}
                  </button>
                ))}
              </div>
            }
          />

          <WorkspaceCard className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div className="flex flex-col gap-0.5">
                <strong className="text-sm font-medium text-ink">{selectedGalleryIds.length ? t("gallery.selectedCount").replace("{count}", String(selectedGalleryIds.length)) : t("gallery.noneSelected")}</strong>
                <span className="text-xs text-ink-muted">{t("gallery.selectionHint")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!filteredHistory.length} onClick={() => setSelectedGalleryIds(filteredHistory.map((record) => gallerySelectionKey(record)))} type="button">
                  {t("action.selectAll")}
                </Button>
                <Button variant="outline" size="sm" disabled={!selectedGalleryIds.length} onClick={() => setSelectedGalleryIds([])} type="button">
                  {t("action.clearSelection")}
                </Button>
                <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" disabled={!selectedGalleryIds.length} onClick={handleDeleteSelectedHistory} type="button">
                  {t("action.deleteSelection")}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {filteredHistory.length ? filteredHistory.map((record) => {
                const selectionKey = gallerySelectionKey(record);
                const isSelected = selectedGalleryIds.includes(selectionKey);
                return (
                <article
                  key={selectionKey}
                  className={`flex flex-wrap items-center gap-3 rounded-md border p-3 transition ${isSelected ? "border-accent-edge bg-accent-soft/30" : "border-line bg-canvas/50 hover:border-line-strong"}`}
                >
                  <label className="flex items-center" aria-label={`${getRecordDisplayTitle(record)} 선택`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGallerySelection(selectionKey)}
                      className="size-4 cursor-pointer rounded border-line accent-accent"
                    />
                  </label>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <small className="text-[10px] uppercase tracking-allcaps font-mono text-ink-subtle">{getModeLabel(record.mode)} · {recordLanguageLabel(record)}</small>
                    <strong className="line-clamp-1 text-sm font-medium text-ink">{getRecordDisplayTitle(record)}</strong>
                    <span className="text-xs text-ink-muted">
                      {galleryPresetDescription(record)} · {getRecordModelLabel(record)}
                    </span>
                  </div>
                  <time className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-ink-subtle">{formatShortDate(record.created_at)}</time>
                  <audio controls src={mediaUrl(record.output_audio_url)} className="h-8 w-full sm:w-auto sm:flex-1 max-w-[280px]" />
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={mediaUrl(record.output_audio_url)} download={getAudioDownloadName(record)} aria-label="다운로드">
                        {t("action.download")}
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => void handleDeleteHistoryRecord(record.id)} type="button">
                      {t("action.delete")}
                    </Button>
                  </div>
                </article>
                );
              }) : (
                <WorkspaceEmptyState
                  icon={Headphones}
                  title={galleryFilter === "all" ? t("gallery.emptyTitle") : t("gallery.emptyFilteredTitle", "이 분류에는 생성 결과가 없습니다.")}
                  body={galleryFilter === "all" ? t("gallery.emptyDescription") : t("gallery.emptyFilteredDescription", "다른 분류를 선택하거나 새 결과를 생성하면 이곳에 표시됩니다.")}
                  action={
                    <Button onClick={() => setActiveTab("tts")} type="button">{t("action.firstVoice")}</Button>
                  }
                />
              )}
            </div>
          </WorkspaceCard>
        </WorkspaceShell>
      ) : null}

      {activeTab === "tts" ? (
        <section className="mx-auto flex w-full max-w-[var(--shell-content-max)] flex-col gap-6 px-1">
          {/* Page header */}
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/80 pb-6">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase text-ink-muted tracking-allcaps">
                <Sparkles className="size-3" />
                {t("tts.eyebrow")}
              </span>
              <h1 className="text-display font-semibold tracking-tight text-ink">{t("tts.title")}</h1>
              <p className="max-w-prose text-base text-ink-muted">{t("tts.subtitle")}</p>
            </div>
            <Button
              type="submit"
              form="qwen-tts-form"
              disabled={loading || !selectedInferenceModel}
              size="lg"
              className="gap-2 px-6"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              {t("tts.action.generate")}
            </Button>
          </header>

          {/* Two-column workspace */}
          <form
            id="qwen-tts-form"
            onSubmit={handleModelInferenceSubmit}
            className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
          >
            {/* Left column: script + style + result */}
            <div className="flex flex-col gap-5">
              <div className="rounded-lg border border-line bg-surface p-5 shadow-[0_1px_0_0_var(--line-subtle)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Label htmlFor="qwen-tts-text" className="text-sm font-medium">
                    {t("tts.section.script")}
                  </Label>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-canvas px-2 py-0.5">
                      <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] font-semibold text-ink-on-accent">
                        {(inferenceForm.speaker || selectedInferenceModel?.label || "V").slice(0, 1)}
                      </span>
                      <span className="max-w-[140px] truncate">
                        {inferenceForm.speaker ||
                          (selectedInferenceModel
                            ? displayModelName(selectedInferenceModel)
                            : t("tts.placeholder.voiceFallback"))}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Blob([inferenceForm.text]).size}/500 B
                    </span>
                  </div>
                </div>
                <Textarea
                  id="qwen-tts-text"
                  placeholder={t("tts.placeholder.text")}
                  value={inferenceForm.text}
                  onChange={(event) =>
                    setInferenceForm((prev) => ({ ...prev, text: event.target.value }))
                  }
                  className="min-h-[180px] resize-y border-line bg-canvas text-base leading-relaxed focus-visible:border-accent-edge focus-visible:ring-accent-soft"
                />
              </div>

              {selectedInferenceModel?.supports_instruction ? (
                <div className="rounded-lg border border-line bg-surface p-5 shadow-[0_1px_0_0_var(--line-subtle)]">
                  <Label
                    htmlFor="qwen-tts-instruct"
                    className="mb-3 flex items-center gap-2 text-sm font-medium"
                  >
                    {t("tts.section.style")}
                    <span className="font-normal text-ink-subtle">{t("tts.section.styleOptional")}</span>
                  </Label>
                  <Textarea
                    id="qwen-tts-instruct"
                    placeholder={t("tts.placeholder.style")}
                    value={inferenceForm.instruct}
                    onChange={(event) =>
                      setInferenceForm((prev) => ({ ...prev, instruct: event.target.value }))
                    }
                    className="min-h-[100px] resize-y border-line bg-canvas focus-visible:border-accent-edge focus-visible:ring-accent-soft"
                  />
                </div>
              ) : null}

              {/* Result / empty state — sits right beneath the script/style cards */}
              {lastInferenceRecord ? (
                <div className="rounded-lg border border-line bg-surface p-5 shadow-[0_1px_0_0_var(--line-subtle)]">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="border-0 bg-accent-soft text-accent-ink font-mono text-[10px] uppercase tracking-allcaps"
                      >
                        {t("tts.result.latest")}
                      </Badge>
                      <h3 className="text-sm font-medium text-ink">{t("tts.result.title")}</h3>
                    </div>
                  </div>
                  <AudioCard title={t("tts.result.subtitle")} record={lastInferenceRecord} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-sunken/40 px-6 py-10 text-center">
                  <div className="grid size-12 place-items-center rounded-full border border-line bg-surface">
                    <AudioWaveform className="size-5 text-ink-subtle" />
                  </div>
                  <p className="text-sm font-medium text-ink">{t("tts.empty.title")}</p>
                  <p className="max-w-sm text-xs text-ink-muted">{t("tts.empty.body")}</p>
                </div>
              )}
            </div>

            {/* Right column: settings / history */}
            <aside className="self-start rounded-lg border border-line bg-surface shadow-[0_1px_0_0_var(--line-subtle)]">
              <Tabs
                value={ttsSideView}
                onValueChange={(value) => setTtsSideView(value as typeof ttsSideView)}
                className="flex flex-col"
              >
                <TabsList className="grid w-full grid-cols-2 rounded-b-none rounded-t-lg border-b border-line bg-transparent p-0 h-auto">
                  <TabsTrigger
                    value="settings"
                    className="rounded-none border-b-2 border-transparent bg-transparent py-3 text-sm font-medium text-ink-muted shadow-none data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none"
                  >
                    {t("tts.tab.settings")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="rounded-none border-b-2 border-transparent bg-transparent py-3 text-sm font-medium text-ink-muted shadow-none data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none"
                  >
                    {t("tts.tab.history")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="settings" className="m-0 flex flex-col gap-4 p-5">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("tts.field.model")}</Label>
                    <Select
                      value={inferenceForm.model_id || undefined}
                      onValueChange={(value) =>
                        setInferenceForm((prev) => ({ ...prev, model_id: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("tts.field.modelPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ttsModels.map((model) => (
                          <SelectItem key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedInferenceModel?.available_speakers?.length ? (
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("tts.field.speaker")}</Label>
                      <Select
                        value={inferenceForm.speaker || undefined}
                        onValueChange={(value) => {
                          const info = speakers.find((item) => item.speaker === value);
                          setInferenceForm((prev) => ({
                            ...prev,
                            speaker: value,
                            language: info?.nativeLanguage || prev.language,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("tts.field.speakerPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedInferenceModel.available_speakers.map((speaker) => {
                            const info = speakers.find((item) => item.speaker === speaker);
                            return (
                              <SelectItem key={speaker} value={speaker}>
                                <span className="flex items-center gap-2">
                                  <span>{speaker}</span>
                                  {info ? (
                                    <span className="font-mono text-[10px] uppercase tracking-wide text-ink-subtle">
                                      {info.nativeLanguage}
                                    </span>
                                  ) : null}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {(() => {
                    const speakerInfo = speakers.find((item) => item.speaker === inferenceForm.speaker);
                    const isNonNative =
                      speakerInfo &&
                      inferenceForm.language &&
                      inferenceForm.language !== "Auto" &&
                      inferenceForm.language !== speakerInfo.nativeLanguage;
                    return (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("tts.field.language")}</Label>
                        <LanguageSelect
                          value={inferenceForm.language}
                          onChange={(language) => setInferenceForm((prev) => ({ ...prev, language }))}
                        />
                        {isNonNative ? (
                          <p className="text-[11px] text-warn">
                            {t(
                              "tts.field.nonNativeWarning",
                              "{speaker}는 {native} 화자입니다. {target} 합성은 품질이 낮을 수 있습니다.",
                            )
                              .replace("{speaker}", inferenceForm.speaker)
                              .replace("{native}", speakerInfo.nativeLanguage)
                              .replace("{target}", inferenceForm.language)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qwen-tts-output" className="text-xs font-medium text-ink-muted">
                      {t("tts.field.outputName")}
                    </Label>
                    <Input
                      id="qwen-tts-output"
                      placeholder={t("tts.placeholder.outputName")}
                      value={inferenceForm.output_name}
                      onChange={(event) =>
                        setInferenceForm((prev) => ({ ...prev, output_name: event.target.value }))
                      }
                    />
                  </div>

                  {selectedInferenceMode === "voice_clone" ? (
                    <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                        {t("tts.advanced.referenceVoice")}
                        <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                      </summary>
                      <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">{t("tts.advanced.referenceAudio")}</Label>
                          <Input
                            value={inferenceForm.ref_audio_path}
                            onChange={(event) =>
                              setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">{t("tts.advanced.referenceText")}</Label>
                          <Textarea
                            value={inferenceForm.ref_text}
                            onChange={(event) =>
                              setInferenceForm((prev) => ({ ...prev, ref_text: event.target.value }))
                            }
                            className="min-h-[64px] resize-y border-line bg-canvas"
                          />
                        </div>
                        <ServerAudioPicker
                          assets={generatedAudioAssets}
                          selectedPath={inferenceForm.ref_audio_path}
                          onSelect={handleSelectInferenceAsset}
                        />
                      </div>
                    </details>
                  ) : null}

                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("tts.advanced.controls")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="border-t border-line px-3 py-3">
                      <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
                    </div>
                  </details>
                </TabsContent>

                <TabsContent value="history" className="m-0 p-0">
                  <ScrollArea className="h-[420px]">
                    <div className="flex flex-col gap-1 p-3">
                      {history.length ? (
                        history.slice(0, 12).map((record) => (
                          <article
                            key={gallerySelectionKey(record)}
                            className="flex flex-col gap-2 rounded-md border border-transparent p-3 transition hover:border-line hover:bg-canvas"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <strong className="line-clamp-1 text-sm font-medium text-ink">
                                {getRecordDisplayTitle(record)}
                              </strong>
                              <time className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-ink-subtle">
                                {formatShortDate(record.created_at)}
                              </time>
                            </div>
                            <audio
                              controls
                              src={mediaUrl(record.output_audio_url)}
                              className="h-8 w-full"
                            />
                          </article>
                        ))
                      ) : (
                        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                          <Clock className="size-5 text-ink-subtle" />
                          <p className="text-sm text-ink-muted">{t("tts.history.empty")}</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </aside>
          </form>
        </section>
      ) : null}

      {activeTab === "design" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("design.eyebrow", "VOICE DESIGN")}
            eyebrowIcon={Wand2}
            title={t("design.title", "목소리 설계")}
            subtitle={t("design.subtitle", "설명문으로 새 목소리를 만들고, 마음에 드는 결과를 프리셋으로 저장합니다.")}
            action={{
              label: t("design.action.generate", "설계 음성 생성"),
              formId: "voice-design-form",
              disabled: loading,
              loading,
            }}
          />

          <form
            id="voice-design-form"
            onSubmit={handleVoiceDesignSubmit}
            className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
          >
            <div className="flex flex-col gap-5">
              <WorkspaceCard>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("tts.field.model")}</Label>
                    <Select
                      value={designForm.model_id || undefined}
                      onValueChange={(value) => setDesignForm({ ...designForm, model_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("tts.field.modelPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {voiceDesignModels.map((model) => (
                          <SelectItem key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="design-output" className="text-xs font-medium text-ink-muted">
                      {t("design.field.filename", "파일 이름")}
                    </Label>
                    <Input
                      id="design-output"
                      placeholder={t("design.placeholder.filename", "예: 차가운-여성-목소리")}
                      value={designForm.output_name}
                      onChange={(event) => setDesignForm({ ...designForm, output_name: event.target.value })}
                    />
                  </div>
                </div>
              </WorkspaceCard>

              <WorkspaceCard>
                <Label htmlFor="design-instruct" className="mb-3 block text-sm font-medium">
                  {t("design.field.description", "목소리 설명")}
                </Label>
                <Textarea
                  id="design-instruct"
                  placeholder="예: Young Korean woman, cool, polished, and articulate. Keep the tone restrained and elegant."
                  value={designForm.instruct}
                  onChange={(event) => setDesignForm({ ...designForm, instruct: event.target.value })}
                  className="min-h-[120px] resize-y border-line bg-canvas focus-visible:border-accent-edge focus-visible:ring-accent-soft"
                />
              </WorkspaceCard>

              <WorkspaceCard>
                <Label htmlFor="design-text" className="mb-3 block text-sm font-medium">
                  {t("design.field.script", "대사")}
                </Label>
                <Textarea
                  id="design-text"
                  value={designForm.text}
                  onChange={(event) => setDesignForm({ ...designForm, text: event.target.value })}
                  className="min-h-[120px] resize-y border-line bg-canvas text-base leading-relaxed focus-visible:border-accent-edge focus-visible:ring-accent-soft"
                />
                <div className="mt-4 flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("tts.field.language")}</Label>
                  <LanguageSelect
                    value={designForm.language}
                    onChange={(language) => setDesignForm({ ...designForm, language })}
                  />
                </div>
                <details className="group mt-4 rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("tts.advanced.controls")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3">
                    <GenerationControlsEditor value={designControls} onChange={setDesignControls} />
                  </div>
                </details>
              </WorkspaceCard>

              {lastDesignRecord ? (
                <WorkspaceCard>
                  <WorkspaceResultHeader
                    title={t("design.result.title", "방금 생성한 설계 음성")}
                    badge={t("tts.result.latest")}
                  />
                  <AudioCard
                    title={t("design.result.subtitle", "설명문 기반 결과")}
                    record={lastDesignRecord}
                  />
                </WorkspaceCard>
              ) : (
                <WorkspaceEmptyState
                  icon={AudioWaveform}
                  title={t("design.empty.title", "아직 설계 음성이 없습니다.")}
                  body={t("design.empty.body", "설명문과 대사를 입력하고 [설계 음성 생성]을 누르면 결과가 여기에 표시됩니다.")}
                />
              )}
            </div>

            <aside className="self-start">
              <WorkspaceCard>
                <div className="mb-4 flex items-center gap-2">
                  <Save className="size-4 text-ink-muted" />
                  <h3 className="text-sm font-medium text-ink">
                    {t("design.preset.title", "프리셋으로 저장")}
                  </h3>
                </div>
                <p className="mb-4 text-xs text-ink-muted">
                  {t("design.preset.subtitle", "마음에 드는 설계 결과를 서비스별 프리셋으로 따로 저장합니다.")}
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">
                      {t("design.preset.name", "프리셋 이름")}
                    </Label>
                    <Input
                      placeholder={t("design.preset.namePlaceholder", "예: 차분한-여성-내레이션")}
                      value={presetForm.name}
                      onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">
                      {t("design.preset.language", "기본 언어")}
                    </Label>
                    <LanguageSelect
                      value={presetForm.language}
                      onChange={(language) => setPresetForm({ ...presetForm, language })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">
                      {t("design.preset.notes", "메모")}
                    </Label>
                    <Textarea
                      placeholder={t("design.preset.notesPlaceholder", "예: 차분한 내레이션용. 낮은 속도와 또렷한 발음이 잘 맞음.")}
                      value={presetForm.notes}
                      onChange={(event) => setPresetForm({ ...presetForm, notes: event.target.value })}
                      className="min-h-[64px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled={!lastDesignRecord || loading}
                      onClick={() => void handleSaveDesignAsQwenPreset()}
                    >
                      {t("design.preset.saveQwen", "Qwen 프리셋 저장")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!lastDesignRecord || loading}
                      onClick={() => void handleSaveDesignAsS2ProPreset()}
                    >
                      {t("design.preset.saveS2Pro", "S2-Pro 프리셋 저장")}
                    </Button>
                  </div>
                </div>
              </WorkspaceCard>
            </aside>
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "clone" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("clone.eyebrow", "VOICE CLONE")}
            eyebrowIcon={Mic}
            title={t("clone.title", "참조 음성으로 스타일 저장 또는 직접 복제")}
            subtitle={t("clone.subtitle", "프리셋으로 반복 사용할 스타일을 저장하거나, VoiceBox 모델로 바로 새 대사를 생성합니다.")}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Step 1 */}
            <WorkspaceCard className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">
                  1
                </span>
                <h3 className="text-sm font-medium text-ink">{t("clone.step1.title", "참조 음성 선택")}</h3>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("clone.step1.upload", "음성 파일 불러오기")}</Label>
                <AudioUploadField
                  id="qwen-clone-reference-upload"
                  buttonLabel={t("clone.step1.choose", "파일 선택")}
                  statusLabel={uploadedRef ? uploadedRef.filename : t("clone.step1.noFile", "선택된 파일 없음")}
                  onFile={handleUploadReference}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("clone.step1.refText", "참조 텍스트")}</Label>
                <Textarea
                  placeholder={t("clone.step1.refPlaceholder", "비워두면 서버가 자동으로 전사합니다.")}
                  value={uploadRefText}
                  onChange={(event) => setUploadRefText(event.target.value)}
                  className="min-h-[80px] resize-y border-line bg-canvas"
                />
                {uploadTranscriptMeta ? (
                  <p className="text-[11px] text-ink-subtle">{uploadTranscriptMeta}</p>
                ) : null}
              </div>
              <AsrModelSelect compact />

              <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleTranscribeUploadText} type="button">
                  {t("clone.step1.retranscribe", "다시 전사")}
                </Button>
                {cloneEngine === "voicebox" ? (
                  <Button size="sm" onClick={handleVoiceBoxCloneFromUpload} type="button">
                    {t("clone.step1.voiceboxClone", "VoiceBox 복제 생성")}
                  </Button>
                ) : null}
              </div>
            </WorkspaceCard>

            {/* Step 2 */}
            <WorkspaceCard className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">
                  2
                </span>
                <h3 className="text-sm font-medium text-ink">{t("clone.step2.title", "엔진 / 모델")}</h3>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("tts.field.model")}</Label>
                <Select
                  value={selectedCloneModelId || undefined}
                  onValueChange={(value) => handleSelectCloneModel(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("tts.field.modelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {cloneModelOptions.map((model) => (
                      <SelectItem key={model.key} value={model.model_id}>
                        {displayModelName(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cloneEngine === "base_prompt" ? null : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                    <Textarea
                      value={voiceBoxCloneForm.text}
                      onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, text: event.target.value })}
                      className="min-h-[80px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("clone.step2.speakerName", "화자명")}</Label>
                      <Input
                        value={voiceBoxCloneForm.speaker}
                        onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, speaker: event.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("design.field.filename", "파일 이름")}</Label>
                      <Input
                        value={voiceBoxCloneForm.output_name}
                        onChange={(event) => setVoiceBoxCloneForm({ ...voiceBoxCloneForm, output_name: event.target.value })}
                      />
                    </div>
                  </div>
                  {lastVoiceBoxCloneRecord ? (
                    <AudioCard title={getRecordDisplayTitle(lastVoiceBoxCloneRecord)} record={lastVoiceBoxCloneRecord} />
                  ) : null}
                </div>
              )}
            </WorkspaceCard>

            {/* Step 3 */}
            <WorkspaceCard className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">
                  3
                </span>
                <h3 className="text-sm font-medium text-ink">
                  {cloneEngine === "base_prompt"
                    ? t("clone.step3.preset", "프리셋 저장")
                    : t("clone.step3.useResult", "생성 데이터 활용")}
                </h3>
              </div>

              {cloneEngine === "base_prompt" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.preset.name", "프리셋 이름")}</Label>
                    <Input
                      placeholder={t("design.preset.namePlaceholder", "예: 차분한-여성-내레이션")}
                      value={presetForm.name}
                      onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.preset.language", "기본 언어")}</Label>
                    <LanguageSelect
                      value={presetForm.language}
                      onChange={(language) => setPresetForm({ ...presetForm, language })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.preset.notes", "메모")}</Label>
                    <Textarea
                      placeholder={t("design.preset.notesPlaceholder", "예: 차분한 내레이션용. 낮은 속도와 또렷한 발음이 잘 맞음.")}
                      value={presetForm.notes}
                      onChange={(event) => setPresetForm({ ...presetForm, notes: event.target.value })}
                      className="min-h-[64px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-canvas/60 px-3 py-2.5">
                    <span className="text-xs font-medium text-ink-muted">
                      {t("clone.step3.createS2ProToo", "S2-Pro 프리셋도 함께 생성")}
                    </span>
                    <Switch
                      checked={createS2ProWithPreset}
                      onCheckedChange={setCreateS2ProWithPreset}
                    />
                  </div>
                  <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      disabled={!uploadedRef || !selectedBaseModelId || loading}
                      onClick={() => void handleCreatePreset("upload")}
                      type="button"
                    >
                      {t("clone.step3.savePreset", "현재 스타일로 프리셋 저장")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-ink-muted">
                    {t("clone.step3.note", "VoiceBox로 만든 결과는 생성 갤러리에 저장되고, 필요하면 데이터셋 샘플로 이어서 쓸 수 있습니다.")}
                  </p>
                  <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!lastVoiceBoxCloneRecord}
                      onClick={() => {
                        if (!lastVoiceBoxCloneRecord) return;
                        mergeDatasetSamples([{ audio_path: lastVoiceBoxCloneRecord.output_audio_path, text: lastVoiceBoxCloneRecord.input_text }]);
                        setDatasetForm((prev) => ({ ...prev, ref_audio_path: prev.ref_audio_path || lastVoiceBoxCloneRecord.output_audio_path }));
                        setActiveTab("dataset");
                      }}
                      type="button"
                    >
                      {t("clone.step3.toDataset", "방금 결과를 데이터셋에 추가")}
                    </Button>
                  </div>
                </>
              )}
            </WorkspaceCard>
          </div>
        </WorkspaceShell>
      ) : null}

      {activeTab === "projects" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("projects.eyebrow", "PRESET PROJECTS")}
            eyebrowIcon={FolderOpen}
            title={t("projects.title", "프리셋 기반 생성")}
            subtitle={t("projects.subtitle", "저장된 프리셋과 모델을 결합해 새 음성을 생성합니다.")}
          />

          <WorkspaceCard className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-ink-muted">{t("projects.field.preset", "프리셋")}</Label>
              <Select
                value={selectedHybridPresetId || undefined}
                onValueChange={(value) => { setSelectedHybridPresetId(value); setSelectedPresetId(value); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedHybridPreset ? (
              <article className="rounded-md border border-line bg-canvas/60 p-3">
                <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("projects.selected.label", "선택한 프리셋")}</span>
                <strong className="mt-1 block text-sm font-medium text-ink">{selectedHybridPreset.name}</strong>
                <p className="mt-1 text-xs text-ink-muted">{selectedHybridPreset.reference_text}</p>
              </article>
            ) : (
              <p className="text-xs text-ink-muted">{t("projects.selected.hint", "먼저 저장된 프리셋을 고르세요.")}</p>
            )}

            <Tabs value={presetWorkflow} onValueChange={(value) => setPresetWorkflow(value as typeof presetWorkflow)} className="flex flex-col gap-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 bg-canvas border border-line p-1 h-auto">
                <TabsTrigger value="base" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">Base Preset</TabsTrigger>
                <TabsTrigger value="hybrid" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">Base + Instruction</TabsTrigger>
                <TabsTrigger value="voicebox" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">VoiceBox Preset</TabsTrigger>
                <TabsTrigger value="voicebox_instruct" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">VoiceBox + Instruction</TabsTrigger>
              </TabsList>

              <TabsContent value="base" className="m-0">
                <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleGenerateFromPreset(); }}>
                  <h3 className="text-sm font-medium text-ink">{t("projects.base.title", "Base 프리셋 생성")}</h3>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("projects.base.model", "Base 모델")}</Label>
                    <Select value={selectedBaseModelId || undefined} onValueChange={(value) => setSelectedBaseModelId(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                      </SelectTrigger>
                      <SelectContent>
                        {baseModels.map((model) => (
                          <SelectItem key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                    <Textarea value={presetGenerateText} onChange={(event) => setPresetGenerateText(event.target.value)} className="min-h-[80px] resize-y border-line bg-canvas" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.filename", "파일 이름")}</Label>
                    <Input
                      placeholder={t("projects.base.filenamePlaceholder", "예: 프리셋-첫-대사")}
                      value={presetOutputName}
                      onChange={(event) => setPresetOutputName(event.target.value)}
                    />
                  </div>
                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("tts.advanced.controls", "Advanced controls")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="border-t border-line px-3 py-3">
                      <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
                    </div>
                  </details>
                  <Button variant="outline" disabled={!selectedHybridPreset} type="submit">
                    {t("projects.base.submit", "Base 프리셋 생성")}
                  </Button>
                </form>
              </TabsContent>

	              <TabsContent value="hybrid" className="m-0">
	                <form className="flex flex-col gap-4" onSubmit={handleHybridInferenceSubmit}>
	                  <h3 className="text-sm font-medium text-ink">{t("projects.hybrid.title", "Base + CustomVoice 지시 생성")}</h3>
	                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("projects.hybrid.styleModel", "스타일 분석 모델")}</Label>
                      <Select
                        value={hybridForm.base_model_id || undefined}
                        onValueChange={(value) => setHybridForm((prev) => ({ ...prev, base_model_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                        </SelectTrigger>
                        <SelectContent>
                          {baseModels.map((model) => (
                            <SelectItem key={model.key} value={model.model_id}>
                              {displayModelName(model)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("projects.hybrid.instructModel", "말투 지시용 모델")}</Label>
                      <Select
                        value={hybridForm.custom_model_id || undefined}
                        onValueChange={(value) => setHybridForm((prev) => ({ ...prev, custom_model_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                        </SelectTrigger>
                        <SelectContent>
                          {customVoiceCapableModels.map((model) => (
                            <SelectItem key={model.key} value={model.model_id}>
                              {displayModelName(model)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                    <Textarea value={hybridForm.text} onChange={(event) => setHybridForm((prev) => ({ ...prev, text: event.target.value }))} className="min-h-[80px] resize-y border-line bg-canvas" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("projects.hybrid.instruction", "말투 지시")}</Label>
                    <Textarea
                      placeholder={t("projects.hybrid.instructionPlaceholder", "원하는 감정이나 분위기를 적어주세요.")}
                      value={hybridForm.instruct}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, instruct: event.target.value }))}
                      className="min-h-[80px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.filename", "파일 이름")}</Label>
                    <Input
                      value={hybridForm.output_name}
                      onChange={(event) => setHybridForm((prev) => ({ ...prev, output_name: event.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("tts.field.language", "언어")}</Label>
                    <LanguageSelect
                      value={hybridForm.language}
                      onChange={(language) => setHybridForm((prev) => ({ ...prev, language }))}
                    />
                  </div>
                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("tts.advanced.controls", "Advanced controls")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="border-t border-line px-3 py-3">
                      <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
                    </div>
                  </details>
	                  <Button variant="outline" disabled={loading || !selectedHybridPreset} type="submit">
	                    {t("projects.hybrid.submit", "말투 지시 적용 생성")}
	                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="voicebox" className="m-0">
                <form className="flex flex-col gap-4" onSubmit={handleGenerateVoiceBoxFromPreset}>
                  <h3 className="text-sm font-medium text-ink">{t("projects.voicebox.title", "VoiceBox 프리셋 생성")}</h3>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("projects.voicebox.model", "VoiceBox 모델")}</Label>
                    <Select value={voiceBoxPresetForm.model_id || undefined} onValueChange={(value) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, model_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                      </SelectTrigger>
                      <SelectContent>
                        {voiceBoxModels.map((model) => (
                          <SelectItem key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                    <Textarea value={voiceBoxPresetForm.text} onChange={(event) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, text: event.target.value })} className="min-h-[80px] resize-y border-line bg-canvas" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.filename", "파일 이름")}</Label>
                    <Input value={voiceBoxPresetForm.output_name} onChange={(event) => setVoiceBoxPresetForm({ ...voiceBoxPresetForm, output_name: event.target.value })} />
                  </div>
                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("tts.advanced.controls", "Advanced controls")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="border-t border-line px-3 py-3">
                      <GenerationControlsEditor value={presetControls} onChange={setPresetControls} />
                    </div>
                  </details>
                  <Button variant="outline" disabled={loading || !selectedHybridPreset || !voiceBoxModels.length} type="submit">
                    {t("projects.voicebox.submit", "VoiceBox 프리셋 생성")}
                  </Button>
                </form>
              </TabsContent>

	              <TabsContent value="voicebox_instruct" className="m-0">
	                <form className="flex flex-col gap-4" onSubmit={handleGenerateVoiceBoxInstructFromPreset}>
	                  <h3 className="text-sm font-medium text-ink">{t("projects.voiceboxInstruct.title", "VoiceBox 프리셋 + 말투 지시")}</h3>
	                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("projects.voicebox.model", "VoiceBox 모델")}</Label>
                    <Select value={voiceBoxPresetInstructForm.model_id || undefined} onValueChange={(value) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, model_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                      </SelectTrigger>
                      <SelectContent>
                        {voiceBoxModels.map((model) => (
                          <SelectItem key={model.key} value={model.model_id}>
                            {displayModelName(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                    <Textarea value={voiceBoxPresetInstructForm.text} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, text: event.target.value })} className="min-h-[80px] resize-y border-line bg-canvas" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("projects.hybrid.instruction", "말투 지시")}</Label>
                    <Textarea value={voiceBoxPresetInstructForm.instruct} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, instruct: event.target.value })} className="min-h-[80px] resize-y border-line bg-canvas" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("design.field.filename", "파일 이름")}</Label>
                    <Input value={voiceBoxPresetInstructForm.output_name} onChange={(event) => setVoiceBoxPresetInstructForm({ ...voiceBoxPresetInstructForm, output_name: event.target.value })} />
                  </div>
                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("tts.advanced.controls", "Advanced controls")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="border-t border-line px-3 py-3">
                      <GenerationControlsEditor value={hybridControls} onChange={setHybridControls} />
                    </div>
                  </details>
	                  <Button variant="outline" disabled={loading || !selectedHybridPreset || !voiceBoxModels.length} type="submit">
	                    {t("projects.voiceboxInstruct.submit", "VoiceBox 지시 생성")}
	                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </WorkspaceCard>

          {lastHybridRecord || lastVoiceBoxPresetRecord || lastVoiceBoxPresetInstructRecord ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("projects.result.title", "생성 결과")} badge={t("tts.result.latest")} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {lastHybridRecord ? <AudioCard title={t("projects.result.hybrid", "Base + CustomVoice 결과")} subtitle={lastHybridRecord.mode} record={lastHybridRecord} /> : null}
                {lastVoiceBoxPresetRecord ? <AudioCard title={t("projects.result.voicebox", "VoiceBox 프리셋 결과")} subtitle={lastVoiceBoxPresetRecord.mode} record={lastVoiceBoxPresetRecord} /> : null}
                {lastVoiceBoxPresetInstructRecord ? <AudioCard title={t("projects.result.voiceboxInstruct", "VoiceBox 지시 결과")} subtitle={lastVoiceBoxPresetInstructRecord.mode} record={lastVoiceBoxPresetInstructRecord} /> : null}
              </div>
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {isS2ProTab(activeTab) ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("s2pro.eyebrow", "S2-PRO")}
            eyebrowIcon={Mic}
            title={
              currentS2ProMode === "tagged" ? t("s2pro.tagged.title", "S2-Pro 태그 기반 생성")
                : currentS2ProMode === "clone" ? t("s2pro.clone.title", "S2-Pro 목소리 저장")
                : currentS2ProMode === "multi_speaker" ? t("s2pro.multi.title", "S2-Pro 다중 화자 대화")
                : t("s2pro.multilingual.title", "S2-Pro 다국어 음성")
            }
            subtitle={
              currentS2ProMode === "tagged" ? t("s2pro.tagged.subtitle", "저장한 목소리를 선택해 새 대사를 생성합니다.")
                : currentS2ProMode === "clone" ? t("s2pro.clone.subtitle", "생성 갤러리 음성이나 업로드 파일을 재사용 가능한 목소리로 저장합니다.")
                : currentS2ProMode === "multi_speaker" ? t("s2pro.multi.subtitle", "대사 안에 speaker tag를 넣어 장면을 나눕니다.")
                : t("s2pro.multilingual.subtitle", "같은 voice asset을 기준으로 한국어, 영어, 일본어 등 여러 언어 문장을 이어서 확인합니다.")
            }
            action={
              currentS2ProMode === "clone"
                ? undefined
                : {
                    label: t("s2pro.action.generate", "S2-Pro 생성"),
                    formId: "s2pro-form",
                    loading,
                  }
            }
            meta={
              s2ProRuntime ? (
                <Badge variant="secondary" className={s2ProRuntime.available ? "bg-positive/20 text-positive border-0" : "bg-canvas text-ink-muted border-0"}>
                  {s2ProRuntime.runtime_mode === "api"
                    ? s2ProRuntime.api_key_configured
                      ? "Fish Audio API"
                      : "API key required"
                    : "Local S2-Pro"}{" · "}{s2ProRuntime.model}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-canvas text-ink-muted border-0">{t("s2pro.engine.checking", "엔진 확인 중")}</Badge>
              )
            }
          />

          <form
            id="s2pro-form"
            className={`grid grid-cols-1 gap-5 ${currentS2ProMode === "clone" ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"}`}
            onSubmit={(event) => {
              if (currentS2ProMode === "clone") {
                handleCreateS2ProVoice(event);
                return;
              }
              void handleS2ProSubmit(event);
            }}
          >
            <div className="flex flex-col gap-5">
              {currentS2ProMode === "tagged" ? (
                <>
                  <WorkspaceCard className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                      <h3 className="text-sm font-medium text-ink">{t("s2pro.tagged.step1", "저장 목소리로 대사 만들기")}</h3>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Saved voice</Label>
                      <Select value={selectedS2VoiceId || undefined} onValueChange={selectS2ProVoice}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("s2pro.tagged.defaultVoice", "저장 목소리 없이 기본 S2-Pro로 생성")} />
                        </SelectTrigger>
                        <SelectContent>
                          {s2ProVoices.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedS2Voice ? (
                      <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                        <strong className="text-sm font-medium text-ink">{selectedS2Voice.name}</strong>
                        <span className="text-xs text-ink-muted">{selectedS2Voice.reference_text || t("s2pro.tagged.noText", "저장된 참조 문장 없음")}</span>
                        <audio controls src={mediaUrl(selectedS2Voice.reference_audio_url)} className="w-full h-8" />
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-line bg-sunken/40 p-3 flex flex-col items-start gap-2">
                        <strong className="text-xs font-medium text-ink-muted">{t("s2pro.tagged.emptyHint", "목소리 저장을 먼저 하면 여기서 계속 재사용할 수 있습니다.")}</strong>
                        <Button variant="outline" size="sm" onClick={() => openS2ProTab("s2pro_clone")} type="button">
                          {t("s2pro.tagged.gotoSave", "목소리 저장으로 이동")}
                        </Button>
                      </div>
                    )}
                  </WorkspaceCard>
                  <WorkspaceCard>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("design.field.script", "대사")}</Label>
                      <Textarea
                        value={s2ProForm.text}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, text: event.target.value })}
                        className="min-h-[120px] resize-y border-line bg-canvas"
                      />
                    </div>
                    <details className="group mt-4 rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                        {t("s2pro.tagged.tags", "태그")}
                        <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                      </summary>
                      <div className="border-t border-line px-3 py-3 flex flex-col gap-3">
                        <p className="text-xs text-ink-muted">{t("s2pro.tagged.tagsHint", "대사 사이에 넣을 표현 태그를 고릅니다. 선택한 태그는 Text에 바로 삽입됩니다.")}</p>
                        <Input
                          placeholder={t("s2pro.tagged.tagSearch", "Search tags, e.g. low voice, angry, pause")}
                          value={s2TagSearch}
                          onChange={(event) => setS2TagSearch(event.target.value)}
                        />
                        <div className="flex flex-col gap-3" aria-label="S2-Pro expression tag library">
                          {filteredS2TagCategories.map((category, categoryIndex) => (
                            <section key={`${category.label}-${categoryIndex}`} className="flex flex-col gap-1.5">
                              <strong className="text-xs font-medium text-ink-muted">{category.label}</strong>
                              <div className="flex flex-wrap gap-1.5">
                                {category.tags.map((tag, tagIndex) => (
                                  <Button variant="outline" size="sm" className="h-7 text-xs" key={`${categoryIndex}-${tag}-${tagIndex}`} onClick={() => applyS2ProTag(tag)} type="button">
                                    {tag}
                                  </Button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </div>
                    </details>
                    <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                      <span>{selectedS2Voice ? selectedS2Voice.name : t("s2pro.defaultVoice", "기본 S2-Pro voice")}</span>
                      <span className="font-mono tabular-nums">{new Blob([s2ProForm.text]).size} / 500 바이트</span>
                    </div>
                  </WorkspaceCard>
                </>
              ) : null}

              {currentS2ProMode === "clone" ? (
                <>
                  <WorkspaceCard className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                      <h3 className="text-sm font-medium text-ink">{t("s2pro.clone.step1", "목소리 저장")}</h3>
                    </div>
                    <Tabs value={s2ProCloneSource} onValueChange={(value) => setS2ProCloneSource(value as typeof s2ProCloneSource)}>
                      <TabsList className="grid w-full grid-cols-2 gap-1 bg-canvas border border-line p-1 h-auto">
                        <TabsTrigger value="gallery" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">{t("s2pro.clone.fromGallery", "생성 갤러리에서 선택")}</TabsTrigger>
                        <TabsTrigger value="upload" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">{t("s2pro.clone.upload", "새 파일 업로드")}</TabsTrigger>
                      </TabsList>
                      <TabsContent value="gallery" className="m-0 mt-3 flex flex-col gap-2">
                        <strong className="text-sm font-medium text-ink">{t("s2pro.clone.galleryTitle", "생성한 음성 선택")}</strong>
                        <span className="text-xs text-ink-muted">{t("s2pro.clone.galleryHint", "목소리 설계, Qwen, S2-Pro에서 만든 결과를 바로 목소리 자산으로 저장합니다.")}</span>
                        <ServerAudioPicker assets={generatedAudioAssets} selectedPath={s2ProVoiceForm.reference_audio_path} onSelect={handleSelectS2ProReference} />
                      </TabsContent>
                      <TabsContent value="upload" className="m-0 mt-3 flex flex-col gap-2">
                        <Label className="text-xs font-medium text-ink-muted">{t("s2pro.clone.uploadTitle", "참조 음성 업로드")}</Label>
                        <p className="text-xs text-ink-muted">{t("s2pro.clone.uploadHint", "WAV, MP3, FLAC 파일을 선택하세요")}</p>
                        <AudioUploadField
                          id="s2pro-voice-reference-upload"
                          buttonLabel={t("file_upload.choose", "파일 선택")}
                          statusLabel={s2ProUploadedRef?.filename || t("file_upload.none", "선택된 파일 없음")}
                          onFile={handleUploadS2ProReference}
                        />
                        {s2ProUploadedRef ? (
                          <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                            <strong className="text-sm font-medium text-ink">{s2ProUploadedRef.filename}</strong>
                            <audio controls src={s2ProUploadedRef.url} className="w-full h-8" />
                          </div>
                        ) : null}
                      </TabsContent>
                    </Tabs>

                    <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-3">
                      <div>
                        <strong className="text-sm font-medium text-ink">{s2ProVoiceForm.reference_audio_path ? basenameFromPath(s2ProVoiceForm.reference_audio_path) : t("s2pro.clone.noRef", "선택된 참조 음성이 없습니다")}</strong>
                        {s2ProVoiceForm.reference_audio_path ? <audio controls src={fileUrlFromPath(s2ProVoiceForm.reference_audio_path)} className="mt-2 w-full h-8" /> : null}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Voice name</Label>
                        <Input value={s2ProVoiceForm.name} onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, name: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">Provider</Label>
                          <Select
                            value={s2ProVoiceForm.runtime_source || undefined}
                            onValueChange={(value) => setS2ProVoiceForm({ ...s2ProVoiceForm, runtime_source: value as "local" | "api" })}
                          >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="local">Local S2-Pro</SelectItem>
                            <SelectItem value="api">Fish Audio API</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <AsrModelSelect compact />
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Reference transcript</Label>
                        <Textarea
                          placeholder={t("s2pro.clone.refPlaceholder", "선택/업로드하면 메타데이터나 Qwen3-ASR 전사로 자동 입력됩니다. 필요하면 수정하세요.")}
                          value={s2ProVoiceForm.reference_text}
                          onChange={(event) => setS2ProVoiceForm({ ...s2ProVoiceForm, reference_text: event.target.value })}
                          className="min-h-[80px] resize-y border-line bg-canvas"
                        />
                      </div>
                      <Button
                        disabled={!s2ProVoiceForm.reference_audio_path || !s2ProVoiceForm.name.trim() || !s2ProVoiceForm.reference_text.trim()}
                        type="submit"
                      >
                        {t("s2pro.clone.save", "목소리 저장")}
                      </Button>
                      <label className="flex items-center gap-2 rounded-md border border-line bg-canvas/60 px-3 py-2 text-xs text-ink-muted">
                        <Switch checked={s2ProVoiceForm.create_qwen_prompt} onCheckedChange={(checked) => setS2ProVoiceForm({ ...s2ProVoiceForm, create_qwen_prompt: checked })} />
                        {t("s2pro.clone.qwenPrompt", "Qwen clone prompt도 함께 생성")}
                      </label>
                    </div>
                  </WorkspaceCard>
                </>
              ) : null}

              {currentS2ProMode === "multi_speaker" ? (
                <WorkspaceCard className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                    <h3 className="text-sm font-medium text-ink">{t("s2pro.multi.step1", "저장 목소리로 대화 만들기")}</h3>
                  </div>
                  <p className="text-xs text-ink-muted">{t("s2pro.multi.hint", "대사 안에 speaker tag를 넣어 장면을 나눕니다. 목소리 자산이 없으면 먼저 목소리를 저장하세요.")}</p>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Saved voice</Label>
                    <Select value={selectedS2VoiceId || undefined} onValueChange={selectS2ProVoice}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("s2pro.multi.placeholder", "저장 목소리 선택")} />
                      </SelectTrigger>
                      <SelectContent>
                        {s2ProVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Speaker script</Label>
                    <Textarea
                      value={s2ProForm.speaker_script}
                      onChange={(event) => setS2ProForm({ ...s2ProForm, speaker_script: event.target.value })}
                      className="min-h-[200px] resize-y border-line bg-canvas"
                    />
                  </div>
                </WorkspaceCard>
              ) : null}

              {currentS2ProMode === "multilingual" ? (
                <WorkspaceCard className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                    <h3 className="text-sm font-medium text-ink">{t("s2pro.multilingual.step1", "저장 목소리로 다국어 문장 읽기")}</h3>
                  </div>
                  <p className="text-xs text-ink-muted">{t("s2pro.multilingual.hint", "같은 voice asset을 기준으로 한국어, 영어, 일본어 등 여러 언어 문장을 이어서 확인합니다.")}</p>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Saved voice</Label>
                    <Select value={selectedS2VoiceId || undefined} onValueChange={selectS2ProVoice}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("s2pro.multilingual.placeholder", "저장 목소리 없이 생성")} />
                      </SelectTrigger>
                      <SelectContent>
                        {s2ProVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Text</Label>
                    <Textarea
                      value={s2ProForm.text}
                      onChange={(event) => setS2ProForm({ ...s2ProForm, text: event.target.value })}
                      className="min-h-[120px] resize-y border-line bg-canvas"
                    />
                  </div>
                </WorkspaceCard>
              ) : null}

              {currentS2ProMode !== "clone" ? (
                lastS2ProRecord ? (
                  <WorkspaceCard>
                    <WorkspaceResultHeader title={t("s2pro.result.title", "S2-Pro 생성 결과")} badge={t("tts.result.latest")} />
                    <AudioCard title={t("s2pro.result.title", "S2-Pro 생성 결과")} subtitle={lastS2ProRecord.mode} record={lastS2ProRecord} />
                  </WorkspaceCard>
                ) : (
                  <WorkspaceEmptyState
                    icon={AudioWaveform}
                    title={t("s2pro.empty.title", "아직 생성된 S2-Pro 결과가 없습니다.")}
                    body={t("s2pro.empty.body", "오른쪽 설정 후 [S2-Pro 생성]을 누르면 결과가 여기에 표시됩니다.")}
                  />
                )
              ) : null}
            </div>

            {currentS2ProMode !== "clone" ? (
            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <strong className="text-sm font-medium text-ink">{t("s2pro.settings.title", "Generation settings")}</strong>
                  <span className="text-xs text-ink-muted">{selectedS2Voice ? selectedS2Voice.name : t("s2pro.defaultVoice", "기본 S2-Pro voice")}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Provider</Label>
                  <Select
                    value={s2ProForm.runtime_source || undefined}
                    onValueChange={(value) => setS2ProForm({ ...s2ProForm, runtime_source: value as "local" | "api" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local S2-Pro</SelectItem>
                      <SelectItem value="api">Fish Audio API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Output name</Label>
                  <Input value={s2ProForm.output_name} onChange={(event) => setS2ProForm({ ...s2ProForm, output_name: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Language</Label>
                  <LanguageSelect value={s2ProForm.language} onChange={(language) => setS2ProForm({ ...s2ProForm, language })} />
                </div>
                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("tts.advanced.controls", "Advanced controls")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Inline style instruction</Label>
                      <Textarea
                        value={s2ProForm.instruction}
                        onChange={(event) => setS2ProForm({ ...s2ProForm, instruction: event.target.value })}
                        className="min-h-[64px] resize-y border-line bg-canvas"
                      />
                      <span className="text-[11px] text-ink-subtle">{t("s2pro.instruction.caption", "문장 앞에 표현 태그를 더해 톤과 호흡을 보정합니다. 보통은 접어두고 필요할 때만 사용하세요.")}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Temperature</Label>
                        <Input value={s2ProForm.temperature} onChange={(event) => setS2ProForm({ ...s2ProForm, temperature: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Top P</Label>
                        <Input value={s2ProForm.top_p} onChange={(event) => setS2ProForm({ ...s2ProForm, top_p: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Max tokens</Label>
                        <Input value={s2ProForm.max_tokens} onChange={(event) => setS2ProForm({ ...s2ProForm, max_tokens: event.target.value })} />
                      </div>
                    </div>
                  </div>
                </details>
                {selectedS2Voice ? (
                  <div className="rounded-md border border-line bg-canvas/60 p-3">
                    <strong className="text-sm font-medium text-ink">{selectedS2Voice.name}</strong>
                    <p className="mt-1 text-xs text-ink-muted">저장된 S2-Pro 목소리를 사용합니다.</p>
                  </div>
                ) : null}
              </WorkspaceCard>
            </aside>
            ) : null}
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "vibevoice_tts" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="VIBEVOICE"
            eyebrowIcon={AudioLines}
            title="VibeVoice TTS"
            subtitle="Realtime 0.5B, Long-form 1.5B, 7B TTS를 실행하고 참조 음성 또는 LoRA checkpoint를 적용합니다."
            action={{
              label: "VibeVoice 생성",
              formId: "vibevoice-tts-form",
              disabled: loading || !vibeVoiceTtsForm.text.trim(),
              loading,
            }}
            meta={
              <Badge variant="secondary" className={vibeVoiceRuntime?.available ? "bg-positive/20 text-positive border-0" : "bg-canvas text-ink-muted border-0"}>
                {vibeVoiceRuntime?.repo_ready ? "Vendor ready" : "Vendor missing"}
              </Badge>
            }
          />

          <form id="vibevoice-tts-form" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]" onSubmit={handleVibeVoiceTTSSubmit}>
            <div className="flex flex-col gap-5">
              <WorkspaceCard className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Text</Label>
                    <Textarea
                      value={vibeVoiceTtsForm.text}
                      onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, text: event.target.value }))}
                      className="min-h-[160px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Model</Label>
                      <Select value={vibeVoiceTtsForm.model_profile} onValueChange={(model_profile) => setVibeVoiceTtsForm((prev) => ({ ...prev, model_profile: model_profile as "realtime" | "tts_15b" | "tts_7b" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realtime">Realtime TTS 0.5B</SelectItem>
                          <SelectItem value="tts_15b">Long-form TTS 1.5B</SelectItem>
                          <SelectItem value="tts_7b">Community TTS 7B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Output name</Label>
                      <Input value={vibeVoiceTtsForm.output_name} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, output_name: event.target.value }))} />
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="gallery">
                  <TabsList className="grid w-full grid-cols-3 gap-1 bg-canvas border border-line p-1 h-auto">
                    <TabsTrigger value="gallery" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Gallery</TabsTrigger>
                    <TabsTrigger value="upload" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Upload</TabsTrigger>
                    <TabsTrigger value="path" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Path</TabsTrigger>
                  </TabsList>
                  <TabsContent value="gallery" className="m-0 mt-3">
                    <ServerAudioPicker assets={generatedAudioAssets} selectedPath={vibeVoiceTtsForm.speaker_audio_path} onSelect={handleSelectVibeVoiceAsset} />
                  </TabsContent>
                  <TabsContent value="upload" className="m-0 mt-3 flex flex-col gap-2">
                    <AudioUploadField
                      id="vibevoice-reference-upload"
                      buttonLabel={t("file_upload.choose", "파일 선택")}
                      statusLabel={vibeVoiceUploadedRef?.filename || t("file_upload.none", "선택된 파일 없음")}
                      onFile={handleUploadVibeVoiceReference}
                    />
                  </TabsContent>
                  <TabsContent value="path" className="m-0 mt-3">
                    <Input
                      placeholder="data/generated/... 또는 절대경로"
                      value={vibeVoiceTtsForm.speaker_audio_path}
                      onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, speaker_audio_path: event.target.value }))}
                    />
                  </TabsContent>
                </Tabs>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Speaker name</Label>
                    <Input value={vibeVoiceTtsForm.speaker_name} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, speaker_name: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">LoRA checkpoint path</Label>
                    <Input value={vibeVoiceTtsForm.checkpoint_path} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, checkpoint_path: event.target.value }))} placeholder="data/audio-tools/vibevoice_training/.../adapter" />
                  </div>
                </div>
                {vibeVoiceTtsForm.model_profile === "tts_15b" || vibeVoiceTtsForm.model_profile === "tts_7b" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Speaker names</Label>
                      <Textarea
                        value={vibeVoiceTtsForm.speaker_names}
                        onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, speaker_names: event.target.value }))}
                        className="min-h-[72px] resize-y border-line bg-canvas"
                        placeholder="Speaker 1, Speaker 2, Speaker 3, Speaker 4"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Speaker audio paths</Label>
                      <Textarea
                        value={vibeVoiceTtsForm.speaker_audio_paths}
                        onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, speaker_audio_paths: event.target.value }))}
                        className="min-h-[72px] resize-y border-line bg-canvas"
                        placeholder="data/generated/voice-a.wav&#10;data/generated/voice-b.wav"
                      />
                    </div>
                  </div>
                ) : null}
              </WorkspaceCard>

              {lastVibeVoiceRecord ? (
                <WorkspaceCard>
                  <AudioCard title="VibeVoice TTS result" subtitle={lastVibeVoiceRecord.mode} record={lastVibeVoiceRecord} />
                </WorkspaceCard>
              ) : null}
            </div>

            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-4">
                <strong className="text-sm font-medium text-ink">Runtime</strong>
                <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                  <span>ASR</span><span>{vibeVoiceRuntime?.asr_ready ? "ready" : "missing"}</span>
                  <span>0.5B TTS</span><span>{vibeVoiceRuntime?.realtime_tts_ready ? "ready" : "missing"}</span>
                  <span>1.5B TTS</span><span>{vibeVoiceRuntime?.longform_tts_ready ? "ready" : "missing"}</span>
                  <span>7B TTS</span><span>{vibeVoiceRuntime?.large_tts_ready ? "ready" : "missing"}</span>
                </div>
                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden" open>
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    Advanced settings
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="grid grid-cols-2 gap-3 border-t border-line px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">CFG scale</Label>
                      <Input value={vibeVoiceTtsForm.cfg_scale} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, cfg_scale: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Realtime DDPM steps</Label>
                      <Input value={vibeVoiceTtsForm.ddpm_steps} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, ddpm_steps: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Seed</Label>
                      <Input value={vibeVoiceTtsForm.seed} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, seed: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Device</Label>
                      <Input value={vibeVoiceTtsForm.device} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, device: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Attention</Label>
                      <Input value={vibeVoiceTtsForm.attn_implementation} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, attn_implementation: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Diffusion steps</Label>
                      <Input value={vibeVoiceTtsForm.inference_steps} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, inference_steps: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max length times</Label>
                      <Input value={vibeVoiceTtsForm.max_length_times} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, max_length_times: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max new tokens</Label>
                      <Input value={vibeVoiceTtsForm.max_new_tokens} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, max_new_tokens: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Format</Label>
                      <Select value={vibeVoiceTtsForm.output_format} onValueChange={(output_format) => setVibeVoiceTtsForm((prev) => ({ ...prev, output_format }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wav">WAV</SelectItem>
                          <SelectItem value="flac">FLAC</SelectItem>
                          <SelectItem value="ogg">OGG</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Extra CLI args</Label>
                      <Input value={vibeVoiceTtsForm.extra_args} onChange={(event) => setVibeVoiceTtsForm((prev) => ({ ...prev, extra_args: event.target.value }))} />
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={vibeVoiceTtsForm.disable_prefill} onCheckedChange={(disable_prefill) => setVibeVoiceTtsForm((prev) => ({ ...prev, disable_prefill }))} />
                      Disable prefill
                    </label>
                    <label className="col-span-2 flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={vibeVoiceTtsForm.show_progress} onCheckedChange={(show_progress) => setVibeVoiceTtsForm((prev) => ({ ...prev, show_progress }))} />
                      Show progress
                    </label>
                  </div>
                </details>
                <p className="text-[11px] leading-5 text-ink-subtle">{vibeVoiceRuntime?.notes}</p>
              </WorkspaceCard>
            </aside>
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "vibevoice_asr" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="VIBEVOICE"
            eyebrowIcon={Mic}
            title="VibeVoice ASR"
            subtitle="생성 갤러리, 업로드, 직접 경로의 오디오를 VibeVoice-ASR로 전사합니다."
            action={{
              label: "VibeVoice 전사",
              formId: "vibevoice-asr-form",
              disabled: loading || !vibeVoiceAsrReady,
              loading,
            }}
            meta={<Badge variant="secondary" className={vibeVoiceRuntime?.asr_ready ? "bg-positive/20 text-positive border-0" : "bg-canvas text-ink-muted border-0"}>{vibeVoiceRuntime?.asr_ready ? "ASR ready" : "ASR missing"}</Badge>}
          />
          <form id="vibevoice-asr-form" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]" onSubmit={handleVibeVoiceASRSubmit}>
            <WorkspaceCard className="flex flex-col gap-4">
              <Tabs value={vibeVoiceAsrSource} onValueChange={(value) => setVibeVoiceAsrSource(value as "audio" | "folder" | "dataset")}>
                <TabsList className="grid w-full grid-cols-3 gap-1 bg-canvas border border-line p-1 h-auto">
                  <TabsTrigger value="audio" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Audio file</TabsTrigger>
                  <TabsTrigger value="folder" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Folder</TabsTrigger>
                  <TabsTrigger value="dataset" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">HF dataset</TabsTrigger>
                </TabsList>
                <TabsContent value="audio" className="m-0 mt-3 flex flex-col gap-3">
                  <Tabs defaultValue="gallery">
                    <TabsList className="grid w-full grid-cols-3 gap-1 bg-canvas border border-line p-1 h-auto">
                      <TabsTrigger value="gallery" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Gallery</TabsTrigger>
                      <TabsTrigger value="upload" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Upload</TabsTrigger>
                      <TabsTrigger value="path" className="text-xs data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink">Path</TabsTrigger>
                    </TabsList>
                    <TabsContent value="gallery" className="m-0 mt-3">
                      <ServerAudioPicker assets={audioAssets} selectedPath={vibeVoiceAsrForm.audio_path} onSelect={handleSelectVibeVoiceAsset} />
                    </TabsContent>
                    <TabsContent value="upload" className="m-0 mt-3">
                      <AudioUploadField id="vibevoice-asr-upload" buttonLabel={t("file_upload.choose", "파일 선택")} statusLabel={vibeVoiceUploadedRef?.filename || t("file_upload.none", "선택된 파일 없음")} onFile={handleUploadVibeVoiceReference} />
                    </TabsContent>
                    <TabsContent value="path" className="m-0 mt-3">
                      <Input value={vibeVoiceAsrForm.audio_path} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, audio_path: event.target.value }))} placeholder="data/uploads/... 또는 절대경로" />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                <TabsContent value="folder" className="m-0 mt-3">
                  <Input value={vibeVoiceAsrForm.audio_dir} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, audio_dir: event.target.value }))} placeholder="data/uploads 또는 /mnt/d/audio-folder" />
                </TabsContent>
                <TabsContent value="dataset" className="m-0 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input value={vibeVoiceAsrForm.dataset} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, dataset: event.target.value }))} placeholder="openslr/librispeech_asr" />
                  <Input value={vibeVoiceAsrForm.split} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, split: event.target.value }))} placeholder="test.clean" />
                  <Input value={vibeVoiceAsrForm.max_duration} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, max_duration: event.target.value }))} placeholder="max seconds" />
                </TabsContent>
              </Tabs>
              {vibeVoiceAsrForm.audio_path ? (
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <strong className="text-sm font-medium text-ink">{basenameFromPath(vibeVoiceAsrForm.audio_path)}</strong>
                  <audio controls src={fileUrlFromPath(vibeVoiceAsrForm.audio_path)} className="mt-2 h-8 w-full" />
                </div>
              ) : null}
              {vibeVoiceAsrResult ? (
                <div className="rounded-md border border-line bg-canvas/70 p-4">
                  <strong className="text-sm font-medium text-ink">Transcript</strong>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{vibeVoiceAsrResult.text}</p>
                </div>
              ) : null}
            </WorkspaceCard>
            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-4">
                <strong className="text-sm font-medium text-ink">Advanced settings</strong>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Language</Label>
                    <Input value={vibeVoiceAsrForm.language} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, language: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Task</Label>
                    <Input value={vibeVoiceAsrForm.task} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, task: event.target.value }))} />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Context / hotwords</Label>
                    <Textarea value={vibeVoiceAsrForm.context_info} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, context_info: event.target.value }))} className="min-h-[72px] resize-y border-line bg-canvas" placeholder="speaker names, proper nouns, technical terms" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Device</Label>
                    <Input value={vibeVoiceAsrForm.device} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, device: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Precision</Label>
                    <Input value={vibeVoiceAsrForm.precision} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, precision: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Attention</Label>
                    <Input value={vibeVoiceAsrForm.attn_implementation} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, attn_implementation: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Batch size</Label>
                    <Input value={vibeVoiceAsrForm.batch_size} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, batch_size: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Max new tokens</Label>
                    <Input value={vibeVoiceAsrForm.max_new_tokens} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, max_new_tokens: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Num beams</Label>
                    <Input value={vibeVoiceAsrForm.num_beams} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, num_beams: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Temperature</Label>
                    <Input value={vibeVoiceAsrForm.temperature} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, temperature: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Top P</Label>
                    <Input value={vibeVoiceAsrForm.top_p} onChange={(event) => setVibeVoiceAsrForm((prev) => ({ ...prev, top_p: event.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <Switch checked={vibeVoiceAsrForm.return_timestamps} onCheckedChange={(return_timestamps) => setVibeVoiceAsrForm((prev) => ({ ...prev, return_timestamps }))} />
                  Return timestamps
                </label>
              </WorkspaceCard>
            </aside>
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "vibevoice_tts_train" || activeTab === "vibevoice_asr_train" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="VIBEVOICE"
            eyebrowIcon={Database}
            title={activeTab === "vibevoice_tts_train" ? "VibeVoice TTS Fine-tune" : "VibeVoice ASR Fine-tune"}
            subtitle={activeTab === "vibevoice_tts_train" ? "VibeVoice TTS LoRA trainer의 dataset, column, LoRA, diffusion 옵션을 실행합니다." : "VibeVoice-ASR LoRA script가 있는 checkout에서 ASR fine-tuning을 실행합니다."}
            action={{
              label: activeTab === "vibevoice_tts_train" ? "TTS 학습 시작" : "ASR 학습 시작",
              formId: "vibevoice-train-form",
              disabled: loading || !vibeVoiceTrainForm.output_name.trim() || !vibeVoiceTrainForm.data_dir.trim(),
              loading,
            }}
          />
          <TrainingDatasetConnector
            title="학습 데이터셋"
            target="vibevoice"
            datasets={audioDatasets}
            activePath={vibeVoiceTrainForm.train_jsonl || vibeVoiceTrainForm.data_dir}
            pathLabel="Prepared dataset"
            guidance="VibeVoice 데이터셋 탭에서 만든 학습 세트를 선택해 연결합니다. 훈련 탭에서는 파일 경로나 폴더를 다시 입력하지 않습니다."
            onCreateDataset={() => setActiveTab("vibevoice_dataset")}
            onUse={(dataset) => {
              setVibeVoiceTrainForm((prev) => ({
                ...prev,
                data_dir: dataset.dataset_root_path,
                train_jsonl: dataset.train_jsonl_path || prev.train_jsonl,
                validation_jsonl: dataset.validation_jsonl_path || prev.validation_jsonl,
                output_name: prev.output_name || dataset.name,
              }));
              setMessage(`${dataset.name} 데이터셋을 VibeVoice 학습 입력에 연결했습니다.`);
            }}
          />
          <form id="vibevoice-train-form" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]" onSubmit={handleVibeVoiceTrainSubmit}>
            <WorkspaceCard className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Run name</Label>
                  <Input value={vibeVoiceTrainForm.output_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, output_name: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Mode</Label>
                  <Input value={activeTab === "vibevoice_tts_train" ? "TTS LoRA" : "ASR LoRA"} readOnly />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">Training model</Label>
                <Select
                  value={vibeVoiceTrainForm.model_path || "__default__"}
                  onValueChange={(model_path) => setVibeVoiceTrainForm((prev) => ({ ...prev, model_path: model_path === "__default__" ? "" : model_path }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {activeTab === "vibevoice_tts_train" ? "VibeVoice-1.5B 기본 모델" : "VibeVoice-ASR 기본 모델"}
                    </SelectItem>
                    {(activeTab === "vibevoice_tts_train" ? vibeVoiceTtsTrainingAssets : vibeVoiceAsrTrainingAssets).map((asset) => (
                      <SelectItem key={asset.id} value={asset.path}>
                        {asset.name} · {vibeVoiceAssetKindLabel(asset.kind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-ink-subtle">
                  저장된 VibeVoice 모델을 고르면 그 모델에서 이어서 학습합니다. 기본값은 다운로드된 공식 모델을 자동으로 사용합니다.
                </span>
              </div>
              {activeTab === "vibevoice_tts_train" ? (
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <div className="flex flex-col gap-1">
                    <strong className="text-sm font-medium text-ink">Dataset columns</strong>
                    <p className="text-xs leading-5 text-ink-muted">
                      VibeVoice TTS 학습 스크립트가 데이터셋에서 어떤 열을 읽을지 정합니다. 데이터셋 탭에서 만든 기본 구조를 쓰면 보통 그대로 두면 됩니다.
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Text column</Label>
                      <Input value={vibeVoiceTrainForm.text_column_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, text_column_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">읽을 문장/전사 텍스트가 들어 있는 열입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Audio column</Label>
                      <Input value={vibeVoiceTrainForm.audio_column_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, audio_column_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">학습 음성 파일 경로나 오디오 객체가 들어 있는 열입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Voice prompts column</Label>
                      <Input value={vibeVoiceTrainForm.voice_prompts_column_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, voice_prompts_column_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">화자/참조 음색 prompt 정보가 들어 있는 열입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Dataset config</Label>
                      <Input value={vibeVoiceTrainForm.dataset_config_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, dataset_config_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">Hugging Face dataset config가 있을 때만 씁니다.</span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Processes</Label>
                  <Input value={vibeVoiceTrainForm.nproc_per_node} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, nproc_per_node: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Epochs</Label>
                  <Input value={vibeVoiceTrainForm.num_train_epochs} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, num_train_epochs: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Batch size</Label>
                  <Input value={vibeVoiceTrainForm.per_device_train_batch_size} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, per_device_train_batch_size: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Grad accum</Label>
                  <Input value={vibeVoiceTrainForm.gradient_accumulation_steps} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, gradient_accumulation_steps: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Learning rate</Label>
                  <Input value={vibeVoiceTrainForm.learning_rate} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, learning_rate: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">LoRA rank</Label>
                  <Input value={vibeVoiceTrainForm.lora_r} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, lora_r: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">LoRA alpha</Label>
                  <Input value={vibeVoiceTrainForm.lora_alpha} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, lora_alpha: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">LoRA dropout</Label>
                  <Input value={vibeVoiceTrainForm.lora_dropout} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, lora_dropout: event.target.value }))} />
                </div>
              </div>
              <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                  Advanced training settings
                  <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                </summary>
                <div className="border-t border-line px-3 py-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Warmup ratio</Label>
                      <Input value={vibeVoiceTrainForm.warmup_ratio} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, warmup_ratio: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">초반 학습률을 천천히 올리는 비율입니다. 작은 데이터셋에서는 급격한 손상을 줄입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Weight decay</Label>
                      <Input value={vibeVoiceTrainForm.weight_decay} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, weight_decay: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">가중치가 과하게 커지는 것을 억제하는 정규화 값입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max grad norm</Label>
                      <Input value={vibeVoiceTrainForm.max_grad_norm} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, max_grad_norm: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">gradient 폭주를 막기 위한 clipping 한계입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max audio sec</Label>
                      <Input value={vibeVoiceTrainForm.max_audio_length} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, max_audio_length: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">너무 긴 샘플을 제외할 때 쓰는 최대 음성 길이입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Logging steps</Label>
                      <Input value={vibeVoiceTrainForm.logging_steps} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, logging_steps: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">몇 step마다 로그를 남길지 정합니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Save steps</Label>
                      <Input value={vibeVoiceTrainForm.save_steps} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, save_steps: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">몇 step마다 중간 checkpoint를 저장할지 정합니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Train split</Label>
                      <Input value={vibeVoiceTrainForm.train_split_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, train_split_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">학습에 사용할 데이터셋 split 이름입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Eval split</Label>
                      <Input value={vibeVoiceTrainForm.eval_split_name} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, eval_split_name: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">검증에 사용할 split 이름입니다. 없으면 비워둘 수 있습니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Eval split size</Label>
                      <Input value={vibeVoiceTrainForm.eval_split_size} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, eval_split_size: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">검증 split이 없을 때 학습 데이터에서 떼어낼 비율입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max length</Label>
                      <Input value={vibeVoiceTrainForm.max_length} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, max_length: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">토큰 기준 최대 길이입니다. OOM이 나면 낮춥니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">LoRA target modules</Label>
                      <Input value={vibeVoiceTrainForm.lora_target_modules} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, lora_target_modules: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">LoRA를 붙일 transformer 모듈 목록입니다.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Layers to freeze</Label>
                      <Input value={vibeVoiceTrainForm.layers_to_freeze} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, layers_to_freeze: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">고정할 layer 범위입니다. 비우면 기본 trainer 설정을 따릅니다.</span>
                    </div>
                    {activeTab === "vibevoice_tts_train" ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">DDPM batch mul</Label>
                          <Input value={vibeVoiceTrainForm.ddpm_batch_mul} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, ddpm_batch_mul: event.target.value }))} />
                          <span className="text-[11px] text-ink-subtle">확산 음성 헤드의 내부 batch 배율입니다. 메모리 피크가 높으면 낮춥니다.</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">CE loss weight</Label>
                          <Input value={vibeVoiceTrainForm.ce_loss_weight} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, ce_loss_weight: event.target.value }))} />
                          <span className="text-[11px] text-ink-subtle">텍스트/토큰 예측 손실의 비중입니다. 말 내용 유지에 관여합니다.</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">Diffusion loss weight</Label>
                          <Input value={vibeVoiceTrainForm.diffusion_loss_weight} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, diffusion_loss_weight: event.target.value }))} />
                          <span className="text-[11px] text-ink-subtle">음색/음향 생성 확산 손실의 비중입니다. 음색 적응에 관여합니다.</span>
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Report to</Label>
                      <Input value={vibeVoiceTrainForm.report_to} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, report_to: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">wandb/tensorboard 같은 로깅 백엔드입니다. 기본값 none.</span>
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <Label className="text-xs font-medium text-ink-muted">Extra args</Label>
                      <Input value={vibeVoiceTrainForm.extra_args} onChange={(event) => setVibeVoiceTrainForm((prev) => ({ ...prev, extra_args: event.target.value }))} />
                      <span className="text-[11px] text-ink-subtle">UI에 없는 upstream 인자를 공백으로 구분해 추가합니다.</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.bf16} onCheckedChange={(bf16) => setVibeVoiceTrainForm((prev) => ({ ...prev, bf16 }))} /> <strong className="ml-2 text-ink">bf16</strong><span className="mt-1 block">GPU 메모리를 줄이는 mixed precision입니다.</span></label>
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.gradient_checkpointing} onCheckedChange={(gradient_checkpointing) => setVibeVoiceTrainForm((prev) => ({ ...prev, gradient_checkpointing }))} /> <strong className="ml-2 text-ink">Gradient checkpointing</strong><span className="mt-1 block">속도를 조금 포기하고 VRAM 사용량을 낮춥니다.</span></label>
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.use_customized_context} onCheckedChange={(use_customized_context) => setVibeVoiceTrainForm((prev) => ({ ...prev, use_customized_context }))} /> <strong className="ml-2 text-ink">Customized context</strong><span className="mt-1 block">ASR 학습에서 문맥 정보를 함께 쓰는 옵션입니다.</span></label>
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.ignore_verifications} onCheckedChange={(ignore_verifications) => setVibeVoiceTrainForm((prev) => ({ ...prev, ignore_verifications }))} /> <strong className="ml-2 text-ink">Ignore verifications</strong><span className="mt-1 block">데이터 검증 실패를 무시합니다. 디버깅 외에는 권장하지 않습니다.</span></label>
                    {activeTab === "vibevoice_tts_train" ? (
                      <>
                        <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.lora_wrap_diffusion_head} onCheckedChange={(lora_wrap_diffusion_head) => setVibeVoiceTrainForm((prev) => ({ ...prev, lora_wrap_diffusion_head }))} /> <strong className="ml-2 text-ink">LoRA diffusion head</strong><span className="mt-1 block">확산 음성 헤드에도 LoRA wrapper를 적용합니다.</span></label>
                        <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.train_diffusion_head} onCheckedChange={(train_diffusion_head) => setVibeVoiceTrainForm((prev) => ({ ...prev, train_diffusion_head }))} /> <strong className="ml-2 text-ink">Train diffusion head</strong><span className="mt-1 block">음색과 음향 품질에 직접 관여하는 diffusion head를 학습합니다.</span></label>
                        <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.train_connectors} onCheckedChange={(train_connectors) => setVibeVoiceTrainForm((prev) => ({ ...prev, train_connectors }))} /> <strong className="ml-2 text-ink">Train connectors</strong><span className="mt-1 block">텍스트 모델과 음성 생성부 사이 연결층까지 조정합니다.</span></label>
                      </>
                    ) : null}
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.debug_save} onCheckedChange={(debug_save) => setVibeVoiceTrainForm((prev) => ({ ...prev, debug_save }))} /> <strong className="ml-2 text-ink">Debug save</strong><span className="mt-1 block">중간 디버그 산출물을 저장합니다.</span></label>
                    <label className="rounded-md border border-line bg-surface/70 p-3 text-xs text-ink-muted"><Switch checked={vibeVoiceTrainForm.debug_ce_details} onCheckedChange={(debug_ce_details) => setVibeVoiceTrainForm((prev) => ({ ...prev, debug_ce_details }))} /> <strong className="ml-2 text-ink">Debug CE</strong><span className="mt-1 block">CE loss 상세 값을 로그에 남깁니다.</span></label>
                  </div>
                </div>
              </details>
            </WorkspaceCard>
            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-3">
                <strong className="text-sm font-medium text-ink">Training result</strong>
                {vibeVoiceTrainResult ? (
                  <div className="flex flex-col gap-2 text-xs text-ink-muted">
                    <span>Status: <strong className="text-ink">{vibeVoiceTrainResult.status}</strong></span>
                    <span>{vibeVoiceTrainResult.adapter_path ? "Adapter saved" : "Adapter pending"}</span>
                    <span>{vibeVoiceTrainResult.log_path ? "Training log saved" : "Training log pending"}</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">ASR LoRA는 Microsoft 공식 `finetuning-asr/lora_finetune.py`를 사용합니다.</p>
                )}
              </WorkspaceCard>
            </aside>
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "vibevoice_model_tools" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="VIBEVOICE"
            eyebrowIcon={GitMerge}
            title="VibeVoice Model Tools"
            subtitle="학습된 LoRA를 병합하거나 NnScaler checkpoint를 Transformers 형식으로 변환합니다."
            action={{
              label: "도구 실행",
              formId: "vibevoice-model-tool-form",
              disabled: loading || !vibeVoiceModelToolReady,
              loading,
            }}
            meta={
              <Badge variant="secondary" className={vibeVoiceRuntime?.repo_ready ? "bg-positive/20 text-positive border-0" : "bg-canvas text-ink-muted border-0"}>
                {vibeVoiceRuntime?.repo_ready ? "VibeVoice ready" : "Vendor missing"}
              </Badge>
            }
          />

          <form id="vibevoice-model-tool-form" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]" onSubmit={handleVibeVoiceModelToolSubmit}>
            <WorkspaceCard className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[260px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Tool</Label>
                  <Select value={vibeVoiceModelToolForm.tool} onValueChange={(tool) => setVibeVoiceModelToolForm((prev) => ({ ...prev, tool: tool as "merge" | "verify_merge" | "convert_nnscaler" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merge">Merge LoRA into base model</SelectItem>
                      <SelectItem value="verify_merge">Verify merged checkpoint</SelectItem>
                      <SelectItem value="convert_nnscaler">Convert NnScaler checkpoint</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Model name</Label>
                  <Input value={vibeVoiceModelToolForm.output_name} onChange={(event) => setVibeVoiceModelToolForm((prev) => ({ ...prev, output_name: event.target.value }))} placeholder="merged-vibevoice" />
                </div>
              </div>

              {vibeVoiceModelToolForm.tool === "convert_nnscaler" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Tabs value={vibeVoiceModelToolSource.nnscaler} onValueChange={(value) => setVibeVoiceModelToolSource((prev) => ({ ...prev, nnscaler: value as "library" | "path" }))} className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-ink-muted">NnScaler checkpoint</Label>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="library">생성된 모델에서 선택</TabsTrigger>
                      <TabsTrigger value="path">직접 경로</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="m-0">
                      <Select value={vibeVoiceModelToolForm.nnscaler_checkpoint_path} onValueChange={(nnscaler_checkpoint_path) => setVibeVoiceModelToolForm((prev) => ({ ...prev, nnscaler_checkpoint_path }))}>
                        <SelectTrigger><SelectValue placeholder="변환할 checkpoint 선택" /></SelectTrigger>
                        <SelectContent>
                          {vibeVoiceNnScalerAssets.length ? vibeVoiceNnScalerAssets.map((asset) => (
                            <SelectItem key={asset.id} value={asset.path}>{asset.name} · {vibeVoiceAssetKindLabel(asset.kind)}</SelectItem>
                          )) : (
                            <SelectItem value="__none" disabled>아직 선택 가능한 자산이 없습니다</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TabsContent>
                    <TabsContent value="path" className="m-0">
                      <Input value={vibeVoiceModelToolForm.nnscaler_checkpoint_path} onChange={(event) => setVibeVoiceModelToolForm((prev) => ({ ...prev, nnscaler_checkpoint_path: event.target.value }))} placeholder="path/to/nnscaler/checkpoint" />
                    </TabsContent>
                  </Tabs>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Config path</Label>
                    <Input value={vibeVoiceModelToolForm.config_path} onChange={(event) => setVibeVoiceModelToolForm((prev) => ({ ...prev, config_path: event.target.value }))} placeholder="optional config path" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Tabs value={vibeVoiceModelToolSource.base} onValueChange={(value) => setVibeVoiceModelToolSource((prev) => ({ ...prev, base: value as "library" | "path" }))} className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-ink-muted">Base model</Label>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="library">생성된 모델에서 선택</TabsTrigger>
                      <TabsTrigger value="path">직접 경로</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="m-0">
                      <Select value={vibeVoiceModelToolForm.base_model_path} onValueChange={(base_model_path) => setVibeVoiceModelToolForm((prev) => ({ ...prev, base_model_path }))}>
                        <SelectTrigger><SelectValue placeholder="Base 모델 선택" /></SelectTrigger>
                        <SelectContent>
                          {vibeVoiceBaseAssets.length ? vibeVoiceBaseAssets.map((asset) => (
                            <SelectItem key={asset.id} value={asset.path}>{asset.name} · {vibeVoiceAssetKindLabel(asset.kind)}</SelectItem>
                          )) : (
                            <SelectItem value="__none" disabled>아직 선택 가능한 모델이 없습니다</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TabsContent>
                    <TabsContent value="path" className="m-0">
                      <Input value={vibeVoiceModelToolForm.base_model_path} onChange={(event) => setVibeVoiceModelToolForm((prev) => ({ ...prev, base_model_path: event.target.value }))} placeholder="data/models/vibevoice/VibeVoice-1.5B" />
                    </TabsContent>
                  </Tabs>
                  <Tabs value={vibeVoiceModelToolSource.checkpoint} onValueChange={(value) => setVibeVoiceModelToolSource((prev) => ({ ...prev, checkpoint: value as "library" | "path" }))} className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-ink-muted">LoRA checkpoint</Label>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="library" disabled={vibeVoiceModelToolForm.tool === "verify_merge"}>생성된 모델에서 선택</TabsTrigger>
                      <TabsTrigger value="path" disabled={vibeVoiceModelToolForm.tool === "verify_merge"}>직접 경로</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="m-0">
                      <Select value={vibeVoiceModelToolForm.checkpoint_path} onValueChange={(checkpoint_path) => setVibeVoiceModelToolForm((prev) => ({ ...prev, checkpoint_path }))} disabled={vibeVoiceModelToolForm.tool === "verify_merge"}>
                        <SelectTrigger><SelectValue placeholder="학습 결과 adapter 선택" /></SelectTrigger>
                        <SelectContent>
                          {vibeVoiceAdapterAssets.length ? vibeVoiceAdapterAssets.map((asset) => (
                            <SelectItem key={asset.id} value={asset.path}>{asset.name} · {vibeVoiceAssetKindLabel(asset.kind)}</SelectItem>
                          )) : (
                            <SelectItem value="__none" disabled>아직 학습된 adapter가 없습니다</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TabsContent>
                    <TabsContent value="path" className="m-0">
                      <Input value={vibeVoiceModelToolForm.checkpoint_path} onChange={(event) => setVibeVoiceModelToolForm((prev) => ({ ...prev, checkpoint_path: event.target.value }))} placeholder="data/audio-tools/vibevoice_training/.../adapter" disabled={vibeVoiceModelToolForm.tool === "verify_merge"} />
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[240px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Output format</Label>
                  <Select value={vibeVoiceModelToolForm.output_format} onValueChange={(output_format) => setVibeVoiceModelToolForm((prev) => ({ ...prev, output_format: output_format as "safetensors" | "bin" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safetensors">safetensors</SelectItem>
                      <SelectItem value="bin">PyTorch bin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="self-end text-xs leading-5 text-ink-subtle">
                  병합 결과는 VibeVoice TTS의 `LoRA checkpoint path` 없이 바로 쓰는 self-contained 모델 폴더로 관리할 수 있습니다.
                </p>
              </div>
            </WorkspaceCard>

            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-3">
                <strong className="text-sm font-medium text-ink">Result</strong>
                {vibeVoiceModelToolResult ? (
                  <div className="flex flex-col gap-2 text-xs text-ink-muted">
                    <span>Status: <strong className="text-ink">{vibeVoiceModelToolResult.status}</strong></span>
                    <span>{vibeVoiceModelToolResult.output_path ? "Model output saved" : "Model output pending"}</span>
                    <span>{vibeVoiceModelToolResult.log_path ? "Operation log saved" : "Operation log pending"}</span>
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-ink-muted">VibeVoice checkout에 포함된 공식 merge/convert utilities를 직접 호출합니다.</p>
                )}
              </WorkspaceCard>
            </aside>
          </form>
        </WorkspaceShell>
      ) : null}

      {activeTab === "s2pro_train" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("s2pro.eyebrow", "S2-PRO")}
            eyebrowIcon={Mic}
            title={t("s2pro.train.title", "S2-Pro LoRA / Full 학습")}
            subtitle={t("s2pro.train.subtitle", "Fish Speech text2semantic fine-tuning을 로컬에서 실행합니다. LoRA는 학습 후 merged checkpoint로 변환할 수 있습니다.")}
            action={{
              label: t("s2pro.train.submit", "S2-Pro 학습 시작"),
              formId: "s2pro-train-form",
              disabled:
                loading ||
                !s2ProTrainForm.output_name.trim() ||
                (s2ProTrainSource === "protos" && !s2ProTrainForm.proto_dir.trim()) ||
                (s2ProTrainSource === "lab_audio_dir" && !s2ProTrainForm.lab_audio_dir.trim()),
              loading,
            }}
            meta={
              s2ProRuntime ? (
                <Badge variant="secondary" className={s2ProRuntime.repo_ready ? "bg-positive/20 text-positive border-0" : "bg-canvas text-ink-muted border-0"}>
                  {s2ProRuntime.repo_ready ? "Fish Speech ready" : "Fish Speech missing"}
                </Badge>
              ) : null
            }
          />
          <TrainingDatasetConnector
            title="학습 데이터셋"
            target="s2_pro"
            datasets={audioDatasets}
            activePath={s2ProTrainSource === "protos" ? s2ProTrainForm.proto_dir : s2ProTrainForm.lab_audio_dir}
            pathLabel={s2ProTrainSource === "protos" ? "Prepared proto" : "Raw voice folder"}
            guidance="생성 갤러리나 폴더에서 만든 raw voice folder를 바로 연결하거나, 데이터셋 탭에서 prepared proto를 지정한 뒤 학습할 수 있습니다."
            onCreateDataset={() => setActiveTab("s2pro_dataset")}
            onUse={(dataset) => {
              setS2ProTrainSource("lab_audio_dir");
              setS2ProTrainForm((prev) => ({
                ...prev,
                lab_audio_dir: dataset.lab_audio_dir_path || dataset.audio_dir_path,
                output_name: prev.output_name || dataset.name,
              }));
              setMessage(`${dataset.name} 데이터셋을 S2-Pro 학습 입력에 연결했습니다.`);
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            <WorkspaceCard>
              <form id="s2pro-train-form" className="flex flex-col gap-5" onSubmit={handleS2ProTrainSubmit}>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Run name</Label>
                    <Input value={s2ProTrainForm.output_name} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, output_name: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Training type</Label>
                    <Select value={s2ProTrainForm.training_type} onValueChange={(training_type) => setS2ProTrainForm((prev) => ({ ...prev, training_type: training_type as "lora" | "full" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lora">LoRA</SelectItem>
                        <SelectItem value="full">Full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Max steps</Label>
                    <Input value={s2ProTrainForm.max_steps} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, max_steps: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Batch size</Label>
                    <Input value={s2ProTrainForm.batch_size} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, batch_size: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Learning rate</Label>
                    <Input value={s2ProTrainForm.learning_rate} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, learning_rate: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Val interval</Label>
                    <Input value={s2ProTrainForm.val_check_interval} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, val_check_interval: event.target.value }))} />
                  </div>
                </div>

                {s2ProTrainForm.training_type === "lora" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">LoRA config</Label>
                      <Select value={s2ProTrainForm.lora_config} onValueChange={(lora_config) => setS2ProTrainForm((prev) => ({ ...prev, lora_config }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="r_8_alpha_16">r_8_alpha_16</SelectItem>
                          <SelectItem value="r_32_alpha_16_fast">r_32_alpha_16_fast</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-xs text-ink-muted">
                      <Switch checked={s2ProTrainForm.merge_lora} onCheckedChange={(checked) => setS2ProTrainForm((prev) => ({ ...prev, merge_lora: checked }))} />
                      Merge LoRA after training
                    </label>
                  </div>
                ) : null}

                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    Advanced training settings
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="grid grid-cols-1 gap-3 border-t border-line px-3 py-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">VQ batch</Label>
                      <Input value={s2ProTrainForm.vq_batch_size} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, vq_batch_size: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Pretrained checkpoint</Label>
                      <Input placeholder="비우면 data/models/fish-speech/s2-pro" value={s2ProTrainForm.pretrained_ckpt_path} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, pretrained_ckpt_path: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Precision</Label>
                      <Input value={s2ProTrainForm.precision} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, precision: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Devices</Label>
                      <Input value={s2ProTrainForm.devices} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, devices: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Accumulate grad</Label>
                      <Input value={s2ProTrainForm.accumulate_grad_batches} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, accumulate_grad_batches: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Workers</Label>
                      <Input value={s2ProTrainForm.num_workers} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, num_workers: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Strategy backend</Label>
                      <Input value={s2ProTrainForm.strategy_backend} onChange={(event) => setS2ProTrainForm((prev) => ({ ...prev, strategy_backend: event.target.value }))} />
                    </div>
                  </div>
                </details>
              </form>
            </WorkspaceCard>

            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-3">
                <strong className="text-sm font-medium text-ink">Training result</strong>
                {s2ProTrainResult ? (
                  <div className="flex flex-col gap-2 text-xs text-ink-muted">
                    <span>Status: <strong className="text-ink">{s2ProTrainResult.status}</strong></span>
                    <span>{s2ProTrainResult.final_checkpoint_path ? "Checkpoint saved" : "Checkpoint pending"}</span>
                    <span>{s2ProTrainResult.merged_model_path ? "Merged model saved" : "Merged model not created"}</span>
                    <span>{s2ProTrainResult.log_path ? "Training log saved" : "Training log pending"}</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">S2-Pro 학습 결과가 여기에 표시됩니다.</p>
                )}
              </WorkspaceCard>
            </aside>
          </div>
        </WorkspaceShell>
      ) : null}

      {activeTab === "effects" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("effects.eyebrow", "SOUND EFFECTS")}
            eyebrowIcon={Volume2}
            title={t("effects.title", "사운드 효과")}
            subtitle={t("effects.subtitle", "한국어, 일본어, 영어 프롬프트와 길이, 강도를 직접 조절해 효과음을 생성합니다.")}
            action={{
              label: t("effects.action.generate", "생성"),
              formId: "sound-effects-form",
              disabled: loading || !soundEffectsAvailable,
              loading,
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
            <div className="flex flex-col gap-5">
              <WorkspaceCard className="flex flex-col gap-3">
                <Label className="text-xs font-medium text-ink-muted">{t("effects.search.label", "효과음 라이브러리")}</Label>
                <Input
                  placeholder={t("effects.search.placeholder", "효과음 검색")}
                  value={audioEffectsSearch}
                  onChange={(event) => setAudioEffectsSearch(event.target.value)}
                />
                <ScrollArea className="h-[360px]">
                  <div className="flex flex-col gap-2 pr-3">
                    {filteredSoundEffectLibrary.map((item) => (
                      <article key={item.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas/50 p-3 transition hover:border-line-strong">
                        <span className={`grid size-8 place-items-center rounded-full text-[10px] font-mono font-semibold shrink-0 ${item.profile === "mmaudio_nsfw" ? "bg-danger/20 text-danger" : "bg-accent-soft text-accent-ink"}`}>
                          {item.profile === "mmaudio_nsfw" ? "19" : ""}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <strong className="flex items-center gap-2 text-sm font-medium text-ink">
                            {item.title}
                            {item.profile === "mmaudio_nsfw" ? <Badge variant="secondary" className="bg-danger/20 text-danger text-[10px]">19+</Badge> : null}
                          </strong>
                          <p className="text-xs text-ink-muted line-clamp-1">{item.subtitle}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <span className="font-mono text-[10px] text-ink-subtle">{item.duration}</span>
                          <MiniWaveform />
                          <span className="ml-1 font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("effects.usePrompt", "Use prompt")}</span>
                          {SOUND_EFFECT_PROMPT_LANGUAGES.map((promptLanguage) => (
                            <Button
                              key={`${item.id}-${promptLanguage.value}`}
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => applySoundEffectRecipe(item, promptLanguage.value)}
                              type="button"
                            >
                              {promptLanguage.label}
                            </Button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </ScrollArea>
              </WorkspaceCard>

              {lastAudioToolResult?.kind === "sound_effect" && lastAudioToolResult.record ? (
                <WorkspaceCard>
                  <WorkspaceResultHeader title={t("effects.result.title", "방금 생성한 사운드 효과")} badge={t("tts.result.latest")} />
                  <AudioCard title={t("effects.result.subtitle", "사운드 효과")} record={lastAudioToolResult.record} />
                </WorkspaceCard>
              ) : (
                <WorkspaceEmptyState
                  icon={Volume2}
                  title={t("effects.empty.title", "아직 생성된 사운드 효과가 없습니다.")}
                  body={t("effects.empty.body", "프롬프트와 옵션을 설정한 뒤 [생성]을 누르면 결과가 여기에 표시됩니다.")}
                />
              )}
            </div>

            <aside className="self-start">
              <WorkspaceCard>
                <form id="sound-effects-form" className="flex flex-col gap-4" onSubmit={handleSoundEffectSubmit}>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Prompt</Label>
                    <Textarea
                      placeholder={t("effects.prompt.placeholder", "한국어, 일본어, 영어 중 원하는 언어로 효과음 프롬프트를 입력하세요.")}
                      value={soundEffectForm.prompt}
                      onChange={(event) => setSoundEffectForm({ ...soundEffectForm, prompt: event.target.value })}
                      className="min-h-[80px] resize-y border-line bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("effects.field.model", "모델")}</Label>
                    <Select
                      value={soundEffectForm.model_profile || undefined}
                      onValueChange={(value) => setSoundEffectForm({ ...soundEffectForm, model_profile: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mmaudio">MMAudio</SelectItem>
                        <SelectItem value="mmaudio_nsfw">MMAudio NSFW</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("effects.field.duration", "길이(초)")}</Label>
                      <Input
                        value={soundEffectForm.duration_sec}
                        onChange={(event) => setSoundEffectForm({ ...soundEffectForm, duration_sec: event.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("effects.field.intensity", "강도")}</Label>
                      <Input
                        value={soundEffectForm.intensity}
                        onChange={(event) => setSoundEffectForm({ ...soundEffectForm, intensity: event.target.value })}
                      />
                    </div>
                  </div>
                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      {t("effects.advanced", "Advanced settings")}
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">Seed</Label>
                          <Input
                            placeholder={t("effects.seed.placeholder", "비우면 자동")}
                            value={soundEffectForm.seed}
                            onChange={(event) => setSoundEffectForm({ ...soundEffectForm, seed: event.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">Steps</Label>
                          <Input
                            value={soundEffectForm.steps}
                            onChange={(event) => setSoundEffectForm({ ...soundEffectForm, steps: event.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-medium text-ink-muted">CFG</Label>
                          <Input
                            value={soundEffectForm.cfg_scale}
                            onChange={(event) => setSoundEffectForm({ ...soundEffectForm, cfg_scale: event.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("effects.negative", "제외할 소리")}</Label>
                        <Textarea
                          placeholder={t("effects.negative.placeholder", "예: speech, music, harsh clipping")}
                          value={soundEffectForm.negative_prompt}
                          onChange={(event) => setSoundEffectForm({ ...soundEffectForm, negative_prompt: event.target.value })}
                          className="min-h-[64px] resize-y border-line bg-canvas"
                        />
                      </div>
                    </div>
                  </details>
                  <p className="text-xs text-ink-muted">{soundEffectsAvailable ? t("effects.status.ready", "MMAudio 기반 생성기 연결 상태를 사용합니다.") : t("effects.status.unavailable", "사운드 효과 엔진이 아직 준비되지 않았습니다.")}</p>
                </form>
              </WorkspaceCard>
            </aside>
          </div>
        </WorkspaceShell>
      ) : null}

      {activeTab === "mmaudio_train" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("effects.eyebrow", "SOUND EFFECTS")}
            eyebrowIcon={Volume2}
            title={t("mmaudio.train.title", "MMAudio 학습")}
            subtitle={t("mmaudio.train.subtitle", "MMAudio upstream train.py를 실행합니다. 현재 upstream은 LoRA/adapter가 아니라 full/continued training 구조입니다.")}
            action={{
              label: t("mmaudio.train.submit", "MMAudio 학습 시작"),
              formId: "mmaudio-train-form",
              disabled: loading || !mmaudioTrainForm.output_name.trim() || !selectedMMAudioDataset,
              loading,
            }}
          />
          <TrainingDatasetConnector
            title="학습 데이터셋"
            target="mmaudio"
            datasets={audioDatasets}
            activePath={selectedMMAudioDataset?.dataset_root_path || ""}
            pathLabel="Prepared dataset"
            guidance="데이터셋 탭에서 만든 MMAudio 데이터셋을 선택해 학습 입력에 연결합니다. 훈련 탭에서는 데이터 경로를 다시 입력하지 않습니다."
            onCreateDataset={() => setActiveTab("mmaudio_dataset")}
            onUse={(dataset) => {
              setSelectedMMAudioDatasetId(dataset.id);
              setMMAudioTrainForm((prev) => ({ ...prev, data_mode: "configured", output_name: prev.output_name || dataset.name }));
              setToolDatasetLastBuild(dataset);
              setMessage(`${dataset.name} 데이터셋을 MMAudio 학습 입력에 연결했습니다.`);
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            <WorkspaceCard>
              <form id="mmaudio-train-form" className="flex flex-col gap-5" onSubmit={handleMMAudioTrainSubmit}>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Run name</Label>
                    <Input value={mmaudioTrainForm.output_name} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, output_name: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Model</Label>
                    <Select value={mmaudioTrainForm.model} onValueChange={(model) => setMMAudioTrainForm((prev) => ({ ...prev, model }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small_16k">small_16k</SelectItem>
                        <SelectItem value="small_44k">small_44k</SelectItem>
                        <SelectItem value="medium_44k">medium_44k</SelectItem>
                        <SelectItem value="large_44k">large_44k</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Pretrained weights</Label>
                    <Input placeholder="weights/mmaudio_small_16k.pth 또는 절대경로" value={mmaudioTrainForm.weights_path} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, weights_path: event.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Processes</Label>
                    <Input value={mmaudioTrainForm.nproc_per_node} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, nproc_per_node: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Iterations</Label>
                    <Input value={mmaudioTrainForm.num_iterations} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, num_iterations: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Batch size</Label>
                    <Input value={mmaudioTrainForm.batch_size} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, batch_size: event.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Learning rate</Label>
                    <Input value={mmaudioTrainForm.learning_rate} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, learning_rate: event.target.value }))} />
                  </div>
                </div>

                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    Advanced training settings
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="grid grid-cols-1 gap-3 border-t border-line px-3 py-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Resume checkpoint</Label>
                      <Input value={mmaudioTrainForm.checkpoint_path} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, checkpoint_path: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Save weights every</Label>
                      <Input value={mmaudioTrainForm.save_weights_interval} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, save_weights_interval: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Save checkpoint every</Label>
                      <Input value={mmaudioTrainForm.save_checkpoint_interval} onChange={(event) => setMMAudioTrainForm((prev) => ({ ...prev, save_checkpoint_interval: event.target.value }))} />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={mmaudioTrainForm.compile} onCheckedChange={(checked) => setMMAudioTrainForm((prev) => ({ ...prev, compile: checked }))} />
                      Compile
                    </label>
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={mmaudioTrainForm.debug} onCheckedChange={(checked) => setMMAudioTrainForm((prev) => ({ ...prev, debug: checked }))} />
                      Debug
                    </label>
                  </div>
                </details>
              </form>
            </WorkspaceCard>

            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-3">
                <strong className="text-sm font-medium text-ink">Training result</strong>
                {mmaudioTrainResult ? (
                  <div className="flex flex-col gap-2 text-xs text-ink-muted">
                    <span>Status: <strong className="text-ink">{mmaudioTrainResult.status}</strong></span>
                    <span>{mmaudioTrainResult.final_weights_path ? "Weights saved" : "Weights pending"}</span>
                    <span>{mmaudioTrainResult.log_path ? "Training log saved" : "Training log pending"}</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">MMAudio 학습 결과가 여기에 표시됩니다.</p>
                )}
                <p className="text-[11px] text-ink-subtle">MMAudio upstream에는 LoRA/adapter 경로가 없어 전체 모델 학습/이어학습만 실행합니다.</p>
              </WorkspaceCard>
            </aside>
          </div>
        </WorkspaceShell>
      ) : null}

      {isAceStepTab(activeTab) ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("ace.eyebrow", "ACE-STEP 1.5")}
            eyebrowIcon={
              currentAceStepMode === "text2music" ? Music2 :
              currentAceStepMode === "cover" ? Music :
              currentAceStepMode === "extract" ? Layers :
              currentAceStepMode === "lego" ? Drum : Music2
            }
            title={
              currentAceStepMode === "text2music" ? t("ace.text2music.title", "ACE-Step 음악 생성")
                : currentAceStepMode === "cover" ? t("ace.cover.title", "ACE-Step 커버 만들기")
                : currentAceStepMode === "repaint" ? t("ace.repaint.title", "ACE-Step 구간 다시 만들기")
                : currentAceStepMode === "extend" ? t("ace.extend.title", "ACE-Step 뒤를 이어붙이기")
                : currentAceStepMode === "extract" ? t("ace.extract.title", "ACE-Step 트랙 분리")
                : currentAceStepMode === "lego" ? t("ace.lego.title", "ACE-Step 트랙 추가")
                : currentAceStepMode === "complete" ? t("ace.complete.title", "ACE-Step 부족한 트랙 채우기")
                : currentAceStepMode === "understand" ? t("ace.understand.title", "ACE-Step 오디오 분석")
                : currentAceStepMode === "create_sample" ? t("ace.create_sample.title", "ACE-Step 작곡 초안 생성")
                : currentAceStepMode === "lora_train" ? t("ace.train.title", "ACE-Step LoRA / LoKr 학습")
                : t("ace.format_sample.title", "ACE-Step 입력 정리")
            }
            subtitle={
              currentAceStepMode === "text2music" ? t("ace.text2music.subtitle", "스타일 프롬프트와 가사를 바로 생성 요청으로 보내는 작곡 콘솔입니다.")
                : currentAceStepMode === "cover" ? t("ace.cover.subtitle", "원본 오디오의 흐름은 남기고 장르, 악기 질감, 보컬 분위기를 새 프롬프트 쪽으로 바꿉니다.")
                : currentAceStepMode === "repaint" ? t("ace.repaint.subtitle", "전체 곡을 버리지 않고, 타임라인에서 지정한 초 단위 구간만 새로 합성합니다.")
                : currentAceStepMode === "extend" ? t("ace.extend.subtitle", "소스 오디오 뒤에 이어질 파트를 만듭니다.")
                : currentAceStepMode === "extract" ? t("ace.extract.subtitle", "원본에서 보컬, 드럼, 베이스처럼 하나의 stem만 뽑아 새 파일로 저장합니다.")
                : currentAceStepMode === "lego" ? t("ace.lego.subtitle", "기존 믹스는 유지하고, 선택한 악기나 보컬 lane 하나를 새로 얹습니다.")
                : currentAceStepMode === "complete" ? t("ace.complete.subtitle", "드럼, 베이스, 보컬처럼 비어 있거나 약한 여러 트랙을 한 번에 보강합니다.")
                : currentAceStepMode === "understand" ? t("ace.understand.subtitle", "오디오를 듣고 BPM, 키, 언어, 가사, 스타일 캡션을 추정해 다음 작곡 입력으로 재사용합니다.")
                : currentAceStepMode === "create_sample" ? t("ace.create_sample.subtitle", "한 줄 아이디어를 스타일 설명과 가사 초안으로 펼칩니다.")
                : currentAceStepMode === "lora_train" ? t("ace.train.subtitle", "ACE-Step upstream 학습기로 LoRA 또는 LoKr adapter를 만들고 생성 LoRA 목록에 바로 연결합니다.")
                : t("ace.format_sample.subtitle", "Style prompt와 Lyrics를 ACE-Step이 안정적으로 읽는 입력문으로 다듬습니다.")
            }
          />

          {currentAceStepMode !== "text2music" && currentAceStepMode !== "create_sample" && currentAceStepMode !== "format_sample" && currentAceStepMode !== "lora_train" ? (
            <WorkspaceCard className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-ink">{t("ace.source.title", "Source audio")}</h3>
              <p className="text-xs text-ink-muted">{t("ace.source.subtitle", "업로드, 직접 경로, 생성 갤러리 중 하나로 작업할 원본을 고릅니다.")}</p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">Source audio path</Label>
                <Input
                  placeholder={t("ace.source.placeholder", "data/uploads/... 또는 절대경로")}
                  value={aceStepAudioForm.src_audio}
                  onChange={(event) => setAceStepAudioForm({ ...aceStepAudioForm, src_audio: event.target.value })}
                />
              </div>
              <AudioUploadField
                id="ace-step-source-upload"
                buttonLabel={t("file_upload.choose", "파일 선택")}
                statusLabel={aceStepAudioForm.src_audio ? basenameFromPath(aceStepAudioForm.src_audio) : t("file_upload.none", "선택된 파일 없음")}
                onFile={async (file) => {
                  await runAction(async () => {
                    const result = await api.uploadAudio(file);
                    setAceStepAudioForm((prev) => ({ ...prev, src_audio: result.path }));
                    setMessage(`${result.filename} 업로드 완료`);
                  });
                }}
              />
              <ServerAudioPicker assets={generatedAudioAssets} selectedPath={aceStepAudioForm.src_audio} onSelect={(asset) => setAceStepAudioForm({ src_audio: asset.path })} />
            </WorkspaceCard>
          ) : null}

          {currentAceStepMode !== "create_sample" && currentAceStepMode !== "format_sample" && currentAceStepMode !== "lora_train" ? (
            <WorkspaceCard className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-ink">{t("ace.model.title", "Model & LoRA")}</h3>
              <p className="text-xs text-ink-muted">{t("ace.model.subtitle", "모델을 비워두면 다운로드된 turbo 계열을 우선 사용합니다. LoRA는 특정 스타일을 더 강하게 입힐 때만 선택하세요.")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">DiT {t("ace.model.label", "모델")}</Label>
                  <Select
                    value={aceStepCommonForm.config_path || undefined}
                    onValueChange={(value) => setAceStepCommonForm({ ...aceStepCommonForm, config_path: value === "__auto__" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("ace.model.autoTurbo", "자동 (turbo 우선)")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">{t("ace.model.autoTurbo", "자동 (turbo 우선)")}</SelectItem>
                      {(aceStepRuntime?.model_variants || []).map((variant) => (
                        <SelectItem key={variant.name} value={variant.name}>
                          {variant.name}{variant.available ? "" : " (다운로드 필요)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">5Hz LM</Label>
                  <Select
                    value={aceStepCommonForm.lm_model_path || undefined}
                    onValueChange={(value) => setAceStepCommonForm({ ...aceStepCommonForm, lm_model_path: value === "__auto__" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("ace.lm.auto", "자동 (1.7B 우선)")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">{t("ace.lm.auto", "자동 (1.7B 우선)")}</SelectItem>
                      {(aceStepRuntime?.lm_models || []).map((variant) => (
                        <SelectItem key={variant.name} value={variant.name}>
                          {variant.name}{variant.available ? "" : " (다운로드 필요)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">LoRA {t("ace.lora.path", "경로")}</Label>
                  <Select
                    value={aceStepCommonForm.lora_path || undefined}
                    onValueChange={(value) => setAceStepCommonForm({ ...aceStepCommonForm, lora_path: value === "__none__" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("ace.lora.none", "사용 안 함")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("ace.lora.none", "사용 안 함")}</SelectItem>
                      {(aceStepRuntime?.lora_adapters || []).map((lora) => (
                        <SelectItem key={lora.path} value={lora.path}>{lora.relative_path || lora.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">LoRA scale</Label>
                  <Input value={aceStepCommonForm.lora_scale} onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lora_scale: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Adapter name</Label>
                  <Input
                    placeholder={t("ace.lora.adapterPlaceholder", "예: voice / style")}
                    value={aceStepCommonForm.lora_adapter_name}
                    onChange={(event) => setAceStepCommonForm({ ...aceStepCommonForm, lora_adapter_name: event.target.value })}
                  />
                </div>
              </div>
            </WorkspaceCard>
          ) : null}

          {currentAceStepMode === "text2music" ? (
            <WorkspaceCard>
            <form id="ace-text2music-form" className="flex flex-col gap-5" onSubmit={handleAceStepSubmit}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">ACE-Step 1.5 · Composer</span>
                    <h3 className="text-lg font-semibold text-ink">{t("ace.text2music.composer", "Composer")}</h3>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Track name</Label>
                    <Input
                      value={aceStepForm.output_name}
                      onChange={(event) => setAceStepForm({ ...aceStepForm, output_name: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ACE_STEP_STYLE_PRESETS.map((preset) => (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-pill"
                      key={preset.label}
                      onClick={() => setAceStepForm((prev) => ({ ...prev, prompt: preset.prompt }))}
                      type="button"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <AcePromptLaneGrid
                  prompt={aceStepForm.prompt}
                  lyrics={aceStepForm.lyrics}
                  vocalLanguage={aceStepForm.vocal_language}
                  onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                  onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                  onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                />

                <div className="relative h-12 overflow-hidden rounded-md border border-line bg-canvas/60" aria-hidden="true">
                  <div className="flex h-full items-end justify-between gap-px px-1 py-1">
                    {aceComposerBars.map((height, index) => (
                      <span key={`ace-wave-${index}`} className="block w-1 bg-accent/60" style={{ height }} />
                    ))}
                  </div>
                </div>

                <AceCommonGenerationControls
                  form={aceStepForm}
                  onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                />

                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("tts.advanced.controls", "Advanced controls")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Scheduler</Label>
                        <Select value={aceStepForm.scheduler_type || undefined} onValueChange={(value) => setAceStepForm({ ...aceStepForm, scheduler_type: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="euler">euler</SelectItem>
                            <SelectItem value="heun">heun</SelectItem>
                            <SelectItem value="pingpong">pingpong</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">CFG type</Label>
                        <Select value={aceStepForm.cfg_type || undefined} onValueChange={(value) => setAceStepForm({ ...aceStepForm, cfg_type: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apg">apg</SelectItem>
                            <SelectItem value="cfg">cfg</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Omega scale</Label>
                        <Input value={aceStepForm.omega_scale} onChange={(event) => setAceStepForm({ ...aceStepForm, omega_scale: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Guidance interval</Label>
                        <Input value={aceStepForm.guidance_interval} onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_interval: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Guidance decay</Label>
                        <Input value={aceStepForm.guidance_interval_decay} onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_interval_decay: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Min guidance</Label>
                        <Input value={aceStepForm.min_guidance_scale} onChange={(event) => setAceStepForm({ ...aceStepForm, min_guidance_scale: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Text guidance</Label>
                        <Input value={aceStepForm.guidance_scale_text} onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_scale_text: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Lyric guidance</Label>
                        <Input value={aceStepForm.guidance_scale_lyric} onChange={(event) => setAceStepForm({ ...aceStepForm, guidance_scale_lyric: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">OSS steps</Label>
                        <Input
                          placeholder={t("ace.oss.placeholder", "예: 10,20")}
                          value={aceStepForm.oss_steps}
                          onChange={(event) => setAceStepForm({ ...aceStepForm, oss_steps: event.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Device ID</Label>
                        <Input value={aceStepForm.device_id} onChange={(event) => setAceStepForm({ ...aceStepForm, device_id: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.use_erg_tag} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, use_erg_tag: checked })} /> ERG tag</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.use_erg_lyric} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, use_erg_lyric: checked })} /> ERG lyric</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.use_erg_diffusion} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, use_erg_diffusion: checked })} /> ERG diffusion</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.bf16} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, bf16: checked })} /> BF16</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.torch_compile} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, torch_compile: checked })} /> torch.compile</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.cpu_offload} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, cpu_offload: checked })} /> CPU offload</label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted"><Switch checked={aceStepForm.overlapped_decode} onCheckedChange={(checked) => setAceStepForm({ ...aceStepForm, overlapped_decode: checked })} /> Overlapped decode</label>
                    </div>
                  </div>
                </details>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">Duration</span>
                    <span className="text-base font-semibold text-ink">{aceMetricValue(aceStepForm.audio_duration, "60")}<small className="ml-1 text-xs text-ink-muted">sec</small></span>
                    <span className="text-[10px] text-ink-subtle">target length</span>
                  </div>
                  <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">Steps</span>
                    <span className="text-base font-semibold text-ink">{aceMetricValue(aceStepForm.infer_step, "27")}</span>
                    <span className="text-[10px] text-ink-subtle">diffusion</span>
                  </div>
                  <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">Guidance</span>
                    <span className="text-base font-semibold text-ink">{aceMetricValue(aceStepForm.guidance_scale, "15")}</span>
                    <span className="text-[10px] text-ink-subtle">prompt strength</span>
                  </div>
                  <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">Render</span>
                    <span className="text-base font-semibold text-ink">{aceStepForm.bf16 ? "BF16" : "FP32"}</span>
                    <span className="text-[10px] text-ink-subtle">{aceStepForm.cpu_offload ? "cpu offload" : "gpu first"}</span>
                  </div>
                </div>

                <Button disabled={loading || !aceStepAvailable} type="submit" className="self-start">
                  {t("ace.text2music.submit", "음악 생성")}
                </Button>
              </form>
            </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "cover" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepCoverSubmit}>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    lyricsOptional
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <AceCommonGenerationControls
                    form={aceStepForm}
                    onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("ace.cover.strength", "Cover strength (0=완전 새로, 1=원곡 가깝게)")}</Label>
                      <Input value={aceStepCoverForm.audio_cover_strength} onChange={(event) => setAceStepCoverForm({ ...aceStepCoverForm, audio_cover_strength: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Cover noise strength</Label>
                      <Input value={aceStepCoverForm.cover_noise_strength} onChange={(event) => setAceStepCoverForm({ ...aceStepCoverForm, cover_noise_strength: event.target.value })} />
                    </div>
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.cover.submit", "Cover 생성")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "repaint" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepRepaintSubmit}>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <AceCommonGenerationControls
                    form={aceStepForm}
                    onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("ace.repaint.start", "Repaint start (초)")}</Label>
                      <Input value={aceStepRepaintForm.repainting_start} onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repainting_start: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("ace.repaint.end", "Repaint end (초, -1=끝까지)")}</Label>
                      <Input value={aceStepRepaintForm.repainting_end} onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repainting_end: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Mode</Label>
                      <Select value={aceStepRepaintForm.repaint_mode || undefined} onValueChange={(value) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_mode: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conservative">conservative</SelectItem>
                          <SelectItem value="balanced">balanced</SelectItem>
                          <SelectItem value="aggressive">aggressive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("ace.repaint.strength", "Strength (balanced 전용)")}</Label>
                      <Input value={aceStepRepaintForm.repaint_strength} onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_strength: event.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Chunk mask mode</Label>
                      <Select value={aceStepRepaintForm.chunk_mask_mode || undefined} onValueChange={(value) => setAceStepRepaintForm({ ...aceStepRepaintForm, chunk_mask_mode: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">auto</SelectItem>
                          <SelectItem value="explicit">explicit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Latent crossfade frames</Label>
                      <Input value={aceStepRepaintForm.repaint_latent_crossfade_frames} onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_latent_crossfade_frames: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">WAV crossfade sec</Label>
                      <Input value={aceStepRepaintForm.repaint_wav_crossfade_sec} onChange={(event) => setAceStepRepaintForm({ ...aceStepRepaintForm, repaint_wav_crossfade_sec: event.target.value })} />
                    </div>
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.repaint.submit", "Repaint 생성")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "extend" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepExtendSubmit}>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    lyricsOptional
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <AceCommonGenerationControls
                    form={aceStepForm}
                    onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("ace.extend.tracks", "Tracks (콤마로 구분)")}</Label>
                    <Input value={aceStepExtendForm.complete_tracks} onChange={(event) => setAceStepExtendForm({ ...aceStepExtendForm, complete_tracks: event.target.value })} />
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.extend.submit", "Extend 실행")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "extract" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepExtractSubmit}>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Track</Label>
                    <Select value={aceStepExtractForm.extract_track || undefined} onValueChange={(value) => setAceStepExtractForm({ ...aceStepExtractForm, extract_track: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACE_STEP_TRACK_OPTIONS.map((track) => (
                          <SelectItem key={track} value={track}>{track}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.extract.submit", "Extract")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "lego" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepLegoSubmit}>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    lyricsOptional
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <AceCommonGenerationControls
                    form={aceStepForm}
                    onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Track</Label>
                    <Select value={aceStepLegoForm.lego_track || undefined} onValueChange={(value) => setAceStepLegoForm({ ...aceStepLegoForm, lego_track: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACE_STEP_TRACK_OPTIONS.map((track) => (
                          <SelectItem key={track} value={track}>{track}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.lego.submit", "Lego 추가")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "complete" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepCompleteSubmit}>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    lyricsOptional
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <AceCommonGenerationControls
                    form={aceStepForm}
                    onChange={(patch) => setAceStepForm((prev) => ({ ...prev, ...patch }))}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("ace.complete.tracks", "Tracks (콤마로 구분)")}</Label>
                    <Input value={aceStepCompleteForm.complete_tracks} onChange={(event) => setAceStepCompleteForm({ ...aceStepCompleteForm, complete_tracks: event.target.value })} />
                  </div>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.complete.submit", "Complete 실행")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "understand" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepUnderstandSubmit}>
                  <Button disabled={loading || !aceStepAvailable || !aceStepAudioForm.src_audio} type="submit" className="self-start">
                    {t("ace.understand.submit", "분석 실행")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "create_sample" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepCreateSampleSubmit}>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">Query</Label>
                    <Textarea className="min-h-[100px] resize-y border-line bg-canvas" value={aceStepCreateSampleForm.query} onChange={(event) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, query: event.target.value })} />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Vocal language ({t("ace.optional", "선택")})</Label>
                      <Select
                        value={aceStepCreateSampleForm.vocal_language || "unknown"}
                        onValueChange={(vocal_language) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, vocal_language })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Vocal language" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACE_VOCAL_LANGUAGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="m-0 flex h-10 items-center gap-2 text-xs text-ink-muted">
                      <Switch
                        checked={aceStepCreateSampleForm.instrumental}
                        onCheckedChange={(checked) => setAceStepCreateSampleForm({ ...aceStepCreateSampleForm, instrumental: checked })}
                      />
                      <span>Instrumental</span>
                    </label>
                  </div>
                  <Button disabled={loading || !aceStepAvailable} type="submit" className="self-start">
                    {t("ace.create.submit", "샘플 만들기")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "format_sample" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-4" onSubmit={handleAceStepFormatSampleSubmit}>
                  <p className="text-xs text-ink-muted">
                    {t("ace.format.body", "이 기능은 오디오를 바꾸는 기능이 아닙니다. 현재 작곡 폼의 Style prompt와 Lyrics를 ACE-Step이 안정적으로 읽는 입력문으로 다듬고, 정리된 결과를 다시 작곡 폼에 반영합니다.")}
                  </p>
                  <AcePromptLaneGrid
                    prompt={aceStepForm.prompt}
                    lyrics={aceStepForm.lyrics}
                    vocalLanguage={aceStepForm.vocal_language}
                    onPromptChange={(prompt) => setAceStepForm((prev) => ({ ...prev, prompt }))}
                    onLyricsChange={(lyrics) => setAceStepForm((prev) => ({ ...prev, lyrics }))}
                    onVocalLanguageChange={(vocal_language) => setAceStepForm((prev) => ({ ...prev, vocal_language }))}
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Duration</Label>
                      <Input value={aceStepForm.audio_duration} onChange={(event) => setAceStepForm({ ...aceStepForm, audio_duration: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">BPM</Label>
                      <Input placeholder="auto" value={aceStepForm.bpm} onChange={(event) => setAceStepForm({ ...aceStepForm, bpm: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Key</Label>
                      <Input placeholder="auto" value={aceStepForm.keyscale} onChange={(event) => setAceStepForm({ ...aceStepForm, keyscale: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Time signature</Label>
                      <Input placeholder="auto" value={aceStepForm.timesignature} onChange={(event) => setAceStepForm({ ...aceStepForm, timesignature: event.target.value })} />
                    </div>
                  </div>
                  <Button disabled={loading || !aceStepAvailable || (!aceStepForm.prompt.trim() && !aceStepForm.lyrics.trim())} type="submit" className="self-start">
                    {loading ? t("common.loading", "처리 중…") : t("ace.format.submit", "작곡 입력 정리")}
                  </Button>
                  {loading ? <p className="text-xs text-ink-muted">{t("ace.format.running", "ACE-Step LM이 입력을 정리하는 중입니다. 모델 로딩이 필요하면 잠시 걸릴 수 있습니다.")}</p> : null}
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "lora_train" ? (
              <TrainingDatasetConnector
                title="학습 데이터셋"
                target="ace_step"
                datasets={audioDatasets}
                activePath={
                  aceStepTrainSource === "tensors"
                    ? aceStepTrainForm.tensor_dir
                    : aceStepTrainSource === "audio_dir"
                      ? aceStepTrainForm.audio_dir
                      : aceStepTrainForm.dataset_json
                }
                pathLabel="Prepared dataset"
                guidance="ACE-Step 데이터셋 탭에서 만든 학습 세트를 선택해 연결합니다. 훈련 탭에서는 파일 경로나 폴더를 다시 입력하지 않습니다."
                onCreateDataset={() => setActiveTab("ace_dataset")}
                onUse={(dataset) => {
                  setAceStepTrainSource("dataset_json");
                  setAceStepTrainForm((prev) => ({
                    ...prev,
                    dataset_json: dataset.dataset_json_path || prev.dataset_json,
                    audio_dir: dataset.audio_dir_path,
                    output_name: prev.output_name || dataset.name,
                  }));
                  setMessage(`${dataset.name} 데이터셋을 ACE-Step 학습 입력에 연결했습니다.`);
                }}
              />
            ) : null}

            {currentAceStepMode === "lora_train" ? (
              <WorkspaceCard>
                <form className="flex flex-col gap-5" onSubmit={handleAceStepTrainAdapterSubmit}>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">{t("ace.train.adapterName", "Adapter name")}</Label>
                      <Input
                        placeholder="my-ace-style"
                        value={aceStepTrainForm.output_name}
                        onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, output_name: event.target.value }))}
                      />
                      <span className="text-[11px] text-ink-subtle">
                        {t("ace.train.adapterNameHint", "학습이 끝나면 이 이름으로 생성 LoRA 목록에 표시됩니다.")}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Adapter type</Label>
                        <Select
                          value={aceStepTrainForm.adapter_type}
                          onValueChange={(adapter_type) => setAceStepTrainForm((prev) => ({
                            ...prev,
                            adapter_type: adapter_type as "lora" | "lokr",
                            learning_rate:
                              adapter_type === prev.adapter_type
                                ? prev.learning_rate
                                : adapter_type === "lokr"
                                  ? "0.03"
                                  : "0.0001",
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lokr">LoKr</SelectItem>
                            <SelectItem value="lora">LoRA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Trainer</Label>
                        <Select
                          value={aceStepTrainForm.trainer_mode}
                          onValueChange={(trainer_mode) => setAceStepTrainForm((prev) => ({ ...prev, trainer_mode: trainer_mode as "fixed" | "vanilla" }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">fixed</SelectItem>
                            <SelectItem value="vanilla">vanilla</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Model variant</Label>
                      <Select value={aceStepTrainForm.model_variant} onValueChange={(model_variant) => setAceStepTrainForm((prev) => ({ ...prev, model_variant }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="turbo">turbo</SelectItem>
                          <SelectItem value="base">base</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Epochs</Label>
                      <Input value={aceStepTrainForm.epochs} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, epochs: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Batch size</Label>
                      <Input value={aceStepTrainForm.batch_size} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, batch_size: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Learning rate</Label>
                      <Input value={aceStepTrainForm.learning_rate} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, learning_rate: event.target.value }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Gradient accumulation</Label>
                      <Input value={aceStepTrainForm.gradient_accumulation} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, gradient_accumulation: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Save every</Label>
                      <Input value={aceStepTrainForm.save_every} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, save_every: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Seed</Label>
                      <Input value={aceStepTrainForm.seed} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, seed: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Workers</Label>
                      <Input value={aceStepTrainForm.num_workers} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, num_workers: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Max duration</Label>
                      <Input
                        value={aceStepTrainForm.max_duration}
                        onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, max_duration: event.target.value }))}
                      />
                    </div>
                  </div>

                  {aceStepTrainForm.adapter_type === "lora" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Rank</Label>
                        <Input value={aceStepTrainForm.rank} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, rank: event.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Alpha</Label>
                        <Input value={aceStepTrainForm.alpha} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, alpha: event.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Dropout</Label>
                        <Input value={aceStepTrainForm.dropout} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, dropout: event.target.value }))} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Linear dim</Label>
                        <Input value={aceStepTrainForm.lokr_linear_dim} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, lokr_linear_dim: event.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Linear alpha</Label>
                        <Input value={aceStepTrainForm.lokr_linear_alpha} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, lokr_linear_alpha: event.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Factor</Label>
                        <Input value={aceStepTrainForm.lokr_factor} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, lokr_factor: event.target.value }))} />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={aceStepTrainForm.lokr_weight_decompose} onCheckedChange={(checked) => setAceStepTrainForm((prev) => ({ ...prev, lokr_weight_decompose: checked }))} />
                        Weight decompose
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={aceStepTrainForm.lokr_decompose_both} onCheckedChange={(checked) => setAceStepTrainForm((prev) => ({ ...prev, lokr_decompose_both: checked }))} />
                        Decompose both
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={aceStepTrainForm.lokr_use_tucker} onCheckedChange={(checked) => setAceStepTrainForm((prev) => ({ ...prev, lokr_use_tucker: checked }))} />
                        Tucker
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={aceStepTrainForm.lokr_use_scalar} onCheckedChange={(checked) => setAceStepTrainForm((prev) => ({ ...prev, lokr_use_scalar: checked }))} />
                        Scalar
                      </label>
                    </div>
                  )}

                  <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                      Advanced training settings
                      <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="grid grid-cols-1 gap-3 border-t border-line px-3 py-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Device</Label>
                        <Input value={aceStepTrainForm.device} onChange={(event) => setAceStepTrainForm((prev) => ({ ...prev, device: event.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Precision</Label>
                        <Select value={aceStepTrainForm.precision} onValueChange={(precision) => setAceStepTrainForm((prev) => ({ ...prev, precision: precision as "auto" | "bf16" | "fp16" | "fp32" }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">auto</SelectItem>
                            <SelectItem value="bf16">bf16</SelectItem>
                            <SelectItem value="fp16">fp16</SelectItem>
                            <SelectItem value="fp32">fp32</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-end gap-2 pb-2 text-xs text-ink-muted">
                        <Switch checked={aceStepTrainForm.gradient_checkpointing} onCheckedChange={(checked) => setAceStepTrainForm((prev) => ({ ...prev, gradient_checkpointing: checked }))} />
                        Gradient checkpointing
                      </label>
                    </div>
                  </details>

                  <Button
                    disabled={
                      loading ||
                      !aceStepAvailable ||
                      !aceStepTrainForm.output_name.trim() ||
                      (aceStepTrainSource === "tensors" && !aceStepTrainForm.tensor_dir.trim()) ||
                      (aceStepTrainSource === "audio_dir" && !aceStepTrainForm.audio_dir.trim()) ||
                      (aceStepTrainSource === "dataset_json" && !aceStepTrainForm.dataset_json.trim())
                    }
                    type="submit"
                    className="self-start"
                  >
                    {loading ? t("common.loading", "처리 중…") : t("ace.train.submit", "LoRA / LoKr 학습 시작")}
                  </Button>
                </form>
              </WorkspaceCard>
            ) : null}

            {currentAceStepMode === "lora_train" && aceStepTrainResult ? (
              <WorkspaceCard>
                <WorkspaceResultHeader title={t("ace.train.result", "학습 결과")} badge={aceStepTrainResult.status} />
                <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-2">
                  <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/60 p-3">
                    <span className="text-[11px] uppercase tracking-allcaps text-ink-subtle">Output</span>
                    <span className="text-ink">{aceStepTrainResult.output_dir ? "Training output saved" : "Training output pending"}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/60 p-3">
                    <span className="text-[11px] uppercase tracking-allcaps text-ink-subtle">Adapter</span>
                    <span className="text-ink">{aceStepTrainResult.final_adapter_path ? "Adapter saved" : "Adapter pending"}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/60 p-3">
                    <span className="text-[11px] uppercase tracking-allcaps text-ink-subtle">Prepared data</span>
                    <span className="text-ink">{aceStepTrainResult.tensor_dir ? "Training tensors ready" : "No tensor cache linked"}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/60 p-3">
                    <span className="text-[11px] uppercase tracking-allcaps text-ink-subtle">Log</span>
                    <span className="text-ink">{aceStepTrainResult.log_path ? "Training log saved" : "Training log pending"}</span>
                  </div>
                </div>
                {aceStepTrainResult.final_adapter_path ? (
                  <Button
                    variant="outline"
                    className="mt-3 self-start"
                    type="button"
                    onClick={() => setAceStepCommonForm((prev) => ({ ...prev, lora_path: aceStepTrainResult.final_adapter_path || prev.lora_path }))}
                  >
                    {t("ace.train.useAdapter", "생성 LoRA로 선택")}
                  </Button>
                ) : null}
              </WorkspaceCard>
            ) : null}

            {aceStepUnderstandResult ? (
              <WorkspaceCard>
                <WorkspaceResultHeader title={t("ace.understand.result", "분석 / 메타 결과")} />
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="text-ink-muted">
                    <strong className="text-ink">Caption:</strong> {aceStepUnderstandResult.caption || "-"}
                  </li>
                  <li className="text-ink-muted">
                    <strong className="text-ink">BPM:</strong> {aceStepUnderstandResult.bpm ?? "-"} | <strong className="text-ink">Duration:</strong> {aceStepUnderstandResult.duration ?? "-"}s
                  </li>
                  <li className="text-ink-muted">
                    <strong className="text-ink">Key:</strong> {aceStepUnderstandResult.keyscale || "-"} | <strong className="text-ink">Time signature:</strong>{" "}
                    {aceStepUnderstandResult.timesignature || "-"} | <strong className="text-ink">Language:</strong> {aceStepUnderstandResult.language || "-"}
                  </li>
                  <li className="text-ink-muted">
                    <strong className="text-ink">Lyrics:</strong>
                    <pre className="mt-1 max-h-60 overflow-auto rounded-md border border-line bg-canvas/60 p-2 text-xs font-mono whitespace-pre-wrap">{aceStepUnderstandResult.lyrics || "-"}</pre>
                  </li>
                  {aceStepUnderstandResult.error ? <li className="text-danger">Error: {aceStepUnderstandResult.error}</li> : null}
                </ul>
              </WorkspaceCard>
            ) : null}

            {lastAceStepRecord ? (
              <WorkspaceCard>
                <WorkspaceResultHeader title={getRecordDisplayTitle(lastAceStepRecord)} badge="ACE-Step" />
                <AudioCard title={getRecordDisplayTitle(lastAceStepRecord)} subtitle="ACE-Step" record={lastAceStepRecord} />
              </WorkspaceCard>
            ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "applio_train" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("applio_train.eyebrow", "RVC TRAINING")}
            eyebrowIcon={GitMerge}
            title={t("applio_train.title", "목표 목소리 모델 만들기")}
            subtitle={t("applio_train.subtitle", "Applio/RVC는 참고 음성 하나를 바로 쓰는 방식이 아니라, 목표 목소리 데이터로 모델을 만든 뒤 변환에 사용합니다.")}
            action={{
              label: t("applio_train.action.create", "RVC 모델 만들기"),
              formId: "applio-train-form",
              disabled: loading || !rvcTrainForm.model_name || !rvcTrainSourceReady,
              loading,
            }}
          />
          <TrainingDatasetConnector
            title="학습 데이터셋"
            target="rvc"
            datasets={audioDatasets}
            activePath={rvcTrainForm.dataset_path}
            pathLabel="Prepared dataset"
            guidance="RVC 데이터셋 탭에서 만든 목표 목소리 데이터셋을 선택해 연결합니다. 훈련 탭에서는 파일 경로나 폴더를 다시 입력하지 않습니다."
            onCreateDataset={() => setActiveTab("applio_dataset")}
            onUse={(dataset) => {
              setRvcTrainForm((prev) => ({
                ...prev,
                dataset_path: dataset.audio_dir_path,
                model_name: prev.model_name || dataset.name,
              }));
              setMessage(`${dataset.name} 데이터셋을 RVC 학습 입력에 연결했습니다.`);
            }}
          />

          <WorkspaceCard>
            <form id="applio-train-form" className="flex flex-col gap-4" onSubmit={handleRvcTrainSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-2">
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <strong className="text-sm font-medium text-ink">{t("applio_train.requirements", "준비물")}</strong>
                  <p className="mt-1 text-xs text-ink-muted">{t("applio_train.requirementsBody", "데이터셋 탭에서 목표 목소리만 깨끗하게 들어 있는 WAV 묶음을 먼저 준비한 뒤 이 화면에 연결하세요. 같은 화자 음성 10분 이상을 권장합니다.")}</p>
                </div>
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <strong className="text-sm font-medium text-ink">{t("applio_train.outputs", "결과물")}</strong>
                  <p className="mt-1 text-xs text-ink-muted">{t("applio_train.outputsBody", "학습이 끝나면 `.pth` 모델과 `.index`가 생기고, 변환 탭의 목소리 목록에 나타납니다.")}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_train.modelName", "모델 이름")}</Label>
                <Input value={rvcTrainForm.model_name} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, model_name: event.target.value })} />
                <span className="text-[11px] text-ink-subtle">{t("applio_train.modelNameHint", "예: mai-rvc, narrator-clean. 화면에는 이 이름으로 표시됩니다.")}</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_train.sampleRate", "샘플레이트")}</Label>
                  <Select value={rvcTrainForm.sample_rate || undefined} onValueChange={(value) => setRvcTrainForm({ ...rvcTrainForm, sample_rate: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="40000">40k - 일반 권장</SelectItem>
                      <SelectItem value="48000">48k - 고음질</SelectItem>
                      <SelectItem value="32000">32k - 가벼움</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_train.epochs", "학습 에포크")}</Label>
                  <Input value={rvcTrainForm.total_epoch} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, total_epoch: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_train.batchSize", "배치 크기")}</Label>
                  <Input value={rvcTrainForm.batch_size} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, batch_size: event.target.value })} />
                </div>
              </div>
              <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                  {t("tts.advanced.controls", "Advanced controls")}
                  <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                </summary>
                <div className="flex flex-col gap-5 border-t border-line px-3 py-3">
                  <section className="flex flex-col gap-3">
                    <h4 className="text-[11px] font-semibold uppercase text-ink-subtle">{t("applio_train.advanced.voice", "Voice analysis")}</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.f0", "F0 method")}</Label>
                        <Select value={rvcTrainForm.f0_method || undefined} onValueChange={(value) => setRvcTrainForm({ ...rvcTrainForm, f0_method: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rmvpe">rmvpe</SelectItem>
                            <SelectItem value="fcpe">fcpe</SelectItem>
                            <SelectItem value="crepe">crepe</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.embedder", "Content embedder")}</Label>
                        <Select value={rvcTrainForm.embedder_model || undefined} onValueChange={(value) => setRvcTrainForm({ ...rvcTrainForm, embedder_model: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contentvec">contentvec</SelectItem>
                            <SelectItem value="korean-hubert-base">korean-hubert-base</SelectItem>
                            <SelectItem value="spin">spin</SelectItem>
                            <SelectItem value="spin-v2">spin-v2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.index", "Index")}</Label>
                        <Select value={rvcTrainForm.index_algorithm || undefined} onValueChange={(value) => setRvcTrainForm({ ...rvcTrainForm, index_algorithm: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Auto">Auto</SelectItem>
                            <SelectItem value="Faiss">Faiss</SelectItem>
                            <SelectItem value="KMeans">KMeans</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>
                  <section className="flex flex-col gap-3 border-t border-line/70 pt-4">
                    <h4 className="text-[11px] font-semibold uppercase text-ink-subtle">{t("applio_train.advanced.preprocessing", "Preprocessing")}</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.cut", "Cut mode")}</Label>
                        <Select value={rvcTrainForm.cut_preprocess || undefined} onValueChange={(value) => setRvcTrainForm({ ...rvcTrainForm, cut_preprocess: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Automatic">Automatic</SelectItem>
                            <SelectItem value="Simple">Simple</SelectItem>
                            <SelectItem value="Skip">Skip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.chunk", "Chunk length")}</Label>
                        <Input value={rvcTrainForm.chunk_len} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, chunk_len: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.overlap", "Overlap")}</Label>
                        <Input value={rvcTrainForm.overlap_len} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, overlap_len: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.cleanStrength", "Clean strength")}</Label>
                        <Input value={rvcTrainForm.clean_strength} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, clean_strength: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <label className="flex min-h-10 items-center justify-between gap-3 border-t border-line/70 py-2 text-xs text-ink-muted sm:border-t-0">
                        <span>{t("applio_train.advanced.noiseReduction", "Noise reduction")}</span>
                        <Switch checked={rvcTrainForm.noise_reduction} onCheckedChange={(checked) => setRvcTrainForm({ ...rvcTrainForm, noise_reduction: checked })} />
                      </label>
                    </div>
                  </section>
                  <section className="flex flex-col gap-3 border-t border-line/70 pt-4">
                    <h4 className="text-[11px] font-semibold uppercase text-ink-subtle">{t("applio_train.advanced.compute", "Compute")}</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.cpu", "CPU cores")}</Label>
                        <Input value={rvcTrainForm.cpu_cores} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, cpu_cores: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">{t("applio_train.advanced.gpu", "GPU")}</Label>
                        <Input value={rvcTrainForm.gpu} onChange={(event) => setRvcTrainForm({ ...rvcTrainForm, gpu: event.target.value })} />
                      </div>
                      <label className="flex min-h-10 items-center justify-between gap-3 self-end border-t border-line/70 py-2 text-xs text-ink-muted sm:border-t-0">
                        <span>{t("applio_train.advanced.memoryEfficient", "Memory-efficient training")}</span>
                        <Switch checked={rvcTrainForm.checkpointing} onCheckedChange={(checked) => setRvcTrainForm({ ...rvcTrainForm, checkpointing: checked })} />
                      </label>
                    </div>
                  </section>
                </div>
              </details>
              {lastRvcTrainingResult ? <p className="text-xs text-ink-muted">{lastRvcTrainingResult}</p> : null}
            </form>
          </WorkspaceCard>

          {lastAudioToolResult?.kind === "voice_changer" && lastAudioToolResult.record ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("applio.result.title", "방금 변환한 결과")} badge={t("tts.result.latest")} />
              <AudioCard title={t("applio.result.subtitle", "Applio 변환 결과")} record={lastAudioToolResult.record} />
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "applio_convert" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("applio_convert.eyebrow", "RVC CONVERT")}
            eyebrowIcon={GitMerge}
            title={t("applio_convert.title", "학습된 목소리로 변환")}
            subtitle={t("applio_convert.subtitle", "말소리나 분리된 보컬을 넣고, 학습된 RVC 목소리를 선택해 변환합니다.")}
            action={{
              label: t("applio_convert.action.run", "목소리 바꾸기"),
              formId: "applio-convert-form",
              disabled: loading || !voiceChangerAvailable || !voiceChangerForm.audio_path || !voiceChangerForm.model_path,
              loading,
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <WorkspaceCard className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                <h3 className="text-sm font-medium text-ink">{t("applio_convert.source.title", "변환할 원본 오디오")}</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.source.upload", "새 음성 업로드")}</Label>
                <AudioUploadField
                  id="applio-convert-upload"
                  buttonLabel={t("file_upload.choose", "파일 선택")}
                  statusLabel={audioToolUpload?.filename || t("file_upload.none", "선택된 파일 없음")}
                  onFile={handleAudioToolUpload}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.source.path", "직접 경로 입력")}</Label>
                <Input
                  placeholder="data/generated/... 또는 /mnt/d/..."
                  value={voiceChangerForm.audio_path}
                  onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, audio_path: event.target.value })}
                />
              </div>
              {voiceChangerForm.audio_path ? (
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("applio_convert.source.selected", "선택한 원본")}</span>
                  <strong className="mt-1 block text-sm font-medium text-ink">{selectedVoiceChangerAsset?.filename || audioToolUpload?.filename || basenameFromPath(voiceChangerForm.audio_path)}</strong>
                  <audio controls src={fileUrlFromPath(voiceChangerForm.audio_path)} className="mt-2 w-full h-8" />
                </div>
              ) : (
                <p className="text-xs text-ink-muted">{t("applio_convert.source.hint", "업로드하거나 아래 목록에서 변환할 원본 음성을 선택하세요.")}</p>
              )}
              <ServerAudioPicker assets={generatedAudioAssets} selectedPath={voiceChangerForm.audio_path} onSelect={handleSelectAudioToolAsset} />
            </WorkspaceCard>

            <WorkspaceCard>
              <form id="applio-convert-form" className="flex flex-col gap-4" onSubmit={handleVoiceChangerSubmit}>
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">2</span>
                  <h3 className="text-sm font-medium text-ink">{t("applio_convert.target.title", "학습된 목소리로 변환")}</h3>
                </div>
                {!voiceChangerAvailable ? <p className="text-xs text-warn">{t("applio_convert.target.unavailable", "사용 가능한 RVC 목소리 모델이 없습니다. 모델 다운로드나 RVC 학습을 먼저 실행해 주세요.")}</p> : null}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.target.voice", "바꿀 목소리")}</Label>
                  <Select value={voiceChangerForm.selected_model_id || undefined} onValueChange={(value) => handleSelectVoiceChangerModel(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("applio_convert.target.placeholder", "목소리 선택")} />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceChangerModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedVoiceChangerModel ? (
                  <div className="rounded-md border border-line bg-canvas/60 p-3">
                    <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("applio_convert.target.selected", "선택한 목소리")}</span>
                    <strong className="mt-1 block text-sm font-medium text-ink">{selectedVoiceChangerModel.label}</strong>
                    <p className="mt-1 text-xs text-ink-muted">{t("applio_convert.target.note", "RVC 모델과 검색 인덱스를 사용해 원본 음성의 음색을 바꿉니다.")}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.f0", "음정 추적 방식")}</Label>
                    <Select value={voiceChangerForm.f0_method || undefined} onValueChange={(value) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rmvpe">RMVPE - 기본 권장</SelectItem>
                        <SelectItem value="fcpe">FCPE - 빠른 처리</SelectItem>
                        <SelectItem value="crepe">CREPE - 선율 민감</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.indexRate", "음색 반영 강도")}</Label>
                    <Input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.protect", "발음 보존")}</Label>
                    <Input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                  </div>
                </div>
                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("tts.advanced.controls", "Advanced controls")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3 flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">RVC model path</Label>
                        <Input value={voiceChangerForm.model_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, model_path: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Index path</Label>
                        <Input value={voiceChangerForm.index_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_path: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Pitch shift</Label>
                        <Input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Clean strength</Label>
                        <Input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Content embedder</Label>
                        <Select value={voiceChangerForm.embedder_model || undefined} onValueChange={(value) => setVoiceChangerForm({ ...voiceChangerForm, embedder_model: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contentvec">contentvec</SelectItem>
                            <SelectItem value="hubert">hubert</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={voiceChangerForm.split_audio} onCheckedChange={(checked) => setVoiceChangerForm({ ...voiceChangerForm, split_audio: checked })} />
                        Split long audio
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={voiceChangerForm.f0_autotune} onCheckedChange={(checked) => setVoiceChangerForm({ ...voiceChangerForm, f0_autotune: checked })} />
                        F0 autotune
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <Switch checked={voiceChangerForm.clean_audio} onCheckedChange={(checked) => setVoiceChangerForm({ ...voiceChangerForm, clean_audio: checked })} />
                        Clean output audio
                      </label>
                    </div>
                  </div>
                </details>
              </form>
            </WorkspaceCard>
          </div>

          {lastAudioToolResult?.kind === "voice_changer" && lastAudioToolResult.record ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("applio.result.title", "방금 변환한 결과")} badge={t("tts.result.latest")} />
              <AudioCard title={t("applio.result.subtitle", "Applio 변환 결과")} record={lastAudioToolResult.record} />
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "applio_batch" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("applio_batch.eyebrow", "RVC BATCH")}
            eyebrowIcon={GitMerge}
            title={t("applio_batch.title", "같은 목소리로 일괄 변환")}
            subtitle={t("applio_batch.subtitle", "여러 음성을 고르거나 업로드해 같은 RVC 모델로 한 번에 변환합니다.")}
            action={{
              label: t("applio_batch.action.run", "{n}개 변환").replace("{n}", String(applioBatchPaths.length)),
              formId: "applio-batch-form",
              disabled: loading || !voiceChangerAvailable || !applioBatchPaths.length || !voiceChangerForm.model_path,
              loading,
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <WorkspaceCard className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">1</span>
                <h3 className="text-sm font-medium text-ink">{t("applio_batch.source.title", "배치 변환할 오디오")}</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_batch.source.upload", "배치에 파일 추가")}</Label>
                <AudioUploadField
                  id="applio-batch-upload"
                  buttonLabel={t("file_upload.choose", "파일 선택")}
                  statusLabel={t("applio_batch.source.uploadHint", "파일을 선택하면 아래 목록에 추가됩니다.")}
                  onFile={handleApplioBatchUpload}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_batch.source.path", "직접 경로 추가")}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="data/generated/... 또는 /mnt/d/..."
                    value={applioBatchManualPath}
                    onChange={(event) => setApplioBatchManualPath(event.target.value)}
                  />
                  <Button variant="outline" size="sm" onClick={addApplioBatchManualPath} type="button">
                    {t("applio_batch.source.add", "추가")}
                  </Button>
                </div>
              </div>
              <ServerAudioPicker assets={generatedAudioAssets} selectedPath="" onSelect={addApplioBatchAsset} />
            </WorkspaceCard>

            <WorkspaceCard>
              <form id="applio-batch-form" className="flex flex-col gap-4" onSubmit={handleVoiceChangerBatchSubmit}>
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">2</span>
                  <h3 className="text-sm font-medium text-ink">{t("applio_batch.target.title", "같은 목소리로 일괄 변환")}</h3>
                </div>
                <div className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-muted">{t("applio_batch.selected", "선택된 오디오")}: <strong className="text-ink">{applioBatchPaths.length}{t("applio_batch.count", "개")}</strong></span>
                    <Button variant="outline" size="sm" onClick={() => setApplioBatchPaths([])} type="button">{t("applio_batch.clear", "목록 비우기")}</Button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {selectedApplioBatchAssets.map((asset) => (
                      <article key={asset.path} className="rounded-md border border-line bg-surface p-2 flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <strong className="line-clamp-1 text-xs font-medium text-ink">{asset.filename}</strong>
                          <span className="text-[10px] text-ink-subtle">{asset.source === "generated" ? t("applio_batch.gallery", "생성 갤러리") : t("applio_batch.upload", "업로드")}</span>
                        </div>
                        <audio controls className="h-7 max-w-[180px]" src={mediaUrl(asset.url)} />
                        <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setApplioBatchPaths((prev) => prev.filter((path) => path !== asset.path))} type="button">
                          {t("applio_batch.remove", "제거")}
                        </Button>
                      </article>
                    ))}
                    {selectedApplioBatchExternalPaths.map((path) => (
                      <article key={path} className="rounded-md border border-line bg-surface p-2 flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <strong className="line-clamp-1 text-xs font-medium text-ink">{basenameFromPath(path)}</strong>
                          <span className="text-[10px] text-ink-subtle">{t("applio_batch.directPath", "직접 경로")}</span>
                        </div>
                        {path.startsWith("data/") ? (
                          <audio controls className="h-7 max-w-[180px]" src={fileUrlFromPath(path)} />
                        ) : (
                          <span className="text-[11px] text-ink-subtle">{t("applio_batch.externalPath", "외부 경로는 변환 실행 시 백엔드가 직접 읽습니다.")}</span>
                        )}
                        <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setApplioBatchPaths((prev) => prev.filter((item) => item !== path))} type="button">
                          {t("applio_batch.remove", "제거")}
                        </Button>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.target.voice", "바꿀 목소리")}</Label>
                  <Select value={voiceChangerForm.selected_model_id || undefined} onValueChange={(value) => handleSelectVoiceChangerModel(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("applio_convert.target.placeholder", "목소리 선택")} />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceChangerModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.f0", "음정 추적 방식")}</Label>
                    <Select value={voiceChangerForm.f0_method || undefined} onValueChange={(value) => setVoiceChangerForm({ ...voiceChangerForm, f0_method: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rmvpe">RMVPE - 기본 권장</SelectItem>
                        <SelectItem value="fcpe">FCPE - 빠른 처리</SelectItem>
                        <SelectItem value="crepe">CREPE - 선율 민감</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.indexRate", "음색 반영 강도")}</Label>
                    <Input value={voiceChangerForm.index_rate} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_rate: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("applio_convert.protect", "발음 보존")}</Label>
                    <Input value={voiceChangerForm.protect} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, protect: event.target.value })} />
                  </div>
                </div>
                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("tts.advanced.controls", "Advanced controls")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3 flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">RVC model path</Label>
                        <Input value={voiceChangerForm.model_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, model_path: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Index path</Label>
                        <Input value={voiceChangerForm.index_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_path: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Pitch shift</Label>
                        <Input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Clean strength</Label>
                        <Input value={voiceChangerForm.clean_strength} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, clean_strength: event.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-ink-muted">Content embedder</Label>
                        <Select value={voiceChangerForm.embedder_model || undefined} onValueChange={(value) => setVoiceChangerForm({ ...voiceChangerForm, embedder_model: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contentvec">contentvec</SelectItem>
                            <SelectItem value="hubert">hubert</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </details>
              </form>
            </WorkspaceCard>
          </div>

          {lastAudioToolResult?.kind === "voice_changer_batch" ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("applio_batch.result.title", "배치 변환 결과")} badge={t("tts.result.latest")} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lastAudioToolResult.assets.map((asset) => (
                  <article key={asset.path} className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                    <strong className="text-sm font-medium text-ink">{asset.filename}</strong>
                    <audio controls className="w-full" src={mediaUrl(asset.url)} />
                  </article>
                ))}
              </div>
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "applio_blend" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("applio_blend.eyebrow", "RVC BLEND")}
            eyebrowIcon={GitMerge}
            title={t("applio_blend.title", "두 RVC 모델을 섞어 새 목소리 만들기")}
            subtitle={t("applio_blend.subtitle", "Applio Voice Blender처럼 모델 A와 모델 B의 가중치를 비율로 합쳐 새로운 `.pth` 모델을 만듭니다.")}
            action={{
              label: t("applio_blend.action.run", "모델 블렌딩"),
              formId: "applio-blend-form",
              disabled: loading || !applioBlendForm.model_name || !applioBlendForm.model_path_a || !applioBlendForm.model_path_b,
              loading,
            }}
          />

          <WorkspaceCard>
            <form id="applio-blend-form" className="flex flex-col gap-4" onSubmit={handleVoiceModelBlendSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("applio_blend.modelName", "새 모델 이름")}</Label>
                <Input value={applioBlendForm.model_name} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, model_name: event.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_blend.modelA", "모델 A")}</Label>
                  <Select value={applioBlendForm.model_path_a || undefined} onValueChange={(value) => setApplioBlendForm({ ...applioBlendForm, model_path_a: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("applio_blend.placeholder", "모델 선택")} />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceChangerModels.map((model) => (
                        <SelectItem key={model.model_path} value={model.model_path}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_blend.modelB", "모델 B")}</Label>
                  <Select value={applioBlendForm.model_path_b || undefined} onValueChange={(value) => setApplioBlendForm({ ...applioBlendForm, model_path_b: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("applio_blend.placeholder", "모델 선택")} />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceChangerModels.map((model) => (
                        <SelectItem key={model.model_path} value={model.model_path}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_blend.ratio", "A 반영 비율")}</Label>
                  <Input value={applioBlendForm.ratio} onChange={(event) => setApplioBlendForm({ ...applioBlendForm, ratio: event.target.value })} />
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas/60 p-3">
                <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("applio_blend.preview", "블렌딩 미리보기")}</span>
                <strong className="mt-1 block text-sm font-medium text-ink">{selectedBlendModelA?.label || t("applio_blend.modelA", "모델 A")} + {selectedBlendModelB?.label || t("applio_blend.modelB", "모델 B")}</strong>
                <p className="mt-1 text-xs text-ink-muted">{t("applio_blend.note", "비율 {ratio}는 모델 A 쪽 성향을 얼마나 강하게 둘지 결정합니다.").replace("{ratio}", applioBlendForm.ratio || "0.5")}</p>
              </div>
              {lastRvcTrainingResult ? <p className="text-xs text-ink-muted">{lastRvcTrainingResult}</p> : null}
            </form>
          </WorkspaceCard>
        </WorkspaceShell>
      ) : null}

      {activeTab === "audio_editor" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("audio_editor.eyebrow", "AUDIO EDITOR")}
            eyebrowIcon={Scissors}
            title={t("audio_editor.title", "구간을 고르고 바로 편집하기")}
            subtitle={t("audio_editor.subtitle", "생성 갤러리, 업로드 파일, 직접 경로 중 하나를 골라 자르기, 페이드, 볼륨, 정규화를 적용합니다.")}
            action={{
              label: t("audio_editor.action.save", "편집본 저장"),
              formId: "audio-editor-form",
              disabled: loading || !audioEditorForm.audio_path,
              loading,
            }}
          />

          <Tabs
            value={audioEditorSource}
            onValueChange={(value) => setAudioEditorSource(value as typeof audioEditorSource)}
            className="flex flex-col gap-5"
          >
            <TabsList className="grid w-full grid-cols-3 gap-1 bg-surface border border-line p-1 h-auto">
              <TabsTrigger value="gallery" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.gallery", "생성 갤러리")}</TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.upload", "파일 업로드")}</TabsTrigger>
              <TabsTrigger value="path" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.path", "경로 입력")}</TabsTrigger>
            </TabsList>

            <WorkspaceCard>
              <TabsContent value="gallery" className="m-0 flex flex-col gap-3">
                <h3 className="text-sm font-medium text-ink">{t("audio_editor.source.gallery.title", "편집할 음성 선택")}</h3>
                <ServerAudioPicker assets={audioAssets} selectedPath={audioEditorForm.audio_path} onSelect={(asset) => {
                  setAudioToolUpload(null);
                  setAudioEditorForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || basenameFromPath(asset.filename) }));
                  setAudioEditorDuration(0);
                }} />
              </TabsContent>
              <TabsContent value="upload" className="m-0 flex flex-col gap-2">
                <Label className="text-xs font-medium text-ink-muted">{t("audio_editor.source.upload.title", "새 오디오 파일 불러오기")}</Label>
                <p className="text-xs text-ink-muted">{t("audio_editor.source.upload.hint", "WAV, FLAC, MP3 등 브라우저가 선택할 수 있는 오디오를 업로드합니다.")}</p>
                <AudioUploadField
                  id="audio-editor-upload"
                  buttonLabel={t("file_upload.choose", "파일 선택")}
                  statusLabel={audioEditorSource === "upload" && audioToolUpload?.filename ? audioToolUpload.filename : t("file_upload.none", "선택된 파일 없음")}
                  onFile={(file) => {
                    void handleAudioToolUpload(file);
                    setAudioEditorSource("upload");
                    setAudioEditorDuration(0);
                  }}
                />
              </TabsContent>
              <TabsContent value="path" className="m-0 flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("audio_editor.source.path.title", "서버 오디오 경로")}</Label>
                <Input
                  placeholder="data/generated/.../voice.wav"
                  value={audioEditorForm.audio_path}
                  onChange={(event) => {
                    setAudioEditorForm((prev) => ({ ...prev, audio_path: event.target.value }));
                    setAudioEditorDuration(0);
                  }}
                />
              </TabsContent>
            </WorkspaceCard>
          </Tabs>

          <WorkspaceCard>
            <form id="audio-editor-form" className="flex flex-col gap-4" onSubmit={handleAudioEditSubmit}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("audio_editor.selected.label", "SELECTED TAKE")}</span>
                  <h3 className="mt-1 text-sm font-medium text-ink">{selectedAudioEditorAsset?.filename || audioToolUpload?.filename || basenameFromPath(audioEditorForm.audio_path) || t("audio_editor.selected.empty", "아직 선택된 오디오 없음")}</h3>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("audio_editor.field.outputName", "저장 이름")}</Label>
                  <Input value={audioEditorForm.output_name} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, output_name: event.target.value })} />
                </div>
              </div>

              {audioEditorForm.audio_path ? (
                <audio
                  className="w-full"
                  controls
                  onLoadedMetadata={(event) => setAudioEditorDuration(event.currentTarget.duration || 0)}
                  src={selectedAudioEditorAsset ? mediaUrl(selectedAudioEditorAsset.url) : mediaUrl(fileUrlFromPath(audioEditorForm.audio_path))}
                />
              ) : null}

              <div className="relative h-16 overflow-hidden rounded-md border border-line bg-canvas/60" aria-label="편집 구간">
                <div className="absolute top-0 h-full bg-accent/20 border-x border-accent" style={{ left: audioEditorRegionLeft, width: audioEditorRegionWidth }} />
                <div className="flex h-full items-end justify-between gap-px px-1 py-2">
                  {audioEditorBars.map((height, index) => (
                    <span key={`${audioEditorForm.audio_path}-${index}`} className="block w-1 bg-ink-muted/60" style={{ height }} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Start</Label>
                  <input
                    max={audioEditorDurationLimit}
                    min="0"
                    step="0.01"
                    type="range"
                    value={audioEditorStart}
                    onChange={(event) => setAudioEditorForm((prev) => ({ ...prev, start_sec: event.target.value }))}
                    className="w-full accent-accent"
                  />
                  <Input value={audioEditorForm.start_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, start_sec: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">End</Label>
                  <input
                    max={audioEditorDurationLimit}
                    min="0"
                    step="0.01"
                    type="range"
                    value={audioEditorEnd}
                    onChange={(event) => setAudioEditorForm((prev) => ({ ...prev, end_sec: event.target.value }))}
                    className="w-full accent-accent"
                  />
                  <Input placeholder={t("audio_editor.field.endPlaceholder", "끝까지")} value={audioEditorForm.end_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, end_sec: event.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Gain dB</Label>
                  <input min="-24" max="18" step="0.5" type="range" value={audioEditorForm.gain_db} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, gain_db: event.target.value })} className="w-full accent-accent" />
                  <Input value={audioEditorForm.gain_db} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, gain_db: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Fade in</Label>
                  <Input value={audioEditorForm.fade_in_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, fade_in_sec: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Fade out</Label>
                  <Input value={audioEditorForm.fade_out_sec} onChange={(event) => setAudioEditorForm({ ...audioEditorForm, fade_out_sec: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Sample rate</Label>
                  <Select value={audioEditorForm.sample_rate || undefined} onValueChange={(value) => setAudioEditorForm({ ...audioEditorForm, sample_rate: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24000">24 kHz</SelectItem>
                      <SelectItem value="44100">44.1 kHz</SelectItem>
                      <SelectItem value="48000">48 kHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Format</Label>
                  <Select value={audioEditorForm.output_format || undefined} onValueChange={(value) => setAudioEditorForm({ ...audioEditorForm, output_format: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                      <SelectItem value="ogg">OGG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-3 justify-end">
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <Switch checked={audioEditorForm.normalize} onCheckedChange={(checked) => setAudioEditorForm({ ...audioEditorForm, normalize: checked })} />
                    Normalize peak
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <Switch checked={audioEditorForm.reverse} onCheckedChange={(checked) => setAudioEditorForm({ ...audioEditorForm, reverse: checked })} />
                    Reverse
                  </label>
                </div>
              </div>
            </form>
          </WorkspaceCard>

          {lastAudioToolResult?.kind === "audio_editor" && lastAudioToolResult.record ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("audio_editor.result.title", "편집 결과")} badge={t("tts.result.latest")} />
              <AudioCard title={t("audio_editor.result.title", "편집 결과")} subtitle={t("audio_editor.result.subtitle", "생성 갤러리에 저장됨")} record={lastAudioToolResult.record} />
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "audio_denoise" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("audio_denoise.eyebrow", "VOICE CLEANUP")}
            eyebrowIcon={AudioLines}
            title={t("audio_denoise.title", "노이즈를 줄이고 목소리만 또렷하게")}
            subtitle={t("audio_denoise.subtitle", "생성 갤러리, 업로드 파일, 서버 경로에서 음성을 가져와 배경 노이즈와 불필요한 대역을 정리합니다.")}
            action={{
              label: t("audio_denoise.action.save", "정제본 저장"),
              formId: "audio-denoise-form",
              disabled: loading || !audioDenoiseForm.audio_path,
              loading,
            }}
          />

          <Tabs
            value={audioDenoiseSource}
            onValueChange={(value) => setAudioDenoiseSource(value as typeof audioDenoiseSource)}
            className="flex flex-col gap-5"
          >
            <TabsList className="grid w-full grid-cols-3 gap-1 bg-surface border border-line p-1 h-auto">
              <TabsTrigger value="gallery" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.gallery", "생성 갤러리")}</TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.upload", "파일 업로드")}</TabsTrigger>
              <TabsTrigger value="path" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs sm:text-sm">{t("audio_source.path", "경로 입력")}</TabsTrigger>
            </TabsList>

            <WorkspaceCard>
              <TabsContent value="gallery" className="m-0 flex flex-col gap-3">
                <h3 className="text-sm font-medium text-ink">{t("audio_denoise.source.gallery.title", "정제할 음성 선택")}</h3>
                <ServerAudioPicker assets={audioAssets} selectedPath={audioDenoiseForm.audio_path} onSelect={(asset) => {
                  setAudioToolUpload(null);
                  setAudioDenoiseForm((prev) => ({ ...prev, audio_path: asset.path, output_name: prev.output_name || `clean-${basenameFromPath(asset.filename)}` }));
                }} />
              </TabsContent>
              <TabsContent value="upload" className="m-0 flex flex-col gap-2">
                <Label className="text-xs font-medium text-ink-muted">{t("audio_denoise.source.upload.title", "새 오디오 파일 불러오기")}</Label>
                <p className="text-xs text-ink-muted">{t("audio_denoise.source.upload.hint", "노이즈를 줄일 원본 음성을 업로드합니다. 결과는 생성 갤러리에 저장됩니다.")}</p>
                <AudioUploadField
                  id="audio-denoise-upload"
                  buttonLabel={t("file_upload.choose", "파일 선택")}
                  statusLabel={audioDenoiseSource === "upload" && audioToolUpload?.filename ? audioToolUpload.filename : t("file_upload.none", "선택된 파일 없음")}
                  onFile={(file) => {
                    void handleAudioToolUpload(file);
                    setAudioDenoiseSource("upload");
                  }}
                />
              </TabsContent>
              <TabsContent value="path" className="m-0 flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("audio_denoise.source.path.title", "서버 오디오 경로")}</Label>
                <Input
                  placeholder="data/generated/.../voice.wav"
                  value={audioDenoiseForm.audio_path}
                  onChange={(event) => setAudioDenoiseForm((prev) => ({ ...prev, audio_path: event.target.value }))}
                />
              </TabsContent>
            </WorkspaceCard>
          </Tabs>

          <WorkspaceCard>
            <form id="audio-denoise-form" className="flex flex-col gap-4" onSubmit={handleAudioDenoiseSubmit}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("audio_denoise.selected.label", "SOURCE VOICE")}</span>
                  <h3 className="mt-1 text-sm font-medium text-ink">{selectedAudioDenoiseAsset?.filename || audioToolUpload?.filename || basenameFromPath(audioDenoiseForm.audio_path) || t("audio_editor.selected.empty", "아직 선택된 오디오 없음")}</h3>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("audio_editor.field.outputName", "저장 이름")}</Label>
                  <Input value={audioDenoiseForm.output_name} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, output_name: event.target.value })} />
                </div>
              </div>

              {audioDenoiseForm.audio_path ? (
                <audio
                  className="w-full"
                  controls
                  src={selectedAudioDenoiseAsset ? mediaUrl(selectedAudioDenoiseAsset.url) : mediaUrl(fileUrlFromPath(audioDenoiseForm.audio_path))}
                />
              ) : null}

              <div className="relative h-16 overflow-hidden rounded-md border border-line bg-canvas/60" aria-label="정제 강도 미리보기">
                <div className="flex h-full items-end justify-between gap-px px-1 py-2">
                  {audioDenoiseBars.map((height, index) => (
                    <span key={`${audioDenoiseForm.audio_path}-${index}`} className="block w-1 bg-ink-muted/60" style={{ height }} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Noise reduction</Label>
                  <input min="0" max="1" step="0.01" type="range" value={audioDenoiseForm.strength} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, strength: event.target.value })} className="w-full accent-accent" />
                  <Input value={audioDenoiseForm.strength} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, strength: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Voice preserve</Label>
                  <input min="0" max="1" step="0.01" type="range" value={audioDenoiseForm.voice_presence} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, voice_presence: event.target.value })} className="w-full accent-accent" />
                  <Input value={audioDenoiseForm.voice_presence} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, voice_presence: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Noise profile sec</Label>
                  <Input value={audioDenoiseForm.noise_profile_sec} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, noise_profile_sec: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">High-pass Hz</Label>
                  <Input value={audioDenoiseForm.highpass_hz} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, highpass_hz: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Low-pass Hz</Label>
                  <Input value={audioDenoiseForm.lowpass_hz} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, lowpass_hz: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Spectral floor</Label>
                  <Input value={audioDenoiseForm.spectral_floor} onChange={(event) => setAudioDenoiseForm({ ...audioDenoiseForm, spectral_floor: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Sample rate</Label>
                  <Select value={audioDenoiseForm.sample_rate || undefined} onValueChange={(value) => setAudioDenoiseForm({ ...audioDenoiseForm, sample_rate: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24000">24 kHz</SelectItem>
                      <SelectItem value="44100">44.1 kHz</SelectItem>
                      <SelectItem value="48000">48 kHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">Format</Label>
                  <Select value={audioDenoiseForm.output_format || undefined} onValueChange={(value) => setAudioDenoiseForm({ ...audioDenoiseForm, output_format: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                      <SelectItem value="ogg">OGG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 self-end text-xs text-ink-muted">
                  <Switch checked={audioDenoiseForm.normalize} onCheckedChange={(checked) => setAudioDenoiseForm({ ...audioDenoiseForm, normalize: checked })} />
                  Normalize peak
                </label>
              </div>
            </form>
          </WorkspaceCard>

          {lastAudioToolResult?.kind === "audio_denoise" && lastAudioToolResult.record ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("audio_denoise.result.title", "정제 결과")} badge={t("tts.result.latest")} />
              <AudioCard title={t("audio_denoise.result.title", "정제 결과")} subtitle={t("audio_editor.result.subtitle", "생성 갤러리에 저장됨")} record={lastAudioToolResult.record} />
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "separation" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("separation.eyebrow", "STEM SEPARATION")}
            eyebrowIcon={Layers}
            title={t("separation.title", "오디오 분리")}
            subtitle={t("separation.subtitle", "AI stem separator로 보컬과 반주를 분리합니다. 안정적인 분리를 위해 10초 이상의 오디오를 사용하세요.")}
            action={{
              label: t("separation.action.run", "분리 실행"),
              formId: "audio-separation-form",
              disabled: loading || !audioSeparationForm.audio_path || !audioSeparationAvailable,
              loading,
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <WorkspaceCard className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-ink">{t("separation.source.title", "분리할 오디오 선택")}</h3>
              <p className="text-xs text-ink-muted">{t("separation.source.hint", "파일을 업로드하거나 서버에 저장된 오디오를 골라 분리합니다.")}</p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("separation.source.upload", "새 파일 업로드")}</Label>
                <AudioUploadField
                  id="audio-separation-upload"
                  buttonLabel={t("separation.source.choose", "파일 업로드")}
                  statusLabel={selectedAudioSeparationName || t("file_upload.none", "선택된 파일 없음")}
                  onFile={handleAudioToolUpload}
                />
              </div>
              {audioSeparationForm.audio_path ? (
                <div className="rounded-md border border-line bg-canvas/60 p-3">
                  <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("separation.source.selected", "선택한 오디오")}</span>
                  <strong className="mt-1 block truncate text-sm font-medium text-ink">{selectedAudioSeparationName}</strong>
                </div>
              ) : null}
              <ServerAudioPicker assets={audioAssets} selectedPath={audioSeparationForm.audio_path} onSelect={handleSelectAudioToolAsset} />
            </WorkspaceCard>

            <WorkspaceCard>
              <form id="audio-separation-form" className="flex flex-col gap-4" onSubmit={(event) => {
                event.preventDefault();
                void handleAudioSeparation();
              }}>
                <h3 className="text-sm font-medium text-ink">{t("separation.config.title", "오디오 분리")}</h3>
                {!audioSeparationAvailable ? <p className="text-xs text-warn">{t("separation.config.unavailable", "현재 이 기능은 비활성 상태입니다.")}</p> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("separation.field.model", "분리 모델")}</Label>
                    <Select value={audioSeparationForm.model_profile || undefined} onValueChange={(value) => setAudioSeparationForm({ ...audioSeparationForm, model_profile: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="roformer_vocals">{t("separation.model.roformer", "보컬/반주 분리 (Roformer 기본)")}</SelectItem>
                        <SelectItem value="vocal_rvc">{t("separation.model.vocalRvc", "RVC용 보컬 추출 (Applio preset)")}</SelectItem>
                        <SelectItem value="demucs_4stem">{t("separation.model.demucs", "4-stem 분리 (Demucs)")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] leading-relaxed text-ink-muted">{separationModelHelp}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("separation.field.format", "출력 형식")}</Label>
                    <Select value={audioSeparationForm.output_format || undefined} onValueChange={(value) => setAudioSeparationForm({ ...audioSeparationForm, output_format: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wav">WAV</SelectItem>
                        <SelectItem value="flac">FLAC</SelectItem>
                        <SelectItem value="ogg">OGG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <article className="rounded-md border border-line bg-canvas/60 p-3">
                  <strong className="text-sm font-medium text-ink">{t("separation.status.title", "모델 선택 기준")}</strong>
                  <p className="mt-1 text-xs text-ink-muted">{t("separation.status.body", "기본값은 보컬/반주 분리용 `vocals_mel_band_roformer.ckpt` 하나입니다. RVC용 보컬 추출은 Applio 전처리 프리셋이고, Demucs는 여러 stem을 나눌 때만 고릅니다.")}</p>
                </article>
              </form>
            </WorkspaceCard>
          </div>

          {lastAudioToolResult?.kind === "audio_separation" && lastAudioToolResult.assets?.length ? (
            <WorkspaceCard>
              <WorkspaceResultHeader title={t("separation.result.title", "방금 분리한 결과")} badge={t("tts.result.latest")} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lastAudioToolResult.assets.map((asset) => (
                  <article key={`${asset.path}-${asset.label}`} className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                    <strong className="text-sm font-medium text-ink">{asset.label}</strong>
                    <audio controls className="w-full" src={mediaUrl(asset.url)} />
                  </article>
                ))}
              </div>
            </WorkspaceCard>
          ) : null}
        </WorkspaceShell>
      ) : null}

      {activeTab === "s2pro_dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="S2-PRO DATASET"
            eyebrowIcon={Database}
            title="S2-Pro 데이터셋 준비"
            subtitle="생성 갤러리 음성이나 폴더를 raw voice folder로 정리하고, 이미 만든 prepared proto도 학습으로 바로 넘깁니다."
            action={{
              label: "S2-Pro 학습으로 보내기",
              onClick: sendS2DatasetToTraining,
            }}
          />
          <ToolDatasetBuilder
            title="Raw voice folder 또는 prepared proto 선택"
            subtitle="raw voice folder는 wav와 같은 이름의 .lab 전사를 함께 준비합니다. prepared proto는 이미 전처리된 Fish Speech proto 폴더를 그대로 씁니다."
            source={toolDatasetSource.s2_pro ?? "gallery"}
            setSource={(value) => setToolDatasetSource((prev) => ({ ...prev, s2_pro: value }))}
            assets={generatedAudioAssets}
            selectedPaths={toolDatasetSamples.s2_pro ?? []}
            onAddAsset={(asset) => addToolDatasetAsset("s2_pro", asset)}
            onRemoveAsset={(path) => removeToolDatasetAsset("s2_pro", path)}
            folderPath={toolDatasetFolders.s2_pro ?? ""}
            setFolderPath={(value) => setToolDatasetFolders((prev) => ({ ...prev, s2_pro: value }))}
            datasetName={toolDatasetNames.s2_pro ?? ""}
            setDatasetName={(value) => setToolDatasetNames((prev) => ({ ...prev, s2_pro: value }))}
            onBuild={() => buildToolDataset("s2_pro")}
            lastBuild={toolDatasetLastBuild?.target === "s2_pro" ? toolDatasetLastBuild : null}
            asrModelId={asrModelId}
            setAsrModelId={setAsrModelId}
            asrModels={asrModels}
            preparedLabel="Prepared proto"
            preparedPath={s2ProTrainForm.proto_dir}
            setPreparedPath={(value) => setS2ProTrainForm((prev) => ({ ...prev, proto_dir: value }))}
            onUsePrepared={() => {
              if (!s2ProTrainForm.proto_dir.trim()) {
                setMessage("Prepared proto 폴더를 입력하세요.");
                return;
              }
              setS2ProTrainSource("protos");
              setActiveTab("s2pro_train");
              setMessage("Prepared proto를 S2-Pro 학습 탭으로 넘겼습니다.");
            }}
          />
        </WorkspaceShell>
      ) : null}

      {activeTab === "vibevoice_dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="VIBEVOICE DATASET"
            eyebrowIcon={Database}
            title="VibeVoice 데이터셋 준비"
            subtitle="생성 갤러리나 폴더에서 TTS/ASR 학습에 쓸 JSONL을 만들고, 전사가 없으면 ASR로 채웁니다."
            action={{
              label: "TTS 학습으로 보내기",
              onClick: () => sendVibeVoiceDatasetToTraining("tts_lora"),
            }}
          />
          <ToolDatasetBuilder
            title="VibeVoice JSONL 만들기"
            subtitle="선택한 음성은 audio/text/voice_prompts 필드를 가진 train.jsonl과 validation.jsonl로 정리됩니다."
            source={toolDatasetSource.vibevoice ?? "gallery"}
            setSource={(value) => setToolDatasetSource((prev) => ({ ...prev, vibevoice: value }))}
            assets={generatedAudioAssets}
            selectedPaths={toolDatasetSamples.vibevoice ?? []}
            onAddAsset={(asset) => addToolDatasetAsset("vibevoice", asset)}
            onRemoveAsset={(path) => removeToolDatasetAsset("vibevoice", path)}
            folderPath={toolDatasetFolders.vibevoice ?? ""}
            setFolderPath={(value) => setToolDatasetFolders((prev) => ({ ...prev, vibevoice: value }))}
            datasetName={toolDatasetNames.vibevoice ?? ""}
            setDatasetName={(value) => setToolDatasetNames((prev) => ({ ...prev, vibevoice: value }))}
            onBuild={() => buildToolDataset("vibevoice")}
            lastBuild={toolDatasetLastBuild?.target === "vibevoice" ? toolDatasetLastBuild : null}
            asrModelId={asrModelId}
            setAsrModelId={setAsrModelId}
            asrModels={asrModels}
          />
        </WorkspaceShell>
      ) : null}

      {activeTab === "applio_dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="APPLIO / RVC DATASET"
            eyebrowIcon={Database}
            title="Applio RVC 데이터셋 준비"
            subtitle="같은 목표 화자의 깨끗한 음성을 생성 갤러리나 폴더에서 모아 RVC 학습 폴더로 정리합니다."
            action={{
              label: "RVC 학습으로 보내기",
              onClick: sendRvcDatasetToTraining,
            }}
          />
          <ToolDatasetBuilder
            title="RVC 화자 폴더 만들기"
            subtitle="선택한 음성을 변환 가능한 WAV 폴더로 복사합니다. RVC는 전사를 쓰지 않지만, manifest에는 ASR 텍스트도 남겨 추적할 수 있습니다."
            source={toolDatasetSource.rvc ?? "gallery"}
            setSource={(value) => setToolDatasetSource((prev) => ({ ...prev, rvc: value }))}
            assets={generatedAudioAssets}
            selectedPaths={toolDatasetSamples.rvc ?? []}
            onAddAsset={(asset) => addToolDatasetAsset("rvc", asset)}
            onRemoveAsset={(path) => removeToolDatasetAsset("rvc", path)}
            folderPath={toolDatasetFolders.rvc ?? ""}
            setFolderPath={(value) => setToolDatasetFolders((prev) => ({ ...prev, rvc: value }))}
            datasetName={toolDatasetNames.rvc ?? ""}
            setDatasetName={(value) => setToolDatasetNames((prev) => ({ ...prev, rvc: value }))}
            onBuild={() => buildToolDataset("rvc")}
            lastBuild={toolDatasetLastBuild?.target === "rvc" ? toolDatasetLastBuild : null}
            asrModelId={asrModelId}
            setAsrModelId={setAsrModelId}
            asrModels={asrModels}
          />
        </WorkspaceShell>
      ) : null}

      {activeTab === "ace_dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="ACE-STEP DATASET"
            eyebrowIcon={Database}
            title="ACE-Step 데이터셋 준비"
            subtitle="생성 갤러리나 폴더를 음악 학습용 dataset.json으로 정리하고, 기존 tensor/json도 바로 연결합니다."
            action={{
              label: "ACE-Step 학습으로 보내기",
              onClick: sendAceDatasetToTraining,
            }}
          />
          <ToolDatasetBuilder
            title="ACE-Step 학습 데이터 만들기"
            subtitle="오디오와 설명 텍스트를 dataset.json으로 묶습니다. tensor 전처리가 끝난 폴더가 있다면 Prepared tensor로 바로 보낼 수 있습니다."
            source={toolDatasetSource.ace_step ?? "folder"}
            setSource={(value) => setToolDatasetSource((prev) => ({ ...prev, ace_step: value }))}
            assets={generatedAudioAssets}
            selectedPaths={toolDatasetSamples.ace_step ?? []}
            onAddAsset={(asset) => addToolDatasetAsset("ace_step", asset)}
            onRemoveAsset={(path) => removeToolDatasetAsset("ace_step", path)}
            folderPath={toolDatasetFolders.ace_step ?? ""}
            setFolderPath={(value) => setToolDatasetFolders((prev) => ({ ...prev, ace_step: value }))}
            datasetName={toolDatasetNames.ace_step ?? ""}
            setDatasetName={(value) => setToolDatasetNames((prev) => ({ ...prev, ace_step: value }))}
            onBuild={() => buildToolDataset("ace_step")}
            lastBuild={toolDatasetLastBuild?.target === "ace_step" ? toolDatasetLastBuild : null}
            asrModelId={asrModelId}
            setAsrModelId={setAsrModelId}
            asrModels={asrModels}
            preparedLabel="Prepared tensor"
            preparedPath={aceStepTrainForm.tensor_dir}
            setPreparedPath={(value) => setAceStepTrainForm((prev) => ({ ...prev, tensor_dir: value }))}
            onUsePrepared={() => {
              if (!aceStepTrainForm.tensor_dir.trim()) {
                setMessage("Prepared tensor 폴더를 입력하세요.");
                return;
              }
              setAceStepTrainSource("tensors");
              setActiveTab("ace_lora_train");
              setMessage("Prepared tensor를 ACE-Step 학습 탭으로 넘겼습니다.");
            }}
          />
        </WorkspaceShell>
      ) : null}

      {activeTab === "mmaudio_dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow="MMAUDIO DATASET"
            eyebrowIcon={Database}
            title="MMAudio 데이터셋 준비"
            subtitle="효과음/오디오 샘플을 갤러리나 폴더에서 모아 프로젝트 데이터셋으로 정리합니다. 학습 탭에서는 이 데이터셋을 선택만 합니다."
            action={{
              label: "MMAudio 학습으로 보내기",
              onClick: () => sendMMAudioDatasetToTraining(),
            }}
          />
          <ToolDatasetBuilder
            title="MMAudio 샘플 묶음 만들기"
            subtitle="생성 갤러리의 효과음이나 폴더 오디오를 한 데이터셋 폴더로 모읍니다. 텍스트는 프롬프트/캡션으로 저장되고, 없으면 ASR로 채웁니다."
            source={toolDatasetSource.mmaudio ?? "gallery"}
            setSource={(value) => setToolDatasetSource((prev) => ({ ...prev, mmaudio: value }))}
            assets={generatedAudioAssets}
            selectedPaths={toolDatasetSamples.mmaudio ?? []}
            onAddAsset={(asset) => addToolDatasetAsset("mmaudio", asset)}
            onRemoveAsset={(path) => removeToolDatasetAsset("mmaudio", path)}
            folderPath={toolDatasetFolders.mmaudio ?? ""}
            setFolderPath={(value) => setToolDatasetFolders((prev) => ({ ...prev, mmaudio: value }))}
            datasetName={toolDatasetNames.mmaudio ?? ""}
            setDatasetName={(value) => setToolDatasetNames((prev) => ({ ...prev, mmaudio: value }))}
            onBuild={() => buildToolDataset("mmaudio")}
            lastBuild={toolDatasetLastBuild?.target === "mmaudio" ? toolDatasetLastBuild : null}
            asrModelId={asrModelId}
            setAsrModelId={setAsrModelId}
            asrModels={asrModels}
          />
        </WorkspaceShell>
      ) : null}

      {activeTab === "dataset" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("dataset.eyebrow", "DATASET BUILDER")}
            eyebrowIcon={Database}
            title={t("dataset.title", "학습용 데이터셋 준비")}
            subtitle={t("dataset.subtitle", "이 탭에서는 데이터셋만 만듭니다. 만들기가 끝나면 자동으로 학습 가능한 상태까지 준비하고, 학습은 다음 탭에서 시작합니다.")}
            action={{
              label: t("dataset.action.save", "데이터셋 저장"),
              onClick: () => void handleCreateDataset(),
              loading,
            }}
          />

          <WorkspaceCard className="flex flex-col gap-4">
            <article className="rounded-md border border-line bg-canvas/60 p-3">
              <strong className="text-sm font-medium text-ink">{t("dataset.recommend.title", "권장 샘플 수")}</strong>
              <p className="mt-1 text-xs text-ink-muted">{t("dataset.recommend.body", "최소 20개 이상, 가능하면 50개 이상을 권장합니다. 문장 길이와 억양이 다양할수록 결과가 안정적입니다.")}</p>
            </article>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("dataset.field.name", "데이터셋 이름")}</Label>
                <Input value={datasetForm.name} onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("dataset.field.speaker", "화자 이름")}</Label>
                <Input value={datasetForm.speaker_name} onChange={(event) => setDatasetForm({ ...datasetForm, speaker_name: event.target.value })} />
              </div>
              <AsrModelSelect compact />
            </div>

            <Tabs value={datasetInputMode} onValueChange={(value) => setDatasetInputMode(value as typeof datasetInputMode)}>
              <TabsList className="grid w-full grid-cols-2 gap-1 bg-canvas border border-line p-1 h-auto">
                <TabsTrigger value="gallery" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">{t("dataset.tab.gallery", "생성 갤러리에서 선택")}</TabsTrigger>
                <TabsTrigger value="paths" className="data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink text-xs">{t("dataset.tab.paths", "경로로 불러오기")}</TabsTrigger>
              </TabsList>

              <TabsContent value="gallery" className="m-0 mt-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                    <strong className="text-sm font-medium text-ink">{t("dataset.gallery.refTitle", "기준 음성")}</strong>
                    <p className="text-xs text-ink-muted">{t("dataset.gallery.refBody", "학습 결과를 대표할 기준 음성을 하나 고릅니다.")}</p>
                    <ServerAudioPicker assets={generatedAudioAssets} selectedPath={datasetForm.ref_audio_path} onSelect={handleSelectDatasetReferenceAsset} />
                    {selectedDatasetReferenceAsset ? (
                      <article className="rounded-md border border-line bg-surface p-2">
                        <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("dataset.gallery.refSelected", "선택한 기준 음성")}</span>
                        <strong className="mt-1 block text-xs font-medium text-ink">{selectedDatasetReferenceAsset.filename}</strong>
                        <audio controls className="mt-2 w-full h-8" src={mediaUrl(selectedDatasetReferenceAsset.url)} />
                      </article>
                    ) : null}
                  </section>
                  <section className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-2">
                    <strong className="text-sm font-medium text-ink">{t("dataset.gallery.samplesTitle", "샘플 음성")}</strong>
                    <p className="text-xs text-ink-muted">{t("dataset.gallery.samplesBody", "학습에 넣을 생성 음성을 계속 추가합니다.")}</p>
                    <ServerAudioPicker assets={generatedAudioAssets} selectedPath="" onSelect={handleAddGeneratedAssetToDataset} />
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                      {selectedDatasetSampleAssets.length ? selectedDatasetSampleAssets.map(({ sample, index, asset }) => (
                        <article key={`${sample.audio_path}-${index}`} className="rounded-md border border-line bg-surface p-2 flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <strong className="line-clamp-1 text-xs font-medium text-ink">{asset?.filename || basenameFromPath(sample.audio_path)}</strong>
                            <span className="text-[10px] text-ink-muted line-clamp-1">{sample.text?.trim() || asset?.text_preview || t("dataset.autoTranscribe", "자동 전사 예정")}</span>
                          </div>
                          {asset ? <audio controls className="h-7 max-w-[160px]" src={mediaUrl(asset.url)} /> : null}
                          <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => removeSampleRow(index)} type="button">
                            {t("dataset.delete", "삭제")}
                          </Button>
                        </article>
                      )) : <p className="text-xs text-ink-muted">{t("dataset.gallery.noSelection", "아직 선택한 샘플이 없습니다.")}</p>}
                    </div>
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="paths" className="m-0 mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("dataset.paths.refPath", "기준 음성 경로")}</Label>
                  <Input
                    placeholder={t("dataset.paths.refPlaceholder", "예: D:/my_tts_dataset/mai/ref/ref.wav")}
                    value={datasetForm.ref_audio_path}
                    onChange={(event) => setDatasetForm({ ...datasetForm, ref_audio_path: normalizeDatasetPath(event.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("dataset.paths.folder", "샘플 폴더 경로")}</Label>
                  <Input
                    placeholder={t("dataset.paths.folderPlaceholder", "예: D:/tts_data/mai_ko/wavs")}
                    value={datasetSampleFolderPath}
                    onChange={(event) => setDatasetSampleFolderPath(normalizeDatasetPath(event.target.value))}
                  />
                </div>
                <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                    {t("dataset.paths.bulkTitle", "직접 샘플 목록 붙여넣기")}
                    <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="border-t border-line px-3 py-3 flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-ink-muted">{t("dataset.paths.bulkLabel", "샘플 경로 일괄 입력")}</Label>
                    <Textarea
                      className="min-h-[120px] resize-y border-line bg-canvas font-mono text-xs"
                      placeholder={"D:/my_tts_dataset/mai/wavs/0001.wav | 첫 번째 문장\nD:/my_tts_dataset/mai/wavs/0002.wav"}
                      value={datasetBulkInput}
                      onChange={(event) => setDatasetBulkInput(event.target.value)}
                    />
                  </div>
                </details>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={applyBulkDatasetPaths} type="button">
                    {t("dataset.paths.applyBulk", "직접 목록 반영")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleTranscribeAllDatasetSamples} type="button">
                    {t("dataset.paths.autoFill", "비어 있는 텍스트 자동 채우기")}
                  </Button>
                </div>
                {datasetSamples.some((sample) => sample.audio_path.trim()) ? (
                  <div className="flex flex-col gap-2 mt-2">
                    {datasetSamples.map((sample, index) => (
                      sample.audio_path.trim() ? (
                        <article key={`sample-${index}`} className="rounded-md border border-line bg-surface p-2 flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <strong className="line-clamp-1 text-xs font-medium text-ink">{basenameFromPath(sample.audio_path)}</strong>
                            <span className="text-[10px] text-ink-muted line-clamp-1">{sample.text?.trim() || t("dataset.autoTranscribe", "자동 전사 예정")}</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => void handleTranscribeDatasetSample(index)} type="button">
                            {t("dataset.autoTranscribeAction", "자동 전사")}
                          </Button>
                          <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => removeSampleRow(index)} type="button">
                            {t("dataset.delete", "삭제")}
                          </Button>
                        </article>
                      ) : null
                    ))}
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>

            {lastCreatedDataset ? (
              <article className="rounded-md border border-positive/40 bg-positive/10 p-3 flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <strong className="text-sm font-medium text-ink">{lastCreatedDataset.name}</strong>
                  <p className="text-xs text-ink-muted">{t("dataset.lastCreated.body", "{n}개 샘플 · 학습 가능").replace("{n}", String(lastCreatedDataset.sample_count))}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setSelectedDatasetId(lastCreatedDataset.id); setActiveTab("training"); }} type="button">
                  {t("dataset.lastCreated.gotoTraining", "학습 실행으로 이동")}
                </Button>
              </article>
            ) : null}
          </WorkspaceCard>
        </WorkspaceShell>
      ) : null}

      {activeTab === "training" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("training.eyebrow", "TRAINING")}
            eyebrowIcon={Cog}
            title={t("training.title", "학습 실행")}
            subtitle={t("training.subtitle", "학습할 데이터셋을 고르고, 모델과 화자 이름을 확인한 뒤 바로 시작합니다.")}
            action={{
              label: t("training.action.start", "학습 시작"),
              onClick: handleCreateRun,
              disabled: !datasetReadyForTraining,
              loading,
            }}
          />

          <WorkspaceCard className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-ink-muted">{t("training.field.dataset", "사용할 데이터셋")}</Label>
              <Select value={selectedDatasetId || undefined} onValueChange={(value) => setSelectedDatasetId(value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDataset ? (
              <article className="rounded-md border border-line bg-canvas/60 p-3">
                <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("training.dataset.selected", "선택한 데이터셋")}</span>
                <strong className="mt-1 block text-sm font-medium text-ink">{selectedDataset.name}</strong>
                <p className="mt-1 text-xs text-ink-muted">{t("training.dataset.summary", "{n}개 샘플 · {state}").replace("{n}", String(selectedDataset.sample_count)).replace("{state}", datasetReadyForTraining ? t("training.dataset.ready", "학습 가능") : t("training.dataset.notReady", "학습 전 준비 필요"))}</p>
              </article>
            ) : null}
            {selectedDataset && !datasetReadyForTraining ? (
              <article className="rounded-md border border-warn/40 bg-warn/10 p-3">
                <strong className="text-sm font-medium text-ink">{t("training.notReady.title", "학습 준비가 끝나지 않았습니다")}</strong>
                <p className="mt-1 text-xs text-ink-muted">{t("training.notReady.body", "데이터셋 탭에서 다시 저장하면 학습용 준비까지 함께 진행됩니다.")}</p>
              </article>
            ) : null}
            <h3 className="text-sm font-medium text-ink">{t("training.config.title", "학습 설정")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("training.field.mode", "학습 방식")}</Label>
                <Select value={runForm.training_mode || undefined} onValueChange={(value) => setRunForm({ ...runForm, training_mode: value as FineTuneMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="custom_voice">CustomVoice</SelectItem>
                    <SelectItem value="voicebox">VoiceBox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("training.field.initModel", "초기 모델")}</Label>
                <Select value={runForm.init_model_path || undefined} onValueChange={(value) => setRunForm({ ...runForm, init_model_path: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {trainingModelOptions.map((model) => (
                      <SelectItem key={model.key} value={model.model_id}>{displayModelName(model)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("dataset.field.speaker", "화자 이름")}</Label>
                <Input value={runForm.speaker_name} onChange={(event) => setRunForm({ ...runForm, speaker_name: event.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("training.field.outputName", "모델 이름")}</Label>
                <Input
                  placeholder={t("training.field.outputPlaceholder", "예: mai-korean-narrator")}
                  value={runForm.output_name}
                  onChange={(event) => setRunForm({ ...runForm, output_name: event.target.value })}
                />
              </div>
            </div>
            {runForm.training_mode === "custom_voice" ? (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("training.field.encoder", "목소리 기준 모델")}</Label>
                <Select value={runForm.speaker_encoder_model_path || undefined} onValueChange={(value) => setRunForm({ ...runForm, speaker_encoder_model_path: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {baseModels.map((model) => (
                      <SelectItem key={model.key} value={model.model_id}>{displayModelName(model)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <details className="group rounded-md border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-ink-muted">
                {t("training.advanced", "고급 학습 설정")}
                <span className="text-ink-subtle transition group-open:rotate-180">▾</span>
              </summary>
              <div className="border-t border-line px-3 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("training.field.tokenizer", "토크나이저")}</Label>
                  <Select value={runForm.tokenizer_model_path || undefined} onValueChange={(value) => setRunForm({ ...runForm, tokenizer_model_path: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tokenizerModels.map((model) => (
                        <SelectItem key={model.key} value={model.model_id}>{displayModelName(model)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("applio_train.batchSize", "배치 크기")}</Label>
                  <Input type="number" value={runForm.batch_size} onChange={(event) => setRunForm({ ...runForm, batch_size: Number(event.target.value) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">epoch</Label>
                  <Input type="number" value={runForm.num_epochs} onChange={(event) => setRunForm({ ...runForm, num_epochs: Number(event.target.value) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-ink-muted">{t("training.field.lr", "학습률")}</Label>
                  <Input type="number" step="0.000001" value={runForm.lr} onChange={(event) => setRunForm({ ...runForm, lr: Number(event.target.value) })} />
                </div>
              </div>
            </details>
          </WorkspaceCard>

          <WorkspaceCard>
            <WorkspaceResultHeader title={t("training.runs.title", "학습 실행 기록")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {runs.length ? runs.map((run) => (
                <article key={run.id} className="rounded-md border border-line bg-canvas/60 p-3 flex flex-col gap-1">
                  <strong className="line-clamp-1 text-sm font-medium text-ink">{run.output_model_path.split("/").pop() || run.output_model_path}</strong>
                  <Badge variant="secondary" className="self-start bg-canvas text-ink-muted text-[10px]">{run.status}</Badge>
                  <span className="text-xs text-ink-muted">{run.speaker_name}</span>
                  <span className="text-[10px] font-mono text-ink-subtle">{formatDate(run.created_at)}</span>
                </article>
              )) : (
                <p className="text-xs text-ink-muted">{t("training.runs.empty", "아직 학습 실행 기록이 없습니다.")}</p>
              )}
            </div>
          </WorkspaceCard>
        </WorkspaceShell>
      ) : null}

      {activeTab === "voicebox_fusion" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("voicebox_fusion.eyebrow", "VOICEBOX FUSION")}
            eyebrowIcon={GitMerge}
            title={t("voicebox_fusion.title", "VoiceBox 융합")}
            subtitle={t("voicebox_fusion.subtitle", "CustomVoice 모델과 Base encoder를 합쳐 새로운 VoiceBox 모델을 만듭니다.")}
            action={{
              label: t("voicebox_fusion.action.create", "VoiceBox 만들기"),
              formId: "voicebox-fusion-form",
              loading,
            }}
          />

          <WorkspaceCard>
            <form id="voicebox-fusion-form" className="flex flex-col gap-4" onSubmit={handleCreateVoiceBoxFusion}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {VOICEBOX_STEPS.map((step, index) => (
                  <article key={step.title} className="rounded-md border border-line bg-canvas/60 p-3">
                    <strong className="text-sm font-medium text-ink">{index + 1}. {step.title}</strong>
                    <p className="mt-1 text-xs text-ink-muted">{step.description}</p>
                  </article>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("voicebox_fusion.field.customVoice", "CustomVoice 모델")}</Label>
                <Select value={voiceBoxFusionForm.input_checkpoint_path || undefined} onValueChange={(value) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, input_checkpoint_path: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                  </SelectTrigger>
                  <SelectContent>
                    {plainCustomVoiceModels.map((model) => (
                      <SelectItem key={model.key} value={model.model_id}>{displayModelName(model)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("voicebox_fusion.field.baseEncoder", "Base encoder 모델")}</Label>
                <Select value={voiceBoxFusionForm.speaker_encoder_source_path || undefined} onValueChange={(value) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, speaker_encoder_source_path: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("projects.placeholder.preset", "선택하세요")} />
                  </SelectTrigger>
                  <SelectContent>
                    {baseModels.map((model) => (
                      <SelectItem key={model.key} value={model.model_id}>{displayModelName(model)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-ink-muted">{t("voicebox_fusion.field.outputName", "모델명")}</Label>
                <Input value={voiceBoxFusionForm.output_name} onChange={(event) => setVoiceBoxFusionForm({ ...voiceBoxFusionForm, output_name: event.target.value })} />
              </div>
            </form>
          </WorkspaceCard>

          <WorkspaceCard>
            <WorkspaceResultHeader title={t("voicebox_fusion.available.title", "사용 가능한 모델")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {voiceBoxModels.length ? voiceBoxModels.map((model) => (
                <article key={model.key} className="rounded-md border border-line bg-canvas/60 p-3 flex items-center justify-between gap-3">
                  <strong className="line-clamp-1 text-sm font-medium text-ink">{displayModelName(model)}</strong>
                  <Button variant="outline" size="sm" onClick={() => { setVoiceBoxCloneForm((prev) => ({ ...prev, model_id: model.model_id, speaker: model.default_speaker || prev.speaker })); setCloneEngine("voicebox"); setActiveTab("clone"); }} type="button">
                    {t("voicebox_fusion.useInClone", "복제에서 사용")}
                  </Button>
                </article>
              )) : (
                <p className="text-xs text-ink-muted">{t("voicebox_fusion.empty", "아직 사용할 수 있는 VoiceBox 모델이 없습니다.")}</p>
              )}
            </div>
          </WorkspaceCard>
        </WorkspaceShell>
      ) : null}

      {activeTab === "guide" ? (
        <WorkspaceShell>
          <WorkspaceHeader
            eyebrow={t("guide.eyebrow", "USER GUIDE")}
            eyebrowIcon={BookOpen}
            title={t("guide.title", "작업별로 무엇을 어디서 하는지 정리했습니다")}
            subtitle={t("guide.subtitle", "Qwen 생성, Qwen 학습, VoiceBox, S2-Pro, 오디오 도구를 처음 쓰는 사람도 순서대로 따라갈 수 있게 묶었습니다.")}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
            <aside className="self-start">
              <WorkspaceCard className="flex flex-col gap-1 p-3">
                <nav className="flex flex-col gap-1" aria-label="Guide documents">
                  {guideSections.map((section, index) => (
                    <button
                      className={`rounded-md px-3 py-2 text-left text-sm transition ${activeGuideIndex === index ? "bg-accent-soft text-accent-ink font-medium" : "text-ink-muted hover:bg-canvas hover:text-ink"}`}
                      key={section.title}
                      onClick={() => setActiveGuideIndex(index)}
                      type="button"
                    >
                      {section.title}
                    </button>
                  ))}
                </nav>
              </WorkspaceCard>
            </aside>

            <WorkspaceCard className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">Guide</span>
                <h3 className="text-xl font-semibold tracking-tight text-ink">{selectedGuideSection.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{selectedGuideSection.summary}</p>
              </div>

              {selectedGuideSection.body?.length ? (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  {selectedGuideSection.body.map((paragraph, index) => (
                    <p key={index} className="text-sm leading-relaxed text-ink">{paragraph}</p>
                  ))}
                </div>
              ) : null}

              {selectedGuideSection.steps?.length ? (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <h4 className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.section.steps", "Steps")}</h4>
                  <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-muted marker:font-mono marker:text-ink-subtle">
                    {selectedGuideSection.steps.map((step, index) => (
                      <li key={index} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {selectedGuideSection.prompts?.length ? (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h4 className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.section.prompts", "Prompt examples")}</h4>
                  <div className="flex flex-col gap-3">
                    {selectedGuideSection.prompts.map((prompt, index) => (
                      <article
                        key={index}
                        className="rounded-md border border-line bg-canvas/60 p-3"
                      >
                        <header className="mb-2 flex items-center gap-2">
                          <span className="inline-flex items-center rounded-pill bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-allcaps text-accent-ink">
                            {prompt.label}
                          </span>
                        </header>
                        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{prompt.example}</pre>
                        {prompt.note ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">↪︎ {prompt.note}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedGuideSection.tags?.length ? (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h4 className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.section.tags", "Tag reference")}</h4>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {selectedGuideSection.tags.map((entry) => (
                      <div
                        key={entry.tag}
                        className="flex items-baseline gap-2 border-b border-line/60 py-1.5"
                      >
                        <code className="shrink-0 rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-accent-ink">
                          {entry.tag}
                        </code>
                        <span className="text-[12px] leading-relaxed text-ink-muted">{entry.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedGuideSection.controls?.length ? (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h4 className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.section.controls", "Controls reference")}</h4>
                  <div className="overflow-hidden rounded-md border border-line">
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead className="bg-canvas/60">
                        <tr className="border-b border-line">
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.table.name", "Name")}</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.table.default", "Default")}</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.table.effect", "Effect")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGuideSection.controls.map((control) => (
                          <tr key={control.name} className="border-b border-line/60 last:border-b-0 align-top">
                            <td className="px-3 py-2 font-mono text-[11px] text-ink">{control.name}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">
                              {control.defaultValue ?? "—"}
                              {control.range ? <span className="block text-[10px] text-ink-subtle">{control.range}</span> : null}
                            </td>
                            <td className="px-3 py-2 leading-relaxed text-ink-muted">{control.effect}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {selectedGuideSection.tips?.length ? (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <h4 className="font-mono text-[10px] uppercase tracking-allcaps text-ink-subtle">{t("guide.section.tips", "Tips")}</h4>
                  <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
                    {selectedGuideSection.tips.map((tip, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="text-accent-ink">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </WorkspaceCard>
          </div>
        </WorkspaceShell>
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
        <Providers>
          <StudioApp />
        </Providers>
      </ThemeProvider>
    </I18nProvider>
  );
}
