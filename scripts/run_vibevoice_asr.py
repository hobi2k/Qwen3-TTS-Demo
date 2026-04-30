#!/usr/bin/env python3
"""Run Microsoft VibeVoice-ASR from a vendor checkout and emit JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VibeVoice-ASR helper")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--language", default="auto")
    parser.add_argument("--task", default="transcribe")
    parser.add_argument("--context-info", default="")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--precision", default="auto")
    parser.add_argument("--attn-implementation", default="auto")
    parser.add_argument("--max-new-tokens", type=int, default=256)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--num-beams", type=int, default=1)
    parser.add_argument("--return-timestamps", action="store_true")
    return parser.parse_args()


def preferred_device(value: str) -> str:
    if value and value != "auto":
        return value
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    device = preferred_device(args.device)
    try:
        import torch
        from vibevoice.modular.modeling_vibevoice_asr import VibeVoiceASRForConditionalGeneration
        from vibevoice.processor.vibevoice_asr_processor import VibeVoiceASRProcessor
    except Exception as exc:  # pragma: no cover - vendor dependency
        raise RuntimeError(
            "Could not import VibeVoice-ASR modules. Install vendor/VibeVoice requirements in .venv-vibevoice."
        ) from exc

    dtype = torch.float32
    if args.precision in {"float16", "fp16"}:
        dtype = torch.float16
    elif args.precision in {"bfloat16", "bf16"}:
        dtype = torch.bfloat16

    processor = VibeVoiceASRProcessor.from_pretrained(args.model_path, language_model_pretrained_name="Qwen/Qwen2.5-7B")
    model = VibeVoiceASRForConditionalGeneration.from_pretrained(
        args.model_path,
        dtype=dtype,
        trust_remote_code=True,
        **({} if args.attn_implementation == "auto" else {"attn_implementation": args.attn_implementation}),
    )
    model.to(device)
    model.eval()

    inputs = processor(
        audio=[str(Path(args.audio))],
        sampling_rate=None,
        return_tensors="pt",
        padding=True,
        add_generation_prompt=True,
        context_info=args.context_info or None,
    )
    inputs = {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}

    generation_kwargs = {
        "max_new_tokens": args.max_new_tokens,
        "temperature": args.temperature,
        "top_p": args.top_p,
        "num_beams": args.num_beams,
    }
    if args.language and args.language != "auto":
        generation_kwargs["language"] = args.language
    if args.task:
        generation_kwargs["task"] = args.task

    with torch.no_grad():
        generated = model.generate(**inputs, **generation_kwargs)
    generated_ids = generated[0, inputs["input_ids"].shape[1]:]
    text = processor.decode(generated_ids, skip_special_tokens=True).strip()

    result = {
        "text": text,
        "language": None if args.language == "auto" else args.language,
        "segments": [],
        "meta": {
            "provider": "vibevoice",
            "task": args.task,
            "device": device,
            "model_path": args.model_path,
            "return_timestamps": args.return_timestamps,
        },
    }
    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
