#!/usr/bin/env python3
"""Bootstrap a VoiceBox run from CustomVoice + Base 1.7B."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import qwen3_tts_upstream_train as upstream  # type: ignore


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox bootstrap training."""

    parser = argparse.ArgumentParser(description="Bootstrap a VoiceBox checkpoint from CustomVoice + Base 1.7B.")
    parser.add_argument("--train-jsonl", required=True, help="Prepared JSONL path.")
    parser.add_argument("--init-customvoice-model-path", required=True, help="Plain CustomVoice init checkpoint.")
    parser.add_argument("--base-speaker-encoder-model-path", required=True, help="Base 1.7B encoder source.")
    parser.add_argument("--output-model-path", required=True, help="Run output directory.")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num-epochs", type=int, default=1)
    parser.add_argument("--speaker-name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Delegate into the VoiceBox bootstrap training backend."""

    args = parse_args()
    namespace = argparse.Namespace(
        train_jsonl=args.train_jsonl,
        init_model_path=args.init_customvoice_model_path,
        speaker_encoder_model_path=args.base_speaker_encoder_model_path,
        output_model_path=args.output_model_path,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_name=args.speaker_name,
    )
    upstream.train_customvoice_command(namespace)


if __name__ == "__main__":
    main()
