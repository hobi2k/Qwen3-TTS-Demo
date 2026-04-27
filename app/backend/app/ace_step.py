"""ACE-Step-backed music composition helpers.

The backend launches ACE-Step in a separate Python process instead of importing
the heavy music model into the FastAPI worker. This keeps the web server
responsive and makes it possible to use a dedicated ACE-Step virtual
environment.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


class AceStepError(RuntimeError):
    """Raised when ACE-Step music generation cannot complete."""


def resolve_ace_step_root(repo_root: Path) -> Path:
    """Resolve the local ACE-Step checkout path."""

    configured = os.getenv("ACE_STEP_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "vendor" / "ACE-Step").resolve()


def resolve_ace_step_python(repo_root: Path) -> str:
    """Resolve the Python executable used for ACE-Step generation."""

    configured = os.getenv("ACE_STEP_PYTHON", "").strip()
    if configured:
        return configured

    candidates = [
        repo_root / ".venv-ace-step" / "bin" / "python",
        repo_root / "vendor" / "ACE-Step" / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def resolve_ace_step_checkpoint(repo_root: Path) -> Path:
    """Resolve the ACE-Step checkpoint cache directory."""

    configured = os.getenv("ACE_STEP_CHECKPOINT_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (repo_root / "data" / "models" / "ace-step").resolve()


class AceStepComposer:
    """Thin subprocess wrapper around the local ACE-Step pipeline."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.ace_step_root = resolve_ace_step_root(repo_root)
        self.python_executable = resolve_ace_step_python(repo_root)
        self.checkpoint_path = resolve_ace_step_checkpoint(repo_root)
        self.runner_path = repo_root / "scripts" / "run_ace_step_generate.py"

    def is_available(self) -> bool:
        """Return whether the ACE-Step checkout and runner are present."""

        return self.ace_step_root.exists() and self.runner_path.exists()

    def availability_notes(self) -> str:
        """Return a human-readable runtime status string."""

        if not self.ace_step_root.exists():
            return f"ACE-Step repository not found: {self.ace_step_root}"
        if not self.runner_path.exists():
            return f"ACE-Step runner not found: {self.runner_path}"
        return f"ACE-Step root: {self.ace_step_root}"

    def generate(
        self,
        *,
        output_path: Path,
        prompt: str,
        lyrics: str,
        audio_duration: float,
        infer_step: int,
        guidance_scale: float,
        scheduler_type: str,
        cfg_type: str,
        omega_scale: float,
        manual_seeds: str,
        guidance_interval: float,
        guidance_interval_decay: float,
        min_guidance_scale: float,
        use_erg_tag: bool,
        use_erg_lyric: bool,
        use_erg_diffusion: bool,
        oss_steps: str,
        guidance_scale_text: float,
        guidance_scale_lyric: float,
        bf16: bool,
        torch_compile: bool,
        cpu_offload: bool,
        overlapped_decode: bool,
        device_id: int,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Path, Dict[str, Any]]:
        """Generate a music track with ACE-Step.

        Args:
            output_path: Final audio file path expected by this app.
            prompt: Style tags or music description.
            lyrics: Lyrics with optional section tags.
            audio_duration: Target duration in seconds. ACE-Step accepts -1 for random.
            infer_step: Number of diffusion/ODE steps.
            guidance_scale: Main guidance scale.
            scheduler_type: ACE-Step scheduler name.
            cfg_type: ACE-Step CFG mode.
            omega_scale: Omega guidance scale.
            manual_seeds: Comma-separated seed list.
            guidance_interval: Guidance interval start.
            guidance_interval_decay: Guidance interval decay.
            min_guidance_scale: Minimum guidance scale.
            use_erg_tag: Enable ERG tag guidance.
            use_erg_lyric: Enable ERG lyric guidance.
            use_erg_diffusion: Enable ERG diffusion guidance.
            oss_steps: Comma-separated OSS step list.
            guidance_scale_text: Text-specific guidance scale.
            guidance_scale_lyric: Lyric-specific guidance scale.
            bf16: Use bfloat16 when supported.
            torch_compile: Enable torch.compile in ACE-Step.
            cpu_offload: Use ACE-Step CPU offload.
            overlapped_decode: Use overlapped decoding.
            device_id: CUDA device id.
            extra: Extra metadata to carry into the result.

        Returns:
            The generated audio path and execution metadata.
        """

        if not self.is_available():
            raise AceStepError(self.availability_notes())

        output_path.parent.mkdir(parents=True, exist_ok=True)
        request_path = output_path.with_suffix(".ace-step-request.json")
        payload = {
            "prompt": prompt,
            "lyrics": lyrics,
            "audio_duration": audio_duration,
            "infer_step": infer_step,
            "guidance_scale": guidance_scale,
            "scheduler_type": scheduler_type,
            "cfg_type": cfg_type,
            "omega_scale": omega_scale,
            "manual_seeds": manual_seeds,
            "guidance_interval": guidance_interval,
            "guidance_interval_decay": guidance_interval_decay,
            "min_guidance_scale": min_guidance_scale,
            "use_erg_tag": use_erg_tag,
            "use_erg_lyric": use_erg_lyric,
            "use_erg_diffusion": use_erg_diffusion,
            "oss_steps": oss_steps,
            "guidance_scale_text": guidance_scale_text,
            "guidance_scale_lyric": guidance_scale_lyric,
            "bf16": bf16,
            "torch_compile": torch_compile,
            "cpu_offload": cpu_offload,
            "overlapped_decode": overlapped_decode,
            "device_id": device_id,
            "extra": extra or {},
        }
        request_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        command = [
            self.python_executable,
            str(self.runner_path),
            "--request-json",
            str(request_path),
            "--output-path",
            str(output_path),
            "--ace-step-root",
            str(self.ace_step_root),
            "--checkpoint-path",
            str(self.checkpoint_path),
        ]
        completed = subprocess.run(
            command,
            cwd=str(self.ace_step_root),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise AceStepError(
                "ACE-Step generation failed with exit code "
                f"{completed.returncode}.\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
            )
        if not output_path.exists():
            raise AceStepError(f"ACE-Step did not create output file: {output_path}")

        return output_path, {
            "engine": "ace_step",
            "ace_step_root": str(self.ace_step_root),
            "checkpoint_path": str(self.checkpoint_path),
            "python_executable": self.python_executable,
            "request_path": str(request_path),
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            **payload,
        }
