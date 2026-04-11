# Fine-tuning and Examples

이 문서는 업스트림 `examples/`와 `finetuning/`을 현재 데모 구현과 연결해서 설명합니다.

## examples와 연결되는 화면

### `examples/test_model_12hz_custom_voice.py`

데모의 `CustomVoice` 탭에 대응합니다.

- speaker 선택
- language 전달
- instruction 전달
- 이제 웹에서 0.6B / 1.7B `CustomVoice`를 선택 가능

### `examples/test_model_12hz_voice_design.py`

데모의 `VoiceDesign` 탭에 대응합니다.

- 설명문 기반 음성 설계
- 현재 웹에서는 `VoiceDesign 1.7B`를 선택 대상으로 노출

### `examples/test_model_12hz_base.py`

데모의 `Fixed Character` 탭에 대응합니다.

- `create_voice_clone_prompt`
- `generate_voice_clone`
- clone prompt 재사용
- 0.6B / 1.7B `Base` 선택 가능

### `examples/test_model_12hz_custom_clone_instruct.py`

현재 데모의 `Inference Lab -> Clone Prompt + Instruct Hybrid`에 대응합니다.

- `Base` 모델로 clone prompt 생성
- `CustomVoice` 모델에 `instruct` 전달
- 참조 음성의 음색과 `CustomVoice`의 스타일 제어를 같이 실험
- 이 경로는 업스트림 안정 API가 아니라 실험용 별도 스크립트로 분리됨

### `examples/test_tokenizer_12hz.py`

데모의 `Fine-tuning` 탭 전처리 단계와 연결됩니다.

- tokenizer 선택
- `audio_codes` 준비

## finetuning과 연결되는 화면

### 업스트림 `finetuning/README.md`

현재 업스트림 문서의 공식 출발점은 `Base` 단일 화자 fine-tuning이지만,
데모에서는 실험 확장을 위해 `CustomVoice` 전용 엔트리도 별도 파일로 추가했습니다.

### raw JSONL

데모의 dataset builder는 아래 포맷으로 raw JSONL을 만듭니다.

- `audio`
- `text`
- `ref_audio`

### `prepare_data.py`

데모의 `prepareDataset` 단계와 연결됩니다.

- tokenizer 모델 선택 가능
- 선택된 tokenizer로 `audio_codes` 포함 JSONL 생성

### `sft_12hz.py`

데모의 fine-tune run 단계와 연결됩니다.

- init model 선택 가능
- 0.6B / 1.7B `Base` 중 원하는 모델을 시작점으로 설정 가능

### `sft_custom_voice_12hz.py`

데모의 `Training Lab -> CustomVoice Fine-Tune`에 대응합니다.

- 기존 `sft_12hz.py`와 분리된 별도 스크립트
- `CustomVoice` 체크포인트를 시작점으로 사용
- 새 화자 추가용 `speaker_name`을 받음
- `speaker_encoder_model_path`를 별도로 받아 `Base` 체크포인트의 speaker encoder를 보조로 사용
- 결과 체크포인트는 `custom_voice` 타입으로 내보내며, WEB UI `Inference Lab`에서 직접 선택 가능

## WEB UI와의 연결

### `Inference Lab`

- stock 모델과 fine-tuned 체크포인트를 한 번에 노출
- `inference_mode`에 따라 폼이 달라짐
  - `custom_voice`: `speaker`, `instruct`, 대사, 고급 샘플링 파라미터
  - `voice_clone`: `ref_audio_path`, `ref_text`, `voice_clone_prompt_path`, `x_vector_only_mode`, 대사, 고급 샘플링 파라미터
  - `voice_design`: 설명문 기반 instruct와 대사, 고급 샘플링 파라미터
- 같은 탭 안에 `Clone Prompt + Instruct Hybrid` 실험 카드도 따로 배치

### `Training Lab`

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

### fine-tuning

- 학습 단계
- 모델 가중치 변경
- raw JSONL, prepared JSONL, checkpoint 필요

즉, `고정 캐릭터 프리셋`은 "추론용 자산 저장", `fine-tuning`은 "모델 자체를 다시 학습"하는 흐름입니다.

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
