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

Upstream publishes ONNX inference assets, not a trainable PyTorch stack. The
``create_cloned_voice_style`` helper therefore implements the practical path
available from those assets: it creates a new style JSON by blending and lightly
adapting published style vectors from reference-audio features. This is not a
full model fine-tune, but it gives the UI a reusable cloned Supertonic voice
asset instead of a label-only preset.
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


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
SUPERTONIC_MODEL_ID = "Supertone/supertonic-3"
SUPERTONIC_MODEL_LICENSE = "OpenRAIL-M"


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
        self.custom_voice_style_dir = self.voice_dir / "voice_styles"
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
        return (
            self.supertonic_root.exists()
            and self.helper_module_path.exists()
            and self.onnx_dir.exists()
            and all((self.onnx_dir / name).exists() for name in self.required_onnx_files())
            and any(item.get("available") for item in self.list_builtin_voice_styles())
        )

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
        missing = [name for name in self.required_onnx_files() if not (self.onnx_dir / name).exists()]
        if missing:
            return (
                f"Supertonic ONNX assets missing under {self.onnx_dir}: {', '.join(missing)}. "
                "Run ./scripts/download_models.sh supertonic."
            )
        if not any(item.get("available") for item in self.list_builtin_voice_styles()):
            return (
                f"Supertonic voice styles missing: {self.builtin_voice_style_dir}. "
                "Run ./scripts/download_models.sh supertonic."
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

    def list_custom_voice_styles(self) -> List[Dict[str, Any]]:
        """Voice style JSON files created by the reverse-engineered cloner."""

        if not self.custom_voice_style_dir.exists():
            return []
        items: List[Dict[str, Any]] = []
        for path in sorted(self.custom_voice_style_dir.glob("*.json")):
            items.append({"name": path.stem, "available": True, "path": str(path)})
        return items

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
                    "kind": meta.get("kind", ""),
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

        custom = self.custom_voice_style_dir / f"{voice_style}.json"
        if custom.exists():
            return custom.resolve()

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

    def _available_source_style_paths(self) -> Dict[str, Path]:
        paths: Dict[str, Path] = {}
        for item in self.list_builtin_voice_styles():
            if item.get("available"):
                name = str(item["name"])
                try:
                    paths[name] = self._resolve_voice_style_path(name)
                except SupertonicError:
                    continue
        for item in self.list_custom_voice_styles():
            if item.get("available"):
                name = str(item["name"])
                try:
                    paths[name] = self._resolve_voice_style_path(name)
                except SupertonicError:
                    continue
        return paths

    @staticmethod
    def _slugify(value: str, default: str = "supertonic-clone") -> str:
        slug = re.sub(r"[^A-Za-z0-9가-힣_-]+", "-", value.strip()).strip("-_")
        return slug[:80] or default

    @staticmethod
    def _load_style_json(path: Path) -> Dict[str, Any]:
        style = json.loads(path.read_text(encoding="utf-8"))
        if "style_ttl" not in style or "style_dp" not in style:
            raise SupertonicError(f"Invalid Supertonic style JSON: {path}")
        return style

    @staticmethod
    def _style_array(style: Dict[str, Any], key: str) -> np.ndarray:
        block = style.get(key) or {}
        dims = block.get("dims")
        data = block.get("data")
        if not dims or data is None:
            raise SupertonicError(f"Style JSON is missing {key}.dims/data")
        return np.asarray(data, dtype=np.float32).reshape(dims)

    @staticmethod
    def _style_template(style: Dict[str, Any], ttl: np.ndarray, dp: np.ndarray) -> Dict[str, Any]:
        next_style = json.loads(json.dumps(style))
        next_style["style_ttl"]["data"] = ttl.astype(np.float32).reshape(-1).tolist()
        next_style["style_dp"]["data"] = dp.astype(np.float32).reshape(-1).tolist()
        return next_style

    @staticmethod
    def _reference_feature_bias(features: Dict[str, Any]) -> float:
        pitch = float(features.get("pitch_median_hz") or 150.0)
        energy = float(features.get("rms_mean") or 0.04)
        centroid = float(features.get("spectral_centroid_mean") or 1800.0)
        pitch_bias = (pitch - 150.0) / 500.0
        energy_bias = (energy - 0.04) * 1.4
        centroid_bias = (centroid - 1800.0) / 12000.0
        return float(np.clip(pitch_bias + energy_bias + centroid_bias, -0.2, 0.2))

    def create_cloned_voice_style(
        self,
        *,
        name: str,
        base_voice_styles: List[str],
        reference_audio_paths: List[str],
        reference_features: Dict[str, Any],
        language: str = "ko",
        notes: str = "",
        adaptation_strength: float = 0.08,
        seed: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a reusable custom Supertonic style JSON.

        The output is a real style vector file that ``run`` can resolve by
        name. It is intentionally conservative: selected source styles are
        averaged, then nudged by deterministic low-amplitude noise derived from
        the reference feature summary.
        """

        style_sources = self._available_source_style_paths()
        if not style_sources:
            raise SupertonicError(
                f"No Supertonic source voice styles found in {self.builtin_voice_style_dir}."
            )

        selected_names = [item for item in base_voice_styles if item in style_sources]
        if not selected_names:
            pitch = float(reference_features.get("pitch_median_hz") or 0.0)
            preferred_prefix = "F" if pitch >= 165.0 else "M"
            selected_names = [
                name for name in DEFAULT_VOICE_STYLES if name.startswith(preferred_prefix) and name in style_sources
            ] or list(style_sources.keys())[:2]

        styles = [self._load_style_json(style_sources[name]) for name in selected_names]
        ttl_arrays = [self._style_array(style, "style_ttl") for style in styles]
        dp_arrays = [self._style_array(style, "style_dp") for style in styles]
        ttl = np.mean(np.stack(ttl_arrays, axis=0), axis=0)
        dp = np.mean(np.stack(dp_arrays, axis=0), axis=0)

        strength = float(np.clip(adaptation_strength, 0.0, 0.35))
        if strength > 0:
            seed_value = seed if seed is not None else abs(hash(json.dumps(reference_features, sort_keys=True))) % (2**32)
            rng = np.random.default_rng(seed_value)
            bias = self._reference_feature_bias(reference_features)
            ttl_std = float(np.std(ttl) or 1.0)
            dp_std = float(np.std(dp) or 1.0)
            ttl = ttl + rng.normal(0.0, ttl_std * strength, size=ttl.shape).astype(np.float32)
            dp = dp + rng.normal(0.0, dp_std * strength, size=dp.shape).astype(np.float32)
            ttl = ttl + np.float32(bias * ttl_std * 0.08)
            dp = dp + np.float32(bias * dp_std * 0.08)

        slug = self._slugify(name)
        self.custom_voice_style_dir.mkdir(parents=True, exist_ok=True)
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        style_path = self.custom_voice_style_dir / f"{slug}.json"
        preset_path = self.voice_dir / f"{slug}.json"
        cloned_style = self._style_template(styles[0], ttl, dp)
        cloned_style.setdefault("metadata", {})
        cloned_style["metadata"].update(
            {
                "derived_from": SUPERTONIC_MODEL_ID,
                "license": SUPERTONIC_MODEL_LICENSE,
                "kind": "custom_style",
                "base_voice_styles": selected_names,
                "modified_by": "Qwen3-TTS-Demo Supertonic style builder",
            }
        )
        style_path.write_text(json.dumps(cloned_style, ensure_ascii=False, indent=2), encoding="utf-8")

        record = {
            "name": slug,
            "voice_style": slug,
            "voice_style_path": str(style_path),
            "language": language,
            "notes": notes,
            "kind": "custom_style",
            "base_voice_styles": selected_names,
            "reference_audio_paths": reference_audio_paths,
            "reference_features": reference_features,
            "adaptation_strength": strength,
            "derived_from": SUPERTONIC_MODEL_ID,
            "license": SUPERTONIC_MODEL_LICENSE,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        preset_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"path": str(preset_path), **record}

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
            "model_id": SUPERTONIC_MODEL_ID,
            "model_license": SUPERTONIC_MODEL_LICENSE,
            "ai_generated": True,
            "content_disclosure": "AI-generated speech",
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
