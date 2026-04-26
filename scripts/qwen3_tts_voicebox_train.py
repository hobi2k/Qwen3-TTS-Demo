#!/usr/bin/env python3
"""Compatibility wrapper for the canonical VoiceBox training scripts.

This entry point used to cover both bootstrap and retraining cases. It now
dispatches to the maintained ``Qwen3-TTS/finetuning`` scripts:

* with ``--speaker-encoder-model-path``: ``sft_voicebox_bootstrap_12hz.py``
* without it: ``sft_voicebox_12hz.py``
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RETRAIN_SCRIPT = REPO_ROOT / "Qwen3-TTS" / "finetuning" / "sft_voicebox_12hz.py"
BOOTSTRAP_SCRIPT = REPO_ROOT / "Qwen3-TTS" / "finetuning" / "sft_voicebox_bootstrap_12hz.py"
RETRAIN_ALIASES = {
    "--train-jsonl": "--train_jsonl",
    "--init-model-path": "--init_model_path",
    "--init-voicebox-model-path": "--init_model_path",
    "--output-model-path": "--output_model_path",
    "--batch-size": "--batch_size",
    "--num-epochs": "--num_epochs",
    "--speaker-name": "--speaker_name",
}
BOOTSTRAP_ALIASES = {
    **RETRAIN_ALIASES,
    "--init-customvoice-model-path": "--init_model_path",
    "--speaker-encoder-model-path": "--speaker_encoder_model_path",
    "--base-speaker-encoder-model-path": "--speaker_encoder_model_path",
}


def uses_external_speaker_encoder(argv: list[str]) -> bool:
    """Return whether the command is asking for bootstrap training."""

    flags = {"--speaker-encoder-model-path", "--base-speaker-encoder-model-path", "--speaker_encoder_model_path"}
    for index, arg in enumerate(argv):
        if arg in flags:
            if index + 1 >= len(argv):
                return True
            return bool(argv[index + 1]) and not argv[index + 1].startswith("--")
        for flag in flags:
            if arg.startswith(f"{flag}="):
                return bool(arg.split("=", 1)[1])
    return False


def normalize_args(argv: list[str], aliases: dict[str, str]) -> list[str]:
    """Map older option aliases to the selected canonical CLI."""

    normalized: list[str] = []
    for arg in argv:
        if "=" in arg:
            key, value = arg.split("=", 1)
            normalized.append(f"{aliases.get(key, key)}={value}")
        else:
            normalized.append(aliases.get(arg, arg))
    return normalized


def main() -> None:
    """Forward execution into the correct canonical VoiceBox trainer."""

    argv = sys.argv[1:]
    if uses_external_speaker_encoder(argv):
        script = BOOTSTRAP_SCRIPT
        aliases = BOOTSTRAP_ALIASES
    else:
        script = RETRAIN_SCRIPT
        aliases = RETRAIN_ALIASES
    subprocess.run([sys.executable, str(script), *normalize_args(argv, aliases)], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
