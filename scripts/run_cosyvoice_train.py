#!/usr/bin/env python3
"""Run a CosyVoice 3 fine-tuning pipeline in an isolated process.

The pipeline mirrors ``vendor/CosyVoice/examples/libritts/cosyvoice/run.sh``
stages 0..5 but is driven by a JSON request so the FastAPI backend can
orchestrate it. Stages performed:

1. **prepare** – convert workshop dataset (manifest.jsonl + audio files) into
   CosyVoice's ``wav.scp`` / ``text`` / ``utt2spk`` / ``spk2utt`` layout.
2. **extract_embedding** – run upstream ``tools/extract_embedding.py`` using
   the ``campplus.onnx`` packaged with the pretrained model.
3. **extract_speech_token** – run upstream ``tools/extract_speech_token.py``
   using ``speech_tokenizer_v1.onnx``.
4. **make_parquet** – serialize features into parquet via
   ``tools/make_parquet_list.py``.
5. **train** – launch ``cosyvoice/bin/train.py`` for each requested submodel
   (``llm`` / ``flow`` / ``hifigan``). Multi-GPU via torchrun if available;
   single-process fallback otherwise (e.g. on macOS/CPU smoke tests).

A run directory (``run_dir``) is created with:
- ``data/`` – CosyVoice-format manifest + extracted features
- ``exp/<submodel>/`` – training checkpoints
- ``tensorboard/<submodel>/`` – tensorboard logs
- ``run.log`` – stdout/stderr per stage
- ``meta.json`` – final status payload

CLI contract::

    run_cosyvoice_train.py --request-json /path/to/req.json \
        --cosyvoice-root vendor/CosyVoice \
        --pretrained-dir data/models/cosyvoice3/Fun-CosyVoice3-0.5B \
        --run-dir data/finetune-runs/cosyvoice3/<run_id>
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


SUPPORTED_SUBMODELS = ["llm", "flow", "hifigan"]
SUPPORTED_TRAIN_ENGINES = ["torch_ddp", "deepspeed"]


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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


def _load_manifest(manifest_path: Path) -> List[Dict[str, Any]]:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Dataset manifest not found: {manifest_path}")
    entries: List[Dict[str, Any]] = []
    for raw in manifest_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        entries.append(json.loads(line))
    if not entries:
        raise ValueError(f"Manifest is empty: {manifest_path}")
    return entries


def _prepare_cosyvoice_data(
    *,
    manifest_path: Path,
    audio_root: Path,
    out_dir: Path,
) -> Dict[str, Any]:
    """Convert workshop manifest.jsonl → CosyVoice wav.scp/text/utt2spk."""

    entries = _load_manifest(manifest_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_lines: List[str] = []
    text_lines: List[str] = []
    utt2spk_lines: List[str] = []
    speakers: Dict[str, List[str]] = {}

    for idx, item in enumerate(entries):
        audio_field = item.get("audio") or item.get("audio_path")
        text_field = item.get("text") or item.get("transcript") or ""
        if not audio_field or not text_field:
            raise ValueError(
                f"Manifest entry #{idx} missing required fields (audio, text): {item}"
            )
        audio_path = Path(audio_field).expanduser()
        if not audio_path.is_absolute():
            audio_path = (audio_root / audio_field).resolve()
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        utt_id = item.get("utt_id") or f"utt_{idx:06d}"
        speaker = item.get("speaker") or item.get("speaker_id") or "spk_default"
        wav_lines.append(f"{utt_id} {audio_path}")
        text_lines.append(f"{utt_id} {text_field}")
        utt2spk_lines.append(f"{utt_id} {speaker}")
        speakers.setdefault(speaker, []).append(utt_id)

    (out_dir / "wav.scp").write_text("\n".join(wav_lines) + "\n", encoding="utf-8")
    (out_dir / "text").write_text("\n".join(text_lines) + "\n", encoding="utf-8")
    (out_dir / "utt2spk").write_text("\n".join(utt2spk_lines) + "\n", encoding="utf-8")
    spk2utt_lines = [f"{spk} {' '.join(sorted(utts))}" for spk, utts in sorted(speakers.items())]
    (out_dir / "spk2utt").write_text("\n".join(spk2utt_lines) + "\n", encoding="utf-8")
    return {
        "num_entries": len(entries),
        "num_speakers": len(speakers),
        "data_dir": str(out_dir),
    }


def _run_stage(
    command: List[str],
    *,
    cwd: Path,
    env: Dict[str, str],
    log_path: Path,
    stage_name: str,
) -> Dict[str, Any]:
    """Run a single training-pipeline stage and append output to run.log."""

    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(f"\n=== stage: {stage_name} ===\n")
        log_file.write("+ " + " ".join(command) + "\n")
        log_file.flush()
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            check=False,
        )
    return {
        "stage": stage_name,
        "returncode": completed.returncode,
        "command": command,
    }


def _torchrun_available() -> bool:
    return shutil.which("torchrun") is not None


def _detect_num_gpus() -> int:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            return int(torch.cuda.device_count())
    except Exception:
        pass
    return 0


def _train_submodel(
    *,
    submodel: str,
    train_engine: str,
    cosyvoice_root: Path,
    pretrained_dir: Path,
    data_root: Path,
    run_dir: Path,
    env: Dict[str, str],
    log_path: Path,
    max_epoch: int,
    batch_size: int,
    learning_rate: float,
    num_workers: int,
    extra_args: List[str],
) -> Dict[str, Any]:
    model_dir = run_dir / "exp" / submodel
    model_dir.mkdir(parents=True, exist_ok=True)
    tb_dir = run_dir / "tensorboard" / submodel
    tb_dir.mkdir(parents=True, exist_ok=True)

    config_path = (
        cosyvoice_root / "examples" / "libritts" / "cosyvoice" / "conf" / "cosyvoice.yaml"
    )

    base_cmd: List[str] = []
    num_gpus = _detect_num_gpus()
    if num_gpus >= 1 and _torchrun_available():
        base_cmd = [
            "torchrun",
            "--nnodes=1",
            f"--nproc_per_node={num_gpus}",
            "--rdzv_backend=c10d",
            "--rdzv_endpoint=localhost:1234",
        ]
    base_cmd.append(str(cosyvoice_root / "cosyvoice" / "bin" / "train.py"))
    base_cmd += [
        "--train_engine",
        train_engine,
        "--config",
        str(config_path),
        "--train_data",
        str(data_root / "train.data.list"),
        "--cv_data",
        str(data_root / "dev.data.list"),
        "--model",
        submodel,
        "--checkpoint",
        str(pretrained_dir / f"{submodel}.pt"),
        "--model_dir",
        str(model_dir),
        "--tensorboard_dir",
        str(tb_dir),
        "--ddp.dist_backend",
        "nccl" if num_gpus > 0 else "gloo",
        "--num_workers",
        str(num_workers),
        "--prefetch",
        "100",
        "--pin_memory",
        "--use_amp",
        "--deepspeed_config",
        str(cosyvoice_root / "examples" / "libritts" / "cosyvoice" / "conf" / "ds_stage2.json"),
        "--deepspeed.save_states",
        "model+optimizer",
    ]
    if max_epoch:
        base_cmd += ["--max_epoch", str(max_epoch)]
    if learning_rate:
        base_cmd += ["--learning_rate", str(learning_rate)]
    if batch_size:
        base_cmd += ["--batch_size", str(batch_size)]
    base_cmd += list(extra_args)

    if num_gpus == 0:
        # Single-process fallback (CPU/MPS smoke tests). Remove deepspeed.
        base_cmd = [c for c in base_cmd if not c.startswith("--deepspeed")]
        if base_cmd[0] == "torchrun":
            base_cmd = [sys.executable] + base_cmd[1:]
        else:
            base_cmd = [sys.executable] + base_cmd

    return _run_stage(
        base_cmd,
        cwd=cosyvoice_root,
        env=env,
        log_path=log_path,
        stage_name=f"train_{submodel}",
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--cosyvoice-root", required=True, type=Path)
    parser.add_argument("--pretrained-dir", required=True, type=Path)
    parser.add_argument("--run-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    cosyvoice_root = args.cosyvoice_root.expanduser().resolve()
    pretrained_dir = args.pretrained_dir.expanduser().resolve()
    run_dir = args.run_dir.expanduser().resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    meta_path = run_dir / "meta.json"
    log_path = run_dir / "run.log"
    log_path.write_text("", encoding="utf-8")

    try:
        payload = _read_json(request_path)
    except Exception as exc:
        meta_path.write_text(
            json.dumps({"error": f"Failed to read request JSON: {exc}"}, indent=2),
            encoding="utf-8",
        )
        return 2

    submodels_raw = payload.get("submodels") or ["llm"]
    if isinstance(submodels_raw, str):
        submodels_raw = [submodels_raw]
    submodels = [name for name in submodels_raw if name in SUPPORTED_SUBMODELS]
    if not submodels:
        meta_path.write_text(
            json.dumps(
                {
                    "error": (
                        f"No supported submodels selected. Choose from {SUPPORTED_SUBMODELS}"
                    )
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return 3

    train_engine = payload.get("train_engine") or "torch_ddp"
    if train_engine not in SUPPORTED_TRAIN_ENGINES:
        meta_path.write_text(
            json.dumps(
                {
                    "error": (
                        f"Unsupported train_engine: {train_engine}. "
                        f"Choose from {SUPPORTED_TRAIN_ENGINES}"
                    )
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return 3

    manifest_path = Path(payload.get("manifest_path") or "").expanduser()
    if not manifest_path.is_absolute():
        manifest_path = manifest_path.resolve()
    audio_root = Path(payload.get("audio_root") or manifest_path.parent).expanduser().resolve()
    cv_manifest_path = payload.get("cv_manifest_path")
    cv_manifest = (
        Path(cv_manifest_path).expanduser().resolve() if cv_manifest_path else manifest_path
    )

    max_epoch = _coerce_int(payload.get("max_epoch") or payload.get("epochs"), 5)
    batch_size = _coerce_int(payload.get("batch_size"), 2)
    learning_rate = _coerce_float(payload.get("learning_rate"), 1e-4)
    num_workers = _coerce_int(payload.get("num_workers"), 2)
    extra_args_raw = payload.get("extra_args") or []
    extra_args = [str(item) for item in extra_args_raw]

    data_dir = run_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    train_data_dir = data_dir / "train"
    cv_data_dir = data_dir / "cv"

    env = os.environ.copy()
    env.setdefault("PYTHONPATH", str(cosyvoice_root / "third_party" / "Matcha-TTS"))
    cache_root = run_dir / ".cache"
    env.setdefault("HF_HOME", str(cache_root / "huggingface"))
    env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
    env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
    for var in ("HF_HOME", "TRANSFORMERS_CACHE", "MODELSCOPE_CACHE"):
        Path(env[var]).mkdir(parents=True, exist_ok=True)

    stage_records: List[Dict[str, Any]] = []
    try:
        prepare_train = _prepare_cosyvoice_data(
            manifest_path=manifest_path,
            audio_root=audio_root,
            out_dir=train_data_dir,
        )
        stage_records.append({"stage": "prepare_train", **prepare_train})
        prepare_cv = _prepare_cosyvoice_data(
            manifest_path=cv_manifest,
            audio_root=audio_root,
            out_dir=cv_data_dir,
        )
        stage_records.append({"stage": "prepare_cv", **prepare_cv})

        campplus_onnx = pretrained_dir / "campplus.onnx"
        speech_tokenizer_onnx = pretrained_dir / "speech_tokenizer_v1.onnx"
        if not campplus_onnx.exists() or not speech_tokenizer_onnx.exists():
            raise FileNotFoundError(
                f"Required ONNX files missing in pretrained dir: {pretrained_dir} "
                "(need campplus.onnx and speech_tokenizer_v1.onnx)."
            )

        for label, target_dir in (("train", train_data_dir), ("cv", cv_data_dir)):
            stage_records.append(
                _run_stage(
                    [
                        sys.executable,
                        str(cosyvoice_root / "tools" / "extract_embedding.py"),
                        "--dir",
                        str(target_dir),
                        "--onnx_path",
                        str(campplus_onnx),
                    ],
                    cwd=cosyvoice_root,
                    env=env,
                    log_path=log_path,
                    stage_name=f"extract_embedding_{label}",
                )
            )
            stage_records.append(
                _run_stage(
                    [
                        sys.executable,
                        str(cosyvoice_root / "tools" / "extract_speech_token.py"),
                        "--dir",
                        str(target_dir),
                        "--onnx_path",
                        str(speech_tokenizer_onnx),
                    ],
                    cwd=cosyvoice_root,
                    env=env,
                    log_path=log_path,
                    stage_name=f"extract_speech_token_{label}",
                )
            )
            parquet_dir = target_dir / "parquet"
            parquet_dir.mkdir(parents=True, exist_ok=True)
            stage_records.append(
                _run_stage(
                    [
                        sys.executable,
                        str(cosyvoice_root / "tools" / "make_parquet_list.py"),
                        "--num_utts_per_parquet",
                        "1000",
                        "--num_processes",
                        "4",
                        "--src_dir",
                        str(target_dir),
                        "--des_dir",
                        str(parquet_dir),
                    ],
                    cwd=cosyvoice_root,
                    env=env,
                    log_path=log_path,
                    stage_name=f"make_parquet_{label}",
                )
            )

        # Combine train/dev data lists for the trainer.
        train_list = train_data_dir / "parquet" / "data.list"
        cv_list = cv_data_dir / "parquet" / "data.list"
        if not train_list.exists() or not cv_list.exists():
            raise FileNotFoundError(
                f"Parquet data.list missing (train={train_list}, cv={cv_list}). "
                "Earlier stages may have failed; see run.log."
            )
        (data_dir / "train.data.list").write_text(train_list.read_text(), encoding="utf-8")
        (data_dir / "dev.data.list").write_text(cv_list.read_text(), encoding="utf-8")

        for submodel in submodels:
            stage_records.append(
                _train_submodel(
                    submodel=submodel,
                    train_engine=train_engine,
                    cosyvoice_root=cosyvoice_root,
                    pretrained_dir=pretrained_dir,
                    data_root=data_dir,
                    run_dir=run_dir,
                    env=env,
                    log_path=log_path,
                    max_epoch=max_epoch,
                    batch_size=batch_size,
                    learning_rate=learning_rate,
                    num_workers=num_workers,
                    extra_args=extra_args,
                )
            )
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                    "stages": stage_records,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"CosyVoice training failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    failed_stages = [s for s in stage_records if "returncode" in s and s["returncode"] != 0]
    meta_payload = {
        "status": "failed" if failed_stages else "completed",
        "run_dir": str(run_dir),
        "submodels": submodels,
        "train_engine": train_engine,
        "manifest_path": str(manifest_path),
        "stages": stage_records,
        "checkpoint_dir": str(run_dir / "exp"),
    }
    meta_path.write_text(json.dumps(meta_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if failed_stages:
        print(
            f"CosyVoice training finished with {len(failed_stages)} failing stage(s). "
            f"See {log_path}",
            file=sys.stderr,
        )
        return 4
    print(f"CosyVoice training complete: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
