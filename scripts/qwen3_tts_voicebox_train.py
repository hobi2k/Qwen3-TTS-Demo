#!/usr/bin/env python3
"""Run the dedicated VoiceBox fine-tuning pipeline.

VoiceBox is the self-contained variant that starts from a CustomVoice-like
checkpoint and exports a checkpoint that still behaves like `custom_voice`
for inference, but also embeds the Base 1.7B speaker encoder so it can be
fine-tuned again without an external Base path.
"""

from __future__ import annotations

import argparse

import qwen3_tts_upstream_train as upstream


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox fine-tuning."""

    parser = argparse.ArgumentParser(description="Run self-contained VoiceBox fine-tuning.")
    parser.add_argument("--train-jsonl", required=True, help="Prepared JSONL path.")
    parser.add_argument("--init-model-path", required=True, help="VoiceBox or CustomVoice init checkpoint.")
    parser.add_argument(
        "--speaker-encoder-model-path",
        default="",
        help="Optional Base 1.7B source. Omit this when the init checkpoint already embeds the encoder.",
    )
    parser.add_argument("--output-model-path", required=True, help="Run output directory.")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-6)
    parser.add_argument("--num-epochs", type=int, default=1)
    parser.add_argument("--speaker-name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Delegate into the demo-side VoiceBox training command."""

    args = parse_args()
    namespace = argparse.Namespace(
        train_jsonl=args.train_jsonl,
        init_model_path=args.init_model_path,
        speaker_encoder_model_path=args.speaker_encoder_model_path,
        output_model_path=args.output_model_path,
        batch_size=args.batch_size,
        lr=args.lr,
        num_epochs=args.num_epochs,
        speaker_name=args.speaker_name,
    )
    upstream.train_customvoice_command(namespace)


if __name__ == "__main__":
    main()
