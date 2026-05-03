#!/usr/bin/env python3
"""Validate speech inference quality for Base FT, CustomVoice FT, and hybrid clone+instruct flows.

This workflow stays outside the upstream ``Qwen3-TTS`` tree and exercises the
public demo API instead. It creates a timestamped validation run directory with
copied WAV artifacts, a machine-readable JSON report, and a human-readable
Markdown report for manual listening.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Sequence

import librosa
import numpy as np
import requests
import torch


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKEND_PORT = os.getenv("BACKEND_PORT", "8190")
DEFAULT_API_BASE = os.getenv("VOICE_STUDIO_API_BASE", f"http://127.0.0.1:{DEFAULT_BACKEND_PORT}")
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "data" / "generated" / "quality-validation"
DEFAULT_ASR_MODEL = REPO_ROOT / "data" / "models" / "Qwen3-ASR-1.7B"
DEFAULT_REFERENCE_AUDIO = REPO_ROOT / "data" / "datasets" / "mai_ko_full" / "audio" / "00000.wav"
DEFAULT_PROBE_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_LANGUAGE = "Korean"

PROMPT_SETS: Dict[str, List[tuple[str, str]]] = {
    "core": [
        ("neutral", "자연스럽고 또박또박 읽어주세요."),
        ("angry", "분노와 긴장감을 강하게 담아, 조금 더 빠르고 거칠게 읽어주세요."),
        ("gentle", "아주 부드럽고 따뜻하게, 위로하듯 읽어주세요."),
    ],
    "extended": [
        ("neutral", "자연스럽고 또박또박 읽어주세요."),
        ("angry", "분노와 긴장감을 강하게 담아, 조금 더 빠르고 거칠게 읽어주세요."),
        ("gentle", "아주 부드럽고 따뜻하게, 위로하듯 읽어주세요."),
        ("breathy", "숨결이 느껴지는 breathy한 질감으로, 차분하게 읽어주세요."),
    ],
    "aggressive": [
        ("furious", "폭발 직전의 분노로, 날카롭고 거칠게, 문장 끝을 강하게 끊어 읽어주세요."),
        ("shaken", "분노와 공포가 동시에 올라오는 느낌으로, 숨이 가쁘고 떨리는 톤으로 읽어주세요."),
        ("cold", "감정을 억누른 채 차갑고 단호하게, 상대를 압박하듯 읽어주세요."),
    ],
}


@dataclass
class SampleResult:
    """One generated sample plus lightweight quality metrics."""

    suite: str
    variant: str
    model_label: str
    model_id: str
    source: str
    inference_mode: str
    prompt_name: str
    instruction: str
    text: str
    reference_audio: Optional[str]
    reference_text: Optional[str]
    output_audio_path: str
    copied_audio_path: str
    transcript: str
    transcript_similarity: float
    duration_sec: float
    rms: float
    spectral_centroid: float
    zcr: float
    content_ok: bool
    record: Dict[str, Any]


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the validation workflow.

    Returns:
        Parsed command line namespace.
    """

    parser = argparse.ArgumentParser(
        description="Validate Base FT, CustomVoice FT, and clone-prompt-plus-instruct speech quality."
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="Local demo API base URL.")
    parser.add_argument(
        "--output-root",
        default=str(DEFAULT_OUTPUT_ROOT),
        help="Directory that will hold timestamped validation runs.",
    )
    parser.add_argument(
        "--asr-model",
        default=str(DEFAULT_ASR_MODEL),
        help="Qwen3-ASR model id or local model path used to transcribe generated samples.",
    )
    parser.add_argument(
        "--suite",
        choices=["all", "base", "customvoice", "hybrid"],
        default="all",
        help="Which validation suite to run.",
    )
    parser.add_argument(
        "--prompt-set",
        choices=list(PROMPT_SETS.keys()),
        default="aggressive",
        help="Instruction prompt bundle for CustomVoice and hybrid checks.",
    )
    parser.add_argument(
        "--reference-audio",
        default=str(DEFAULT_REFERENCE_AUDIO),
        help="Reference audio used for Base clone and hybrid checks.",
    )
    parser.add_argument(
        "--reference-text",
        default="",
        help="Optional reference text. If omitted, the backend transcribes the reference audio.",
    )
    parser.add_argument(
        "--probe-text",
        default=DEFAULT_PROBE_TEXT,
        help="Text used as the generation target across all validation suites.",
    )
    parser.add_argument("--language", default=DEFAULT_LANGUAGE, help="Generation language label.")
    parser.add_argument(
        "--speaker",
        default="",
        help="Optional speaker override for CustomVoice validation. Defaults to each model's native speaker.",
    )
    parser.add_argument("--seed", type=int, default=7, help="Deterministic seed for generation requests.")
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=0.60,
        help="Loose transcript similarity threshold used for the content_ok flag.",
    )
    parser.add_argument(
        "--base-model-id",
        default="",
        help="Explicit stock Base model_id override. If omitted, the validator auto-selects one.",
    )
    parser.add_argument(
        "--base-ft-model-id",
        default="",
        help="Explicit fine-tuned Base model_id override. If omitted, the validator auto-selects one.",
    )
    parser.add_argument(
        "--customvoice-model-id",
        default="",
        help="Explicit stock CustomVoice model_id override. If omitted, the validator auto-selects one.",
    )
    parser.add_argument(
        "--customvoice-ft-model-id",
        default="",
        help="Explicit fine-tuned CustomVoice model_id override. If omitted, the validator auto-selects one.",
    )
    parser.add_argument(
        "--hybrid-base-model-id",
        default="",
        help="Explicit Base model_id override for the hybrid route. Defaults to the stock Base 1.7B model.",
    )
    parser.add_argument(
        "--hybrid-custom-model-id",
        default="",
        help="Explicit CustomVoice model_id override for the hybrid route. Defaults to the fine-tuned CustomVoice model.",
    )
    parser.add_argument(
        "--allow-simulation",
        action="store_true",
        help="Allow the validator to run even if the backend reports simulation mode.",
    )
    return parser.parse_args()


def utc_stamp() -> str:
    """Return a timestamp suitable for run-directory names."""

    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def slugify(value: str) -> str:
    """Create a filesystem-safe slug from a human label."""

    normalized = re.sub(r"[^0-9a-zA-Z\u3131-\u318E\uAC00-\uD7A3]+", "-", value).strip("-")
    return normalized.lower() or "sample"


def normalize_text(value: str) -> str:
    """Normalize a transcript or prompt before similarity scoring."""

    lowered = value.strip().lower()
    lowered = re.sub(r"\s+", "", lowered)
    lowered = re.sub(r"[^\w\u3131-\u318E\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF]+", "", lowered)
    return lowered


def similarity_score(expected: str, actual: str) -> float:
    """Score how close a transcript is to the expected target text."""

    return SequenceMatcher(None, normalize_text(expected), normalize_text(actual)).ratio()


def request_json(session: requests.Session, method: str, api_base: str, path: str, payload: Optional[dict] = None) -> Any:
    """Send a JSON request to the local demo backend and raise a useful error on failure."""

    url = f"{api_base.rstrip('/')}/{path.lstrip('/')}"
    response = session.request(method, url, json=payload, timeout=600)
    try:
        response.raise_for_status()
    except requests.HTTPError as error:
        message = response.text.strip() or response.reason
        raise RuntimeError(f"{method} {path} failed: {message}") from error
    return response.json()


def load_bootstrap(session: requests.Session, api_base: str) -> Dict[str, Any]:
    """Fetch the bootstrap payload so the validator can discover models and datasets."""

    return request_json(session, "GET", api_base, "/api/bootstrap")


def load_health(session: requests.Session, api_base: str) -> Dict[str, Any]:
    """Fetch the backend health payload."""

    return request_json(session, "GET", api_base, "/api/health")


def pick_model(
    models: Sequence[Dict[str, Any]],
    *,
    name: str,
    model_id: str = "",
    source: Optional[str] = None,
    inference_mode: Optional[str] = None,
    label_contains: Optional[str] = None,
    required: bool = True,
) -> Dict[str, Any]:
    """Select one model from the backend catalog using explicit or heuristic rules.

    Args:
        models: Backend model metadata list.
        name: Human-friendly role name used in error messages.
        model_id: Explicit model ID override.
        source: Optional source filter such as `stock` or `finetuned`.
        inference_mode: Optional inference mode filter.
        label_contains: Optional substring that must appear in the label.

    Returns:
        Selected model metadata dictionary.
    """

    if model_id:
        for model in models:
            if model.get("model_id") == model_id:
                return model
        if required:
            raise RuntimeError(f"{name}: model_id not found in backend catalog: {model_id}")
        return {}

    candidates = list(models)
    if source is not None:
        candidates = [item for item in candidates if item.get("source") == source]
    if inference_mode is not None:
        candidates = [item for item in candidates if item.get("inference_mode") == inference_mode]
    if label_contains is not None:
        candidates = [item for item in candidates if label_contains.lower() in str(item.get("label", "")).lower()]

    if not candidates:
        if not required:
            return {}
        raise RuntimeError(
            f"{name}: no model matched source={source!r}, inference_mode={inference_mode!r}, label_contains={label_contains!r}"
        )

    def sort_key(item: Dict[str, Any]) -> tuple:
        return (
            1 if item.get("recommended") else 0,
            1 if item.get("source") == "finetuned" else 0,
            str(item.get("label", "")),
            str(item.get("model_id", "")),
        )

    candidates.sort(key=sort_key, reverse=True)
    if len(candidates) > 1:
        print(
            f"[validate] {name}: multiple candidates found, using {candidates[0]['label']} ({candidates[0]['model_id']})",
            file=sys.stderr,
        )
    return candidates[0]


def resolve_reference_audio(args: argparse.Namespace, bootstrap: Dict[str, Any]) -> str:
    """Resolve the reference audio path used to build clone prompts."""

    reference_audio = (args.reference_audio or "").strip()
    if reference_audio:
        return reference_audio

    datasets = [item for item in bootstrap.get("datasets", []) if item.get("ref_audio_path")]
    preferred = next((item for item in datasets if item.get("speaker_name") == "mai"), None)
    if preferred is None and datasets:
        preferred = datasets[0]
    if not preferred:
        raise RuntimeError(
            "No --reference-audio was provided and the backend did not expose a dataset record with ref_audio_path."
        )
    return str(preferred["ref_audio_path"])


def resolve_reference_text(
    session: requests.Session,
    api_base: str,
    reference_audio_path: str,
    explicit_text: str,
) -> str:
    """Resolve the reference transcript, preferring explicit text over backend transcription."""

    if explicit_text.strip():
        return explicit_text.strip()
    payload = {"audio_path": reference_audio_path}
    response = request_json(session, "POST", api_base, "/api/transcriptions/reference-audio", payload)
    return str(response["text"]).strip()


def attention_backend() -> str:
    """Choose the attention backend used by local Qwen3-ASR checks."""

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn") is not None:
        return "flash_attention_2"
    return "sdpa"


def runtime_device() -> str:
    """Choose the device map used by local Qwen3-ASR checks."""

    if torch.cuda.is_available():
        return "cuda:0"
    if sys.platform == "darwin" and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def build_transcriber(model_path: Path):
    """Create a local Qwen3-ASR transcriber for generated samples."""

    from qwen_asr import Qwen3ASRModel

    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    return Qwen3ASRModel.from_pretrained(
        str(model_path),
        dtype=dtype,
        device_map=runtime_device(),
        attn_implementation=attention_backend(),
        max_new_tokens=512,
    )


def summarize_audio(audio_path: Path) -> Dict[str, float]:
    """Compute light-weight acoustic statistics for one generated WAV file."""

    waveform, sample_rate = librosa.load(audio_path, sr=None)
    return {
        "duration_sec": float(len(waveform) / sample_rate) if sample_rate else 0.0,
        "rms": float(np.sqrt(np.mean(np.square(waveform)))) if len(waveform) else 0.0,
        "spectral_centroid": float(np.mean(librosa.feature.spectral_centroid(y=waveform, sr=sample_rate)))
        if len(waveform)
        else 0.0,
        "zcr": float(np.mean(librosa.feature.zero_crossing_rate(waveform))) if len(waveform) else 0.0,
    }


def transcribe_generated_audio(asr, audio_path: Path) -> str:
    """Transcribe a generated sample using the local Qwen3-ASR model."""

    results = asr.transcribe(audio=str(audio_path), language=None)
    result = results[0] if isinstance(results, list) and results else results
    if isinstance(result, dict):
        return str(result.get("text", "")).strip()
    return str(getattr(result, "text", "")).strip()


def copy_artifacts(run_dir: Path, suite: str, variant: str, record: Dict[str, Any], metadata: Dict[str, Any]) -> Path:
    """Copy generated audio and record metadata into the validation run directory."""

    source_audio = REPO_ROOT / str(record["output_audio_path"])
    if not source_audio.exists():
        raise RuntimeError(f"Generated audio not found on disk: {source_audio}")

    suite_dir = run_dir / suite / variant
    suite_dir.mkdir(parents=True, exist_ok=True)
    copied_audio = suite_dir / source_audio.name
    shutil.copy2(source_audio, copied_audio)
    (suite_dir / f"{source_audio.stem}.json").write_text(
        json.dumps(
            {
                "record": record,
                "metadata": metadata,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return copied_audio


def build_sample_result(
    *,
    suite: str,
    variant: str,
    model: Dict[str, Any],
    prompt_name: str,
    instruction: str,
    text: str,
    reference_audio: Optional[str],
    reference_text: Optional[str],
    record: Dict[str, Any],
    copied_audio_path: Path,
    transcript: str,
    similarity_threshold: float,
) -> SampleResult:
    """Assemble one sample result object from the generated artifacts."""

    metrics = summarize_audio(copied_audio_path)
    similarity = similarity_score(text, transcript)
    content_ok = similarity >= similarity_threshold and metrics["duration_sec"] > 0.3
    return SampleResult(
        suite=suite,
        variant=variant,
        model_label=str(model.get("label", model.get("model_id", variant))),
        model_id=str(model.get("model_id", "")),
        source=str(model.get("source", "")),
        inference_mode=str(model.get("inference_mode", "")),
        prompt_name=prompt_name,
        instruction=instruction,
        text=text,
        reference_audio=reference_audio,
        reference_text=reference_text,
        output_audio_path=str(record["output_audio_path"]),
        copied_audio_path=str(copied_audio_path),
        transcript=transcript,
        transcript_similarity=similarity,
        duration_sec=metrics["duration_sec"],
        rms=metrics["rms"],
        spectral_centroid=metrics["spectral_centroid"],
        zcr=metrics["zcr"],
        content_ok=content_ok,
        record=record,
    )


def generate_model_sample(
    session: requests.Session,
    api_base: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Request one generation through the unified model endpoint."""

    response = request_json(session, "POST", api_base, "/api/generate/model", payload)
    return dict(response["record"])


def generate_hybrid_sample(
    session: requests.Session,
    api_base: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Request one generation through the hybrid clone+instruct endpoint."""

    response = request_json(session, "POST", api_base, "/api/generate/hybrid-clone-instruct", payload)
    return dict(response["record"])


def create_clone_prompt(
    session: requests.Session,
    api_base: str,
    *,
    reference_audio_path: str,
    reference_text: str,
    base_model_id: str,
) -> Dict[str, Any]:
    """Create a reusable clone prompt from the reference audio."""

    payload = {
        "reference_audio_path": reference_audio_path,
        "reference_text": reference_text,
        "model_id": base_model_id,
        "x_vector_only_mode": False,
    }
    return request_json(session, "POST", api_base, "/api/clone-prompts/from-upload", payload)


def run_base_suite(
    *,
    session: requests.Session,
    api_base: str,
    run_dir: Path,
    models: Sequence[Dict[str, Any]],
    reference_audio_path: str,
    reference_text: str,
    probe_text: str,
    language: str,
    seed: int,
    similarity_threshold: float,
    explicit_base_model_id: str,
    explicit_base_ft_model_id: str,
    skipped_checks: List[str],
) -> List[SampleResult]:
    """Validate stock Base, clone-prompt reuse, and fine-tuned Base outputs."""

    stock_base = pick_model(
        models,
        name="stock base",
        model_id=explicit_base_model_id,
        source="stock",
        inference_mode="voice_clone",
        label_contains="1.7B",
    )
    ft_base = pick_model(
        models,
        name="fine-tuned base",
        model_id=explicit_base_ft_model_id,
        source="finetuned",
        inference_mode="voice_clone",
        label_contains="Base",
        required=False,
    )

    clone_prompt = create_clone_prompt(
        session,
        api_base,
        reference_audio_path=reference_audio_path,
        reference_text=reference_text,
        base_model_id=str(stock_base["model_id"]),
    )
    clone_prompt_path = str(clone_prompt["prompt_path"])

    results: List[SampleResult] = []

    base_payloads = [
        (
            "stock-direct",
            {
                "model_id": stock_base["model_id"],
                "text": probe_text,
                "language": language,
                "ref_audio_path": reference_audio_path,
                "ref_text": reference_text,
                "seed": seed,
            },
            stock_base,
            "direct",
        ),
        (
            "stock-clone-prompt",
            {
                "model_id": stock_base["model_id"],
                "text": probe_text,
                "language": language,
                "voice_clone_prompt_path": clone_prompt_path,
                "seed": seed,
            },
            stock_base,
            "clone_prompt",
        ),
    ]

    if ft_base:
        base_payloads.append(
            (
                "ft-direct",
                {
                    "model_id": ft_base["model_id"],
                    "text": probe_text,
                    "language": language,
                    "ref_audio_path": reference_audio_path,
                    "ref_text": reference_text,
                    "seed": seed,
                },
                ft_base,
                "direct",
            )
        )
    else:
        skipped_checks.append("base_ft: no fine-tuned Base checkpoint found yet, so ft-direct was skipped")

    for variant, payload, model, prompt_name in base_payloads:
        record = generate_model_sample(session, api_base, payload)
        copied_audio = copy_artifacts(
            run_dir,
            "base",
            variant,
            record,
            {
                "reference_audio": reference_audio_path,
                "reference_text": reference_text,
                "clone_prompt_path": clone_prompt_path if prompt_name == "clone_prompt" else None,
            },
        )
        transcript = transcribe_generated_audio(load_transcriber_cached(), copied_audio)
        results.append(
            build_sample_result(
                suite="base",
                variant=variant,
                model=model,
                prompt_name=prompt_name,
                instruction="",
                text=probe_text,
                reference_audio=reference_audio_path,
                reference_text=reference_text,
                record=record,
                copied_audio_path=copied_audio,
                transcript=transcript,
                similarity_threshold=similarity_threshold,
            )
        )

    return results


def run_customvoice_suite(
    *,
    session: requests.Session,
    api_base: str,
    run_dir: Path,
    models: Sequence[Dict[str, Any]],
    probe_text: str,
    language: str,
    seed: int,
    similarity_threshold: float,
    prompt_set: str,
    explicit_custom_model_id: str,
    explicit_custom_ft_model_id: str,
    speaker_override: str,
    skipped_checks: List[str],
) -> List[SampleResult]:
    """Validate stock and fine-tuned CustomVoice outputs across multiple instruct prompts."""

    stock_model = pick_model(
        models,
        name="stock customvoice",
        model_id=explicit_custom_model_id,
        source="stock",
        inference_mode="custom_voice",
        label_contains="1.7B",
    )
    ft_model = pick_model(
        models,
        name="fine-tuned customvoice",
        model_id=explicit_custom_ft_model_id,
        source="finetuned",
        inference_mode="custom_voice",
        label_contains="CustomVoice",
        required=False,
    )

    prompts = PROMPT_SETS[prompt_set]
    results: List[SampleResult] = []
    transcriber = load_transcriber_cached()

    for model_variant, model in [("stock", stock_model)] + ([("ft", ft_model)] if ft_model else []):
        speaker = speaker_override.strip() or str(model.get("default_speaker") or "")
        if not speaker:
            raise RuntimeError(f"{model_variant} CustomVoice model has no speaker and no --speaker override was provided.")

        for prompt_name, instruction in prompts:
            payload = {
                "model_id": model["model_id"],
                "speaker": speaker,
                "text": probe_text,
                "language": language,
                "instruct": instruction,
                "seed": seed,
            }
            record = generate_model_sample(session, api_base, payload)
            copied_audio = copy_artifacts(
                run_dir,
                "customvoice",
                f"{model_variant}-{prompt_name}",
                record,
                {
                    "speaker": speaker,
                    "instruction": instruction,
                },
            )
            transcript = transcribe_generated_audio(transcriber, copied_audio)
            results.append(
                build_sample_result(
                    suite="customvoice",
                    variant=f"{model_variant}-{prompt_name}",
                    model=model,
                    prompt_name=prompt_name,
                    instruction=instruction,
                    text=probe_text,
                    reference_audio=None,
                    reference_text=None,
                    record=record,
                    copied_audio_path=copied_audio,
                    transcript=transcript,
                    similarity_threshold=similarity_threshold,
                )
            )

    if not ft_model:
        skipped_checks.append(
            "customvoice_ft: no fine-tuned CustomVoice checkpoint found yet, so ft instruct prompts were skipped"
        )

    return results


def run_hybrid_suite(
    *,
    session: requests.Session,
    api_base: str,
    run_dir: Path,
    models: Sequence[Dict[str, Any]],
    reference_audio_path: str,
    reference_text: str,
    probe_text: str,
    language: str,
    seed: int,
    similarity_threshold: float,
    prompt_set: str,
    explicit_base_model_id: str,
    explicit_custom_ft_model_id: str,
    skipped_checks: List[str],
) -> List[SampleResult]:
    """Validate clone-prompt-plus-instruct behavior using the hybrid route."""

    base_model = pick_model(
        models,
        name="hybrid base",
        model_id=explicit_base_model_id,
        source="stock",
        inference_mode="voice_clone",
        label_contains="1.7B",
    )
    custom_model = pick_model(
        models,
        name="hybrid customvoice",
        model_id=explicit_custom_ft_model_id,
        source="finetuned",
        inference_mode="custom_voice",
        label_contains="CustomVoice",
    )

    prompts = PROMPT_SETS[prompt_set]
    results: List[SampleResult] = []
    transcriber = load_transcriber_cached()

    for prompt_name, instruction in prompts:
        payload = {
            "base_model_id": base_model["model_id"],
            "custom_model_id": custom_model["model_id"],
            "text": probe_text,
            "language": language,
            "instruct": instruction,
            "ref_audio_path": reference_audio_path,
            "ref_text": reference_text,
            "seed": seed,
        }
        record = generate_hybrid_sample(session, api_base, payload)
        copied_audio = copy_artifacts(
            run_dir,
            "hybrid",
            prompt_name,
            record,
            {
                "base_model_id": base_model["model_id"],
                "custom_model_id": custom_model["model_id"],
                "instruction": instruction,
                "reference_audio": reference_audio_path,
                "reference_text": reference_text,
            },
        )
        transcript = transcribe_generated_audio(transcriber, copied_audio)
        results.append(
            build_sample_result(
                suite="hybrid",
                variant=prompt_name,
                model={
                    "label": f"{base_model.get('label', '')} + {custom_model.get('label', '')}",
                    "model_id": f"{base_model['model_id']}::{custom_model['model_id']}",
                    "source": "hybrid",
                    "inference_mode": "hybrid_clone_instruct",
                },
                prompt_name=prompt_name,
                instruction=instruction,
                text=probe_text,
                reference_audio=reference_audio_path,
                reference_text=reference_text,
                record=record,
                copied_audio_path=copied_audio,
                transcript=transcript,
                similarity_threshold=similarity_threshold,
            )
        )

    return results


_TRANSCRIBER_CACHE: Dict[str, Any] = {}
TRANSCRIBER_MODEL_PATH = DEFAULT_ASR_MODEL


def load_transcriber_cached():
    """Load the Qwen3-ASR transcription model once per script invocation."""

    cache_key = str(TRANSCRIBER_MODEL_PATH)
    if cache_key in _TRANSCRIBER_CACHE:
        return _TRANSCRIBER_CACHE[cache_key]

    # Keep the ASR model outside the upstream repo and reuse the local wheel/model cache.
    transcriber = build_transcriber(TRANSCRIBER_MODEL_PATH)
    _TRANSCRIBER_CACHE[cache_key] = transcriber
    return transcriber


def write_report(
    run_dir: Path,
    health: Dict[str, Any],
    reference: Dict[str, Any],
    results: List[SampleResult],
    skipped_checks: List[str],
) -> None:
    """Write JSON and Markdown summaries for the current validation run."""

    payload = {
        "created_at": utc_stamp(),
        "health": health,
        "reference": reference,
        "results": [asdict(item) for item in results],
        "skipped_checks": skipped_checks,
    }
    (run_dir / "report.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines: List[str] = []
    lines.append("# Speech Quality Validation Report")
    lines.append("")
    lines.append(f"- created_at: `{payload['created_at']}`")
    lines.append(f"- runtime_mode: `{health.get('runtime_mode')}`")
    lines.append(f"- attention_implementation: `{health.get('attention_implementation')}`")
    lines.append(f"- reference_audio: `{reference['audio_path']}`")
    lines.append(f"- reference_text: `{reference['text']}`")
    lines.append(f"- probe_text: `{reference['probe_text']}`")
    lines.append(f"- prompt_set: `{reference['prompt_set']}`")
    lines.append(f"- transcript_similarity_threshold: `{reference['similarity_threshold']}`")
    lines.append("")

    by_suite: Dict[str, List[SampleResult]] = {}
    for item in results:
        by_suite.setdefault(item.suite, []).append(item)

    for suite_name, suite_results in by_suite.items():
        lines.append(f"## {suite_name}")
        lines.append("")
        lines.append(
            f"- samples: `{len(suite_results)}`"
        )
        lines.append(
            f"- transcript_similarity: min `{min(item.transcript_similarity for item in suite_results):.3f}`, "
            f"mean `{mean(item.transcript_similarity for item in suite_results):.3f}`, "
            f"max `{max(item.transcript_similarity for item in suite_results):.3f}`"
        )
        lines.append(
            f"- duration_sec: min `{min(item.duration_sec for item in suite_results):.2f}`, "
            f"mean `{mean(item.duration_sec for item in suite_results):.2f}`, "
            f"max `{max(item.duration_sec for item in suite_results):.2f}`"
        )
        lines.append("")
        lines.append("| variant | prompt | similarity | duration | content_ok | transcript | audio |")
        lines.append("| --- | --- | ---: | ---: | --- | --- | --- |")
        for item in suite_results:
            transcript = item.transcript.replace("|", "\\|")
            lines.append(
                f"| {item.variant} | {item.prompt_name} | {item.transcript_similarity:.3f} | "
                f"{item.duration_sec:.2f} | {str(item.content_ok).lower()} | {transcript} | "
                f"`{item.copied_audio_path}` |"
            )
        lines.append("")

    lines.append("## Notes")
    lines.append("")
    lines.append("- `content_ok` is only a loose intelligibility check; style differences still need listening.")
    lines.append("- `base` validates clone prompt reuse and Base FT output side by side.")
    lines.append("- `customvoice` validates instruct-following drift across neutral/angry/gentle/breathy prompts.")
    lines.append("- `hybrid` validates clone-prompt-plus-instruct behavior with a reusable reference style.")
    if skipped_checks:
        lines.append("")
        lines.append("## Skipped Checks")
        lines.append("")
        for item in skipped_checks:
            lines.append(f"- {item}")
    lines.append("")
    lines.append("## Raw Artifact Locations")
    lines.append("")
    lines.append(f"- run_dir: `{run_dir}`")
    lines.append(f"- report_json: `{run_dir / 'report.json'}`")
    lines.append(f"- report_md: `{run_dir / 'report.md'}`")

    (run_dir / "report.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    """Run the requested validation suite and write the final reports."""

    args = parse_args()
    global TRANSCRIBER_MODEL_PATH
    TRANSCRIBER_MODEL_PATH = Path(args.asr_model)

    run_root = Path(args.output_root)
    run_dir = run_root / utc_stamp()
    run_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    health = load_health(session, args.api_base)
    if health.get("runtime_mode") != "real" and not args.allow_simulation:
        raise SystemExit(
            "Backend is not in real runtime mode. Start the backend against actual models, or pass --allow-simulation if you only want a fake smoke test."
        )

    bootstrap = load_bootstrap(session, args.api_base)
    models = bootstrap.get("models", [])
    if not isinstance(models, list) or not models:
        raise SystemExit("Backend did not expose any models via /api/bootstrap.")

    reference_audio = resolve_reference_audio(args, bootstrap)
    reference_text = resolve_reference_text(session, args.api_base, reference_audio, args.reference_text)

    if not Path(args.asr_model).exists():
        print(
            f"[validate] Qwen3-ASR model path does not exist yet: {args.asr_model}. The ASR loader may download it on demand if available.",
            file=sys.stderr,
        )

    reference_copy = run_dir / "reference"
    reference_copy.mkdir(parents=True, exist_ok=True)
    reference_source = Path(reference_audio)
    if not reference_source.is_absolute():
        reference_source = REPO_ROOT / reference_source
    if reference_source.exists():
        shutil.copy2(reference_source, reference_copy / reference_source.name)
    (reference_copy / "reference.json").write_text(
        json.dumps(
            {
                "audio_path": reference_audio,
                "text": reference_text,
                "probe_text": args.probe_text,
                "language": args.language,
                "prompt_set": args.prompt_set,
                "api_base": args.api_base,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    results: List[SampleResult] = []
    skipped_checks: List[str] = []
    if args.suite in {"all", "base"}:
        results.extend(
            run_base_suite(
                session=session,
                api_base=args.api_base,
                run_dir=run_dir,
                models=models,
                reference_audio_path=reference_audio,
                reference_text=reference_text,
                probe_text=args.probe_text,
                language=args.language,
                seed=args.seed,
                similarity_threshold=args.similarity_threshold,
                explicit_base_model_id=args.base_model_id,
                explicit_base_ft_model_id=args.base_ft_model_id,
                skipped_checks=skipped_checks,
            )
        )

    if args.suite in {"all", "customvoice"}:
        results.extend(
            run_customvoice_suite(
                session=session,
                api_base=args.api_base,
                run_dir=run_dir,
                models=models,
                probe_text=args.probe_text,
                language=args.language,
                seed=args.seed,
                similarity_threshold=args.similarity_threshold,
                prompt_set=args.prompt_set,
                explicit_custom_model_id=args.customvoice_model_id,
                explicit_custom_ft_model_id=args.customvoice_ft_model_id,
                speaker_override=args.speaker,
                skipped_checks=skipped_checks,
            )
        )

    if args.suite in {"all", "hybrid"}:
        results.extend(
            run_hybrid_suite(
                session=session,
                api_base=args.api_base,
                run_dir=run_dir,
                models=models,
                reference_audio_path=reference_audio,
                reference_text=reference_text,
                probe_text=args.probe_text,
                language=args.language,
                seed=args.seed,
                similarity_threshold=args.similarity_threshold,
                prompt_set=args.prompt_set,
                explicit_base_model_id=args.hybrid_base_model_id or args.base_model_id,
                explicit_custom_ft_model_id=args.hybrid_custom_model_id or args.customvoice_ft_model_id,
                skipped_checks=skipped_checks,
            )
        )

    write_report(
        run_dir=run_dir,
        health=health,
        reference={
            "audio_path": reference_audio,
            "text": reference_text,
            "probe_text": args.probe_text,
            "similarity_threshold": args.similarity_threshold,
            "prompt_set": args.prompt_set,
        },
        results=results,
        skipped_checks=skipped_checks,
    )

    print(f"validation_run_dir={run_dir}")
    print(f"report_json={run_dir / 'report.json'}")
    print(f"report_md={run_dir / 'report.md'}")


if __name__ == "__main__":
    main()
