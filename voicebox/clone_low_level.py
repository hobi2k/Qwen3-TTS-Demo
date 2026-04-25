#!/usr/bin/env python3
"""Compatibility wrapper for low-level VoiceBox inference."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "Qwen3-TTS" / "inference" / "voicebox" / "clone_low_level.py"


def main() -> None:
    """Forward execution to the canonical low-level VoiceBox script."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *sys.argv[1:]], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
