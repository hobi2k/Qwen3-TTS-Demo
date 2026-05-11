"""CosyVoice 3 inference helpers.

The backend launches CosyVoice 3 in a separate Python process so the
heavy CosyVoice + Matcha-TTS stack never imports into the FastAPI
worker. This mirrors :mod:`app.backend.app.ace_step` and runs the model
inside its own virtual env (``.venv-cosyvoice3``). The companion script
lives at ``scripts/run_cosyvoice_generate.py``.

Supported tasks (see ``run_cosyvoice_generate.py`` for full schema):

* ``zero_shot``     – clone the voice from a reference WAV + transcript.
* ``cross_lingual`` – read multilingual text (KR/JP/etc.) in a cloned voice;
                      supports fine-grained tags like ``[laughter]``/``[breath]``.
* ``instruct2``     – natural-language style control (``inference_instruct2``).
* ``sft``           – built-in speaker preset (CosyVoice 1 ``*-SFT`` models).
* ``vc``            – voice conversion (source audio → target voice).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class CosyVoiceError(RuntimeError):
    """Raised when CosyVoice generation cannot complete."""


SUPPORTED_TASKS = {"zero_shot", "cross_lingual", "instruct2", "sft", "vc"}

DEFAULT_MODEL_VARIANTS = [
    "Fun-CosyVoice3-0.5B",
    "CosyVoice2-0.5B",
    "CosyVoice-300M",
    "CosyVoice-300M-SFT",
    "CosyVoice-300M-Instruct",
]

# Languages CosyVoice 3 advertises explicit support for. Korean is part of
# the cross-lingual mode (use task=cross_lingual for Korean text).
SUPPORTED_LANGUAGES = ["zh", "en", "ja", "ko", "yue", "es", "fr", "de", "ru"]


def resolve_cosyvoice_root(repo_root: Path) -> Path:
    """Resolve the local CosyVoice checkout path."""

    configured = os.getenv("COSYVOICE_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "CosyVoice").resolve()


def resolve_cosyvoice_python(repo_root: Path) -> str:
    """Resolve the Python executable used for CosyVoice generation."""

    configured = os.getenv("COSYVOICE_PYTHON", "").strip() or os.getenv(
        "COSYVOICE_PYTHON_EXECUTABLE", ""
    ).strip()
    if configured:
        return configured
    candidates = [
        repo_root / ".venv-cosyvoice3" / "bin" / "python",
        repo_root / ".venv-cosyvoice" / "bin" / "python",
        repo_root / "vendor" / "CosyVoice" / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def resolve_cosyvoice_model_dir(repo_root: Path) -> Path:
    """Resolve the CosyVoice pretrained-model cache directory."""

    configured = os.getenv("COSYVOICE_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "cosyvoice3").resolve()


def resolve_cosyvoice_voice_dir(repo_root: Path) -> Path:
    """Where saved CosyVoice voice presets are stored."""

    configured = os.getenv("COSYVOICE_VOICE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "cosyvoice3-voices").resolve()


class CosyVoice3Engine:
    """Subprocess wrapper around the CosyVoice 3 inference pipeline."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.cosyvoice_root = resolve_cosyvoice_root(repo_root)
        self.python_executable = resolve_cosyvoice_python(repo_root)
        self.model_dir = resolve_cosyvoice_model_dir(repo_root)
        self.voice_dir = resolve_cosyvoice_voice_dir(repo_root)
        self.runner_path = repo_root / "scripts" / "run_cosyvoice_generate.py"

    def is_available(self) -> bool:
        """Return whether the CosyVoice checkout and runner are present."""

        return self.cosyvoice_root.exists() and self.runner_path.exists()

    def availability_notes(self) -> str:
        """Return a human-readable runtime status string."""

        if not self.cosyvoice_root.exists():
            return f"CosyVoice repository not found: {self.cosyvoice_root}"
        if not self.runner_path.exists():
            return f"CosyVoice runner not found: {self.runner_path}"
        if Path(self.python_executable) == Path(sys.executable):
            return (
                f"CosyVoice root: {self.cosyvoice_root} (using shared Python; create a"
                " dedicated .venv-cosyvoice3 or set COSYVOICE_PYTHON_EXECUTABLE for"
                " best isolation)"
            )
        return f"CosyVoice root: {self.cosyvoice_root} (python: {self.python_executable})"

    def list_model_variants(self) -> List[Dict[str, Any]]:
        """Return CosyVoice checkpoints visible in the local model cache."""

        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        if not self.model_dir.exists():
            return [{"name": name, "available": False} for name in DEFAULT_MODEL_VARIANTS]
        for name in DEFAULT_MODEL_VARIANTS:
            available = (self.model_dir / name).exists()
            results.append({"name": name, "available": available})
            seen.add(name)
        for child in sorted(self.model_dir.iterdir()):
            if not child.is_dir() or child.name in seen:
                continue
            if "cosyvoice" in child.name.lower() or "fun-cosyvoice" in child.name.lower():
                results.append({"name": child.name, "available": True})
                seen.add(child.name)
        return results

    def list_voice_presets(self) -> List[Dict[str, Any]]:
        """List saved CosyVoice voice presets in ``data/cosyvoice3-voices``."""

        if not self.voice_dir.exists():
            return []
        presets: List[Dict[str, Any]] = []
        for path in sorted(self.voice_dir.glob("*.json")):
            try:
                meta = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            presets.append(
                {
                    "name": path.stem,
                    "path": str(path),
                    "prompt_text": meta.get("prompt_text", ""),
                    "prompt_audio_path": meta.get("prompt_audio_path", ""),
                    "language": meta.get("language", ""),
                    "task": meta.get("task", "zero_shot"),
                }
            )
        return presets

    def resolve_model_dir(self, requested: Optional[str]) -> Path:
        """Resolve a payload-supplied model name/path against the local cache."""

        if requested:
            candidate = Path(requested).expanduser()
            if candidate.is_absolute() and candidate.exists():
                return candidate.resolve()
            local = self.model_dir / requested
            if local.exists():
                return local.resolve()
            raise CosyVoiceError(f"CosyVoice model not found: {requested}")

        for name in DEFAULT_MODEL_VARIANTS:
            local = self.model_dir / name
            if local.exists():
                return local.resolve()
        raise CosyVoiceError(
            f"No CosyVoice model checkpoint found under {self.model_dir}. "
            "Download Fun-CosyVoice3-0.5B from ModelScope/HuggingFace first."
        )

    def run(
        self,
        *,
        task: str,
        output_path: Path,
        payload: Dict[str, Any],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Invoke the CosyVoice subprocess and return the audio path + meta."""

        if task not in SUPPORTED_TASKS:
            raise CosyVoiceError(f"Unsupported CosyVoice task: {task}")
        if not self.is_available():
            raise CosyVoiceError(self.availability_notes())

        model_dir = self.resolve_model_dir(payload.get("model_dir") or payload.get("model_name"))

        output_path.parent.mkdir(parents=True, exist_ok=True)
        request_path = output_path.with_suffix(output_path.suffix + ".cosyvoice-request.json")
        merged_payload = dict(payload)
        merged_payload["task"] = task
        merged_payload["model_dir"] = str(model_dir)
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
            "--cosyvoice-root",
            str(self.cosyvoice_root),
            "--model-dir",
            str(model_dir),
        ]
        env = os.environ.copy()
        env.setdefault("PYTHONPATH", str(self.cosyvoice_root / "third_party" / "Matcha-TTS"))
        cache_root = self.repo_root / "data" / "cache" / "cosyvoice3"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
        env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
        env.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
        for var in ("HF_HOME", "TRANSFORMERS_CACHE", "MODELSCOPE_CACHE", "MPLCONFIGDIR"):
            Path(env[var]).mkdir(parents=True, exist_ok=True)

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.cosyvoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise CosyVoiceError(f"CosyVoice generation timed out after {timeout}s") from exc

        meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0:
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise CosyVoiceError(
                "CosyVoice generation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )

        if not output_path.exists():
            raise CosyVoiceError(f"CosyVoice did not create output file: {output_path}")

        meta: Dict[str, Any] = {
            "engine": "cosyvoice3",
            "task": task,
            "cosyvoice_root": str(self.cosyvoice_root),
            "model_dir": str(model_dir),
            "python_executable": self.python_executable,
            "request_path": str(request_path),
            "stdout": completed.stdout[-4000:],
            "stderr": completed.stderr[-4000:],
        }
        if isinstance(meta_payload, dict):
            meta.update({k: v for k, v in meta_payload.items() if k not in {"stdout", "stderr"}})
        meta["request_payload"] = merged_payload
        return output_path, meta

    def save_voice_preset(
        self,
        *,
        name: str,
        prompt_text: str,
        prompt_audio_path: str,
        language: str = "",
        task: str = "zero_shot",
        notes: str = "",
    ) -> Dict[str, Any]:
        """Persist a CosyVoice voice preset to ``data/cosyvoice3-voices``."""

        if not name.strip():
            raise CosyVoiceError("Voice preset name cannot be empty")
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "name": name,
            "prompt_text": prompt_text,
            "prompt_audio_path": prompt_audio_path,
            "language": language,
            "task": task,
            "notes": notes,
        }
        target = self.voice_dir / f"{name}.json"
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"name": name, "path": str(target), **record}

    def delete_voice_preset(self, name: str) -> bool:
        target = self.voice_dir / f"{name}.json"
        if not target.exists():
            return False
        target.unlink()
        return True

    def resolve_finetune_run_dir(self, run_id: str) -> Path:
        """Where one training run stores checkpoints, logs, and metadata."""

        return (self.repo_root / "data" / "finetune-runs" / "cosyvoice3" / run_id).resolve()

    def train(
        self,
        *,
        run_id: str,
        manifest_path: Path,
        cv_manifest_path: Optional[Path],
        submodels: List[str],
        train_engine: str,
        base_model: str,
        max_epoch: int,
        batch_size: int,
        learning_rate: float,
        num_workers: int,
        extra_args: List[str],
        audio_root: Optional[Path] = None,
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Launch the CosyVoice fine-tuning pipeline in a subprocess.

        Returns the run directory and the parsed ``meta.json`` payload written
        by :mod:`scripts.run_cosyvoice_train`.
        """

        if not self.is_available():
            raise CosyVoiceError(self.availability_notes())

        pretrained_dir = self.resolve_model_dir(base_model)
        run_dir = self.resolve_finetune_run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        runner_path = self.repo_root / "scripts" / "run_cosyvoice_train.py"
        if not runner_path.exists():
            raise CosyVoiceError(f"CosyVoice training runner not found: {runner_path}")

        manifest_path = manifest_path.expanduser().resolve()
        if not manifest_path.exists():
            raise CosyVoiceError(f"Training manifest not found: {manifest_path}")
        if cv_manifest_path is not None:
            cv_manifest_path = cv_manifest_path.expanduser().resolve()
            if not cv_manifest_path.exists():
                raise CosyVoiceError(f"Validation manifest not found: {cv_manifest_path}")

        request_path = run_dir / "request.json"
        request_payload: Dict[str, Any] = {
            "run_id": run_id,
            "manifest_path": str(manifest_path),
            "cv_manifest_path": str(cv_manifest_path) if cv_manifest_path else None,
            "audio_root": str(audio_root.expanduser().resolve()) if audio_root else str(manifest_path.parent),
            "submodels": submodels,
            "train_engine": train_engine,
            "base_model": base_model,
            "max_epoch": max_epoch,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "num_workers": num_workers,
            "extra_args": list(extra_args),
        }
        request_path.write_text(
            json.dumps(request_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        command = [
            self.python_executable,
            str(runner_path),
            "--request-json",
            str(request_path),
            "--cosyvoice-root",
            str(self.cosyvoice_root),
            "--pretrained-dir",
            str(pretrained_dir),
            "--run-dir",
            str(run_dir),
        ]
        env = os.environ.copy()
        env.setdefault("PYTHONPATH", str(self.cosyvoice_root / "third_party" / "Matcha-TTS"))
        cache_root = self.repo_root / "data" / "cache" / "cosyvoice3"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
        env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
        for var in ("HF_HOME", "TRANSFORMERS_CACHE", "MODELSCOPE_CACHE"):
            Path(env[var]).mkdir(parents=True, exist_ok=True)

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.cosyvoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise CosyVoiceError(f"CosyVoice training timed out after {timeout}s") from exc

        meta_path = run_dir / "meta.json"
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0 and meta_payload.get("status") != "completed":
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise CosyVoiceError(
                "CosyVoice training failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )

        meta_payload.setdefault("status", "completed")
        meta_payload.setdefault("run_dir", str(run_dir))
        meta_payload["stdout_tail"] = completed.stdout[-4000:]
        meta_payload["stderr_tail"] = completed.stderr[-4000:]
        return run_dir, meta_payload
