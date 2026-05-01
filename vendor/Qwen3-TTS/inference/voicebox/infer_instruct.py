#!/usr/bin/env python3
"""Run regular VoiceBox `speaker + instruct` inference."""

from __future__ import annotations

import argparse
from pathlib import Path

import soundfile as sf
import torch

from runtime import load_qwen_or_voicebox_model


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox instruct inference."""

    parser = argparse.ArgumentParser(description="Run VoiceBox regular instruct inference.")
    parser.add_argument("--model-path", required=True, help="VoiceBox or CustomVoice checkpoint path.")
    parser.add_argument("--speaker", default="mai", help="Speaker name.")
    parser.add_argument("--language", default="Korean", help="Language name.")
    parser.add_argument("--text", required=True, help="Target text.")
    parser.add_argument("--instruct", default="", help="Instruction text.")
    parser.add_argument("--output", default="", help="Optional output wav path.")
    parser.add_argument("--seed", type=int, default=None)
    return parser.parse_args()


def resolve_attention() -> str:
    """Return the safest available attention implementation."""

    import importlib.util

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def main() -> None:
    """Load the model, run instruct inference, and save a wav file."""

    args = parse_args()
    model = load_qwen_or_voicebox_model(
        args.model_path,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        attn_implementation=resolve_attention(),
    )
    wavs, fs = model.generate_custom_voice(
        text=args.text,
        speaker=args.speaker,
        language=args.language,
        instruct=args.instruct,
        seed=args.seed,
    )
    output = Path(args.output) if args.output else Path(args.model_path).resolve().parent / "voicebox_infer_output.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, wavs[0], fs)
    print(output)


if __name__ == "__main__":
    main()
