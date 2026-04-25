#!/usr/bin/env python3
"""Compatibility wrapper for the VoiceBox bootstrap script.

The maintained bootstrap implementation lives in
``voicebox/sft_voicebox_bootstrap_12hz.py``. This wrapper keeps older commands
working while routing all behavior through the current VoiceBox code path.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "voicebox" / "sft_voicebox_bootstrap_12hz.py"
ARG_ALIASES = {
    "--train-jsonl": "--train_jsonl",
    "--init-customvoice-model-path": "--init_model_path",
    "--init-model-path": "--init_model_path",
    "--base-speaker-encoder-model-path": "--speaker_encoder_model_path",
    "--speaker-encoder-model-path": "--speaker_encoder_model_path",
    "--output-model-path": "--output_model_path",
    "--batch-size": "--batch_size",
    "--num-epochs": "--num_epochs",
    "--speaker-name": "--speaker_name",
}


def normalize_args(argv: list[str]) -> list[str]:
    """Map legacy option names to the canonical bootstrap CLI."""

    return [ARG_ALIASES.get(arg, arg) for arg in argv]


def main() -> None:
    """Forward execution into ``voicebox/sft_voicebox_bootstrap_12hz.py``."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *normalize_args(sys.argv[1:])], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
