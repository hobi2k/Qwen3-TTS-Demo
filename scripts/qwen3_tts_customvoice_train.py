#!/usr/bin/env python3
"""Compatibility wrapper for plain CustomVoice fine-tuning.

The maintained stage-1 implementation lives in
``voicebox/sft_plain_custom_voice_12hz.py``. It preserves the plain
CustomVoice behavior: borrow an external Base speaker encoder during training,
but do not embed ``speaker_encoder.*`` into the exported checkpoint.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "voicebox" / "sft_plain_custom_voice_12hz.py"
ARG_ALIASES = {
    "--train-jsonl": "--train_jsonl",
    "--init-model-path": "--init_model_path",
    "--speaker-encoder-model-path": "--speaker_encoder_model_path",
    "--output-model-path": "--output_model_path",
    "--batch-size": "--batch_size",
    "--num-epochs": "--num_epochs",
    "--speaker-name": "--speaker_name",
}


def normalize_args(argv: list[str]) -> list[str]:
    """Map legacy option names to the canonical plain CustomVoice CLI."""

    return [ARG_ALIASES.get(arg, arg) for arg in argv]


def main() -> None:
    """Forward execution into ``voicebox/sft_plain_custom_voice_12hz.py``."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *normalize_args(sys.argv[1:])], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
