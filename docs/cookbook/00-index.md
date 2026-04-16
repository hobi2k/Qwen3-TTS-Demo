# Cookbook Index

이 문서는 `Qwen3-TTS-Demo`의 현재 구조를 따라가기 위한 문서 허브입니다.

기준은 “지금 저장소가 실제로 어떻게 나뉘어 있고, 사용자가 어떤 흐름으로 쓰는가”입니다.
현재 화면과 워크플로는 거의 완성 단계이므로, 이 허브는 새 기능을 소개하기보다 기존 구조를 정확히 따라가도록 돕는 쪽에 가깝습니다.

현재 실행 기준은 `백엔드 단독 서빙`입니다.

- `app/frontend`는 먼저 `npm run build`
- `FastAPI`가 `/api/*`와 빌드된 프런트 페이지를 함께 제공
- `vite dev`는 선택적 개발 모드

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
10. [VoiceBox 체크포인트 변환](../voicebox/01-checkpoint-conversion.md)
11. [VoiceBox 파인튜닝](../voicebox/02-finetuning.md)
12. [VoiceBox clone 실험](../voicebox/03-clone-experiment.md)
13. [VoiceBox clone + instruct 실험](../voicebox/04-clone-plus-instruct.md)

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

### 현재 기능에서 중요한 두 문서

- [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)
  왜 `프리셋 기반 생성`에 `Base`와 `CustomVoice`가 모두 필요한지
- [13-customvoice-finetuning.md](./13-customvoice-finetuning.md)
  `CustomVoice` 파인튜닝의 목적, 데이터셋, 검수 포인트
- [../voicebox/README.md](../voicebox/README.md)
  `VoiceBox` 전용 문서 모음 허브
- [../voicebox/01-checkpoint-conversion.md](../voicebox/01-checkpoint-conversion.md)
  plain `CustomVoice`를 self-contained `VoiceBox`로 바꾸는 단계
- [../voicebox/02-finetuning.md](../voicebox/02-finetuning.md)
  `CustomVoice + Base -> VoiceBox` 생성과 `VoiceBox -> VoiceBox` 재학습 경로
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
- `스토리 스튜디오`
- `사운드 효과`
- `보이스 체인저`
- `오디오 분리`
- `데이터셋 만들기`
- `학습 실행`

핵심 원칙:

- 최근 생성 이력은 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.
- `텍스트 음성 변환`이 메인 TTS 화면입니다.
- `목소리 복제`와 `목소리 설계`는 분리합니다.
- `프리셋 기반 생성`은 저장된 스타일의 반복 생성용 화면입니다.
- `스토리 스튜디오`는 장문 대본용입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.

## 빠른 링크

- 루트 소개: [README.md](../../README.md)
- 현재 계획: [plan.md](../plan.md)
- 남은 구조 과제: [TODO.md](../../TODO.md)
- 프런트 진입점: [App.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- 백엔드 진입점: [main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- 업스트림 소개: [README.md](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/README.md)

## 메모

- [02-backend.md](./02-backend.md), [03-frontend.md](./03-frontend.md), [04-qwen3-tts.md](./04-qwen3-tts.md)는 기존 링크 호환용 안내 페이지입니다.
- 실제 설명은 `*-guide.md`, `*-overview.md` 문서를 기준으로 유지합니다.
