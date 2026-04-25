# Script Entrypoints

이 문서는 중복되어 보이는 훈련/VoiceBox 스크립트의 책임을 정리합니다.

현재 원칙은 단순합니다.

- 실제 구현은 `voicebox/`에 둡니다.
- `scripts/qwen3_tts_voicebox_*.py` 계열은 호환 래퍼입니다.
- 새 기능이나 버그 수정은 먼저 `voicebox/` canonical script에 반영합니다.
- 오래된 명령을 깨지 않기 위해 `scripts/` 래퍼는 인자 이름을 변환해 canonical script로 넘깁니다.

## Canonical VoiceBox Scripts

| 책임 | canonical script |
| --- | --- |
| plain CustomVoice fine-tuning | `voicebox/sft_plain_custom_voice_12hz.py` |
| plain CustomVoice wrapper | `voicebox/train_customvoice.py` |
| CustomVoice -> VoiceBox conversion | `voicebox/make_checkpoint.py` |
| VoiceBox bootstrap training | `voicebox/sft_voicebox_bootstrap_12hz.py` |
| VoiceBox bootstrap wrapper | `voicebox/bootstrap.py` |
| VoiceBox -> VoiceBox retraining | `voicebox/sft_voicebox_12hz.py` |
| VoiceBox retraining wrapper | `voicebox/retrain.py` |
| VoiceBox normal instruct inference | `voicebox/infer_instruct.py` |
| VoiceBox clone experiment | `voicebox/clone.py` |
| VoiceBox clone + instruct experiment | `voicebox/clone_instruct.py` |
| shared low-level clone logic | `voicebox/clone_low_level.py` |
| shared loader/runtime | `voicebox/runtime.py` |
| shared training implementation | `voicebox/training_common.py` |
| Hugging Face upload | `voicebox/upload_to_hub.py` |

## Compatibility Wrappers

These files remain under `scripts/` for old shell history, old docs, and external callers.
They should not hold independent training logic.

| compatibility wrapper | forwards to |
| --- | --- |
| `scripts/qwen3_tts_customvoice_train.py` | `voicebox/sft_plain_custom_voice_12hz.py` |
| `scripts/qwen3_tts_voicebox_bootstrap.py` | `voicebox/sft_voicebox_bootstrap_12hz.py` |
| `scripts/qwen3_tts_voicebox_train.py` | dispatches to bootstrap or retrain |
| `scripts/qwen3_tts_voicebox_retrain.py` | `voicebox/retrain.py` |
| `scripts/make_voicebox_checkpoint.py` | `voicebox/make_checkpoint.py` |
| `scripts/upload_voicebox_to_hub.py` | `voicebox/upload_to_hub.py` |
| `scripts/voicebox_clone_experiment.py` | `voicebox/clone.py` |
| `scripts/voicebox_clone_instruct_experiment.py` | `voicebox/clone_instruct.py` |
| `scripts/voicebox_runtime.py` | re-exports `voicebox/runtime.py` |

## `qwen3_tts_voicebox_train.py` Dispatch Rule

`scripts/qwen3_tts_voicebox_train.py` used to be ambiguous. It now dispatches by arguments:

- If `--speaker-encoder-model-path` or `--base-speaker-encoder-model-path` is provided:
  - forwards to `voicebox/sft_voicebox_bootstrap_12hz.py`
  - use this for plain CustomVoice + Base encoder bootstrap
- If no external speaker encoder path is provided:
  - forwards to `voicebox/sft_voicebox_12hz.py`
  - use this for existing VoiceBox -> VoiceBox retraining

This keeps older commands working while making the actual implementation path explicit.

## Current Training Code Path

The current verified MAI training flow is:

```bash
# 1. plain CustomVoice
.venv/bin/python voicebox/sft_plain_custom_voice_12hz.py ...

# 2. CustomVoice -> VoiceBox
.venv/bin/python voicebox/make_checkpoint.py ...

# 3. VoiceBox -> VoiceBox
.venv/bin/python voicebox/sft_voicebox_12hz.py ...
```

The current full-run dataset is:

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

The current stable full-run optimizer setting is:

```bash
QWEN_DEMO_OPTIMIZER=adafactor
```

Use `Adafactor` as a memory-stability option for 1.7B full runs on 16GB GPUs,
not as a quality guarantee.

## What Not To Do

- Do not duplicate training loops into `scripts/qwen3_tts_voicebox_*.py`.
- Do not update only a compatibility wrapper and forget the canonical `voicebox/` script.
- Do not add new VoiceBox behavior under `scripts/` unless it is only a thin wrapper.
- Do not use `scripts/voicebox_runtime.py` for new code. Import `voicebox/runtime.py` instead.
