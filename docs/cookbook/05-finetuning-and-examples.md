# Fine-tuning and Examples

이 문서는 업스트림 `examples/`와 `finetuning/`을 현재 데모 구조와 연결해서 설명합니다.

## examples와 연결되는 현재 화면

### `examples/test_model_12hz_custom_voice.py`

현재 `텍스트 음성 변환` 화면의 `CustomVoice` 경로에 대응합니다.

- speaker 선택
- language 전달
- instruct 전달

### `examples/test_model_12hz_voice_design.py`

현재 `목소리 설계` 화면에 대응합니다.

- 설명문 기반 음성 설계
- 결과 저장 -> 프리셋화

### `examples/test_model_12hz_base.py`

현재 `목소리 복제` 화면에 대응합니다.

- 참조 음성
- 참조 텍스트
- clone prompt 생성
- clone prompt 재사용

### `examples/test_model_12hz_custom_clone_instruct.py`

현재 `프리셋 기반 생성`의 hybrid 경로에 대응합니다.

- `Base`로 스타일 신호 읽기
- `CustomVoice`로 새 대사와 말투 지시 적용

### `examples/test_tokenizer_12hz.py`

현재 `데이터셋 만들기 -> 학습 실행` 사이 전처리 흐름에 대응합니다.

## finetuning과 연결되는 현재 화면

### 데이터셋 만들기

현재 웹에서 dataset을 만들면 아래 구조를 표준으로 씁니다.

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

즉 외부 오디오와 JSONL이 흩어지지 않고, dataset 폴더 안에 함께 모입니다.

### `prepare_data.py`

사용자는 raw/prepared라는 내부 용어를 몰라도 되지만, 실제로는 이 단계가 있어야 학습이 가능합니다.

현재 데모에서는:

- tokenizer 선택
- `audio_codes` 생성
- `prepared.jsonl` 저장

까지 이어집니다.

### `sft_12hz.py`

`학습 실행 -> Base Fine-Tune`에 대응합니다.

### `sft_custom_voice_12hz.py`

`학습 실행 -> CustomVoice Fine-Tune`에 대응합니다.

이 스크립트는 업스트림과 분리된 별도 엔트리로 유지합니다.

## 현재 UI와 학습의 연결 방식

### 텍스트 음성 변환

현재 메인 추론 화면입니다.

- stock 모델 선택 가능
- 최종 fine-tuned 모델 선택 가능
- `Base` / `CustomVoice` 차이를 같은 화면에서 다룸

### 프리셋 기반 생성

저장한 스타일을 반복 생성에 다시 쓰는 화면입니다.

- 프리셋 그대로 생성
- 프리셋 + 말투 지시

이 화면이 왜 `Base`와 `CustomVoice`를 동시에 다루는지는 [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)에 따로 정리했습니다.

### 학습 실행

현재 학습 화면은:

- 준비된 dataset 선택
- `Base` 또는 `CustomVoice` 선택
- 학습 시작

으로 분리되어 있습니다.

dataset 생성과 학습 실행은 현재 구조에서 한 화면으로 섞지 않습니다.

## clone prompt와 fine-tuning의 차이

### clone prompt / 프리셋

- 추론 단계
- 모델 재학습 없음
- 저장한 스타일 자산 재사용

### fine-tuning

- 학습 단계
- 모델 가중치 변경
- dataset, tokenizer, prepared data 필요

즉:

- 프리셋은 저장해서 반복 생성하는 자산
- fine-tuning은 모델 자체를 다시 적응시키는 작업

## 모델을 사용자 입장에서 나누면

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

그래서 현재 화면도 아래처럼 나눕니다.

- `텍스트 음성 변환`
  메인 TTS
- `목소리 복제`
  Base 기반 스타일 추출
- `프리셋 기반 생성`
  저장 스타일 재활용 + 말투 지시

## 샘플 수와 기대치

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  작은 실험용
- `20~50개`
  최소 화자 적응 기대 구간
- `50개 이상`
  음색 안정성 개선 기대 구간

기대치:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만 instruct 준수까지 자동으로 좋아지진 않음
- `CustomVoice Fine-Tune`
  음색 반영과 instruct 유지 후보 경로

## 현재 구현 기준 메모

- `텍스트 음성 변환`에서 fine-tuned 최종 모델을 선택할 수 있습니다.
- `프리셋 기반 생성`에서 hybrid 경로를 실행할 수 있습니다.
- `학습 실행`은 dataset 생성과 분리되어 있습니다.
- `CustomVoice` 파인튜닝 설명은 [13-customvoice-finetuning.md](./13-customvoice-finetuning.md)에 별도 정리했습니다.

다음 문서:

- [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
- [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)
- [13-customvoice-finetuning.md](./13-customvoice-finetuning.md)
