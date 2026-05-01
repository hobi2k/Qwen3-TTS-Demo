"""MMAudio-backed sound effect generation helpers."""

from __future__ import annotations

import os
import shutil
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class MMAudioError(RuntimeError):
    """Raised when the external MMAudio runtime cannot complete."""


NSFW_MMAUDIO_FILENAME = "mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors"


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
            repo_root / ".venv" / "bin" / "python",
            Path(sys.executable),
            repo_root / "vendor" / "MMAudio" / ".venv" / "bin" / "python",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            # Keep virtualenv symlinks intact; resolving them jumps to the base
            # interpreter and loses the environment's site-packages.
            return str(candidate)
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

    def _build_command(
        self,
        *,
        prompt: str,
        duration_sec: float,
        seed: Optional[int],
        output_path: Path,
        model_profile: str,
        steps: Optional[int],
        cfg_scale: Optional[float],
        negative_prompt: str,
    ) -> Tuple[List[str], Path]:
        profile = (model_profile or "mmaudio").strip().lower()
        profile_root = self.mmaudio_root
        if not profile_root:
            raise MMAudioError("MMAudio repository not found.")

        template_name = "MMAUDIO_NSFW_COMMAND_TEMPLATE" if profile == "mmaudio_nsfw" else "MMAUDIO_COMMAND_TEMPLATE"
        template = (os.getenv(template_name) or os.getenv("MMAUDIO_COMMAND_TEMPLATE") or "").strip()
        if template:
            model_path = ""
            if profile == "mmaudio_nsfw":
                nsfw_model = self.project_root / "data" / "mmaudio" / "nsfw" / NSFW_MMAUDIO_FILENAME
                if not nsfw_model.exists():
                    raise MMAudioError(f"NSFW MMAudio model not found: {nsfw_model}")
                model_path = str(nsfw_model)
            command = [
                token.format(
                    prompt=prompt,
                    duration=duration_sec,
                    seed="" if seed is None else seed,
                    output=str(output_path),
                    repo=str(profile_root),
                    model=model_path,
                    python=self.python_executable,
                    profile=profile,
                    steps="" if steps is None else steps,
                    cfg_scale="" if cfg_scale is None else cfg_scale,
                    negative_prompt=negative_prompt,
                )
                for token in shlex.split(template)
            ]
            return command, profile_root

        if profile == "mmaudio_nsfw":
            nsfw_model = self.project_root / "data" / "mmaudio" / "nsfw" / NSFW_MMAUDIO_FILENAME
            if not nsfw_model.exists():
                raise MMAudioError(f"NSFW MMAudio model not found: {nsfw_model}")
            raise MMAudioError(
                "MMAudio NSFW generation requires MMAUDIO_NSFW_COMMAND_TEMPLATE because "
                "the bundled MMAudio demo entrypoint does not accept an arbitrary safetensors checkpoint."
            )

        script = resolve_infer_script(self.project_root, profile_root)
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
            str(output_path.parent),
        ]
        if seed is not None:
            command.extend(["--seed", str(int(seed))])
        if steps is not None:
            command.extend(["--num_steps", str(int(steps))])
        if cfg_scale is not None:
            command.extend(["--cfg_strength", str(float(cfg_scale))])
        if negative_prompt:
            command.extend(["--negative_prompt", negative_prompt])
        return command, profile_root

    def generate(
        self,
        *,
        prompt: str,
        duration_sec: float,
        intensity: float,
        seed: Optional[int],
        output_path: Path,
        model_profile: str = "mmaudio",
        steps: Optional[int] = None,
        cfg_scale: Optional[float] = None,
        negative_prompt: str = "",
    ) -> Tuple[Path, Dict[str, object]]:
        if not self.is_available():
            raise MMAudioError(self.availability_notes())

        output_path.parent.mkdir(parents=True, exist_ok=True)
        existing_outputs = {
            candidate.resolve()
            for candidate in output_path.parent.glob("*")
            if candidate.suffix.lower() in {".wav", ".flac", ".mp3", ".ogg"}
        }
        command, cwd = self._build_command(
            prompt=prompt,
            duration_sec=duration_sec,
            seed=seed,
            output_path=output_path,
            model_profile=model_profile,
            steps=steps,
            cfg_scale=cfg_scale,
            negative_prompt=negative_prompt,
        )
        completed = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            raise MMAudioError(
                "MMAudio generation failed with exit code "
                f"{completed.returncode}.\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )
        if not output_path.exists():
            new_outputs = [
                candidate
                for candidate in output_path.parent.glob("*")
                if candidate.suffix.lower() in {".wav", ".flac", ".mp3", ".ogg"}
                and candidate.resolve() not in existing_outputs
            ]
            if not new_outputs:
                raise MMAudioError(f"MMAudio did not create output file: {output_path}")
            produced_path = max(new_outputs, key=lambda item: item.stat().st_mtime)
            if produced_path.suffix.lower() == output_path.suffix.lower():
                shutil.move(str(produced_path), output_path)
            else:
                try:
                    import torchaudio

                    audio, sample_rate = torchaudio.load(str(produced_path))
                    torchaudio.save(str(output_path), audio, sample_rate)
                    produced_path.unlink(missing_ok=True)
                except Exception:
                    shutil.copyfile(produced_path, output_path)

        return output_path, {
            "engine": "mmaudio",
            "model_profile": model_profile,
            "prompt": prompt,
            "duration_sec": duration_sec,
            "intensity": intensity,
            "seed": seed,
            "steps": steps,
            "cfg_scale": cfg_scale,
            "negative_prompt": negative_prompt,
            "cwd": str(cwd),
            "command": command,
        }
