# Qwen3-TTS Overview

이 문서는 업스트림 `Qwen3-TTS/` 저장소의 전체 구조를 빠르게 이해하기 위한 안내서다. 설치와 실행 순서는 [00-index.md](./00-index.md)와 [01-install-and-run.md](./01-install-and-run.md)를 먼저 보고, 여기서는 “무엇이 어디에 있는지”와 “데모 앱이 무엇을 가져다 쓰는지”에 집중한다.

## 한눈에 보기

`Qwen3-TTS`는 다음 네 축으로 읽으면 이해가 쉽다.

1. `qwen_tts/`는 파이썬 패키지의 사용자 API다.
2. `core/`는 모델과 토크나이저의 실제 아키텍처 구현이다.
3. `examples/`는 기능별 사용 예제다.
4. `finetuning/`은 `Base` 단일 화자 파인튜닝 파이프라인이다.

데모 앱의 백엔드는 이 패키지를 직접 호출하지 않고, `app/backend/app/qwen.py`에서 한 번 감싼 다음 FastAPI API로 노출한다. 즉, 업스트림 `qwen_tts`는 엔진이고, 데모 백엔드는 그 엔진을 서비스 계층으로 바꾼 래퍼다.

## 저장소 구조

```text
Qwen3-TTS/
  qwen_tts/
    __init__.py
    __main__.py
    cli/demo.py
    inference/
    core/
  examples/
  finetuning/
  README.md
```

### `qwen_tts/`

- `__init__.py`는 `Qwen3TTSModel`, `Qwen3TTSTokenizer`를 외부로 내보낸다.
- `inference/qwen3_tts_model.py`는 CustomVoice, VoiceDesign, Base clone, clone prompt 생성을 담당한다.
- `inference/qwen3_tts_tokenizer.py`는 12Hz/25Hz 토크나이저 인코딩과 디코딩을 담당한다.
- `cli/demo.py`는 Gradio 기반 로컬 웹 UI를 띄우는 진입점이다.
- `__main__.py`는 패키지 실행 시 CLI 진입 안내를 출력한다.

### `core/`

- `core/models/`는 Hugging Face `PreTrainedModel` 계층과 설정 클래스다.
- `core/tokenizer_12hz/`는 12Hz 토크나이저 모델과 설정이다.
- `core/tokenizer_25hz/`는 25Hz 토크나이저 모델과 설정이다.
- `core/models/processing_qwen3_tts.py`는 입력 전처리와 후처리 연결에 쓰인다.

### `examples/`

- `test_model_12hz_custom_voice.py`는 CustomVoice 사용 예제다.
- `test_model_12hz_voice_design.py`는 VoiceDesign 사용 예제다.
- `test_model_12hz_base.py`는 Base clone prompt와 음성 합성 예제다.
- `test_tokenizer_12hz.py`는 12Hz 토크나이저 encode/decode 예제다.

### `finetuning/`

- `README.md`는 학습 입력 JSONL과 `prepare_data.py`, `sft_12hz.py` 실행 절차를 설명한다.
- `prepare_data.py`는 raw JSONL에 `audio_codes`를 붙인다.
- `sft_12hz.py`는 `Base` 단일 화자 SFT를 수행한다.
- `dataset.py`는 파인튜닝 데이터셋 처리 유틸리티다.

## 핵심 API

### `Qwen3TTSModel`

`Qwen3TTSModel`은 데모 앱에서 가장 중요한 사용자 API다. 업스트림 README와 예제 코드 기준으로 다음 기능을 제공한다.

- `from_pretrained(...)`: Hugging Face repo id 또는 로컬 경로에서 모델과 processor를 불러온다.
- `generate_custom_voice(...)`: 화자와 instruction을 사용해 CustomVoice를 생성한다.
- `generate_voice_design(...)`: 설명문 기반으로 새 음성을 설계한다.
- `create_voice_clone_prompt(...)`: Base clone prompt를 만든다.
- `generate_voice_clone(...)`: 참조 음성 또는 clone prompt를 사용해 Base 음성을 합성한다.

데모 백엔드는 이 API를 그대로 외부에 노출하지 않고, 다음처럼 업무 단위로 나눠 사용한다.

- `CustomVoice` 탭은 `/api/generate/custom-voice`와 연결된다.
- `VoiceDesign` 탭은 `/api/generate/voice-design`와 연결된다.
- `Fixed Character` 탭은 clone prompt 생성과 프리셋 저장, `/api/generate/voice-clone`과 연결된다.
- `Fine-tuning` 탭은 `prepare_data.py`와 `sft_12hz.py`의 실행 진입점과 연결된다.

### `Qwen3TTSTokenizer`

`Qwen3TTSTokenizer`는 12Hz/25Hz speech tokenizer를 감싸는 API다.

- `from_pretrained(...)`: 토크나이저 모델과 feature extractor를 불러온다.
- `encode(...)`: wav 경로, URL, base64, numpy array를 코드로 바꾼다.
- `decode(...)`: encode 결과나 dict/list form을 waveform으로 되돌린다.

데모 앱에서는 이 토크나이저를 직접 노출하지 않지만, 파인튜닝 전처리와 업스트림 예제 이해에 중요하다. 특히 `finetuning/prepare_data.py`가 `audio_codes`를 만든다는 점을 이해하려면 이 계층을 알아야 한다.

## README 기준 포인트

업스트림 [README.md](../../Qwen3-TTS/README.md)에서 특히 볼 부분은 다음이다.

- 모델 요약과 지원 언어/화자 목록
- `qwen-tts-demo` Gradio 웹 UI 실행 방법
- DashScope API와 vLLM-Omni 안내
- Fine Tuning 섹션에서 `Base` 단일 화자 SFT 설명

`qwen-tts-demo`는 업스트림이 제공하는 독립 Gradio UI다. 이 데모 저장소는 그 UI를 직접 쓰지 않고, 같은 모델 패키지를 FastAPI + React로 재구성한 것이므로 개념적으로는 같은 엔진, 다른 서비스 레이어라고 보면 된다.

## 데모 앱과의 연결

데모 앱은 업스트림 구조를 다음 방식으로 활용한다.

- `app/backend/app/qwen.py`가 `Qwen3TTSModel` 로딩과 시뮬레이션 fallback을 담당한다.
- `app/backend/app/main.py`가 생성, clone prompt, 프리셋, 데이터셋, 파인튜닝 API로 쪼개서 서비스한다.
- `app/frontend/src/App.tsx`가 탭별 워크플로우를 시각화한다.
- `app/frontend/src/lib/api.ts`가 백엔드 API를 호출한다.

이 구조 덕분에 업스트림의 모델/예제/파인튜닝 흐름을 유지하면서도, 브라우저에서 바로 확인 가능한 제품형 데모로 바꿀 수 있다.

## 다음 문서

- 파인튜닝과 예제 중심 설명은 [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)에서 이어진다.
- 설치와 실행 전체 흐름은 [01-install-and-run.md](./01-install-and-run.md)에서 확인한다.
