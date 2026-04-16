#!/usr/bin/env python3
"""Create a VoiceBox checkpoint from CustomVoice + Base 1.7B.

This is the bootstrap path:
- init from a plain CustomVoice checkpoint
- borrow the Base 1.7B speaker encoder during training
- export a self-contained VoiceBox checkpoint

Use `qwen3_tts_voicebox_retrain.py` after this step when the init checkpoint
already embeds the speaker encoder.
"""

from __future__ import annotations

import argparse

import qwen3_tts_upstream_train as upstream


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox bootstrap training."""

    parser = argparse.ArgumentParser(description="Bootstrap a VoiceBox checkpoint from CustomVoice + Base 1.7B.")
    parser.add_argument("--train-jsonl", required=True, help="Prepared JSONL path.")
    parser.add_argument("--init-customvoice-model-path", required=True, help="Plain CustomVoice init checkpoint.")
    parser.add_argument(
        "--base-speaker-encoder-model-path",
        required=True,
        help="Base 1.7B checkpoint that supplies the speaker encoder.",
    )
    parser.add_argument("--output-model-path", required=True, help="Run output directory.")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num-epochs", type=int, default=1)
    parser.add_argument("--speaker-name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Run the demo-side VoiceBox bootstrap training flow."""

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
