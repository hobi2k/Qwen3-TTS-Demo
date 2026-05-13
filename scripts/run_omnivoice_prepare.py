#!/usr/bin/env python3
"""Run OmniVoice data-preparation flows in an isolated process."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional


def _bool_text(value: Any) -> str:
    return "true" if bool(value) else "false"


def _stringify(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _build_jsonl_to_webdataset_command(payload: Dict[str, Any]) -> List[str]:
    input_jsonl = _stringify(payload.get("input_jsonl"))
    output_dir = _stringify(payload.get("raw_output_dir"))
    if not input_jsonl:
        raise ValueError("input_jsonl is required for jsonl_to_webdataset/full_pipeline")
    if not output_dir:
        raise ValueError("raw_output_dir is required for jsonl_to_webdataset/full_pipeline")

    command = [
        sys.executable,
        "-m",
        "omnivoice.scripts.jsonl_to_webdataset",
        "--input",
        input_jsonl,
        "--output",
        output_dir,
        "--workers",
        str(int(payload.get("workers") or 16)),
        "--threads",
        str(int(payload.get("threads") or 4)),
        "--shard-size",
        str(int(payload.get("shard_size") or 1000)),
        "--sr",
        str(int(payload.get("sr") or 24000)),
        "--shuffle",
        _bool_text(payload.get("shuffle", True)),
        "--shuffle-seed",
        str(int(payload.get("shuffle_seed") or 42)),
    ]
    min_duration = payload.get("min_duration")
    max_duration = payload.get("max_duration")
    if min_duration not in (None, ""):
        command.extend(["--min-duration", str(float(min_duration))])
    if max_duration not in (None, ""):
        command.extend(["--max-duration", str(float(max_duration))])
    return command


def _build_extract_audio_tokens_command(
    payload: Dict[str, Any],
    manifest_path: Optional[str],
) -> List[str]:
    input_jsonl = _stringify(payload.get("input_jsonl"))
    input_manifest = _stringify(payload.get("input_manifest")) or manifest_path
    token_output_dir = _stringify(payload.get("token_output_dir"))
    if not token_output_dir:
        raise ValueError("token_output_dir is required for extract_audio_tokens/full_pipeline")
    if not input_manifest and not input_jsonl:
        raise ValueError("input_manifest or input_jsonl is required for token extraction")

    token_root = Path(token_output_dir).expanduser().resolve()
    tar_pattern = str(token_root / "audios" / "shard-%06d.tar")
    jsonl_pattern = str(token_root / "txts" / "shard-%06d.jsonl")

    command = [
        sys.executable,
        "-m",
        "omnivoice.scripts.extract_audio_tokens",
    ]
    if input_manifest:
        command.extend(["--input_manifest", input_manifest])
    else:
        command.extend(["--input_jsonl", str(input_jsonl)])
    command.extend(
        [
            "--tar_output_pattern",
            tar_pattern,
            "--jsonl_output_pattern",
            jsonl_pattern,
            "--tokenizer_path",
            str(payload.get("tokenizer_path") or "eustlb/higgs-audio-v2-tokenizer"),
            "--samples_per_shard",
            str(int(payload.get("samples_per_shard") or 1000)),
            "--min_num_shards",
            str(int(payload.get("min_num_shards") or 32)),
            "--nj_per_gpu",
            str(int(payload.get("nj_per_gpu") or 3)),
            "--loader_workers",
            str(int(payload.get("loader_workers") or 24)),
            "--shuffle",
            _bool_text(payload.get("shuffle", True)),
            "--shuffle-seed",
            str(int(payload.get("shuffle_seed") or 42)),
            "--min_length",
            str(float(payload.get("min_length") or 0.0)),
            "--max_length",
            str(float(payload.get("max_length") or 3600.0)),
            "--num_machines",
            str(int(payload.get("num_machines") or 1)),
            "--machine_index",
            str(int(payload.get("machine_index") or 0)),
        ]
    )
    if payload.get("skip_errors"):
        command.append("--skip_errors")
    return command


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--omnivoice-root", required=True, type=Path)
    parser.add_argument("--run-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    omnivoice_root = args.omnivoice_root.expanduser().resolve()
    run_dir = args.run_dir.expanduser().resolve()
    meta_path = run_dir / "meta.json"
    log_path = run_dir / "prepare.log"

    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
        mode = str(payload.get("mode") or "full_pipeline").strip()
        if mode not in {"jsonl_to_webdataset", "extract_audio_tokens", "full_pipeline"}:
            raise ValueError(f"Unsupported mode: {mode}")

        stdout_chunks: List[str] = []
        stderr_chunks: List[str] = []
        commands: List[List[str]] = []
        raw_data_lst_path: Optional[str] = None
        token_data_lst_path: Optional[str] = None

        if mode in {"jsonl_to_webdataset", "full_pipeline"}:
            cmd = _build_jsonl_to_webdataset_command(payload)
            commands.append(cmd)
            completed = subprocess.run(
                cmd,
                cwd=str(omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
            )
            stdout_chunks.append(completed.stdout or "")
            stderr_chunks.append(completed.stderr or "")
            if completed.returncode != 0:
                raise RuntimeError(
                    f"jsonl_to_webdataset failed with exit code {completed.returncode}"
                )
            raw_output_dir = Path(str(payload["raw_output_dir"])).expanduser().resolve()
            raw_data_lst_path = str(raw_output_dir / "data.lst")

        if mode in {"extract_audio_tokens", "full_pipeline"}:
            cmd = _build_extract_audio_tokens_command(payload, raw_data_lst_path)
            commands.append(cmd)
            completed = subprocess.run(
                cmd,
                cwd=str(omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
            )
            stdout_chunks.append(completed.stdout or "")
            stderr_chunks.append(completed.stderr or "")
            if completed.returncode != 0:
                raise RuntimeError(
                    f"extract_audio_tokens failed with exit code {completed.returncode}"
                )
            token_output_dir = Path(str(payload["token_output_dir"])).expanduser().resolve()
            token_data_lst_path = str(token_output_dir / "data.lst")

        combined_log = "\n\n".join(
            [
                "\n".join(
                    [
                        f"$ {' '.join(command)}",
                        stdout_chunks[index].strip(),
                        stderr_chunks[index].strip(),
                    ]
                ).strip()
                for index, command in enumerate(commands)
            ]
        ).strip()
        log_path.write_text(combined_log, encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "status": "completed",
                    "mode": mode,
                    "commands": commands,
                    "raw_output_dir": str(Path(str(payload.get("raw_output_dir") or "")).expanduser().resolve())
                    if payload.get("raw_output_dir")
                    else None,
                    "token_output_dir": str(Path(str(payload.get("token_output_dir") or "")).expanduser().resolve())
                    if payload.get("token_output_dir")
                    else None,
                    "raw_data_lst_path": raw_data_lst_path,
                    "token_data_lst_path": token_data_lst_path,
                    "stdout_tail": combined_log[-4000:],
                    "stderr_tail": "\n\n".join(chunk for chunk in stderr_chunks if chunk)[-4000:],
                    "log_path": str(log_path),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
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
