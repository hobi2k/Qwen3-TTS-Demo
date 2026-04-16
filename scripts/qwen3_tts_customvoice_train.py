#!/usr/bin/env python3
"""Run the preserved plain CustomVoice fine-tuning pipeline.

This wrapper intentionally keeps the legacy CustomVoice behavior:
- init from a CustomVoice checkpoint
- use an external speaker encoder source when needed
- export a plain `custom_voice` checkpoint
- do not embed `speaker_encoder.*` weights in the result

Use `qwen3_tts_voicebox_train.py` when you want the self-contained VoiceBox
variant that embeds the Base 1.7B speaker encoder.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_CUSTOMVOICE_SFT = REPO_ROOT / "Qwen3-TTS" / "finetuning" / "sft_custom_voice_12hz.py"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the preserved CustomVoice wrapper."""

    parser = argparse.ArgumentParser(description="Run plain CustomVoice fine-tuning without VoiceBox export.")
    parser.add_argument("--train-jsonl", required=True, help="Prepared JSONL path.")
    parser.add_argument("--init-model-path", required=True, help="CustomVoice init checkpoint.")
    parser.add_argument(
        "--speaker-encoder-model-path",
        default="",
        help="Compatible Base checkpoint path used only during training.",
    )
    parser.add_argument("--output-model-path", required=True, help="Run output directory.")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--num-epochs", type=int, default=3)
    parser.add_argument("--speaker-name", default="speaker_test")
    return parser.parse_args()


def main() -> None:
    """Forward arguments into the preserved CustomVoice training script."""

    args = parse_args()
    command = [
        sys.executable,
        str(UPSTREAM_CUSTOMVOICE_SFT),
        "--train_jsonl",
        str((REPO_ROOT / args.train_jsonl).resolve() if not Path(args.train_jsonl).is_absolute() else Path(args.train_jsonl)),
        "--init_model_path",
        str((REPO_ROOT / args.init_model_path).resolve() if not Path(args.init_model_path).is_absolute() else Path(args.init_model_path)),
        "--output_model_path",
        str((REPO_ROOT / args.output_model_path).resolve() if not Path(args.output_model_path).is_absolute() else Path(args.output_model_path)),
        "--batch_size",
        str(args.batch_size),
        "--lr",
        str(args.lr),
        "--num_epochs",
        str(args.num_epochs),
        "--speaker_name",
        args.speaker_name,
    ]
    if args.speaker_encoder_model_path:
        command.extend(
            [
                "--speaker_encoder_model_path",
                str(
                    (REPO_ROOT / args.speaker_encoder_model_path).resolve()
                    if not Path(args.speaker_encoder_model_path).is_absolute()
                    else Path(args.speaker_encoder_model_path)
                ),
            ]
        )
    subprocess.run(command, check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
