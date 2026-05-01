"""VibeVoice vendor runtime helpers.

The official VibeVoice repository keeps ASR and Realtime TTS runnable, while
long-form TTS launchers can vary between the Microsoft release and community
forks. This wrapper tracks the official families plus the community 7B weights
and uses the local long-form helper when an upstream launcher is missing.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import re
from pathlib import Path
from string import Formatter
from typing import Any, Dict, List, Optional


class VibeVoiceError(RuntimeError):
    """Raised when a VibeVoice vendor operation cannot run."""


def _relative_or_absolute(root: Path, value: str) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    return candidate


class VibeVoiceEngine:
    """Thin subprocess wrapper around the Microsoft VibeVoice vendor repo."""

    ASR_REPO_ID = "microsoft/VibeVoice-ASR"
    REALTIME_TTS_REPO_ID = "microsoft/VibeVoice-Realtime-0.5B"
    LONGFORM_TTS_REPO_ID = "vibevoice/VibeVoice-1.5B"
    LARGE_TTS_REPO_ID = "vibevoice/VibeVoice-7B"

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root

    @property
    def vendor_root(self) -> Path:
        return _relative_or_absolute(self.repo_root, os.getenv("VIBEVOICE_REPO_ROOT", "vendor/VibeVoice"))

    @property
    def model_root(self) -> Path:
        return _relative_or_absolute(self.repo_root, os.getenv("VIBEVOICE_MODEL_DIR", "data/models/vibevoice"))

    @property
    def python_executable(self) -> str:
        configured = os.getenv("VIBEVOICE_PYTHON", "").strip()
        if configured:
            return str(_relative_or_absolute(self.repo_root, configured))
        vendor_python = self.repo_root / ".venv-vibevoice" / "bin" / "python"
        return str(vendor_python if vendor_python.exists() else sys.executable)

    def model_path(self, profile: str) -> Path:
        configured = os.getenv(f"VIBEVOICE_{profile.upper()}_MODEL_PATH", "").strip()
        if configured:
            return _relative_or_absolute(self.repo_root, configured)
        dirname = {
            "asr": "VibeVoice-ASR",
            "realtime": "VibeVoice-Realtime-0.5B",
            "tts_15b": "VibeVoice-1.5B",
            "tts_7b": "VibeVoice-7B",
        }.get(profile)
        if not dirname:
            raise VibeVoiceError(f"Unsupported VibeVoice model profile: {profile}")
        return self.model_root / dirname

    def model_id(self, profile: str) -> str:
        path = self.model_path(profile)
        if path.exists():
            return str(path)
        return {
            "asr": self.ASR_REPO_ID,
            "realtime": self.REALTIME_TTS_REPO_ID,
            "tts_15b": self.LONGFORM_TTS_REPO_ID,
            "tts_7b": self.LARGE_TTS_REPO_ID,
        }[profile]

    def tts_entrypoints(self) -> List[str]:
        candidates = [
            "demo/realtime_model_inference_from_file.py",
            "demo/inference_from_file.py",
            "demo/model_inference_from_file.py",
            "demo/vibevoice_tts_inference_from_file.py",
            "demo/gradio_demo.py",
        ]
        found = [item for item in candidates if (self.vendor_root / item).exists()]
        helper = self.repo_root / "scripts" / "run_vibevoice_tts_15b.py"
        if helper.exists():
            found.append("scripts/run_vibevoice_tts_15b.py")
        return found

    def status(self) -> Dict[str, Any]:
        repo_ready = self.vendor_root.exists()
        asr_ready = self.model_path("asr").exists()
        realtime_ready = self.model_path("realtime").exists()
        tts_15b_ready = self.model_path("tts_15b").exists()
        tts_7b_ready = self.model_path("tts_7b").exists()
        entrypoints = self.tts_entrypoints()
        return {
            "available": repo_ready and (asr_ready or realtime_ready or tts_15b_ready or tts_7b_ready),
            "repo_root": str(self.vendor_root),
            "model_root": str(self.model_root),
            "python_executable": self.python_executable,
            "repo_ready": repo_ready,
            "asr_ready": asr_ready,
            "realtime_tts_ready": realtime_ready,
            "longform_tts_ready": tts_15b_ready,
            "large_tts_ready": tts_7b_ready,
            "asr_model": self.model_id("asr"),
            "realtime_tts_model": self.model_id("realtime"),
            "longform_tts_model": self.model_id("tts_15b"),
            "large_tts_model": self.model_id("tts_7b"),
            "tts_entrypoints": entrypoints,
            "features": [
                "ASR",
                "ASR LoRA fine-tuning",
                "ASR hotwords/context",
                "ASR batch files, folders, and HF datasets",
                "ASR timestamps through helper path",
                "Realtime TTS 0.5B",
                "Long-form TTS 1.5B",
                "Community long-form TTS 7B",
                "1.5B multi-speaker voice prompts",
                "7B multi-speaker voice prompts",
                "TTS LoRA checkpoint loading",
                "VibeVoice LoRA merge and verify",
                "NnScaler checkpoint conversion",
                "Command-template overrides",
            ],
            "notes": (
                "1.5B TTS uses Microsoft weights; 7B TTS uses the community vibevoice/VibeVoice-7B weights. "
                "Both long-form paths run through scripts/run_vibevoice_tts_15b.py unless a command template is set."
            ),
        }

    def asr_models(self) -> List[Dict[str, str]]:
        return [
            {
                "id": "vibevoice/asr",
                "label": "VibeVoice-ASR",
                "description": "Microsoft VibeVoice-ASR local vendor model",
            }
        ]

    def _format_template(self, template: str, values: Dict[str, Any]) -> List[str]:
        used = {field for _, field, _, _ in Formatter().parse(template) if field}
        safe_values = {key: str(value) for key, value in values.items()}
        safe_values.update({key: "" for key in used if key not in safe_values})
        return shlex.split(template.format(**safe_values))

    def _run(self, command: List[str], cwd: Optional[Path] = None) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        python_path = str(self.vendor_root)
        env["PYTHONPATH"] = python_path if not env.get("PYTHONPATH") else f"{python_path}{os.pathsep}{env['PYTHONPATH']}"
        try:
            return subprocess.run(
                command,
                cwd=str(cwd or self.repo_root),
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as error:
            message = (error.stderr or error.stdout or str(error)).strip()
            raise VibeVoiceError(message) from error

    def transcribe(
        self,
        *,
        audio_path: Optional[Path] = None,
        audio_dir: Optional[Path] = None,
        dataset: str = "",
        split: str = "test",
        max_duration: float = 3600.0,
        language: str = "auto",
        task: str = "transcribe",
        context_info: str = "",
        device: str = "auto",
        precision: str = "auto",
        attn_implementation: str = "auto",
        batch_size: int = 2,
        max_new_tokens: int = 256,
        temperature: float = 0.0,
        top_p: float = 1.0,
        num_beams: int = 1,
        return_timestamps: bool = False,
    ) -> Dict[str, Any]:
        if not self.vendor_root.exists():
            raise VibeVoiceError(f"VibeVoice vendor repo not found: {self.vendor_root}")
        model_path = self.model_path("asr")
        if not model_path.exists():
            raise VibeVoiceError(f"VibeVoice ASR model not found: {model_path}")

        if audio_path is None and audio_dir is None and not dataset.strip():
            raise VibeVoiceError("VibeVoice ASR requires audio_path, audio_dir, or dataset.")
        output_json = (audio_path or self.repo_root / "data" / "vibevoice_asr_batch").with_suffix(".vibevoice-asr.json")
        template = os.getenv("VIBEVOICE_ASR_COMMAND_TEMPLATE", "").strip()
        values = {
            "python": self.python_executable,
            "repo": self.vendor_root,
            "model": model_path,
            "audio": audio_path or "",
            "audio_dir": audio_dir or "",
            "dataset": dataset,
            "split": split,
            "max_duration": max_duration,
            "output": output_json,
            "language": language,
            "task": task,
            "context_info": context_info,
            "device": device,
            "precision": precision,
            "attn_implementation": attn_implementation,
            "batch_size": batch_size,
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "num_beams": num_beams,
            "return_timestamps": int(return_timestamps),
        }
        if template:
            command = self._format_template(template, values)
        else:
            official_script = self.vendor_root / "demo" / "vibevoice_asr_inference_from_file.py"
            if official_script.exists() and not context_info.strip() and not return_timestamps:
                command = [
                    self.python_executable,
                    str(official_script),
                    "--model_path",
                    str(model_path),
                    "--device",
                    device if device != "auto" else "auto",
                    "--max_new_tokens",
                    str(max_new_tokens),
                    "--temperature",
                    str(temperature),
                    "--top_p",
                    str(top_p),
                    "--num_beams",
                    str(num_beams),
                    "--batch_size",
                    str(batch_size),
                ]
                if audio_path:
                    command.extend(["--audio_files", str(audio_path)])
                elif audio_dir:
                    command.extend(["--audio_dir", str(audio_dir)])
                elif dataset.strip():
                    command.extend(["--dataset", dataset, "--split", split, "--max_duration", str(max_duration)])
                if attn_implementation != "auto":
                    command.extend(["--attn_implementation", attn_implementation])
            else:
                if audio_path is None:
                    raise VibeVoiceError("context/timestamp helper mode currently requires a single audio_path.")
                command = [
                    self.python_executable,
                    str(self.repo_root / "scripts" / "run_vibevoice_asr.py"),
                    "--repo-root",
                    str(self.vendor_root),
                    "--model-path",
                    str(model_path),
                    "--audio",
                    str(audio_path),
                    "--output-json",
                    str(output_json),
                    "--language",
                    language,
                    "--task",
                    task,
                    "--context-info",
                    context_info,
                    "--device",
                    device,
                "--precision",
                precision,
                "--attn-implementation",
                attn_implementation,
                "--max-new-tokens",
                    str(max_new_tokens),
                    "--temperature",
                    str(temperature),
                    "--top-p",
                    str(top_p),
                    "--num-beams",
                    str(num_beams),
                ]
                if return_timestamps:
                    command.append("--return-timestamps")
        completed = self._run(command, cwd=self.vendor_root)
        if output_json.exists():
            return json.loads(output_json.read_text(encoding="utf-8"))
        text = self._extract_asr_text(completed.stdout or "")
        return {"text": text, "language": None, "segments": [], "meta": {"stdout": text}}

    def _extract_asr_text(self, stdout: str) -> str:
        raw_match = re.search(r"--- Raw Output ---\s*(.+?)(?:\n\s*---|\Z)", stdout, flags=re.DOTALL)
        if raw_match:
            return raw_match.group(1).strip()
        lines = [line.strip() for line in stdout.splitlines() if line.strip()]
        if not lines:
            return ""
        return lines[-1]

    def generate_tts(
        self,
        *,
        text: str,
        output_path: Path,
        model_profile: str = "realtime",
        language: str = "auto",
        speaker_name: str = "Speaker 1",
        speaker_audio_path: Optional[Path] = None,
        speaker_names: Optional[List[str]] = None,
        speaker_audio_paths: Optional[List[Path]] = None,
        checkpoint_path: str = "",
        cfg_scale: float = 1.3,
        ddpm_steps: int = 5,
        seed: Optional[int] = None,
        device: str = "auto",
        attn_implementation: str = "auto",
        inference_steps: int = 10,
        max_length_times: float = 2.0,
        disable_prefill: bool = False,
        show_progress: bool = False,
        max_new_tokens: int = 2048,
        extra_args: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        if model_profile in {"tts_7b", "7b", "large"}:
            profile = "tts_7b"
        elif model_profile in {"tts_15b", "1.5b", "longform"}:
            profile = "tts_15b"
        else:
            profile = "realtime"
        model_path = self.model_path(profile)
        if not self.vendor_root.exists():
            raise VibeVoiceError(f"VibeVoice vendor repo not found: {self.vendor_root}")
        if not model_path.exists():
            raise VibeVoiceError(f"VibeVoice model not found: {model_path}")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        work_dir = output_path.parent / f"{output_path.stem}_vibevoice_work"
        work_dir.mkdir(parents=True, exist_ok=True)
        prompt_file = work_dir / "input.txt"
        prompt_file.write_text(text, encoding="utf-8")

        template_name = {
            "tts_15b": "VIBEVOICE_TTS_15B_COMMAND_TEMPLATE",
            "tts_7b": "VIBEVOICE_TTS_7B_COMMAND_TEMPLATE",
        }.get(profile, "VIBEVOICE_TTS_COMMAND_TEMPLATE")
        template = os.getenv(template_name, "").strip() or os.getenv("VIBEVOICE_TTS_COMMAND_TEMPLATE", "").strip()
        values = {
            "python": self.python_executable,
            "repo": self.vendor_root,
            "model": model_path,
            "model_profile": profile,
            "text": text,
            "text_file": prompt_file,
            "output": output_path,
            "output_dir": work_dir,
            "speaker": speaker_name,
            "speaker_audio": speaker_audio_path or "",
            "speaker_names": " ".join(speaker_names or []),
            "speaker_audio_paths": " ".join(str(path) for path in (speaker_audio_paths or [])),
            "checkpoint_path": checkpoint_path,
            "cfg_scale": cfg_scale,
            "ddpm_steps": ddpm_steps,
            "seed": "" if seed is None else seed,
            "device": device,
            "attn_implementation": attn_implementation,
            "inference_steps": inference_steps,
            "max_length_times": max_length_times,
            "disable_prefill": int(disable_prefill),
            "show_progress": int(show_progress),
            "max_new_tokens": max_new_tokens,
        }
        if template:
            command = self._format_template(template, values)
        else:
            command = self._default_tts_command(
                profile=profile,
                model_path=model_path,
                prompt_file=prompt_file,
                output_path=output_path,
                work_dir=work_dir,
                speaker_name=speaker_name,
                speaker_audio_path=speaker_audio_path,
                speaker_names=speaker_names or [],
                speaker_audio_paths=speaker_audio_paths or [],
                checkpoint_path=checkpoint_path,
                cfg_scale=cfg_scale,
                ddpm_steps=ddpm_steps,
                device=device,
                seed=seed,
                attn_implementation=attn_implementation,
                inference_steps=inference_steps,
                max_length_times=max_length_times,
                max_new_tokens=max_new_tokens,
                disable_prefill=disable_prefill,
                show_progress=show_progress,
                extra_args=extra_args or [],
            )

        self._run(command, cwd=self.vendor_root)
        if not output_path.exists():
            generated = sorted(work_dir.rglob("*.wav"), key=lambda path: path.stat().st_mtime, reverse=True)
            if not generated:
                generated = sorted(work_dir.rglob("*.flac"), key=lambda path: path.stat().st_mtime, reverse=True)
            if not generated:
                raise VibeVoiceError("VibeVoice command completed but no audio file was produced.")
            shutil.copy2(generated[0], output_path)
        return {
            "model_profile": profile,
            "model_path": str(model_path),
            "command": command,
            "work_dir": str(work_dir),
            "speaker_names": speaker_names or [speaker_name],
            "speaker_audio_paths": [str(path) for path in (speaker_audio_paths or ([speaker_audio_path] if speaker_audio_path else []))],
            "checkpoint_path": checkpoint_path,
        }

    def _default_tts_command(
        self,
        *,
        profile: str,
        model_path: Path,
        prompt_file: Path,
        output_path: Path,
        work_dir: Path,
        speaker_name: str,
        speaker_audio_path: Optional[Path],
        speaker_names: List[str],
        speaker_audio_paths: List[Path],
        checkpoint_path: str,
        cfg_scale: float,
        ddpm_steps: int,
        device: str,
        seed: Optional[int],
        attn_implementation: str,
        inference_steps: int,
        max_length_times: float,
        max_new_tokens: int,
        disable_prefill: bool,
        show_progress: bool,
        extra_args: List[str],
    ) -> List[str]:
        if profile in {"tts_15b", "tts_7b"}:
            script = self.repo_root / "scripts" / "run_vibevoice_tts_15b.py"
            default_steps = "12" if profile == "tts_7b" else os.getenv("VIBEVOICE_TTS_15B_INFERENCE_STEPS", "10")
            command = [
                self.python_executable,
                str(script),
                "--repo-root",
                str(self.vendor_root),
                "--model-path",
                str(model_path),
                "--txt-path",
                str(prompt_file),
                "--output",
                str(output_path),
                "--speaker-names",
                *(speaker_names or [speaker_name]),
                "--cfg-scale",
                str(cfg_scale),
                "--checkpoint-path",
                checkpoint_path,
                "--inference-steps",
                str(inference_steps or int(os.getenv("VIBEVOICE_TTS_7B_INFERENCE_STEPS", default_steps))),
                "--max-length-times",
                str(max_length_times),
                "--max-new-tokens",
                str(max_new_tokens),
            ]
            audio_paths = speaker_audio_paths or ([speaker_audio_path] if speaker_audio_path else [])
            if audio_paths:
                command.append("--speaker-audio")
                command.extend(str(path) for path in audio_paths if path)
            if device and device != "auto":
                command.extend(["--device", device])
            if attn_implementation and attn_implementation != "auto":
                command.extend(["--attn-implementation", attn_implementation])
            if seed is not None:
                command.extend(["--seed", str(seed)])
            if disable_prefill:
                command.append("--disable-prefill")
            if show_progress:
                command.append("--show-progress")
            command.extend(extra_args)
            return command
        else:
            script = self.vendor_root / "demo" / "streaming_inference_from_file.py"
            if not script.exists():
                raise VibeVoiceError(f"Realtime VibeVoice TTS entrypoint not found: {script}")

        command = [
            self.python_executable,
            str(script),
            "--model_path",
            str(model_path),
            "--txt_path",
            str(prompt_file),
            "--speaker_name",
            speaker_name,
            "--output_dir",
            str(work_dir),
            "--cfg_scale",
            str(cfg_scale),
            "--ddpm_steps",
            str(ddpm_steps),
        ]
        if device and device != "auto":
            command.extend(["--device", device])
        if seed is not None:
            command.extend(["--seed", str(seed)])
        command.extend(extra_args)
        return command
