#!/usr/bin/env python3
"""Run live HTTP end-to-end checks against the Voice Studio backend.

This is intentionally not a unit test. It starts the FastAPI app through
uvicorn, calls the same HTTP routes that the frontend uses, and records whether
each product surface is usable with the currently installed local assets.
Heavy generators are opt-in so the basic verification can be run frequently
without unexpectedly loading every model at once.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from process_utils import popen_process_group, terminate_process_group, venv_python


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "app" / "backend"
PYTHON = venv_python(REPO_ROOT)
SAMPLE_AUDIO = REPO_ROOT / "data" / "e2e" / "live_input.wav"
SAMPLE_LONG_AUDIO = REPO_ROOT / "data" / "e2e" / "live_input_12s.wav"
BACKEND_LOG = REPO_ROOT / "data" / "runtime" / "live-e2e-backend.log"


@dataclass
class CheckResult:
    """One live check result."""

    name: str
    status: str
    detail: str = ""


def find_free_port() -> int:
    """Reserve a currently free localhost port."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def ensure_sample_audio() -> Path:
    """Create a short valid WAV file for audio-tool smoke checks."""

    if SAMPLE_AUDIO.exists():
        return SAMPLE_AUDIO
    SAMPLE_AUDIO.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 24_000
    duration_sec = 1.0
    frames = int(sample_rate * duration_sec)
    with wave.open(str(SAMPLE_AUDIO), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(frames):
            value = int(0.18 * 32767 * math.sin(2.0 * math.pi * 440.0 * index / sample_rate))
            wav.writeframesraw(value.to_bytes(2, byteorder="little", signed=True))
    return SAMPLE_AUDIO


def ensure_long_sample_audio() -> Path:
    """Create a longer WAV file for tools that reject very short clips."""

    if SAMPLE_LONG_AUDIO.exists():
        return SAMPLE_LONG_AUDIO
    SAMPLE_LONG_AUDIO.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 24_000
    duration_sec = 12.0
    frames = int(sample_rate * duration_sec)
    with wave.open(str(SAMPLE_LONG_AUDIO), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(frames):
            carrier = math.sin(2.0 * math.pi * 220.0 * index / sample_rate)
            overtone = 0.35 * math.sin(2.0 * math.pi * 440.0 * index / sample_rate)
            fade = min(1.0, index / (sample_rate * 0.5), (frames - index) / (sample_rate * 0.5))
            value = int(0.12 * fade * 32767 * (carrier + overtone))
            wav.writeframesraw(value.to_bytes(2, byteorder="little", signed=True))
    return SAMPLE_LONG_AUDIO


def request_json(base_url: str, method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 120.0) -> tuple[int, Any]:
    """Call a JSON endpoint and return status plus decoded body."""

    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body: Any = json.loads(raw)
        except json.JSONDecodeError:
            body = raw[:500]
        return exc.code, body


def request_text(base_url: str, path: str, timeout: float = 20.0) -> tuple[int, str]:
    """Call a text/html route."""

    req = urllib.request.Request(f"{base_url}{path}", headers={"Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(256).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(256).decode("utf-8", errors="replace")


def summarize_error(body: Any) -> str:
    """Normalize FastAPI error responses for a compact report."""

    if isinstance(body, dict):
        detail = body.get("detail", body)
        return str(detail)[:500]
    return str(body)[:500]


def add_http_check(results: list[CheckResult], base_url: str, name: str, method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 120.0) -> Any:
    """Run one JSON check and append a PASS/FAIL result."""

    print(f"[live-e2e] START {name}", flush=True)
    try:
        status, body = request_json(base_url, method, path, payload, timeout=timeout)
    except Exception as exc:  # noqa: BLE001 - this script reports external runtime failures.
        results.append(CheckResult(name, "FAIL", str(exc)))
        print(f"[live-e2e] FAIL  {name}: {exc}", flush=True)
        return None
    if 200 <= status < 300:
        results.append(CheckResult(name, "PASS", path))
        print(f"[live-e2e] PASS  {name}", flush=True)
        return body
    results.append(CheckResult(name, "FAIL", f"HTTP {status}: {summarize_error(body)}"))
    print(f"[live-e2e] FAIL  {name}: HTTP {status}", flush=True)
    return None


def add_optional_live_check(results: list[CheckResult], base_url: str, name: str, path: str, payload: dict[str, Any], timeout: float) -> Any:
    """Run a live generator check and keep unavailable local runtimes explicit."""

    print(f"[live-e2e] START {name}", flush=True)
    try:
        status, body = request_json(base_url, "POST", path, payload, timeout=timeout)
    except Exception as exc:  # noqa: BLE001 - endpoint/runtime failure is the check result.
        results.append(CheckResult(name, "FAIL", str(exc)))
        print(f"[live-e2e] FAIL  {name}: {exc}", flush=True)
        return None
    if 200 <= status < 300:
        record = body.get("record", {}) if isinstance(body, dict) else {}
        output_path = record.get("output_audio_path") or record.get("meta", {}).get("output_path") or path
        results.append(CheckResult(name, "PASS", str(output_path)))
        print(f"[live-e2e] PASS  {name}: {output_path}", flush=True)
        return body
    results.append(CheckResult(name, "FAIL", f"HTTP {status}: {summarize_error(body)}"))
    print(f"[live-e2e] FAIL  {name}: HTTP {status}", flush=True)
    return None


def tail_text(path: Path, max_lines: int = 40) -> str:
    """Return recent log lines without blocking on a live subprocess pipe."""

    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-max_lines:])


def start_backend(port: int) -> subprocess.Popen[str]:
    """Start uvicorn for live HTTP checks."""

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    command = [
        str(PYTHON),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]
    BACKEND_LOG.parent.mkdir(parents=True, exist_ok=True)
    log_handle = BACKEND_LOG.open("w", encoding="utf-8")
    return popen_process_group(
        command,
        cwd=BACKEND_DIR,
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
    )


def wait_for_backend(proc: subprocess.Popen[str], base_url: str, timeout: float = 90.0) -> None:
    """Wait until /api/health responds or raise with recent server output."""

    started_at = time.time()
    while time.time() - started_at < timeout:
        if proc.poll() is not None:
            raise RuntimeError("backend exited early\n" + tail_text(BACKEND_LOG))
        try:
            status, _ = request_json(base_url, "GET", "/api/health", timeout=2.0)
            if status == 200:
                return
        except Exception:
            time.sleep(0.5)
    raise TimeoutError("backend did not become healthy\n" + tail_text(BACKEND_LOG))


def run_checks(include_heavy: bool, port: int | None) -> int:
    """Run live e2e checks and print a machine-readable summary."""

    ensure_sample_audio()
    ensure_long_sample_audio()
    port = port or find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    proc = start_backend(port)
    results: list[CheckResult] = []
    try:
        wait_for_backend(proc, base_url)

        print(f"[live-e2e] backend ready: {base_url}", flush=True)
        print("[live-e2e] START frontend_static_shell", flush=True)
        html_status, html_body = request_text(base_url, "/")
        results.append(CheckResult("frontend_static_shell", "PASS" if html_status == 200 and "<!doctype html" in html_body.lower() else "FAIL", f"HTTP {html_status}"))
        print(f"[live-e2e] {'PASS' if results[-1].status == 'PASS' else 'FAIL'}  frontend_static_shell: HTTP {html_status}", flush=True)

        health = add_http_check(results, base_url, "health", "GET", "/api/health")
        bootstrap = add_http_check(results, base_url, "bootstrap", "GET", "/api/bootstrap", timeout=60.0)
        models = add_http_check(results, base_url, "qwen_model_catalog", "GET", "/api/models")
        add_http_check(results, base_url, "gallery", "GET", "/api/gallery")
        add_http_check(results, base_url, "audio_assets", "GET", "/api/audio-assets")
        add_http_check(results, base_url, "audio_tool_capabilities", "GET", "/api/audio-tools/capabilities")
        voice_models = add_http_check(results, base_url, "applio_rvc_models", "GET", "/api/audio-tools/voice-models")
        add_http_check(results, base_url, "speakers", "GET", "/api/speakers")
        add_http_check(results, base_url, "asr_models", "GET", "/api/asr/models")
        add_http_check(results, base_url, "history", "GET", "/api/history")
        add_http_check(results, base_url, "audio_tool_jobs", "GET", "/api/audio-tools/jobs")
        add_http_check(results, base_url, "s2_pro_capabilities", "GET", "/api/s2-pro/capabilities")
        add_http_check(results, base_url, "s2_pro_voices", "GET", "/api/s2-pro/voices")
        add_http_check(results, base_url, "ace_step_runtime", "GET", "/api/music/ace-step/runtime")
        add_http_check(results, base_url, "vibevoice_runtime", "GET", "/api/vibevoice/runtime")

        sample_rel = str(SAMPLE_AUDIO.relative_to(REPO_ROOT))
        long_sample_rel = str(SAMPLE_LONG_AUDIO.relative_to(REPO_ROOT))
        add_optional_live_check(
            results,
            base_url,
            "audio_convert_live",
            "/api/audio-tools/convert",
            {"audio_path": sample_rel, "output_format": "wav", "sample_rate": 24000, "mono": True},
            timeout=60.0,
        )
        add_optional_live_check(
            results,
            base_url,
            "audio_denoise_live",
            "/api/audio-tools/denoise",
            {"audio_path": sample_rel, "output_name": "e2e-denoise", "strength": 0.25, "sample_rate": 24000},
            timeout=90.0,
        )
        add_optional_live_check(
            results,
            base_url,
            "audio_edit_live",
            "/api/audio-tools/edit",
            {
                "audio_path": sample_rel,
                "output_name": "e2e-edit",
                "start_sec": 0.0,
                "end_sec": 0.6,
                "gain_db": -1.0,
                "fade_in_sec": 0.02,
                "fade_out_sec": 0.02,
                "normalize": True,
                "output_format": "wav",
                "sample_rate": 24000,
            },
            timeout=60.0,
        )

        if include_heavy:
            model_ids = {item.get("model_id") for item in models or [] if isinstance(item, dict)}
            custom_model = next((item.get("model_id") for item in models or [] if isinstance(item, dict) and item.get("category") == "custom_voice"), None)
            design_model = next((item.get("model_id") for item in models or [] if isinstance(item, dict) and item.get("category") == "voice_design"), None)
            base_model = next((item.get("model_id") for item in models or [] if isinstance(item, dict) and item.get("category") in {"base", "base_clone"}), None)
            voicebox_model = next((item.get("model_id") for item in models or [] if isinstance(item, dict) and item.get("model_family") == "voicebox"), None)
            voice_design_body: Any = None
            reference_speech_rel = sample_rel
            reference_speech_text = "짧은 기준 음성입니다."

            if custom_model:
                custom_body = add_optional_live_check(
                    results,
                    base_url,
                    "qwen_custom_voice_live",
                    "/api/generate/custom-voice",
                    {
                        "model_id": custom_model,
                        "speaker": "Sohee",
                        "text": "오늘은 짧은 라이브 검증 문장입니다.",
                        "language": "Korean",
                        "instruct": "Speak naturally and clearly.",
                        "output_name": "e2e-qwen-custom",
                        "max_new_tokens": 256,
                    },
                    timeout=420.0,
                )
                if isinstance(custom_body, dict):
                    custom_record = custom_body.get("record") or {}
                    reference_speech_rel = custom_record.get("output_audio_path") or reference_speech_rel
                    reference_speech_text = custom_record.get("input_text") or "오늘은 짧은 라이브 검증 문장입니다."
                add_optional_live_check(
                    results,
                    base_url,
                    "qwen_model_select_live",
                    "/api/generate/model",
                    {
                        "model_id": custom_model,
                        "speaker": "Sohee",
                        "text": "모델 선택형 추론 라이브 검증입니다.",
                        "language": "Korean",
                        "instruct": "Speak naturally and clearly.",
                        "output_name": "e2e-qwen-model-select",
                        "max_new_tokens": 128,
                    },
                    timeout=420.0,
                )
            else:
                results.append(CheckResult("qwen_custom_voice_live", "FAIL", "no custom voice model in catalog"))

            if design_model:
                voice_design_body = add_optional_live_check(
                    results,
                    base_url,
                    "qwen_voice_design_live",
                    "/api/generate/voice-design",
                    {
                        "model_id": design_model,
                        "text": "짧은 목소리 설계 검증입니다.",
                        "language": "Korean",
                        "instruct": "Young Korean woman, calm, warm, clean articulation.",
                        "output_name": "e2e-qwen-design",
                        "max_new_tokens": 256,
                    },
                    timeout=420.0,
                )
            else:
                results.append(CheckResult("qwen_voice_design_live", "FAIL", "no voice design model in catalog"))

            if base_model:
                add_optional_live_check(
                    results,
                    base_url,
                    "qwen_voice_clone_live",
                    "/api/generate/voice-clone",
                    {
                        "model_id": base_model,
                        "ref_audio_path": sample_rel,
                        "ref_text": "짧은 기준 음성입니다.",
                        "text": "복제 경로 라이브 검증입니다.",
                        "language": "Korean",
                        "output_name": "e2e-qwen-clone",
                        "max_new_tokens": 256,
                    },
                    timeout=420.0,
                )
                clone_prompt_body = add_optional_live_check(
                    results,
                    base_url,
                    "qwen_clone_prompt_from_upload_live",
                    "/api/clone-prompts/from-upload",
                    {
                        "model_id": base_model,
                        "reference_audio_path": sample_rel,
                        "reference_text": "짧은 기준 음성입니다.",
                        "x_vector_only_mode": False,
                    },
                    timeout=420.0,
                )
                clone_prompt_path = clone_prompt_body.get("prompt_path") if isinstance(clone_prompt_body, dict) else None
                if clone_prompt_path:
                    preset_body = add_optional_live_check(
                        results,
                        base_url,
                        "qwen_preset_create_live",
                        "/api/presets",
                        {
                            "name": "e2e-preset",
                            "source_type": "upload",
                            "language": "Korean",
                            "base_model": base_model,
                            "reference_text": "짧은 기준 음성입니다.",
                            "reference_audio_path": sample_rel,
                            "clone_prompt_path": clone_prompt_path,
                            "notes": "live e2e preset",
                        },
                        timeout=60.0,
                    )
                    preset_id = preset_body.get("id") if isinstance(preset_body, dict) else None
                    if preset_id:
                        add_optional_live_check(
                            results,
                            base_url,
                            "qwen_preset_generate_live",
                            f"/api/presets/{preset_id}/generate",
                            {
                                "model_id": base_model,
                                "text": "프리셋 기반 생성 라이브 검증입니다.",
                                "language": "Korean",
                                "output_name": "e2e-qwen-preset",
                                "max_new_tokens": 128,
                            },
                            timeout=420.0,
                        )
                    else:
                        results.append(CheckResult("qwen_preset_generate_live", "FAIL", "preset create did not return id"))
                else:
                    results.append(CheckResult("qwen_preset_create_live", "FAIL", "clone prompt create did not return prompt_path"))
            else:
                results.append(CheckResult("qwen_voice_clone_live", "FAIL", "no base model in catalog"))

            if base_model and custom_model:
                add_optional_live_check(
                    results,
                    base_url,
                    "qwen_hybrid_clone_instruct_live",
                    "/api/generate/hybrid-clone-instruct",
                    {
                        "base_model_id": base_model,
                        "custom_model_id": custom_model,
                        "ref_audio_path": sample_rel,
                        "ref_text": "짧은 기준 음성입니다.",
                        "text": "하이브리드 생성 라이브 검증입니다.",
                        "language": "Korean",
                        "instruct": "Speak with a slightly breathy, tired mood while keeping the sentence clear.",
                        "output_name": "e2e-qwen-hybrid",
                        "max_new_tokens": 128,
                    },
                    timeout=600.0,
                )
            else:
                results.append(CheckResult("qwen_hybrid_clone_instruct_live", "FAIL", "base/custom model missing"))

            if voicebox_model:
                add_optional_live_check(
                    results,
                    base_url,
                    "voicebox_clone_live",
                    "/api/generate/voicebox-clone",
                    {
                        "model_id": voicebox_model,
                        "ref_audio_path": reference_speech_rel,
                        "ref_text": reference_speech_text,
                        "text": "보이스박스 복제 라이브 검증입니다.",
                        "language": "Korean",
                        "speaker": "mai",
                        "strategy": "speaker_anchor_with_ref_code",
                        "output_name": "e2e-voicebox-clone",
                        "max_new_tokens": 128,
                    },
                    timeout=600.0,
                )
                add_optional_live_check(
                    results,
                    base_url,
                    "voicebox_clone_instruct_live",
                    "/api/generate/voicebox-clone-instruct",
                    {
                        "model_id": voicebox_model,
                        "ref_audio_path": reference_speech_rel,
                        "ref_text": reference_speech_text,
                        "text": "보이스박스 지시 복제 라이브 검증입니다.",
                        "language": "Korean",
                        "speaker": "mai",
                        "instruct": "Speak softly and breathy, but keep the words clear.",
                        "strategy": "speaker_anchor_with_ref_code",
                        "output_name": "e2e-voicebox-clone-instruct",
                        "max_new_tokens": 128,
                    },
                    timeout=600.0,
                )
            else:
                results.append(CheckResult("voicebox_clone_live", "FAIL", "no voicebox model in catalog"))
                results.append(CheckResult("voicebox_clone_instruct_live", "FAIL", "no voicebox model in catalog"))

            add_optional_live_check(
                results,
                base_url,
                "qwen_asr_live",
                "/api/transcriptions/reference-audio",
                {"audio_path": reference_speech_rel},
                timeout=300.0,
            )

            add_optional_live_check(
                results,
                base_url,
                "ace_step_generate_live",
                "/api/music/ace-step/generate",
                {
                    "output_name": "e2e-ace-step",
                    "caption": "short ambient piano loop, warm tape, no vocal",
                    "lyrics": "",
                    "instrumental": True,
                    "duration": 5.0,
                    "inference_steps": 2,
                    "guidance_scale": 3.0,
                    "audio_format": "wav",
                    "use_random_seed": False,
                    "seeds": "42",
                    "batch_size": 1,
                },
                timeout=600.0,
            )

            add_optional_live_check(
                results,
                base_url,
                "s2_pro_generate_live",
                "/api/s2-pro/generate",
                {
                    "mode": "tagged",
                    "runtime_source": "local",
                    "text": "[breathy] Short S2-Pro live check.",
                    "language": "English",
                    "output_name": "e2e-s2pro",
                    "output_format": "wav",
                    "max_new_tokens": 24,
                    "min_chunk_length": 5,
                    "chunk_length": 40,
                },
                timeout=900.0,
            )
            s2_voice_body = add_optional_live_check(
                results,
                base_url,
                "s2_pro_save_voice_live",
                "/api/s2-pro/voices",
                {
                    "name": "e2e-s2-voice",
                    "runtime_source": "local",
                    "reference_audio_path": reference_speech_rel,
                    "reference_text": reference_speech_text,
                    "language": "Korean",
                    "notes": "live e2e voice",
                    "create_qwen_prompt": False,
                },
                timeout=600.0,
            )
            s2_voice_id = s2_voice_body.get("id") if isinstance(s2_voice_body, dict) else None
            if s2_voice_id:
                add_optional_live_check(
                    results,
                    base_url,
                    "s2_pro_saved_voice_tts_live",
                    "/api/s2-pro/generate",
                    {
                        "mode": "saved_voice",
                        "runtime_source": "local",
                        "reference_id": s2_voice_id,
                        "text": "[soft] 저장한 목소리 라이브 검증입니다.",
                        "language": "Korean",
                        "output_name": "e2e-s2pro-saved-voice",
                        "output_format": "wav",
                        "max_new_tokens": 24,
                        "min_chunk_length": 5,
                        "chunk_length": 40,
                    },
                    timeout=900.0,
                )
                add_optional_live_check(
                    results,
                    base_url,
                    "s2_pro_dialogue_live",
                    "/api/s2-pro/generate",
                    {
                        "mode": "dialogue",
                        "runtime_source": "local",
                        "reference_ids": [s2_voice_id],
                        "text": "Speaker 1: [excited] 대화 생성 라이브 검증입니다.",
                        "language": "Korean",
                        "output_name": "e2e-s2pro-dialogue",
                        "output_format": "wav",
                        "max_new_tokens": 24,
                        "min_chunk_length": 5,
                        "chunk_length": 40,
                    },
                    timeout=900.0,
                )
            else:
                results.append(CheckResult("s2_pro_saved_voice_tts_live", "FAIL", "S2 voice create did not return id"))
                results.append(CheckResult("s2_pro_dialogue_live", "FAIL", "S2 voice create did not return id"))

            add_optional_live_check(
                results,
                base_url,
                "audio_translate_live",
                "/api/audio-tools/translate",
                {
                    "audio_path": reference_speech_rel,
                    "target_language": "English",
                    "translated_text": "This is a short translated speech check.",
                    "model_id": custom_model,
                    "speaker": "Sohee",
                    "instruct": "Speak clearly.",
                },
                timeout=700.0,
            )

            if voice_models:
                rvc_model = voice_models[0]
                rvc_payload = {
                    "audio_path": reference_speech_rel,
                    "model_path": rvc_model.get("model_path"),
                    "index_path": rvc_model.get("index_path"),
                    "pitch_shift_semitones": 0,
                    "f0_method": "rmvpe",
                    "index_rate": 0.3,
                    "protect": 0.33,
                    "split_audio": False,
                    "f0_autotune": False,
                    "clean_audio": False,
                    "clean_strength": 0.7,
                    "embedder_model": "contentvec",
                }
                add_optional_live_check(
                    results,
                    base_url,
                    "applio_rvc_convert_live",
                    "/api/audio-tools/voice-changer",
                    rvc_payload,
                    timeout=700.0,
                )
                add_optional_live_check(
                    results,
                    base_url,
                    "applio_rvc_batch_live",
                    "/api/audio-tools/voice-changer/batch",
                    {**rvc_payload, "audio_paths": [reference_speech_rel], "audio_path": reference_speech_rel},
                    timeout=700.0,
                )
            else:
                results.append(CheckResult("applio_rvc_convert_live", "FAIL", "no RVC model in catalog"))
                results.append(CheckResult("applio_rvc_batch_live", "FAIL", "no RVC model in catalog"))

            add_optional_live_check(
                results,
                base_url,
                "stem_separator_live",
                "/api/audio-tools/separate",
                {"audio_path": long_sample_rel, "model_profile": "roformer_vocals", "output_format": "wav"},
                timeout=900.0,
            )

            add_optional_live_check(
                results,
                base_url,
                "vibevoice_tts_live",
                "/api/vibevoice/tts",
                {
                    "text": "This is a short VibeVoice live verification.",
                    "model_profile": "realtime",
                    "speaker_name": "Speaker 1",
                    "output_name": "e2e-vibevoice",
                    "ddpm_steps": 2,
                    "inference_steps": 2,
                    "max_new_tokens": 128,
                    "output_format": "wav",
                },
                timeout=420.0,
            )

            add_optional_live_check(
                results,
                base_url,
                "mmaudio_sound_effect_live",
                "/api/audio-tools/sound-effects",
                {
                    "prompt": "short soft rain on a window, clean recording",
                    "model_profile": "mmaudio",
                    "duration_sec": 1.0,
                    "intensity": 0.5,
                    "steps": 4,
                    "cfg_scale": 1.5,
                },
                timeout=1800.0,
            )
        else:
            results.append(CheckResult("heavy_generators", "SKIP", "run with --include-heavy to load/generate with local models"))

        print(json.dumps({"base_url": base_url, "health": health, "bootstrap_counts": summarize_bootstrap(bootstrap), "results": [r.__dict__ for r in results]}, ensure_ascii=False, indent=2))
        return 0 if all(result.status in {"PASS", "SKIP"} for result in results) else 1
    finally:
        terminate_process_group(proc, grace_seconds=15.0)


def summarize_bootstrap(bootstrap: Any) -> dict[str, int]:
    """Return high-signal counts from bootstrap."""

    if not isinstance(bootstrap, dict):
        return {}
    keys = [
        "models",
        "gallery",
        "audio_assets",
        "history",
        "clone_prompts",
        "presets",
        "datasets",
        "finetune_runs",
        "voice_changer_models",
    ]
    return {key: len(bootstrap.get(key) or []) for key in keys}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-heavy", action="store_true", help="Actually invoke heavyweight local generation endpoints.")
    parser.add_argument("--port", type=int, default=None, help="Port to use for the temporary backend.")
    args = parser.parse_args()
    if not PYTHON.exists():
        print(f"Missing virtualenv python: {PYTHON}", file=sys.stderr)
        return 2
    return run_checks(include_heavy=args.include_heavy, port=args.port)


if __name__ == "__main__":
    raise SystemExit(main())
