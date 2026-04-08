# Qwen3-TTS Overview

이 문서는 업스트림 `Qwen3-TTS/` 저장소를 현재 데모 구현 관점에서 읽는 요약입니다.

## 업스트림에서 중요한 것

`Qwen3-TTS`는 데모에서 다음 네 축으로 쓰입니다.

1. `CustomVoice`
2. `VoiceDesign`
3. `Base`
4. `Tokenizer`

## released 모델

데모에서 다루는 released 모델은 아래입니다.

- `Qwen3-TTS-12Hz-0.6B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `Qwen3-TTS-12Hz-0.6B-Base`
- `Qwen3-TTS-12Hz-1.7B-Base`
- `Qwen3-TTS-Tokenizer-12Hz`

현재 데모는 이 전 모델을 다운로드하고 웹에서 기능별로 선택할 수 있게 맞춰져 있습니다.

## 업스트림 구조

```text
Qwen3-TTS/
  qwen_tts/
  examples/
  finetuning/
  README.md
```

### `qwen_tts/`

- 실제 Python 패키지
- `Qwen3TTSModel`
- `Qwen3TTSTokenizer`
- Gradio demo CLI

### `examples/`

- CustomVoice 예제
- VoiceDesign 예제
- Base clone 예제
- tokenizer 예제

### `finetuning/`

- raw JSONL
- `prepare_data.py`
- `sft_12hz.py`

## 데모 앱과의 연결

- 업스트림 모델 패키지는 엔진
- 이 저장소의 FastAPI는 서비스 레이어
- React 앱은 그 서비스 레이어를 브라우저 워크플로우로 바꾼 UI

즉, 업스트림을 그대로 복사한 게 아니라, 같은 엔진을 제품형 인터페이스로 재구성한 구조입니다.

## 현재 구현 기준 주의점

- `VoiceDesign`은 1.7B만 존재합니다.
- `CustomVoice`와 `Base`는 0.6B, 1.7B 둘 다 웹 선택 대상으로 다룹니다.
- tokenizer는 파인튜닝 전처리에서 사용합니다.
- 실제 attention 구현은 머신 환경에 따라 `flash_attention_2` 또는 `sdpa`가 선택됩니다.
- 한국어 대사는 모델 입력 텍스트로 넣을 수 있지만, `CustomVoice` instruction과 `VoiceDesign` 설명문은 영어를 기본 권장으로 둡니다.

## 이어서 볼 문서

- 설치 및 실행: [01-install-and-run.md](./01-install-and-run.md)
- examples와 파인튜닝: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
