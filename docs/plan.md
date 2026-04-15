# Qwen3-TTS-Demo 계획서

## 현재 단계

이 프로젝트는 이제 “큰 기능 뼈대 만들기” 단계보다, 현재 구조를 안정화하고 마무리하는 단계에 가깝습니다.

즉 지금 계획의 핵심은 새 탭을 계속 늘리는 것이 아니라, 현재 구조를 기준으로

- 기능 역할을 더 명확히 하고
- 품질 검수를 반복 가능하게 유지하고
- 남은 기술 부채를 좁히는 것

입니다.

## 현재 구조 요약

현재 화면 구조는 아래 기준으로 정리되어 있습니다.

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

이 구조를 기준으로 앞으로의 계획도 정리합니다.

## 제품 목표

이 저장소의 목표는 `Qwen3-TTS`, `Applio`, `MMAudio`를 한데 묶어, 아래 흐름을 실제로 시연할 수 있는 로컬 음성 작업실을 제공하는 것입니다.

1. `CustomVoice`로 바로 TTS를 생성하고 듣기
2. `Base`로 참조 음성에서 스타일을 추출하기
3. `VoiceDesign`으로 설명문 기반 스타일 만들기
4. 저장 프리셋을 반복 생성에 다시 쓰기
5. 저장 프리셋 위에 `instruct`를 덧입혀 생성하기
6. 긴 대본을 한 번에 읽게 하기
7. 오디오 툴을 독립 기능으로 사용하기
8. 데이터셋을 만들고 파인튜닝을 실행하기

## 현재 구조에서 중요한 구분

### 1. 프리셋 / clone prompt

- 추론 자산
- 모델 재학습 없음
- 저장 후 반복 생성에 재사용

### 2. fine-tuning

- 학습 작업
- 모델 가중치 변경
- dataset, tokenizer, prepared data 필요

### 3. 생성 이력

- `생성 갤러리`에서만 관리
- 다른 탭에는 반복 노출하지 않음

### 4. 저장 자산

- `나의 목소리들`에서 관리
- 저장 프리셋과 최종 학습 모델 중심

## 현재 우선 과제

### 1. CustomVoice self-contained checkpoint

가장 큰 남은 구조 과제입니다.

현재는 `CustomVoice Fine-Tune` 시 `Base`의 `speaker_encoder`를 보조로 빌려 쓰고 있습니다.

최종 목표:

- fine-tuned `CustomVoice` 결과물 자체가 `speaker_encoder`를 포함한다
- 결과 체크포인트 하나만으로 다시 추가 fine-tuning이 가능하다

### 2. FlashAttention 2 운영 유지

Linux + CUDA 기준 `flash_attention_2`를 우선 경로로 유지합니다.

원칙:

- Linux + CUDA: `flash_attention_2`
- macOS / CPU / 미지원 환경: `sdpa`

### 3. 프런트 visual polish

정보 구조는 거의 잡혔지만, 시각 완성도는 계속 다듬어야 합니다.

남은 포인트:

- 더 살아 있는 motion
- 덜 박스형인 레이아웃
- 메인 액션이 먼저 보이는 정보 밀도

## 현재 범위 안에 포함되는 것

- React + TypeScript 프런트엔드
- FastAPI 백엔드
- stock `CustomVoice`, `Base`, `VoiceDesign`
- clone prompt / preset 저장과 재사용
- `Base` / `CustomVoice` fine-tuning 실행
- `Applio / RVC` voice changer
- `MMAudio` sound effects
- 오디오 분리
- 품질 검수 스크립트와 보고서

## 현재 범위에서 제외되는 것

- 다중 사용자 인증
- 분산 작업 큐
- 실시간 스트리밍 TTS
- 프로덕션 배포 구조
- 멀티 스피커 fine-tuning

## 품질 검수 원칙

현재 구조에서 품질 검수는 아래 질문에 답해야 합니다.

1. dataset 음색이 실제로 반영되는가
2. instruct를 실제로 따르는가
3. stock보다 나아졌는가, 아니면 최소한 유지되는가
4. 프리셋 기반 생성에서 스타일과 instruct가 같이 유지되는가

이 검수는 문서와 스크립트 기준으로 반복 가능해야 합니다.

## 저장 구조 원칙

### dataset

```text
data/datasets/<dataset_id>/
  audio/
  raw.jsonl
  train_raw.jsonl
  eval_raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json
```

### 사용자 결과

- `data/generated`
- `data/audio-tools`
- `data/clone-prompts`
- `data/presets`
- `data/finetune-runs`

### 모델 자산

- `data/models`
- `data/rvc-models`

## 다음에 계속 볼 문서

- 루트 TODO: [../TODO.md](../TODO.md)
- 설치 및 실행: [cookbook/01-install-and-run.md](./cookbook/01-install-and-run.md)
- 프런트 구조: [cookbook/03-frontend-guide.md](./cookbook/03-frontend-guide.md)
- 백엔드 구조: [cookbook/02-backend-guide.md](./cookbook/02-backend-guide.md)
- 프리셋 + instruct: [cookbook/12-preset-plus-instruct.md](./cookbook/12-preset-plus-instruct.md)
- CustomVoice 파인튜닝: [cookbook/13-customvoice-finetuning.md](./cookbook/13-customvoice-finetuning.md)
