#!/usr/bin/env python3
"""Demo-maintained Base fine-tuning entrypoint.

The pristine upstream ``vendor/Qwen3-TTS/finetuning/sft_12hz.py`` is kept
untouched, but it currently assumes older ``accelerate`` logging behavior and a
hardcoded optimizer setup. This extension entrypoint preserves the same Base
SFT behavior while using the shared training implementation that already
supports the demo's runtime knobs and cleanup-friendly checkpoint layout.
"""

from __future__ import annotations

import argparse

from voicebox_training_common import repo_path, run_customvoice_training


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for Base model speaker fine-tuning."""

    parser = argparse.ArgumentParser(description="Fine-tune a Qwen3-TTS Base checkpoint into a speaker checkpoint.")
    parser.add_argument("--train_jsonl", required=True, help="Prepared training JSONL path.")
    parser.add_argument("--init_model_path", required=True, help="Initial Base checkpoint path.")
    parser.add_argument("--output_model_path", required=True, help="Output run directory.")
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--speaker_name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run Base SFT and export the latest checkpoint under ``final/``."""

    args = parse_args()
    run_customvoice_training(
        train_jsonl=repo_path(args.train_jsonl),
        init_model_path=repo_path(args.init_model_path),
        output_model_path=repo_path(args.output_model_path),
        speaker_name=args.speaker_name,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_encoder_model_path=None,
        embed_speaker_encoder=False,
    )


if __name__ == "__main__":
    main()
