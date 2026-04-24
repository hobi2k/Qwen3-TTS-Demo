#!/usr/bin/env python3
"""Standalone stage-3 VoiceBox -> VoiceBox retraining."""

from __future__ import annotations

import argparse

from training_common import checkpoint_has_speaker_encoder, repo_path, run_customvoice_training


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox-only retraining."""

    parser = argparse.ArgumentParser(description="Retrain an existing VoiceBox checkpoint without external Base.")
    parser.add_argument("--train_jsonl", required=True, help="Prepared training JSONL path.")
    parser.add_argument("--init_model_path", required=True, help="Initial VoiceBox checkpoint path.")
    parser.add_argument("--output_model_path", required=True, help="Output run directory.")
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num_epochs", type=int, default=1)
    parser.add_argument("--speaker_name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run VoiceBox -> VoiceBox retraining."""

    args = parse_args()
    init_model_path = repo_path(args.init_model_path)
    if not checkpoint_has_speaker_encoder(init_model_path):
        raise SystemExit(
            f"{init_model_path} does not embed speaker_encoder weights. "
            "Create a VoiceBox checkpoint first with voicebox/make_checkpoint.py."
        )

    run_customvoice_training(
        train_jsonl=repo_path(args.train_jsonl),
        init_model_path=init_model_path,
        output_model_path=repo_path(args.output_model_path),
        speaker_name=args.speaker_name,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_encoder_model_path=None,
        embed_speaker_encoder=True,
    )


if __name__ == "__main__":
    main()
