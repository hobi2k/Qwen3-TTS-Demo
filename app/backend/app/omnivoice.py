"""OmniVoice inference, batch, and training helpers.

The backend launches OmniVoice in a dedicated Python process so the heavy
runtime never imports into the FastAPI worker. This mirrors the other
vendor-engine wrappers in this project.
"""

from __future__ import annotations

import json
import os
import runpy
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class OmniVoiceError(RuntimeError):
    """Raised when OmniVoice execution cannot complete."""


SUPPORTED_TASKS = {"auto_voice", "voice_design", "voice_cloning"}
DEFAULT_MODEL_VARIANTS = ["OmniVoice"]
VOICE_DESIGN_TEMPLATE_CATEGORIES: List[Dict[str, Any]] = [
    {
        "label": "Gender",
        "options": ["Male", "Female"],
    },
    {
        "label": "Age",
        "options": ["Child", "Teenager", "Young Adult", "Middle-aged", "Elderly"],
    },
    {
        "label": "Pitch",
        "options": [
            "Very Low Pitch",
            "Low Pitch",
            "Moderate Pitch",
            "High Pitch",
            "Very High Pitch",
        ],
    },
    {
        "label": "Style",
        "options": ["Whisper"],
    },
    {
        "label": "English Accent",
        "options": [
            "American Accent",
            "Australian Accent",
            "British Accent",
            "Chinese Accent",
            "Canadian Accent",
            "Indian Accent",
            "Korean Accent",
            "Portuguese Accent",
            "Russian Accent",
            "Japanese Accent",
        ],
    },
    {
        "label": "Chinese Dialect",
        "options": [
            "Henan Dialect",
            "Shaanxi Dialect",
            "Sichuan Dialect",
            "Guizhou Dialect",
            "Yunnan Dialect",
            "Guilin Dialect",
            "Jinan Dialect",
            "Shijiazhuang Dialect",
            "Gansu Dialect",
            "Ningxia Dialect",
            "Qingdao Dialect",
            "Northeast Dialect",
        ],
    },
]


def resolve_omnivoice_root(repo_root: Path) -> Path:
    configured = os.getenv("OMNIVOICE_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "OmniVoice").resolve()


def resolve_omnivoice_python(repo_root: Path) -> str:
    configured = os.getenv("OMNIVOICE_PYTHON", "").strip() or os.getenv(
        "OMNIVOICE_PYTHON_EXECUTABLE", ""
    ).strip()
    if configured:
        return configured

    candidates = [
        repo_root / ".venv-omnivoice" / "bin" / "python",
        repo_root / ".venv-omnivoice" / "Scripts" / "python.exe",
        repo_root / "vendor" / "OmniVoice" / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def resolve_omnivoice_model_dir(repo_root: Path) -> Path:
    configured = os.getenv("OMNIVOICE_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "omnivoice").resolve()


def resolve_omnivoice_voice_dir(repo_root: Path) -> Path:
    configured = os.getenv("OMNIVOICE_VOICE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "omnivoice-voices").resolve()


def resolve_omnivoice_supported_languages(omnivoice_root: Path) -> List[str]:
    lang_map_path = omnivoice_root / "omnivoice" / "utils" / "lang_map.py"
    if not lang_map_path.exists():
        return ["en", "zh", "ko", "ja"]
    try:
        payload = runpy.run_path(str(lang_map_path))
        lang_ids = payload.get("LANG_IDS") or set()
        return sorted(str(value) for value in lang_ids if value)
    except Exception:
        return ["en", "zh", "ko", "ja"]


def resolve_omnivoice_supported_language_options(
    omnivoice_root: Path,
) -> List[Dict[str, str]]:
    lang_map_path = omnivoice_root / "omnivoice" / "utils" / "lang_map.py"
    if not lang_map_path.exists():
        return [
            {"id": "en", "name": "English", "display": "English (en)"},
            {"id": "zh", "name": "Chinese", "display": "Chinese (zh)"},
            {"id": "ko", "name": "Korean", "display": "Korean (ko)"},
            {"id": "ja", "name": "Japanese", "display": "Japanese (ja)"},
        ]
    try:
        payload = runpy.run_path(str(lang_map_path))
        name_to_id = payload.get("LANG_NAME_TO_ID") or {}
        options = [
            {
                "id": str(language_id),
                "name": str(name).title(),
                "display": f"{str(name).title()} ({language_id})",
            }
            for name, language_id in sorted(name_to_id.items(), key=lambda item: str(item[0]))
            if name and language_id
        ]
        seen: set[str] = set()
        deduped: List[Dict[str, str]] = []
        for item in options:
            key = f"{item['id']}::{item['name']}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped
    except Exception:
        return [
            {"id": "en", "name": "English", "display": "English (en)"},
            {"id": "zh", "name": "Chinese", "display": "Chinese (zh)"},
            {"id": "ko", "name": "Korean", "display": "Korean (ko)"},
            {"id": "ja", "name": "Japanese", "display": "Japanese (ja)"},
        ]


class OmniVoiceEngine:
    """Subprocess wrapper around OmniVoice."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.omnivoice_root = resolve_omnivoice_root(repo_root)
        self.python_executable = resolve_omnivoice_python(repo_root)
        self.model_dir = resolve_omnivoice_model_dir(repo_root)
        self.voice_dir = resolve_omnivoice_voice_dir(repo_root)
        self.runner_path = repo_root / "scripts" / "run_omnivoice_generate.py"
        self.batch_runner_path = repo_root / "scripts" / "run_omnivoice_batch.py"
        self.train_runner_path = repo_root / "scripts" / "run_omnivoice_train.py"
        self.prepare_runner_path = repo_root / "scripts" / "run_omnivoice_prepare.py"

    def is_available(self) -> bool:
        return self.omnivoice_root.exists() and self.runner_path.exists()

    def availability_notes(self) -> str:
        if not self.omnivoice_root.exists():
            return f"OmniVoice repository not found: {self.omnivoice_root}"
        if not self.runner_path.exists():
            return f"OmniVoice runner not found: {self.runner_path}"
        if Path(self.python_executable) == Path(sys.executable):
            return (
                f"OmniVoice root: {self.omnivoice_root} (using shared Python; create a"
                " dedicated .venv-omnivoice or set OMNIVOICE_PYTHON_EXECUTABLE for"
                " best isolation)"
            )
        return (
            f"OmniVoice root: {self.omnivoice_root} "
            f"(python: {self.python_executable})"
        )

    def supported_languages(self) -> List[str]:
        return resolve_omnivoice_supported_languages(self.omnivoice_root)

    def supported_language_options(self) -> List[Dict[str, str]]:
        return resolve_omnivoice_supported_language_options(self.omnivoice_root)

    def voice_design_templates(self) -> List[Dict[str, Any]]:
        return VOICE_DESIGN_TEMPLATE_CATEGORIES

    def list_model_variants(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        if not self.model_dir.exists():
            return [{"name": name, "available": False} for name in DEFAULT_MODEL_VARIANTS]
        for name in DEFAULT_MODEL_VARIANTS:
            available = (self.model_dir / name).exists()
            results.append({"name": name, "available": available})
            seen.add(name)
        for child in sorted(self.model_dir.iterdir()):
            if child.is_dir() and child.name not in seen:
                results.append({"name": child.name, "available": True})
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
                    "task": meta.get("task", "auto_voice"),
                    "language": meta.get("language", ""),
                    "instruct": meta.get("instruct", ""),
                    "ref_audio": meta.get("ref_audio", ""),
                    "ref_text": meta.get("ref_text", ""),
                    "model_name": meta.get("model_name", ""),
                    "notes": meta.get("notes", ""),
                    "defaults": meta.get("defaults", {}) or {},
                }
            )
        return presets

    def resolve_model_dir(self, requested: Optional[str]) -> Path:
        if requested:
            candidate = Path(requested).expanduser()
            if candidate.is_absolute() and candidate.exists():
                return candidate.resolve()
            local = self.model_dir / requested
            if local.exists():
                return local.resolve()
            raise OmniVoiceError(f"OmniVoice model not found: {requested}")
        for name in DEFAULT_MODEL_VARIANTS:
            local = self.model_dir / name
            if local.exists():
                return local.resolve()
        raise OmniVoiceError(
            f"No OmniVoice model checkpoint found under {self.model_dir}. "
            "Download k2-fsa/OmniVoice first."
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
            raise OmniVoiceError(f"Unsupported OmniVoice task: {task}")
        if not self.is_available():
            raise OmniVoiceError(self.availability_notes())

        model_dir = self.resolve_model_dir(payload.get("model_dir") or payload.get("model_name"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        request_path = output_path.with_suffix(output_path.suffix + ".omnivoice-request.json")
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
            "--omnivoice-root",
            str(self.omnivoice_root),
            "--model-dir",
            str(model_dir),
        ]
        env = os.environ.copy()
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        env.setdefault("HF_HOME", str(self.repo_root / "data" / "cache" / "omnivoice" / "huggingface"))

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmniVoiceError(f"OmniVoice generation timed out after {timeout}s") from exc

        meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}

        if completed.returncode != 0:
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise OmniVoiceError(
                "OmniVoice generation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )
        if not output_path.exists():
            raise OmniVoiceError(f"OmniVoice did not create output file: {output_path}")

        meta: Dict[str, Any] = {
            "engine": "omnivoice",
            "task": task,
            "omnivoice_root": str(self.omnivoice_root),
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
        language: str = "",
        instruct: str = "",
        ref_audio: str = "",
        ref_text: str = "",
        model_name: str = "",
        notes: str = "",
        defaults: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not name.strip():
            raise OmniVoiceError("Voice preset name cannot be empty")
        if task not in SUPPORTED_TASKS:
            raise OmniVoiceError(f"Unsupported task for preset: {task}")
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "name": name,
            "task": task,
            "language": language,
            "instruct": instruct,
            "ref_audio": ref_audio,
            "ref_text": ref_text,
            "model_name": model_name,
            "notes": notes,
            "defaults": defaults or {},
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

    def resolve_batch_run_dir(self, run_id: str) -> Path:
        return (self.repo_root / "data" / "batch-runs" / "omnivoice" / run_id).resolve()

    def run_batch(
        self,
        *,
        run_id: str,
        model_name: str,
        samples_jsonl: str,
        defaults: Dict[str, Any],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        if not self.is_available():
            raise OmniVoiceError(self.availability_notes())
        if not self.batch_runner_path.exists():
            raise OmniVoiceError(f"OmniVoice batch runner not found: {self.batch_runner_path}")

        model_dir = self.resolve_model_dir(model_name)
        run_dir = self.resolve_batch_run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        request_path = run_dir / "request.json"
        request_payload = {
            "run_id": run_id,
            "model_dir": str(model_dir),
            "samples_jsonl": samples_jsonl,
            "defaults": defaults,
        }
        request_path.write_text(
            json.dumps(request_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        command = [
            self.python_executable,
            str(self.batch_runner_path),
            "--request-json",
            str(request_path),
            "--omnivoice-root",
            str(self.omnivoice_root),
            "--model-dir",
            str(model_dir),
            "--run-dir",
            str(run_dir),
        ]
        env = os.environ.copy()
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        env.setdefault("HF_HOME", str(self.repo_root / "data" / "cache" / "omnivoice" / "huggingface"))
        try:
            completed = subprocess.run(
                command,
                cwd=str(self.omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmniVoiceError(f"OmniVoice batch generation timed out after {timeout}s") from exc

        meta_path = run_dir / "meta.json"
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}
        if completed.returncode != 0 and meta_payload.get("status") != "completed":
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise OmniVoiceError(
                "OmniVoice batch generation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )
        meta_payload.setdefault("stdout_tail", completed.stdout[-4000:])
        meta_payload.setdefault("stderr_tail", completed.stderr[-4000:])
        return run_dir, meta_payload

    def resolve_finetune_run_dir(self, run_id: str) -> Path:
        return (self.repo_root / "data" / "finetune-runs" / "omnivoice" / run_id).resolve()

    def resolve_prepare_run_dir(self, run_id: str) -> Path:
        return (self.repo_root / "data" / "dataset-prep-runs" / "omnivoice" / run_id).resolve()

    def train(
        self,
        *,
        run_id: str,
        base_model: str,
        train_config_json: str,
        data_config_json: str,
        accelerate_args: List[str],
        extra_args: List[str],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        if not self.is_available():
            raise OmniVoiceError(self.availability_notes())
        if not self.train_runner_path.exists():
            raise OmniVoiceError(f"OmniVoice training runner not found: {self.train_runner_path}")

        model_dir = self.resolve_model_dir(base_model)
        run_dir = self.resolve_finetune_run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        request_path = run_dir / "request.json"
        request_payload = {
            "run_id": run_id,
            "base_model": str(model_dir),
            "train_config_json": train_config_json,
            "data_config_json": data_config_json,
            "accelerate_args": list(accelerate_args),
            "extra_args": list(extra_args),
        }
        request_path.write_text(
            json.dumps(request_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        command = [
            self.python_executable,
            str(self.train_runner_path),
            "--request-json",
            str(request_path),
            "--omnivoice-root",
            str(self.omnivoice_root),
            "--model-dir",
            str(model_dir),
            "--run-dir",
            str(run_dir),
        ]
        env = os.environ.copy()
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        env.setdefault("HF_HOME", str(self.repo_root / "data" / "cache" / "omnivoice" / "huggingface"))
        try:
            completed = subprocess.run(
                command,
                cwd=str(self.omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmniVoiceError(f"OmniVoice training timed out after {timeout}s") from exc

        meta_path = run_dir / "meta.json"
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}
        if completed.returncode != 0 and meta_payload.get("status") != "completed":
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise OmniVoiceError(
                "OmniVoice training failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )
        meta_payload.setdefault("stdout_tail", completed.stdout[-4000:])
        meta_payload.setdefault("stderr_tail", completed.stderr[-4000:])
        return run_dir, meta_payload

    def prepare_data(
        self,
        *,
        run_id: str,
        mode: str,
        payload: Dict[str, Any],
        timeout: Optional[float] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        if not self.is_available():
            raise OmniVoiceError(self.availability_notes())
        if not self.prepare_runner_path.exists():
            raise OmniVoiceError(f"OmniVoice prepare runner not found: {self.prepare_runner_path}")

        run_dir = self.resolve_prepare_run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        request_path = run_dir / "request.json"
        request_payload = {"run_id": run_id, "mode": mode, **payload}
        request_path.write_text(
            json.dumps(request_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        command = [
            self.python_executable,
            str(self.prepare_runner_path),
            "--request-json",
            str(request_path),
            "--omnivoice-root",
            str(self.omnivoice_root),
            "--run-dir",
            str(run_dir),
        ]
        env = os.environ.copy()
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        env.setdefault(
            "HF_HOME",
            str(self.repo_root / "data" / "cache" / "omnivoice" / "huggingface"),
        )
        try:
            completed = subprocess.run(
                command,
                cwd=str(self.omnivoice_root),
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmniVoiceError(f"OmniVoice data preparation timed out after {timeout}s") from exc

        meta_path = run_dir / "meta.json"
        meta_payload: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta_payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta_payload = {}
        if completed.returncode != 0 and meta_payload.get("status") != "completed":
            failure = meta_payload.get("error") if isinstance(meta_payload, dict) else None
            raise OmniVoiceError(
                "OmniVoice data preparation failed with exit code "
                f"{completed.returncode}.\nError: {failure}\n"
                f"STDOUT:\n{completed.stdout[-4000:]}\nSTDERR:\n{completed.stderr[-4000:]}"
            )
        meta_payload.setdefault("stdout_tail", completed.stdout[-4000:])
        meta_payload.setdefault("stderr_tail", completed.stderr[-4000:])
        return run_dir, meta_payload
