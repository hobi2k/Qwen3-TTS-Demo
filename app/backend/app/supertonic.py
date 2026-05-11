"""Supertonic 3 ONNX in-process inference helpers.

Supertonic 3 ships as a ~260 MB ONNX bundle (4 graphs + tokenizer + voice
styles) and runs comfortably inside the main backend venv via
``onnxruntime``. We therefore skip the subprocess pattern used for
CosyVoice/VoxCPM and load the model lazily in the FastAPI worker.

Required local assets (downloaded from ``Supertone/supertonic-3`` on HF):

* ``data/models/supertonic3/onnx/``
    - ``duration_predictor.onnx``
    - ``text_encoder.onnx``
    - ``vector_estimator.onnx``
    - ``vocoder.onnx``
    - ``unicode_indexer.json``
    - ``tts.json``
* ``data/models/supertonic3/voice_styles/<NAME>.json`` (M1, M4, F1, …)

Inference contract: ``Engine.run(text, language, voice_style_name, ...)``.
**Fine-tuning is intentionally not exposed here** — upstream only publishes
ONNX inference. The Phase 4 reverse-engineering attempt lives outside this
module.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class SupertonicError(RuntimeError):
    """Raised when Supertonic 3 inference cannot complete."""


# Languages Supertonic 3 advertises explicit support for (helper.py:13).
SUPPORTED_LANGUAGES = [
    "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et",
    "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl",
    "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi",
]

# The only expression tags the model is trained on (per upstream README).
SUPPORTED_EXPRESSION_TAGS = ["<laugh>", "<breath>", "<sigh>"]

# Voice style files Supertonic ships with (M = male, F = female, numbered).
DEFAULT_VOICE_STYLES = ["M1", "M2", "M3", "M4", "F1", "F2", "F3", "F4"]


def resolve_supertonic_root(repo_root: Path) -> Path:
    configured = os.getenv("SUPERTONIC_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "Supertonic").resolve()


def resolve_supertonic_model_dir(repo_root: Path) -> Path:
    configured = os.getenv("SUPERTONIC_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "supertonic3").resolve()


def resolve_supertonic_voice_dir(repo_root: Path) -> Path:
    configured = os.getenv("SUPERTONIC_VOICE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "supertonic3-voices").resolve()


class Supertonic3Engine:
    """In-process Supertonic 3 ONNX inference wrapper.

    Mirrors the surface of the other vendor engines (``is_available``,
    ``availability_notes``, ``list_voice_presets``, ``run``,
    ``save_voice_preset``, ``delete_voice_preset``) so the FastAPI layer
    can stay consistent. Heavy ``helper`` imports are deferred to the
    first ``run`` call.
    """

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.supertonic_root = resolve_supertonic_root(repo_root)
        self.model_dir = resolve_supertonic_model_dir(repo_root)
        self.voice_dir = resolve_supertonic_voice_dir(repo_root)
        self.helper_module_path = self.supertonic_root / "py" / "helper.py"
        self.onnx_dir = self.model_dir / "onnx"
        self.builtin_voice_style_dir = self.model_dir / "voice_styles"

        self._helper = None
        self._tts = None  # cached TextToSpeech instance
        self._tts_use_gpu = False
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    # Availability / introspection
    # ------------------------------------------------------------------ #
    def is_available(self) -> bool:
        return self.supertonic_root.exists() and self.helper_module_path.exists()

    def availability_notes(self) -> str:
        if not self.supertonic_root.exists():
            return f"Supertonic repository not found: {self.supertonic_root}"
        if not self.helper_module_path.exists():
            return f"Supertonic helper not found: {self.helper_module_path}"
        if not self.onnx_dir.exists():
            return (
                f"Supertonic ONNX assets missing: {self.onnx_dir}. "
                "Download Supertone/supertonic-3 from HuggingFace into this folder."
            )
        return f"Supertonic ONNX dir: {self.onnx_dir}"

    def required_onnx_files(self) -> List[str]:
        return [
            "duration_predictor.onnx",
            "text_encoder.onnx",
            "vector_estimator.onnx",
            "vocoder.onnx",
            "unicode_indexer.json",
            "tts.json",
        ]

    def list_onnx_status(self) -> List[Dict[str, Any]]:
        return [
            {"name": name, "available": (self.onnx_dir / name).exists()}
            for name in self.required_onnx_files()
        ]

    def list_builtin_voice_styles(self) -> List[Dict[str, Any]]:
        """Voice styles shipped with the Supertonic checkpoint."""

        if not self.builtin_voice_style_dir.exists():
            return [{"name": name, "available": False} for name in DEFAULT_VOICE_STYLES]
        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for name in DEFAULT_VOICE_STYLES:
            available = (self.builtin_voice_style_dir / f"{name}.json").exists()
            results.append({"name": name, "available": available})
            seen.add(name)
        for path in sorted(self.builtin_voice_style_dir.glob("*.json")):
            if path.stem not in seen:
                results.append({"name": path.stem, "available": True})
                seen.add(path.stem)
        return results

    def list_voice_presets(self) -> List[Dict[str, Any]]:
        """User-saved Supertonic voice presets (label-only; the underlying
        style file path is also persisted for reuse)."""

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
                    "voice_style": meta.get("voice_style", ""),
                    "voice_style_path": meta.get("voice_style_path", ""),
                    "language": meta.get("language", ""),
                    "notes": meta.get("notes", ""),
                }
            )
        return presets

    # ------------------------------------------------------------------ #
    # Helper module loading
    # ------------------------------------------------------------------ #
    def _ensure_helper(self):
        if self._helper is not None:
            return self._helper
        py_dir = self.supertonic_root / "py"
        if not py_dir.exists() or not self.helper_module_path.exists():
            raise SupertonicError(self.availability_notes())
        sys.path.insert(0, str(py_dir))
        try:
            import helper as helper_module  # type: ignore
        except Exception as exc:
            raise SupertonicError(f"Failed to import Supertonic helper: {exc}") from exc
        self._helper = helper_module
        return helper_module

    def _get_tts(self, use_gpu: bool = False):
        with self._lock:
            if self._tts is not None and self._tts_use_gpu == use_gpu:
                return self._tts
            helper = self._ensure_helper()
            if not self.onnx_dir.exists():
                raise SupertonicError(
                    f"Supertonic ONNX directory missing: {self.onnx_dir}"
                )
            self._tts = helper.load_text_to_speech(str(self.onnx_dir), use_gpu=use_gpu)
            self._tts_use_gpu = use_gpu
            return self._tts

    def _resolve_voice_style_path(self, voice_style: str) -> Path:
        """Resolve a voice style identifier to a JSON file on disk.

        Accepts:
          * a built-in style name (``M1``/``F2`` → ``data/models/.../voice_styles/M1.json``)
          * a saved preset name (``my_voice`` → ``data/supertonic3-voices/my_voice.json``)
              In that case the preset JSON's ``voice_style_path`` is dereferenced.
          * an absolute filesystem path to a style JSON.
        """

        candidate = Path(voice_style).expanduser()
        if candidate.is_absolute() and candidate.exists():
            return candidate.resolve()

        builtin = self.builtin_voice_style_dir / f"{voice_style}.json"
        if builtin.exists():
            return builtin.resolve()

        preset = self.voice_dir / f"{voice_style}.json"
        if preset.exists():
            try:
                meta = json.loads(preset.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
            path = meta.get("voice_style_path") or ""
            if path:
                p = Path(path).expanduser()
                if p.exists():
                    return p.resolve()
                inner = self.builtin_voice_style_dir / p.name
                if inner.exists():
                    return inner.resolve()
            inferred_style = meta.get("voice_style") or ""
            if inferred_style and inferred_style != voice_style:
                return self._resolve_voice_style_path(inferred_style)

        raise SupertonicError(
            f"Voice style not found: {voice_style!r}. "
            f"Tried built-in {self.builtin_voice_style_dir}/{voice_style}.json "
            f"and preset {preset}."
        )

    # ------------------------------------------------------------------ #
    # Inference
    # ------------------------------------------------------------------ #
    def run(
        self,
        *,
        text: str,
        language: str,
        voice_style: str,
        output_path: Path,
        total_step: int = 8,
        speed: float = 1.05,
        silence_duration: float = 0.3,
        use_gpu: bool = False,
    ) -> Tuple[Path, Dict[str, Any]]:
        if not self.is_available():
            raise SupertonicError(self.availability_notes())
        if not text.strip():
            raise SupertonicError("text is required")
        if language not in SUPPORTED_LANGUAGES:
            raise SupertonicError(
                f"Unsupported language: {language}. "
                f"Supertonic 3 supports: {', '.join(SUPPORTED_LANGUAGES)}"
            )

        style_path = self._resolve_voice_style_path(voice_style)
        helper = self._ensure_helper()
        try:
            style = helper.load_voice_style([str(style_path)], verbose=False)
        except Exception as exc:
            raise SupertonicError(f"Failed to load voice style {style_path}: {exc}") from exc

        try:
            tts = self._get_tts(use_gpu=use_gpu)
            wav, duration = tts(
                text,
                language,
                style,
                int(total_step),
                float(speed),
                silence_duration=float(silence_duration),
            )
        except Exception as exc:
            raise SupertonicError(f"Supertonic synthesis failed: {exc}") from exc

        import numpy as np
        import soundfile as sf  # type: ignore

        sample_rate = int(getattr(tts, "sample_rate", 24000))
        wav_array = np.asarray(wav)
        if wav_array.ndim == 2 and wav_array.shape[0] == 1:
            wav_array = wav_array[0]
        duration_sec = float(duration[0].item()) if hasattr(duration, "__iter__") else float(duration)
        trimmed = wav_array[: int(sample_rate * duration_sec)] if duration_sec > 0 else wav_array

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), trimmed.astype(np.float32), sample_rate, subtype="PCM_16")

        return output_path, {
            "engine": "supertonic3",
            "sample_rate": sample_rate,
            "duration_seconds": duration_sec,
            "voice_style_path": str(style_path),
            "voice_style_name": voice_style,
            "language": language,
            "total_step": int(total_step),
            "speed": float(speed),
            "silence_duration": float(silence_duration),
            "supertonic_root": str(self.supertonic_root),
            "model_dir": str(self.model_dir),
        }

    # ------------------------------------------------------------------ #
    # Voice preset CRUD
    # ------------------------------------------------------------------ #
    def save_voice_preset(
        self,
        *,
        name: str,
        voice_style: str,
        language: str = "",
        notes: str = "",
    ) -> Dict[str, Any]:
        if not name.strip():
            raise SupertonicError("Voice preset name cannot be empty")
        # Validate that the style resolves so users get an early error.
        style_path = self._resolve_voice_style_path(voice_style)
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "name": name,
            "voice_style": voice_style,
            "voice_style_path": str(style_path),
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
