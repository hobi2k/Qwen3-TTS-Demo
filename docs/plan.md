# Qwen3-TTS 데모 계획서

## 목표

이 저장소의 `Qwen3-TTS-Demo`를, `hobi2k.github.io/_posts/2026-04-06-Qwen3-TTS-Character-Platform.markdown`에서 정리한 주요 기능을 직접 시연할 수 있는 로컬 데모 애플리케이션으로 만든다.

이 데모는 아래 흐름을 모두 보여줄 수 있어야 한다.

1. `CustomVoice`로 빠르게 음질과 스타일을 확인하기
2. `VoiceDesign`만으로 새 목소리를 설계하고 샘플을 실험하기
3. `VoiceDesign`으로 새 목소리를 설계한 뒤 `Base`로 고정 캐릭터 음성 만들기
4. 사용자가 준비한 음성 파일과 텍스트로 `Base` 기반 고정 캐릭터 음성 만들기
5. `VoiceDesign` 결과나 사용자 음성 데이터를 바탕으로 파인튜닝용 데이터셋을 구성하기
6. `Base` 단일 화자 파인튜닝 실행을 위한 입력 파일과 실행 진입점을 제공하기
7. 생성한 `voice_clone_prompt`를 저장하고 재사용해서 같은 캐릭터가 계속 같은 목소리로 말하게 하기
8. 브라우저에서 결과를 재생하고 비교하고 내려받을 수 있게 하기

## 현재 우선 TODO

- 루트 [TODO.md](../TODO.md)에 정리한 것처럼, `CustomVoice Fine-Tune` 결과를
  self-contained checkpoint로 바꾸는 작업이 남아 있다.
- 현재는 `CustomVoice` 학습 시 `Base`의 `speaker_encoder`를 보조로 빌려 쓰는 구조이며,
  최종 목표는 fine-tuned `CustomVoice` 결과물 자체가 `speaker_encoder`를 포함해
  독립적으로 추가 fine-tuning 가능한 상태가 되는 것이다.
- FlashAttention 경로는 WSL/Linux 기준 `flash-attn` v2로 정리했다.
  현재 주력 경로는 `flash_attention_2`이며, `sdpa`는 macOS나 FlashAttention을
  실제로 쓸 수 없는 환경에서만 fallback으로 본다.

## 기준 자료와 입력 자원

- 데모 앱 저장소: `Qwen3-TTS-Demo`
- 클론한 참고 저장소: `Qwen3-TTS-Demo/Qwen3-TTS`
- 기획 기준 글: `hobi2k.github.io/_posts/2026-04-06-Qwen3-TTS-Character-Platform.markdown`

## 용어 구분

이 문서에서는 아래 두 개념을 명확히 구분한다.

### 1. 고정 캐릭터 프리셋 / clone prompt

- 목적: 같은 캐릭터 목소리를 추론 단계에서 반복 재사용하기
- 방식: `reference audio`, `reference text`, `voice_clone_prompt`, 기본 언어/스타일 같은 추론용 자산을 저장
- 특징: 모델 재학습 없음
- 비용: 비교적 가볍고 즉시 재사용 가능
- 대표 흐름: `VoiceDesign -> Base clone prompt 생성 -> 프리셋 저장 -> 반복 합성`

즉, 이것은 "모델을 새로 학습시키는 것"이 아니라, 같은 추론 입력을 계속 재사용하기 위한 저장 계층이다.

### 2. 파인튜닝

- 목적: `Base` 모델 자체를 단일 화자 데이터셋으로 추가 학습하기
- 방식: `audio`, `text`, `ref_audio` 형식의 JSONL을 만들고 `prepare_data.py`, `sft_12hz.py`로 학습 진행
- 특징: 모델 가중치가 바뀌고 체크포인트가 새로 생성됨
- 비용: 무겁고 시간이 오래 걸리며 GPU 자원이 더 많이 필요함
- 대표 흐름: `데이터셋 구성 -> audio_codes 생성 -> SFT 실행 -> 체크포인트 테스트`

즉, 이것은 "프롬프트 재사용"이 아니라, 별도의 학습 워크플로우다.

## 범위

### 이번 구현 범위

- React + TypeScript 프론트엔드
- 로컬 `qwen-tts`를 감싸는 Python 백엔드
- `CustomVoice`, `VoiceDesign`, `Base` 데모 플로우
- 고정 캐릭터 프리셋 / clone prompt 저장 및 재사용 도구
- `Base` 단일 화자 파인튜닝용 데이터셋 구성 도구
- 파인튜닝 실행/상태 확인을 위한 로컬 작업 진입점
- 오디오 재생, 결과 이력, 파일 다운로드
- 빠른 샘플 확인과 "고정 캐릭터화"를 명확히 구분하는 UI

### 1차 범위에서 제외

- 다중 사용자 인증
- 분산 작업 큐와 프로덕션급 워커 구조
- 토큰 단위 실시간 오디오 스트리밍
- HTTPS 배포와 브라우저 마이크 녹음까지 포함한 완전한 배포 구조
- DashScope API 연동
- 멀티 스피커 파인튜닝

## 핵심 데모 시나리오

### 1. Quick Custom Voice Check

목적: 가장 빠르게 샘플을 들어보는 흐름

사용 흐름:

1. 텍스트 입력
2. 언어 선택
3. 내장 speaker 선택
4. 필요하면 instruction 입력
5. 생성 후 바로 재생

기대 결과:

- 음질, 말투, 감정 표현을 빠르게 확인할 수 있다
- 고정 캐릭터를 만들기 전 탐색용 샘플러 역할을 한다

### 2. VoiceDesign -> 고정 캐릭터 음성

목적: 새로운 캐릭터 목소리를 설계하고, 이후 계속 재사용 가능한 형태로 굳히는 흐름

사용 흐름:

1. 캐릭터용 음성 설명문 입력
2. 첫 샘플용 텍스트 입력
3. `VoiceDesign`으로 샘플 생성
4. 생성 결과와 텍스트를 검토
5. 생성된 샘플을 기반으로 `Base` clone prompt 생성
6. 이름을 붙여 캐릭터 프리셋으로 저장
7. 저장한 프리셋으로 새 대사를 계속 생성

기대 결과:

- 창작 단계에서는 자유롭게 목소리를 설계할 수 있다
- 운영 단계에서는 같은 캐릭터 목소리를 계속 재사용할 수 있다

### 2-1. VoiceDesign 전용 페이지

목적: `Base` 고정 캐릭터화로 넘어가지 않고, `VoiceDesign` 자체를 독립적인 음성 디자인 도구로 사용할 수 있게 하는 흐름

사용 흐름:

1. 음성 설명문 입력
2. 샘플 텍스트 입력
3. 언어와 옵션 선택
4. `VoiceDesign` 샘플 생성
5. 여러 버전을 비교 청취
6. 결과를 저장하거나, 필요하면 나중에 `Base` 고정 캐릭터화 단계로 넘김

기대 결과:

- 운영자나 창작자가 다양한 캐릭터 목소리를 빠르게 탐색할 수 있다
- 고정 캐릭터화 이전의 실험 공간을 별도 페이지로 제공할 수 있다
- VoiceDesign 자체만 필요한 사용 사례도 독립적으로 지원할 수 있다

### 3. 사용자 음성 파일 -> 고정 캐릭터 음성

목적: 업로드한 참조 음성을 캐릭터용 음성 프리셋으로 만드는 흐름

사용 흐름:

1. 참조 음성 파일 업로드
2. 참조 텍스트 입력 또는 확인
3. `Base`로 clone prompt 생성
4. 이름을 붙여 캐릭터 프리셋 저장
5. 저장한 프리셋으로 새 대사 생성

기대 결과:

- 사용자가 준비한 음성을 재사용 가능한 캐릭터 음성으로 전환할 수 있다
- 일회성 샘플과 고정 캐릭터 자산을 분리해서 관리할 수 있다

### 4. 파인튜닝 데이터셋 빌더

목적: `Base` 단일 화자 파인튜닝에 필요한 JSONL 데이터셋과 전처리 흐름을 데모 안에서 준비할 수 있게 한다

사용 흐름:

1. 데이터셋 소스 선택
2. `VoiceDesign` 생성 샘플 묶음 또는 사용자 업로드 음성 묶음 선택
3. 각 샘플의 텍스트 확인/수정
4. 공통 `ref_audio` 지정
5. `train_raw.jsonl` 생성
6. 필요하면 `prepare_data.py`를 호출해 `audio_codes` 포함 JSONL 생성
7. 이후 파인튜닝 실행으로 연결

기대 결과:

- clone prompt 재사용만이 아니라 실제 `Base` 파인튜닝까지 이어지는 진입점을 제공할 수 있다
- 사용자는 수집한 음성 자산을 모델 적응용 데이터셋으로 정리할 수 있다

주의 사항:

- 공식 `finetuning/README.md` 기준 현재는 `Base` 모델의 단일 화자 파인튜닝만 지원한다
- 입력 JSONL 각 행에는 `audio`, `text`, `ref_audio`가 들어가야 한다
- 문서상 `ref_audio`는 데이터셋 전체에서 동일한 파일을 쓰는 것이 강하게 권장된다

## 제안 아키텍처

### 프론트엔드

- 스택: React + TypeScript + Vite
- 주요 화면:
  - `CustomVoice Playground`
  - `VoiceDesign Studio`
  - `Fixed Character Builder`
  - `Character Presets`
  - `Fine-tuning Dataset Builder`
  - `Fine-tuning Runner`
  - `Generation History`
- 역할:
  - 폼 입력과 검증
  - 파일 업로드
  - 오디오 재생
  - 생성 진행 상태 표시
  - 프리셋 저장과 재사용 UX 제공

### 백엔드

- 스택: Python 기반 API 서버, 우선 `FastAPI` 고려
- 역할:
  - 로컬 `qwen-tts` 모델 호출 래핑
  - 모델별 입력과 출력을 공통 API 형태로 정리
  - 업로드 파일과 생성 결과 저장
  - `voice_clone_prompt` 생성 및 캐시 관리
  - 파인튜닝용 JSONL 생성
  - `prepare_data.py`, `sft_12hz.py` 실행 래핑
  - 파인튜닝 작업 상태와 산출물 경로 관리
  - 프리셋 CRUD 제공
  - 헬스체크와 모델 정보 조회 제공

### 저장 구조

- 오디오 파일과 clone artifact는 로컬 파일시스템에 저장
- 메타데이터는 JSON 또는 SQLite로 저장

초기 추천 구조:

```text
Qwen3-TTS-Demo/
  docs/
  Qwen3-TTS/
  app/
    frontend/
    backend/
  data/
    uploads/
    generated/
    clone-prompts/
    presets/
    datasets/
    finetune-runs/
```

## 백엔드 API 초안

### 상태 확인과 모델 정보

- `GET /api/health`
- `GET /api/models`
- `GET /api/speakers`

### 생성 API

- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`

### clone prompt / 프리셋 API

- `POST /api/clone-prompts/from-generated-sample`
- `POST /api/clone-prompts/from-upload`
- `GET /api/presets`
- `POST /api/presets`
- `GET /api/presets/:id`
- `POST /api/presets/:id/generate`

### 파인튜닝 API

- `POST /api/datasets`
- `GET /api/datasets`
- `GET /api/datasets/:id`
- `POST /api/datasets/:id/prepare-codes`
- `POST /api/finetune-runs`
- `GET /api/finetune-runs`
- `GET /api/finetune-runs/:id`

### 파일 API

- `POST /api/uploads/reference-audio`
- `GET /api/audio/:id`

## 데이터 모델 초안

### CharacterPreset

- `id`
- `name`
- `sourceType` (`voice_design` 또는 `uploaded_reference`)
- `baseModel`
- `language`
- `referenceText`
- `referenceAudioPath`
- `clonePromptPath`
- `createdAt`
- `notes`

### GenerationRecord

- `id`
- `mode` (`custom_voice`, `voice_design`, `voice_clone`)
- `inputText`
- `language`
- `speaker`
- `instruction`
- `presetId`
- `outputAudioPath`
- `createdAt`

### FineTuneDataset

- `id`
- `name`
- `sourceType` (`voice_design_batch` 또는 `uploaded_audio_batch`)
- `rawJsonlPath`
- `preparedJsonlPath`
- `refAudioPath`
- `speakerName`
- `sampleCount`
- `createdAt`

### FineTuneRun

- `id`
- `datasetId`
- `initModelPath`
- `outputModelPath`
- `batchSize`
- `lr`
- `numEpochs`
- `speakerName`
- `status`
- `createdAt`
- `finishedAt`

## UX 방향

### 화면 구성

- 왼쪽: 입력 폼과 설정
- 오른쪽: 생성 결과, 저장된 프리셋, 최근 생성 이력
- 상단: 추론 데모 영역과 파인튜닝 영역을 나누는 탭 또는 세그먼트 네비게이션

### UX 원칙

- 세 가지 음성 생성 방식을 시각적으로 분명히 구분한다
- `VoiceDesign` 전용 실험 페이지와 `VoiceDesign -> Base` 고정 캐릭터화 페이지를 분리한다
- `고정 캐릭터 프리셋 / clone prompt`와 `파인튜닝`을 서로 다른 기능군으로 분리해서 보여준다
- 파인튜닝은 "고정 캐릭터 프리셋"보다 더 무거운 학습 단계라는 점을 별도 영역에서 설명한다
- 두 clone 기반 흐름에서는 "고정 캐릭터화" 개념을 계속 드러낸다
- 프리셋 저장 전에 샘플을 비교 청취할 수 있게 한다
- `Base`에서 필요한 참조 텍스트의 중요성을 UI에서 명확히 보여준다
- 데이터셋 빌더에서는 JSONL 구조와 공통 `ref_audio` 요구사항을 명확히 드러낸다

## 구현 단계

### 1단계. 기반 구조 만들기

- React + TypeScript 프론트엔드 초기화
- Python 백엔드 초기화
- 공통 실행 방법과 폴더 구조 정리
- 프론트/백엔드 API 계약 정의

### 2단계. CustomVoice 데모

- speaker / language 목록 조회
- 텍스트 입력 후 음성 생성
- 생성 결과 재생 / 다운로드 카드 구현

### 3단계. VoiceDesign 데모

- `VoiceDesign` 전용 페이지 구현
- 음성 설명문 입력 폼
- 샘플 생성과 버전 비교
- 결과 검토 및 저장 UI

### 4단계. Base 기반 고정 캐릭터 플로우

- `VoiceDesign` 결과를 기반으로 clone prompt 생성
- 업로드한 사용자 음성으로 clone prompt 생성
- 재사용 가능한 캐릭터 프리셋 저장
- 저장된 프리셋으로 새 텍스트 계속 생성

### 5단계. 파인튜닝 데이터셋/실행 플로우

- `audio`, `text`, `ref_audio` 기반 raw JSONL 생성
- `prepare_data.py` 연동으로 `audio_codes` 포함 JSONL 생성
- `sft_12hz.py` 실행 진입점 제공
- 체크포인트 경로와 상태 표시

### 6단계. 저장과 다듬기

- 생성 이력 저장
- 에러 상태와 입력 검증 보강
- 로딩 / 진행 상태 개선
- 모델 경로와 런타임 옵션을 위한 로컬 설정 추가

## 기술적 리스크

- 특히 `1.7B` 모델은 로딩 시간과 메모리 사용량이 클 수 있다
- `flash-attn`과 GPU 의존 패키지 설치가 환경마다 까다로울 수 있다
- 브라우저 재생을 위해 생성 오디오 포맷 정규화가 필요할 수 있다
- `Base` 품질은 참조 음성 품질과 참조 텍스트 정확도에 크게 좌우된다
- 모델 id로 바로 받을지, 로컬에 미리 다운로드한 경로를 쓸지 둘 다 지원해야 할 수 있다
- 파인튜닝은 생성보다 훨씬 무거워서 장시간 작업 관리와 실패 복구가 필요하다
- 현재 공식 문서 기준 멀티 스피커 파인튜닝은 아직 지원되지 않는다

## 선결정 사항

- 모델 호출은 Node가 아니라 Python 백엔드에서 처리한다
- `VoiceDesign`은 단독 실험 페이지와 `Base` 연계 페이지 둘 다 제공한다
- `VoiceDesign`과 `Base`는 분리된 단계이지만 서로 연결된 UX로 설계한다
- `clone prompt / 캐릭터 프리셋`과 `파인튜닝`은 별도 기능군으로 분리해 안내한다
- "고정 캐릭터 음성"을 제대로 보여주려면 프리셋 저장을 초반부터 넣는다
- 1차 구현은 비스트리밍 생성으로 시작하고, 스트리밍은 이후 필요 시 확장한다
- 파인튜닝은 `Qwen3-TTS-Demo/Qwen3-TTS/finetuning/README.md` 기준의 `Base` 단일 화자 워크플로우를 따른다

## 1차 완료 기준

아래 조건을 만족하면 1차 목표를 달성한 것으로 본다.

1. React + TypeScript 프론트엔드와 Python 백엔드가 로컬에서 함께 실행된다
2. `CustomVoice` 샘플을 생성하고 브라우저에서 재생할 수 있다
3. `VoiceDesign` 전용 페이지에서 샘플을 만들고 비교 청취할 수 있다
4. `VoiceDesign` 샘플을 만든 뒤, 이를 재사용 가능한 캐릭터 프리셋으로 전환할 수 있다
5. 업로드한 사용자 음성 파일도 재사용 가능한 캐릭터 프리셋으로 만들 수 있다
6. `audio`, `text`, `ref_audio` 형식의 파인튜닝 raw JSONL을 만들 수 있다
7. `prepare_data.py`를 통해 `audio_codes` 포함 학습 JSONL을 만들 수 있다
8. `sft_12hz.py` 실행 진입점과 체크포인트 경로를 앱에서 확인할 수 있다
9. 저장된 캐릭터 프리셋으로 같은 설정을 유지한 새 대사를 계속 합성할 수 있다
10. 생성 파일, 데이터셋 메타데이터, 프리셋 메타데이터가 문서화된 로컬 구조에 저장된다

## 이 문서 다음 작업

1. 프론트엔드와 백엔드 기본 구조를 스캐폴딩한다
2. upstream `qwen-tts` 예제를 감싸는 백엔드 래퍼를 만든다
3. `CustomVoice`부터 붙이고, 그 다음 고정 캐릭터 두 흐름과 파인튜닝 데이터셋 플로우를 구현한다
