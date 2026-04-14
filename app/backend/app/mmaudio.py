"""MMAudio-backed sound effect generation helpers."""

from __future__ import annotations

import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class MMAudioError(RuntimeError):
    """Raised when the external MMAudio runtime cannot complete."""


def resolve_mmaudio_repo_root(repo_root: Path) -> Optional[Path]:
    configured = (os.getenv("MMAUDIO_REPO_ROOT") or "").strip()
    candidates: List[Path] = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            repo_root / "vendor" / "MMAudio",
            repo_root.parent / "MMAudio",
        ]
    )
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.exists():
            return resolved
    return None


def resolve_mmaudio_python(repo_root: Path) -> str:
    configured = (os.getenv("MMAUDIO_PYTHON_EXECUTABLE") or "").strip()
    candidates: List[Path] = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            repo_root / "vendor" / "MMAudio" / ".venv" / "bin" / "python",
            Path(sys.executable),
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve())
    return sys.executable


def resolve_infer_script(repo_root: Path, mmaudio_root: Path) -> Optional[Path]:
    configured = (os.getenv("MMAUDIO_INFER_SCRIPT") or "").strip()
    candidates: List[Path] = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            mmaudio_root / "demo.py",
            mmaudio_root / "inference.py",
            mmaudio_root / "scripts" / "inference.py",
        ]
    )
    for candidate in candidates:
        if not candidate:
            continue
        resolved = candidate if candidate.is_absolute() else (repo_root / candidate)
        resolved = resolved.resolve()
        if resolved.exists():
            return resolved
    return None


class MMAudioSoundEffectEngine:
    """Thin wrapper around a local MMAudio checkout or configured command."""

    def __init__(self, repo_root: Path):
        self.project_root = repo_root
        self.mmaudio_root = resolve_mmaudio_repo_root(repo_root)
        self.python_executable = resolve_mmaudio_python(repo_root)

    def is_available(self) -> bool:
        if not self.mmaudio_root:
            return False
        if (os.getenv("MMAUDIO_COMMAND_TEMPLATE") or "").strip():
            return True
        return resolve_infer_script(self.project_root, self.mmaudio_root) is not None

    def availability_notes(self) -> str:
        if not self.mmaudio_root:
            return "MMAUDIO_REPO_ROOT 또는 vendor/MMAudio 체크아웃이 필요합니다."
        if (os.getenv("MMAUDIO_COMMAND_TEMPLATE") or "").strip():
            return "MMAUDIO_COMMAND_TEMPLATE로 외부 MMAudio 실행 경로가 연결돼 있습니다."
        script = resolve_infer_script(self.project_root, self.mmaudio_root)
        if script is None:
            return "MMAudio 추론 스크립트를 찾지 못했습니다. MMAUDIO_INFER_SCRIPT를 지정하세요."
        return f"MMAudio script ready: {script.name}"

    def _build_command(self, *, prompt: str, duration_sec: float, seed: Optional[int], output_path: Path) -> Tuple[List[str], Path]:
        if not self.mmaudio_root:
            raise MMAudioError("MMAudio repository not found.")

        template = (os.getenv("MMAUDIO_COMMAND_TEMPLATE") or "").strip()
        if template:
            command = [
                token.format(
                    prompt=prompt,
                    duration=duration_sec,
                    seed="" if seed is None else seed,
                    output=str(output_path),
                    repo=str(self.mmaudio_root),
                    python=self.python_executable,
                )
                for token in shlex.split(template)
            ]
            return command, self.mmaudio_root

        script = resolve_infer_script(self.project_root, self.mmaudio_root)
        if script is None:
            raise MMAudioError("MMAudio infer script not found. Set MMAUDIO_INFER_SCRIPT or MMAUDIO_COMMAND_TEMPLATE.")

        command = [
            self.python_executable,
            str(script),
            "--prompt",
            prompt,
            "--duration",
            str(float(duration_sec)),
            "--output",
            str(output_path),
        ]
        if seed is not None:
            command.extend(["--seed", str(int(seed))])
        return command, self.mmaudio_root

    def generate(self, *, prompt: str, duration_sec: float, intensity: float, seed: Optional[int], output_path: Path) -> Tuple[Path, Dict[str, object]]:
        if not self.is_available():
            raise MMAudioError(self.availability_notes())

        output_path.parent.mkdir(parents=True, exist_ok=True)
        command, cwd = self._build_command(prompt=prompt, duration_sec=duration_sec, seed=seed, output_path=output_path)
        completed = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            raise MMAudioError(
                "MMAudio generation failed with exit code "
                f"{completed.returncode}.\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )
        if not output_path.exists():
            raise MMAudioError(f"MMAudio did not create output file: {output_path}")

        return output_path, {
            "engine": "mmaudio",
            "prompt": prompt,
            "duration_sec": duration_sec,
            "intensity": intensity,
            "seed": seed,
            "cwd": str(cwd),
            "command": command,
        }
