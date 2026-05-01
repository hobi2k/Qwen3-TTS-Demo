#!/usr/bin/env python3
"""Standalone stage-1 bootstrap training for VoiceBox.

This path trains from CustomVoice while exporting self-contained checkpoints
that already embed the speaker encoder. It is useful for controlled experiments,
although the recommended reproducible path is still:

1. plain CustomVoice fine-tuning
2. VoiceBox checkpoint conversion
3. VoiceBox retraining
"""

from __future__ import annotations

import argparse

from voicebox_training_common import repo_path, run_customvoice_training


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox bootstrap training."""

    parser = argparse.ArgumentParser(
        description="Bootstrap a VoiceBox checkpoint directly from CustomVoice + Base 1.7B encoder."
    )
    parser.add_argument("--train_jsonl", required=True, help="Prepared training JSONL path.")
    parser.add_argument("--init_model_path", required=True, help="Initial CustomVoice checkpoint path.")
    parser.add_argument(
        "--speaker_encoder_model_path",
        required=True,
        help="Base 1.7B checkpoint path used as speaker encoder source.",
    )
    parser.add_argument("--output_model_path", required=True, help="Output run directory.")
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num_epochs", type=int, default=1)
    parser.add_argument("--speaker_name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run bootstrap training and export VoiceBox checkpoints."""

    args = parse_args()
    run_customvoice_training(
        train_jsonl=repo_path(args.train_jsonl),
        init_model_path=repo_path(args.init_model_path),
        output_model_path=repo_path(args.output_model_path),
        speaker_name=args.speaker_name,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_encoder_model_path=repo_path(args.speaker_encoder_model_path),
        embed_speaker_encoder=True,
    )


if __name__ == "__main__":
    main()
