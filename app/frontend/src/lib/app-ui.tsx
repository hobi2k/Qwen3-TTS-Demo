import type { AudioAsset, AudioToolJob, GenerationRecord, ModelInfo } from "./types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "./i18n";

export type TabKey =
  | "home"
  | "voices"
  | "gallery"
  | "tts"
  | "clone"
  | "design"
  | "projects"
  | "effects"
  | "audio_editor"
  | "audio_denoise"
  | "applio_train"
  | "applio_convert"
  | "applio_batch"
  | "applio_blend"
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
  | "separation"
  | "dataset"
  | "training"
  | "voicebox_fusion"
  | "s2pro_tagged"
  | "s2pro_clone"
  | "s2pro_multi_speaker"
  | "s2pro_multilingual"
  | "guide";
export type AudioEffectsView = "explore" | "history";
export type GenerationModeKey = "custom" | "design" | "clone";
export type CharacterBuilderSource = "design" | "upload";
export type FineTuneMode = "base" | "custom_voice" | "voicebox";
export type S2ProMode = "tagged" | "clone" | "multi_speaker" | "multilingual";

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
  audio_editor: {
    label: "오디오 편집",
    title: "오디오 편집",
    description: "생성/업로드/경로 오디오를 잘라내고 페이드, 볼륨, 정규화를 적용합니다.",
  },
  audio_denoise: {
    label: "음성 정제",
    title: "음성 정제",
    description: "배경 노이즈, 저역 럼블, 고역 히스를 줄여 목소리를 더 또렷하게 만듭니다.",
  },
  applio_train: {
    label: "RVC 모델 학습",
    title: "Applio 모델 학습",
    description: "목표 목소리 데이터로 RVC/Applio voice model을 만듭니다.",
  },
  applio_convert: {
    label: "단일 변환",
    title: "Applio 단일 변환",
    description: "업로드 또는 생성 갤러리 음성 하나를 RVC 모델로 변환합니다.",
  },
  applio_batch: {
    label: "배치 변환",
    title: "Applio 배치 변환",
    description: "여러 음성을 같은 RVC 모델로 일괄 변환합니다.",
  },
  applio_blend: {
    label: "모델 블렌딩",
    title: "Applio 모델 블렌딩",
    description: "두 RVC 모델을 비율로 섞어 새로운 목소리 모델을 만듭니다.",
  },
  ace_music: {
    label: "ACE-Step 작곡",
    title: "ACE-Step 작곡",
    description: "장르 태그와 가사 구조로 완성형 음악을 생성합니다.",
  },
  ace_cover: {
    label: "커버",
    title: "ACE-Step 커버",
    description: "원곡의 구조를 유지하면서 다른 스타일로 다시 만듭니다.",
  },
  ace_repaint: {
    label: "구간 수정",
    title: "ACE-Step 구간 수정",
    description: "오디오의 특정 구간만 새 프롬프트로 다시 그립니다.",
  },
  ace_extend: {
    label: "이어붙이기",
    title: "ACE-Step 이어붙이기",
    description: "기존 트랙 뒤를 자연스럽게 이어 생성합니다.",
  },
  ace_extract: {
    label: "스템 추출",
    title: "ACE-Step 스템 추출",
    description: "원곡에서 보컬, 드럼, 베이스 같은 단일 트랙을 분리합니다.",
  },
  ace_lego: {
    label: "트랙 추가",
    title: "ACE-Step 트랙 추가",
    description: "기존 오디오 위에 새 악기나 보컬 트랙을 추가합니다.",
  },
  ace_complete: {
    label: "트랙 채우기",
    title: "ACE-Step 트랙 채우기",
    description: "누락된 여러 트랙을 한 번에 보완합니다.",
  },
  ace_understand: {
    label: "오디오 분석",
    title: "ACE-Step 오디오 분석",
    description: "BPM, 키, 캡션, 가사 같은 음악 메타 정보를 추정합니다.",
  },
  ace_create_sample: {
    label: "아이디어 만들기",
    title: "ACE-Step 아이디어 만들기",
    description: "짧은 자연어 아이디어를 작곡용 캡션과 가사 초안으로 펼칩니다.",
  },
  ace_format_sample: {
    label: "프롬프트 정리",
    title: "ACE-Step 프롬프트 정리",
    description: "작성한 스타일 설명과 가사를 모델이 읽기 좋은 작곡 입력으로 다듬습니다.",
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
  s2pro_tagged: {
    label: "텍스트 음성 변환",
    title: "S2-Pro 텍스트 음성 변환",
    description: "저장한 목소리나 참조 음성으로 대사를 만들고, bracket 태그로 감정과 호흡을 구간별로 조절합니다.",
  },
  s2pro_clone: {
    label: "목소리 저장",
    title: "S2-Pro 목소리 저장",
    description: "참조 음성을 reusable voice로 저장해 S2-Pro와 Qwen 작업에서 계속 사용합니다.",
  },
  s2pro_multi_speaker: {
    label: "대화 생성",
    title: "S2-Pro 대화 생성",
    description: "저장한 목소리와 speaker tag를 사용해 여러 화자가 있는 대사를 만듭니다.",
  },
  s2pro_multilingual: {
    label: "다국어 TTS",
    title: "S2-Pro 다국어 TTS",
    description: "저장한 목소리의 톤을 유지하면서 여러 언어의 문장을 생성합니다.",
  },
  guide: {
    label: "가이드",
    title: "가이드",
    description: "이 프로그램의 탭별 사용법과 작업 순서를 한곳에서 확인합니다.",
  },
} as const;

export const S2_PRO_MODES = [
  {
    id: "tagged",
    label: "Voice TTS",
    title: "저장 목소리로 대사 만들기",
    description: "저장한 목소리 또는 참조 음성으로 대사를 읽히고, 필요할 때만 [laugh], [whispers] 같은 표현 태그를 넣습니다.",
  },
  {
    id: "clone",
    label: "Save Voice",
    title: "목소리 저장",
    description: "참조 음성을 S2-Pro voice asset으로 저장해 이후 TTS, 대화 생성, 다국어 생성에서 계속 사용합니다.",
  },
  {
    id: "multi_speaker",
    label: "Dialogue",
    title: "대화 생성",
    description: "<|speaker:0|>, <|speaker:1|> 같은 화자 태그로 대화 흐름을 나눕니다.",
  },
  {
    id: "multilingual",
    label: "Multilingual TTS",
    title: "다국어 TTS",
    description: "한국어, 영어, 일본어, 중국어 등 여러 언어를 한 작업 안에서 다룹니다.",
  },
] as const satisfies ReadonlyArray<{ id: S2ProMode; label: string; title: string; description: string }>;

export const S2_PRO_TAG_CATEGORIES = [
  {
    label: "Emotion",
    tags: [
      "[happy]",
      "[super happy]",
      "[sad]",
      "[angry]",
      "[furious]",
      "[excited]",
      "[nervous]",
      "[calm]",
      "[serious]",
      "[satisfied]",
      "[delighted]",
      "[scared]",
      "[worried]",
      "[upset]",
      "[frustrated]",
      "[depressed]",
      "[empathetic]",
      "[disgusted]",
      "[moved]",
      "[proud]",
      "[relaxed]",
      "[grateful]",
      "[curious]",
      "[sarcastic]",
      "[fearful]",
      "[confident]",
      "[tired]",
      "[crying]",
      "[amused]",
      "[disappointed]",
      "[surprised]",
      "[relieved]",
      "[embarrassed]",
      "[playful]",
      "[melancholic]",
      "[cold]",
      "[shaken]",
      "[disdainful]",
      "[unhappy]",
      "[anxious]",
      "[hysterical]",
      "[indifferent]",
      "[uncertain]",
      "[doubtful]",
      "[confused]",
      "[regretful]",
      "[guilty]",
      "[ashamed]",
      "[jealous]",
      "[envious]",
      "[hopeful]",
      "[optimistic]",
      "[pessimistic]",
      "[nostalgic]",
      "[lonely]",
      "[bored]",
      "[contemptuous]",
      "[sympathetic]",
      "[compassionate]",
      "[determined]",
      "[resigned]",
      "[shocked]",
    ],
  },
  {
    label: "Vocal action",
    tags: [
      "[laugh]",
      "[laughing]",
      "[chuckle]",
      "[giggle]",
      "[sigh]",
      "[breath]",
      "[breathy]",
      "[inhale]",
      "[exhale]",
      "[gasp]",
      "[gasping]",
      "[sob]",
      "[sobbing]",
      "[crying loudly]",
      "[whisper]",
      "[whispers]",
      "[whispering]",
      "[murmur]",
      "[shout]",
      "[shouting]",
      "[yell]",
      "[scream]",
      "[screaming]",
      "[cough]",
      "[clears throat]",
      "[clearing throat]",
      "[moan]",
      "[moaning]",
      "[groaning]",
      "[panting]",
      "[yawning]",
      "[snoring]",
      "[tsk]",
      "[singing]",
      "[interrupting]",
      "[audience laughter]",
      "[audience laughing]",
      "[background laughter]",
      "[crowd laughing]",
      "[pause]",
      "[short pause]",
      "[long pause]",
      "[break]",
      "[long-break]",
      "[emphasis]",
    ],
  },
  {
    label: "Performance",
    tags: [
      "[professional broadcast tone]",
      "[news anchor]",
      "[narration]",
      "[storytelling]",
      "[documentary]",
      "[radio host]",
      "[ASMR]",
      "[soft spoken]",
      "[soft tone]",
      "[dramatic]",
      "[romantic]",
      "[villain]",
      "[heroine]",
      "[late night]",
      "[in a hurry tone]",
      "[fast]",
      "[slow]",
      "[low voice]",
      "[loud]",
      "[volume up]",
      "[volume down]",
      "[low volume]",
      "[pitch up]",
      "[with strong accent]",
      "[echo]",
      "[high pitch]",
      "[telephone]",
      "[robotic]",
      "[laughing tone]",
      "[excited tone]",
    ],
  },
  {
    label: "Language cue",
    tags: ["[Korean]", "[English]", "[Japanese]", "[Chinese]", "[Cantonese]", "[American English]", "[Seoul dialect]"],
  },
] as const;

export const S2_PRO_TAGS = S2_PRO_TAG_CATEGORIES.flatMap((category) =>
  category.tags.map((tag) => ({ label: tag, prompt: tag, category: category.label })),
);

export const S2_PRO_FEATURES = [
  "Saved voice TTS",
  "Reusable voice assets",
  "Inline expression tags",
  "Dialogue scripts",
  "Multilingual voices",
  "Local or API runtime",
] as const;

export type GuidePromptExample = {
  label: string;
  example: string;
  note?: string;
};

export type GuideTagEntry = {
  tag: string;
  meaning: string;
};

export type GuideControlEntry = {
  name: string;
  defaultValue?: string;
  range?: string;
  effect: string;
};

export type GuideSection = {
  title: string;
  summary: string;
  body?: string[];
  steps?: string[];
  tips?: string[];
  prompts?: GuidePromptExample[];
  tags?: GuideTagEntry[];
  controls?: GuideControlEntry[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "프롬프트 작성 (Voice Design)",
    summary: "목소리 설계의 instruction 필드는 자연어 프롬프트입니다. 잘 쓰면 그대로 캐릭터가 만들어지고, 못 쓰면 모델이 흐릿한 평균값으로 갑니다.",
    body: [
      "Qwen3-TTS의 Voice Design은 instruct 텍스트를 음성 디자인 신호로 해석합니다. 공식 가이드는 \"5가지 원칙\"을 제안합니다 — 구체적으로(deep, crisp, fast-paced 같은 물리 기술어, '좋은 목소리' 같은 추상어 X), 다차원적으로(성별·나이·감정·발성·속도·톤을 동시에 명시), 객관적으로(감상이 아니라 음향 특성), 독창적으로(특정 인물 흉내 X), 그리고 길이는 1~3문장(15~40단어)이 sweet spot.",
      "instruct는 영어 또는 중국어로 적으면 모델이 안정적으로 해석합니다. 출력 언어와 별개입니다 — 영어 설명문으로 일본어 음성을 만들 수 있습니다. 한국어로 적어도 어느 정도 인식되지만 영문이 가장 신뢰도 높습니다.",
      "주의: 모순되는 속성을 같이 적으면 결과가 무너집니다. 'high-pitched deep bass' 같은 충돌 기술은 피하세요.",
    ],
    prompts: [
      {
        label: "차분한 중년 남성 (방송 톤)",
        example:
          "A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, suitable for news broadcasting or documentary commentary.",
      },
      {
        label: "젊은 여성 (시네마틱 / 자신감)",
        example:
          "Young Korean woman, cinematic and confident. Clear articulation, bright upper tone, slight emotional swell at the end of each sentence.",
      },
      {
        label: "심야 라디오 호스트",
        example:
          "Late-night Korean female radio host. Intimate and low-key, breathy but controlled, speaking very close to the microphone with slow, warm pacing.",
      },
      {
        label: "냉정한 빌런",
        example:
          "Korean woman with poised menace. Calm surface, cold authority, sharp consonants, restrained but dangerous energy. Avoid overt aggression — keep it pressurized.",
      },
      {
        label: "활기찬 청년 남성",
        example:
          "Energetic young male voice in his early twenties, bright and forward, with quick rhythmic delivery and a playful upward inflection at sentence ends.",
        note: "쉬운 잘못: 'happy voice' 만 쓰지 마세요. 음역대(bright/forward), 속도(quick), 운율(playful upward inflection)을 같이 명시해야 모델이 잡아냅니다.",
      },
    ],
    tips: [
      "한 문장 = 한 차원으로 쓰면 정리가 쉽습니다. 첫 문장: 누구(성별·나이·국적). 둘째: 음향 특성(피치·질감·속도). 셋째: 발화 스타일(억양·감정 톤).",
      "원하는 결과가 안 나오면 프롬프트를 더 길게 쓰지 말고 더 구체적으로 바꾸세요. \"a bit warmer\" → \"warmer mid-range, with slight breathiness on long vowels\".",
      "결과가 마음에 들면 곧장 \"S2-Pro 프리셋 저장\" 또는 Qwen 프리셋 저장으로 보존하세요. seed가 다르면 같은 프롬프트로도 다른 결과가 나옵니다.",
    ],
  },
  {
    title: "프롬프트 작성 (Inline Style Instruction)",
    summary: "텍스트 음성 변환과 프리셋 기반 생성에서 화자/프리셋과 함께 쓰는 짧은 말투 지시문입니다. 프레임이 다릅니다 — 목소리 자체가 아니라 \"이번 한 줄을 어떻게 읽을지\"를 적습니다.",
    body: [
      "instruct가 영어로 들어가면 안정적이지만, S2-Pro의 inline 스타일은 자연어 그대로 가능합니다. 핵심은 '연기 지시'를 적는 것 — 감독이 성우에게 주는 한 줄 디렉션처럼 씁니다.",
      "Qwen의 instruct 필드는 화자(또는 참조 음성)의 음색은 보존한 채, 이번 발화의 톤·속도·감정만 바꿉니다. 그래서 길게 쓰면 오히려 흐려집니다. 1문장, 핵심 형용사 2~4개 권장.",
    ],
    prompts: [
      {
        label: "차분/방송",
        example: "Calm, clear, and steady. Read it like a polished studio narration.",
      },
      {
        label: "따뜻한 위로",
        example: "Warm, gentle, and reassuring. Speak like you are comforting someone at close distance.",
      },
      {
        label: "냉정한 압박",
        example: "Cold, firm, and restrained. Keep the emotion suppressed and press the line forward.",
      },
      {
        label: "분노 직전",
        example: "On the verge of exploding. Sharp, rough, and clipped, with hard sentence endings.",
      },
      {
        label: "두려움 + 분노",
        example: "Shaken by fear and anger at the same time. Add unstable breathing and a trembling tone.",
      },
      {
        label: "비밀 / 속삭임",
        example: "Hushed, intimate, almost whispered. Slow tempo, breathy onset, no projection.",
      },
    ],
    tips: [
      "instruct는 \"무엇\"이 아니라 \"어떻게\"를 적습니다. \"오늘은 정말 힘들었어\"는 Text에. \"피곤하고 절제된, 약간 건조하게\"는 instruct에.",
      "감정 단어 하나로는 약합니다. \"sad\" 보다 \"sad, with tightened throat and slow tempo\". 신체 감각을 동반한 묘사가 잘 먹습니다.",
      "Voice Design용 프롬프트(목소리 자체를 만드는 긴 묘사)와 inline instruct(이번 한 줄 연기 지시)는 절대 섞지 마세요. 둘은 다른 역할입니다.",
    ],
  },
  {
    title: "S2-Pro 태그 레퍼런스",
    summary: "Fish Speech S2-Pro는 텍스트 안에 [bracket] 태그를 넣어 단어 단위로 표현을 제어합니다. 정해진 목록 + 자유 텍스트 모두 가능 (15,000+ 학습된 태그).",
    body: [
      "태그는 대사 중간에 그대로 끼워 넣습니다. 예: `오늘은 [sigh] 그냥 집에 갈래. [whisper] 너만 알고 있어.` 모델이 태그 위치 직후의 단어/구절에 해당 표현을 적용합니다.",
      "정의된 카테고리 외에 [whisper in small voice], [professional broadcast tone], [pitch up] 같은 자유 기술도 학습된 임베딩에 매핑됩니다 — 영어로 명확하게 적으면 대부분 작동합니다.",
      "주의: 태그 남발하면 결과가 깨집니다. 한 문장에 1~2개가 적절. Voice Design처럼 태그를 \"감독 디렉션\"이라 생각하세요.",
    ],
    tags: [
      { tag: "[pause]", meaning: "긴 정지" },
      { tag: "[short pause]", meaning: "짧은 정지" },
      { tag: "[laughing]", meaning: "웃음 (소리 내어)" },
      { tag: "[chuckle]", meaning: "낄낄, 짧은 웃음" },
      { tag: "[laughing tone]", meaning: "웃음기 섞인 어조 (소리 X, 톤만)" },
      { tag: "[sigh]", meaning: "한숨" },
      { tag: "[inhale]", meaning: "들숨 (긴장/주저)" },
      { tag: "[exhale]", meaning: "날숨" },
      { tag: "[panting]", meaning: "헐떡임" },
      { tag: "[clearing throat]", meaning: "목 가다듬기" },
      { tag: "[tsk]", meaning: "혀 차기" },
      { tag: "[whisper]", meaning: "속삭임" },
      { tag: "[low voice]", meaning: "낮은 목소리" },
      { tag: "[shouting]", meaning: "외침" },
      { tag: "[screaming]", meaning: "비명" },
      { tag: "[loud]", meaning: "큰 소리" },
      { tag: "[volume up]", meaning: "볼륨 상승" },
      { tag: "[volume down]", meaning: "볼륨 감소" },
      { tag: "[low volume]", meaning: "낮은 볼륨" },
      { tag: "[emphasis]", meaning: "강조" },
      { tag: "[interrupting]", meaning: "끊어 들어감" },
      { tag: "[echo]", meaning: "에코 효과" },
      { tag: "[singing]", meaning: "노래 (음정 흐름)" },
      { tag: "[excited]", meaning: "흥분" },
      { tag: "[excited tone]", meaning: "흥분된 어조" },
      { tag: "[angry]", meaning: "분노" },
      { tag: "[sad]", meaning: "슬픔" },
      { tag: "[surprised]", meaning: "놀람" },
      { tag: "[shocked]", meaning: "충격" },
      { tag: "[delight]", meaning: "기쁨" },
      { tag: "[moaning]", meaning: "신음" },
      { tag: "[audience laughter]", meaning: "관객 웃음 (배경)" },
      { tag: "[with strong accent]", meaning: "강한 억양" },
    ],
    tips: [
      "전환 효과: 같은 문장 안에서 톤이 바뀔 때, 정확한 위치에 태그를 박으세요. \"네… [pause] 그래, 알았어.\"",
      "다중 화자: `<|speaker:0|>`, `<|speaker:1|>`로 화자 전환. 태그는 각 화자 발화 안에 따로 넣습니다.",
      "효과음 태그(echo, audience laughter)는 결과 길이를 늘립니다. 짧은 데모용 합성에서는 피하세요.",
    ],
  },
  {
    title: "Advanced controls (Sampling)",
    summary: "Qwen3-TTS와 S2-Pro는 LLM 기반이라 텍스트 생성과 동일한 sampling 파라미터로 음성 토큰을 추출합니다. 잘못 만지면 더듬거리거나 단조로워집니다.",
    body: [
      "Sampling 토글이 OFF면 greedy(가장 확률 높은 토큰)만 뽑아 가장 \"안전한\" 결과가 나옵니다. 짧은 정형 문장(뉴스 한 줄)에 좋지만 감정 표현이 평탄해집니다.",
      "ON이면 top_k, top_p, temperature, repetition_penalty가 활성화됩니다. 일반 권장: temperature 0.7~0.9, top_p 0.9, top_k 40~50, repetition_penalty 1.1.",
      "결과가 한 단어를 반복하거나 \"으...으...\" 같은 늪에 빠지면 repetition_penalty를 1.2~1.4로 올리거나 temperature를 +0.1 하세요. 반대로 너무 들쑥날쑥하면 temperature를 0.5로 내리고 top_p를 0.85로 좁히세요.",
    ],
    controls: [
      {
        name: "do_sample (Sampling 토글)",
        defaultValue: "ON",
        effect: "OFF = greedy(평탄, 안정). ON = 확률 분포에서 추출(다양, 표현력 ↑).",
      },
      {
        name: "temperature",
        defaultValue: "0.9",
        range: "0.1 – 1.5",
        effect: "낮음 = 결정적, 단조로움. 높음 = 창의적, 변동 ↑. 0.7 이하면 같은 입력에 거의 같은 결과.",
      },
      {
        name: "top_k",
        defaultValue: "50",
        range: "1 – 100",
        effect: "후보 토큰을 상위 K개로 제한. 낮을수록 보수적. 너무 낮으면 운율이 죽음(같은 곡선만 반복).",
      },
      {
        name: "top_p (nucleus)",
        defaultValue: "1.0",
        range: "0.5 – 1.0",
        effect: "누적 확률이 P 이하인 토큰만 후보. 0.9 = 상위 90% 확률 질량 안에서만 선택. 0.85 이하면 너무 안전, 1.0이면 모든 토큰.",
      },
      {
        name: "repetition_penalty",
        defaultValue: "1.0",
        range: "1.0 – 1.5",
        effect: "1.0 = 페널티 없음. 1.1~1.2가 무난. 너무 올리면 자연스러운 반복(\"네, 네\")까지 깎임.",
      },
      {
        name: "max_new_tokens",
        defaultValue: "(model default)",
        effect: "생성 토큰 상한. 너무 길게 잡으면 모델이 늘어진 결과 생성. 짧은 대사면 1024~2048 권장.",
      },
      {
        name: "seed",
        defaultValue: "(랜덤)",
        effect: "재현용. 같은 seed + 같은 입력 = 같은 결과. 마음에 드는 결과의 seed를 메모해 두면 변형 실험에 유용.",
      },
    ],
    tips: [
      "음성은 텍스트보다 \"안 좋은 후보\"의 비용이 큽니다(잡음, 더듬거림). top_p는 0.9~0.95에서 시작.",
      "감정/연기가 강한 라인은 temperature를 0.85~1.0까지 올려 표현 폭을 줍니다. 뉴스 톤은 0.6~0.7로 내려 안정.",
      "긴 문장이 점점 끊어진다면 repetition_penalty를 먼저 의심. 1.05~1.15 사이 미세 조정으로 대부분 해결.",
    ],
  },
  {
    title: "Advanced controls (Subtalker)",
    summary: "Subtalker는 메인 토큰 흐름과 별개로 보조 운율/스타일 토큰을 다루는 sub-decoder입니다. 같은 sampling 파라미터를 따로 노출합니다.",
    body: [
      "Qwen3-TTS는 메인 토크나이저 외에 \"subtalker\" 흐름을 둬, 음향의 prosodic 변동(억양 굴곡, 호흡, 미세한 timbre 변화)을 별도로 샘플합니다. 메인은 단어/음절 단위, subtalker는 그 위에 얹는 표현 layer라고 보면 됩니다.",
      "기본값은 메인보다 살짝 보수적(top_k=50, top_p=1.0, temperature=0.9). 끄면(subtalker_dosample OFF) 표현 변동이 줄고 더 \"평탄하고 깨끗한\" 결과가 됩니다.",
      "감정 폭이 큰 라인이나 연기 톤에서 표현이 부족하다면 메인 sampling을 만지기 전에 subtalker temperature를 +0.1 올리는 것이 안전한 첫 수입니다. 메인을 흔들면 발음 자체가 깨질 수 있어요.",
    ],
    controls: [
      {
        name: "subtalker_dosample",
        defaultValue: "ON",
        effect: "Subtalker 샘플링 토글. OFF면 보조 운율이 결정적(=평탄). 깨끗한 안내문엔 OFF가 좋을 수도.",
      },
      {
        name: "subtalker_top_k",
        defaultValue: "50",
        effect: "보조 운율 토큰 후보 수. 낮을수록 운율 단조.",
      },
      {
        name: "subtalker_top_p",
        defaultValue: "1.0",
        effect: "보조 운율 nucleus. 0.9 정도로 좁히면 과한 뉘앙스 변동을 줄임.",
      },
      {
        name: "subtalker_temperature",
        defaultValue: "0.9",
        effect: "보조 운율 다양성. +0.1 → 감정 표현 ↑, -0.1 → 차분.",
      },
    ],
    tips: [
      "디버깅 순서: 결과가 단조 → subtalker temperature 먼저. 결과가 와장창 깨짐 → 메인 top_p / repetition_penalty 먼저.",
      "Subtalker를 메인보다 더 흔들면 운율은 풍부해지지만 발음 신뢰도가 떨어집니다. 메인 ≥ subtalker 다양성을 원칙으로 잡으세요.",
    ],
  },
  {
    title: "프리셋 기반 생성",
    summary: "저장된 스타일에 새 대사를 입혀 반복 생성하는 메인 워크플로우. Base 모드, Base + Instruction (hybrid), VoiceBox 3가지 흐름을 같은 화면에서 전환합니다.",
    body: [
      "Base Preset 모드: 저장된 clone prompt만 가지고 Base 모델이 새 대사를 읽습니다. 가장 안정적이고 가벼움. 같은 화자 음색 유지가 최우선일 때 사용.",
      "Base + Instruction (hybrid) 모드: Base 스타일 위에 CustomVoice 지시 모델의 instruct를 얹습니다. 같은 인물이 다양한 감정/톤을 연기해야 할 때 — 한 캐릭터가 차분하게 / 분노로 / 속삭임으로 같은 대사를 다르게 하는 시나리오.",
      "VoiceBox 모드: 융합된 VoiceBox 모델(speaker encoder 포함) 한 개로 프리셋 + 지시를 동시에 처리. CustomVoice 학습 후 VoiceBox 융합을 거친 모델에서 가장 일관성 좋은 결과.",
    ],
    steps: [
      "사이드바 > 프리셋 기반 생성 진입.",
      "상단에서 사용할 프리셋 선택 (없으면 목소리 복제 또는 목소리 설계에서 먼저 만들기).",
      "모드 선택 — 단순 재사용은 Base, 연기 변주는 Base + Instruction, 학습한 모델 활용은 VoiceBox.",
      "Text에 새 대사, 필요하면 Instruction 칸에 말투 지시를 적습니다 (앞 섹션 참고).",
      "Advanced controls는 기본값으로 시작해 결과 보고 조정.",
    ],
    tips: [
      "한 프리셋으로 여러 라인을 만들 때, output_name을 일관된 prefix(예: `mai-`)로 쓰면 갤러리에서 그룹으로 보입니다.",
      "Hybrid 모드의 instruct는 Voice Design처럼 길게 쓰지 마세요 — 한 줄 디렉션 1~2문장.",
    ],
  },
  {
    title: "텍스트 음성 변환",
    summary: "모델·화자·언어를 직접 골라 짧은 대사를 빠르게 검증하는 화면. 프리셋이 없을 때 가장 가볍게 쓰는 도구.",
    steps: [
      "Model 선택 — 0.6B는 빠르고 가볍게, 1.7B는 더 자연스러움.",
      "Speaker 선택 — 9개 기본 화자(중국어 5/영어 2/일본어 1/한국어 1). 화자를 고르면 Language가 자동으로 native에 맞춰집니다.",
      "Language를 native와 다르게 두면 cross-lingual 합성(품질 ↓)이 시도됩니다 — 경고 메시지가 뜹니다.",
      "Style instruction(모델이 지원하는 경우)에 한 줄 말투 지시. 비워도 됩니다.",
      "Advanced controls는 결과를 본 뒤 조정하세요. 처음엔 기본값.",
    ],
    tips: [
      "긴 대사는 잘라서 여러 번 합성하는 게 안정적입니다. 한 번에 500바이트 이상은 권장 X.",
      "같은 라인의 다른 톤이 필요하면 seed만 바꾸세요. 화자/언어 고정 + seed 변동이 가장 자연스러운 변형.",
    ],
  },
  {
    title: "목소리 설계",
    summary: "설명문에서 새 목소리를 디자인합니다. 프롬프트 작성 가이드를 먼저 읽고 들어오세요.",
    steps: [
      "모델 선택 (`Qwen3-TTS-12Hz-1.7B-VoiceDesign`).",
      "파일 이름 — 결과가 갤러리에 어떻게 저장될지 결정.",
      "목소리 설명 — 영어 1~3문장, 다차원적 묘사 (앞 \"Voice Design 프롬프트\" 섹션).",
      "대사(Text) — 실제로 읽어 검증할 짧은 문장. 캐릭터에 맞는 라인.",
      "결과를 듣고 마음에 들면 우측 패널에서 Qwen 또는 S2-Pro 프리셋으로 저장.",
    ],
    tips: [
      "Seed를 바꿔가며 5~10개 변형을 만들고 그 중 한 개를 프리셋으로 저장하는 흐름이 안정적.",
      "결과가 흐릿하면 프롬프트의 \"음향 특성\" 차원이 부족한 경우가 많음. 피치/속도/질감 형용사를 추가하세요.",
    ],
  },
  {
    title: "목소리 복제",
    summary: "참조 음성에서 스타일을 추출해 저장하거나, VoiceBox 모델로 바로 복제합니다.",
    steps: [
      "Step 1: 참조 음성 업로드 + 참조 텍스트(비우면 Whisper 자동 전사).",
      "Step 2: 엔진/모델 선택 — Base는 clone prompt 추출용, VoiceBox는 직접 복제용.",
      "Step 3: Base 엔진이면 Qwen 스타일 또는 S2-Pro 보이스로 저장. VoiceBox면 결과를 데이터셋으로 보낼지 선택.",
    ],
    tips: [
      "참조 음성은 5~15초, 한 화자가 깨끗한 환경에서 또렷하게 읽은 클립이 가장 좋습니다.",
      "여러 톤을 한 클립에 섞지 마세요 — 분리해 각각 따로 추출하는 게 안정적.",
    ],
  },
  {
    title: "S2-Pro 텍스트 음성 변환",
    summary: "저장한 S2-Pro 보이스로 대사를 만들고 [bracket] 태그로 표현을 단어 단위로 제어합니다.",
    steps: [
      "선행 작업: 사이드바 > 보이스 저장에서 참조 음성을 reusable voice로 등록.",
      "Tagged TTS 진입 → 저장 보이스 선택.",
      "Text에 대사. 표현 디테일이 필요한 자리에 `[whisper]`, `[laughing]`, `[sigh]` 같은 태그 삽입.",
      "결과를 들어보며 태그 위치/종류 조정. 태그 1~2개로 시작 → 점진적으로 추가.",
    ],
    tips: [
      "\"S2-Pro 태그 레퍼런스\" 섹션을 참고하세요. 정의된 태그 외에도 자유 텍스트 태그(`[urgent professional tone]` 등)가 작동합니다.",
      "Text를 한국어로 적어도 태그는 영어로. 모델은 태그 텍스트를 영어 임베딩으로 학습.",
    ],
  },
  {
    title: "S2-Pro 다국어 / 대화",
    summary: "한 보이스로 여러 언어 또는 여러 화자 대화를 한 합성에서 다룹니다.",
    body: [
      "다국어: Language 메타는 갤러리 정리용. 실제 언어는 Text가 결정합니다 — 한 문장 안에 여러 언어를 섞을 수 있습니다.",
      "대화: `<|speaker:0|>`, `<|speaker:1|>`로 화자 전환. 각 화자별 reference voice를 사전에 저장해 두는 것이 안정적.",
    ],
    tips: [
      "다국어 합성은 화자의 native 언어가 아닌 언어가 들어가면 액센트가 묻어납니다. 의도된 효과로 사용하거나 화자를 분리하세요.",
    ],
  },
  {
    title: "사운드 효과 (MMAudio)",
    summary: "MMAudio 계열 모델로 효과음을 만듭니다.",
    body: [
      "프롬프트는 영어로. 자연어로 sound scene을 묘사 — \"heavy footsteps on wet pavement, distant thunder, indoor reverb\".",
      "일반 MMAudio와 NSFW 프로필이 분리되어 있습니다.",
    ],
    controls: [
      { name: "duration", effect: "출력 길이(초). 길수록 시간이 비례해서 늘어남." },
      { name: "guidance / CFG", effect: "프롬프트 충실도. 높이면 묘사에 더 매달리지만 자연스러움 ↓." },
      { name: "steps", effect: "추론 스텝 수. 많을수록 정교, 시간 ↑. 25~50 사이가 일반적." },
    ],
  },
  {
    title: "오디오 분리 / Applio",
    summary: "Stem Separator로 보컬·반주 분리, Applio로 RVC 학습/변환/배치/블렌딩.",
    steps: [
      "오디오 분리에서 음원을 보컬/반주로 분리.",
      "분리한 보컬을 Applio 단일 변환 입력으로 사용하거나 RVC 학습 데이터셋으로 활용.",
      "RVC 학습 → 단일/배치 변환 → 필요 시 두 모델을 비율로 블렌딩.",
    ],
    tips: [
      "RVC 학습은 GPU 메모리를 많이 씁니다. 다른 대형 작업과 병행 X.",
      "단일 변환은 빠른 검증용, 배치 변환은 다량 처리용. 블렌딩은 학습 없이 두 음색을 섞는 빠른 방법.",
    ],
  },
  {
    title: "ACE-Step 작곡",
    summary: "태그 + 가사 구조 + 어드밴스드 컨트롤로 완성형 음악 생성.",
    steps: [
      "Tags: 장르·무드·악기·BPM 등을 쉼표로. \"lo-fi hip hop, melancholic, rhodes piano, vinyl crackle, 80 BPM\".",
      "Lyrics: `[verse]`, `[chorus]`, `[bridge]` 같은 구조 태그로 섹션을 나눕니다.",
      "Advanced에서 steps, guidance, seed 조정. CPU offload는 VRAM 부족 시.",
    ],
    tips: [
      "장르/악기는 영어로. 한국어 입력도 받지만 모델이 영어로 학습됨.",
      "구조 태그가 없으면 결과가 흐름 없이 평탄. 짧은 곡이라도 [verse] [chorus] 정도는 명시 권장.",
    ],
  },
  {
    title: "데이터셋 / 학습 / VoiceBox 융합",
    summary: "직접 학습으로 자체 모델을 만드는 흐름. CustomVoice → VoiceBox 융합 → 추가 학습.",
    steps: [
      "데이터셋 만들기: 기준 음성 + 학습 샘플 폴더 정리. 최소 20개, 권장 50개 이상의 다양한 문장.",
      "학습 실행: Base / CustomVoice / VoiceBox 중 선택. 데이터셋 + 초기 모델 지정 후 실행.",
      "VoiceBox 융합: CustomVoice 학습 결과 + Base 1.7B speaker encoder 결합 → 독립 VoiceBox 체크포인트.",
      "검증: 완성 모델로 clone, clone+instruct를 돌려 일관성/품질 확인.",
    ],
    tips: [
      "데이터셋의 문장 다양성이 결과 품질을 좌우합니다. 한 톤만 수십 개보다 여러 톤 + 길이 다양 20~50개가 낫습니다.",
      "학습 중 GPU를 다른 작업과 공유하면 OOM 또는 학습 손상. 단일 작업으로 두세요.",
    ],
  },
  {
    title: "라이브러리 (나의 목소리들 / 갤러리)",
    summary: "저장된 모든 자산을 모아 보고 재사용하는 곳.",
    steps: [
      "나의 목소리들: 훈련한 모델 / Qwen 프리셋 / S2-Pro 프리셋 / RVC 모델 4개 탭.",
      "각 카드에서 이미지 등록(상단 우측 X로 제거), 우측 휴지통으로 삭제(파일까지 같이 지움).",
      "생성 갤러리: 생성된 오디오만 모음. 데이터셋/샘플로 보내거나 다운로드.",
    ],
    tips: [
      "RVC 모델 삭제는 .pth/.index 파일까지 지웁니다 — 되돌릴 수 없으니 백업을 분리해 두세요.",
      "이미지 등록은 카드 식별용 — 캐릭터 일러스트나 음원 cover 같은 걸 붙여두면 라이브러리가 한눈에 들어옵니다.",
    ],
  },
];

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
  { value: "Auto", label: "자동 감지", i18nKey: "language.auto" },
  { value: "Korean", label: "한국어", i18nKey: "language.ko" },
  { value: "English", label: "영어", i18nKey: "language.en" },
  { value: "Japanese", label: "일본어", i18nKey: "language.ja" },
  { value: "Chinese", label: "중국어", i18nKey: "language.zh" },
  { value: "Cantonese", label: "광동어", i18nKey: "language.yue" },
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
    voice_changer: "Applio 단일 변환",
    voice_changer_batch: "Applio 배치 변환",
    audio_converter: "오디오 변환",
    audio_editor: "오디오 편집",
    audio_denoise: "음성 정제",
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
    voice_changer: "Applio 단일 변환",
    voice_changer_batch: "Applio 배치 변환",
    audio_converter: "오디오 변환",
    audio_editor: "오디오 편집",
    audio_denoise: "음성 정제",
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
  if (job.kind === "voice_changer") return "Applio 단일 변환";
  if (job.kind === "voice_changer_batch") return "Applio 배치 변환";
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
  const { t } = useTranslation();
  const normalizedValue = normalizeLanguageValue(value);
  const hasKnownValue = LANGUAGE_OPTIONS.some((option) => option.value === normalizedValue);

  return (
    <Select value={normalizedValue} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!hasKnownValue && normalizedValue ? (
          <SelectItem value={normalizedValue}>{normalizedValue}</SelectItem>
        ) : null}
        {LANGUAGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.i18nKey, option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TargetLanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const normalizedValue = normalizeLanguageValue(value);
  const targetOptions = LANGUAGE_OPTIONS.filter((option) => option.value !== "Auto");
  const fallbackValue = normalizedValue === "Auto" ? "English" : normalizedValue;
  const hasKnownValue = targetOptions.some((option) => option.value === fallbackValue);

  return (
    <Select value={fallbackValue} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!hasKnownValue && fallbackValue ? (
          <SelectItem value={fallbackValue}>{fallbackValue}</SelectItem>
        ) : null}
        {targetOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.i18nKey, option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function fileUrlFromPath(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const normalized = value.replace(/\\/g, "/");
  const filePath = normalized.startsWith("data/") ? `/files/${normalized.slice(5)}` : normalized.startsWith("/") ? normalized : `/files/${normalized}`;
  return mediaUrl(filePath);
}

export function mediaUrl(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || !value.startsWith("/")) {
    return value;
  }

  const configuredBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  if (configuredBase) {
    return `${configuredBase}${value}`;
  }

  if (typeof window === "undefined") {
    return value;
  }

  if (value.startsWith("/files/") && window.location.port && window.location.port !== "8190") {
    return `http://127.0.0.1:8190${value}`;
  }

  return value;
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

function ControlField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label className="font-mono text-[10px] font-medium uppercase tracking-allcaps text-ink-subtle">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ControlSection({
  title,
  toggle,
  children,
}: {
  title: string;
  toggle?: { checked: boolean; onChange: (next: boolean) => void; label?: string };
  children: React.ReactNode;
}) {
  const dimmed = toggle ? !toggle.checked : false;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-canvas/40 p-3">
      <header className="flex items-center justify-between gap-2">
        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-allcaps text-ink-muted">
          {title}
        </h4>
        {toggle ? (
          <label className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            {toggle.label ?? (toggle.checked ? "ON" : "OFF")}
            <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} />
          </label>
        ) : null}
      </header>
      <div
        className={`flex flex-col gap-3 transition-opacity ${dimmed ? "pointer-events-none opacity-40" : ""}`}
        aria-disabled={dimmed || undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function GenerationControlsEditor({
  value,
  onChange,
}: {
  value: GenerationControlsForm;
  onChange: (next: GenerationControlsForm) => void;
}) {
  const { t } = useTranslation();
  const numberInput = "h-8 border-line bg-canvas font-mono text-xs tabular-nums";
  return (
    <div className="flex flex-col gap-3">
      {/* Generation core */}
      <ControlSection title={t("tts.controls.generationGroup", "Generation")}>
        <div className="grid grid-cols-2 gap-3">
          <ControlField label={t("tts.controls.seed", "Seed")}>
            <Input
              value={value.seed}
              onChange={(event) => onChange({ ...value, seed: event.target.value })}
              className={numberInput}
              inputMode="numeric"
            />
          </ControlField>
          <ControlField label={t("tts.controls.maxTokens", "Max new tokens")}>
            <Input
              value={value.max_new_tokens}
              onChange={(event) => onChange({ ...value, max_new_tokens: event.target.value })}
              className={numberInput}
              inputMode="numeric"
            />
          </ControlField>
        </div>
        <label className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-ink hover:border-line-strong">
          <span className="font-medium">{t("tts.controls.nonStreaming", "Non-streaming mode")}</span>
          <Switch
            checked={value.non_streaming_mode}
            onCheckedChange={(next) => onChange({ ...value, non_streaming_mode: next })}
          />
        </label>
      </ControlSection>

      {/* Sampling — main */}
      <ControlSection
        title={t("tts.controls.sampling", "Sampling")}
        toggle={{
          checked: value.do_sample,
          onChange: (next) => onChange({ ...value, do_sample: next }),
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <ControlField label={t("tts.controls.topK", "Top K")}>
            <Input
              value={value.top_k}
              onChange={(event) => onChange({ ...value, top_k: event.target.value })}
              className={numberInput}
            />
          </ControlField>
          <ControlField label={t("tts.controls.topP", "Top P")}>
            <Input
              value={value.top_p}
              onChange={(event) => onChange({ ...value, top_p: event.target.value })}
              className={numberInput}
            />
          </ControlField>
          <ControlField label={t("tts.controls.temperature", "Temp")}>
            <Input
              value={value.temperature}
              onChange={(event) => onChange({ ...value, temperature: event.target.value })}
              className={numberInput}
            />
          </ControlField>
        </div>
        <ControlField label={t("tts.controls.repetition", "Repetition penalty")}>
          <Input
            value={value.repetition_penalty}
            onChange={(event) => onChange({ ...value, repetition_penalty: event.target.value })}
            className={numberInput}
          />
        </ControlField>
      </ControlSection>

      {/* Subtalker */}
      <ControlSection
        title={t("tts.controls.subtalkerGroup", "Subtalker")}
        toggle={{
          checked: value.subtalker_dosample,
          onChange: (next) => onChange({ ...value, subtalker_dosample: next }),
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <ControlField label={t("tts.controls.topK", "Top K")}>
            <Input
              value={value.subtalker_top_k}
              onChange={(event) => onChange({ ...value, subtalker_top_k: event.target.value })}
              className={numberInput}
            />
          </ControlField>
          <ControlField label={t("tts.controls.topP", "Top P")}>
            <Input
              value={value.subtalker_top_p}
              onChange={(event) => onChange({ ...value, subtalker_top_p: event.target.value })}
              className={numberInput}
            />
          </ControlField>
          <ControlField label={t("tts.controls.temperature", "Temp")}>
            <Input
              value={value.subtalker_temperature}
              onChange={(event) => onChange({ ...value, subtalker_temperature: event.target.value })}
              className={numberInput}
            />
          </ControlField>
        </div>
      </ControlSection>

      {/* Extra kwargs */}
      <ControlField label={t("tts.controls.extraKwargs", "Extra generate kwargs")}>
        <Textarea
          value={value.extra_generate_kwargs}
          onChange={(event) => onChange({ ...value, extra_generate_kwargs: event.target.value })}
          className="min-h-[64px] resize-y border-line bg-canvas font-mono text-xs"
          placeholder="{}"
        />
      </ControlField>
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
  const audioUrl = mediaUrl(record.output_audio_url);

  return (
    <article className="audio-card">
      <div className="audio-card__header">
        <div>
          <h4>{title}</h4>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="audio-card__actions">
          <span>{formatDate(record.created_at)}</span>
          <a className="secondary-button button-link" href={audioUrl} download={getAudioDownloadName(record)}>
            다운로드
          </a>
        </div>
      </div>
      <p className="audio-card__text">{record.input_text}</p>
      <audio controls src={audioUrl} className="audio-card__player" />
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
          <audio controls className="audio-card__player" src={mediaUrl(asset.url)} />
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
