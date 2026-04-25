#!/usr/bin/env python3
"""VoiceBox runtime helpers.

This is the canonical loader for self-contained VoiceBox checkpoints. It keeps
VoiceBox-specific loading behavior out of generic app wrappers and next to the
VoiceBox inference scripts that depend on it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from transformers import AutoConfig, AutoModel, AutoProcessor

UPSTREAM_ROOT = Path(__file__).resolve().parents[2]
if str(UPSTREAM_ROOT) not in sys.path:
    sys.path.insert(0, str(UPSTREAM_ROOT))

from qwen_tts import Qwen3TTSModel
from qwen_tts.core.models import Qwen3TTSConfig, Qwen3TTSForConditionalGeneration, Qwen3TTSProcessor


def _load_raw_config(model_path: str | Path) -> dict[str, Any]:
    """Read raw config JSON from a local checkpoint directory."""

    return json.loads((Path(model_path) / "config.json").read_text(encoding="utf-8"))


def is_voicebox_checkpoint(model_path: str | Path) -> bool:
    """Return True when a checkpoint carries VoiceBox metadata."""

    try:
        raw = _load_raw_config(model_path)
    except Exception:
        return False
    return bool(raw.get("demo_model_family") == "voicebox" and raw.get("speaker_encoder_included"))


def load_voicebox_model(pretrained_model_name_or_path: str, **kwargs: Any) -> Qwen3TTSModel:
    """Load a self-contained VoiceBox checkpoint with its embedded encoder.

    Upstream only constructs `speaker_encoder` when `tts_model_type == "base"`.
    VoiceBox keeps `tts_model_type == "custom_voice"` for compatibility, so we
    temporarily load the config as `base`, materialize the encoder, then switch
    the runtime type back to `custom_voice`.
    """

    AutoConfig.register("qwen3_tts", Qwen3TTSConfig)
    AutoModel.register(Qwen3TTSConfig, Qwen3TTSForConditionalGeneration)
    AutoProcessor.register(Qwen3TTSConfig, Qwen3TTSProcessor)

    config = AutoConfig.from_pretrained(pretrained_model_name_or_path)
    runtime_tts_model_type = config.tts_model_type
    config.tts_model_type = "base"

    model = AutoModel.from_pretrained(pretrained_model_name_or_path, config=config, **kwargs)
    if not isinstance(model, Qwen3TTSForConditionalGeneration):
        raise TypeError(f"Expected Qwen3TTSForConditionalGeneration, got {type(model)}")

    model.tts_model_type = runtime_tts_model_type
    model.config.tts_model_type = runtime_tts_model_type
    processor = AutoProcessor.from_pretrained(pretrained_model_name_or_path, fix_mistral_regex=True)
    return Qwen3TTSModel(model=model, processor=processor, generate_defaults=model.generate_config)


def load_qwen_or_voicebox_model(pretrained_model_name_or_path: str, **kwargs: Any) -> Qwen3TTSModel:
    """Load a regular Qwen checkpoint or a VoiceBox checkpoint transparently."""

    checkpoint_dir = Path(pretrained_model_name_or_path)
    if checkpoint_dir.is_dir() and is_voicebox_checkpoint(checkpoint_dir):
        return load_voicebox_model(str(checkpoint_dir), **kwargs)
    return Qwen3TTSModel.from_pretrained(pretrained_model_name_or_path, **kwargs)
