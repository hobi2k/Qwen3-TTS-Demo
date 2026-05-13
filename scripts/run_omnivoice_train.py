#!/usr/bin/env python3
"""Run OmniVoice training from JSON config payloads."""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


def _load_json_text(raw: str, field_name: str) -> Dict[str, Any]:
    try:
        payload = json.loads(raw)
    except Exception as exc:
        raise ValueError(f"{field_name} must be valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{field_name} must decode to a JSON object")
    return payload


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
    train_config_path = run_dir / "train_config.json"
    data_config_path = run_dir / "data_config.json"
    log_path = run_dir / "train.log"

    try:
        request_payload = json.loads(request_path.read_text(encoding="utf-8"))
        train_config = _load_json_text(
            str(request_payload.get("train_config_json") or "{}"),
            "train_config_json",
        )
        data_config = _load_json_text(
            str(request_payload.get("data_config_json") or "{}"),
            "data_config_json",
        )

        train_config.setdefault("init_from_checkpoint", str(model_dir))
        if platform.system() in {"Darwin", "Windows"}:
            train_config.setdefault("attn_implementation", "sdpa")
            train_config.setdefault("mixed_precision", "no")

        train_config_path.write_text(
            json.dumps(train_config, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        data_config_path.write_text(
            json.dumps(data_config, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        accelerate_args = request_payload.get("accelerate_args") or ["--num_processes", "1"]
        extra_args = request_payload.get("extra_args") or []
        command = [
            sys.executable,
            "-m",
            "accelerate.commands.launch",
            *[str(arg) for arg in accelerate_args],
            "-m",
            "omnivoice.cli.train",
            "--train_config",
            str(train_config_path),
            "--data_config",
            str(data_config_path),
            "--output_dir",
            str(run_dir / "checkpoints"),
            *[str(arg) for arg in extra_args],
        ]

        completed = subprocess.run(
            command,
            cwd=str(omnivoice_root),
            capture_output=True,
            text=True,
            check=False,
            env={**dict(os.environ), "TOKENIZERS_PARALLELISM": "false"},
        )
        log_path.write_text((completed.stdout or "") + ("\n[stderr]\n" + completed.stderr if completed.stderr else ""), encoding="utf-8")
        meta = {
            "status": "completed" if completed.returncode == 0 else "failed",
            "command": command,
            "run_dir": str(run_dir),
            "checkpoint_dir": str(run_dir / "checkpoints"),
            "train_config_path": str(train_config_path),
            "data_config_path": str(data_config_path),
            "stdout_tail": (completed.stdout or "")[-4000:],
            "stderr_tail": (completed.stderr or "")[-4000:],
        }
        if completed.returncode != 0:
            meta["error"] = f"Training exited with status {completed.returncode}"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return completed.returncode
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
