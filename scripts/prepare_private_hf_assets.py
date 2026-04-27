#!/usr/bin/env python3
"""Prepare project model assets for a private Hugging Face repository.

The download scripts can restore auxiliary assets from a private repository
when `PRIVATE_ASSET_REPO_ID` is set. This script creates the upload manifest for
that repository and can optionally upload the files.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "docs" / "manifests" / "private-hf-assets.json"

MODEL_DIRS = [
    "Qwen3-TTS-Tokenizer-12Hz",
    "Qwen3-TTS-12Hz-0.6B-Base",
    "Qwen3-TTS-12Hz-1.7B-Base",
    "Qwen3-TTS-12Hz-0.6B-CustomVoice",
    "Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "whisper-large-v3",
]

AUXILIARY_PATHS = [
    "data/rvc-models",
    "data/mmaudio/nsfw",
    "data/stem-separator-models",
    "data/models/fish-speech/s2-pro",
    "data/models/ace-step",
]


@dataclass
class AssetEntry:
    """One file that can be uploaded to the private asset repository."""

    local_path: str
    repo_path: str
    size_bytes: int
    category: str
    exists: bool


def iter_files(path: Path) -> Iterable[Path]:
    """Yield regular files under a path in deterministic order."""

    if path.is_file():
        yield path
        return
    if not path.exists():
        return
    for item in sorted(path.rglob("*")):
        relative_parts = item.relative_to(path).parts
        if ".cache" in relative_parts or ".git" in relative_parts:
            continue
        if item.is_file() and item.name != ".gitkeep" and item.name != "download_checks.json":
            yield item


def collect_assets(include_public_models: bool) -> list[AssetEntry]:
    """Collect local model and auxiliary files into the target repo layout."""

    entries: list[AssetEntry] = []

    if include_public_models:
        for dirname in MODEL_DIRS:
            root = REPO_ROOT / "data" / "models" / dirname
            for file_path in iter_files(root):
                repo_path = Path("models") / dirname / file_path.relative_to(root)
                entries.append(asset_entry(file_path, repo_path, "model"))

    for rel_root in AUXILIARY_PATHS:
        root = REPO_ROOT / rel_root
        for file_path in iter_files(root):
            if rel_root == "data/models/fish-speech/s2-pro":
                repo_path = Path("fish-speech") / "s2-pro" / file_path.relative_to(root)
            elif rel_root == "data/models/ace-step":
                repo_path = Path("ace-step") / file_path.relative_to(root)
            else:
                repo_path = file_path.relative_to(REPO_ROOT / "data")
            entries.append(asset_entry(file_path, repo_path, "auxiliary"))

    return entries


def asset_entry(file_path: Path, repo_path: Path, category: str) -> AssetEntry:
    """Create a manifest entry for one local file."""

    return AssetEntry(
        local_path=str(file_path.relative_to(REPO_ROOT)),
        repo_path=repo_path.as_posix(),
        size_bytes=file_path.stat().st_size if file_path.exists() else 0,
        category=category,
        exists=file_path.exists(),
    )


def write_manifest(entries: list[AssetEntry], manifest_path: Path, repo_id: str | None) -> None:
    """Write the upload manifest JSON."""

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    total_bytes = sum(item.size_bytes for item in entries if item.exists)
    payload = {
        "schema": "qwen3-tts-demo-private-assets-v1",
        "target_repo_id": repo_id or "${PRIVATE_ASSET_REPO_ID}",
        "target_repo_type": "model",
        "download_env": {
            "PRIVATE_ASSET_REPO_ID": repo_id or "<your-hf-username>/<private-model-assets-repo>",
            "PRIVATE_ASSET_REVISION": "main",
            "QWEN_USE_PRIVATE_ASSET_REPO": "1",
        },
        "layout": {
            "models": "models/<model-dir>/...",
            "fish_speech_s2_pro": "fish-speech/s2-pro/...",
            "ace_step": "ace-step/...",
            "rvc": "rvc-models/<model>.pth and <model>.index",
            "mmaudio": "mmaudio/nsfw/<checkpoint>.safetensors",
            "stem_separator": "stem-separator-models/<model>.ckpt and <model>.yaml",
        },
        "total_files": len(entries),
        "total_size_bytes": total_bytes,
        "assets": [asdict(item) for item in entries],
    }
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upload_assets(entries: list[AssetEntry], repo_id: str, private: bool, message: str) -> None:
    """Upload manifest-listed files to Hugging Face Hub."""

    from huggingface_hub import HfApi, HfFolder, create_repo

    token = os.environ.get("HF_TOKEN") or HfFolder.get_token()
    if not token:
        raise SystemExit("No Hugging Face token found. Set HF_TOKEN or run `huggingface-cli login`.")

    api = HfApi(token=token)
    create_repo(repo_id=repo_id, repo_type="model", private=private, exist_ok=True, token=token)
    for entry in entries:
        if not entry.exists:
            continue
        local_path = REPO_ROOT / entry.local_path
        print(f"Uploading {entry.local_path} -> {repo_id}/{entry.repo_path}")
        api.upload_file(
            repo_id=repo_id,
            repo_type="model",
            path_or_fileobj=str(local_path),
            path_in_repo=entry.repo_path,
            commit_message=message,
        )


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(description="Prepare or upload private Hugging Face asset files.")
    parser.add_argument("--repo-id", default=os.environ.get("PRIVATE_ASSET_REPO_ID"), help="Target Hugging Face repo id.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="Manifest JSON path.")
    parser.add_argument("--include-public-models", action="store_true", help="Also include Qwen/Whisper model mirrors under data/models.")
    parser.add_argument("--upload", action="store_true", help="Upload files after writing the manifest.")
    parser.add_argument("--private", action="store_true", help="Create the target Hugging Face repo as private when uploading.")
    parser.add_argument("--message", default="Upload Qwen3-TTS-Demo private assets", help="Hub commit message.")
    return parser.parse_args()


def main() -> None:
    """Create the manifest and optionally upload assets."""

    args = parse_args()
    entries = collect_assets(include_public_models=args.include_public_models)
    write_manifest(entries, args.manifest, args.repo_id)
    missing = [item.local_path for item in entries if not item.exists]
    print(f"Wrote manifest: {args.manifest}")
    print(f"Prepared files: {len(entries)}")
    print(f"Missing files: {len(missing)}")
    if args.upload:
        if not args.repo_id:
            raise SystemExit("--repo-id or PRIVATE_ASSET_REPO_ID is required when --upload is used.")
        upload_assets(entries, args.repo_id, private=args.private, message=args.message)


if __name__ == "__main__":
    main()
