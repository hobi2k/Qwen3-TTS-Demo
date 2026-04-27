#!/usr/bin/env python3
"""Run a single ACE-Step-1.5 request in an isolated process.

The FastAPI backend invokes this script with a dedicated ACE-Step Python
executable (typically ``.venv-ace-step/bin/python``) so the Qwen TTS web
worker never imports the heavy music model stack. The contract is:

* ``--request-json`` points to a JSON file describing one request.
* ``--output-path`` is the audio file the caller wants to receive.
* ``--ace-step-root`` is the ACE-Step-1.5 source checkout.
* ``--checkpoint-path`` is the directory used as ``ACESTEP_CHECKPOINTS_DIR``.

The request JSON has a ``task`` field. Supported values:

* ``text2music`` (default) – pure prompt+lyrics generation
* ``cover``                – style transfer / cover from ``src_audio``
* ``repaint``              – selective regeneration in [start,end)
* ``extend``               – continuation of ``src_audio`` (alias for
  ``complete`` with ``complete_tracks`` defaulting to all tracks)
* ``extract``              – isolate a single track (``extract_track``)
* ``lego``                 – build one new track on top of ``src_audio``
* ``complete``             – fill in missing tracks (``complete_tracks``)
* ``understand``           – LM-only audio analysis (caption/BPM/lyrics)
* ``create_sample``        – LM-only "Inspiration Mode" (NL → metadata)
* ``format_sample``        – LM-only structuring of caption+lyrics

The script writes one audio file at ``--output-path`` (when applicable)
plus a ``<output_path>.meta.json`` companion file with the full result
metadata so the backend can attach it to the generation record.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional


def _coerce_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _parse_seeds(raw: Any) -> Optional[List[int]]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        out: List[int] = []
        for item in raw:
            try:
                out.append(int(item))
            except (TypeError, ValueError):
                continue
        return out or None
    if isinstance(raw, (int, float)):
        return [int(raw)]
    if isinstance(raw, str):
        out: List[int] = []
        for part in raw.replace(";", ",").split(","):
            part = part.strip()
            if not part:
                continue
            try:
                out.append(int(part))
            except ValueError:
                continue
        return out or None
    return None


def _parse_timesteps(raw: Any) -> Optional[List[float]]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        return [float(v) for v in raw if v is not None]
    if isinstance(raw, str):
        cleaned = raw.strip().strip("[]")
        out: List[float] = []
        for part in cleaned.replace(";", ",").split(","):
            part = part.strip()
            if not part:
                continue
            try:
                out.append(float(part))
            except ValueError:
                continue
        return out or None
    return None


def _resolve_audio_path(payload: Dict[str, Any], key: str) -> Optional[str]:
    value = payload.get(key)
    if not value:
        return None
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"{key} not found: {path}")
    return str(path)


def _newest_audio_below(directory: Path) -> Optional[Path]:
    if not directory.exists():
        return None
    audio_exts = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
    candidates = [
        path
        for path in directory.rglob("*")
        if path.is_file() and path.suffix.lower() in audio_exts
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def _select_skip_lm(task: str, payload: Dict[str, Any]) -> bool:
    skip_tasks = {"cover", "cover-nofsq", "repaint", "extract"}
    if task in skip_tasks:
        return True
    return bool(payload.get("skip_lm", False))


def _build_generation_params(payload: Dict[str, Any], task: str):
    from acestep.inference import GenerationParams

    audio_codes = payload.get("audio_codes", "") or ""
    timesteps = _parse_timesteps(payload.get("timesteps"))
    duration = _coerce_optional_float(payload.get("duration"))
    if duration is None:
        duration = _coerce_optional_float(payload.get("audio_duration"))
    duration_value = duration if duration is not None else -1.0
    bpm = _coerce_optional_int(payload.get("bpm"))
    seed_value = _coerce_optional_int(payload.get("seed"))

    params = GenerationParams(
        task_type=task,
        instruction=payload.get("instruction") or GenerationParams.instruction,
        reference_audio=_resolve_audio_path(payload, "reference_audio"),
        src_audio=_resolve_audio_path(payload, "src_audio"),
        audio_codes=audio_codes,
        caption=payload.get("caption") or payload.get("prompt") or "",
        global_caption=payload.get("global_caption", ""),
        lyrics=payload.get("lyrics", "") or "",
        instrumental=bool(payload.get("instrumental", False)),
        vocal_language=payload.get("vocal_language", "unknown") or "unknown",
        bpm=bpm,
        keyscale=payload.get("keyscale", "") or "",
        timesignature=payload.get("timesignature", "") or "",
        duration=duration_value,
        enable_normalization=bool(payload.get("enable_normalization", True)),
        normalization_db=float(payload.get("normalization_db", -1.0)),
        fade_in_duration=float(payload.get("fade_in_duration", 0.0)),
        fade_out_duration=float(payload.get("fade_out_duration", 0.0)),
        latent_shift=float(payload.get("latent_shift", 0.0)),
        latent_rescale=float(payload.get("latent_rescale", 1.0)),
        inference_steps=int(payload.get("inference_steps", payload.get("infer_step", 8))),
        seed=seed_value if seed_value is not None else -1,
        guidance_scale=float(payload.get("guidance_scale", 7.0)),
        use_adg=bool(payload.get("use_adg", False)),
        cfg_interval_start=float(payload.get("cfg_interval_start", 0.0)),
        cfg_interval_end=float(payload.get("cfg_interval_end", 1.0)),
        shift=float(payload.get("shift", 1.0)),
        infer_method=str(payload.get("infer_method", "ode")),
        sampler_mode=str(payload.get("sampler_mode", "euler")),
        velocity_norm_threshold=float(payload.get("velocity_norm_threshold", 0.0)),
        velocity_ema_factor=float(payload.get("velocity_ema_factor", 0.0)),
        dcw_enabled=bool(payload.get("dcw_enabled", True)),
        dcw_mode=str(payload.get("dcw_mode", "double")),
        dcw_scaler=float(payload.get("dcw_scaler", 0.05)),
        dcw_high_scaler=float(payload.get("dcw_high_scaler", 0.02)),
        dcw_wavelet=str(payload.get("dcw_wavelet", "haar")),
        timesteps=timesteps,
        repainting_start=float(payload.get("repainting_start", 0.0)),
        repainting_end=float(payload.get("repainting_end", -1.0)),
        chunk_mask_mode=str(payload.get("chunk_mask_mode", "auto")),
        repaint_latent_crossfade_frames=int(payload.get("repaint_latent_crossfade_frames", 10)),
        repaint_wav_crossfade_sec=float(payload.get("repaint_wav_crossfade_sec", 0.0)),
        repaint_mode=str(payload.get("repaint_mode", "balanced")),
        repaint_strength=float(payload.get("repaint_strength", 0.5)),
        audio_cover_strength=float(payload.get("audio_cover_strength", 1.0)),
        cover_noise_strength=float(payload.get("cover_noise_strength", 0.0)),
        thinking=bool(payload.get("thinking", True)),
        lm_temperature=float(payload.get("lm_temperature", 0.85)),
        lm_cfg_scale=float(payload.get("lm_cfg_scale", 2.0)),
        lm_top_k=int(payload.get("lm_top_k", 0)),
        lm_top_p=float(payload.get("lm_top_p", 0.9)),
        lm_negative_prompt=str(payload.get("lm_negative_prompt", "NO USER INPUT")),
        use_cot_metas=bool(payload.get("use_cot_metas", True)),
        use_cot_caption=bool(payload.get("use_cot_caption", True)),
        use_cot_lyrics=bool(payload.get("use_cot_lyrics", False)),
        use_cot_language=bool(payload.get("use_cot_language", True)),
        use_constrained_decoding=bool(payload.get("use_constrained_decoding", True)),
    )

    if task in {"lego", "extract", "complete"}:
        instruction = payload.get("instruction") or ""
        if not instruction:
            from acestep.constants import TASK_INSTRUCTIONS

            if task == "lego":
                track = (payload.get("lego_track") or "").strip().upper()
                instruction = (
                    TASK_INSTRUCTIONS["lego"].format(TRACK_NAME=track)
                    if track
                    else TASK_INSTRUCTIONS["lego_default"]
                )
            elif task == "extract":
                track = (payload.get("extract_track") or "").strip().upper()
                instruction = (
                    TASK_INSTRUCTIONS["extract"].format(TRACK_NAME=track)
                    if track
                    else TASK_INSTRUCTIONS["extract_default"]
                )
            elif task == "complete":
                tracks_csv = payload.get("complete_tracks") or "vocals,drums,bass,guitar"
                tracks = [t.strip().upper() for t in str(tracks_csv).split(",") if t.strip()]
                instruction = (
                    TASK_INSTRUCTIONS["complete"].format(TRACK_CLASSES=", ".join(tracks))
                    if tracks
                    else TASK_INSTRUCTIONS["complete_default"]
                )
        params.instruction = instruction

    if task == "extend":
        params.task_type = "complete"

    return params


def _build_generation_config(payload: Dict[str, Any]):
    from acestep.inference import GenerationConfig

    seeds = _parse_seeds(payload.get("seeds"))
    if seeds is None:
        seeds = _parse_seeds(payload.get("manual_seeds"))
    batch_size = int(payload.get("batch_size", 1) or 1)
    if seeds:
        batch_size = max(batch_size, len(seeds))

    return GenerationConfig(
        batch_size=batch_size,
        allow_lm_batch=bool(payload.get("allow_lm_batch", False)),
        use_random_seed=bool(payload.get("use_random_seed", seeds is None)),
        seeds=seeds,
        lm_batch_chunk_size=int(payload.get("lm_batch_chunk_size", 8)),
        constrained_decoding_debug=bool(payload.get("constrained_decoding_debug", False)),
        audio_format=str(payload.get("audio_format", "wav")),
        mp3_bitrate=str(payload.get("mp3_bitrate", "128k")),
        mp3_sample_rate=int(payload.get("mp3_sample_rate", 48000)),
    )


def _initialize_dit_handler(payload: Dict[str, Any], project_root: str):
    from acestep.handler import AceStepHandler

    handler = AceStepHandler()
    config_path = payload.get("config_path") or payload.get("model_variant")
    if not config_path:
        available = handler.get_available_acestep_v15_models()
        config_path = "acestep-v15-turbo" if "acestep-v15-turbo" in available else (available[0] if available else "acestep-v15-turbo")

    device = str(payload.get("device", "auto"))
    use_flash_attention = payload.get("use_flash_attention")
    if use_flash_attention is None:
        try:
            use_flash_attention = handler.is_flash_attention_available(device)
        except Exception:
            use_flash_attention = False

    handler.initialize_service(
        project_root=project_root,
        config_path=config_path,
        device=device,
        use_flash_attention=bool(use_flash_attention),
        compile_model=bool(payload.get("compile_model", False)),
        offload_to_cpu=bool(payload.get("cpu_offload", False)),
        offload_dit_to_cpu=bool(payload.get("offload_dit_to_cpu", False)),
        quantization=payload.get("quantization") or None,
        vae_checkpoint=payload.get("vae_checkpoint") or None,
    )

    for lora in payload.get("loras") or []:
        path = lora.get("path") if isinstance(lora, dict) else lora
        if not path:
            continue
        adapter_name = lora.get("adapter_name") if isinstance(lora, dict) else None
        scale = lora.get("scale") if isinstance(lora, dict) else None
        message = handler.add_lora(path, adapter_name=adapter_name)
        if message.startswith("❌"):
            raise RuntimeError(f"LoRA load failed: {message}")
        if scale is not None and adapter_name:
            handler.set_lora_scale(adapter_name, float(scale))
        elif scale is not None:
            handler.set_lora_scale(float(scale))

    return handler, config_path


def _initialize_lm_handler(payload: Dict[str, Any], project_root: str, checkpoint_path: Path, requires_lm: bool):
    from acestep.llm_inference import LLMHandler

    llm_handler = LLMHandler()
    if not requires_lm:
        return llm_handler

    lm_model_path = payload.get("lm_model_path")
    if not lm_model_path:
        available = llm_handler.get_available_5hz_lm_models()
        if not available:
            from acestep.model_downloader import ensure_lm_model

            success, msg = ensure_lm_model(checkpoints_dir=checkpoint_path)
            if not success:
                raise RuntimeError(msg)
            available = llm_handler.get_available_5hz_lm_models()
        if not available:
            raise RuntimeError("No 5Hz LM models available after auto-download.")
        lm_model_path = available[0]

    backend = str(payload.get("lm_backend", "")).strip() or None
    if not backend:
        try:
            from acestep.gpu_config import is_mps_platform

            backend = "mlx" if is_mps_platform() else "vllm"
        except Exception:
            backend = "vllm"

    llm_handler.initialize(
        checkpoint_dir=str(checkpoint_path),
        lm_model_path=lm_model_path,
        backend=backend,
        device=str(payload.get("device", "auto")),
        offload_to_cpu=bool(payload.get("cpu_offload", False)),
        dtype=None,
    )
    return llm_handler


def _validate_task(payload: Dict[str, Any], task: str) -> None:
    needs_src = {"cover", "repaint", "lego", "extract", "complete", "extend"}
    if task in needs_src and not payload.get("src_audio"):
        raise ValueError(f"task '{task}' requires src_audio")

    if task in {"cover", "repaint", "lego", "complete", "extend"} and not (payload.get("caption") or payload.get("prompt")):
        raise ValueError(f"task '{task}' requires a caption/prompt")

    if task == "text2music":
        if not (payload.get("caption") or payload.get("prompt")) and not payload.get("lyrics"):
            raise ValueError("text2music requires caption or lyrics")

    if task == "repaint":
        end = float(payload.get("repainting_end", -1.0))
        start = float(payload.get("repainting_start", 0.0))
        if end != -1.0 and end <= start:
            raise ValueError("repainting_end must be > repainting_start (or -1)")


def _maybe_promote_audio(out_dir: Path, output_path: Path) -> None:
    if output_path.exists():
        return
    fallback = _newest_audio_below(out_dir)
    if fallback is not None and fallback != output_path:
        shutil.copy2(fallback, output_path)


def _serialize_audios(audios: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    serial: List[Dict[str, Any]] = []
    for item in audios:
        info = {
            "path": item.get("path", ""),
            "key": item.get("key", ""),
            "sample_rate": item.get("sample_rate"),
        }
        params = item.get("params") or {}
        info["seed"] = params.get("seed")
        info["duration"] = params.get("audio_duration") or params.get("duration")
        serial.append(info)
    return serial


def _write_meta(output_path: Path, meta: Dict[str, Any]) -> None:
    meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _run_understand(payload: Dict[str, Any], output_path: Path, project_root: str, checkpoint_path: Path) -> int:
    from acestep.handler import AceStepHandler
    from acestep.inference import understand_music

    src_audio = _resolve_audio_path(payload, "src_audio")
    if not src_audio:
        raise ValueError("understand requires src_audio")

    audio_codes_raw = payload.get("audio_codes") or ""
    if not audio_codes_raw:
        dit_handler = AceStepHandler()
        dit_handler.initialize_service(
            project_root=project_root,
            config_path=payload.get("config_path") or "acestep-v15-base",
            device=str(payload.get("device", "auto")),
            use_flash_attention=bool(payload.get("use_flash_attention", False)),
            compile_model=False,
            offload_to_cpu=bool(payload.get("cpu_offload", False)),
            offload_dit_to_cpu=False,
        )
        try:
            audio_codes_raw = dit_handler.audio_to_codes(src_audio)  # type: ignore[attr-defined]
        except Exception as exc:
            raise RuntimeError(
                "ACE-Step DiT handler does not expose audio-to-codes; cannot understand audio without precomputed codes."
            ) from exc

    llm_handler = _initialize_lm_handler(payload, project_root, checkpoint_path, requires_lm=True)
    result = understand_music(
        llm_handler,
        audio_codes=str(audio_codes_raw),
        temperature=float(payload.get("lm_temperature", 0.85)),
        top_k=_coerce_optional_int(payload.get("lm_top_k")) or 0,
        top_p=_coerce_optional_float(payload.get("lm_top_p")),
        repetition_penalty=float(payload.get("repetition_penalty", 1.0)),
    )

    _write_meta(output_path, {"task": "understand", "result": result.to_dict()})
    return 0 if result.success else 2


def _run_create_sample(payload: Dict[str, Any], output_path: Path, project_root: str, checkpoint_path: Path) -> int:
    from acestep.inference import create_sample

    llm_handler = _initialize_lm_handler(payload, project_root, checkpoint_path, requires_lm=True)
    result = create_sample(
        llm_handler,
        query=str(payload.get("query") or payload.get("caption") or "NO USER INPUT"),
        instrumental=bool(payload.get("instrumental", False)),
        vocal_language=payload.get("vocal_language") or None,
        temperature=float(payload.get("lm_temperature", 0.85)),
        top_k=_coerce_optional_int(payload.get("lm_top_k")) or 0,
        top_p=_coerce_optional_float(payload.get("lm_top_p")),
    )
    _write_meta(output_path, {"task": "create_sample", "result": result.to_dict()})
    return 0 if result.success else 2


def _run_format_sample(payload: Dict[str, Any], output_path: Path, project_root: str, checkpoint_path: Path) -> int:
    from acestep.inference import format_sample

    llm_handler = _initialize_lm_handler(payload, project_root, checkpoint_path, requires_lm=True)
    user_metadata = {
        key: value
        for key, value in {
            "bpm": _coerce_optional_int(payload.get("bpm")),
            "duration": _coerce_optional_float(payload.get("duration") or payload.get("audio_duration")),
            "keyscale": payload.get("keyscale"),
            "timesignature": payload.get("timesignature"),
            "language": payload.get("vocal_language"),
        }.items()
        if value not in (None, "", "unknown")
    }
    result = format_sample(
        llm_handler,
        caption=str(payload.get("caption") or payload.get("prompt") or ""),
        lyrics=str(payload.get("lyrics") or ""),
        user_metadata=user_metadata or None,
        temperature=float(payload.get("lm_temperature", 0.85)),
        top_k=_coerce_optional_int(payload.get("lm_top_k")) or 0,
        top_p=_coerce_optional_float(payload.get("lm_top_p")),
    )
    _write_meta(output_path, {"task": "format_sample", "result": result.to_dict()})
    return 0 if result.success else 2


def _run_generation(payload: Dict[str, Any], output_path: Path, project_root: str, checkpoint_path: Path) -> int:
    task = (payload.get("task") or payload.get("task_type") or "text2music").strip()
    _validate_task(payload, task)

    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    requires_lm = not _select_skip_lm(task, payload) and any(
        bool(payload.get(flag, default))
        for flag, default in [
            ("thinking", True),
            ("use_cot_caption", True),
            ("use_cot_metas", True),
            ("use_cot_language", True),
            ("use_cot_lyrics", False),
        ]
    )

    dit_handler, resolved_config = _initialize_dit_handler(payload, project_root)
    llm_handler = _initialize_lm_handler(payload, project_root, checkpoint_path, requires_lm=requires_lm)

    params = _build_generation_params(payload, task)
    config = _build_generation_config(payload)

    from acestep.inference import generate_music

    result = generate_music(
        dit_handler,
        llm_handler,
        params,
        config,
        save_dir=str(out_dir),
    )

    if not result.success:
        meta = {
            "task": task,
            "config_path": resolved_config,
            "status_message": result.status_message,
            "error": result.error,
        }
        _write_meta(output_path, meta)
        raise RuntimeError(result.error or result.status_message or "ACE-Step generation failed")

    audios = result.audios or []
    if audios and audios[0].get("path"):
        first_path = Path(audios[0]["path"])
        if first_path.exists() and first_path.resolve() != output_path.resolve():
            shutil.copy2(first_path, output_path)
    _maybe_promote_audio(out_dir, output_path)

    if not output_path.exists():
        raise RuntimeError(f"ACE-Step completed but no audio file was found for {output_path}")

    _write_meta(
        output_path,
        {
            "task": task,
            "config_path": resolved_config,
            "status_message": result.status_message,
            "audios": _serialize_audios(audios),
            "extra_outputs": {
                "time_costs": result.extra_outputs.get("time_costs", {}),
                "lm_metadata": result.extra_outputs.get("lm_metadata"),
            },
        },
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ACE-Step-1.5 generation in a subprocess.")
    parser.add_argument("--request-json", required=True)
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--ace-step-root", required=True)
    parser.add_argument("--checkpoint-path", required=True)
    args = parser.parse_args()

    request_path = Path(args.request_json).expanduser().resolve()
    output_path = Path(args.output_path).expanduser().resolve()
    ace_step_root = Path(args.ace_step_root).expanduser().resolve()
    checkpoint_path = Path(args.checkpoint_path).expanduser().resolve()

    sys.path.insert(0, str(ace_step_root))
    os.environ.setdefault("ACESTEP_PROJECT_ROOT", str(ace_step_root))
    os.environ["ACESTEP_CHECKPOINTS_DIR"] = str(checkpoint_path)
    checkpoint_path.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.loads(request_path.read_text(encoding="utf-8"))
    task = (payload.get("task") or payload.get("task_type") or "text2music").strip()
    project_root = str(ace_step_root)

    try:
        if task == "understand":
            return _run_understand(payload, output_path, project_root, checkpoint_path)
        if task == "create_sample":
            return _run_create_sample(payload, output_path, project_root, checkpoint_path)
        if task == "format_sample":
            return _run_format_sample(payload, output_path, project_root, checkpoint_path)
        return _run_generation(payload, output_path, project_root, checkpoint_path)
    except Exception as exc:
        traceback.print_exc()
        meta_path = output_path.with_suffix(output_path.suffix + ".meta.json")
        try:
            meta_path.write_text(
                json.dumps(
                    {"task": task, "error": str(exc), "traceback": traceback.format_exc()},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
