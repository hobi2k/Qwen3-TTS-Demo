# VoiceBox 체크포인트 변환

이 문서는 `CustomVoice` 결과 체크포인트에 `Base 1.7B`의 `speaker_encoder`를 합쳐
자립형 `VoiceBox` 체크포인트를 만드는 과정을 설명합니다.

## 목적

일반 `CustomVoice` 체크포인트는 추가 파인튜닝이나 clone 실험을 다시 할 때
외부 `Base 1.7B`의 `speaker_encoder` 경로가 필요합니다.

`VoiceBox`는 이 의존성을 줄이기 위해 다음을 함께 저장합니다.

- `speaker_encoder.*` 가중치
- `speaker_encoder_config`
- `demo_model_family = "voicebox"`
- `speaker_encoder_included = true`

## 입력과 출력

- 입력:
  - `CustomVoice` 체크포인트
  - `Base 1.7B` 체크포인트
- 출력:
  - `speaker_encoder`가 내장된 `VoiceBox` 체크포인트

## 사용 스크립트

- 변환 스크립트:
  - [make_voicebox_checkpoint.py](../../qwen_extensions/fusion/make_voicebox_checkpoint.py)

## 예시

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python qwen_extensions/fusion/make_voicebox_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final
```

## 확인 포인트

- `config.json` 안에 다음이 있어야 합니다.
  - `demo_model_family = "voicebox"`
  - `speaker_encoder_included = true`
  - `speaker_encoder_config`
- `model.safetensors` 안에 `speaker_encoder.*` 키가 있어야 합니다.

## 주의

- `VoiceBox`는 내부 명칭입니다.
- 추론 호환성을 위해 `tts_model_type`은 여전히 `custom_voice`로 유지합니다.
- `speaker_encoder`는 반드시 `Base 1.7B`에서 가져옵니다.

## 현재 검증된 결과

```text
data/finetune-runs/mai_ko_voicebox17b_full/final
```

확인 결과:

- `tts_model_type = custom_voice`
- `demo_model_family = voicebox`
- `speaker_encoder_included = true`
- `mai` speaker id: `3067`
- `speaker_encoder.*` tensor count: `76`
- total tensor count: `480`
