#!/usr/bin/env python3
"""Compatibility wrapper for ``voicebox/make_checkpoint.py``."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "voicebox" / "make_checkpoint.py"


def main() -> None:
    """Forward all CLI arguments to the canonical VoiceBox converter."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *sys.argv[1:]], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
