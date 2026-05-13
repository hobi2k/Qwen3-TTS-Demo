#!/usr/bin/env python3
"""Run one OmniVoice inference request in an isolated process."""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional

import soundfile as sf

SUPPORTED_TASKS = {"auto_voice", "voice_design", "voice_cloning"}


def _coerce_optional_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_optional_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return default


def _resolve_existing_path(value: Any) -> Optional[str]:
    if not value:
        return None
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Reference audio not found: {path}")
    return str(path)


def _get_dtype_and_device(requested: Optional[str]):
    import torch

    if requested:
        device = requested
    elif torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"

    if device.startswith("cuda"):
        dtype = torch.float16
    elif device == "mps":
        dtype = torch.float16
    else:
        dtype = torch.float32
    return device, dtype


def _run(payload: Dict[str, Any], output_path: Path, model_dir: Path) -> Dict[str, Any]:
    import torch
    from omnivoice.models.omnivoice import OmniVoice

    task = payload.get("task") or "auto_voice"
    if task not in SUPPORTED_TASKS:
        raise ValueError(f"Unsupported task: {task}")

    text = str(payload.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")

    device, dtype = _get_dtype_and_device(payload.get("device"))
    seed = _coerce_optional_int(payload.get("seed"))
    if seed is not None:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    model = OmniVoice.from_pretrained(str(model_dir), device_map=device, dtype=dtype)

    kwargs: Dict[str, Any] = {
        "text": text,
        "language": (payload.get("language") or None),
        "num_step": _coerce_optional_int(payload.get("num_step")) or 32,
        "guidance_scale": _coerce_optional_float(payload.get("guidance_scale")) or 2.0,
        "speed": _coerce_optional_float(payload.get("speed")) or 1.0,
        "duration": _coerce_optional_float(payload.get("duration")),
        "t_shift": _coerce_optional_float(payload.get("t_shift")) or 0.1,
        "denoise": _coerce_bool(payload.get("denoise"), True),
        "preprocess_prompt": _coerce_bool(payload.get("preprocess_prompt"), True),
        "postprocess_output": _coerce_bool(payload.get("postprocess_output"), True),
        "layer_penalty_factor": _coerce_optional_float(payload.get("layer_penalty_factor")) or 5.0,
        "position_temperature": _coerce_optional_float(payload.get("position_temperature")) or 5.0,
        "class_temperature": _coerce_optional_float(payload.get("class_temperature")) or 0.0,
        "audio_chunk_duration": _coerce_optional_float(payload.get("audio_chunk_duration")) or 15.0,
        "audio_chunk_threshold": _coerce_optional_float(payload.get("audio_chunk_threshold")) or 30.0,
    }

    if task == "voice_design":
        instruct = str(payload.get("instruct") or "").strip()
        if not instruct:
            raise ValueError("instruct is required for voice_design")
        kwargs["instruct"] = instruct
    elif task == "voice_cloning":
        ref_audio = _resolve_existing_path(payload.get("ref_audio"))
        if not ref_audio:
            raise ValueError("ref_audio is required for voice_cloning")
        kwargs["ref_audio"] = ref_audio
        kwargs["ref_text"] = (payload.get("ref_text") or None)

    audios = model.generate(**kwargs)
    waveform = audios[0]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), waveform, model.sampling_rate)
    return {
        "engine": "omnivoice",
        "task": task,
        "sample_rate": int(model.sampling_rate),
        "duration_seconds": float(len(waveform)) / float(model.sampling_rate),
        "device": device,
        "seed": seed,
        "generation_args": kwargs,
        "model_dir": str(model_dir),
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--output-path", required=True, type=Path)
    parser.add_argument("--omnivoice-root", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    output_path = args.output_path.expanduser().resolve()
    omnivoice_root = args.omnivoice_root.expanduser().resolve()
    model_dir = args.model_dir.expanduser().resolve()
    meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")

    sys.path.insert(0, str(omnivoice_root))
    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
        meta = _run(payload, output_path, model_dir)
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                    "request_path": str(request_path),
                    "model_dir": str(model_dir),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
