"""Applio/RVC-backed audio-to-audio voice conversion helpers."""

from __future__ import annotations

import os
import re
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
            Path(sys.executable),
            repo_root / ".venv" / "bin" / "python",
            repo_root / "vendor" / "Applio" / ".venv" / "bin" / "python",
            repo_root.parent / "s2-pro-demo" / ".venv" / "bin" / "python",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            # Keep virtualenv symlinks intact. Resolving `.venv/bin/python`
            # jumps to the base interpreter and loses installed packages.
            return str(candidate)
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

    def subprocess_env(self) -> Dict[str, str]:
        """Build a writable environment for Applio subprocesses."""

        env = os.environ.copy()
        env.setdefault("MPLCONFIGDIR", str(self.project_root / "data" / "cache" / "matplotlib"))
        return env

    def is_available(self) -> bool:
        """Return whether an Applio checkout is available locally."""

        return (self.applio_root / "core.py").exists()

    def train_rvc_model(
        self,
        *,
        model_name: str,
        dataset_path: str,
        sample_rate: int,
        total_epoch: int,
        batch_size: int,
        cpu_cores: int,
        gpu: str,
        f0_method: str,
        embedder_model: str,
        cut_preprocess: str,
        noise_reduction: bool,
        clean_strength: float,
        chunk_len: float,
        overlap_len: float,
        index_algorithm: str,
        checkpointing: bool,
    ) -> Dict[str, Any]:
        """Create an Applio/RVC voice model from a folder of target-voice audio.

        The training flow mirrors Applio's own CLI: preprocess audio, extract pitch
        and content features, then train and generate a retrieval index. This keeps
        the demo backend thin while still exposing a complete RVC workflow.
        """

        if not self.is_available():
            raise VoiceChangerError(f"Applio repository not found at {self.applio_root}")

        safe_model_name = re.sub(r"[^A-Za-z0-9_.-]+", "-", model_name.strip()).strip("-_.")
        if not safe_model_name:
            raise VoiceChangerError("RVC model name is required.")

        source_dataset = Path(dataset_path).expanduser()
        if not source_dataset.is_absolute():
            source_dataset = (self.project_root / source_dataset).resolve()
        if not source_dataset.exists() or not source_dataset.is_dir():
            raise VoiceChangerError(f"RVC training folder not found: {source_dataset}")

        if not any(source_dataset.rglob("*.wav")):
            raise VoiceChangerError("RVC training folder must contain at least one .wav file.")

        commands = [
            [
                self.python_executable,
                str((self.applio_root / "core.py").resolve()),
                "preprocess",
                "--model_name",
                safe_model_name,
                "--dataset_path",
                str(source_dataset),
                "--sample_rate",
                str(sample_rate),
                "--cpu_cores",
                str(cpu_cores),
                "--cut_preprocess",
                cut_preprocess,
                "--process_effects",
                "False",
                "--noise_reduction",
                "True" if noise_reduction else "False",
                "--noise_reduction_strength",
                str(clean_strength),
                "--chunk_len",
                str(chunk_len),
                "--overlap_len",
                str(overlap_len),
                "--normalization_mode",
                "pre",
            ],
            [
                self.python_executable,
                str((self.applio_root / "core.py").resolve()),
                "extract",
                "--model_name",
                safe_model_name,
                "--f0_method",
                f0_method,
                "--cpu_cores",
                str(cpu_cores),
                "--gpu",
                gpu,
                "--sample_rate",
                str(sample_rate),
                "--embedder_model",
                embedder_model,
                "--include_mutes",
                "2",
            ],
            [
                self.python_executable,
                str((self.applio_root / "core.py").resolve()),
                "train",
                "--model_name",
                safe_model_name,
                "--save_every_epoch",
                str(max(1, total_epoch)),
                "--save_only_latest",
                "True",
                "--save_every_weights",
                "True",
                "--total_epoch",
                str(total_epoch),
                "--sample_rate",
                str(sample_rate),
                "--batch_size",
                str(batch_size),
                "--gpu",
                gpu,
                "--pretrained",
                "True",
                "--overtraining_detector",
                "True",
                "--overtraining_threshold",
                "50",
                "--cleanup",
                "False",
                "--cache_data_in_gpu",
                "False",
                "--index_algorithm",
                index_algorithm,
                "--vocoder",
                "HiFi-GAN",
                "--checkpointing",
                "True" if checkpointing else "False",
            ],
        ]

        completed_steps: List[Dict[str, Any]] = []
        for command in commands:
            completed = subprocess.run(
                command,
                cwd=str(self.applio_root),
                text=True,
                env=self.subprocess_env(),
                check=False,
            )
            completed_steps.append({"step": command[3], "returncode": completed.returncode})
            if completed.returncode != 0:
                raise VoiceChangerError(f"Applio RVC {command[3]} step failed for model {safe_model_name}.")

        model_dir = self.applio_root / "logs" / safe_model_name
        model_candidates = sorted(model_dir.rglob("*.pth")) + sorted((self.applio_root / "assets" / "weights").rglob(f"{safe_model_name}*.pth"))
        index_candidates = sorted(model_dir.rglob("*.index"))

        return {
            "engine": "applio_rvc",
            "strategy": "train_target_voice_model_then_convert",
            "model_name": safe_model_name,
            "dataset_path": str(source_dataset),
            "model_dir": str(model_dir),
            "model_path": str(model_candidates[-1].resolve()) if model_candidates else None,
            "index_path": str(index_candidates[-1].resolve()) if index_candidates else None,
            "steps": completed_steps,
        }

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
            env=self.subprocess_env(),
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

    def blend_models(
        self,
        *,
        model_name: str,
        model_path_a: str,
        model_path_b: str,
        ratio: float,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Blend two Applio/RVC model weights into a new voice model.

        Args:
            model_name: Name for the blended model.
            model_path_a: First `.pth` model path.
            model_path_b: Second `.pth` model path.
            ratio: Weight applied to the first model, from 0.0 to 1.0.

        Returns:
            Path to the blended `.pth` and execution metadata.
        """

        if not self.is_available():
            raise VoiceChangerError(f"Applio repository not found at {self.applio_root}")

        safe_model_name = re.sub(r"[^A-Za-z0-9_.-]+", "-", model_name.strip()).strip("-_.")
        if not safe_model_name:
            raise VoiceChangerError("Blended model name is required.")

        actual_model_a = resolve_voice_model_path(self.project_root, model_path_a, "APPLIO_BLEND_MODEL_A")
        actual_model_b = resolve_voice_model_path(self.project_root, model_path_b, "APPLIO_BLEND_MODEL_B")
        rounded_ratio = round(max(0.0, min(1.0, float(ratio))), 1)

        command = [
            self.python_executable,
            str((self.applio_root / "core.py").resolve()),
            "model_blender",
            "--model_name",
            safe_model_name,
            "--pth_path_1",
            str(actual_model_a),
            "--pth_path_2",
            str(actual_model_b),
            "--ratio",
            str(rounded_ratio),
        ]
        completed = subprocess.run(
            command,
            cwd=str(self.applio_root),
            capture_output=True,
            text=True,
            env=self.subprocess_env(),
            check=False,
        )
        if completed.returncode != 0:
            raise VoiceChangerError(
                "Applio model blending failed with exit code "
                f"{completed.returncode}.\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )

        blended_path = self.applio_root / "logs" / f"{safe_model_name}.pth"
        if not blended_path.exists():
            raise VoiceChangerError(f"Applio did not create blended model: {blended_path}")

        return blended_path, {
            "engine": "applio_rvc",
            "strategy": "model_blending",
            "model_name": safe_model_name,
            "model_path_a": str(actual_model_a),
            "model_path_b": str(actual_model_b),
            "ratio": rounded_ratio,
            "python_executable": self.python_executable,
            "applio_root": str(self.applio_root),
            "stdout": completed.stdout,
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
