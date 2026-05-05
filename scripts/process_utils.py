"""Cross-platform subprocess helpers for live verification scripts."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Sequence


def venv_python(repo_root: Path) -> Path:
    """Return this repo's virtualenv Python path for Windows or POSIX."""

    candidates = [
        repo_root / ".venv" / "Scripts" / "python.exe",
        repo_root / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return Path(sys.executable)


def popen_process_group(command: Sequence[str], **kwargs: Any) -> subprocess.Popen[str]:
    """Start a subprocess in a separate group/session on all supported OSes."""

    if os.name == "nt":
        creationflags = int(kwargs.pop("creationflags", 0))
        creationflags |= subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        return subprocess.Popen(command, creationflags=creationflags, **kwargs)
    return subprocess.Popen(command, start_new_session=True, **kwargs)


def _wait_until_exit(process: subprocess.Popen[str], deadline: float) -> bool:
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return True
        time.sleep(0.25)
    return process.poll() is not None


def terminate_process_group(process: subprocess.Popen[str], grace_seconds: float = 15.0, *, interrupt: bool = False) -> None:
    """Terminate a process group/session without assuming a POSIX shell."""

    if process.poll() is not None:
        return

    if os.name == "nt":
        if interrupt:
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
            except Exception:
                pass
            if _wait_until_exit(process, time.monotonic() + grace_seconds):
                return
        try:
            process.terminate()
        except Exception:
            pass
        if _wait_until_exit(process, time.monotonic() + grace_seconds):
            return
        try:
            process.kill()
        except Exception:
            pass
        return

    first_signal = signal.SIGINT if interrupt else signal.SIGTERM
    try:
        os.killpg(process.pid, first_signal)
    except Exception:
        try:
            process.terminate()
        except Exception:
            pass
    if _wait_until_exit(process, time.monotonic() + grace_seconds):
        return

    try:
        os.killpg(process.pid, signal.SIGTERM)
    except Exception:
        try:
            process.terminate()
        except Exception:
            pass
    if _wait_until_exit(process, time.monotonic() + grace_seconds):
        return

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass
