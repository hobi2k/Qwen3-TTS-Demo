#!/usr/bin/env python3
"""Retrain an existing self-contained VoiceBox checkpoint."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import qwen3_tts_upstream_train as upstream  # type: ignore


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox-only retraining."""

    parser = argparse.ArgumentParser(description="Fine-tune an existing VoiceBox checkpoint without external Base.")
    parser.add_argument("--train-jsonl", required=True, help="Prepared JSONL path.")
    parser.add_argument("--init-voicebox-model-path", required=True, help="Existing VoiceBox checkpoint.")
    parser.add_argument("--output-model-path", required=True, help="Run output directory.")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num-epochs", type=int, default=1)
    parser.add_argument("--speaker-name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run VoiceBox-only retraining."""

    args = parse_args()
    init_path = Path(args.init_voicebox_model_path)
    if not init_path.is_absolute():
        init_path = (REPO_ROOT / init_path).resolve()
    if not upstream.checkpoint_has_speaker_encoder(init_path):
        raise SystemExit(
            f"{init_path} does not embed speaker_encoder weights. Use voicebox/bootstrap.py or voicebox/make_checkpoint.py first."
        )

    namespace = argparse.Namespace(
        train_jsonl=args.train_jsonl,
        init_model_path=str(init_path),
        speaker_encoder_model_path="",
        output_model_path=args.output_model_path,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_name=args.speaker_name,
    )
    upstream.train_customvoice_command(namespace)


if __name__ == "__main__":
    main()
