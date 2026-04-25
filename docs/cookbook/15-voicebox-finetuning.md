# VoiceBox 파인튜닝

이 문서는 기존 링크 호환용 요약 페이지입니다.

현재 기준 상세 문서는 아래를 봅니다.

- [../voicebox/02-finetuning.md](../voicebox/02-finetuning.md)
- [18-current-experiment-results.md](./18-current-experiment-results.md)

## 현재 기준 3단계

1. plain `CustomVoice`에 `mai` 화자 추가 학습
2. plain `CustomVoice -> VoiceBox` 변환
3. `VoiceBox -> VoiceBox` 1 epoch 추가 학습

현재 검증된 최종 VoiceBox 추가 학습 결과:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

검증된 상태:

- `demo_model_family = voicebox`
- `speaker_encoder_included = true`
- `mai` speaker id: `3067`
- `speaker_encoder.*` tensor count: `76`
- 외부 `speaker_encoder_model_path` 없이 추가 학습 완료

## 현재 full run 명령

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
.venv/bin/python voicebox/sft_voicebox_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output_model_path data/finetune-runs/mai_ko_voicebox17b_full_extra1 \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 1 \
  --speaker_name mai
```

## Optimizer 메모

현재 MAI full run은 `QWEN_DEMO_OPTIMIZER=adafactor`로 완료했습니다.
이는 품질 향상 설정이 아니라 RTX 5080 16GB 환경에서 optimizer state 메모리 피크를 낮추기 위한 운영 선택입니다.
