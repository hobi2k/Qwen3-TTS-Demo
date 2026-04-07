# Frontend Guide

문서 허브: [00-index](./00-index.md)

이 문서는 `Qwen3-TTS-Demo` 프런트엔드의 화면 구조와 상태 흐름을 설명한다. 백엔드 구조는 [02-backend-guide](./02-backend-guide.md) 에서 먼저 확인하면 연결이 더 쉽다.

## 1. 역할 요약

프런트엔드는 React + TypeScript + Vite 로 만든 단일 페이지 앱이다. 역할은 다음과 같다.

- 백엔드 API 를 호출해 생성, clone prompt, 프리셋, 데이터셋, 파인튜닝 흐름을 모두 조작한다.
- 오디오를 즉시 재생해서 결과를 비교한다.
- 탭 기반 UI 로 `CustomVoice`, `VoiceDesign`, `Fixed Character`, `Fine-tuning` 흐름을 분리한다.
- 백엔드의 simulation/real 모드를 상태 배너로 보여준다.

## 2. 파일 구조

- [app/frontend/src/main.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/main.tsx)
- [app/frontend/src/App.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- [app/frontend/src/styles.css](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/styles.css)
- [app/frontend/src/lib/api.ts](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts)
- [app/frontend/src/lib/types.ts](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/types.ts)

## 3. 엔트리 포인트

[`main.tsx`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/main.tsx) 는 아주 얇다.

- `ReactDOM.createRoot()` 로 `App` 을 루트에 마운트한다.
- `styles.css` 를 전역으로 로드한다.
- 실제 화면 로직은 전부 `App.tsx` 로 이동한다.

## 4. 화면 상태 구조

[`App.tsx`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx) 는 하나의 컴포넌트 안에 주요 상태를 모은다.

- `activeTab` 은 현재 탭을 관리한다.
- `health`, `models`, `speakers`, `history`, `presets`, `datasets`, `runs` 는 백엔드에서 읽어온 캐시 상태다.
- `message` 는 사용자에게 보여줄 피드백 배너다.
- `loading` 은 버튼 중복 제출을 막는다.
- `customForm`, `designForm`, `presetForm`, `datasetForm`, `runForm` 은 각 워크플로우의 입력 폼이다.

`refreshAll()` 이 모든 목록을 한 번에 갱신하고, `runAction()` 이 try/catch/finally 로 공통 에러 처리와 로딩 상태를 묶는다.

## 5. API 클라이언트와 타입

[`app/frontend/src/lib/types.ts`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/types.ts) 는 백엔드 응답 구조를 프런트 타입으로 고정한다.

- `HealthResponse`, `ModelInfo`, `SpeakerInfo` 는 초기 대시보드용이다.
- `GenerationRecord`, `GenerationResponse` 는 오디오 생성 흐름용이다.
- `ClonePromptRecord`, `CharacterPreset`, `FineTuneDataset`, `FineTuneRun` 은 저장형 엔티티다.
- `CreateDatasetRequest`, `PrepareDatasetRequest`, `CreateFineTuneRunRequest` 는 폼 전송용 요청 타입이다.

[`app/frontend/src/lib/api.ts`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts) 는 fetch 래퍼다.

- `request<T>()` 가 공통 에러 메시지 추출을 담당한다.
- `health()`, `models()`, `speakers()`, `history()`, `presets()`, `datasets()`, `runs()` 가 조회 API 를 감싼다.
- `generateCustomVoice()`, `generateVoiceDesign()`, `generateFromPreset()` 가 생성 API 를 감싼다.
- `uploadAudio()`, `createCloneFromSample()`, `createCloneFromUpload()`, `createPreset()`, `createDataset()`, `prepareDataset()`, `createFineTuneRun()` 이 쓰기 작업을 담당한다.

## 6. 상태 흐름

앱은 시작하자마자 `useEffect()` 로 `refreshAll()` 을 호출한다.

- `health` 로 서버 상태와 simulation/real 모드를 확인한다.
- `models` 로 현재 사용할 모델 id 를 보여준다.
- `speakers` 로 CustomVoice 셀렉트를 채운다.
- `history` 로 최근 생성 기록을 보여준다.
- `presets`, `datasets`, `runs` 로 저장 객체와 파인튜닝 상태를 보여준다.

사용자 액션 뒤에는 대부분 `refreshAll()` 을 다시 호출해 서버의 저장 상태와 화면 상태를 맞춘다.

## 7. 탭 구조

[`App.tsx`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx) 의 `tabs` 배열이 화면 분기를 정한다.

- `CustomVoice` 탭은 빠른 음질 확인용이다.
- `VoiceDesign` 탭은 새로운 캐릭터 음성을 탐색하는 용도다.
- `Fixed Character` 탭은 clone prompt 와 프리셋을 다룬다.
- `Fine-tuning` 탭은 raw JSONL 생성, audio code 준비, SFT 실행까지 묶는다.

각 탭은 하나의 `workspace` 영역에서 입력 폼과 미리보기 패널을 나란히 배치한다.

## 8. 주요 상호작용

### 8.1 CustomVoice

- 텍스트, 언어, speaker, instruction 을 입력한다.
- `api.generateCustomVoice()` 를 호출한다.
- 결과를 `lastCustomRecord` 에 저장하고 바로 재생한다.

### 8.2 VoiceDesign

- 설명문과 샘플 텍스트를 입력한다.
- `api.generateVoiceDesign()` 로 생성한다.
- `voiceDesignHistory` 에서 샘플을 다시 고를 수 있다.

### 8.3 Fixed Character

- VoiceDesign 샘플이나 업로드 음성에서 clone prompt 를 만든다.
- `api.createPreset()` 으로 캐릭터 프리셋을 저장한다.
- `api.generateFromPreset()` 으로 같은 캐릭터를 반복 합성한다.

### 8.4 Fine-tuning

- 샘플 행을 추가하거나 VoiceDesign 기록에서 샘플을 끌어온다.
- `api.createDataset()` 으로 raw JSONL 을 만든다.
- `api.prepareDataset()` 으로 `audio_codes` 를 준비한다.
- `api.createFineTuneRun()` 으로 학습 실행 기록을 남긴다.

## 9. 스타일과 레이아웃

[`styles.css`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/styles.css) 는 화면의 톤과 배치를 관리한다.

- `hero` 는 상단 요약 영역이다.
- `tab-strip` 은 4개 탭 네비게이션이다.
- `models-panel` 은 현재 모델 구성 요약이다.
- `workspace` 와 `panel-grid` 는 카드형 입력 UI 를 만든다.
- `audio-card` 는 생성 오디오를 재생하는 미리보기 카드다.

색상은 따뜻한 배경과 청록/주황 계열 포인트를 써서 실험실 느낌과 창작 도구 느낌을 같이 가져간다.

## 10. 실행 메모

- 개발 서버는 Vite 로 시작한다.
- API 는 기본적으로 `/api` 와 `/files` 를 백엔드로 프록시한다.
- 백엔드가 simulation 모드여도 UI 구조는 그대로 유지된다.
- 실제 모델 모드에서는 백엔드 health 배너가 `Real qwen-tts` 로 바뀐다.

이어서 백엔드 구조를 다시 보려면 [02-backend-guide](./02-backend-guide.md) 로 돌아가면 된다.
