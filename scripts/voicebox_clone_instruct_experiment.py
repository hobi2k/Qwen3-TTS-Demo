#!/usr/bin/env python3
"""Run the clone-plus-instruct experiment against a VoiceBox-style checkpoint.

The underlying experiment is still low-level and unsupported by upstream. This
wrapper exists so the clone-only and clone-plus-instruct probes are separated
in the project structure and documentation.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = REPO_ROOT / "test" / "customvoice_clone_from_scratch.py"


def main() -> None:
    """Forward all CLI arguments into the scratch experiment.

    The scratch experiment already accepts `--instruct`, so this dedicated
    wrapper simply gives the project a stable entry point for the
    clone-plus-instruct path.
    """

    subprocess.run([sys.executable, str(EXPERIMENT), *sys.argv[1:]], check=True, cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
