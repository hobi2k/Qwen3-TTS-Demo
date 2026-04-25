# VoiceBox 체크포인트 변환

이 문서는 기존 링크 호환용 요약 페이지입니다.

현재 기준 상세 문서는 아래를 봅니다.

- [../voicebox/01-checkpoint-conversion.md](../voicebox/01-checkpoint-conversion.md)
- [18-current-experiment-results.md](./18-current-experiment-results.md)

## 현재 기준

VoiceBox 변환은 plain `CustomVoice` fine-tuned checkpoint에 `Base 1.7B`의
`speaker_encoder.*` 가중치와 config를 합쳐 self-contained checkpoint를 만드는 단계입니다.

사용 스크립트:

```text
Qwen3-TTS/fusion/make_voicebox_checkpoint.py
```

현재 검증된 변환 결과:

```text
data/finetune-runs/mai_ko_voicebox17b_full/final
```

확인된 메타데이터:

- `tts_model_type = custom_voice`
- `demo_model_family = voicebox`
- `speaker_encoder_included = true`
- `mai` speaker id: `3067`
- `speaker_encoder.*` tensor count: `76`

## 재현 명령

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python Qwen3-TTS/fusion/make_voicebox_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final
```
