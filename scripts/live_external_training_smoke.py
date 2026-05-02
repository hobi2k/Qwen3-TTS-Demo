#!/usr/bin/env python3
"""Run real training-smoke checks for non-Qwen engines.

This script is deliberately separate from ``live_e2e_verify.py``.  The E2E
script proves that generation surfaces work; this one proves that every
external model family exposes a usable training path and can enter its real
training loop with tiny, disposable data.

The checks are GPU-sensitive, so engines run sequentially.  Smoke fixtures are
written under ``data/training-smoke/external`` and output adapters/models are
created with a ``smoke_`` prefix so they can be distinguished from user assets.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "app" / "backend"
PYTHON = REPO_ROOT / ".venv" / "bin" / "python"
SMOKE_ROOT = REPO_ROOT / "data" / "training-smoke" / "external"
BACKEND_LOG = REPO_ROOT / "data" / "runtime" / "external-training-smoke-backend.log"
SAMPLE_AUDIO = REPO_ROOT / "data" / "e2e" / "live_input.wav"
SAMPLE_LONG_AUDIO = REPO_ROOT / "data" / "e2e" / "live_input_12s.wav"


@dataclass
class SmokeResult:
    """One external training smoke result."""

    engine: str
    status: str
    detail: str


def find_free_port() -> int:
    """Return a currently free localhost port."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def ensure_wav(path: Path, *, duration_sec: float, sample_rate: int = 24_000) -> Path:
    """Create a deterministic speech-like tone WAV if it does not exist."""

    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = int(sample_rate * duration_sec)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(frames):
            carrier = math.sin(2.0 * math.pi * 220.0 * index / sample_rate)
            overtone = 0.35 * math.sin(2.0 * math.pi * 440.0 * index / sample_rate)
            fade = min(1.0, index / (sample_rate * 0.3), (frames - index) / (sample_rate * 0.3))
            value = int(0.12 * fade * 32767 * (carrier + overtone))
            wav.writeframesraw(value.to_bytes(2, byteorder="little", signed=True))
    return path


def request_json(base_url: str, method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 1800.0) -> tuple[int, Any]:
    """Call a JSON endpoint and decode the response."""

    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body: Any = json.loads(raw)
        except json.JSONDecodeError:
            body = raw[:1000]
        return exc.code, body


def summarize_error(body: Any) -> str:
    """Keep FastAPI/subprocess errors compact in terminal output."""

    if isinstance(body, dict):
        detail = body.get("detail", body)
        return str(detail)[:900]
    return str(body)[:900]


def tail_text(path: Path, max_lines: int = 80) -> str:
    """Return recent log lines."""

    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-max_lines:])


def start_backend(port: int) -> subprocess.Popen[str]:
    """Start FastAPI on a private port for training-smoke calls."""

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    BACKEND_LOG.parent.mkdir(parents=True, exist_ok=True)
    log_handle = BACKEND_LOG.open("w", encoding="utf-8")
    return subprocess.Popen(
        [
            str(PYTHON),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=BACKEND_DIR,
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )


def wait_for_backend(proc: subprocess.Popen[str], base_url: str, timeout: float = 120.0) -> None:
    """Wait until the backend health endpoint responds."""

    started_at = time.time()
    while time.time() - started_at < timeout:
        if proc.poll() is not None:
            raise RuntimeError("backend exited early\n" + tail_text(BACKEND_LOG))
        try:
            status, _ = request_json(base_url, "GET", "/api/health", timeout=2.0)
            if status == 200:
                return
        except Exception:
            time.sleep(0.5)
    raise TimeoutError("backend did not become healthy\n" + tail_text(BACKEND_LOG))


def stop_backend(proc: subprocess.Popen[str]) -> None:
    """Terminate the backend process group."""

    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=20)
    except Exception:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            pass


def post_training(base_url: str, engine: str, path: str, payload: dict[str, Any], *, timeout: float) -> SmokeResult:
    """POST one training request and normalize the result."""

    print(f"[external-train-smoke] START {engine}", flush=True)
    try:
        status, body = request_json(base_url, "POST", path, payload, timeout=timeout)
    except Exception as exc:  # noqa: BLE001 - external runtime failures are the test result.
        print(f"[external-train-smoke] FAIL  {engine}: {exc}", flush=True)
        return SmokeResult(engine, "FAIL", str(exc))
    if 200 <= status < 300 and isinstance(body, dict):
        body_status = str(body.get("status", "completed"))
        if body_status == "completed":
            detail = str(body.get("log_path") or body.get("final_checkpoint_path") or body.get("adapter_path") or body.get("model_path") or "completed")
            print(f"[external-train-smoke] PASS  {engine}: {detail}", flush=True)
            return SmokeResult(engine, "PASS", detail)
        detail = summarize_error(body)
        print(f"[external-train-smoke] FAIL  {engine}: {detail}", flush=True)
        return SmokeResult(engine, "FAIL", detail)
    detail = f"HTTP {status}: {summarize_error(body)}"
    print(f"[external-train-smoke] FAIL  {engine}: {detail}", flush=True)
    return SmokeResult(engine, "FAIL", detail)


def prepare_vibevoice_data() -> tuple[Path, Path]:
    """Create a tiny local JSONL dataset for VibeVoice TTS LoRA smoke."""

    source = ensure_wav(SAMPLE_LONG_AUDIO, duration_sec=12.0)
    data_dir = SMOKE_ROOT / "vibevoice"
    audio_dir = data_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    target = audio_dir / "speaker_01.wav"
    prompt = audio_dir / "speaker_01_prompt.wav"
    shutil.copy2(source, target)
    shutil.copy2(source, prompt)
    jsonl_path = data_dir / "train.jsonl"
    records = [
        {
            "text": "Speaker 1: Today is a short VibeVoice training smoke sample.",
            "audio": str(target),
            "voice_prompts": [str(prompt)],
        }
    ]
    jsonl_path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in records) + "\n", encoding="utf-8")
    return data_dir, jsonl_path


def prepare_s2pro_lab_data() -> Path:
    """Create Fish Speech lab/audio data for S2-Pro training smoke."""

    source = ensure_wav(SAMPLE_LONG_AUDIO, duration_sec=12.0)
    data_dir = SMOKE_ROOT / "s2pro_lab"
    data_dir.mkdir(parents=True, exist_ok=True)
    wav_path = data_dir / "sample.wav"
    lab_path = data_dir / "sample.lab"
    shutil.copy2(source, wav_path)
    lab_path.write_text("오늘은 아주 짧은 에스 투 프로 학습 검증 문장입니다.\n", encoding="utf-8")
    return data_dir


def prepare_s2pro_proto_data() -> Path:
    """Create a tiny Fish Speech semantic proto stream for train-loop smoke.

    This bypasses raw wav -> DAC codec extraction.  That extraction path depends
    on ``descript-audio-codec``, whose protobuf pin conflicts with the current
    audio-separator stack.  The resulting file still exercises Fish Speech's
    actual text2semantic training loop.
    """

    sys.path.insert(0, str(REPO_ROOT / "vendor" / "fish-speech"))
    from fish_speech.datasets.protos.text_data_pb2 import Sentence, Semantics, TextData
    from fish_speech.datasets.protos.text_data_stream import write_pb_stream

    proto_dir = SMOKE_ROOT / "s2pro_proto"
    if proto_dir.exists():
        shutil.rmtree(proto_dir)
    proto_dir.mkdir(parents=True, exist_ok=True)
    proto_path = proto_dir / "smoke.protos"

    text_data = TextData(source="external-training-smoke", name="smoke_speaker")
    sentence = Sentence()
    sentence.texts.append("오늘은 아주 짧은 에스 투 프로 학습 검증 문장입니다.")
    for codebook in range(10):
        semantic = Semantics()
        semantic.values.extend([(index + codebook) % 1024 + 1 for index in range(24)])
        sentence.semantics.append(semantic)
    text_data.sentences.append(sentence)

    with proto_path.open("wb") as handle:
        write_pb_stream(handle, text_data)
    return proto_dir


def prepare_ace_step_tensors() -> Path:
    """Use ACE-Step's own tensor fixture generator for adapter training smoke."""

    tensor_dir = SMOKE_ROOT / "ace_step_tensors"
    if tensor_dir.exists():
        shutil.rmtree(tensor_dir)
    tensor_dir.mkdir(parents=True, exist_ok=True)
    command = [
        str(PYTHON),
        "-m",
        "acestep.training_v2.make_test_fixtures",
        "--output-dir",
        str(tensor_dir),
        "--num-samples",
        "2",
        "--latent-length",
        "64",
        "--encoder-length",
        "32",
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "vendor" / "ACE-Step") + os.pathsep + env.get("PYTHONPATH", "")
    completed = subprocess.run(command, cwd=REPO_ROOT / "vendor" / "ACE-Step", env=env, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"ACE-Step fixture generation failed:\n{completed.stdout}\n{completed.stderr}")
    return tensor_dir


def prepare_mmaudio_example_memmap(*, latent_seq_len: int = 345, latent_dim: int = 40) -> None:
    """Create tiny MMAudio example memmaps with the official expected schema."""

    import torch
    from tensordict import TensorDict

    root = REPO_ROOT / "vendor" / "MMAudio" / "training" / "example_output" / "memmap"
    video_dir = root / "vgg-example"
    audio_dir = root / "audio-example"
    for path in (video_dir, audio_dir):
        if path.exists():
            shutil.rmtree(path)
    root.mkdir(parents=True, exist_ok=True)

    batch = 2
    clip_seq_len = 64
    sync_seq_len = 192
    text_seq_len = 77
    text_dim = 1024
    clip_dim = 1024
    sync_dim = 768

    def positive_std(*shape: int) -> Any:
        return torch.rand(*shape, dtype=torch.float32) * 0.05 + 0.05

    video_td = TensorDict(
        {
            "mean": torch.randn(batch, latent_seq_len, latent_dim, dtype=torch.float32) * 0.02,
            "std": positive_std(batch, latent_seq_len, latent_dim),
            "clip_features": torch.randn(batch, clip_seq_len, clip_dim, dtype=torch.float32) * 0.02,
            "sync_features": torch.randn(batch, sync_seq_len, sync_dim, dtype=torch.float32) * 0.02,
            "text_features": torch.randn(batch, text_seq_len, text_dim, dtype=torch.float32) * 0.02,
        },
        batch_size=[batch],
    )
    audio_td = TensorDict(
        {
            "mean": torch.randn(batch, latent_seq_len, latent_dim, dtype=torch.float32) * 0.02,
            "std": positive_std(batch, latent_seq_len, latent_dim),
            "text_features": torch.randn(batch, text_seq_len, text_dim, dtype=torch.float32) * 0.02,
        },
        batch_size=[batch],
    )
    video_td.memmap_(video_dir)
    audio_td.memmap_(audio_dir)
    (root / "vgg-example.tsv").write_text("id\tlabel\nvideo_000\tsoft footsteps in a quiet room\nvideo_001\tcloth rustling in a small studio\n", encoding="utf-8")
    (root / "audio-example.tsv").write_text("id\tcaption\naudio_000\tsoft footsteps in a quiet room\naudio_001\tcloth rustling in a small studio\n", encoding="utf-8")


def prepare_rvc_audio() -> list[str]:
    """Return selected audio paths for Applio/RVC training smoke."""

    source = ensure_wav(SAMPLE_LONG_AUDIO, duration_sec=12.0)
    data_dir = SMOKE_ROOT / "rvc_audio"
    data_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for index in range(2):
        target = data_dir / f"sample_{index:02d}.wav"
        shutil.copy2(source, target)
        paths.append(str(target.relative_to(REPO_ROOT)))
    return paths


def run_smoke_checks(engines: list[str], port: int | None) -> int:
    """Run requested external training smoke checks sequentially."""

    ensure_wav(SAMPLE_AUDIO, duration_sec=1.0)
    ensure_wav(SAMPLE_LONG_AUDIO, duration_sec=12.0)
    SMOKE_ROOT.mkdir(parents=True, exist_ok=True)

    port = port or find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    proc = start_backend(port)
    results: list[SmokeResult] = []
    try:
        wait_for_backend(proc, base_url)
        print(f"[external-train-smoke] backend ready: {base_url}", flush=True)

        runners: dict[str, Callable[[], SmokeResult]] = {
            "s2pro": lambda: post_training(
                base_url,
                "s2pro",
                "/api/s2-pro/train",
                {
                    "output_name": "smoke_s2pro",
                    "training_type": "lora",
                    "source_type": "protos",
                    "proto_dir": str(prepare_s2pro_proto_data()),
                    "max_steps": 1,
                    "val_check_interval": 1,
                    "batch_size": 1,
                    "accumulate_grad_batches": 1,
                    "num_workers": 1,
                    "vq_batch_size": 1,
                    "vq_num_workers": 0,
                    "merge_lora": False,
                },
                timeout=2400.0,
            ),
            "vibevoice": lambda: (
                lambda data: post_training(
                    base_url,
                    "vibevoice",
                    "/api/vibevoice/train",
                    {
                        "training_mode": "tts_lora",
                        "output_name": "smoke_vibevoice",
                        "data_dir": str(data[0]),
                        "train_jsonl": str(data[1]),
                        "eval_split_name": "",
                        "ignore_verifications": True,
                        "num_train_epochs": 0.01,
                        "per_device_train_batch_size": 1,
                        "gradient_accumulation_steps": 1,
                        "logging_steps": 1,
                        "save_steps": 1,
                        "lora_r": 4,
                        "lora_alpha": 8,
                        "ddpm_batch_mul": 1,
                        "bf16": True,
                        "gradient_checkpointing": True,
                    },
                    timeout=2400.0,
                )
            )(prepare_vibevoice_data()),
            "applio": lambda: post_training(
                base_url,
                "applio_rvc",
                "/api/audio-tools/rvc-train",
                {
                    "model_name": "smoke_external_rvc",
                    "audio_paths": prepare_rvc_audio(),
                    "sample_rate": 40000,
                    "total_epoch": 1,
                    "batch_size": 1,
                    "cpu_cores": 2,
                    "gpu": "0",
                    "f0_method": "rmvpe",
                    "embedder_model": "contentvec",
                    "cut_preprocess": "Automatic",
                    "noise_reduction": False,
                    "checkpointing": False,
                },
                timeout=2400.0,
            ),
            "mmaudio": lambda: (
                prepare_mmaudio_example_memmap(),
                post_training(
                    base_url,
                    "mmaudio",
                    "/api/audio-tools/mmaudio-train",
                    {
                        "output_name": "smoke_mmaudio",
                        "model": "small_44k",
                        "data_mode": "example",
                        "nproc_per_node": 1,
                        "num_iterations": 2,
                        "batch_size": 1,
                        "learning_rate": 1e-4,
                        "compile": False,
                        "debug": False,
                        "save_weights_interval": 999999,
                        "save_checkpoint_interval": 999999,
                        "ema_checkpoint_interval": 1,
                        "val_interval": 999999,
                        "eval_interval": 999999,
                    },
                    timeout=1800.0,
                ),
            )[1],
            "ace-step": lambda: post_training(
                base_url,
                "ace_step",
                "/api/music/ace-step/train-adapter",
                {
                    "output_name": "smoke_ace_step",
                    "adapter_type": "lora",
                    "trainer_mode": "fixed",
                    "source_type": "tensors",
                    "tensor_dir": str(prepare_ace_step_tensors()),
                    "model_variant": "turbo",
                    "device": "cuda",
                    "precision": "bf16",
                    "learning_rate": 1e-4,
                    "batch_size": 1,
                    "gradient_accumulation": 1,
                    "epochs": 1,
                    "save_every": 1,
                    "num_workers": 0,
                    "gradient_checkpointing": True,
                    "rank": 4,
                    "alpha": 8,
                    "dropout": 0.0,
                },
                timeout=2400.0,
            ),
        }

        for engine in engines:
            runner = runners[engine]
            results.append(runner())

    finally:
        stop_backend(proc)

    print("\n[external-train-smoke] SUMMARY", flush=True)
    for result in results:
        print(f"{result.status:4s} {result.engine:12s} {result.detail}", flush=True)
    failed = [result for result in results if result.status != "PASS"]
    if failed:
        print("\n[external-train-smoke] backend log tail:", flush=True)
        print(tail_text(BACKEND_LOG), flush=True)
    return 1 if failed else 0


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--engines",
        nargs="+",
        choices=["s2pro", "vibevoice", "applio", "mmaudio", "ace-step"],
        default=["s2pro", "vibevoice", "applio", "mmaudio", "ace-step"],
        help="External training engines to smoke-test sequentially.",
    )
    parser.add_argument("--port", type=int, default=None, help="Backend port. Defaults to an ephemeral free port.")
    return parser.parse_args()


def main() -> int:
    """CLI entrypoint."""

    args = parse_args()
    return run_smoke_checks(args.engines, args.port)


if __name__ == "__main__":
    sys.exit(main())
