#!/usr/bin/env python3
"""Memory-safe tokenizer code preparation for Qwen3-TTS datasets.

This script mirrors upstream ``Qwen3-TTS/finetuning/prepare_data.py`` but keeps
the logic on the demo side so we can adjust batch size and runtime settings
without editing the upstream repository.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_ROOT = REPO_ROOT / "Qwen3-TTS"
sys.path.insert(0, str(UPSTREAM_ROOT))

from qwen_tts import Qwen3TTSTokenizer  # noqa: E402


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for dataset code preparation.

    Returns:
        Parsed command-line namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--device", type=str, default="cuda:0")
    parser.add_argument("--tokenizer_model_path", type=str, required=True)
    parser.add_argument("--input_jsonl", type=str, required=True)
    parser.add_argument("--output_jsonl", type=str, required=True)
    parser.add_argument("--batch_infer_num", type=int, default=4)
    return parser.parse_args()


def main() -> None:
    """Encode dataset audio into audio_codes with a conservative batch size."""

    args = parse_args()
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

    tokenizer_12hz = Qwen3TTSTokenizer.from_pretrained(
        args.tokenizer_model_path,
        device_map=args.device,
    )

    with open(args.input_jsonl, encoding="utf-8") as handle:
        total_lines = [json.loads(line.strip()) for line in handle if line.strip()]

    final_lines = []
    batch_lines = []
    batch_audios = []

    for line in total_lines:
        batch_lines.append(line)
        batch_audios.append(line["audio"])

        if len(batch_lines) >= args.batch_infer_num:
            enc_res = tokenizer_12hz.encode(batch_audios)
            for code, item in zip(enc_res.audio_codes, batch_lines):
                item["audio_codes"] = code.cpu().tolist()
                final_lines.append(item)
            batch_lines.clear()
            batch_audios.clear()

    if batch_audios:
        enc_res = tokenizer_12hz.encode(batch_audios)
        for code, item in zip(enc_res.audio_codes, batch_lines):
            item["audio_codes"] = code.cpu().tolist()
            final_lines.append(item)

    output_path = Path(args.output_jsonl)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for line in final_lines:
            handle.write(json.dumps(line, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
