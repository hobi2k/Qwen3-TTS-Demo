#!/usr/bin/env python3
"""Compare stock Base voice-clone output against fine-tuned checkpoints.

The upstream Base trainer exports checkpoints as ``custom_voice`` models, so the
comparison here intentionally uses two different inference paths:

- stock Base 1.7B: voice clone with reference audio/text
- fine-tuned checkpoints: custom voice with the learned speaker name

This lets us compare what the user will actually hear from each checkpoint in
the current demo application.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKEND_PORT = os.getenv("BACKEND_PORT", "8190")
DEFAULT_API_BASE = os.getenv("VOICE_STUDIO_API_BASE", f"http://127.0.0.1:{DEFAULT_BACKEND_PORT}")
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "generated" / "base-checkpoint-comparisons"
DEFAULT_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_LANGUAGE = "Korean"
DEFAULT_REF_AUDIO = "data/datasets/mai_ko_full/audio/00000.wav"
DEFAULT_STOCK_BASE = str(REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base")
DEFAULT_CHECKPOINTS = [
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-0"),
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-1"),
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-2"),
]


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for checkpoint comparison.

    Returns:
        Parsed command-line namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--ref-audio-path", default=DEFAULT_REF_AUDIO)
    parser.add_argument("--speaker", default="mai")
    parser.add_argument("--stock-base-model-id", default=DEFAULT_STOCK_BASE)
    parser.add_argument("--checkpoint-model-id", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def request_json(session: requests.Session, method: str, api_base: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    """Send one JSON request to the demo backend.

    Args:
        session: Shared requests session.
        method: HTTP verb.
        api_base: API origin such as `http://127.0.0.1:8190`.
        path: API path.
        payload: Optional JSON body.

    Returns:
        Parsed JSON response.
    """

    response = session.request(method, f"{api_base.rstrip('/')}/{path.lstrip('/')}", json=payload, timeout=1800)
    response.raise_for_status()
    return response.json()


def transcribe_generated_audio(session: requests.Session, api_base: str, audio_path: str) -> str:
    """Transcribe a generated output file through the backend Qwen3-ASR route.

    Args:
        session: Shared requests session.
        api_base: API origin.
        audio_path: Project-relative generated audio path.

    Returns:
        Qwen3-ASR transcription text.
    """

    response = request_json(
        session,
        "POST",
        api_base,
        "/api/transcriptions/reference-audio",
        {"audio_path": audio_path},
    )
    return str(response["text"]).strip()


def generate_stock_base(session: requests.Session, api_base: str, *, model_id: str, text: str, language: str, ref_audio_path: str) -> dict[str, Any]:
    """Generate one sample with the stock Base clone path.

    Args:
        session: Shared requests session.
        api_base: API origin.
        model_id: Stock Base model path.
        text: Spoken text.
        language: Language label.
        ref_audio_path: Reference audio path.

    Returns:
        Backend generation record.
    """

    response = request_json(
        session,
        "POST",
        api_base,
        "/api/generate/model",
        {
            "model_id": model_id,
            "text": text,
            "language": language,
            "ref_audio_path": ref_audio_path,
            "seed": 7,
        },
    )
    return dict(response["record"])


def generate_finetuned_checkpoint(
    session: requests.Session,
    api_base: str,
    *,
    model_id: str,
    text: str,
    language: str,
    speaker: str,
) -> dict[str, Any]:
    """Generate one sample with a fine-tuned checkpoint.

    Args:
        session: Shared requests session.
        api_base: API origin.
        model_id: Fine-tuned checkpoint directory.
        text: Spoken text.
        language: Language label.
        speaker: Speaker name stored in the checkpoint config.

    Returns:
        Backend generation record.
    """

    response = request_json(
        session,
        "POST",
        api_base,
        "/api/generate/model",
        {
            "model_id": model_id,
            "text": text,
            "language": language,
            "speaker": speaker,
            "seed": 7,
        },
    )
    return dict(response["record"])


def write_reports(output_dir: Path, rows: list[dict[str, Any]]) -> None:
    """Write JSON and Markdown summaries for one comparison run.

    Args:
        output_dir: Run directory under `data/generated`.
        rows: Result rows collected from the backend.
    """

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Base Checkpoint Comparison",
        "",
        "| Variant | Model | Transcript | Output |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['variant']} | `{row['model_id']}` | {row['transcript']} | `{row['output_audio_path']}` |"
        )
    (output_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    """Run stock-vs-checkpoint generation and emit a comparison report."""

    args = parse_args()
    checkpoints = args.checkpoint_model_id or DEFAULT_CHECKPOINTS
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = Path(args.output_dir) / stamp

    rows: list[dict[str, Any]] = []
    with requests.Session() as session:
        stock_record = generate_stock_base(
            session,
            args.api_base,
            model_id=args.stock_base_model_id,
            text=args.text,
            language=args.language,
            ref_audio_path=args.ref_audio_path,
        )
        rows.append(
            {
                "variant": "stock-base",
                "model_id": args.stock_base_model_id,
                "output_audio_path": stock_record["output_audio_path"],
                "transcript": transcribe_generated_audio(session, args.api_base, stock_record["output_audio_path"]),
            }
        )

        for checkpoint in checkpoints:
            record = generate_finetuned_checkpoint(
                session,
                args.api_base,
                model_id=checkpoint,
                text=args.text,
                language=args.language,
                speaker=args.speaker,
            )
            rows.append(
                {
                    "variant": Path(checkpoint).name,
                    "model_id": checkpoint,
                    "output_audio_path": record["output_audio_path"],
                    "transcript": transcribe_generated_audio(session, args.api_base, record["output_audio_path"]),
                }
            )

    write_reports(output_dir, rows)
    print(output_dir)


if __name__ == "__main__":
    main()
