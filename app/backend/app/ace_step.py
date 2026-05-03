"""ACE-Step-1.5 music composition helpers.

The backend launches ACE-Step in a separate Python process so the heavy
music model is never imported into the FastAPI worker. This keeps the web
server responsive and lets ACE-Step run inside its own virtual env (which
typically pins different ``torch`` / ``cu128`` builds than the rest of the
project). The companion subprocess script lives at
``scripts/run_ace_step_generate.py`` and accepts a JSON request describing
which task to run.

Supported tasks (see ``run_ace_step_generate.py`` for full payload schema):

* ``text2music``   – pure prompt + lyrics generation
* ``cover``        – style transfer / cover from a source audio
* ``repaint``      – regenerate a [start, end) region of source audio
* ``extend``       – continuation of an existing track (alias of ``complete``)
* ``extract``      – isolate a single track from source audio
* ``lego``         – generate a single new track on top of source audio
* ``complete``     – fill in missing tracks
* ``understand``   – LM-only audio analysis (caption / BPM / lyrics)
* ``create_sample``/``format_sample`` – LM-only metadata helpers
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class AceStepError(RuntimeError):
    """Raised when ACE-Step generation cannot complete."""


SUPPORTED_TASKS = {
    "text2music",
    "cover",
    "repaint",
    "extend",
    "extract",
    "lego",
    "complete",
    "understand",
    "create_sample",
    "format_sample",
}

DEFAULT_MODEL_VARIANTS = [
    "acestep-v15-turbo",
    "acestep-v15-base",
    "acestep-v15-sft",
    "acestep-v15-turbo-shift1",
    "acestep-v15-turbo-shift3",
    "acestep-v15-turbo-continuous",
    "acestep-v15-xl-base",
    "acestep-v15-xl-sft",
    "acestep-v15-xl-turbo",
]

DEFAULT_LM_MODELS = [
    "acestep-5Hz-lm-1.7B",
    "acestep-5Hz-lm-0.6B",
    "acestep-5Hz-lm-4B",
]

TRACK_NAMES = [
    "woodwinds",
    "brass",
    "fx",
    "synth",
    "strings",
    "percussion",
    "keyboard",
    "guitar",
    "bass",
    "drums",
    "backing_vocals",
    "vocals",
]


def resolve_ace_step_root(repo_root: Path) -> Path:
    """Resolve the local ACE-Step checkout path."""

    configured = os.getenv("ACE_STEP_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "ACE-Step").resolve()


def resolve_ace_step_python(repo_root: Path) -> str:
    """Resolve the Python executable used for ACE-Step generation."""

    configured = os.getenv("ACE_STEP_PYTHON", "").strip()
    if configured:
        return configured

    candidates = [
        repo_root / ".venv-ace-step" / "bin" / "python",
        repo_root / "vendor" / "ACE-Step" / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def resolve_ace_step_checkpoint(repo_root: Path) -> Path:
    """Resolve the ACE-Step checkpoint cache directory."""

    configured = os.getenv("ACE_STEP_CHECKPOINT_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "ace-step").resolve()


def resolve_ace_step_lora_dir(repo_root: Path) -> Path:
    """Resolve the directory the UI scans for ACE-Step LoRA adapters."""

    configured = os.getenv("ACE_STEP_LORA_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "ace-step" / "loras").resolve()


class AceStepComposer:
    """Subprocess wrapper around the ACE-Step-1.5 inference pipeline."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.ace_step_root = resolve_ace_step_root(repo_root)
        self.python_executable = resolve_ace_step_python(repo_root)
        self.checkpoint_path = resolve_ace_step_checkpoint(repo_root)
        self.lora_dir = resolve_ace_step_lora_dir(repo_root)
        self.runner_path = repo_root / "scripts" / "run_ace_step_generate.py"

    def is_available(self) -> bool:
        """Return whether the ACE-Step checkout and runner are present."""

        return self.ace_step_root.exists() and self.runner_path.exists()

    def availability_notes(self) -> str:
        """Return a human-readable runtime status string."""

        if not self.ace_step_root.exists():
            return f"ACE-Step repository not found: {self.ace_step_root}"
        if not self.runner_path.exists():
            return f"ACE-Step runner not found: {self.runner_path}"
        if Path(self.python_executable) == Path(sys.executable):
            return (
                f"ACE-Step root: {self.ace_step_root} (using shared Python; create a dedicated"
                f" .venv-ace-step or set ACE_STEP_PYTHON for best isolation)"
            )
        return f"ACE-Step root: {self.ace_step_root} (python: {self.python_executable})"

    def list_model_variants(self) -> List[Dict[str, Any]]:
        """Return DiT model variants visible in the local checkpoint cache."""

        results: List[Dict[str, Any]] = []
        if not self.checkpoint_path.exists():
            return [{"name": name, "available": False} for name in DEFAULT_MODEL_VARIANTS]
        seen = set()
        for name in DEFAULT_MODEL_VARIANTS:
            available = (self.checkpoint_path / name).exists()
            results.append({"name": name, "available": available})
            seen.add(name)
        for child in self.checkpoint_path.iterdir():
            if not child.is_dir() or child.name in seen:
                continue
            if child.name.startswith("acestep") and "lm" not in child.name:
                results.append({"name": child.name, "available": True})
        return results

    def list_lm_models(self) -> List[Dict[str, Any]]:
        """Return 5Hz LM models available in the checkpoint cache."""

        results: List[Dict[str, Any]] = []
        seen = set()
        for name in DEFAULT_LM_MODELS:
            available = (self.checkpoint_path / name).exists() if self.checkpoint_path.exists() else False
            results.append({"name": name, "available": available})
            seen.add(name)
        if self.checkpoint_path.exists():
            for child in self.checkpoint_path.iterdir():
                if child.is_dir() and "lm" in child.name and child.name not in seen:
                    results.append({"name": child.name, "available": True})
        return results

    def list_lora_adapters(self) -> List[Dict[str, Any]]:
        """Scan ``data/models/ace-step/loras`` for LoRA / LoKr archives."""

        if not self.lora_dir.exists():
            return []
        adapters: List[Dict[str, Any]] = []
        suffixes = {".safetensors", ".bin", ".pt", ".pth", ".ckpt"}
        for path in sorted(self.lora_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in suffixes:
                adapters.append(
                    {
                        "name": path.stem,
                        "path": str(path),
                        "size_bytes": path.stat().st_size,
                        "relative_path": str(path.relative_to(self.lora_dir)),
                    }
                )
            elif path.is_dir() and any(
                (path / fname).exists()
                for fname in ("adapter_model.safetensors", "lokr_weights.safetensors")
            ):
                adapters.append(
                    {
                        "name": path.name,
                        "path": str(path),
                        "size_bytes": None,
                        "relative_path": str(path.relative_to(self.lora_dir)),
                    }
                )
        return adapters

    def run(
        self,
        *,
        task: str,
        output_path: Path,
        payload: Dict[str, Any],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Invoke the ACE-Step subprocess for ``task`` and return the audio path + meta."""

        if task not in SUPPORTED_TASKS:
            raise AceStepError(f"Unsupported ACE-Step task: {task}")
        if not self.is_available():
            raise AceStepError(self.availability_notes())

        output_path.parent.mkdir(parents=True, exist_ok=True)
        request_path = output_path.with_suffix(output_path.suffix + ".ace-step-request.json")
        merged_payload = dict(payload)
        merged_payload["task"] = task
        request_path.write_text(
            json.dumps(merged_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        command = [
            self.python_executable,
            str(self.runner_path),
            "--request-json",
            str(request_path),
            "--output-path",
            str(output_path),
            "--ace-step-root",
            str(self.ace_step_root),
            "--checkpoint-path",
            str(self.checkpoint_path),
        ]
        env = os.environ.copy()
        env.setdefault("ACESTEP_CHECKPOINTS_DIR", str(self.checkpoint_path))
        env.setdefault("ACESTEP_PROJECT_ROOT", str(self.ace_step_root))
        cache_root = self.repo_root / "data" / "cache" / "ace-step"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
        env.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
        Path(env["HF_HOME"]).mkdir(parents=True, exist_ok=True)
        Path(env["TRANSFORMERS_CACHE"]).mkdir(parents=True, exist_ok=True)
        Path(env["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.ace_step_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise AceStepError(f"ACE-Step generation timed out after {timeout}s") from exc

        meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0:
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise AceStepError(
                "ACE-Step generation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )

        produces_audio = task not in {"understand", "create_sample", "format_sample"}
        if produces_audio and not output_path.exists():
            raise AceStepError(f"ACE-Step did not create output file: {output_path}")

        meta = {
            "engine": "ace_step_v1_5",
            "task": task,
            "ace_step_root": str(self.ace_step_root),
            "checkpoint_path": str(self.checkpoint_path),
            "python_executable": self.python_executable,
            "request_path": str(request_path),
            "stdout": completed.stdout[-4000:],
            "stderr": completed.stderr[-4000:],
        }
        if isinstance(meta_payload, dict):
            meta.update({k: v for k, v in meta_payload.items() if k not in {"stdout", "stderr"}})
        meta["request_payload"] = merged_payload
        return output_path, meta
