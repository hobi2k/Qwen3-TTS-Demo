"""Applio/RVC-backed audio-to-audio voice conversion helpers."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class VoiceChangerError(RuntimeError):
    """Raised when the external Applio/RVC voice changer cannot complete."""


def resolve_applio_repo_root(repo_root: Path) -> Path:
    """Resolve the Applio repository path for audio-to-audio voice conversion.

    Args:
        repo_root: Current project root.

    Returns:
        Absolute path to an Applio repository checkout.
    """

    configured = (os.getenv("APPLIO_REPO_ROOT") or os.getenv("VOICE_CHANGER_APPLIO_REPO") or "").strip()
    candidates = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            repo_root / "vendor" / "Applio",
            repo_root.parent / "s2-pro-demo" / "vendor" / "Applio",
        ]
    )
    for candidate in candidates:
        resolved = candidate.resolve()
        if (resolved / "core.py").exists():
            return resolved
    return candidates[0].resolve() if candidates else (repo_root / "vendor" / "Applio").resolve()


def resolve_applio_python(repo_root: Path) -> str:
    """Resolve the Python executable that should run Applio.

    Args:
        repo_root: Current project root.

    Returns:
        Executable path for the Applio runtime.
    """

    configured = (os.getenv("APPLIO_PYTHON_EXECUTABLE") or os.getenv("VOICE_CHANGER_APPLIO_PYTHON") or "").strip()
    candidates = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            repo_root / "vendor" / "Applio" / ".venv" / "bin" / "python",
            repo_root.parent / "s2-pro-demo" / ".venv" / "bin" / "python",
            Path(sys.executable),
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve())
    return sys.executable


def resolve_voice_model_path(repo_root: Path, explicit_path: Optional[str], env_var: str) -> Path:
    """Resolve a required RVC model or index path.

    Args:
        repo_root: Current project root.
        explicit_path: Request-level override.
        env_var: Environment variable fallback name.

    Returns:
        Absolute path to the requested file.
    """

    configured = (explicit_path or os.getenv(env_var) or "").strip()
    if not configured:
        raise VoiceChangerError(f"{env_var} is required for voice conversion.")
    path = Path(configured).expanduser()
    if not path.is_absolute():
        path = (repo_root / path).resolve()
    if not path.exists():
        raise VoiceChangerError(f"Voice conversion file not found: {path}")
    return path


class ApplioVoiceChanger:
    """Thin wrapper around `python core.py infer` from an Applio checkout."""

    def __init__(self, repo_root: Path):
        """Store project paths and runtime lookup rules.

        Args:
            repo_root: Current project root.
        """

        self.project_root = repo_root
        self.applio_root = resolve_applio_repo_root(repo_root)
        self.python_executable = resolve_applio_python(repo_root)

    def is_available(self) -> bool:
        """Return whether an Applio checkout is available locally."""

        return (self.applio_root / "core.py").exists()

    def transform(
        self,
        *,
        input_audio_path: str,
        output_path: Path,
        model_path: Optional[str],
        index_path: Optional[str],
        pitch_shift_semitones: float,
        f0_method: str,
        index_rate: float,
        protect: float,
        split_audio: bool,
        f0_autotune: bool,
        clean_audio: bool,
        clean_strength: float,
        embedder_model: str,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Run audio-to-audio voice conversion through Applio.

        Args:
            input_audio_path: Source audio to convert.
            output_path: Final converted output path.
            model_path: RVC `.pth` model path.
            index_path: RVC `.index` path.
            pitch_shift_semitones: Pitch shift applied before conversion.
            f0_method: F0 extraction method.
            index_rate: Retrieval index mix ratio.
            protect: Consonant protection value.
            split_audio: Whether to let Applio split long audio internally.
            f0_autotune: Whether to enable Applio autotune.
            clean_audio: Whether to apply Applio post-cleaning.
            clean_strength: Cleaning strength value.
            embedder_model: Content embedder name.

        Returns:
            Converted file path and execution metadata.
        """

        if not self.is_available():
            raise VoiceChangerError(f"Applio repository not found at {self.applio_root}")

        source_path = Path(input_audio_path).expanduser()
        if not source_path.is_absolute():
            source_path = (self.project_root / source_path).resolve()
        if not source_path.exists():
            raise VoiceChangerError(f"Source audio not found: {source_path}")

        actual_model_path = resolve_voice_model_path(self.project_root, model_path, "APPLIO_MODEL_PATH")
        actual_index_path = resolve_voice_model_path(self.project_root, index_path, "APPLIO_INDEX_PATH")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        command = [
            self.python_executable,
            str((self.applio_root / "core.py").resolve()),
            "infer",
            "--input_path",
            str(source_path),
            "--output_path",
            str(output_path),
            "--pth_path",
            str(actual_model_path),
            "--index_path",
            str(actual_index_path),
            "--pitch",
            str(int(round(pitch_shift_semitones))),
            "--index_rate",
            str(float(index_rate)),
            "--protect",
            str(float(protect)),
            "--f0_method",
            f0_method,
            "--split_audio",
            "True" if split_audio else "False",
            "--f0_autotune",
            "True" if f0_autotune else "False",
            "--clean_audio",
            "True" if clean_audio else "False",
            "--clean_strength",
            str(float(clean_strength)),
            "--export_format",
            "WAV",
            "--embedder_model",
            embedder_model,
        ]
        completed = subprocess.run(
            command,
            cwd=str(self.applio_root),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise VoiceChangerError(
                "Applio voice conversion failed with exit code "
                f"{completed.returncode}.\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )
        if not output_path.exists():
            raise VoiceChangerError(f"Applio did not create output file: {output_path}")

        return output_path, {
            "engine": "applio_rvc",
            "strategy": "audio_to_audio_voice_conversion",
            "model_path": str(actual_model_path),
            "index_path": str(actual_index_path),
            "pitch_shift_semitones": pitch_shift_semitones,
            "f0_method": f0_method,
            "index_rate": index_rate,
            "protect": protect,
            "split_audio": split_audio,
            "f0_autotune": f0_autotune,
            "clean_audio": clean_audio,
            "clean_strength": clean_strength,
            "embedder_model": embedder_model,
            "python_executable": self.python_executable,
            "applio_root": str(self.applio_root),
        }


def applio_voice_changer_available(repo_root: Path) -> bool:
    """Return whether an Applio checkout can be used from this project.

    Args:
        repo_root: Current project root.

    Returns:
        `True` when a valid Applio checkout is reachable.
    """

    return ApplioVoiceChanger(repo_root).is_available()


def resolve_voice_model_roots(repo_root: Path, applio_root: Path) -> List[Path]:
    configured = (os.getenv("APPLIO_MODEL_DIR") or os.getenv("VOICE_CHANGER_MODEL_DIR") or "").strip()
    candidates = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            applio_root / "logs",
            applio_root / "assets" / "weights",
            repo_root / "data" / "rvc-models",
            repo_root / "vendor" / "Applio" / "logs",
        ]
    )
    resolved: List[Path] = []
    seen = set()
    for candidate in candidates:
        path = candidate.resolve()
        if path in seen:
            continue
        seen.add(path)
        if path.exists():
            resolved.append(path)
    return resolved


def _best_index_for_model(model_path: Path, index_paths: List[Path]) -> Optional[Path]:
    stem_matches = [item for item in index_paths if item.stem == model_path.stem]
    if stem_matches:
        return stem_matches[0]
    prefix_matches = [item for item in index_paths if item.stem.startswith(model_path.stem) or model_path.stem.startswith(item.stem)]
    if prefix_matches:
        return prefix_matches[0]
    siblings = [item for item in index_paths if item.parent == model_path.parent]
    if siblings:
        return siblings[0]
    return index_paths[0] if index_paths else None


def list_available_voice_models(repo_root: Path, applio_root: Path) -> List[Dict[str, Optional[str]]]:
    models: List[Dict[str, Optional[str]]] = []
    seen = set()
    for root in resolve_voice_model_roots(repo_root, applio_root):
        for model_path in sorted(root.rglob("*.pth")):
            key = str(model_path.resolve())
            if key in seen:
                continue
            seen.add(key)
            index_candidates = sorted(model_path.parent.rglob("*.index"))
            best_index = _best_index_for_model(model_path, index_candidates)
            label = model_path.stem.replace("_", " ").replace("-", " ").strip() or model_path.name
            models.append(
                {
                    "id": model_path.stem,
                    "label": label,
                    "model_path": str(model_path.resolve()),
                    "index_path": str(best_index.resolve()) if best_index else None,
                }
            )
    models.sort(key=lambda item: item["label"].lower())
    return models
