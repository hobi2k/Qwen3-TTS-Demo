#!/usr/bin/env python3
"""Run OmniVoice batch inference from a JSONL list."""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

def _parse_jsonl(raw: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        payload = json.loads(stripped)
        if not isinstance(payload, dict):
            raise ValueError("Each JSONL line must be a JSON object")
        items.append(payload)
    return items


def _resolve_existing_path(value: Any) -> Optional[str]:
    if not value:
        return None
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = path.resolve()
    return str(path)


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


def _normalize_sample(sample: Dict[str, Any], defaults: Dict[str, Any]) -> Dict[str, Any]:
    task = str(sample.get("task") or defaults.get("task") or "auto_voice").strip()
    text = str(sample.get("text") or "").strip()
    if not text:
        raise ValueError("Each batch item requires text")
    normalized: Dict[str, Any] = {
        "id": str(sample.get("id") or ""),
        "text": text,
        "task": task,
    }
    if not normalized["id"]:
        raise ValueError("Each batch item requires id")
    for key in ["ref_text", "instruct", "language_id", "language_name"]:
        value = sample.get(key)
        if value in (None, ""):
            value = defaults.get(key)
        if value not in (None, ""):
            normalized[key] = value
    ref_audio = sample.get("ref_audio")
    if ref_audio in (None, ""):
        ref_audio = defaults.get("ref_audio")
    if ref_audio not in (None, ""):
        normalized["ref_audio"] = _resolve_existing_path(ref_audio)
    duration = _coerce_optional_float(sample.get("duration"))
    if duration is None:
        duration = _coerce_optional_float(defaults.get("duration"))
    if duration is not None:
        normalized["duration"] = duration
    speed = _coerce_optional_float(sample.get("speed"))
    if speed is None:
        speed = _coerce_optional_float(defaults.get("speed"))
    if speed is not None:
        normalized["speed"] = speed
    return normalized


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--omnivoice-root", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--run-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    omnivoice_root = args.omnivoice_root.expanduser().resolve()
    model_dir = args.model_dir.expanduser().resolve()
    run_dir = args.run_dir.expanduser().resolve()
    meta_path = run_dir / "meta.json"

    sys.path.insert(0, str(omnivoice_root))
    try:
        request_payload = json.loads(request_path.read_text(encoding="utf-8"))
        samples = _parse_jsonl(str(request_payload.get("samples_jsonl") or ""))
        defaults = request_payload.get("defaults") or {}
        if not samples:
            raise ValueError("No batch samples were provided")
        outputs_dir = run_dir / "outputs"
        outputs_dir.mkdir(parents=True, exist_ok=True)
        normalized_samples = [_normalize_sample(sample, defaults) for sample in samples]
        test_list_path = run_dir / "test_list.jsonl"
        test_list_path.write_text(
            "\n".join(json.dumps(item, ensure_ascii=False) for item in normalized_samples) + "\n",
            encoding="utf-8",
        )
        command = [
            sys.executable,
            "-m",
            "omnivoice.cli.infer_batch",
            "--model",
            str(model_dir),
            "--test_list",
            str(test_list_path),
            "--res_dir",
            str(outputs_dir),
            "--num_step",
            str(_coerce_optional_int(defaults.get("num_step")) or 32),
            "--guidance_scale",
            str(_coerce_optional_float(defaults.get("guidance_scale")) or 2.0),
            "--t_shift",
            str(_coerce_optional_float(defaults.get("t_shift")) or 0.1),
            "--nj_per_gpu",
            str(_coerce_optional_int(request_payload.get("nj_per_gpu")) or 1),
            "--audio_chunk_duration",
            str(_coerce_optional_float(defaults.get("audio_chunk_duration")) or 15.0),
            "--audio_chunk_threshold",
            str(_coerce_optional_float(defaults.get("audio_chunk_threshold")) or 30.0),
            "--batch_duration",
            str(_coerce_optional_float(request_payload.get("batch_duration")) or 1000.0),
            "--batch_size",
            str(_coerce_optional_int(request_payload.get("batch_size")) or 0),
            "--warmup",
            str(_coerce_optional_int(request_payload.get("warmup")) or 0),
            "--preprocess_prompt",
            "true" if _coerce_bool(defaults.get("preprocess_prompt"), True) else "false",
            "--postprocess_output",
            "true" if _coerce_bool(defaults.get("postprocess_output"), True) else "false",
            "--layer_penalty_factor",
            str(_coerce_optional_float(defaults.get("layer_penalty_factor")) or 5.0),
            "--position_temperature",
            str(_coerce_optional_float(defaults.get("position_temperature")) or 5.0),
            "--class_temperature",
            str(_coerce_optional_float(defaults.get("class_temperature")) or 0.0),
            "--denoise",
            "true" if _coerce_bool(defaults.get("denoise"), True) else "false",
        ]
        lang_id = request_payload.get("lang_id")
        if lang_id:
            command.extend(["--lang_id", str(lang_id)])
        import subprocess

        completed = subprocess.run(
            command,
            cwd=str(omnivoice_root),
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "TOKENIZERS_PARALLELISM": "false"},
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"infer_batch failed with exit code {completed.returncode}\nSTDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )
        generated_files: List[Dict[str, Any]] = []
        for item in normalized_samples:
            sample_id = str(item["id"])
            output_path = outputs_dir / f"{sample_id}.wav"
            generated_files.append(
                {
                    "id": sample_id,
                    "task": str(item.get("task") or "auto_voice"),
                    "path": str(output_path),
                    "duration_seconds": None,
                }
            )

        meta = {
            "status": "completed",
            "engine": "omnivoice",
            "output_dir": str(outputs_dir),
            "generated_files": generated_files,
            "command": command,
            "stdout_tail": (completed.stdout or "")[-4000:],
            "stderr_tail": (completed.stderr or "")[-4000:],
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                    "request_path": str(request_path),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
