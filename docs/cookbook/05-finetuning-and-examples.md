# Fine-tuning and Examples

이 문서는 업스트림 `examples/`와 `finetuning/`을 현재 데모 구현과 연결해서 설명합니다.

## examples와 연결되는 화면

### `examples/test_model_12hz_custom_voice.py`

데모의 `텍스트 음성 변환` 화면에서 `CustomVoice`를 고르는 흐름에 대응합니다.

- speaker 선택
- language 전달
- instruction 전달
- 이제 웹에서 0.6B / 1.7B `CustomVoice`를 선택 가능

### `examples/test_model_12hz_voice_design.py`

데모의 `목소리 설계` 화면에 대응합니다.

- 설명문 기반 음성 설계
- 현재 웹에서는 `VoiceDesign 1.7B`를 선택 대상으로 노출

### `examples/test_model_12hz_base.py`

데모의 `목소리 복제` 화면에 대응합니다.

- `create_voice_clone_prompt`
- `generate_voice_clone`
- clone prompt 재사용
- 0.6B / 1.7B `Base` 선택 가능

### `examples/test_model_12hz_custom_clone_instruct.py`

현재 데모의 `프리셋 프로젝트`에서 다루는 hybrid 실험 경로에 대응합니다.

- `Base` 모델로 clone prompt 생성
- `CustomVoice` 모델에 `instruct` 전달
- 참조 음성의 음색과 `CustomVoice`의 스타일 제어를 같이 실험
- 이 경로는 업스트림 안정 API가 아니라 실험용 별도 스크립트로 분리됨

### `examples/test_tokenizer_12hz.py`

데모의 `데이터셋 만들기`와 `훈련 랩` 사이 전처리 단계와 연결됩니다.

- tokenizer 선택
- `audio_codes` 준비

## finetuning과 연결되는 화면

### 업스트림 `finetuning/README.md`

현재 업스트림 문서의 공식 출발점은 `Base` 단일 화자 fine-tuning이지만,
데모에서는 실험 확장을 위해 `CustomVoice` 전용 엔트리도 별도 파일로 추가했습니다.

### raw JSONL

데모의 `데이터셋 만들기` 화면은 아래 포맷의 raw JSONL을 만듭니다.

- `audio`
- `text`
- `ref_audio`

이 raw JSONL도 dataset 폴더 안에 저장하는 것을 표준으로 사용합니다.

```text
data/datasets/<dataset_id>/
  audio/
  raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json
```

즉 학습에 쓰이는 오디오 파일과 JSONL이 서로 다른 상위 디렉터리에 흩어지지 않도록 정리합니다.

### `prepare_data.py`

데모에서는 사용자가 “raw JSONL”과 “prepared JSONL”이라는 내부 용어를 굳이 몰라도 되도록 문구를 정리합니다. 다만 실제 처리 단계는 여전히 이 스크립트가 담당합니다.

- tokenizer 모델 선택 가능
- 선택된 tokenizer로 `audio_codes` 포함 JSONL 생성

### `sft_12hz.py`

데모의 `훈련 랩 -> Base Fine-Tune` 단계와 연결됩니다.

- init model 선택 가능
- 0.6B / 1.7B `Base` 중 원하는 모델을 시작점으로 설정 가능

### `sft_custom_voice_12hz.py`

데모의 `훈련 랩 -> CustomVoice Fine-Tune`에 대응합니다.

- 기존 `sft_12hz.py`와 분리된 별도 스크립트
- `CustomVoice` 체크포인트를 시작점으로 사용
- 새 화자 추가용 `speaker_name`을 받음
- `speaker_encoder_model_path`를 별도로 받아 `Base` 체크포인트의 speaker encoder를 보조로 사용
- 결과 체크포인트는 `custom_voice` 타입으로 내보내며, 현재 UI에서는 최종 선택 모델 기준으로 `텍스트 음성 변환`과 품질 검수 흐름에서 다시 사용합니다.

## WEB UI와의 연결

### 텍스트 음성 변환

과거 문서에서는 이 영역을 `Inference Lab`이라고 불렀습니다. 현재는 `텍스트 음성 변환`이 메인 추론 화면입니다.

- stock 모델과 fine-tuned 체크포인트를 한 번에 노출
- `inference_mode`에 따라 폼이 달라짐
  - `custom_voice`: `speaker`, `instruct`, 대사, 고급 샘플링 파라미터
  - `voice_clone`: `ref_audio_path`, `ref_text`, `voice_clone_prompt_path`, `x_vector_only_mode`, 대사, 고급 샘플링 파라미터
  - `voice_design`: 설명문 기반 instruct와 대사, 고급 샘플링 파라미터
- 메인 화면은 일반 TTS에 집중하고, `Clone Prompt + Instruct Hybrid`는 `프리셋 프로젝트`로 분리합니다.

### `훈련 랩`

- `Base Fine-Tune`
  - 스크립트: `sft_12hz.py`
- `CustomVoice Fine-Tune`
  - 스크립트: `sft_custom_voice_12hz.py`
  - `speaker_encoder_model_path` 노출
- 실행 기록에는 `training_mode`, `init_model_path`, `speaker_encoder_model_path`, `output_model_path`가 함께 남음

## clone prompt와 fine-tuning의 차이

문서상 계속 구분해야 하는 핵심 포인트입니다.

### clone prompt / 프리셋

- 추론 단계
- 모델 재학습 없음
- 저장된 참조 입력 재사용
- `목소리 복제`, `목소리 설계`, `프리셋 프로젝트`에서 재사용

### fine-tuning

- 학습 단계
- 모델 가중치 변경
- 데이터셋, 전처리 결과, 최종 모델 산출물 필요

즉, 프리셋은 “저장해서 반복 생성하는 자산”, fine-tuning은 “모델 자체를 다시 학습하는 작업”입니다.

## 사용자 관점에서의 모델 차이

- `CustomVoice`
  화자와 말투 지시를 바로 받을 수 있어서 일반 TTS에 가장 쉽게 씁니다.
- `Base`
  참조 음성이나 clone prompt로 “이 목소리로 말하라”는 기준을 먼저 주어야 합니다.

그래서 UI도 아래처럼 나뉩니다.

- `텍스트 음성 변환`
  `CustomVoice` 중심의 메인 화면
- `목소리 복제`
  `Base` 중심의 스타일 추출 화면
- `프리셋 프로젝트`
  저장한 스타일과 말투 지시를 반복 조합하는 화면

## 샘플 수와 학습 기대치

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  작은 실험용
- `20~50개`
  최소한의 화자 적응을 기대할 수 있는 구간
- `50개 이상`
  음색 반영과 안정성이 더 나아질 가능성이 큼

기대치:

- `Base Fine-Tune`
  dataset 음색 적응 실험에는 의미가 있지만, instruct 준수까지 자동으로 좋아진다고 보면 안 됩니다.
- `CustomVoice Fine-Tune`
  dataset 음색 반영과 말투 지시 유지라는 두 목표를 함께 노릴 수 있는 쪽입니다. 다만 데이터 품질, 전사 정확도, 샘플 수에 크게 영향을 받습니다.

## 현재 구현 기준 메모

- 웹에서는 Base 모델을 선택해서 clone prompt를 만들 수 있습니다.
- 웹에서는 `Base`와 `CustomVoice` 모드를 골라 fine-tuning run을 만들 수 있습니다.
- 웹에서는 local fine-tuned 체크포인트를 직접 골라 추론할 수 있습니다.
- 웹에서는 `clone prompt + instruct hybrid` 실험 경로를 별도 카드로 실행할 수 있습니다.
- 기본 다운로드는 전 모델 `all`입니다.
- 가볍게만 테스트할 때는 `core` 프로필을 쓸 수 있습니다.

다음 문서:

- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
- 설치 및 실행: [01-install-and-run.md](./01-install-and-run.md)
