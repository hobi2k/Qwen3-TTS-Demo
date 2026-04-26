"""Fish Speech / Fish Audio S2-Pro runtime bridge.

This module intentionally does not synthesize placeholder audio. A request is
sent only to a local/self-hosted Fish Speech compatible `/v1/tts` endpoint. The
caller receives an error if the local runtime is not running.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import msgpack
import requests
from requests import RequestException


class FishSpeechError(RuntimeError):
    """Raised when S2-Pro generation cannot be completed."""


@dataclass
class FishSpeechConfig:
    """Runtime configuration for Fish Speech compatible inference."""

    endpoint_url: str
    model: str
    api_key: str
    timeout_sec: float
    source: str


REPO_ROOT = Path(__file__).resolve().parents[3]


def _join_tts_endpoint(base_url: str) -> str:
    """Return a `/v1/tts` endpoint from a base URL or full endpoint URL."""

    normalized = base_url.rstrip("/")
    if normalized.endswith("/v1/tts") or normalized.endswith("/tts"):
        return normalized
    return f"{normalized}/v1/tts"


def fish_speech_config() -> Optional[FishSpeechConfig]:
    """Resolve the active Fish Speech runtime configuration.

    Environment variables:
        FISH_SPEECH_SERVER_URL: Local or self-hosted Fish Speech HTTP server.
        FISH_SPEECH_API_KEY: Optional token for a local compatible server.
        FISH_SPEECH_MODEL: Model header value, defaults to s2-pro.
        FISH_SPEECH_TIMEOUT_SEC: Request timeout.
    """

    model = (os.getenv("FISH_SPEECH_MODEL") or "s2-pro").strip() or "s2-pro"
    timeout_sec = float(os.getenv("FISH_SPEECH_TIMEOUT_SEC") or "180")
    server_url = (os.getenv("FISH_SPEECH_SERVER_URL") or "http://127.0.0.1:8080").strip()
    return FishSpeechConfig(
        endpoint_url=_join_tts_endpoint(server_url),
        model=model,
        api_key=(os.getenv("FISH_SPEECH_API_KEY") or "").strip(),
        timeout_sec=timeout_sec,
        source="local_fish_speech_server",
    )


def fish_speech_repo_root() -> Path:
    """Return the expected local Fish Speech source checkout path."""

    configured = (os.getenv("FISH_SPEECH_REPO_ROOT") or "").strip()
    return Path(configured).expanduser() if configured else REPO_ROOT / "vendor" / "fish-speech"


def fish_speech_model_dir() -> Path:
    """Return the expected local S2-Pro checkpoint directory."""

    configured = (os.getenv("FISH_SPEECH_MODEL_DIR") or "").strip()
    return Path(configured).expanduser() if configured else REPO_ROOT / "data" / "models" / "fish-speech" / "s2-pro"


def fish_speech_status(*, check_server: bool = False) -> Dict[str, Any]:
    """Return local Fish Speech installation and server status.

    The status is intentionally local-first. It checks for a checked-out
    Fish Speech repository and downloaded S2-Pro weights, then optionally
    performs a short `/v1/health` request against the configured local server.
    """

    config = fish_speech_config()
    repo_root = fish_speech_repo_root()
    model_dir = fish_speech_model_dir()
    required_model_files = [
        "codec.pth",
        "config.json",
        "model-00001-of-00002.safetensors",
        "model-00002-of-00002.safetensors",
        "model.safetensors.index.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
    ]
    missing_model_files = [filename for filename in required_model_files if not (model_dir / filename).exists()]
    server_running = False
    server_error = ""

    if check_server and config is not None:
        health_url = config.endpoint_url.rsplit("/v1/tts", 1)[0].rstrip("/") + "/v1/health"
        try:
            response = requests.get(health_url, timeout=2.0)
            server_running = response.ok
            if not response.ok:
                server_error = response.text[:300] or f"HTTP {response.status_code}"
        except RequestException as exc:
            server_error = str(exc)

    return {
        "available": repo_root.exists() and model_dir.exists(),
        "server_running": server_running,
        "source": config.source if config else "",
        "endpoint_url": config.endpoint_url if config else "",
        "server_url": (os.getenv("FISH_SPEECH_SERVER_URL") or "http://127.0.0.1:8080").strip(),
        "model": config.model if config else "s2-pro",
        "repo_root": str(repo_root),
        "model_dir": str(model_dir),
        "api_server_path": str(repo_root / "tools" / "api_server.py"),
        "codec_path": str(model_dir / "codec.pth"),
        "repo_ready": (repo_root / "tools" / "api_server.py").exists(),
        "model_ready": model_dir.exists() and not missing_model_files,
        "missing_model_files": missing_model_files,
        "server_error": server_error,
    }


def fish_speech_ready() -> bool:
    """Return whether a real S2-Pro runtime is configured."""

    status = fish_speech_status()
    return bool(status["repo_ready"] and status["model_ready"])


def fish_speech_availability_notes() -> str:
    """Human-readable runtime availability summary."""

    status = fish_speech_status()
    return f"{status['source']} -> {status['endpoint_url']} · model_dir={status['model_dir']}"


def _response_error(response: requests.Response) -> str:
    """Extract a compact error message from a Fish API response."""

    try:
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("message") or payload.get("detail") or payload)
    except Exception:
        pass
    return response.text[:500] or f"HTTP {response.status_code}"


def _headers(config: FishSpeechConfig, content_type: str) -> Dict[str, str]:
    """Build Fish Speech request headers."""

    headers = {
        "Content-Type": content_type,
        "model": config.model,
    }
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    return headers


def _server_base_url(config: FishSpeechConfig) -> str:
    """Return the local Fish Speech HTTP server root."""

    return config.endpoint_url.rsplit("/v1/tts", 1)[0].rstrip("/")


def _json_headers(config: FishSpeechConfig) -> Dict[str, str]:
    """Build JSON response headers without forcing a multipart content type."""

    headers = {"Accept": "application/json", "model": config.model}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    return headers


def register_s2_pro_reference(*, reference_id: str, audio_path: Path, reference_text: str) -> Dict[str, Any]:
    """Register a persistent Fish Speech reference voice on the local server.

    Fish Speech stores this reference inside its own runtime cache. The demo
    keeps a separate lightweight record so the voice can be selected later from
    the S2-Pro UI and bridged back into Qwen workflows.
    """

    config = fish_speech_config()
    if config is None:
        raise FishSpeechError("Fish Speech 로컬 런타임 설정을 확인하세요.")
    if not audio_path.exists():
        raise FishSpeechError(f"참조 음성을 찾지 못했습니다: {audio_path}")
    if not reference_text.strip():
        raise FishSpeechError("S2-Pro 목소리 저장에는 참조 텍스트가 필요합니다.")

    url = f"{_server_base_url(config)}/v1/references/add?format=json"
    try:
        with audio_path.open("rb") as handle:
            response = requests.post(
                url,
                data={"id": reference_id, "text": reference_text},
                files={"audio": (audio_path.name, handle, "audio/wav")},
                headers=_json_headers(config),
                timeout=config.timeout_sec,
            )
    except RequestException as exc:
        raise FishSpeechError(f"Fish Speech 로컬 서버에 연결하지 못했습니다: {exc}") from exc

    if response.status_code >= 400:
        raise FishSpeechError(_response_error(response))
    try:
        payload = response.json()
    except Exception as exc:
        raise FishSpeechError(f"Fish Speech reference 응답을 해석하지 못했습니다: {response.text[:300]}") from exc
    if not payload.get("success", False):
        raise FishSpeechError(str(payload.get("message") or payload))
    return payload


def list_s2_pro_references() -> List[str]:
    """List persistent Fish Speech reference IDs from the local server."""

    config = fish_speech_config()
    if config is None:
        return []
    url = f"{_server_base_url(config)}/v1/references/list?format=json"
    try:
        response = requests.get(url, headers=_json_headers(config), timeout=5.0)
    except RequestException:
        return []
    if response.status_code >= 400:
        return []
    try:
        payload = response.json()
    except Exception:
        return []
    if not payload.get("success", False):
        return []
    return [str(item) for item in payload.get("reference_ids", [])]


def _base_payload(
    *,
    text: str,
    reference_id: Optional[str],
    reference_ids: List[str],
    temperature: float,
    top_p: float,
    max_new_tokens: int,
    chunk_length: int,
    output_format: str,
    sample_rate: Optional[int],
    speed: float,
    volume: float,
    normalize: bool,
    latency: str,
    repetition_penalty: float,
    min_chunk_length: int,
    condition_on_previous_chunks: bool,
    early_stop_threshold: float,
) -> Dict[str, Any]:
    """Create the Fish `/v1/tts` payload shared by JSON and MessagePack calls."""

    payload: Dict[str, Any] = {
        "text": text,
        "temperature": temperature,
        "top_p": top_p,
        "prosody": {
            "speed": speed,
            "volume": volume,
            "normalize_loudness": True,
        },
        "chunk_length": chunk_length,
        "normalize": normalize,
        "format": output_format,
        "sample_rate": sample_rate,
        "latency": latency,
        "max_new_tokens": max_new_tokens,
        "repetition_penalty": repetition_penalty,
        "min_chunk_length": min_chunk_length,
        "condition_on_previous_chunks": condition_on_previous_chunks,
        "early_stop_threshold": early_stop_threshold,
    }
    if reference_id:
        payload["reference_id"] = reference_id
    elif reference_ids:
        # Fish Speech's current ServeTTSRequest accepts one reference_id. Keep
        # the full list as extra metadata for compatible forks, but send a
        # scalar reference_id so the official local server validates the body.
        payload["reference_id"] = reference_ids[0]
        payload["reference_ids"] = reference_ids
    return payload


def generate_s2_pro_audio(
    *,
    text: str,
    output_path: Path,
    reference_audio_path: Optional[Path] = None,
    reference_text: str = "",
    reference_id: Optional[str] = None,
    reference_ids: Optional[List[str]] = None,
    temperature: float = 0.7,
    top_p: float = 0.7,
    max_new_tokens: int = 1024,
    chunk_length: int = 300,
    output_format: str = "wav",
    sample_rate: Optional[int] = 44100,
    speed: float = 1.0,
    volume: float = 0.0,
    normalize: bool = True,
    latency: str = "normal",
    repetition_penalty: float = 1.2,
    min_chunk_length: int = 50,
    condition_on_previous_chunks: bool = True,
    early_stop_threshold: float = 1.0,
) -> Dict[str, Any]:
    """Generate audio through a configured Fish Speech compatible runtime.

    Args:
        text: Final text sent to the TTS endpoint.
        output_path: Destination audio path under the demo data directory.
        reference_audio_path: Optional zero-shot reference audio. When present,
            the request uses MessagePack as required by Fish Audio for direct
            reference audio bytes.
        reference_text: Transcript for the reference audio.
        reference_id: Persistent Fish voice model id for single-speaker TTS.
        reference_ids: Persistent Fish voice model ids for multi-speaker TTS.

    Returns:
        Metadata about the request and written output file.
    """

    config = fish_speech_config()
    if config is None:
        raise FishSpeechError("Fish Speech 로컬 런타임 설정을 확인하세요.")
    ids = [item.strip() for item in (reference_ids or []) if item.strip()]
    payload = _base_payload(
        text=text,
        reference_id=reference_id,
        reference_ids=ids,
        temperature=temperature,
        top_p=top_p,
        max_new_tokens=max_new_tokens,
        chunk_length=chunk_length,
        output_format=output_format,
        sample_rate=sample_rate,
        speed=speed,
        volume=volume,
        normalize=normalize,
        latency=latency,
        repetition_penalty=repetition_penalty,
        min_chunk_length=min_chunk_length,
        condition_on_previous_chunks=condition_on_previous_chunks,
        early_stop_threshold=early_stop_threshold,
    )

    if reference_audio_path is not None:
        if not reference_audio_path.exists():
            raise FishSpeechError(f"참조 음성을 찾지 못했습니다: {reference_audio_path}")
        payload["references"] = [
            {
                "audio": reference_audio_path.read_bytes(),
                "text": reference_text,
            }
        ]
        try:
            response = requests.post(
                config.endpoint_url,
                data=msgpack.packb(payload, use_bin_type=True),
                headers=_headers(config, "application/msgpack"),
                timeout=config.timeout_sec,
            )
        except RequestException as exc:
            raise FishSpeechError(f"Fish Speech 로컬 서버에 연결하지 못했습니다: {exc}") from exc
    else:
        try:
            response = requests.post(
                config.endpoint_url,
                json=payload,
                headers=_headers(config, "application/json"),
                timeout=config.timeout_sec,
            )
        except RequestException as exc:
            raise FishSpeechError(f"Fish Speech 로컬 서버에 연결하지 못했습니다: {exc}") from exc

    if response.status_code >= 400:
        raise FishSpeechError(_response_error(response))

    if not response.content:
        raise FishSpeechError("S2-Pro runtime returned an empty response.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.content)
    return {
        "runtime_source": config.source,
        "endpoint_url": config.endpoint_url,
        "model": config.model,
        "format": output_format,
        "sample_rate": sample_rate,
        "reference_id": reference_id,
        "reference_ids": ids,
        "used_reference_audio": reference_audio_path is not None,
    }
