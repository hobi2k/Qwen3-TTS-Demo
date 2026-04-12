# Pristine Upstream Fine-Tune Wrappers

This guide documents the demo-side training wrappers that run against a clean
`Qwen3-TTS/` checkout without editing any existing upstream file.

The important baseline facts are:

- The pristine upstream tree contains `finetuning/prepare_data.py` and
  `finetuning/sft_12hz.py`.
- The original upstream tree does **not** ship a `finetuning/sft_custom_voice_12hz.py`
  file, so this demo adds that capability as a **new file** only.
- Existing upstream files stay untouched; demo-specific behavior is added through
  new scripts and wrapper commands.

## Clean upstream expectations

Verified against the clean tree:

- `Qwen3-TTS/finetuning/README.md`
- `Qwen3-TTS/finetuning/prepare_data.py`
- `Qwen3-TTS/finetuning/sft_12hz.py`
- `Qwen3-TTS/finetuning/dataset.py`
- Demo-only additions:
  - `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py`
  - `Qwen3-TTS/examples/test_model_12hz_custom_clone_instruct.py`

Path assumptions:

- The repository root is `Qwen3-TTS-Demo/`
- The canonical dataset is `data/datasets/mai_ko_full/`
- Raw JSONL lives at `data/datasets/mai_ko_full/raw.jsonl`
- Prepared JSONL lives at `data/datasets/mai_ko_full/prepared.jsonl`
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

This reads `data/datasets/mai_ko_full/raw.jsonl` and writes
`data/datasets/mai_ko_full/prepared.jsonl`.

### 2) Base 1.7B fine-tuning

```bash
python scripts/qwen3_tts_upstream_train.py \
  train-base \
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
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
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
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
script under `Qwen3-TTS/finetuning/`. The wrapper can still be used as the
clean command-line front door, but the actual CustomVoice trainer also exists in
the upstream tree as a new file so backend and manual CLI runs share the same
layout.

## What to keep untouched

Do not edit the existing upstream files in `Qwen3-TTS/`.
If a new feature is needed, add it as a new file only, or keep it on the demo
side as a wrapper, depending on which path keeps the baseline easiest to audit.
