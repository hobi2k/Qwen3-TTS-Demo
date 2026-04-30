#!/usr/bin/env python3
"""Run VibeVoice 1.5B long-form TTS.

Microsoft's current VibeVoice checkout publishes the 1.5B weights but may omit
the old long-form inference module. This helper loads that module from the
vendor checkout when present, otherwise from this app's compatibility patch.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import re
import sys
import time
import traceback
from pathlib import Path
from typing import List, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VibeVoice 1.5B TTS helper")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--txt-path", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--speaker-names", nargs="+", default=["Speaker 1"])
    parser.add_argument("--speaker-audio", nargs="*", default=[])
    parser.add_argument("--cfg-scale", type=float, default=1.3)
    parser.add_argument("--inference-steps", type=int, default=10)
    parser.add_argument("--max-length-times", type=float, default=2.0)
    parser.add_argument("--max-new-tokens", type=int, default=0)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--attn-implementation", default="auto")
    parser.add_argument("--disable-prefill", action="store_true")
    parser.add_argument("--show-progress", action="store_true")
    return parser.parse_args()


def normalize_device(value: str) -> str:
    if value and value != "auto":
        return "mps" if value.lower() == "mpx" else value
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def repo_demo_voices(repo_root: Path) -> List[Path]:
    voices_dir = repo_root / "demo" / "voices"
    if not voices_dir.exists():
        return []
    return sorted(
        [
            path
            for path in voices_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}
        ]
    )


def format_script(text: str, speaker_names: List[str]) -> str:
    text = text.strip().replace("’", "'").replace("“", '"').replace("”", '"')
    if re.search(r"^Speaker\s+\d+\s*:", text, flags=re.IGNORECASE | re.MULTILINE):
        return text
    name_to_index = {name.strip().lower(): index + 1 for index, name in enumerate(speaker_names) if name.strip()}
    converted_lines = []
    for line in [line.strip() for line in text.splitlines() if line.strip()]:
        match = re.match(r"^([^:]{1,80})\s*:\s*(.+)$", line)
        if match and match.group(1).strip().lower() in name_to_index:
            converted_lines.append(f"Speaker {name_to_index[match.group(1).strip().lower()]}: {match.group(2).strip()}")
        else:
            converted_lines.append(line)
    text = "\n".join(converted_lines)
    if re.search(r"^Speaker\s+\d+\s*:", text, flags=re.IGNORECASE | re.MULTILINE):
        return text
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("Input text is empty")
    return "\n".join(f"Speaker 1: {line}" for line in lines)


def load_inference_module(project_root: Path) -> None:
    try:
        import vibevoice.modular.modeling_vibevoice_inference  # noqa: F401

        return
    except Exception:
        pass

    patch_file = project_root / "app" / "backend" / "app" / "vendor_patches" / "vibevoice" / "modeling_vibevoice_inference.py"
    if not patch_file.exists():
        raise RuntimeError(f"VibeVoice 1.5B inference module not found and patch file is missing: {patch_file}")
    spec = importlib.util.spec_from_file_location("vibevoice.modular.modeling_vibevoice_inference", patch_file)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load VibeVoice 1.5B inference patch: {patch_file}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["vibevoice.modular.modeling_vibevoice_inference"] = module
    spec.loader.exec_module(module)


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    project_root = Path(__file__).resolve().parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    load_inference_module(project_root)

    import torch
    from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference
    from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor

    device = normalize_device(args.device)
    if device == "mps" and not torch.backends.mps.is_available():
        device = "cpu"
    if args.seed is not None:
        torch.manual_seed(args.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(args.seed)

    raw_text = Path(args.txt_path).read_text(encoding="utf-8")
    script = format_script(raw_text, args.speaker_names)
    script_path = Path(args.txt_path)
    script_path.write_text(script, encoding="utf-8")

    voice_samples: Optional[List[str]] = None
    if args.speaker_audio:
        voice_samples = [str(Path(item).expanduser()) for item in args.speaker_audio if item]
    elif not args.disable_prefill:
        presets = repo_demo_voices(repo_root)
        if presets:
            voice_samples = [str(presets[0])]

    voice_cloning = bool(voice_samples) and not args.disable_prefill
    load_dtype = torch.float32 if device in {"mps", "cpu"} else torch.bfloat16
    attn_impl = args.attn_implementation
    if attn_impl == "auto":
        attn_impl = "flash_attention_2" if device == "cuda" else "sdpa"

    print(f"Loading VibeVoice 1.5B processor from {args.model_path}")
    processor = VibeVoiceProcessor.from_pretrained(args.model_path)
    print(f"Loading VibeVoice 1.5B model on {device} with {attn_impl}")
    try:
        if device == "mps":
            model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                args.model_path,
                torch_dtype=load_dtype,
                attn_implementation=attn_impl,
                device_map=None,
            )
            model.to("mps")
        else:
            model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                args.model_path,
                torch_dtype=load_dtype,
                attn_implementation=attn_impl,
                device_map=device,
            )
    except Exception as exc:
        if attn_impl == "flash_attention_2":
            print(f"flash_attention_2 load failed: {exc}")
            print(traceback.format_exc())
            model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                args.model_path,
                torch_dtype=load_dtype,
                attn_implementation="sdpa",
                device_map=device if device != "mps" else None,
            )
            if device == "mps":
                model.to("mps")
        else:
            raise

    model.eval()
    if hasattr(model, "set_ddpm_inference_steps"):
        model.set_ddpm_inference_steps(num_steps=args.inference_steps)

    processor_kwargs = {
        "text": [script],
        "padding": True,
        "return_tensors": "pt",
        "return_attention_mask": True,
    }
    if voice_cloning:
        processor_kwargs["voice_samples"] = [voice_samples]
    inputs = processor(**processor_kwargs)
    target_device = device if device in {"cuda", "mps"} else "cpu"
    for key, value in inputs.items():
        if torch.is_tensor(value):
            inputs[key] = value.to(target_device)

    print(f"Starting VibeVoice 1.5B generation; voice_cloning={voice_cloning}, cfg_scale={args.cfg_scale}")
    started_at = time.time()
    outputs = model.generate(
        **inputs,
        max_new_tokens=args.max_new_tokens if args.max_new_tokens > 0 else None,
        cfg_scale=args.cfg_scale,
        tokenizer=processor.tokenizer,
        generation_config={"do_sample": False},
        verbose=True,
        show_progress_bar=args.show_progress,
        max_length_times=args.max_length_times,
        is_prefill=voice_cloning,
    )
    elapsed = time.time() - started_at
    if not outputs.speech_outputs or outputs.speech_outputs[0] is None:
        raise RuntimeError("VibeVoice 1.5B generation completed without speech output")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    processor.save_audio(outputs.speech_outputs[0], output_path=str(output_path))
    print(f"Saved output to {output_path}")
    print(f"Generation time: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
