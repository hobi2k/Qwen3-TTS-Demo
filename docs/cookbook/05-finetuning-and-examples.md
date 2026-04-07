# Fine Tuning and Examples

이 문서는 업스트림 `Qwen3-TTS/` 저장소의 `examples/`와 `finetuning/`를 함께 읽는 가이드다. 개요는 [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)에서 먼저 보고, 여기서는 실제 파일 단위로 무엇을 하는지와 데모 앱이 어떻게 연결하는지를 정리한다.

## 목적

업스트림 예제와 파인튜닝 문서는 서로 다른 질문에 답한다.

- `examples/`는 “지금 모델이 어떻게 동작하는지”를 보여준다.
- `finetuning/`는 “내 데이터로 `Base`를 어떻게 학습하는지”를 보여준다.

데모 앱은 이 둘을 다음처럼 재사용한다.

- `examples/`의 CustomVoice, VoiceDesign, Base clone 흐름은 브라우저 샘플러와 고정 캐릭터 생성으로 이어진다.
- `finetuning/`의 JSONL, `prepare_data.py`, `sft_12hz.py` 흐름은 데이터셋 빌더와 파인튜닝 실행 화면으로 이어진다.

## `examples/` 구조

```text
examples/
  test_model_12hz_custom_voice.py
  test_model_12hz_voice_design.py
  test_model_12hz_base.py
  test_tokenizer_12hz.py
```

### `test_model_12hz_custom_voice.py`

- `Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")`를 로드한다.
- `generate_custom_voice(...)`의 단일 입력과 배치 입력을 모두 보여준다.
- `speaker`, `language`, `instruct` 조합을 통해 스타일 제어를 검증한다.

데모 앱에서는 이 흐름이 `CustomVoice` 탭에 해당한다.

### `test_model_12hz_voice_design.py`

- `Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")`를 로드한다.
- `generate_voice_design(...)`의 단일/배치 입력을 보여준다.
- 자연어 `instruct`로 음색과 감정, 캐릭터성을 설계하는 방식을 검증한다.

데모 앱에서는 이 흐름이 `VoiceDesign` 탭에 해당한다.

### `test_model_12hz_base.py`

- `Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base")`를 로드한다.
- `create_voice_clone_prompt(...)`와 `generate_voice_clone(...)`를 함께 보여준다.
- `x_vector_only_mode`를 켠 경우와 끈 경우를 모두 비교한다.
- 단일 샘플과 배치 샘플을 모두 다룬다.

데모 앱에서는 이 흐름이 `Fixed Character` 탭의 핵심이다. 생성된 clone prompt를 프리셋으로 저장하고, 같은 캐릭터 음성을 반복 재사용하는 로직이 여기서 나온다.

### `test_tokenizer_12hz.py`

- `Qwen3TTSTokenizer.from_pretrained("Qwen/Qwen3-TTS-Tokenizer-12Hz")`를 로드한다.
- wav path, URL, dict, list[dict], numpy waveform 등 다양한 입력 형태를 encode/decode로 확인한다.
- 12Hz 토크나이저가 `audio_codes`를 어떤 형태로 주고받는지 확인한다.

이 예제는 파인튜닝 전처리의 핵심 배경이다. 데모 앱의 `prepare_data.py` 실행 화면과 직접 연결된다.

## `finetuning/` 구조

```text
finetuning/
  README.md
  dataset.py
  prepare_data.py
  sft_12hz.py
```

### `README.md`

파인튜닝 문서는 다음 순서를 강하게 권장한다.

1. raw JSONL 작성
2. `prepare_data.py`로 `audio_codes` 추가
3. `sft_12hz.py`로 학습
4. 학습 체크포인트로 간단한 추론 테스트

업스트림 문서 기준으로 현재 지원 범위는 `Base` 단일 화자 fine-tuning이다.

### 입력 JSONL

각 행은 아래 필드를 가진다.

- `audio`: 타깃 학습 음성 경로
- `text`: 해당 음성의 transcript
- `ref_audio`: 참조 화자 음성 경로

중요한 점은 `ref_audio`를 데이터셋 전체에서 동일하게 유지하는 것이 강하게 권장된다는 것이다. 데모 앱의 데이터셋 빌더도 이 규칙을 UI에서 안내하도록 설계돼 있다.

### `prepare_data.py`

- `input_jsonl`를 읽는다.
- `Qwen/Qwen3-TTS-Tokenizer-12Hz`를 사용해 `audio_codes`를 만든다.
- `output_jsonl`에 학습 가능한 형태를 저장한다.

데모 앱에서는 이 단계를 `/api/datasets/{dataset_id}/prepare-codes`로 감싼다. 시뮬레이션 모드에서는 placeholder `audio_codes`를 넣어서 UX를 끊지 않도록 한다.

### `sft_12hz.py`

- `init_model_path`를 시작점으로 학습을 수행한다.
- `output_model_path`에 체크포인트를 쓴다.
- `train_jsonl`, `batch_size`, `lr`, `num_epochs`, `speaker_name`을 사용한다.

데모 앱에서는 이 실행을 `/api/finetune-runs`로 감싸며, 로그와 결과 디렉터리 경로를 저장해 UI에서 추적할 수 있게 만든다.

## 데모 앱 연결 맵

- `examples/test_model_12hz_custom_voice.py` -> `app/frontend`의 `CustomVoice` 탭
- `examples/test_model_12hz_voice_design.py` -> `app/frontend`의 `VoiceDesign` 탭
- `examples/test_model_12hz_base.py` -> `app/frontend`의 `Fixed Character` 탭
- `examples/test_tokenizer_12hz.py` -> `app/frontend`의 `Fine-tuning` 탭
- `finetuning/README.md` -> `app/backend/app/main.py`의 데이터셋/전처리/실행 라우트

백엔드는 업스트림 예제를 그대로 노출하지 않고, 아래처럼 더 작은 사용자 작업 단위로 바꾼다.

- 생성 샘플 만들기
- clone prompt 생성
- 캐릭터 프리셋 저장
- 데이터셋 생성
- audio code 준비
- 파인튜닝 실행

## 읽는 순서

1. [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
2. 이 문서
3. [01-install-and-run.md](./01-install-and-run.md)
4. [02-backend-guide.md](./02-backend-guide.md)
5. [03-frontend-guide.md](./03-frontend-guide.md)
