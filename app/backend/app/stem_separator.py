"""Model-backed audio stem separation helpers.

The demo previously used librosa HPSS, which is useful DSP but not a vocal
separator. This module wraps `python-audio-separator`, a maintained package that
downloads and runs UVR-style MDX/MDXC/Demucs stem separation models.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Tuple

import soundfile as sf

DEFAULT_VOCAL_MODEL = "vocals_mel_band_roformer.ckpt"
MIN_STEM_AUDIO_SECONDS = 10.0
RVC_VOCAL_PRESET = "vocal_rvc"


class StemSeparatorError(RuntimeError):
    """Raised when model-backed stem separation cannot complete."""


class StemSeparatorEngine:
    """Thin wrapper around `audio_separator.separator.Separator`."""

    def __init__(self, repo_root: Path | str):
        self.repo_root = Path(repo_root)
        self.model_dir = self.repo_root / "data" / "stem-separator-models"

    def is_available(self) -> bool:
        """Return whether the optional `audio-separator` package is installed."""

        return importlib.util.find_spec("audio_separator") is not None

    def availability_notes(self) -> str:
        """Human-readable setup note for the UI and API bootstrap."""

        if self.is_available():
            return f"Using audio-separator with default model {DEFAULT_VOCAL_MODEL}."
        return "audio-separator is not installed. Install audio-separator>=0.44.1 and ffmpeg."

    def separate(
        self,
        *,
        input_audio_path: Path,
        output_dir: Path,
        model_profile: str,
        output_format: str,
    ) -> Tuple[List[Path], Dict[str, Any]]:
        """Separate an audio file into model-predicted stems.

        Args:
            input_audio_path: Absolute path to the mixed audio.
            output_dir: Directory where separated stems should be written.
            model_profile: User-facing separation preset.
            output_format: Audio file format for generated stems.

        Returns:
            Absolute output paths and metadata describing the model used.
        """

        if not self.is_available():
            raise StemSeparatorError(
                "audio-separator is not installed. Run `uv pip install audio-separator>=0.44.1` and ensure ffmpeg is available."
            )

        try:
            from audio_separator.separator import Separator
        except Exception as exc:
            raise StemSeparatorError(f"Failed to import audio-separator: {exc}") from exc

        if not input_audio_path.exists():
            raise StemSeparatorError(f"Input audio not found: {input_audio_path}")

        try:
            audio_info = sf.info(str(input_audio_path))
            duration_seconds = audio_info.frames / float(audio_info.samplerate or 1)
        except Exception as exc:
            raise StemSeparatorError(f"Could not inspect input audio duration: {exc}") from exc

        if duration_seconds < MIN_STEM_AUDIO_SECONDS:
            raise StemSeparatorError(
                f"Stem separation needs at least {MIN_STEM_AUDIO_SECONDS:.0f} seconds of audio. Current file is {duration_seconds:.1f} seconds."
            )

        output_dir.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(parents=True, exist_ok=True)

        profile = (model_profile or "roformer_vocals").strip()
        separator_kwargs: Dict[str, Any] = {
            "output_dir": str(output_dir),
            "model_file_dir": str(self.model_dir),
            "output_format": output_format.upper(),
        }
        model_filename: str | None = DEFAULT_VOCAL_MODEL
        ensemble_preset: str | None = None

        if profile == "vocal_rvc":
            model_filename = None
            ensemble_preset = RVC_VOCAL_PRESET
            separator_kwargs["ensemble_preset"] = RVC_VOCAL_PRESET
        elif profile == "demucs_4stem":
            model_filename = "htdemucs_ft.yaml"
        elif profile == "roformer_vocals":
            model_filename = DEFAULT_VOCAL_MODEL
        else:
            model_filename = profile

        try:
            separator = Separator(**separator_kwargs)
            if ensemble_preset:
                separator.load_model()
            else:
                separator.load_model(model_filename=model_filename)
            output_files = separator.separate(str(input_audio_path))
        except Exception as exc:
            raise StemSeparatorError(f"Stem separation failed: {exc}") from exc

        paths: List[Path] = []
        for item in output_files:
            candidate = Path(item)
            if not candidate.is_absolute():
                candidate = output_dir / candidate
            if candidate.exists():
                paths.append(candidate.resolve())

        if not paths:
            raise StemSeparatorError("Stem separator completed but produced no output files.")

        return paths, {
            "engine": "audio_separator",
            "package": "audio-separator",
            "model_profile": profile,
            "model_filename": model_filename,
            "ensemble_preset": ensemble_preset,
            "model_dir": str(self.model_dir),
            "output_format": output_format,
        }
