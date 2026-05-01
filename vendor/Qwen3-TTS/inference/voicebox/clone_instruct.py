#!/usr/bin/env python3
"""VoiceBox clone + instruct experiment entry point."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


VOICEBOX_DIR = Path(__file__).resolve().parent
EXPERIMENT = VOICEBOX_DIR / "clone_low_level.py"


def main() -> None:
    """Forward all CLI args into the low-level VoiceBox clone+instruct experiment."""

    subprocess.run([sys.executable, str(EXPERIMENT), *sys.argv[1:]], check=True, cwd=VOICEBOX_DIR.parent)


if __name__ == "__main__":
    main()
