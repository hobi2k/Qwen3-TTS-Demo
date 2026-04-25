#!/usr/bin/env python3
"""Compatibility re-export for the canonical VoiceBox runtime helpers.

New code should import from ``Qwen3-TTS/inference/voicebox/runtime.py`` or use
the compatibility module ``voicebox.runtime``. This module remains for older
scripts that imported ``scripts.voicebox_runtime`` directly.
"""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VOICEBOX_DIR = REPO_ROOT / "Qwen3-TTS" / "inference" / "voicebox"
if str(VOICEBOX_DIR) not in sys.path:
    sys.path.insert(0, str(VOICEBOX_DIR))

from runtime import is_voicebox_checkpoint, load_qwen_or_voicebox_model, load_voicebox_model  # noqa: E402,F401
