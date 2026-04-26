import type { AudioAsset, AudioToolJob, GenerationRecord, ModelInfo } from "./types";

export type TabKey =
  | "home"
  | "voices"
  | "gallery"
  | "tts"
  | "clone"
  | "design"
  | "projects"
  | "effects"
  | "changer"
  | "separation"
  | "dataset"
  | "training"
  | "voicebox_fusion";
export type AudioEffectsView = "explore" | "history";
export type GenerationModeKey = "custom" | "design" | "clone";
export type CharacterBuilderSource = "design" | "upload";
export type FineTuneMode = "base" | "custom_voice" | "voicebox";

export type GenerationControlsForm = {
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

export const PRODUCT_PAGES = {
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
  gallery: {
    label: "생성 갤러리",
    title: "생성 갤러리",
    description: "생성된 오디오 결과를 모아 듣고 내려받습니다.",
  },
  tts: {
    label: "텍스트 음성 변환",
    title: "텍스트 음성 변환",
    description: "짧은 확인과 모델 선택형 텍스트 음성 변환을 함께 다룹니다.",
  },
  clone: {
    label: "목소리 복제",
    title: "새로운 목소리 만들기",
    description: "참조 음성에서 스타일을 추출하고 저장합니다.",
  },
  design: {
    label: "목소리 설계",
    title: "목소리 설계",
    description: "설명문으로 새 목소리 방향을 설계합니다.",
  },
  effects: {
    label: "사운드 효과",
    title: "사운드 효과",
    description: "영문 프롬프트로 효과음을 생성합니다.",
  },
  changer: {
    label: "보이스 체인저",
    title: "보이스 체인저",
    description: "Applio/RVC로 기존 음성의 음색을 바꿉니다.",
  },
  separation: {
    label: "오디오 분리",
    title: "오디오 분리",
    description: "업로드한 오디오를 트랙 단위로 분리합니다.",
  },
  projects: {
    label: "프리셋 기반 생성",
    title: "프리셋 기반 생성",
    description: "저장한 목소리 스타일에 새 말투를 더해 결과를 만듭니다.",
  },
  dataset: {
    label: "데이터셋 만들기",
    title: "데이터셋 만들기",
    description: "학습용 샘플과 기준 음성을 정리합니다.",
  },
  training: {
    label: "학습 실행",
    title: "학습 실행",
    description: "준비된 데이터셋으로 실제 학습을 실행합니다.",
  },
  voicebox_fusion: {
    label: "VoiceBox 융합",
    title: "VoiceBox 융합",
    description: "CustomVoice 결과와 Base encoder를 합쳐 독립 모델로 만듭니다.",
  },
} as const;

export const CUSTOM_RECIPES = [
  {
    label: "Broadcast",
    text: "오늘 회의는 여기서 정리하겠습니다. 각자 할 일을 다시 확인해 주세요.",
    instruction: "Calm, clear, and steady. Read it like a polished studio narration.",
    language: "Korean",
  },
  {
    label: "Warm",
    text: "오늘은 정말 힘들었지. 그래도 여기까지 온 것만으로도 충분해.",
    instruction: "Warm, gentle, and reassuring. Speak like you are comforting someone at close distance.",
    language: "Korean",
  },
  {
    label: "Cold",
    text: "이제 변명은 그만해. 남은 건 결과로 보여주는 것뿐이야.",
    instruction: "Cold, firm, and restrained. Keep the emotion suppressed and press the line forward.",
    language: "Korean",
  },
] as const;

export const DESIGN_RECIPES = [
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

export const HYBRID_RECIPES = [
  {
    label: "Furious",
    instruction: "On the verge of exploding. Sharp, rough, and clipped, with hard sentence endings.",
  },
  {
    label: "Shaken",
    instruction: "Shaken by fear and anger at the same time. Add unstable breathing and a trembling tone.",
  },
  {
    label: "Cold",
    instruction: "Emotionally suppressed, cold, and firm. Deliver it like controlled pressure.",
  },
] as const;

export const VOICEBOX_STEPS = [
  {
    title: "목소리 학습",
    description: "데이터셋의 음색을 모델에 먼저 익힙니다.",
  },
  {
    title: "독립 모델 만들기",
    description: "복제에 필요한 기준 정보를 모델 안에 함께 담습니다.",
  },
  {
    title: "추가 학습",
    description: "완성된 모델 하나만으로 학습을 이어갈 수 있게 확인합니다.",
  },
  {
    title: "품질 확인",
    description: "목소리 유사도, 자연스러움, 말투 지시 반영을 비교합니다.",
  },
] as const;

export const VOICEBOX_ACTIONS = [
  { label: "데이터셋 만들기", tab: "dataset" },
  { label: "학습 실행", tab: "training" },
  { label: "VoiceBox 융합", tab: "voicebox_fusion" },
  { label: "목소리 복제", tab: "clone" },
  { label: "프리셋 기반 생성", tab: "projects" },
] as const satisfies ReadonlyArray<{ label: string; tab: TabKey }>;

export const SOUND_EFFECT_LIBRARY = [
  { id: "river", title: "강물", subtitle: "넓게 흐르는 물소리와 가까운 물 튐", duration: "0:30", profile: "mmaudio", prompt: "Wide river flow, nearby splashes, calm current, natural stereo ambience, seamless tail, no music, no speech" },
  { id: "thunder", title: "천둥", subtitle: "가까운 번개와 낮게 울리는 잔향", duration: "0:18", profile: "mmaudio", prompt: "Close thunder strike, deep low rumble, humid air resonance, distant rain bed, cinematic natural decay, no music" },
  { id: "gunshot", title: "총성", subtitle: "짧고 날카로운 근거리 충격음", duration: "0:02", profile: "mmaudio", prompt: "Short close-range gunshot, sharp transient, dry impact, quick room slapback, no voices, no music" },
  { id: "explosion", title: "폭발", subtitle: "유리 파편이 섞인 무거운 폭발음", duration: "0:04", profile: "mmaudio", prompt: "Heavy explosion with glass debris, dense low-end impact, fast pressure wave, falling fragments, cinematic tail" },
  { id: "rain", title: "폭우", subtitle: "차갑고 촘촘한 빗줄기가 길게 쏟아짐", duration: "0:30", profile: "mmaudio", prompt: "Heavy cold rain on metal roof, dense rainfall texture, low wind, distant thunder bed, loopable ambience, no speech" },
  { id: "applause", title: "박수", subtitle: "밝은 실내에서 터지는 환호와 박수", duration: "0:09", profile: "mmaudio", prompt: "Indoor applause, short cheers, bright room reflections, natural crowd spacing, clean ending, no music" },
  { id: "wind", title: "강풍", subtitle: "낮게 울리는 거센 바람과 진동", duration: "0:30", profile: "mmaudio", prompt: "Violent storm wind, low air rumble, window vibration, distant debris movement, wide stereo field, no speech" },
  { id: "running", title: "달리는 발소리", subtitle: "마른 바닥을 빠르게 치는 일정한 발걸음", duration: "0:30", profile: "mmaudio", prompt: "Fast running footsteps on dry wooden floor, steady rhythm, cloth rustle, close foley detail, no speech, no music" },
  { id: "adult-room", title: "밀실 분위기", subtitle: "가까운 숨, 천 움직임, 낮은 실내 잔향", duration: "0:12", profile: "mmaudio_nsfw", prompt: "Adults-only intimate room ambience, close breath texture, soft sheet rustle, warm low room tone, subtle movement, no spoken words, no music" },
  { id: "silk-bed", title: "침구 마찰음", subtitle: "부드러운 침구 마찰과 가까운 움직임", duration: "0:10", profile: "mmaudio_nsfw", prompt: "Adults-only silk bedding foley, close fabric friction, gentle mattress creak, warm quiet bedroom ambience, detailed soft transients, no speech" },
  { id: "latex", title: "라텍스 클로즈업", subtitle: "마찰감 있는 소재 움직임과 가까운 공간감", duration: "0:08", profile: "mmaudio_nsfw", prompt: "Adults-only latex clothing movement, close microphone texture, elastic creaks, subtle skin friction, cinematic room ambience, no words" },
  { id: "breathy-room", title: "숨소리 긴장감", subtitle: "숨이 강조된 긴장감 있는 근접 분위기", duration: "0:10", profile: "mmaudio_nsfw", prompt: "Adults-only breathy close-up ambience, tense intimate silence, soft fabric rustle, subtle body movement, controlled dynamics, no dialogue" },
  { id: "shower-room", title: "스팀 샤워룸", subtitle: "습한 공간감과 물방울, 가까운 숨결", duration: "0:12", profile: "mmaudio_nsfw", prompt: "Adults-only steamy shower room ambience, water droplets on tile, close breath texture, wet skin movement, soft reverb, no speech, no music" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "Auto", label: "자동 감지" },
  { value: "Korean", label: "한국어" },
  { value: "English", label: "영어" },
  { value: "Japanese", label: "일본어" },
  { value: "Chinese", label: "중국어" },
  { value: "Cantonese", label: "광동어" },
] as const;

export function createEmptyDatasetSample() {
  return { audio_path: "", text: "", original_filename: "" };
}

export function normalizeDatasetPath(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

export function parseDatasetSampleBulkInput(value: string): Array<{ audio_path: string; text?: string; original_filename: string }> {
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

export function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export function basenameFromPath(value: string): string {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || value;
}

function metaString(record: GenerationRecord, key: string): string {
  const value = record.meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function looksInternalLabel(value: string): boolean {
  return /^(embedded_encoder|checkpoint|epoch-|gen_|audio_|clone_|upload_|202\d{5}|mai_ko_|voicebox17b)/i.test(value.trim());
}

export function getAudioDownloadName(record: GenerationRecord): string {
  const displayName = metaString(record, "display_name");
  if (displayName) {
    const sourceName = basenameFromPath(record.output_audio_path || record.output_audio_url);
    const extension = sourceName.includes(".") ? sourceName.split(".").pop() || "wav" : "wav";
    const safeName = displayName
      .replace(/[^\w\s가-힣-]+/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeName || displayName}.${extension}`;
  }

  const sourceName = basenameFromPath(record.output_audio_path || record.output_audio_url);
  const hasExtension = /\.[a-z0-9]+$/i.test(sourceName);
  const looksOpaque = /^(audio|gen|sfx|voicechanger|convert|harmonic|percussive)_[a-f0-9]{8,}/i.test(sourceName);
  if (hasExtension && !looksOpaque && !looksInternalLabel(sourceName)) {
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

export function getDatasetSourceLabel(value: string): string {
  if (value === "voice_design_batch") return "Voice Design 샘플 묶음";
  if (value === "uploaded_audio_batch") return "직접 업로드한 음성 묶음";
  return value;
}

export function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    custom_voice: "텍스트 음성 변환",
    voice_design: "목소리 설계",
    story_studio: "이전 장문 생성",
    voice_clone: "목소리 복제",
    hybrid_clone_instruct: "프리셋+말투",
    voicebox_clone: "VoiceBox 복제",
    voicebox_clone_instruct: "VoiceBox 지시 생성",
    sound_effect: "사운드 효과",
    voice_changer: "보이스 체인저",
    audio_converter: "오디오 변환",
    audio_separation: "오디오 분리",
    audio_translation: "전사/번역",
  };
  return labels[mode] || mode;
}

export function getModelDisplayLabel(model: ModelInfo): string {
  const cleanLabel = model.label
    .replace(/^(보이스박스|학습된)\s+/g, "")
    .replace(/^(VoiceBox|Fine-tuned)\s+/gi, "")
    .trim();
  if (model.source === "stock") {
    return cleanLabel;
  }
  const checkpoint = cleanLabel.includes("/") ? cleanLabel.split("/").pop()?.trim() || cleanLabel : cleanLabel;
  return checkpoint;
}

export function getAudioToolJobLabel(kind: string): string {
  const labels: Record<string, string> = {
    sound_effect: "사운드 효과",
    voice_changer: "보이스 체인저",
    audio_converter: "오디오 변환",
    audio_separation: "오디오 분리",
    audio_translation: "전사/번역",
  };
  return labels[kind] || kind;
}

export function getPresetSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    generated_sample: "생성 음성에서 저장",
    uploaded_reference: "참조 음성에서 저장",
    design_sample: "디자인 샘플에서 저장",
    upload_clone_prompt: "업로드 음성에서 저장",
  };
  return labels[sourceType] || "저장된 스타일";
}

export function getRecordDisplayTitle(record: GenerationRecord): string {
  const displayName = metaString(record, "display_name");
  if (displayName) {
    return displayName.length > 40 ? `${displayName.slice(0, 40)}…` : displayName;
  }

  const text = record.input_text?.trim();
  if (text && !looksInternalLabel(text)) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.length > 34 ? `${cleaned.slice(0, 34)}…` : cleaned;
  }
  return getModeLabel(record.mode);
}

export function getAudioToolJobDisplayTitle(job: AudioToolJob): string {
  if (job.kind === "sound_effect") return "사운드 효과";
  if (job.kind === "voice_changer") return "보이스 체인저";
  if (job.kind === "audio_converter") return "오디오 변환";
  if (job.kind === "audio_separation") return "오디오 분리";
  if (job.kind === "audio_translation") return "전사와 재합성";
  return getAudioToolJobLabel(job.kind);
}

export function normalizeLanguageValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "auto") return "Auto";
  if (normalized === "korean" || normalized === "ko" || normalized === "한국어") return "Korean";
  if (normalized === "english" || normalized === "en" || normalized === "영어") return "English";
  if (normalized === "japanese" || normalized === "ja" || normalized === "일본어") return "Japanese";
  if (normalized === "chinese" || normalized === "zh" || normalized === "중국어") return "Chinese";
  if (normalized === "cantonese" || normalized === "yue" || normalized === "광동어") return "Cantonese";
  return value;
}

export function LanguageSelect({
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

export function TargetLanguageSelect({
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

export function fileUrlFromPath(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("data/") ? `/files/${normalized.slice(5)}` : `/files/${normalized}`;
}

export function createGenerationControls(mode: GenerationModeKey): GenerationControlsForm {
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

export function serializeGenerationControls(value: GenerationControlsForm): Record<string, unknown> {
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

export function GenerationControlsEditor({
  value,
  onChange,
}: {
  value: GenerationControlsForm;
  onChange: (next: GenerationControlsForm) => void;
}) {
  return (
    <div className="advanced-controls">
      <div className="advanced-controls__grid">
        <label>
          Seed
          <input value={value.seed} onChange={(event) => onChange({ ...value, seed: event.target.value })} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={value.non_streaming_mode} onChange={(event) => onChange({ ...value, non_streaming_mode: event.target.checked })} />
          Non-streaming mode
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={value.do_sample} onChange={(event) => onChange({ ...value, do_sample: event.target.checked })} />
          Sampling
        </label>
        <label>
          Top K
          <input value={value.top_k} onChange={(event) => onChange({ ...value, top_k: event.target.value })} />
        </label>
        <label>
          Top P
          <input value={value.top_p} onChange={(event) => onChange({ ...value, top_p: event.target.value })} />
        </label>
        <label>
          Temperature
          <input value={value.temperature} onChange={(event) => onChange({ ...value, temperature: event.target.value })} />
        </label>
        <label>
          Repetition penalty
          <input value={value.repetition_penalty} onChange={(event) => onChange({ ...value, repetition_penalty: event.target.value })} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={value.subtalker_dosample} onChange={(event) => onChange({ ...value, subtalker_dosample: event.target.checked })} />
          Subtalker sampling
        </label>
        <label>
          Subtalker Top K
          <input value={value.subtalker_top_k} onChange={(event) => onChange({ ...value, subtalker_top_k: event.target.value })} />
        </label>
        <label>
          Subtalker Top P
          <input value={value.subtalker_top_p} onChange={(event) => onChange({ ...value, subtalker_top_p: event.target.value })} />
        </label>
        <label>
          Subtalker temperature
          <input value={value.subtalker_temperature} onChange={(event) => onChange({ ...value, subtalker_temperature: event.target.value })} />
        </label>
        <label>
          Max new tokens
          <input value={value.max_new_tokens} onChange={(event) => onChange({ ...value, max_new_tokens: event.target.value })} />
        </label>
      </div>
      <label>
        Extra generate kwargs
        <textarea className="json-textarea" value={value.extra_generate_kwargs} onChange={(event) => onChange({ ...value, extra_generate_kwargs: event.target.value })} />
      </label>
    </div>
  );
}

export function AudioCard({
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

export function ServerAudioPicker({
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

export function RecipeBar({
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

export function HeroMetric({
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

export function SpotlightCard({
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

export function PageHeader({
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

export function MiniWaveform({ dense = false }: { dense?: boolean }) {
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
