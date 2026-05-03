#!/usr/bin/env python3
"""Compare stock and fine-tuned CustomVoice checkpoints through the demo API."""

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
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "generated" / "customvoice-checkpoint-comparisons"
DEFAULT_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_LANGUAGE = "Korean"
DEFAULT_STOCK_MODEL = str(REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice")
DEFAULT_CHECKPOINTS = [
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-0"),
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-1"),
    str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-2"),
]
PROMPTS = {
    "neutral": "자연스럽고 또박또박, 담담하게 읽어주세요.",
    "breathy_intimate": "숨결이 느껴지는 breathy한 톤으로, 아주 가까이 속삭이듯 읽어주세요.",
    "cold_detached": "차갑고 감정을 눌러 담은 말투로, 거리를 두듯 절제해서 읽어주세요.",
}


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for CustomVoice checkpoint comparison."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--stock-model-id", default=DEFAULT_STOCK_MODEL)
    parser.add_argument("--stock-speaker", default="Sohee")
    parser.add_argument("--speaker", default="mai")
    parser.add_argument("--checkpoint-model-id", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def request_json(session: requests.Session, method: str, api_base: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    """Send a JSON request to the local backend."""

    response = session.request(method, f"{api_base.rstrip('/')}/{path.lstrip('/')}", json=payload, timeout=1800)
    response.raise_for_status()
    return response.json()


def transcribe_generated_audio(session: requests.Session, api_base: str, audio_path: str) -> str:
    """Transcribe one generated audio file through the backend."""

    response = request_json(
        session,
        "POST",
        api_base,
        "/api/transcriptions/reference-audio",
        {"audio_path": audio_path},
    )
    return str(response["text"]).strip()


def generate_customvoice(
    session: requests.Session,
    api_base: str,
    *,
    model_id: str,
    speaker: str,
    text: str,
    language: str,
    instruct: str,
) -> dict[str, Any]:
    """Generate one CustomVoice sample through the unified inference endpoint."""

    response = request_json(
        session,
        "POST",
        api_base,
        "/api/generate/model",
        {
            "model_id": model_id,
            "speaker": speaker,
            "text": text,
            "language": language,
            "instruct": instruct,
            "seed": 7,
        },
    )
    return dict(response["record"])


def write_reports(output_dir: Path, rows: list[dict[str, Any]]) -> None:
    """Write JSON and Markdown summaries for one run."""

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# CustomVoice Checkpoint Comparison",
        "",
        "| Variant | Prompt | Transcript | Output |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['variant']} | {row['prompt']} | {row['transcript']} | `{row['output_audio_path']}` |"
        )
    (output_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    """Run stock and fine-tuned CustomVoice comparisons across instruct prompts."""

    args = parse_args()
    checkpoints = args.checkpoint_model_id or DEFAULT_CHECKPOINTS
    run_dir = Path(args.output_dir) / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    rows: list[dict[str, Any]] = []
    with requests.Session() as session:
        variants = [("stock-customvoice", args.stock_model_id, args.stock_speaker)]
        variants.extend((Path(item).name, item, args.speaker) for item in checkpoints)

        for variant_name, model_id, speaker in variants:
            for prompt_name, instruct in PROMPTS.items():
                record = generate_customvoice(
                    session,
                    args.api_base,
                    model_id=model_id,
                    speaker=speaker,
                    text=args.text,
                    language=args.language,
                    instruct=instruct,
                )
                rows.append(
                    {
                        "variant": variant_name,
                        "prompt": prompt_name,
                        "model_id": model_id,
                        "speaker": speaker,
                        "output_audio_path": record["output_audio_path"],
                        "transcript": transcribe_generated_audio(session, args.api_base, record["output_audio_path"]),
                    }
                )

    write_reports(run_dir, rows)
    print(run_dir)


if __name__ == "__main__":
    main()
