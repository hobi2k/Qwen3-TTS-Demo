"""Import the external mai_ko dataset into project-managed training assets.

This script copies the Korean `mai_ko` source dataset into the repository so
fine-tuning can be reproduced without depending on the original Windows path.
Each imported dataset is stored under one self-contained directory:
`data/datasets/<dataset_id>/`.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import librosa
import soundfile as sf

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_ROOT))

from app.backend.app.storage import utc_now


@dataclass
class SampleRow:
    """Represent one imported sample row."""

    source_audio: Path
    relative_audio: Path
    text: str


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Returns:
        Parsed command line namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-root",
        default="/mnt/d/tts_data/mai_ko",
        help="External dataset root that contains metadata_raw.csv and audio/",
    )
    parser.add_argument(
        "--dataset-id",
        default="mai_ko_full",
        help="Identifier used for the imported dataset record.",
    )
    parser.add_argument(
        "--speaker-name",
        default="mai",
        help="Speaker name to expose inside the training UI.",
    )
    parser.add_argument(
        "--copy-dir",
        default="data/datasets/mai_ko_full",
        help="Project-relative dataset root that will contain audio, JSONL, and manifests.",
    )
    parser.add_argument(
        "--val-count",
        type=int,
        default=16,
        help="How many tail samples to reserve for eval-only JSONL.",
    )
    return parser.parse_args()


def repo_root() -> Path:
    """Return the repository root."""

    return SCRIPT_ROOT


def read_metadata(metadata_csv: Path, copy_root: Path) -> list[SampleRow]:
    """Read metadata_raw.csv and map it to normalized sample rows.

    Args:
        metadata_csv: Source metadata CSV path.
        copy_root: Destination dataset root inside the repository.

    Returns:
        Normalized sample rows.
    """

    rows: list[SampleRow] = []
    with metadata_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for index, row in enumerate(reader):
            wav_value = str(row.get("wav") or "").strip()
            text_value = str(row.get("text") or "").strip()
            if not wav_value or not text_value:
                continue

            source_audio = Path(wav_value)
            normalized_name = f"{index:05d}.wav"
            relative_audio = copy_root.relative_to(repo_root()) / "audio" / normalized_name
            rows.append(
                SampleRow(
                    source_audio=source_audio,
                    relative_audio=relative_audio,
                    text=text_value,
                )
            )
    return rows


def ensure_copied_audio(rows: Iterable[SampleRow], destination_audio_dir: Path) -> None:
    """Copy source audio files into the project-managed dataset directory.

    Args:
        rows: Sample rows to import.
        destination_audio_dir: Destination audio directory.
    """

    destination_audio_dir.mkdir(parents=True, exist_ok=True)
    for row in rows:
        if not row.source_audio.exists():
            raise FileNotFoundError(f"Missing source audio: {row.source_audio}")
        target = destination_audio_dir / row.relative_audio.name
        if target.exists():
            continue

        # The upstream fine-tuning dataset loader expects 24 kHz mono reference audio.
        # Normalize imported samples during copy so later training and debugging do not
        # depend on the original recording sample rate.
        audio, sr = sf.read(str(row.source_audio), always_2d=False)
        if getattr(audio, "ndim", 1) > 1:
            audio = audio.mean(axis=1)
        if int(sr) != 24000:
            audio = librosa.resample(audio.astype("float32"), orig_sr=int(sr), target_sr=24000)
            sr = 24000
        sf.write(str(target), audio, int(sr))


def write_jsonl(path: Path, rows: Iterable[SampleRow], ref_audio_rel: str) -> None:
    """Write a Qwen3-TTS raw JSONL file.

    Args:
        path: Output JSONL path.
        rows: Sample rows to serialize.
        ref_audio_rel: Reference audio path stored in each row.
    """

    lines = []
    for row in rows:
        lines.append(
            json.dumps(
                {
                    "audio": row.relative_audio.as_posix(),
                    "text": row.text,
                    "ref_audio": ref_audio_rel,
                },
                ensure_ascii=False,
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    """Import the Korean dataset, copy audio, and write training artifacts."""

    args = parse_args()
    root = repo_root()
    source_root = Path(args.source_root)
    metadata_csv = source_root / "metadata_raw.csv"
    if not metadata_csv.exists():
        raise FileNotFoundError(f"metadata_raw.csv not found under {source_root}")

    copy_root = root / args.copy_dir
    destination_audio_dir = copy_root / "audio"
    rows = read_metadata(metadata_csv, copy_root)
    if not rows:
        raise RuntimeError("No dataset rows were parsed from metadata_raw.csv")

    ensure_copied_audio(rows, destination_audio_dir)

    val_count = max(0, min(args.val_count, len(rows)))
    train_rows = rows[:-val_count] if val_count else rows
    eval_rows = rows[-val_count:] if val_count else []
    ref_audio_rel = rows[0].relative_audio.as_posix()

    copy_root.mkdir(parents=True, exist_ok=True)
    train_jsonl = copy_root / "train_raw.jsonl"
    eval_jsonl = copy_root / "eval_raw.jsonl"
    combined_jsonl = copy_root / "raw.jsonl"

    write_jsonl(train_jsonl, train_rows, ref_audio_rel)
    write_jsonl(combined_jsonl, rows, ref_audio_rel)
    if eval_rows:
        write_jsonl(eval_jsonl, eval_rows, ref_audio_rel)

    copy_manifest = {
        "id": args.dataset_id,
        "speaker_name": args.speaker_name,
        "source_root": str(source_root),
        "copied_root": str(copy_root),
        "metadata_csv": str(metadata_csv),
        "ref_audio_path": ref_audio_rel,
        "sample_count": len(rows),
        "train_count": len(train_rows),
        "eval_count": len(eval_rows),
        "train_jsonl": str(train_jsonl),
        "eval_jsonl": str(eval_jsonl) if eval_rows else None,
        "raw_jsonl": str(combined_jsonl),
        "created_at": utc_now(),
    }
    (copy_root / "manifest.json").write_text(json.dumps(copy_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    dataset_record = {
        "id": args.dataset_id,
        "name": args.dataset_id,
        "source_type": "imported_korean_csv",
        "raw_jsonl_path": str(combined_jsonl.relative_to(root)).replace("\\", "/"),
        "prepared_jsonl_path": None,
        "prepared_with_simulation": None,
        "prepared_tokenizer_model_path": None,
        "prepared_device": None,
        "ref_audio_path": ref_audio_rel,
        "speaker_name": args.speaker_name,
        "sample_count": len(rows),
        "created_at": utc_now(),
    }
    (copy_root / "dataset.json").write_text(
        json.dumps(dataset_record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(copy_manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
