#!/usr/bin/env python3
"""Run one ACE-Step generation request in an isolated process.

This script is intentionally small and dependency-light. It is called by the
FastAPI backend with an ACE-Step-specific Python executable so the main Qwen
environment does not have to import the music model stack.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


def newest_audio_file(directory: Path) -> Path | None:
    """Return the newest audio file below a directory."""

    if not directory.exists():
        return None
    audio_exts = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
    candidates = [path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in audio_exts]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate music with ACE-Step.")
    parser.add_argument("--request-json", required=True)
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--ace-step-root", required=True)
    parser.add_argument("--checkpoint-path", required=True)
    args = parser.parse_args()

    request_path = Path(args.request_json).resolve()
    output_path = Path(args.output_path).resolve()
    ace_step_root = Path(args.ace_step_root).resolve()
    checkpoint_path = Path(args.checkpoint_path).resolve()
    sys.path.insert(0, str(ace_step_root))

    payload = json.loads(request_path.read_text(encoding="utf-8"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_path.mkdir(parents=True, exist_ok=True)

    from acestep.pipeline_ace_step import ACEStepPipeline

    pipeline = ACEStepPipeline(
        checkpoint_dir=str(checkpoint_path),
        dtype="bfloat16" if payload.get("bf16", True) else "float32",
        torch_compile=bool(payload.get("torch_compile", False)),
        cpu_offload=bool(payload.get("cpu_offload", False)),
        overlapped_decode=bool(payload.get("overlapped_decode", False)),
    )
    pipeline(
        audio_duration=float(payload["audio_duration"]),
        prompt=payload["prompt"],
        lyrics=payload["lyrics"],
        infer_step=int(payload["infer_step"]),
        guidance_scale=float(payload["guidance_scale"]),
        scheduler_type=payload["scheduler_type"],
        cfg_type=payload["cfg_type"],
        omega_scale=float(payload["omega_scale"]),
        manual_seeds=str(payload["manual_seeds"]),
        guidance_interval=float(payload["guidance_interval"]),
        guidance_interval_decay=float(payload["guidance_interval_decay"]),
        min_guidance_scale=float(payload["min_guidance_scale"]),
        use_erg_tag=bool(payload["use_erg_tag"]),
        use_erg_lyric=bool(payload["use_erg_lyric"]),
        use_erg_diffusion=bool(payload["use_erg_diffusion"]),
        oss_steps=str(payload["oss_steps"]),
        guidance_scale_text=float(payload["guidance_scale_text"]),
        guidance_scale_lyric=float(payload["guidance_scale_lyric"]),
        save_path=str(output_path),
    )

    if output_path.exists():
        return 0

    generated = newest_audio_file(output_path.parent)
    if generated and generated != output_path:
        shutil.copy2(generated, output_path)
    if not output_path.exists():
        raise SystemExit(f"ACE-Step completed but no audio file was found for {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
