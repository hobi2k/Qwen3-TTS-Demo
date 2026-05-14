#!/usr/bin/env python3
"""Run a single VoxCPM2 inference request in an isolated process.

Contract::

    --request-json /path/to/req.json   # see TASK SCHEMA below
    --output-path  /path/to/out.wav
    --voxcpm-root  vendor/VoxCPM
    --model-dir    data/models/voxcpm2/VoxCPM2

TASK SCHEMA (request JSON ``task`` field):

* ``voice_design``    – ``text`` contains a parenthetical descriptor at the
                        start (e.g. ``"(A young woman, gentle voice)Hello"``);
                        no reference audio required.
* ``voice_cloning``   – ``text`` + ``reference_wav_path``: clone the timbre
                        from the reference audio.
* ``ultimate_cloning`` – ``text`` + ``prompt_wav_path`` + ``prompt_text``
                        (+ optional ``reference_wav_path``): audio-continuation
                        cloning with maximum fidelity.

Common knobs: ``cfg_value``, ``inference_timesteps``, ``min_len``, ``max_len``,
``normalize``, ``denoise``, ``device``, ``optimize``, ``enable_denoiser``,
``seed``, ``audio_format``.

Writes ``--output-path`` + ``<output_path>.meta.json`` companion file.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


SUPPORTED_TASKS = {"voice_design", "voice_cloning", "ultimate_cloning"}


def _coerce_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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


def _resolve_audio_path(value: Any) -> Optional[str]:
    if not value:
        return None
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    return str(path)


def _load_model(*, model_dir: Path, device: Optional[str], enable_denoiser: bool, optimize: bool, lora_weights_path: Optional[str]):
    from voxcpm import VoxCPM  # type: ignore

    return VoxCPM.from_pretrained(
        hf_model_id=str(model_dir),
        load_denoiser=enable_denoiser,
        cache_dir=None,
        local_files_only=True,
        optimize=optimize,
        device=device,
        lora_weights_path=lora_weights_path,
    )


def _save_wav(waveform, output_path: Path, sample_rate: int) -> None:
    import numpy as np
    import soundfile as sf  # type: ignore

    if hasattr(waveform, "cpu"):
        waveform = waveform.cpu().numpy()
    if hasattr(waveform, "ndim") and waveform.ndim == 2 and waveform.shape[0] in (1, 2):
        waveform = waveform.squeeze(0)
    if waveform.dtype != np.float32:
        waveform = waveform.astype(np.float32)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), waveform, sample_rate, subtype="PCM_16")


def _run_task(*, task: str, payload: Dict[str, Any], output_path: Path, model_dir: Path) -> Dict[str, Any]:
    if task not in SUPPORTED_TASKS:
        raise ValueError(f"Unsupported task: {task}")

    text = payload.get("text") or ""
    if not text.strip():
        raise ValueError("text is required")
    voice_description = str(payload.get("voice_description") or "").strip()
    if task == "voice_design" and voice_description and not text.lstrip().startswith("("):
        text = f"({voice_description}){text.strip()}"

    cfg_value = _coerce_float(payload.get("cfg_value"), 2.0) or 2.0
    inference_timesteps = _coerce_int(payload.get("inference_timesteps"), 10) or 10
    min_len = _coerce_int(payload.get("min_len"), 2) or 2
    max_len = _coerce_int(payload.get("max_len"), 4096) or 4096
    normalize = _coerce_bool(payload.get("normalize"), False)
    denoise = _coerce_bool(payload.get("denoise"), False)
    enable_denoiser = _coerce_bool(payload.get("enable_denoiser"), True)
    optimize = _coerce_bool(payload.get("optimize"), True)
    device = payload.get("device") or None
    seed = _coerce_int(payload.get("seed"))
    lora_weights_path = payload.get("lora_weights_path") or None

    if seed is not None:
        try:
            import torch

            torch.manual_seed(int(seed))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(int(seed))
        except Exception:
            pass

    prompt_wav_path = None
    prompt_text = None
    reference_wav_path = None
    if task == "voice_cloning":
        reference_wav_path = _resolve_audio_path(payload.get("reference_wav_path"))
        if reference_wav_path is None:
            raise ValueError("reference_wav_path is required for voice_cloning")
    elif task == "ultimate_cloning":
        prompt_wav_path = _resolve_audio_path(payload.get("prompt_wav_path"))
        prompt_text = payload.get("prompt_text") or None
        if not prompt_wav_path or not prompt_text:
            raise ValueError("prompt_wav_path and prompt_text are required for ultimate_cloning")
        reference_wav_path = _resolve_audio_path(payload.get("reference_wav_path"))
    # voice_design has no audio inputs

    model = _load_model(
        model_dir=model_dir,
        device=device,
        enable_denoiser=enable_denoiser,
        optimize=optimize,
        lora_weights_path=lora_weights_path,
    )

    waveform = model.generate(
        text=text,
        prompt_wav_path=prompt_wav_path,
        prompt_text=prompt_text,
        reference_wav_path=reference_wav_path,
        cfg_value=cfg_value,
        inference_timesteps=inference_timesteps,
        min_len=min_len,
        max_len=max_len,
        normalize=normalize,
        denoise=denoise,
    )

    # VoxCPM2 outputs 16 kHz by default; check model attr if exposed.
    sample_rate = int(getattr(model.tts_model, "out_sample_rate", 16000))
    _save_wav(waveform, output_path, sample_rate)

    return {
        "engine": "voxcpm2",
        "task": task,
        "sample_rate": sample_rate,
        "model_dir": str(model_dir),
        "cfg_value": cfg_value,
        "inference_timesteps": inference_timesteps,
        "min_len": min_len,
        "max_len": max_len,
        "device": device,
        "seed": seed,
        "lora_weights_path": lora_weights_path,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--output-path", required=True, type=Path)
    parser.add_argument("--voxcpm-root", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    output_path = args.output_path.expanduser().resolve()
    voxcpm_root = args.voxcpm_root.expanduser().resolve()
    model_dir = args.model_dir.expanduser().resolve()
    meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")

    sys.path.insert(0, str(voxcpm_root / "src"))

    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
    except Exception as exc:
        meta_path.write_text(
            json.dumps({"error": f"Failed to read request JSON: {exc}"}, indent=2),
            encoding="utf-8",
        )
        return 2

    if not model_dir.exists():
        meta_path.write_text(
            json.dumps({"error": f"Model directory not found: {model_dir}"}, indent=2),
            encoding="utf-8",
        )
        return 3

    task = payload.get("task") or "voice_design"
    try:
        meta = _run_task(task=task, payload=payload, output_path=output_path, model_dir=model_dir)
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {"error": str(exc), "task": task, "traceback": traceback.format_exc()},
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"VoxCPM generation failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    meta["request_payload"] = payload
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"VoxCPM generation done: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
