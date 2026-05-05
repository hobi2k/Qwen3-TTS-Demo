#!/usr/bin/env python3
"""Verify preset-generation timbre similarity against a reference wav.

This is a focused quality gate for Qwen preset workflows. It uses the same
Qwen Base speaker encoder already used by local quality reports, then fails if
any generated candidate falls below the requested cosine-similarity threshold.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import evaluate_customvoice_voicebox_quality as quality  # noqa: E402


DEFAULT_SPEAKER_ENCODER = REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base"


def parse_candidate(value: str) -> tuple[str, Path]:
    """Parse either label=path or a bare path."""

    if "=" in value:
        label, raw_path = value.split("=", 1)
        label = label.strip()
        path = Path(raw_path.strip())
    else:
        path = Path(value.strip())
        label = path.stem
    if not label:
        raise argparse.ArgumentTypeError(f"Candidate label is empty: {value}")
    if not path.is_absolute():
        path = REPO_ROOT / path
    return label, path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", required=True, help="Reference wav path.")
    parser.add_argument(
        "--candidate",
        action="append",
        type=parse_candidate,
        required=True,
        help="Candidate wav as label=path. Repeat for multiple generated files.",
    )
    parser.add_argument("--speaker-encoder", default=str(DEFAULT_SPEAKER_ENCODER))
    parser.add_argument("--threshold", type=float, default=0.97)
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    reference = Path(args.reference)
    if not reference.is_absolute():
        reference = REPO_ROOT / reference
    speaker_encoder = Path(args.speaker_encoder)
    if not speaker_encoder.is_absolute():
        speaker_encoder = REPO_ROOT / speaker_encoder

    encoder = quality.load_speaker_encoder(speaker_encoder)
    reference_embedding = quality.speaker_embedding(encoder, reference)

    rows: list[dict[str, object]] = []
    failed: list[str] = []
    for label, candidate in args.candidate:
        embedding = quality.speaker_embedding(encoder, candidate)
        similarity = quality.cosine(reference_embedding, embedding)
        audio_summary = quality.summarize_audio(candidate)
        ok = similarity >= args.threshold
        if not ok:
            failed.append(label)
        rows.append(
            {
                "label": label,
                "path": str(candidate.relative_to(REPO_ROOT) if candidate.is_relative_to(REPO_ROOT) else candidate),
                "speaker_similarity": round(similarity, 4),
                "threshold": args.threshold,
                "ok": ok,
                "duration_sec": round(float(audio_summary["duration_sec"]), 4),
                "rms": round(float(audio_summary["rms"]), 4),
                "peak": round(float(audio_summary["peak"]), 4),
                "spectral_centroid": round(float(audio_summary["spectral_centroid"]), 4),
                "zcr": round(float(audio_summary["zcr"]), 4),
            }
        )

    payload = {
        "reference": str(reference.relative_to(REPO_ROOT) if reference.is_relative_to(REPO_ROOT) else reference),
        "speaker_encoder": str(speaker_encoder.relative_to(REPO_ROOT) if speaker_encoder.is_relative_to(REPO_ROOT) else speaker_encoder),
        "threshold": args.threshold,
        "rows": rows,
        "failed": failed,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"reference: {payload['reference']}")
        print(f"speaker_encoder: {payload['speaker_encoder']}")
        print(f"threshold: {args.threshold:.4f}")
        for row in rows:
            status = "PASS" if row["ok"] else "FAIL"
            print(f"{status} {row['label']}: similarity={row['speaker_similarity']:.4f} path={row['path']}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
