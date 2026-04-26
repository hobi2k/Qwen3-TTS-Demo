# Script Entrypoints

이 문서는 중복되어 보이는 훈련/VoiceBox 스크립트의 책임을 정리합니다.

현재 원칙은 단순합니다.

- 실제 구현은 `Qwen3-TTS` 안의 역할별 폴더에 둡니다.
- `scripts/qwen3_tts_voicebox_*.py` 계열은 호환 래퍼입니다.
- 새 기능이나 버그 수정은 먼저 `Qwen3-TTS/finetuning`, `Qwen3-TTS/fusion`, `Qwen3-TTS/inference`의 canonical script에 반영합니다.
- 오래된 명령을 깨지 않기 위해 `scripts/` 래퍼는 인자 이름을 변환해 canonical script로 넘깁니다.

## Canonical VoiceBox Scripts

| 책임 | canonical script |
| --- | --- |
| plain CustomVoice fine-tuning | `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py` |
| shared training implementation | `Qwen3-TTS/finetuning/voicebox_training_common.py` |
| VoiceBox bootstrap training | `Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py` |
| VoiceBox -> VoiceBox retraining | `Qwen3-TTS/finetuning/sft_voicebox_12hz.py` |
| CustomVoice -> VoiceBox conversion | `Qwen3-TTS/fusion/make_voicebox_checkpoint.py` |
| Hugging Face upload | `Qwen3-TTS/fusion/upload_voicebox_to_hub.py` |
| Private asset manifest/upload | `scripts/prepare_private_hf_assets.py` |
| S2-Pro local model/download profile | `scripts/download_models.sh s2pro` |
| S2-Pro local Fish Speech server | `scripts/serve_s2_pro.sh` |
| non-VoiceBox clone prompt + instruct | `Qwen3-TTS/inference/hybrid_clone_instruct.py` |
| VoiceBox normal instruct inference | `Qwen3-TTS/inference/voicebox/infer_instruct.py` |
| VoiceBox clone experiment | `Qwen3-TTS/inference/voicebox/clone.py` |
| VoiceBox clone + instruct experiment | `Qwen3-TTS/inference/voicebox/clone_instruct.py` |
| shared low-level VoiceBox clone logic | `Qwen3-TTS/inference/voicebox/clone_low_level.py` |
| shared VoiceBox loader/runtime | `Qwen3-TTS/inference/voicebox/runtime.py` |

## Compatibility VoiceBox Folder

## S2-Pro Runtime Scripts

S2-Pro is not a Qwen/VoiceBox training path. It uses local Fish Speech assets:

- source checkout: `vendor/fish-speech`
- model directory: `data/models/fish-speech/s2-pro`
- isolated runtime venv: `.venv-fish-speech`

Do not install Fish Speech into the main `.venv`. Fish Speech dependencies can change the Torch version, which breaks the Qwen/flash-attn runtime. Use `scripts/serve_s2_pro.sh`; it creates and uses the isolated runtime environment.

```bash
./scripts/download_models.sh s2pro
./scripts/serve_s2_pro.sh
```

`voicebox/` remains as a compatibility layer only. The files there forward to the canonical scripts above so old shell history and old docs do not break, but new implementation work should not happen there.

## Compatibility Wrappers

These files remain under `scripts/` for old shell history, old docs, and external callers.
They should not hold independent training logic.

| compatibility wrapper | forwards to |
| --- | --- |
| `scripts/qwen3_tts_customvoice_train.py` | `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py` |
| `scripts/qwen3_tts_voicebox_bootstrap.py` | `Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py` |
| `scripts/qwen3_tts_voicebox_train.py` | dispatches to bootstrap or retrain |
| `scripts/qwen3_tts_voicebox_retrain.py` | `Qwen3-TTS/finetuning/sft_voicebox_12hz.py` |
| `scripts/make_voicebox_checkpoint.py` | `Qwen3-TTS/fusion/make_voicebox_checkpoint.py` |
| `scripts/upload_voicebox_to_hub.py` | `Qwen3-TTS/fusion/upload_voicebox_to_hub.py` |
| `scripts/voicebox_clone_experiment.py` | `Qwen3-TTS/inference/voicebox/clone.py` |
| `scripts/voicebox_clone_instruct_experiment.py` | `Qwen3-TTS/inference/voicebox/clone_instruct.py` |
| `scripts/voicebox_runtime.py` | re-exports `Qwen3-TTS/inference/voicebox/runtime.py` |

## `qwen3_tts_voicebox_train.py` Dispatch Rule

`scripts/qwen3_tts_voicebox_train.py` used to be ambiguous. It now dispatches by arguments:

- If `--speaker-encoder-model-path` or `--base-speaker-encoder-model-path` is provided:
  - forwards to `Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py`
  - use this for plain CustomVoice + Base encoder bootstrap
- If no external speaker encoder path is provided:
  - forwards to `Qwen3-TTS/finetuning/sft_voicebox_12hz.py`
  - use this for existing VoiceBox -> VoiceBox retraining

This keeps older commands working while making the actual implementation path explicit.

## Current Training Code Path

The current verified MAI training flow is:

```bash
# 1. plain CustomVoice
.venv/bin/python Qwen3-TTS/finetuning/sft_custom_voice_12hz.py ...

# 2. CustomVoice -> VoiceBox
.venv/bin/python Qwen3-TTS/fusion/make_voicebox_checkpoint.py ...

# 3. VoiceBox -> VoiceBox
.venv/bin/python Qwen3-TTS/finetuning/sft_voicebox_12hz.py ...
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
- Do not update only a compatibility wrapper and forget the canonical `Qwen3-TTS` script.
- Do not add new VoiceBox behavior under `scripts/` unless it is only a thin wrapper.
- Do not use `scripts/voicebox_runtime.py` for new code. Use `Qwen3-TTS/inference/voicebox/runtime.py` instead.
