#!/usr/bin/env python3
"""Run the low-level VoiceBox/CustomVoice clone capability experiment.

This wrapper keeps the experiment separate from the production clone path.
It forwards into the scratch experiment under `test/` so the result can be
reproduced without touching the official Base clone helpers.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = REPO_ROOT / "test" / "customvoice_clone_from_scratch.py"


def main() -> None:
    """Forward all CLI arguments into the scratch clone experiment."""

    subprocess.run([sys.executable, str(EXPERIMENT), *sys.argv[1:]], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
