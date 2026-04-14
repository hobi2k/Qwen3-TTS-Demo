# Frontend Guide

이 문서는 현재 프런트엔드의 실제 페이지 구조와 작업 흐름을 설명합니다. 기준은 React + TypeScript + Vite 단일 페이지 앱입니다.

## 역할 요약

프런트엔드는 아래를 담당합니다.

- 백엔드 bootstrap 상태 로드
- TTS 생성, clone prompt, preset, dataset, fine-tune 요청 제어
- 생성 결과 재생과 다운로드
- 최근 생성 음성, 프리셋, 데이터셋, 학습 실행 기록 탐색
- 사운드 효과, 보이스 체인저, 오디오 분리 독립 페이지 제공

## 핵심 파일

- [main.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/main.tsx)
- [App.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- [app-ui.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/app-ui.tsx)
- [api.ts](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts)
- [types.ts](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/lib/types.ts)
- [styles.css](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/styles.css)

## 현재 페이지 구조

좌측 제품 네비게이션 기준으로 페이지를 나눕니다.

- `홈`
- `나의 목소리들`
- `빠르게 들어보기`
- `목소리 복제`
- `스토리 스튜디오`
- `사운드 효과`
- `보이스 체인저`
- `오디오 분리`
- `Training Lab`

중요한 점:

- `발견`은 제거했습니다.
- `오디오 작업실` 같은 묶음 페이지는 제거했습니다.
- `오디오 변환`, `음성을 텍스트로` 같은 현재 제품 범위 밖 기능 탭은 제거했습니다.
- 로그인, 팀 선택, 업그레이드 같은 실제 기능 없는 UI도 제거했습니다.

## 초기 로딩 구조

프런트는 시작 시 `GET /api/bootstrap`을 호출해 초기 상태를 한 번에 읽습니다.

여기서 불러오는 대표 항목:

- `health`
- `models`
- `speakers`
- `history`
- `presets`
- `datasets`
- `finetune_runs`
- `audio_assets`

예전처럼 여러 endpoint를 동시에 난사하는 방식이 아니라, bootstrap 응답 기준으로 초기 상태를 채우는 흐름입니다.

## 페이지별 동작

### 홈

- 빠른 시작 카드
- 최근 생성 음성
- 주요 기능 진입점

### 나의 목소리들

- 저장된 preset
- 최근 생성 음성
- dataset / fine-tune run 요약

최근 생성 음성은 `history` JSON만이 아니라, 실제 `data/generated` 오디오 자산 기준으로도 보강해서 보여줍니다.

### 빠르게 들어보기

- 텍스트 음성 변환의 가장 빠른 확인용 페이지입니다.
- 한국어 대사를 바로 넣고, 영어 style/instruction을 추가해 샘플을 확인합니다.
- 화자 선택 가능한 모델에서는 speaker selector가 열립니다.
- `Base` 계열처럼 단일 화자 기준 모델에는 화자 선택을 강제로 붙이지 않습니다.

### 목소리 복제

- 업로드한 기준 음성에서 스타일을 추출해 preset으로 저장합니다.
- `Base` 모델 선택이 필수입니다.
- `Base` 모델이 비어 있으면 요청 자체를 막습니다.
- 참조 음성은 업로드 또는 기존 생성 음성 선택 기준으로 넣습니다.

### 스토리 스튜디오

- 스타일 프리셋과 말투 지시를 조합해 긴 흐름의 대사를 반복 점검하는 페이지입니다.
- style/instruction은 영어 기준 입력을 권장합니다.

### 사운드 효과

- 독립 페이지입니다.
- 길이와 강도 입력은 실제 파라미터로 동작합니다.
- 백엔드 capability가 `MMAudio` unavailable이면 여기서도 비활성/에러 상태로 반영됩니다.

### 보이스 체인저

- 독립 페이지입니다.
- `Applio` 기반 RVC 호출을 전제로 합니다.
- 제품 UI는 직접 경로 입력보다, 서버가 발견한 모델 목록 선택을 우선합니다.

### 오디오 분리

- 독립 페이지입니다.
- 업로드 또는 서버 오디오 선택으로 분리 작업을 실행합니다.

### Training Lab

- dataset 생성
- prepare 실행
- fine-tune run 실행
- dataset 자산 미리듣기, 다운로드, 최근 실행 이력 확인

기준 음성, 샘플 오디오, 기존 생성 음성 선택, 업로드 오디오 전사 흐름을 여기서 처리합니다.

## 모델 선택 구조

`GET /api/models` 응답을 받아 category별로 씁니다.

- `custom_voice`
- `voice_design`
- `base_clone`
- `tokenizer`

권장 모델은 기본값으로 자동 선택하지만, 사용자는 기능별로 직접 바꿀 수 있습니다.

## 생성과 기록 UX 메모

- 생성 음성은 가능한 곳마다 재생과 다운로드를 함께 제공합니다.
- `나의 목소리들`과 각 페이지의 최근 기록은 실제 오디오 자산 기준으로 보강합니다.
- 사용자가 직접 경로를 외우게 하기보다, 서버 자산 목록을 고르게 하는 방향을 우선합니다.

## 현재 구현 기준 메모

- `CustomVoice` instruction, `VoiceDesign` 설명문, 사운드 효과 프롬프트는 영어 입력을 권장합니다.
- 한국어 대사 텍스트는 그대로 사용할 수 있습니다.
- 제품 UI는 내부 런타임 메타데이터를 전면 노출하지 않는 방향으로 정리되어 있습니다.
- 실제 없는 기능을 흉내내는 버튼이나 메뉴는 넣지 않는 것을 기준으로 유지합니다.

다음 문서: [02-backend-guide.md](./02-backend-guide.md), [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
