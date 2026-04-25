#!/usr/bin/env python3
"""Compatibility wrapper for ``voicebox/retrain.py``.

The canonical VoiceBox -> VoiceBox retraining path is now under ``voicebox/``.
This legacy entry point only translates old flag names and forwards execution.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "voicebox" / "retrain.py"
ARG_ALIASES = {
    "--train-jsonl": "--train_jsonl",
    "--init-voicebox-model-path": "--init_model_path",
    "--init-model-path": "--init_model_path",
    "--output-model-path": "--output_model_path",
    "--batch-size": "--batch_size",
    "--num-epochs": "--num_epochs",
    "--speaker-name": "--speaker_name",
}


def normalize_args(argv: list[str]) -> list[str]:
    """Map legacy option names to the canonical retraining CLI."""

    return [ARG_ALIASES.get(arg, arg) for arg in argv]


def main() -> None:
    """Forward execution into ``voicebox/retrain.py``."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *normalize_args(sys.argv[1:])], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
