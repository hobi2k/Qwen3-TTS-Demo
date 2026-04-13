#!/usr/bin/env python3
"""Validate clone-prompt plus instruct hybrid inference through the demo API."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_API_BASE = "http://127.0.0.1:8000"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "generated" / "hybrid-validations"
DEFAULT_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_LANGUAGE = "Korean"
DEFAULT_REF_AUDIO = "data/datasets/mai_ko_full/audio/00000.wav"
DEFAULT_BASE_MODEL = str(REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base")
DEFAULT_CUSTOM_MODEL = str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-2")
DEFAULT_INSTRUCT = "숨결이 느껴지는 breathy한 톤으로, 아주 가까이 속삭이듯 읽어주세요."


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for hybrid validation."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--ref-audio-path", default=DEFAULT_REF_AUDIO)
    parser.add_argument("--base-model-id", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--custom-model-id", default=DEFAULT_CUSTOM_MODEL)
    parser.add_argument("--instruct", default=DEFAULT_INSTRUCT)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def request_json(session: requests.Session, method: str, api_base: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    response = session.request(method, f"{api_base.rstrip('/')}/{path.lstrip('/')}", json=payload, timeout=1800)
    response.raise_for_status()
    return response.json()


def main() -> None:
    """Run one hybrid inference sample and store a summary."""

    args = parse_args()
    with requests.Session() as session:
        response = request_json(
            session,
            "POST",
            args.api_base,
            "/api/generate/hybrid-clone-instruct",
            {
                "base_model_id": args.base_model_id,
                "custom_model_id": args.custom_model_id,
                "text": args.text,
                "language": args.language,
                "instruct": args.instruct,
                "ref_audio_path": args.ref_audio_path,
                "seed": 7,
            },
        )
        record = dict(response["record"])
        transcript = request_json(
            session,
            "POST",
            args.api_base,
            "/api/transcriptions/reference-audio",
            {"audio_path": record["output_audio_path"]},
        )["text"]

    run_dir = Path(args.output_dir) / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "base_model_id": args.base_model_id,
        "custom_model_id": args.custom_model_id,
        "text": args.text,
        "instruct": args.instruct,
        "output_audio_path": record["output_audio_path"],
        "transcript": transcript,
    }
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (run_dir / "summary.md").write_text(
        "\n".join(
            [
                "# Hybrid Validation",
                "",
                f"- output: `{record['output_audio_path']}`",
                f"- transcript: {transcript}",
                f"- instruct: {args.instruct}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    print(run_dir)


if __name__ == "__main__":
    main()
