# Pristine Upstream Fine-Tune Wrappers

This guide documents the demo-side training scripts that run against a clean
`vendor/Qwen3-TTS/` checkout without editing any existing upstream file. The current
execution location for demo-owned Qwen code is `qwen_extensions/`.

The important baseline facts are:

- The pristine upstream tree contains `finetuning/prepare_data.py` and
  `finetuning/sft_12hz.py`.
- The original upstream tree does **not** ship a `finetuning/sft_custom_voice_12hz.py`
  file, so this demo adds that capability as a **new file** only.
- Existing upstream files stay untouched; demo-specific behavior is added through
  `qwen_extensions` scripts.

## Clean upstream expectations

Verified against the clean tree:

- `vendor/Qwen3-TTS/finetuning/README.md`
- `vendor/Qwen3-TTS/finetuning/prepare_data.py`
- `vendor/Qwen3-TTS/finetuning/sft_12hz.py`
- `vendor/Qwen3-TTS/finetuning/dataset.py`
- Demo-only additions:
  - `qwen_extensions/finetuning/sft_custom_voice_12hz.py`
  - `vendor/Qwen3-TTS/examples/test_model_12hz_custom_clone_instruct.py`

Path assumptions:

- The repository root is `Qwen3-TTS-Demo/`
- The canonical dataset is `data/datasets/mai_ko_full/`
- Raw JSONL lives at `data/datasets/mai_ko_full/raw.jsonl`
- Current cleaned prepared JSONL lives at `data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl`
- Dataset audio lives in `data/datasets/mai_ko_full/audio/`
- The wrapper resolves repo-relative paths from the project root, so the raw JSONL
  can keep values like `data/datasets/mai_ko_full/audio/00000.wav`

## Wrapper CLI

The wrapper entrypoint is:

```bash
python scripts/qwen3_tts_upstream_train.py --help
```

It exposes three subcommands:

- `prepare-data`
- `train-base`
- `train-customvoice`

## Canonical commands for `mai_ko_full`

### 1) Prepare audio codes

```bash
python scripts/qwen3_tts_upstream_train.py \
  prepare-data \
  --dataset-root data/datasets/mai_ko_full \
  --tokenizer-model-path data/models/Qwen3-TTS-Tokenizer-12Hz \
  --device cuda:0
```

This reads `data/datasets/mai_ko_full/raw.jsonl` and can write a prepared JSONL.
For the current MAI full run, use the cleaned prepared JSONL instead:

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

That file keeps `727` rows after filtering unsuitable text and duration cases.

### 2) Base 1.7B fine-tuning

```bash
python scripts/qwen3_tts_upstream_train.py \
  train-base \
  --train-jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init-model-path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-model-path data/finetune-runs/mai_ko_base17b_full \
  --speaker-name mai \
  --batch-size 1 \
  --lr 2e-6 \
  --num-epochs 3
```

Important blocker:

- The pristine upstream `sft_12hz.py` hardcodes `flash_attention_2`.
- Because of that, the wrapper refuses to launch Base fine-tuning unless a
  compatible `flash_attn` v2 module is installed.
- If the machine only has a different FlashAttention wheel, the command stops
  early instead of silently drifting away from the pristine baseline.

### 3) CustomVoice 1.7B fine-tuning

```bash
python scripts/qwen3_tts_upstream_train.py \
  train-customvoice \
  --train-jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init-model-path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --speaker-encoder-model-path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-model-path data/finetune-runs/mai_ko_customvoice17b_full \
  --speaker-name mai \
  --batch-size 1 \
  --lr 2e-6 \
  --num-epochs 3
```

Because the original upstream repository does not ship a dedicated
`sft_custom_voice_12hz.py`, this demo adds that capability as a new standalone
script under `vendor/Qwen3-TTS/finetuning/`. The wrapper can still be used as the
clean command-line front door, but the actual CustomVoice trainer also exists in
the upstream tree as a new file so backend and manual CLI runs share the same
layout.

## Current optimizer note

For 1.7B full runs on RTX 5080 16GB, `AdamW` may create a large optimizer-state
memory peak. The current MAI full run was completed with:

```bash
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
QWEN_DEMO_OPTIMIZER=adafactor
```

`Adafactor` is a memory-stability choice, not a quality guarantee. Quality still
needs generated wav review, Qwen3-ASR transcription, and speaker-similarity checks.

## What to keep untouched

Do not edit the existing upstream files in `vendor/Qwen3-TTS/`.
If a new feature is needed, add it as a new file only, or keep it on the demo
side as a wrapper, depending on which path keeps the baseline easiest to audit.
