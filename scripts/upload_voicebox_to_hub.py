#!/usr/bin/env python3
"""Upload a fine-tuned VoiceBox checkpoint folder to Hugging Face Hub."""

from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import HfApi, HfFolder, create_repo


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox Hub upload."""

    parser = argparse.ArgumentParser(description="Upload a VoiceBox checkpoint to Hugging Face Hub.")
    parser.add_argument("--checkpoint", required=True, help="Checkpoint folder to upload.")
    parser.add_argument("--repo-id", required=True, help="Target Hub repo id, e.g. username/Qwen3-TTS-1.7B-voicebox")
    parser.add_argument("--private", action="store_true", help="Create the repository as private.")
    parser.add_argument("--message", default="Upload VoiceBox checkpoint", help="Commit message.")
    return parser.parse_args()


def main() -> None:
    """Create the target repo if needed and upload the checkpoint folder."""

    args = parse_args()
    checkpoint = Path(args.checkpoint).resolve()
    if not checkpoint.exists():
        raise SystemExit(f"Checkpoint not found: {checkpoint}")

    token = HfFolder.get_token()
    if not token:
        raise SystemExit(
            "No Hugging Face token was found. Set HF_TOKEN or run `huggingface-cli login` before uploading."
        )

    api = HfApi(token=token)
    create_repo(
        repo_id=args.repo_id,
        repo_type="model",
        private=args.private,
        exist_ok=True,
        token=token,
    )
    api.upload_folder(
        repo_id=args.repo_id,
        repo_type="model",
        folder_path=str(checkpoint),
        commit_message=args.message,
    )
    print(f"Uploaded {checkpoint} -> https://huggingface.co/{args.repo_id}")


if __name__ == "__main__":
    main()
