#!/usr/bin/env python3
"""Compatibility re-export for canonical VoiceBox training helpers."""

from __future__ import annotations

import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_COMMON = REPO_ROOT / "Qwen3-TTS" / "finetuning" / "voicebox_training_common.py"

spec = importlib.util.spec_from_file_location("_qwen3_tts_voicebox_training_common", CANONICAL_COMMON)
if spec is None or spec.loader is None:
    raise ImportError(f"Cannot load VoiceBox training helpers from {CANONICAL_COMMON}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

for name, value in module.__dict__.items():
    if not name.startswith("_"):
        globals()[name] = value
