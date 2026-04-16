# VoiceBox 파인튜닝

이 문서는 `VoiceBox` 전용 학습 경로를 설명합니다.

## VoiceBox와 일반 CustomVoice의 차이

일반 `CustomVoice` 학습:

- 외부 `Base 1.7B`의 `speaker_encoder`가 필요할 수 있음
- 결과 체크포인트는 plain `custom_voice`

`VoiceBox` 학습:

- init 체크포인트가 이미 `speaker_encoder`를 포함할 수 있음
- 결과 체크포인트도 `speaker_encoder`를 계속 포함함
- 추가 파인튜닝을 다시 할 때 외부 Base 경로 없이 진행 가능

## 사용 스크립트

- 기존 plain CustomVoice:
  - [qwen3_tts_customvoice_train.py](../../scripts/qwen3_tts_customvoice_train.py)
- VoiceBox 생성:
  - [qwen3_tts_voicebox_bootstrap.py](../../scripts/qwen3_tts_voicebox_bootstrap.py)
- VoiceBox 재학습:
  - [qwen3_tts_voicebox_retrain.py](../../scripts/qwen3_tts_voicebox_retrain.py)

## 1. VoiceBox 생성

처음 `VoiceBox`를 만들 때는 plain `CustomVoice`와 `Base 1.7B`를 같이 씁니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
QWEN_DEMO_ATTN_IMPL=sdpa .venv/bin/python scripts/qwen3_tts_voicebox_bootstrap.py \
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
  --init-customvoice-model-path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --base-speaker-encoder-model-path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-model-path data/finetune-runs/mai_ko_voicebox17b_full \
  --batch-size 1 \
  --lr 2e-6 \
  --num-epochs 1 \
  --speaker-name mai
```

## 2. VoiceBox 재학습

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
QWEN_DEMO_ATTN_IMPL=sdpa .venv/bin/python scripts/qwen3_tts_voicebox_retrain.py \
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
  --init-voicebox-model-path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output-model-path data/finetune-runs/mai_ko_voicebox17b_retrain \
  --batch-size 1 \
  --lr 2e-6 \
  --num-epochs 1 \
  --speaker-name mai
```

## smoke 검증 결과

작은 4샘플 subset으로 아래를 확인했습니다.

- `VoiceBox final`에서 추가 파인튜닝 시작 가능
- 새 checkpoint 생성 가능
- 새 checkpoint에도 `speaker_encoder.*` 유지
- `demo_model_family = "voicebox"` 유지

산출물 예시:

- [mai_ko_voicebox17b_full/final](../../data/finetune-runs/mai_ko_voicebox17b_full/final)
- [voicebox_smoke_retrain_20260415c/final](../../data/finetune-runs/voicebox_smoke_retrain_20260415c/final)

## 권장 순서

1. plain `CustomVoice`를 먼저 학습
2. `make_voicebox_checkpoint.py` 또는 `qwen3_tts_voicebox_bootstrap.py`로 첫 `VoiceBox`를 만든다
3. 이후에는 `qwen3_tts_voicebox_retrain.py`만으로 추가 학습한다

## Hub 업로드

업로드 스크립트:

- [upload_voicebox_to_hub.py](../../scripts/upload_voicebox_to_hub.py)

예시:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python scripts/upload_voicebox_to_hub.py \
  --checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final \
  --repo-id <your-hf-id>/mai-ko-voicebox-1.7b
```

실제 업로드에는 `HF_TOKEN` 또는 `huggingface-cli login`이 필요합니다.
