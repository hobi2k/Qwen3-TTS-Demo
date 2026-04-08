# Frontend Guide

이 문서는 현재 프런트엔드가 어떤 탭 구조와 모델 선택 흐름을 갖는지 설명합니다.

## 역할 요약

프런트엔드는 React + TypeScript + Vite 단일 페이지 앱입니다.

주요 역할:

- 백엔드 API 호출
- 생성 결과 재생
- clone prompt / 프리셋 / 데이터셋 / 파인튜닝 작업 제어
- 헬스 상태, device, attention 표시
- 기능별 모델 선택 UI 제공

## 핵심 파일

- [main.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/main.tsx)
- [App.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- [api.ts](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts)
- [types.ts](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/types.ts)
- [styles.css](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/styles.css)

## 탭 구조

현재 탭은 4개입니다.

- `CustomVoice`
- `VoiceDesign`
- `Fixed Character`
- `Fine-tuning`

## 상단 상태 배너

상단에서는 아래를 같이 보여줍니다.

- 백엔드 상태
- 실행 모드 `simulation / real`
- `qwen_tts` import 상태
- `device`
- `attention`

즉, 프런트에서 바로 “실제 모델인지, fallback인지”를 볼 수 있습니다.

## 모델 선택 구조

`GET /api/models` 응답을 받아 `category`별로 분리해서 씁니다.

- `custom_voice` 모델 목록
- `voice_design` 모델 목록
- `base_clone` 모델 목록
- `tokenizer` 모델 목록

이 목록은 `recommended` 값도 포함하므로, 프런트는 처음 로드 시 기본 추천 모델을 자동으로 채웁니다.

## 탭별 동작

### CustomVoice

- 모델 선택
- 언어 입력
- speaker 선택
- 영어 instruction 입력
- 생성

### VoiceDesign

- 모델 선택
- 한국어 대사 입력
- 영어 설명문 입력
- 생성

### Fixed Character

- `Base` 모델 선택
- VoiceDesign 샘플에서 clone prompt 생성
- 또는 업로드 음성에서 clone prompt 생성
- 프리셋 저장
- 저장된 프리셋으로 반복 합성

### Fine-tuning

- dataset 생성
- tokenizer 선택
- `prepare_data.py` 실행
- `init_model` 선택
- `sft_12hz.py` 실행

## 상태 초기화 흐름

`App.tsx`에서는 시작 시 `refreshAll()`을 호출해 아래를 한 번에 불러옵니다.

- `health`
- `models`
- `speakers`
- `history`
- `presets`
- `datasets`
- `runs`

모델 목록이 들어오면 카테고리별 추천 모델을 각 폼에 자동 주입합니다.

## 요청 흐름

API 호출 래퍼는 [api.ts](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts)에서 관리합니다.

주요 호출:

- `generateCustomVoice`
- `generateVoiceDesign`
- `createCloneFromSample`
- `createCloneFromUpload`
- `createPreset`
- `generateFromPreset`
- `createDataset`
- `prepareDataset`
- `createFineTuneRun`

## 현재 구현 기준 메모

- 프런트는 “전 모델 다운로드 후 기능별 모델 선택”을 기준으로 설계되어 있습니다.
- `VoiceDesign` 설명문과 `CustomVoice` instruction은 영어 기본값을 사용합니다.
- 대사 텍스트는 한국어를 그대로 사용할 수 있습니다.
- `Fixed Character`에서 선택한 Base 모델은 clone prompt 생성과 preset 저장에 함께 반영됩니다.
- `Fine-tuning`에서는 tokenizer와 init model을 별도로 선택할 수 있습니다.
- 상단 상태 배너에서 `runtime_mode`, `device`, `attention`을 먼저 확인한 뒤 샘플을 점검하는 흐름을 권장합니다.

다음 문서: [02-backend-guide.md](./02-backend-guide.md), [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
