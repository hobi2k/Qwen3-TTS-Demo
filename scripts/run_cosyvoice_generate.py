#!/usr/bin/env python3
"""Run a single CosyVoice 3 inference request in an isolated process.

The FastAPI backend invokes this script with a dedicated CosyVoice Python
executable (typically ``.venv-cosyvoice3/bin/python``) so the main web worker
never imports the heavy CosyVoice + Matcha-TTS stack. The contract mirrors
``run_ace_step_generate.py``:

* ``--request-json`` points to a JSON file describing one request.
* ``--output-path`` is the .wav file the caller wants to receive.
* ``--cosyvoice-root`` is the CosyVoice source checkout.
* ``--model-dir`` is the local pretrained model directory.

Supported tasks (``task`` field in the request JSON):

* ``zero_shot``      – clone the voice in ``prompt_audio_path`` to read ``text``;
                       ``prompt_text`` is the transcript of the reference audio.
* ``cross_lingual``  – read ``text`` (any of the supported languages, including
                       Korean) in the voice from ``prompt_audio_path``; supports
                       fine-grained tags like ``[laughter]``, ``[breath]``.
* ``instruct2``      – natural-language style control via ``instruct_text``
                       (CosyVoice 2/3 ``inference_instruct2`` API).
* ``sft``            – use a built-in speaker preset (legacy CosyVoice 1
                       compatibility for ``CosyVoice-300M-SFT`` style models).
* ``vc``             – voice conversion: read ``source_audio_path`` in the
                       voice from ``prompt_audio_path``.

The script writes one WAV file at ``--output-path`` and a companion
``<output_path>.meta.json`` so the backend can attach the metadata to the
generation record.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


SUPPORTED_TASKS = {"zero_shot", "cross_lingual", "instruct2", "sft", "vc"}


def _coerce_optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _coerce_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return default


def _require(payload: Dict[str, Any], key: str) -> Any:
    value = payload.get(key)
    if value in (None, ""):
        raise ValueError(f"Missing required field: {key}")
    return value


def _resolve_existing_path(payload: Dict[str, Any], key: str, required: bool) -> Optional[str]:
    value = payload.get(key)
    if not value:
        if required:
            raise ValueError(f"Missing required audio path: {key}")
        return None
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"{key} not found: {path}")
    return str(path)


def _load_model(model_dir: Path):
    """Instantiate CosyVoice's AutoModel for the given checkpoint directory."""

    sys.path.insert(0, str(Path.cwd() / "third_party" / "Matcha-TTS"))
    from cosyvoice.cli.cosyvoice import AutoModel  # type: ignore

    return AutoModel(model_dir=str(model_dir))


def _run_task(
    *,
    task: str,
    payload: Dict[str, Any],
    output_path: Path,
    model_dir: Path,
) -> Dict[str, Any]:
    import torch  # noqa: F401  - imported lazily for clearer error if missing
    import torchaudio  # type: ignore

    if task not in SUPPORTED_TASKS:
        raise ValueError(f"Unsupported task: {task}")

    text = _require(payload, "text")
    stream = _coerce_bool(payload.get("stream"), default=False)
    seed = _coerce_optional_int(payload.get("seed"))
    if seed is not None:
        try:
            torch.manual_seed(seed)
        except Exception:
            pass

    model = _load_model(model_dir)
    sample_rate = int(getattr(model, "sample_rate", 24000))

    chunks = []
    iterator = None
    if task == "zero_shot":
        prompt_text = _require(payload, "prompt_text")
        prompt_audio = _resolve_existing_path(payload, "prompt_audio_path", required=True)
        zero_shot_spk_id = payload.get("zero_shot_spk_id") or ""
        iterator = model.inference_zero_shot(
            text,
            prompt_text,
            prompt_audio,
            zero_shot_spk_id=zero_shot_spk_id,
            stream=stream,
        )
    elif task == "cross_lingual":
        prompt_audio = _resolve_existing_path(payload, "prompt_audio_path", required=True)
        iterator = model.inference_cross_lingual(
            text,
            prompt_audio,
            stream=stream,
        )
    elif task == "instruct2":
        prompt_audio = _resolve_existing_path(payload, "prompt_audio_path", required=True)
        instruct_text = _require(payload, "instruct_text")
        iterator = model.inference_instruct2(
            text,
            instruct_text,
            prompt_audio,
            stream=stream,
        )
    elif task == "sft":
        spk_id = _require(payload, "speaker")
        iterator = model.inference_sft(text, spk_id, stream=stream)
    elif task == "vc":
        source_audio = _resolve_existing_path(payload, "source_audio_path", required=True)
        prompt_audio = _resolve_existing_path(payload, "prompt_audio_path", required=True)
        iterator = model.inference_vc(source_audio, prompt_audio, stream=stream)

    if iterator is None:
        raise RuntimeError(f"No iterator produced for task: {task}")

    for chunk in iterator:
        speech = chunk.get("tts_speech") if isinstance(chunk, dict) else None
        if speech is None:
            continue
        chunks.append(speech)

    if not chunks:
        raise RuntimeError("CosyVoice returned no audio chunks.")

    import torch

    waveform = torch.cat([c.detach().cpu() if hasattr(c, "detach") else c for c in chunks], dim=-1)
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(output_path), waveform, sample_rate)

    duration = float(waveform.shape[-1]) / float(sample_rate)
    return {
        "engine": "cosyvoice3",
        "task": task,
        "sample_rate": sample_rate,
        "duration_seconds": duration,
        "model_dir": str(model_dir),
        "stream": stream,
        "seed": seed,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-json", required=True, type=Path)
    parser.add_argument("--output-path", required=True, type=Path)
    parser.add_argument("--cosyvoice-root", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    request_path = args.request_json.expanduser().resolve()
    output_path = args.output_path.expanduser().resolve()
    cosyvoice_root = args.cosyvoice_root.expanduser().resolve()
    model_dir = args.model_dir.expanduser().resolve()
    meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")

    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
    except Exception as exc:
        meta_path.write_text(
            json.dumps({"error": f"Failed to read request JSON: {exc}"}, indent=2),
            encoding="utf-8",
        )
        print(f"Failed to read request JSON: {exc}", file=sys.stderr)
        return 2

    os.chdir(cosyvoice_root)
    if not model_dir.exists():
        meta_path.write_text(
            json.dumps({"error": f"Model directory not found: {model_dir}"}, indent=2),
            encoding="utf-8",
        )
        print(f"Model directory not found: {model_dir}", file=sys.stderr)
        return 3

    task = payload.get("task") or "zero_shot"
    try:
        meta = _run_task(
            task=task,
            payload=payload,
            output_path=output_path,
            model_dir=model_dir,
        )
    except Exception as exc:
        meta_path.write_text(
            json.dumps(
                {
                    "error": str(exc),
                    "task": task,
                    "traceback": traceback.format_exc(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"CosyVoice generation failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    meta["request_payload"] = payload
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CosyVoice generation done: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
