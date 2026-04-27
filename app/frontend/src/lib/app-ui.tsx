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

export const GUIDE_SECTIONS = [
  {
    title: "홈",
    summary: "자주 쓰는 작업으로 바로 이동하는 시작 화면입니다.",
    steps: ["목소리 설계, 목소리 복제, 텍스트 음성 변환, 프리셋 기반 생성을 빠르게 시작합니다.", "생성 결과는 생성 갤러리에서만 관리합니다."],
  },
  {
    title: "나의 목소리들",
    summary: "저장한 스타일과 바로 사용할 수 있는 모델만 모아 봅니다.",
    steps: ["모델은 사용자가 알아볼 수 있는 모델명 중심으로 표시합니다.", "저장된 스타일은 프리셋 기반 생성이나 데이터셋 구성으로 이어갈 수 있습니다."],
  },
  {
    title: "생성 갤러리",
    summary: "생성된 오디오를 듣고 내려받고 삭제하는 전용 공간입니다.",
    steps: ["개별 선택, 전체 선택, 선택 해제로 관리합니다.", "선택한 음성은 데이터셋 기준 음성이나 샘플로 보낼 수 있습니다."],
  },
  {
    title: "목소리 설계",
    summary: "목소리 설명과 대사를 넣어 새 목소리 방향을 만듭니다.",
    steps: ["Voice description은 영어로 적으면 모델이 안정적으로 해석합니다.", "Text에는 실제로 읽을 대사를 넣습니다.", "결과가 마음에 들면 목소리 복제나 데이터셋 구성으로 넘깁니다."],
  },
  {
    title: "텍스트 음성 변환",
    summary: "모델을 직접 골라 짧은 대사를 빠르게 확인합니다.",
    steps: ["CustomVoice 계열은 speaker를 선택하고, Base/clone 계열은 참조 음성 또는 프리셋을 사용합니다.", "Seed, top_p, top_k 같은 값은 Advanced controls에서만 조절합니다."],
  },
  {
    title: "목소리 복제",
    summary: "참조 음성에서 스타일을 저장하거나 VoiceBox로 바로 복제합니다.",
    steps: ["Base 모델은 clone prompt를 만들기 위한 스타일 분석에 사용합니다.", "VoiceBox 모델은 speaker encoder를 포함한 경우 같은 화면에서 직접 복제할 수 있습니다.", "참조 텍스트는 비워두면 서버 전사를 사용할 수 있습니다."],
  },
  {
    title: "프리셋 기반 생성",
    summary: "저장한 스타일을 새 대사에 재사용합니다.",
    steps: ["Base Preset은 Base가 스타일 신호를 읽어 생성합니다.", "Base + Instruction은 Base 스타일과 CustomVoice 지시 모델을 함께 씁니다.", "VoiceBox 모드는 모델 하나로 프리셋과 지시를 처리하는 흐름입니다."],
  },
  {
    title: "사운드 효과",
    summary: "MMAudio 계열 모델로 효과음을 만듭니다.",
    steps: ["프롬프트는 영어로 작성합니다.", "일반 MMAudio와 NSFW용 MMAudio 프로필을 선택할 수 있습니다.", "길이, 강도, steps, CFG는 결과 질감과 생성 시간을 바꿉니다."],
  },
  {
    title: "오디오 분리",
    summary: "음악이나 음성을 보컬/반주 등으로 분리합니다.",
    steps: ["현재는 Stem Separator 계열 프로필을 사용합니다.", "분리한 보컬은 Applio 단일 변환이나 RVC 학습 데이터로 이어서 사용할 수 있습니다."],
  },
  {
    title: "Applio",
    summary: "RVC 모델 학습, 단일 변환, 배치 변환, 모델 블렌딩을 한 섹션에서 처리합니다.",
    steps: ["RVC 모델 학습에서 바꿀 목소리 모델을 먼저 만듭니다.", "단일 변환과 배치 변환은 업로드 파일과 생성 갤러리 음성을 모두 입력으로 받을 수 있습니다.", "모델 블렌딩은 두 RVC 모델을 비율로 섞어 새 변환 모델을 만듭니다."],
  },
  {
    title: "ACE-Step 작곡",
    summary: "태그, 장르 설명, 가사 구조를 넣어 완성형 음악을 생성합니다.",
    steps: ["Tags에는 genre, mood, instrumentation을 쉼표로 적습니다.", "Lyrics에는 [verse], [chorus], [bridge] 같은 구조 태그를 넣을 수 있습니다.", "Advanced controls에서 steps, guidance, seed, CPU offload를 조절합니다."],
  },
  {
    title: "데이터셋 만들기",
    summary: "기준 음성과 학습 샘플을 한 데이터셋 폴더로 정리합니다.",
    steps: ["생성 갤러리에서 고르거나, 기준 음성 경로와 샘플 폴더 경로를 입력합니다.", "텍스트가 비어 있으면 Whisper 전사로 채울 수 있습니다.", "최소 20개 이상, 가능하면 50개 이상의 다양한 문장을 권장합니다."],
  },
  {
    title: "학습 실행",
    summary: "준비된 데이터셋으로 Base, CustomVoice, VoiceBox 학습을 실행합니다.",
    steps: ["데이터셋을 선택한 뒤 학습 방식과 초기 모델을 확인합니다.", "품질 확인용이라면 마지막 체크포인트 하나만 남기는 흐름을 권장합니다.", "훈련 중에는 다른 대형 GPU 작업을 동시에 실행하지 않는 것이 안전합니다."],
  },
  {
    title: "VoiceBox 융합",
    summary: "CustomVoice 학습 결과와 Base speaker encoder를 결합합니다.",
    steps: ["먼저 CustomVoice에 새 화자를 학습합니다.", "그 다음 Base 1.7B의 speaker encoder를 포함시켜 독립 VoiceBox 체크포인트를 만듭니다.", "완성된 VoiceBox는 추가 학습, clone, clone+instruct 검증으로 이어갑니다."],
  },
  {
    title: "S2-Pro 텍스트 음성 변환",
    summary: "저장한 목소리로 대사를 만들고 bracket 태그로 표현을 조절합니다.",
    steps: ["먼저 S2-Pro 목소리 저장에서 참조 음성을 reusable voice로 만듭니다.", "텍스트 음성 변환에서 저장 목소리를 고르고 실제로 읽을 Text를 입력합니다.", "태그는 기능 이름이 아니라 `[whisper]`, `[laugh]`처럼 대사 중간에 넣는 표현 지시입니다."],
  },
  {
    title: "S2-Pro 목소리 저장",
    summary: "참조 음성을 Fish Speech reference voice로 저장해 계속 재사용합니다.",
    steps: ["생성 갤러리 또는 업로드된 참조 음성을 고르고 Reference text를 입력합니다.", "목소리를 저장하면 S2-Pro에서 계속 선택할 수 있는 voice asset이 만들어집니다.", "Qwen clone prompt 생성 옵션을 켜면 같은 참조 음성을 Qwen 복제 흐름에서도 바로 쓸 수 있습니다."],
  },
  {
    title: "S2-Pro 대화 생성",
    summary: "저장 목소리와 speaker tag를 조합해 대화형 음성을 만듭니다.",
    steps: ["저장 목소리를 기준 음색으로 선택합니다.", "대사에는 `<|speaker:0|>`, `<|speaker:1|>` 같은 speaker tag를 직접 넣습니다.", "여러 화자를 엄밀하게 고정하는 고급 구성은 Fish Speech runtime의 reference id 관리와 함께 검증합니다."],
  },
  {
    title: "S2-Pro 다국어 TTS",
    summary: "저장 목소리와 언어별 문장을 함께 써서 다국어 음성을 생성합니다.",
    steps: ["Language는 관리용 메타데이터이고 실제 언어는 Text에 적힌 문장과 태그가 결정합니다.", "한국어, 영어, 일본어, 중국어 등을 같은 작업 안에 섞을 수 있습니다.", "저장 목소리를 선택하면 같은 음색으로 다국어 결과를 이어서 확인할 수 있습니다."],
  },
] as const;

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
    voice_changer: "Applio 단일 변환",
    voice_changer_batch: "Applio 배치 변환",
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
    voice_changer: "Applio 단일 변환",
    voice_changer_batch: "Applio 배치 변환",
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
