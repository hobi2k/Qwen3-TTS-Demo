#!/usr/bin/env python3
"""Run short live fine-tuning smoke checks and delete temporary outputs.

This is intentionally not a quality run. It starts each training entrypoint
against the tiny prepared subset, waits until the real training loop prints a
``Step``/``Loss`` line, then stops that process group and removes the temporary
checkpoint directory. The goal is to prove that model loading, dataset loading,
forward/backward/optimizer, and logging can enter the training step without
leaving junk artifacts behind.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON = REPO_ROOT / ".venv" / "bin" / "python"
STEP_RE = re.compile(r"Epoch\s+\d+\s+\|\s+Step\s+\d+\s+\|\s+Loss:\s+[-+0-9.eE]+")


@dataclass(frozen=True)
class SmokeTask:
    """One real training subprocess to verify."""

    name: str
    command: list[str]
    output_dir: Path


def repo_path(path: str) -> Path:
    """Resolve repo-relative paths against the project root."""

    candidate = Path(path)
    return candidate if candidate.is_absolute() else REPO_ROOT / candidate


def ensure_path(path: Path, label: str) -> None:
    """Fail before spawning a heavy process when a required path is missing."""

    if not path.exists():
        raise SystemExit(f"{label} not found: {path}")


def smoke_env() -> dict[str, str]:
    """Build the low-risk training environment for step-only verification."""

    env = os.environ.copy()
    pythonpath_parts = [
        str(REPO_ROOT / "qwen_extensions"),
        str(REPO_ROOT / "qwen_extensions" / "finetuning"),
        str(REPO_ROOT / "vendor" / "Qwen3-TTS"),
        str(REPO_ROOT / "vendor" / "Qwen3-TTS" / "finetuning"),
    ]
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = ":".join(pythonpath_parts + ([current_pythonpath] if current_pythonpath else []))
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("TOKENIZERS_PARALLELISM", "false")
    env.setdefault("HF_HOME", str(REPO_ROOT / "data" / ".cache" / "huggingface"))
    env.setdefault("TRANSFORMERS_CACHE", str(REPO_ROOT / "data" / ".cache" / "huggingface"))
    env.setdefault("MPLCONFIGDIR", str(REPO_ROOT / "data" / ".cache" / "matplotlib"))
    env.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    env.setdefault("QWEN_DEMO_GRAD_ACCUM_STEPS", "1")
    env.setdefault("QWEN_DEMO_LOG_EVERY", "1")
    env.setdefault("QWEN_DEMO_OPTIMIZER", "adafactor")
    return env


def build_tasks(selected: list[str]) -> list[SmokeTask]:
    """Create the smoke task list from known local Qwen training entrypoints."""

    train_jsonl = repo_path("data/datasets/mai_ko_subsets/prepared_4.jsonl")
    base_model = repo_path("data/models/Qwen3-TTS-12Hz-1.7B-Base")
    custom_model = repo_path("data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice")
    voicebox_model = repo_path("data/finetune-runs/mai_ko_voicebox17b_full/final")
    output_root = repo_path("data/training-smoke")

    ensure_path(PYTHON, "Project Python")
    ensure_path(train_jsonl, "Prepared smoke JSONL")
    ensure_path(base_model, "Base 1.7B model")
    ensure_path(custom_model, "CustomVoice 1.7B model")
    ensure_path(voicebox_model, "VoiceBox model")

    all_tasks = {
        "base": SmokeTask(
            name="qwen-base-1.7b",
            output_dir=output_root / "qwen-base-1.7b",
            command=[
                str(PYTHON),
                str(REPO_ROOT / "qwen_extensions" / "finetuning" / "sft_base_12hz.py"),
                "--init_model_path",
                str(base_model),
                "--output_model_path",
                str(output_root / "qwen-base-1.7b"),
                "--train_jsonl",
                str(train_jsonl),
                "--batch_size",
                "1",
                "--lr",
                "2e-6",
                "--num_epochs",
                "1",
                "--speaker_name",
                "smoke",
            ],
        ),
        "customvoice": SmokeTask(
            name="qwen-customvoice-1.7b",
            output_dir=output_root / "qwen-customvoice-1.7b",
            command=[
                str(PYTHON),
                str(REPO_ROOT / "qwen_extensions" / "finetuning" / "sft_custom_voice_12hz.py"),
                "--init_model_path",
                str(custom_model),
                "--speaker_encoder_model_path",
                str(base_model),
                "--output_model_path",
                str(output_root / "qwen-customvoice-1.7b"),
                "--train_jsonl",
                str(train_jsonl),
                "--batch_size",
                "1",
                "--lr",
                "2e-6",
                "--num_epochs",
                "1",
                "--speaker_name",
                "smoke",
            ],
        ),
        "voicebox": SmokeTask(
            name="qwen-voicebox-1.7b",
            output_dir=output_root / "qwen-voicebox-1.7b",
            command=[
                str(PYTHON),
                str(REPO_ROOT / "qwen_extensions" / "finetuning" / "sft_voicebox_12hz.py"),
                "--init_model_path",
                str(voicebox_model),
                "--output_model_path",
                str(output_root / "qwen-voicebox-1.7b"),
                "--train_jsonl",
                str(train_jsonl),
                "--batch_size",
                "1",
                "--lr",
                "2e-6",
                "--num_epochs",
                "1",
                "--speaker_name",
                "smoke",
            ],
        ),
    }
    return [all_tasks[name] for name in selected]


def terminate_process_group(process: subprocess.Popen[str], grace_seconds: float = 8.0) -> None:
    """Stop a training process group without leaving child workers running."""

    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGINT)
    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return
        time.sleep(0.25)
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return
        time.sleep(0.25)
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGKILL)


def cleanup_output(path: Path) -> None:
    """Delete temporary smoke outputs created by a task."""

    if path.exists():
        shutil.rmtree(path)


def run_task(task: SmokeTask, timeout_seconds: int) -> bool:
    """Run one task until its first real step log appears."""

    cleanup_output(task.output_dir)
    task.output_dir.parent.mkdir(parents=True, exist_ok=True)
    print(f"\n== {task.name} ==", flush=True)
    print("$ " + " ".join(task.command), flush=True)

    process = subprocess.Popen(
        task.command,
        cwd=str(REPO_ROOT),
        env=smoke_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )

    matched_line = ""
    deadline = time.monotonic() + timeout_seconds
    try:
        assert process.stdout is not None
        while time.monotonic() < deadline:
            line = process.stdout.readline()
            if not line:
                if process.poll() is not None:
                    break
                time.sleep(0.2)
                continue
            print(line, end="", flush=True)
            if STEP_RE.search(line):
                matched_line = line.strip()
                break

        if matched_line:
            print(f"PASS step observed: {matched_line}", flush=True)
            terminate_process_group(process)
            return True

        terminate_process_group(process)
        return_code = process.poll()
        print(f"FAIL no step observed before timeout/exit. returncode={return_code}", flush=True)
        return False
    finally:
        terminate_process_group(process, grace_seconds=3.0)
        cleanup_output(task.output_dir)
        if task.output_dir.parent.exists() and not any(task.output_dir.parent.iterdir()):
            task.output_dir.parent.rmdir()


def parse_args() -> argparse.Namespace:
    """Parse command-line options."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--task",
        action="append",
        choices=["base", "customvoice", "voicebox"],
        help="Task to run. Repeat for multiple tasks. Defaults to all Qwen training paths.",
    )
    parser.add_argument("--timeout-seconds", type=int, default=900)
    return parser.parse_args()


def main() -> None:
    """Run selected step smoke checks."""

    args = parse_args()
    selected = args.task or ["base", "customvoice", "voicebox"]
    tasks = build_tasks(selected)
    failed: list[str] = []
    for task in tasks:
        if not run_task(task, timeout_seconds=args.timeout_seconds):
            failed.append(task.name)

    if failed:
        raise SystemExit(f"Training step smoke failed: {', '.join(failed)}")
    print("\nAll selected training step smoke checks passed and temp outputs were deleted.", flush=True)


if __name__ == "__main__":
    main()
