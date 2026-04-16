#!/usr/bin/env python3
"""Dedicated runtime helpers for self-contained VoiceBox checkpoints.

This module intentionally lives outside the upstream `Qwen3-TTS` package.
It gives the demo a reproducible way to load a checkpoint that:

- keeps `tts_model_type = "custom_voice"` for normal CustomVoice inference, but
- also carries an embedded speaker encoder copied from Base 1.7B.

Upstream only instantiates `speaker_encoder` when `tts_model_type == "base"`.
VoiceBox therefore needs a small compatibility layer: we temporarily load the
checkpoint as `base` so the module is constructed and the encoder weights are
materialized, then switch the runtime type back to `custom_voice`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from transformers import AutoConfig, AutoModel, AutoProcessor

from qwen_tts import Qwen3TTSModel
from qwen_tts.core.models import Qwen3TTSConfig, Qwen3TTSForConditionalGeneration, Qwen3TTSProcessor


def _load_raw_config(model_path: str | Path) -> dict[str, Any]:
    """Read raw config JSON from a local checkpoint directory.

    Args:
        model_path: Local checkpoint directory.

    Returns:
        Parsed JSON payload.
    """

    config_path = Path(model_path) / "config.json"
    return json.loads(config_path.read_text(encoding="utf-8"))


def is_voicebox_checkpoint(model_path: str | Path) -> bool:
    """Check whether a checkpoint advertises itself as a VoiceBox model.

    Args:
        model_path: Local checkpoint directory.

    Returns:
        True when the checkpoint contains VoiceBox metadata.
    """

    try:
        raw = _load_raw_config(model_path)
    except Exception:
        return False
    return bool(raw.get("demo_model_family") == "voicebox" and raw.get("speaker_encoder_included"))


def load_voicebox_model(pretrained_model_name_or_path: str, **kwargs: Any) -> Qwen3TTSModel:
    """Load a self-contained VoiceBox checkpoint with its embedded encoder.

    Args:
        pretrained_model_name_or_path: Local VoiceBox checkpoint directory.
        **kwargs: Standard HF model loading kwargs such as `device_map`, `dtype`,
            or `attn_implementation`.

    Returns:
        A `Qwen3TTSModel` wrapper whose runtime type is `custom_voice` but whose
        underlying model also has `speaker_encoder` attached.
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

    # Restore the runtime identity so the wrapper keeps behaving like
    # CustomVoice for high-level generation paths.
    model.tts_model_type = runtime_tts_model_type
    model.config.tts_model_type = runtime_tts_model_type
    processor = AutoProcessor.from_pretrained(pretrained_model_name_or_path, fix_mistral_regex=True)
    return Qwen3TTSModel(model=model, processor=processor, generate_defaults=model.generate_config)


def load_qwen_or_voicebox_model(pretrained_model_name_or_path: str, **kwargs: Any) -> Qwen3TTSModel:
    """Load a normal Qwen checkpoint or a VoiceBox checkpoint transparently.

    Args:
        pretrained_model_name_or_path: Local checkpoint directory or repo id.
        **kwargs: Standard HF model loading kwargs.

    Returns:
        Loaded wrapper.
    """

    checkpoint_dir = Path(pretrained_model_name_or_path)
    if checkpoint_dir.is_dir() and is_voicebox_checkpoint(checkpoint_dir):
        return load_voicebox_model(str(checkpoint_dir), **kwargs)
    return Qwen3TTSModel.from_pretrained(pretrained_model_name_or_path, **kwargs)
