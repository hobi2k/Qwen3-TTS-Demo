# Cookbook Index

이 문서는 `Qwen3-TTS-Demo`의 현재 구조를 따라가기 위한 문서 허브입니다.

기준은 “지금 저장소가 실제로 어떻게 나뉘어 있고, 사용자가 어떤 흐름으로 쓰는가”입니다.
현재 화면과 워크플로는 거의 완성 단계이므로, 이 허브는 새 기능을 소개하기보다 기존 구조를 정확히 따라가도록 돕는 쪽에 가깝습니다.

현재 실행 기준은 `백엔드 단독 서빙`입니다.

- `app/frontend`는 먼저 `npm run build`
- `FastAPI`가 `/api/*`와 빌드된 프런트 페이지를 함께 제공
- `next dev`는 선택적 개발 모드

## 추천 읽기 순서

1. [설치 및 실행](./01-install-and-run.md)
2. [프런트엔드 구조](./03-frontend-guide.md)
3. [백엔드 구조](./02-backend-guide.md)
4. [Qwen3-TTS 업스트림 개요](./04-qwen3-tts-overview.md)
5. [Fine-tuning 및 examples](./05-finetuning-and-examples.md)
6. [Preset + Instruct 원리](./12-preset-plus-instruct.md)
7. [CustomVoice 파인튜닝](./13-customvoice-finetuning.md)
8. [FlashAttention 2 설치](./08-flash-attn-install.md)
9. [VoiceBox 문서 허브](../voicebox/README.md)
10. [VoiceBox 파인튜닝 3단계](../voicebox/02-finetuning.md)
11. [VoiceBox 체크포인트 변환](../voicebox/01-checkpoint-conversion.md)
12. [VoiceBox clone 실험](../voicebox/03-clone-experiment.md)
13. [VoiceBox clone + instruct 실험](../voicebox/04-clone-plus-instruct.md)
14. [현재 실험 결과](./18-current-experiment-results.md)
15. [스크립트 진입점 정리](./19-script-entrypoints.md)
16. [개인 Hugging Face 자산 mirror](./20-private-hf-assets.md)
17. [S2-Pro 작업실](./21-s2-pro-workspace.md)
18. [ACE-Step 작곡](./22-ace-step-music.md)
19. [VibeVoice 작업실](./23-vibevoice-workspace.md)
20. [Qwen Extensions 구조](./24-qwen-extensions.md)

## 현재 문서 맵

### 시작과 실행

- [01-install-and-run.md](./01-install-and-run.md)
  clone 이후 실제 실행 순서
- [08-flash-attn-install.md](./08-flash-attn-install.md)
  Linux + CUDA 기준 `flash-attn v2` 설치

### 앱 구조

- [03-frontend-guide.md](./03-frontend-guide.md)
  현재 화면 구조와 UX 원칙
- [02-backend-guide.md](./02-backend-guide.md)
  FastAPI, 저장 구조, 오디오 툴, 학습 래퍼 구조

### 업스트림과 연결

- [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
  업스트림 `Qwen3-TTS` 개요
- [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
  examples/finetuning과 현재 데모 연결
- [11-pristine-upstream-finetune.md](./11-pristine-upstream-finetune.md)
  upstream 실행을 감싸는 래퍼 스크립트 기준

### 학습과 추론 상세

- [06-training-pipeline-changes.md](./06-training-pipeline-changes.md)
  데이터셋과 학습 파이프라인 확장
- [07-inference-pipeline-changes.md](./07-inference-pipeline-changes.md)
  추론 경로 확장
- [09-quality-validation-workflow.md](./09-quality-validation-workflow.md)
  음성 품질 검수 절차
- [10-quality-validation-plan.md](./10-quality-validation-plan.md)
  품질 검수 계획과 기준
- [18-current-experiment-results.md](./18-current-experiment-results.md)
  현재 MAI / CustomVoice / VoiceBox 실험 결과와 재현 명령
- [19-script-entrypoints.md](./19-script-entrypoints.md)
  `qwen_extensions` 역할별 canonical 스크립트 기준
- [20-private-hf-assets.md](./20-private-hf-assets.md)
  모델과 오디오 도구 자산을 개인 Hugging Face repo로 모으는 업로드/다운로드 기준
- [21-s2-pro-workspace.md](./21-s2-pro-workspace.md)
  Fish Speech S2-Pro 탭의 태그 기반 생성, 복제, 멀티 스피커, 다국어 입력 구조와 Local/API provider 운영 기준
- [22-ace-step-music.md](./22-ace-step-music.md)
  ACE-Step 기반 음악 작곡 탭, 다운로드, 런타임 분리, 생성 갤러리 연결 구조
- [23-vibevoice-workspace.md](./23-vibevoice-workspace.md)
  VibeVoice TTS, ASR, TTS/ASR fine-tuning, model tools, vendor/model 관리 기준
- [24-qwen-extensions.md](./24-qwen-extensions.md)
  `vendor/Qwen3-TTS`를 보존하면서 데모 전용 Qwen/VoiceBox 스크립트를 `qwen_extensions`로 실행하는 구조

### 현재 기능에서 중요한 두 문서

- [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)
  왜 `프리셋 기반 생성`에 `Base`와 `CustomVoice`가 모두 필요한지
- [13-customvoice-finetuning.md](./13-customvoice-finetuning.md)
  `CustomVoice` 파인튜닝의 목적, 데이터셋, 검수 포인트
- [../voicebox/README.md](../voicebox/README.md)
  `VoiceBox` 전용 문서 모음 허브
- [../voicebox/02-finetuning.md](../voicebox/02-finetuning.md)
  `1. plain CustomVoice 학습 -> 2. VoiceBox 변환 -> 3. VoiceBox 재학습`의 기준 문서
- [../voicebox/01-checkpoint-conversion.md](../voicebox/01-checkpoint-conversion.md)
  plain `CustomVoice`를 self-contained `VoiceBox`로 바꾸는 단계
- [../voicebox/03-clone-experiment.md](../voicebox/03-clone-experiment.md)
  `VoiceBox`/`CustomVoice` clone 가능성 실험
- [../voicebox/04-clone-plus-instruct.md](../voicebox/04-clone-plus-instruct.md)
  `VoiceBox` clone-like conditioning과 instruct 결합 실험

## 현재 앱 정보 구조

문서 기준 현재 주요 탭은 아래와 같습니다.

- `홈`
- `나의 목소리들`
- `생성 갤러리`
- `텍스트 음성 변환`
- `목소리 복제`
- `목소리 설계`
- `프리셋 기반 생성`
- `S2-Pro 텍스트 음성 변환`
- `S2-Pro 목소리 저장`
- `S2-Pro 대화 생성`
- `S2-Pro 다국어 TTS`
- `MMAudio 사운드 효과`
  일반 MMAudio와 NSFW용 MMAudio 프로필로 효과음을 생성합니다.
- `오디오 분리`
  `audio-separator` 기반 Stem Separator로 보컬/반주 또는 다중 stem을 분리합니다.
- `Applio RVC 모델 학습`
- `Applio 단일 변환`
- `Applio 배치 변환`
- `Applio 모델 블렌딩`
- `ACE-Step 작곡`
  장르/분위기/악기 태그와 가사 구조를 입력해 완성형 음악을 생성합니다.
- `VibeVoice TTS`
  Microsoft VibeVoice Realtime 0.5B와 1.5B long-form TTS를 별도 vendor wrapper로 실행합니다.
- `VibeVoice ASR`
  VibeVoice-ASR로 업로드/생성 갤러리/직접 경로 음성을 전사합니다.
- `VibeVoice TTS Fine-tune`
  TTS LoRA trainer를 dataset/column/diffusion 옵션과 함께 실행합니다.
- `VibeVoice ASR Fine-tune`
  VibeVoice-ASR LoRA trainer를 별도 흐름으로 실행합니다.
- `VibeVoice Model Tools`
  LoRA merge, merge 검증, NnScaler checkpoint 변환을 실행합니다.
- `데이터셋 만들기`
- `학습 실행`
- `VoiceBox 융합`
- `가이드`

핵심 원칙:

- 최근 생성 이력은 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.
- `텍스트 음성 변환`이 메인 TTS 화면입니다.
- `목소리 복제`와 `목소리 설계`는 분리합니다.
- `프리셋 기반 생성`은 저장된 스타일의 반복 생성용 화면입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.
- `S2-Pro`는 Qwen 모델 선택 화면에 끼워 넣지 않고 Fish Speech/Fish Audio 전용 기능별 탭으로 분리합니다.
- `S2-Pro`의 기본 `Local S2-Pro` provider는 사용자가 별도 서버를 직접 켜는 방식이 아니라, MMAudio/Applio/ACE-Step처럼 백엔드가 관리하는 엔진 wrapper 방식입니다.
- `VibeVoice`도 vendor wrapper 방식입니다. `vendor/VibeVoice` source는 저장소에 포함하고, `.venv-vibevoice`, `data/models/vibevoice`만 로컬 산출물로 git에 올리지 않습니다.
- `MMAudio`는 Qwen 생성 흐름에 섞지 않고 사운드 효과 전용 섹션으로 분리합니다.
- `Applio`는 하나의 전용 섹션 아래에서 RVC 모델 학습, 단일 변환, 배치 변환, 모델 블렌딩을 나눠 제공합니다.
- `가이드`는 한 페이지 카드 묶음이 아니라 문서 목록과 본문으로 나뉜 document 화면입니다.

오디오 분리 기준:

- 기존 HPSS가 아니라 model-backed Stem Separator를 사용합니다.
- 이 기능은 `오디오 분리` 탭 전용입니다. TTS, S2-Pro 목소리 저장, Qwen3-ASR 전사에는 필요하지 않습니다.
- 기본 보컬 분리 모델은 `vocals_mel_band_roformer.ckpt` 하나입니다. 설치된 `audio-separator 0.44.1`의 vocals 필터 상위권 Roformer 모델이며, 같은 계열 상위 후보들을 모두 기본 설치/노출하지는 않습니다.
- Applio 변환용 보컬 추출은 `vocal_rvc` 프리셋을 선택합니다.

## 빠른 링크

- 루트 소개: [README.md](../../README.md)
- 현재 계획: [plan.md](../plan.md)
- 남은 구조 과제: [TODO.md](../../TODO.md)
- 프런트 진입점: [App.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- 백엔드 진입점: [main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- 업스트림 소개: [README.md](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/vendor/Qwen3-TTS/README.md)

## 메모

- [02-backend.md](./02-backend.md), [03-frontend.md](./03-frontend.md), [04-qwen3-tts.md](./04-qwen3-tts.md)는 기존 링크 호환용 안내 페이지입니다.
- 실제 설명은 `*-guide.md`, `*-overview.md` 문서를 기준으로 유지합니다.
