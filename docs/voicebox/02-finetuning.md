# VoiceBox 파인튜닝

이 문서는 `VoiceBox` 관련 학습 경로를 **세 단계**로 구분해 설명합니다.

## VoiceBox와 일반 CustomVoice의 차이

일반 `CustomVoice` 학습:

- 외부 `Base 1.7B`의 `speaker_encoder`가 필요할 수 있음
- 결과 체크포인트는 plain `custom_voice`

`VoiceBox` 학습:

- init 체크포인트가 이미 `speaker_encoder`를 포함할 수 있음
- 결과 체크포인트도 `speaker_encoder`를 계속 포함함
- 추가 파인튜닝을 다시 할 때 외부 Base 경로 없이 진행 가능

## 사용 스크립트

- 1단계 plain `CustomVoice` 학습:
  - [sft_custom_voice_12hz.py](../../Qwen3-TTS/finetuning/sft_custom_voice_12hz.py)
  - [sft_custom_voice_12hz_legacy.py](../../Qwen3-TTS/finetuning/sft_custom_voice_12hz_legacy.py) 이전 구현 보존본
  - [train_customvoice.py](../../voicebox/train_customvoice.py) 호환 래퍼
- 2단계 `CustomVoice -> VoiceBox` 변환:
  - [make_voicebox_checkpoint.py](../../Qwen3-TTS/fusion/make_voicebox_checkpoint.py)
- 3단계 `VoiceBox -> VoiceBox` 재학습:
  - [sft_voicebox_12hz.py](../../Qwen3-TTS/finetuning/sft_voicebox_12hz.py)
  - [retrain.py](../../voicebox/retrain.py) 호환 래퍼
- 보조 경로:
  - [sft_voicebox_bootstrap_12hz.py](../../Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py)
  - [bootstrap.py](../../voicebox/bootstrap.py) 호환 래퍼

## 1. plain `CustomVoice`에 새 화자 추가 학습

처음에는 plain `CustomVoice`에 `mai`를 추가합니다. 이 단계는 아직 `VoiceBox`가 아닙니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
.venv/bin/python Qwen3-TTS/finetuning/sft_custom_voice_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --speaker_encoder_model_path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output_model_path data/finetune-runs/mai_ko_customvoice17b_full \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 3 \
  --speaker_name mai
```

이 단계 결과:

- `tts_model_type = custom_voice`
- `speaker_encoder.*`는 checkpoint 안에 없음
- 외부 `Base 1.7B` encoder에 의존한 학습 결과

## 2. 파인튜닝된 `CustomVoice`를 `VoiceBox`로 변환

이제 1단계 결과에 `Base 1.7B`의 `speaker_encoder`를 포함시켜 self-contained `VoiceBox`를 만듭니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python Qwen3-TTS/fusion/make_voicebox_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final
```

이 단계 결과:

- `demo_model_family = "voicebox"`
- `speaker_encoder_included = true`
- `speaker_encoder.*`가 checkpoint 안에 포함됨

## 3. `VoiceBox -> VoiceBox` 추가 학습

이제 외부 `Base` 경로 없이 `VoiceBox`만으로 재학습합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
.venv/bin/python Qwen3-TTS/finetuning/sft_voicebox_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output_model_path data/finetune-runs/mai_ko_voicebox17b_full_extra1 \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 1 \
  --speaker_name mai
```

이 단계 결과:

- `VoiceBox`를 다시 `VoiceBox`로 학습
- `speaker_encoder.*` 유지
- 외부 `Base` 경로 없이 추가 학습 가능

## full 검증 결과

현재 clean MAI dataset `727`개 샘플 기준으로 아래를 확인했습니다.

- `VoiceBox final`에서 추가 파인튜닝 시작 가능
- 새 checkpoint 생성 가능
- 새 checkpoint에도 `speaker_encoder.*` 유지
- `demo_model_family = "voicebox"` 유지
- WSL/GPU 튕김 없이 1 epoch 완료
- 추가 학습 후 clone / clone + instruct 생성 가능

산출물 예시:

- [mai_ko_voicebox17b_full/final](../../data/finetune-runs/mai_ko_voicebox17b_full/final)
- [mai_ko_voicebox17b_full_extra1/final](../../data/finetune-runs/mai_ko_voicebox17b_full_extra1/final)

## Optimizer 운영

기본 optimizer는 `AdamW`입니다. 다만 1.7B full fine-tuning에서 RTX 5080 16GB 환경은 optimizer state 메모리 피크가 커질 수 있습니다.

현재 검증된 MAI full run은 아래 설정으로 완료했습니다.

```bash
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
QWEN_DEMO_OPTIMIZER=adafactor
QWEN_DEMO_LOG_EVERY=25
QWEN_DEMO_GRAD_ACCUM_STEPS=1
```

`Adafactor`는 품질 향상용 설정이 아니라, 메모리 피크를 낮춰 학습을 완료하기 위한 안정화 선택입니다.
품질은 반드시 생성 wav, Whisper 전사, speaker similarity, 실제 청취로 따로 판정합니다.

## 보조 경로: bootstrap

[sft_voicebox_bootstrap_12hz.py](../../Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py)는 `CustomVoice + Base 1.7B`를 바로 물려 첫 `VoiceBox` 런을 만드는 보조 스크립트입니다.

다만 지금 기준 주 경로는 아닙니다. 디버깅과 재현성을 위해서는 위의 `1 -> 2 -> 3` 단계를 권장합니다.

## Hub 업로드

업로드 스크립트:

- [upload_voicebox_to_hub.py](../../Qwen3-TTS/fusion/upload_voicebox_to_hub.py)

예시:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python Qwen3-TTS/fusion/upload_voicebox_to_hub.py \
  --checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final \
  --repo-id <your-hf-id>/mai-ko-voicebox-1.7b
```

실제 업로드에는 `HF_TOKEN` 또는 `huggingface-cli login`이 필요합니다.
