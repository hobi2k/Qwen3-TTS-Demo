#!/usr/bin/env python3
"""Stage 1 fine-tuning for plain CustomVoice.

This is the demo-maintained CustomVoice path. It keeps the upstream file name
because this stage is still CustomVoice fine-tuning, but the implementation
uses ``voicebox_training_common`` so it matches the verified VoiceBox pipeline.
"""

from __future__ import annotations

import argparse

from voicebox_training_common import repo_path, run_customvoice_training


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for plain CustomVoice fine-tuning."""

    parser = argparse.ArgumentParser(
        description="Fine-tune plain CustomVoice with an external Base 1.7B speaker encoder."
    )
    parser.add_argument("--train_jsonl", required=True, help="Prepared training JSONL path.")
    parser.add_argument("--init_model_path", required=True, help="Initial CustomVoice checkpoint path.")
    parser.add_argument(
        "--speaker_encoder_model_path",
        required=True,
        help="External Base 1.7B checkpoint path used only during training.",
    )
    parser.add_argument("--output_model_path", required=True, help="Output run directory.")
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--speaker_name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run stage-1 fine-tuning and export plain CustomVoice checkpoints."""

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
        embed_speaker_encoder=False,
    )


if __name__ == "__main__":
    main()
