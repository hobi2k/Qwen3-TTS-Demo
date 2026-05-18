"""VoxCPM2 inference + LoRA fine-tuning helpers.

The backend launches VoxCPM2 in a separate Python process so the heavy
MiniCPM-4 + denoiser stack never imports into the FastAPI worker. This
mirrors :mod:`app.backend.app.cosyvoice` and runs the model inside its
own virtual env (``.venv-voxcpm2``).

Inference tasks (see ``scripts/run_voxcpm_generate.py``):

* ``voice_design``     – text-only (text starts with ``(description)``).
* ``voice_cloning``    – ``text`` + ``reference_wav_path``.
* ``ultimate_cloning`` – text + ``prompt_wav_path`` + ``prompt_text``
                         (+ optional ``reference_wav_path``).

Training: LoRA fine-tuning via ``scripts/train_voxcpm_finetune.py`` in
upstream; the subprocess launcher is ``scripts/run_voxcpm_train.py``.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class VoxCPMError(RuntimeError):
    """Raised when VoxCPM2 generation/training cannot complete."""


SUPPORTED_TASKS = {"voice_design", "voice_cloning", "ultimate_cloning"}

DEFAULT_MODEL_VARIANTS = [
    "VoxCPM2",
    "VoxCPM1.5",
    "VoxCPM",
]

# VoxCPM2 advertises 30 languages including Korean.
SUPPORTED_LANGUAGES = [
    "ar", "my", "zh", "da", "nl", "en", "fi", "fr", "de", "el",
    "he", "hi", "id", "it", "ja", "km", "ko", "lo", "ms", "no",
    "pl", "pt", "ru", "es", "sw", "sv", "tl", "th", "tr", "vi",
]
MODEL_MARKER_FILENAMES = {
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "audiovae.pth",
}


def has_usable_model_files(path: Path) -> bool:
    return path.is_dir() and any(
        item.is_file() and (item.name in MODEL_MARKER_FILENAMES or item.suffix.lower() in {".pth", ".safetensors"})
        for item in path.rglob("*")
    )


def resolve_voxcpm_root(repo_root: Path) -> Path:
    configured = os.getenv("VOXCPM_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "VoxCPM").resolve()


def resolve_voxcpm_python(repo_root: Path) -> str:
    configured = os.getenv("VOXCPM_PYTHON", "").strip() or os.getenv(
        "VOXCPM_PYTHON_EXECUTABLE", ""
    ).strip()
    if configured:
        return configured
    candidates = [
        repo_root / ".venv-voxcpm2" / "bin" / "python",
        repo_root / ".venv-voxcpm" / "bin" / "python",
        repo_root / "vendor" / "VoxCPM" / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def resolve_voxcpm_model_dir(repo_root: Path) -> Path:
    configured = os.getenv("VOXCPM_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "voxcpm2").resolve()


def resolve_voxcpm_voice_dir(repo_root: Path) -> Path:
    configured = os.getenv("VOXCPM_VOICE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "voxcpm2-voices").resolve()


class VoxCPM2Engine:
    """Subprocess wrapper around the VoxCPM2 inference + LoRA pipeline."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.voxcpm_root = resolve_voxcpm_root(repo_root)
        self.python_executable = resolve_voxcpm_python(repo_root)
        self.model_dir = resolve_voxcpm_model_dir(repo_root)
        self.voice_dir = resolve_voxcpm_voice_dir(repo_root)
        self.runner_path = repo_root / "scripts" / "run_voxcpm_generate.py"
        self.train_runner_path = repo_root / "scripts" / "run_voxcpm_train.py"

    def is_available(self) -> bool:
        return self.voxcpm_root.exists() and self.runner_path.exists() and any(
            item.get("available") for item in self.list_model_variants()
        )

    def availability_notes(self) -> str:
        if not self.voxcpm_root.exists():
            return f"VoxCPM repository not found: {self.voxcpm_root}"
        if not self.runner_path.exists():
            return f"VoxCPM runner not found: {self.runner_path}"
        if not any(item.get("available") for item in self.list_model_variants()):
            return f"VoxCPM model weights not found under {self.model_dir}. Run ./scripts/download_models.sh voxcpm."
        if Path(self.python_executable) == Path(sys.executable):
            return (
                f"VoxCPM root: {self.voxcpm_root} (using shared Python; create a"
                " dedicated .venv-voxcpm2 or set VOXCPM_PYTHON_EXECUTABLE for"
                " best isolation)"
            )
        return f"VoxCPM root: {self.voxcpm_root} (python: {self.python_executable})"

    def list_model_variants(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        if not self.model_dir.exists():
            return [{"name": name, "available": False} for name in DEFAULT_MODEL_VARIANTS]
        for name in DEFAULT_MODEL_VARIANTS:
            available = has_usable_model_files(self.model_dir / name)
            results.append({"name": name, "available": available})
            seen.add(name)
        for child in sorted(self.model_dir.iterdir()):
            if not child.is_dir() or child.name in seen:
                continue
            if "voxcpm" in child.name.lower():
                results.append({"name": child.name, "available": has_usable_model_files(child)})
                seen.add(child.name)
        return results

    def list_voice_presets(self) -> List[Dict[str, Any]]:
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
                    "task": meta.get("task", "voice_cloning"),
                    "prompt_text": meta.get("prompt_text", ""),
                    "prompt_wav_path": meta.get("prompt_wav_path", ""),
                    "reference_wav_path": meta.get("reference_wav_path", ""),
                    "voice_description": meta.get("voice_description", ""),
                    "language": meta.get("language", ""),
                    "notes": meta.get("notes", ""),
                }
            )
        return presets

    def resolve_model_dir(self, requested: Optional[str]) -> Path:
        if requested:
            candidate = Path(requested).expanduser()
            if candidate.is_absolute() and has_usable_model_files(candidate):
                return candidate.resolve()
            local = self.model_dir / requested
            if has_usable_model_files(local):
                return local.resolve()
            raise VoxCPMError(f"VoxCPM model not found: {requested}")
        for name in DEFAULT_MODEL_VARIANTS:
            local = self.model_dir / name
            if has_usable_model_files(local):
                return local.resolve()
        raise VoxCPMError(
            f"No VoxCPM model checkpoint found under {self.model_dir}. "
            "Download VoxCPM2 from HuggingFace (openbmb/VoxCPM2) first."
        )

    def run(
        self,
        *,
        task: str,
        output_path: Path,
        payload: Dict[str, Any],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        if task not in SUPPORTED_TASKS:
            raise VoxCPMError(f"Unsupported VoxCPM task: {task}")
        if not self.is_available():
            raise VoxCPMError(self.availability_notes())

        model_dir = self.resolve_model_dir(payload.get("model_dir") or payload.get("model_name"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        request_path = output_path.with_suffix(output_path.suffix + ".voxcpm-request.json")
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
            "--voxcpm-root",
            str(self.voxcpm_root),
            "--model-dir",
            str(model_dir),
        ]
        env = os.environ.copy()
        env.setdefault("PYTHONPATH", str(self.voxcpm_root / "src"))
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        cache_root = self.repo_root / "data" / "cache" / "voxcpm2"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("TRANSFORMERS_CACHE", str(cache_root / "huggingface" / "transformers"))
        env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
        for var in ("HF_HOME", "TRANSFORMERS_CACHE", "MODELSCOPE_CACHE"):
            Path(env[var]).mkdir(parents=True, exist_ok=True)

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.voxcpm_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise VoxCPMError(f"VoxCPM generation timed out after {timeout}s") from exc

        meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0:
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise VoxCPMError(
                "VoxCPM generation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )

        if not output_path.exists():
            raise VoxCPMError(f"VoxCPM did not create output file: {output_path}")

        meta: Dict[str, Any] = {
            "engine": "voxcpm2",
            "task": task,
            "voxcpm_root": str(self.voxcpm_root),
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
        task: str,
        prompt_text: str = "",
        prompt_wav_path: str = "",
        reference_wav_path: str = "",
        voice_description: str = "",
        language: str = "",
        notes: str = "",
    ) -> Dict[str, Any]:
        if not name.strip():
            raise VoxCPMError("Voice preset name cannot be empty")
        if task not in SUPPORTED_TASKS:
            raise VoxCPMError(f"Unsupported task for preset: {task}")
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "name": name,
            "task": task,
            "prompt_text": prompt_text,
            "prompt_wav_path": prompt_wav_path,
            "reference_wav_path": reference_wav_path,
            "voice_description": voice_description,
            "language": language,
            "notes": notes,
        }
        target = self.voice_dir / f"{name}.json"
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"path": str(target), **record}

    def delete_voice_preset(self, name: str) -> bool:
        target = self.voice_dir / f"{name}.json"
        if not target.exists():
            return False
        target.unlink()
        return True

    def resolve_finetune_run_dir(self, run_id: str) -> Path:
        return (self.repo_root / "data" / "finetune-runs" / "voxcpm2" / run_id).resolve()

    def train(
        self,
        *,
        run_id: str,
        manifest_path: Path,
        cv_manifest_path: Optional[Path],
        base_model: str,
        lora_config: Optional[Dict[str, Any]],
        batch_size: int,
        grad_accum_steps: int,
        num_workers: int,
        num_iters: int,
        max_steps: int,
        learning_rate: float,
        warmup_steps: int,
        log_interval: int,
        valid_interval: int,
        save_interval: int,
        weight_decay: float,
        max_grad_norm: float,
        sample_rate: int,
        extra_args: List[str],
        audio_root: Optional[Path] = None,
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        if not self.is_available():
            raise VoxCPMError(self.availability_notes())
        if not self.train_runner_path.exists():
            raise VoxCPMError(f"VoxCPM training runner not found: {self.train_runner_path}")

        pretrained_dir = self.resolve_model_dir(base_model)
        run_dir = self.resolve_finetune_run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        manifest_path = manifest_path.expanduser().resolve()
        if not manifest_path.exists():
            raise VoxCPMError(f"Training manifest not found: {manifest_path}")
        if cv_manifest_path is not None:
            cv_manifest_path = cv_manifest_path.expanduser().resolve()
            if not cv_manifest_path.exists():
                raise VoxCPMError(f"Validation manifest not found: {cv_manifest_path}")

        request_payload: Dict[str, Any] = {
            "run_id": run_id,
            "manifest_path": str(manifest_path),
            "cv_manifest_path": str(cv_manifest_path) if cv_manifest_path else None,
            "audio_root": str(audio_root.expanduser().resolve()) if audio_root else str(manifest_path.parent),
            "lora": lora_config or {"enable_lm": True, "enable_dit": True, "enable_proj": False},
            "batch_size": batch_size,
            "grad_accum_steps": grad_accum_steps,
            "num_workers": num_workers,
            "num_iters": num_iters,
            "max_steps": max_steps,
            "learning_rate": learning_rate,
            "warmup_steps": warmup_steps,
            "log_interval": log_interval,
            "valid_interval": valid_interval,
            "save_interval": save_interval,
            "weight_decay": weight_decay,
            "max_grad_norm": max_grad_norm,
            "sample_rate": sample_rate,
            "extra_args": list(extra_args),
        }
        request_path = run_dir / "request.json"
        request_path.write_text(
            json.dumps(request_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        command = [
            self.python_executable,
            str(self.train_runner_path),
            "--request-json",
            str(request_path),
            "--voxcpm-root",
            str(self.voxcpm_root),
            "--pretrained-dir",
            str(pretrained_dir),
            "--run-dir",
            str(run_dir),
        ]
        env = os.environ.copy()
        env.setdefault("PYTHONPATH", str(self.voxcpm_root / "src"))
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        cache_root = self.repo_root / "data" / "cache" / "voxcpm2"
        env.setdefault("HF_HOME", str(cache_root / "huggingface"))
        env.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
        for var in ("HF_HOME", "MODELSCOPE_CACHE"):
            Path(env[var]).mkdir(parents=True, exist_ok=True)

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.voxcpm_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise VoxCPMError(f"VoxCPM training timed out after {timeout}s") from exc

        meta_path = run_dir / "meta.json"
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0 and meta_payload.get("status") != "completed":
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise VoxCPMError(
                "VoxCPM training failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )

        meta_payload.setdefault("status", "completed")
        meta_payload.setdefault("run_dir", str(run_dir))
        meta_payload["stdout_tail"] = completed.stdout[-4000:]
        meta_payload["stderr_tail"] = completed.stderr[-4000:]
        return run_dir, meta_payload
