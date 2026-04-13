import { FormEvent, useEffect, useRef, useState } from "react";

import { api } from "./lib/api";
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
} from "./lib/types";

type TabKey = "home" | "voices" | "discover" | "custom" | "design" | "character" | "inference" | "hybrid" | "audio" | "finetune";
type AudioWorkspaceKey = "effects" | "changer" | "converter" | "separation" | "translation";
type AudioEffectsView = "explore" | "history";
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

const PRODUCT_PAGES: Record<TabKey, { label: string; title: string; description: string }> = {
  home: {
    label: "홈",
    title: "홈",
    description: "지금 바로 시작할 작업을 고릅니다.",
  },
  voices: {
    label: "나의 목소리들",
    title: "나의 목소리들",
    description: "내가 만든 프리셋, 생성 음성, 학습 결과를 모아 봅니다.",
  },
  discover: {
    label: "발견",
    title: "발견",
    description: "자주 쓰는 템플릿과 시작점을 고릅니다.",
  },
  custom: {
    label: "빠르게 들어보기",
    title: "빠르게 들어보기",
    description: "기본 CustomVoice로 짧게 미리 들어봅니다.",
  },
  character: {
    label: "목소리 복제",
    title: "새로운 목소리 만들기",
    description: "참조 음성에서 스타일을 추출하고 저장합니다.",
  },
  design: {
    label: "스토리 스튜디오",
    title: "스토리 스튜디오",
    description: "긴 대본과 장면용 목소리를 함께 다룹니다.",
  },
  audio: {
    label: "오디오 작업실",
    title: "오디오 작업실",
    description: "효과음, 보이스 체인저, 분리, 변환, 전사를 처리합니다.",
  },
  inference: {
    label: "텍스트 음성 변환",
    title: "텍스트 음성 변환",
    description: "모델을 직접 골라 원하는 문장을 음성으로 만듭니다.",
  },
  hybrid: {
    label: "스타일 프리셋 + 말투 지시",
    title: "스타일 프리셋 + 말투 지시",
    description: "저장한 스타일 위에 말투 지시를 더해 결과를 만듭니다.",
  },
  finetune: {
    label: "훈련 랩",
    title: "훈련 랩",
    description: "데이터셋 준비와 학습을 이어서 진행합니다.",
  },
};

const CUSTOM_RECIPES = [
  {
    label: "Broadcast",
    text: "오늘 회의는 여기서 정리하겠습니다. 각자 할 일을 다시 확인해 주세요.",
    instruction: "차분하고 또렷하게, 스튜디오 나레이션처럼 안정적으로 읽어 주세요.",
    language: "Korean",
  },
  {
    label: "Warm",
    text: "오늘은 정말 힘들었지. 그래도 여기까지 온 것만으로도 충분해.",
    instruction: "따뜻하고 다정하게, 가까이에서 위로하듯 읽어 주세요.",
    language: "Korean",
  },
  {
    label: "Cold",
    text: "이제 변명은 그만해. 남은 건 결과로 보여주는 것뿐이야.",
    instruction: "차갑고 단호하게, 감정을 억누른 채 압박하듯 읽어 주세요.",
    language: "Korean",
  },
] as const;

const DESIGN_RECIPES = [
  {
    label: "Heroine",
    instruction:
      "Young Korean woman, cinematic and confident. Clear articulation, bright upper tone, slight emotional swell at the end of each sentence.",
  },
  {
    label: "Late Night",
    instruction:
      "Korean female voice, intimate and low-key. Breathy but controlled, like a midnight radio host speaking very close to the mic.",
  },
  {
    label: "Villain",
    instruction:
      "Korean woman with poised menace. Calm surface, cold authority, sharp consonants, restrained but dangerous energy.",
  },
] as const;

const HYBRID_RECIPES = [
  {
    label: "Furious",
    instruction: "폭발 직전의 분노로, 날카롭고 거칠게, 문장 끝을 강하게 끊어 읽어주세요.",
  },
  {
    label: "Shaken",
    instruction: "분노와 공포가 동시에 올라오는 느낌으로, 숨이 가쁘고 떨리는 톤으로 읽어주세요.",
  },
  {
    label: "Cold",
    instruction: "감정을 억누른 채 차갑고 단호하게, 상대를 압박하듯 읽어주세요.",
  },
] as const;

const SOUND_EFFECT_LIBRARY = [
  { id: "river", title: "강물", subtitle: "넓게 흐르는 물소리와 가까운 물 튐", duration: "0:30", prompt: "폭이 넓은 강물 소리, 가까운 물 튐, 잔잔한 흐름" },
  { id: "thunder", title: "천둥", subtitle: "가까운 번개와 낮게 울리는 잔향", duration: "0:18", prompt: "가까운 천둥 번개, 낮게 울리는 공기, 요란한 잔향" },
  { id: "gunshot", title: "총성", subtitle: "짧고 날카로운 근거리 충격음", duration: "0:02", prompt: "짧고 강한 총성, 가까운 거리, 날카로운 충격" },
  { id: "explosion", title: "폭발", subtitle: "유리 파편이 섞인 무거운 폭발음", duration: "0:04", prompt: "강한 폭발, 유리 파편, 짧고 무거운 충격" },
  { id: "rain", title: "폭우", subtitle: "차갑고 촘촘한 빗줄기가 길게 쏟아짐", duration: "0:30", prompt: "거센 폭우, 차가운 빗줄기, 낮은 바람, 지속적인 빗소리" },
  { id: "applause", title: "박수", subtitle: "밝은 실내에서 터지는 환호와 박수", duration: "0:09", prompt: "관객 박수, 짧은 환호, 밝은 실내 잔향" },
  { id: "wind", title: "강풍", subtitle: "낮게 울리는 거센 바람과 진동", duration: "0:30", prompt: "거센 폭풍 바람, 낮게 울리는 공기, 창문 틈새 진동" },
  { id: "running", title: "달리는 발소리", subtitle: "마른 바닥을 빠르게 치는 일정한 발걸음", duration: "0:30", prompt: "빠르게 달리는 발소리, 마른 바닥, 일정한 리듬" },
] as const;

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
  const looksOpaque = /^(audio|gen|sfx|voicechanger|convert|harmonic|percussive)_[a-f0-9]{8,}/i.test(sourceName);
  if (hasExtension && !looksOpaque) {
    return sourceName;
  }

  const extension = hasExtension ? sourceName.split(".").pop() || "wav" : "wav";
  const readableText = (record.input_text || record.mode || "audio")
    .trim()
    .replace(/[^\w\s가-힣-]+/g, " ")
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  const base = readableText || record.mode || "audio";
  return `${base}.${extension}`;
}

function getDatasetSourceLabel(value: string): string {
  if (value === "voice_design_batch") return "Voice Design 샘플 묶음";
  if (value === "uploaded_audio_batch") return "직접 업로드한 음성 묶음";
  return value;
}

function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    custom_voice: "텍스트 음성 변환",
    voice_design: "스토리 스튜디오",
    story_studio: "스토리 스튜디오",
    voice_clone: "목소리 복제",
    hybrid_clone_instruct: "하이브리드",
    sound_effect: "사운드 효과",
    voice_changer: "보이스 체인저",
    audio_converter: "오디오 변환",
    audio_separation: "오디오 분리",
    audio_translation: "전사/번역",
  };
  return labels[mode] || mode;
}

function getModelDisplayLabel(model: ModelInfo): string {
  if (model.source === "stock") {
    return model.label;
  }
  const speaker = model.default_speaker ? ` · ${model.default_speaker}` : "";
  const checkpoint = model.label.includes("/") ? model.label.split("/").pop()?.trim() || model.label : model.label;
  return `${checkpoint}${speaker}`;
}

function getAudioToolJobLabel(kind: string): string {
  const labels: Record<string, string> = {
    sound_effect: "사운드 효과",
    voice_changer: "보이스 체인저",
    audio_converter: "오디오 변환",
    audio_separation: "오디오 분리",
    audio_translation: "전사/번역",
  };
  return labels[kind] || kind;
}

function getPresetSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    generated_sample: "생성 음성에서 저장",
    uploaded_reference: "참조 음성에서 저장",
    design_sample: "디자인 샘플에서 저장",
    upload_clone_prompt: "업로드 음성에서 저장",
  };
  return labels[sourceType] || "저장된 스타일";
}

function getRecordDisplayTitle(record: GenerationRecord): string {
  const text = record.input_text?.trim();
  if (text) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.length > 34 ? `${cleaned.slice(0, 34)}…` : cleaned;
  }
  return getModeLabel(record.mode);
}

function getAudioToolJobDisplayTitle(job: AudioToolJob): string {
  if (job.kind === "sound_effect") {
    return "사운드 효과";
  }
  if (job.kind === "voice_changer") {
    return "보이스 체인저";
  }
  if (job.kind === "audio_converter") {
    return "오디오 변환";
  }
  if (job.kind === "audio_separation") {
    return "오디오 분리";
  }
  if (job.kind === "audio_translation") {
    return "전사와 재합성";
  }
  return getAudioToolJobLabel(job.kind);
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

function TargetLanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedValue = normalizeLanguageValue(value);
  const targetOptions = LANGUAGE_OPTIONS.filter((option) => option.value !== "Auto");
  const fallbackValue = normalizedValue === "Auto" ? "English" : normalizedValue;
  const hasKnownValue = targetOptions.some((option) => option.value === fallbackValue);

  return (
    <select value={fallbackValue} onChange={(event) => onChange(event.target.value)}>
      {!hasKnownValue && fallbackValue ? <option value={fallbackValue}>{fallbackValue}</option> : null}
      {targetOptions.map((option) => (
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
        <span>{getModeLabel(record.mode)}</span>
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

function RecipeBar({
  title,
  items,
  onApply,
}: {
  title: string;
  items: ReadonlyArray<{ label: string; instruction?: string; text?: string; language?: string }>;
  onApply: (item: { label: string; instruction?: string; text?: string; language?: string }) => void;
}) {
  return (
    <section className="recipe-bar">
      <div className="recipe-bar__header">
        <span className="eyebrow eyebrow--soft">{title}</span>
        <p>자주 쓰는 템플릿을 바로 적용합니다.</p>
      </div>
      <div className="recipe-bar__chips">
        {items.map((item) => (
          <button className="recipe-chip" key={item.label} onClick={() => onApply(item)} type="button">
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <article className="hero-metric">
      <span className="meta-label">{label}</span>
      <strong style={accent ? { color: accent } : undefined}>{value}</strong>
    </article>
  );
}

function SpotlightCard({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className="spotlight-card">
      <span className="eyebrow eyebrow--soft">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="secondary-button" onClick={onAction} type="button">
        {actionLabel}
      </button>
    </article>
  );
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="page-header">
      <span className="eyebrow eyebrow--soft">Voice Studio</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function MiniWaveform({ dense = false }: { dense?: boolean }) {
  const bars = dense
    ? [10, 18, 24, 16, 12, 20, 26, 18, 14, 10, 8, 12, 16, 20, 18, 12, 10, 8, 6, 5]
    : [6, 9, 12, 18, 24, 28, 25, 20, 15, 10, 8, 6, 5, 4, 6, 8, 10, 13, 16, 18, 15, 12, 9];

  return (
    <div className="mini-waveform" aria-hidden="true">
      {bars.map((height, index) => (
        <span key={`${height}-${index}`} style={{ height }} />
      ))}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [audioWorkspace, setAudioWorkspace] = useState<AudioWorkspaceKey>("effects");
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
    instruct: "지친 감정을 누르면서도 또렷하게 말해 주세요.",
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
    instruct: "숨이 가쁘고 떨리는 상태로, 감정을 간신히 붙잡고 있는 듯 말해 주세요.",
    ref_audio_path: "",
    ref_text: "",
    x_vector_only_mode: false,
  });
  const [hybridControls, setHybridControls] = useState<GenerationControlsForm>(createGenerationControls("clone"));
  const [lastHybridRecord, setLastHybridRecord] = useState<GenerationRecord | null>(null);
  const [audioToolCapabilities, setAudioToolCapabilities] = useState<AudioToolCapability[]>([]);
  const [audioToolJobs, setAudioToolJobs] = useState<AudioToolJob[]>([]);
  const [audioEffectsView, setAudioEffectsView] = useState<AudioEffectsView>("explore");
  const [audioEffectsSearch, setAudioEffectsSearch] = useState("");
  const [soundEffectForm, setSoundEffectForm] = useState({
    prompt: "금속 지붕에 내리는 차가운 비와 멀리서 울리는 낮은 천둥",
    duration_sec: "4.0",
    intensity: "0.9",
  });
  const [voiceChangerForm, setVoiceChangerForm] = useState({
    audio_path: "",
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
  const [audioTranslateForm, setAudioTranslateForm] = useState({
    audio_path: "",
    target_language: "English",
    translated_text: "",
    model_id: "",
    speaker: "Sohee",
    instruct: "",
  });
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
  const selectedInferenceModel = inferenceModels.find((model) => model.model_id === inferenceForm.model_id) ?? null;
  const selectedInferenceMode = selectedInferenceModel?.inference_mode ?? null;

  useEffect(() => {
    if (customVoiceModels.length > 0 && !customForm.model_id) {
      setCustomForm((prev) => ({ ...prev, model_id: preferredStockCustomVoiceModel?.model_id ?? prev.model_id }));
    }
    if (customVoiceModels.length > 0 && !audioTranslateForm.model_id) {
      setAudioTranslateForm((prev) => ({
        ...prev,
        model_id: preferredStockCustomVoiceModel?.model_id ?? prev.model_id,
      }));
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
  }, [customVoiceModels, customVoiceCapableModels, voiceDesignModels, baseModels, inferenceModels, tokenizerModels, customForm.model_id, designForm.model_id, selectedBaseModelId, inferenceForm.model_id, hybridForm.custom_model_id, runForm.init_model_path, runForm.speaker_encoder_model_path, runForm.tokenizer_model_path, preferredStockBaseModel, preferredStockCustomVoiceModel, preferredHybridCustomModel, preferredInferenceModel, audioTranslateForm.model_id]);

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
  const audioConverterAvailable = audioToolCapabilityMap.get("audio_converter")?.available ?? true;
  const audioSeparationAvailable = audioToolCapabilityMap.get("audio_separation")?.available ?? true;
  const audioTranslationAvailable = audioToolCapabilityMap.get("audio_translation")?.available ?? true;
  const pageMeta = PRODUCT_PAGES[activeTab];
  const soundEffectJobs = audioToolJobs.filter((job) => job.kind === "sound_effect");
  const filteredSoundEffectLibrary = SOUND_EFFECT_LIBRARY.filter((item) => {
    const query = audioEffectsSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.title} ${item.subtitle} ${item.prompt}`.toLowerCase().includes(query);
  });
  const audioWorkspaceMeta: Record<AudioWorkspaceKey, { title: string; description: string }> = {
    effects: {
      title: "사운드 효과 생성",
      description: "효과음을 찾고, 바로 생성하고, 최근 작업을 다시 확인합니다.",
    },
    changer: {
      title: "보이스 체인저",
      description: "RVC 모델로 기존 음성의 음색을 직접 바꿉니다.",
    },
    converter: {
      title: "오디오 변환",
      description: "포맷, 샘플레이트, 모노 정리를 한 번에 처리합니다.",
    },
    separation: {
      title: "오디오 분리",
      description: "lightweight HPSS 기반으로 harmonic/percussive stem을 나눕니다.",
    },
    translation: {
      title: "음성을 텍스트로 / 번역 보조",
      description: "Whisper 전사와 확정 번역문 재합성을 정확도 우선으로 묶습니다.",
    },
  };

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

  async function handleAudioConvertSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.convertAudio({
        audio_path: audioConvertForm.audio_path,
        output_format: audioConvertForm.output_format,
        sample_rate: Number(audioConvertForm.sample_rate || "24000"),
        mono: audioConvertForm.mono,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("오디오 변환을 완료했습니다.");
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

  async function handleAudioTranslateSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const result = await api.translateAudio({
        audio_path: audioTranslateForm.audio_path,
        target_language: audioTranslateForm.target_language,
        translated_text: audioTranslateForm.translated_text,
        model_id: audioTranslateForm.model_id || undefined,
        speaker: audioTranslateForm.speaker,
        instruct: audioTranslateForm.instruct,
      });
      setLastAudioToolResult(result);
      await refreshAll();
      setMessage("오디오 번역 보조 흐름을 실행했습니다.");
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
            <span className="eyebrow">Voice Studio</span>
            <strong>Voice Studio</strong>
            <small>음성 생성과 스타일 작업을 위한 작업실</small>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">홈</span>
            <button className={activeTab === "home" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("home")} type="button">
              <span>홈</span>
              <small>전체 상태와 바로가기</small>
            </button>
            <button className={activeTab === "voices" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("voices")} type="button">
              <span>나의 목소리들</span>
              <small>내 작업물 보기</small>
            </button>
            <button className={activeTab === "discover" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("discover")} type="button">
              <span>발견</span>
              <small>템플릿 모아보기</small>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">제품</span>
            <button className={activeTab === "custom" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("custom")} type="button">
              <span>빠르게 들어보기</span>
              <small>빠르게 들어보기</small>
            </button>
            <button className={activeTab === "character" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("character")} type="button">
              <span>목소리 복제</span>
              <small>스타일 저장</small>
            </button>
            <button className={activeTab === "design" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("design")} type="button">
              <span>스토리 스튜디오</span>
              <small>장시간 대본 작업</small>
            </button>
            <button className={activeTab === "hybrid" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("hybrid")} type="button">
              <span>스타일 프리셋 + 말투 지시</span>
              <small>저장한 스타일에 감정 더하기</small>
            </button>
            <button className={activeTab === "audio" && audioWorkspace === "effects" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => { setActiveTab("audio"); setAudioWorkspace("effects"); }} type="button">
              <span>사운드 효과</span>
              <small>효과음 만들기</small>
            </button>
            <button className={activeTab === "audio" && audioWorkspace === "separation" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => { setActiveTab("audio"); setAudioWorkspace("separation"); }} type="button">
              <span>오디오 분리</span>
              <small>오디오 나누기</small>
            </button>
            <button className={activeTab === "audio" && audioWorkspace === "translation" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => { setActiveTab("audio"); setAudioWorkspace("translation"); }} type="button">
              <span>음성을 텍스트로</span>
              <small>전사와 재합성</small>
            </button>
            <button className={activeTab === "audio" && audioWorkspace === "changer" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => { setActiveTab("audio"); setAudioWorkspace("changer"); }} type="button">
              <span>보이스 체인저</span>
              <small>음색 바꾸기</small>
            </button>
          </div>

          <div className="sidebar__section">
            <span className="sidebar__section-title">실험 / 개발</span>
            <button className={activeTab === "inference" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("inference")} type="button">
              <span>텍스트 음성 변환</span>
              <small>모델 직접 선택</small>
            </button>
            <button className={activeTab === "finetune" ? "sidebar-link is-active" : "sidebar-link"} onClick={() => setActiveTab("finetune")} type="button">
              <span>훈련 랩</span>
              <small>데이터셋과 학습</small>
            </button>
          </div>
        </aside>

        <main className="page-main">
          {activeTab === "home" ? (
            <header className="hero">
              <div className="hero__copy">
                <span className="eyebrow">Voice Studio</span>
                <h1>오늘 할 작업을 고르세요</h1>
                <p>빠르게 들어보기, 텍스트 음성 변환, 스타일 작업, 오디오 작업, 학습을 각 화면으로 나눠 정리했습니다.</p>
              </div>
              <div className="spotlight-grid">
                <SpotlightCard
                  eyebrow="바로 시작"
                  title="빠르게 들어보기"
                  description="기본 CustomVoice로 짧게 미리 들어봅니다."
                  actionLabel="빠르게 들어보기"
                  onAction={() => setActiveTab("custom")}
                />
                <SpotlightCard
                  eyebrow="스타일"
                  title="목소리 복제"
                  description="참조 음성에서 스타일을 추출하고 저장합니다."
                  actionLabel="목소리 복제"
                  onAction={() => setActiveTab("character")}
                />
                <SpotlightCard
                  eyebrow="모델"
                  title="텍스트 음성 변환"
                  description="모델을 직접 골라 원하는 문장을 음성으로 만듭니다."
                  actionLabel="텍스트 음성 변환"
                  onAction={() => setActiveTab("inference")}
                />
                <SpotlightCard
                  eyebrow="학습"
                  title="훈련 랩"
                  description="데이터셋을 만들고 학습을 실행합니다."
                  actionLabel="훈련 랩"
                  onAction={() => setActiveTab("finetune")}
                />
                <SpotlightCard
                  eyebrow="스타일"
                  title="스타일 프리셋 + 말투 지시"
                  description="저장한 스타일 위에 감정과 말투를 더합니다."
                  actionLabel="스타일 실험"
                  onAction={() => setActiveTab("hybrid")}
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
                {history.slice(0, 10).map((record) => (
                  <article className="history-item" key={record.id}>
                    <button className="history-item__button" onClick={() => setActiveTab("inference")} type="button">
                      <strong>{getAudioDownloadName(record)}</strong>
                      <span>{getModeLabel(record.mode)}</span>
                      <small>{formatDate(record.created_at)}</small>
                    </button>
                    <a className="history-item__download" href={record.output_audio_url} download={getAudioDownloadName(record)}>
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
                    <button className="secondary-button" onClick={() => { setInferenceForm((prev) => ({ ...prev, model_id: model.model_id })); setActiveTab("inference"); }} type="button">
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

      {activeTab === "discover" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <section className="panel">
              <h2>빠르게 들어보기 템플릿</h2>
              <RecipeBar title="말투 템플릿" items={CUSTOM_RECIPES} onApply={(item) => { applyCustomRecipe(item); setActiveTab("custom"); }} />
            </section>
            <section className="panel">
              <h2>스토리 스튜디오 템플릿</h2>
              <RecipeBar title="장면 템플릿" items={DESIGN_RECIPES} onApply={(item) => { applyDesignRecipe(item); setActiveTab("design"); }} />
            </section>
          </div>
          <div className="panel-grid">
            <section className="panel">
              <h2>감정 템플릿</h2>
              <RecipeBar title="감정 강도" items={HYBRID_RECIPES} onApply={(item) => { applyHybridRecipe(item); setActiveTab("inference"); }} />
            </section>
            <section className="panel">
              <h2>바로 시작</h2>
              <div className="spotlight-grid">
                <SpotlightCard eyebrow="미리듣기" title="빠르게 들어보기" description="기본 CustomVoice로 짧게 확인합니다." actionLabel="열기" onAction={() => setActiveTab("custom")} />
                <SpotlightCard eyebrow="스타일" title="목소리 복제" description="참조 음성에서 스타일을 추출합니다." actionLabel="열기" onAction={() => setActiveTab("character")} />
                <SpotlightCard eyebrow="텍스트 음성 변환" title="텍스트 음성 변환" description="모델을 직접 골라 생성합니다." actionLabel="열기" onAction={() => setActiveTab("inference")} />
                <SpotlightCard eyebrow="하이브리드" title="스타일 프리셋 + 말투 지시" description="저장한 스타일과 말투 지시를 함께 씁니다." actionLabel="열기" onAction={() => setActiveTab("hybrid")} />
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "custom" ? (
        <section className="workspace">
          <form className="panel" onSubmit={handleCustomSubmit}>
            <h2>빠르게 들어보기</h2>
            <p className="field-hint">기본 CustomVoice로 짧은 문장을 빠르게 미리 확인하는 화면입니다.</p>
            <RecipeBar title="빠른 미리듣기 템플릿" items={CUSTOM_RECIPES} onApply={applyCustomRecipe} />
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
                <LanguageSelect
                  value={customForm.language}
                  onChange={(language) => setCustomForm({ ...customForm, language })}
                />
              </label>
              <label>
                화자
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
              말투 지시
              <textarea
                value={customForm.instruct}
                onChange={(event) => setCustomForm({ ...customForm, instruct: event.target.value })}
              />
            </label>
            <GenerationControlsEditor value={customControls} onChange={setCustomControls} />
            <button className="primary-button" disabled={loading} type="submit">
              미리듣기 생성
            </button>
          </form>

          <aside className="panel">
            <h3>현재 빠른 미리듣기 화자</h3>
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
              <AudioCard title="방금 만든 미리듣기" record={lastCustomRecord} />
            ) : null}
          </aside>
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
              장면/화자 지시
              <textarea
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

      {activeTab === "inference" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
          <form className="panel inference-panel" onSubmit={handleModelInferenceSubmit}>
            <div className="result-card__header">
              <div>
                <span className="eyebrow eyebrow--soft">Model Lab</span>
                <h2>텍스트 음성 변환</h2>
                <p>Base, CustomVoice, fine-tuned 체크포인트를 직접 골라 원하는 문장을 음성으로 만듭니다.</p>
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
                <strong>{getModelDisplayLabel(selectedInferenceModel)}</strong>
                <p>{selectedInferenceModel.notes}</p>
                <div className="audio-card__meta">
                  <span>{selectedInferenceModel.source === "stock" ? "기본 모델" : "학습된 모델"}</span>
                  <span>{selectedInferenceMode === "voice_clone" ? "참조 음성 기반" : selectedInferenceMode === "custom_voice" ? "화자 선택형" : "설명문 기반"}</span>
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
                화자
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
              말투 지시
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
              <details className="advanced-inline">
                <summary>참조 음성 설정</summary>
                <div className="inference-clone-grid">
                  <label>
                    기준 음성 경로
                    <input
                      value={inferenceForm.ref_audio_path}
                      onChange={(event) => setInferenceForm((prev) => ({ ...prev, ref_audio_path: event.target.value }))}
                    />
                  </label>
                  <label>
                    스타일 자산 경로
                    <input
                      value={inferenceForm.voice_clone_prompt_path}
                      onChange={(event) =>
                        setInferenceForm((prev) => ({ ...prev, voice_clone_prompt_path: event.target.value }))
                      }
                    />
                  </label>
                  <label className="inference-clone-grid__wide">
                    기준 음성 문장
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
                    빠른 음색 추출 모드
                  </label>
                </div>
              </details>
            ) : null}

            <GenerationControlsEditor value={inferenceControls} onChange={setInferenceControls} />
            <button className="primary-button" disabled={loading || !selectedInferenceModel} type="submit">
              선택한 모델로 추론
            </button>
          </form>

          <aside className="panel inference-side">
            <h3>참조 음성 빠른 선택</h3>
            <p className="field-hint">Base 계열 모델일 때 아래 파일을 고르면 기준 음성과 참조 문장이 바로 채워집니다.</p>
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
        </section>
      ) : null}

      {activeTab === "hybrid" ? (
        <section className="workspace workspace--stacked">
          <div className="panel-grid">
            <form className="panel inference-panel" onSubmit={handleHybridInferenceSubmit}>
              <div className="result-card__header">
                <div>
                  <span className="eyebrow eyebrow--soft">Hybrid</span>
                  <h2>스타일 프리셋 + 말투 지시</h2>
                  <p>저장한 스타일을 불러온 뒤, 그 위에 말투 지시를 더해 감정 차이를 확인합니다.</p>
                </div>
              </div>
              <RecipeBar title="감정 템플릿" items={HYBRID_RECIPES} onApply={applyHybridRecipe} />

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
                <p className="field-hint">
                  프리셋이 없으면 아래 고급 입력으로 직접 참조 음성과 Base 모델을 지정할 수 있습니다.
                </p>
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
                말투 지시
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
                  빠른 음색 추출 모드
                </label>
              </div>
              <p className="field-hint">
                프리셋을 고르면 기준 음성과 참조 문장이 자동으로 채워집니다. 필요하면 아래에서 바꿀 수 있습니다.
              </p>
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

      {activeTab === "audio" ? (
        <section className="workspace workspace--stacked">
          <section className="panel product-switcher">
            <div>
              <span className="eyebrow eyebrow--soft">오디오 작업</span>
              <h2>{audioWorkspaceMeta[audioWorkspace].title}</h2>
              <p>{audioWorkspaceMeta[audioWorkspace].description}</p>
            </div>
            <div className="product-switcher__grid">
              <button className={audioWorkspace === "effects" ? "tab is-active" : "tab"} onClick={() => setAudioWorkspace("effects")} type="button">
                <span>사운드 효과</span>
                <small>효과음 만들기</small>
              </button>
              <button className={audioWorkspace === "changer" ? "tab is-active" : "tab"} onClick={() => setAudioWorkspace("changer")} type="button">
                <span>보이스 체인저</span>
                <small>음색 바꾸기</small>
              </button>
              <button className={audioWorkspace === "converter" ? "tab is-active" : "tab"} onClick={() => setAudioWorkspace("converter")} type="button">
                <span>오디오 변환</span>
                <small>포맷 바꾸기</small>
              </button>
              <button className={audioWorkspace === "separation" ? "tab is-active" : "tab"} onClick={() => setAudioWorkspace("separation")} type="button">
                <span>오디오 분리</span>
                <small>트랙 나누기</small>
              </button>
              <button className={audioWorkspace === "translation" ? "tab is-active" : "tab"} onClick={() => setAudioWorkspace("translation")} type="button">
                <span>음성을 텍스트로</span>
                <small>전사와 재합성</small>
              </button>
            </div>
          </section>

          {audioWorkspace === "effects" ? (
            <section className="sound-effects-shell">
              <div className="sound-effects-top">
                <div>
                  <h2>사운드 효과</h2>
                  <p>원하는 분위기의 효과음을 찾거나 직접 만들어보세요.</p>
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
                  placeholder="생성하려는 효과음을 설명하세요..."
                  value={soundEffectForm.prompt}
                  onChange={(event) => setSoundEffectForm({ ...soundEffectForm, prompt: event.target.value })}
                />
                <div className="sound-effects-composer__meta">
                  <span>길이 {soundEffectForm.duration_sec}초</span>
                  <span>강도 {soundEffectForm.intensity}</span>
                  <button className="primary-button" disabled={loading || !soundEffectsAvailable} type="submit">
                    생성
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {audioWorkspace !== "effects" ? (
          <>
          <div className="panel-grid">
            {audioWorkspace === "changer" ? (
            <form className="panel" onSubmit={handleVoiceChangerSubmit}>
              <h2>보이스 체인저</h2>
              <p>기존 음성의 타이밍과 호흡을 유지한 채, RVC 모델로 음색만 바꿉니다.</p>
              {!voiceChangerAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <label>
                원본 오디오 경로
                <input value={voiceChangerForm.audio_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, audio_path: event.target.value })} />
              </label>
              <div className="field-row">
                <label>
                  RVC 모델 경로 (.pth)
                  <input value={voiceChangerForm.model_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, model_path: event.target.value })} />
                </label>
                <label>
                  인덱스 경로 (.index)
                  <input value={voiceChangerForm.index_path} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, index_path: event.target.value })} />
                </label>
                <label>
                  피치 이동
                  <input value={voiceChangerForm.pitch_shift_semitones} onChange={(event) => setVoiceChangerForm({ ...voiceChangerForm, pitch_shift_semitones: event.target.value })} />
                </label>
              </div>
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
              <button className="primary-button" disabled={loading || !voiceChangerAvailable} type="submit">목소리 바꾸기</button>
            </form>
            ) : null}
          </div>

          <div className="panel-grid">
            {audioWorkspace === "converter" ? (
            <form className="panel" onSubmit={handleAudioConvertSubmit}>
              <h2>오디오 변환</h2>
              <p>포맷, 샘플레이트, mono 여부를 정리합니다.</p>
              {!audioConverterAvailable ? <p className="field-hint">현재 변환 기능은 비활성 상태입니다.</p> : null}
              <label>
                원본 오디오 경로
                <input value={audioConvertForm.audio_path} onChange={(event) => setAudioConvertForm({ ...audioConvertForm, audio_path: event.target.value })} />
              </label>
              <div className="field-row">
                <label>
                  출력 형식
                  <select value={audioConvertForm.output_format} onChange={(event) => setAudioConvertForm({ ...audioConvertForm, output_format: event.target.value })}>
                    <option value="wav">wav</option>
                    <option value="flac">flac</option>
                    <option value="ogg">ogg</option>
                  </select>
                </label>
                <label>
                  샘플레이트
                  <input value={audioConvertForm.sample_rate} onChange={(event) => setAudioConvertForm({ ...audioConvertForm, sample_rate: event.target.value })} />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={audioConvertForm.mono} onChange={(event) => setAudioConvertForm({ ...audioConvertForm, mono: event.target.checked })} />
                  모노로 정리
                </label>
              </div>
              <div className="button-row">
                <button className="primary-button" disabled={loading || !audioConverterAvailable} type="submit">변환 실행</button>
              </div>
            </form>
            ) : null}

            {audioWorkspace === "translation" ? (
            <form className="panel" onSubmit={handleAudioTranslateSubmit}>
              <h2>전사와 재합성</h2>
              <p>음성을 전사하고, 원하는 번역문으로 다시 읽게 합니다.</p>
              {!audioTranslationAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <label>
                원본 오디오 경로
                <input value={audioTranslateForm.audio_path} onChange={(event) => setAudioTranslateForm({ ...audioTranslateForm, audio_path: event.target.value })} />
              </label>
              <div className="field-row">
                <label>
                  대상 언어
                  <TargetLanguageSelect value={audioTranslateForm.target_language} onChange={(language) => setAudioTranslateForm({ ...audioTranslateForm, target_language: language })} />
                </label>
                <label>
                  읽어줄 모델
                  <select value={audioTranslateForm.model_id} onChange={(event) => setAudioTranslateForm({ ...audioTranslateForm, model_id: event.target.value })}>
                    {customVoiceModels.map((model) => (
                      <option key={model.key} value={model.model_id}>{model.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  화자
                  <select value={audioTranslateForm.speaker} onChange={(event) => setAudioTranslateForm({ ...audioTranslateForm, speaker: event.target.value })}>
                    {speakers.map((speaker) => (
                      <option key={speaker.speaker} value={speaker.speaker}>{speaker.speaker}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                읽어줄 문장
                <textarea value={audioTranslateForm.translated_text} onChange={(event) => setAudioTranslateForm({ ...audioTranslateForm, translated_text: event.target.value })} />
              </label>
              <label>
                말투 지시
                <textarea value={audioTranslateForm.instruct} onChange={(event) => setAudioTranslateForm({ ...audioTranslateForm, instruct: event.target.value })} />
              </label>
              <button className="primary-button" disabled={loading || !audioTranslationAvailable} type="submit">전사/번역 흐름 실행</button>
            </form>
            ) : null}

            {audioWorkspace === "separation" ? (
            <form className="panel" onSubmit={(event) => {
              event.preventDefault();
              void handleAudioSeparation(audioConvertForm.audio_path);
            }}>
              <h2>오디오 분리</h2>
              <p>오디오를 두 갈래로 나눠 확인합니다.</p>
              {!audioSeparationAvailable ? <p className="field-hint">현재 이 기능은 비활성 상태입니다.</p> : null}
              <label>
                원본 오디오 경로
                <input value={audioConvertForm.audio_path} onChange={(event) => setAudioConvertForm({ ...audioConvertForm, audio_path: event.target.value })} />
              </label>
              <button className="primary-button" disabled={loading || !audioConvertForm.audio_path || !audioSeparationAvailable} type="submit">분리 실행</button>
            </form>
            ) : null}
          </div>

          <div className="panel-grid">
            <section className="panel">
              <h2>최근 결과</h2>
              <div className="history-list">
                {audioToolJobs.map((job) => (
                  <article className="history-item" key={job.id}>
                    <button className="history-item__button" type="button">
                      <strong>{getAudioToolJobDisplayTitle(job)}</strong>
                      <span>{formatDate(job.created_at)}</span>
                      <small>{job.message}</small>
                    </button>
                    {job.artifacts[0] ? (
                      <a className="history-item__download" href={job.artifacts[0].url} download={job.artifacts[0].filename}>다운로드</a>
                    ) : null}
                  </article>
                ))}
              </div>
              {lastAudioToolResult?.record ? <AudioCard title="방금 생성한 오디오 도구 결과" record={lastAudioToolResult.record} /> : null}
              {lastAudioToolResult?.assets?.length ? (
                <div className="preset-list">
                  {lastAudioToolResult.assets.map((asset) => (
                    <article className="preset-card" key={`${asset.path}-${asset.label}`}>
                      <strong>{asset.label}</strong>
                      <audio controls className="audio-card__player" src={asset.url} />
                    </article>
                  ))}
                </div>
              ) : null}
              {lastAudioToolResult?.transcript_text ? (
                <article className="status-card">
                  <strong>전사문</strong>
                  <p>{lastAudioToolResult.transcript_text}</p>
                  {lastAudioToolResult.translated_text ? <p>{lastAudioToolResult.translated_text}</p> : null}
                </article>
              ) : null}
            </section>
          </div>
          </>
          ) : null}
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
