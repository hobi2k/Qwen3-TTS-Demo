#!/usr/bin/env python3
"""Fine-tune an already self-contained VoiceBox checkpoint.

This path assumes the init checkpoint already embeds:
- `speaker_encoder.*`
- `speaker_encoder_config`
- `demo_model_family = "voicebox"`

It intentionally does not require an external Base 1.7B path.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import qwen3_tts_upstream_train as upstream


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
    """Run the demo-side VoiceBox-only retraining flow."""

    args = parse_args()
    init_path = Path(args.init_voicebox_model_path)
    if not init_path.is_absolute():
        init_path = (upstream.REPO_ROOT / init_path).resolve()
    if not upstream.checkpoint_has_speaker_encoder(init_path):
        raise SystemExit(
            f"{init_path} does not embed speaker_encoder weights. "
            "Use qwen3_tts_voicebox_bootstrap.py first."
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
