#!/usr/bin/env python3
"""Compatibility wrapper for ``voicebox/clone_instruct.py``."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SCRIPT = REPO_ROOT / "voicebox" / "clone_instruct.py"


def main() -> None:
    """Forward all CLI arguments to the canonical VoiceBox clone+instruct experiment."""

    subprocess.run([sys.executable, str(CANONICAL_SCRIPT), *sys.argv[1:]], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
