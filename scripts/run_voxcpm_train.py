#!/usr/bin/env python3
"""Run a VoxCPM2 LoRA fine-tuning job in an isolated process.

This wraps ``vendor/VoxCPM/scripts/train_voxcpm_finetune.py`` (argbind-based)
so the FastAPI backend can launch it without importing the heavy training
stack.

Workshop manifest format (JSONL, ``data/datasets/<id>/manifest.jsonl``)::

    {"audio": "wavs/utt_001.wav", "text": "안녕하세요"}
    {"audio": "wavs/utt_002.wav", "text": "반갑습니다"}

This script converts the workshop manifest into the VoxCPM-expected
manifest layout (audio_text JSON file) and then invokes the upstream
trainer.

CLI contract::

    run_voxcpm_train.py --request-json /path/to/req.json \
        --voxcpm-root vendor/VoxCPM \
        --pretrained-dir data/models/voxcpm2/VoxCPM2 \
        --run-dir data/finetune-runs/voxcpm2/<run_id>

Request JSON shape::

    {
      "manifest_path": "/abs/data/datasets/X/manifest.jsonl",
      "audio_root": "/abs/data/datasets/X",        # base dir for relative audio paths
      "cv_manifest_path": "/abs/.../manifest.jsonl",  # optional
      "lora": {"enable_lm": true, "enable_dit": true, "enable_proj": false},
      "batch_size": 1,
      "grad_accum_steps": 1,
      "num_workers": 2,
      "num_iters": 10000,
      "max_steps": 10000,
      "learning_rate": 1e-4,
      "warmup_steps": 200,
      "log_interval": 50,
      "valid_interval": 500,
      "save_interval": 1000,
      "max_grad_norm": 1.0,
      "extra_args": ["--lambdas/loss/diff", "1.0"]
    }
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional


def _load_manifest(manifest_path: Path) -> List[Dict[str, Any]]:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")
    items: List[Dict[str, Any]] = []
    for raw in manifest_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        items.append(json.loads(line))
    if not items:
        raise ValueError(f"Manifest is empty: {manifest_path}")
    return items


def _materialize_voxcpm_manifest(
    *, manifest_path: Path, audio_root: Path, out_path: Path
) -> Dict[str, Any]:
    """Rewrite workshop manifest into VoxCPM-format JSONL with absolute audio paths."""

    items = _load_manifest(manifest_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for idx, item in enumerate(items):
            audio_field = item.get("audio") or item.get("audio_path")
            text_field = item.get("text") or item.get("transcript")
            if not audio_field or not text_field:
                raise ValueError(
                    f"Manifest entry #{idx} missing required fields (audio, text): {item}"
                )
            audio_path = Path(audio_field).expanduser()
            if not audio_path.is_absolute():
                audio_path = (audio_root / audio_field).resolve()
            if not audio_path.exists():
                raise FileNotFoundError(f"Audio file not found: {audio_path}")
            record = {"audio": str(audio_path), "text": text_field}
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"manifest_path": str(out_path), "num_entries": len(items)}


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_command(
    *,
    voxcpm_root: Path,
    pretrained_dir: Path,
    train_manifest: Path,
    val_manifest: Optional[Path],
    save_path: Path,
    tb_dir: Path,
    payload: Dict[str, Any],
) -> List[str]:
    train_script = voxcpm_root / "scripts" / "train_voxcpm_finetune.py"
    cmd: List[str] = [sys.executable, str(train_script)]

    cmd += ["--args.parse_argv", "true"]
    cmd += ["--pretrained_path", str(pretrained_dir)]
    cmd += ["--train_manifest", str(train_manifest)]
    if val_manifest:
        cmd += ["--val_manifest", str(val_manifest)]
    cmd += ["--save_path", str(save_path)]
    cmd += ["--tensorboard", str(tb_dir)]

    cmd += ["--batch_size", str(_coerce_int(payload.get("batch_size"), 1))]
    cmd += ["--grad_accum_steps", str(_coerce_int(payload.get("grad_accum_steps"), 1))]
    cmd += ["--num_workers", str(_coerce_int(payload.get("num_workers"), 2))]
    cmd += ["--num_iters", str(_coerce_int(payload.get("num_iters"), 10000))]
    cmd += ["--max_steps", str(_coerce_int(payload.get("max_steps"), 10000))]
    cmd += ["--learning_rate", str(_coerce_float(payload.get("learning_rate"), 1e-4))]
    cmd += ["--warmup_steps", str(_coerce_int(payload.get("warmup_steps"), 200))]
    cmd += ["--log_interval", str(_coerce_int(payload.get("log_interval"), 50))]
    cmd += ["--valid_interval", str(_coerce_int(payload.get("valid_interval"), 500))]
    cmd += ["--save_interval", str(_coerce_int(payload.get("save_interval"), 1000))]
    cmd += ["--weight_decay", str(_coerce_float(payload.get("weight_decay"), 1e-2))]
    cmd += ["--max_grad_norm", str(_coerce_float(payload.get("max_grad_norm"), 0.0))]

    sample_rate = _coerce_int(payload.get("sample_rate"), 16000)
    cmd += ["--sample_rate", str(sample_rate)]

    lora_cfg = payload.get("lora")
    if isinstance(lora_cfg, dict):
        cmd += ["--lora", json.dumps(lora_cfg)]

    hf_model_id = payload.get("hf_model_id")
    if hf_model_id:
        cmd += ["--hf_model_id", str(hf_model_id)]
    if payload.get("distribute"):
        cmd += ["--distribute", "true"]

    extras = payload.get("extra_args") or []
    cmd += [str(arg) for arg in extras]
    return cmd


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--voxcpm-root", required=True, type=Path)
    parser.add_argument("--pretrained-dir", required=True, type=Path)
    parser.add_argument("--run-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    voxcpm_root = args.voxcpm_root.expanduser().resolve()
    pretrained_dir = args.pretrained_dir.expanduser().resolve()
    run_dir = args.run_dir.expanduser().resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    meta_path = run_dir / "meta.json"
    log_path = run_dir / "run.log"
    log_path.write_text("", encoding="utf-8")

    sys.path.insert(0, str(voxcpm_root / "src"))

    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
    except Exception as exc:
        meta_path.write_text(
            json.dumps({"error": f"Failed to read request JSON: {exc}"}, indent=2),
            encoding="utf-8",
        )
        return 2

    if not pretrained_dir.exists():
        meta_path.write_text(
            json.dumps({"error": f"Pretrained model not found: {pretrained_dir}"}, indent=2),
            encoding="utf-8",
        )
        return 3

    manifest_path = Path(payload.get("manifest_path") or "").expanduser()
    if not manifest_path.is_absolute():
        manifest_path = manifest_path.resolve()
    audio_root = Path(payload.get("audio_root") or manifest_path.parent).expanduser().resolve()
    cv_manifest_raw = payload.get("cv_manifest_path")
    cv_manifest_path = (
        Path(cv_manifest_raw).expanduser().resolve() if cv_manifest_raw else None
    )

    data_dir = run_dir / "data"
    save_path = run_dir / "checkpoints"
    tb_dir = run_dir / "tensorboard"
    data_dir.mkdir(parents=True, exist_ok=True)
    save_path.mkdir(parents=True, exist_ok=True)
    tb_dir.mkdir(parents=True, exist_ok=True)

    stages: List[Dict[str, Any]] = []
    try:
        train_meta = _materialize_voxcpm_manifest(
            manifest_path=manifest_path,
            audio_root=audio_root,
            out_path=data_dir / "train.jsonl",
        )
        stages.append({"stage": "prepare_train", **train_meta})

        val_jsonl: Optional[Path] = None
        if cv_manifest_path:
            val_meta = _materialize_voxcpm_manifest(
                manifest_path=cv_manifest_path,
                audio_root=audio_root,
                out_path=data_dir / "val.jsonl",
            )
            stages.append({"stage": "prepare_val", **val_meta})
            val_jsonl = data_dir / "val.jsonl"

        cmd = _build_command(
            voxcpm_root=voxcpm_root,
            pretrained_dir=pretrained_dir,
            train_manifest=data_dir / "train.jsonl",
            val_manifest=val_jsonl,
            save_path=save_path,
            tb_dir=tb_dir,
            payload=payload,
        )

        env = os.environ.copy()
        env.setdefault("PYTHONPATH", str(voxcpm_root / "src"))
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        cache_root = run_dir / ".cache"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
        for var in ("HF_HOME", "MODELSCOPE_CACHE"):
            Path(env[var]).mkdir(parents=True, exist_ok=True)

        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write("=== train_voxcpm_finetune ===\n")
            log_file.write("+ " + " ".join(cmd) + "\n")
            log_file.flush()
            completed = subprocess.run(
                cmd,
                cwd=str(voxcpm_root),
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                check=False,
            )
        stages.append({"stage": "train", "returncode": completed.returncode})
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                    "stages": stages,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"VoxCPM training failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    failed = [s for s in stages if "returncode" in s and s["returncode"] != 0]
    meta_payload = {
        "status": "failed" if failed else "completed",
        "run_dir": str(run_dir),
        "checkpoint_dir": str(save_path),
        "tensorboard_dir": str(tb_dir),
        "manifest_path": str(manifest_path),
        "stages": stages,
    }
    meta_path.write_text(json.dumps(meta_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if failed:
        print(
            f"VoxCPM training finished with {len(failed)} failing stage(s). See {log_path}",
            file=sys.stderr,
        )
        return 4
    print(f"VoxCPM training complete: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
