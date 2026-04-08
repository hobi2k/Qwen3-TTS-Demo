#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/app/backend"
VENV_DIR="${BACKEND_DIR}/.venv311"
MODELS_DIR="${ROOT_DIR}/data/models"
PROFILE="${1:-all}"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "Virtual environment not found. Run ./scripts/setup_backend.sh first." >&2
  exit 1
fi

mkdir -p "${MODELS_DIR}"
source "${VENV_DIR}/bin/activate"

if [[ -f "${BACKEND_DIR}/.env" ]]; then
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

export HF_HUB_ENABLE_HF_TRANSFER="${HF_HUB_ENABLE_HF_TRANSFER:-1}"

python - "${MODELS_DIR}" "${PROFILE}" <<'PY'
import os
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

models_dir = Path(sys.argv[1])
profile = sys.argv[2]

profiles = {
    "core": [
        ("Qwen/Qwen3-TTS-Tokenizer-12Hz", "Qwen3-TTS-Tokenizer-12Hz"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "Qwen3-TTS-12Hz-0.6B-Base"),
    ],
    "all": [
        ("Qwen/Qwen3-TTS-Tokenizer-12Hz", "Qwen3-TTS-Tokenizer-12Hz"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "Qwen3-TTS-12Hz-1.7B-CustomVoice"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "Qwen3-TTS-12Hz-0.6B-Base"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "Qwen3-TTS-12Hz-1.7B-Base"),
    ],
}

if profile not in profiles:
    raise SystemExit(f"Unknown profile: {profile}. Use 'core' or 'all'.")

for repo_id, dirname in profiles[profile]:
    local_dir = models_dir / dirname
    print(f"Downloading {repo_id} -> {local_dir}")
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
        resume_download=True,
    )

env_path = Path(os.environ.get("QWEN_ENV_PATH", "")) if os.environ.get("QWEN_ENV_PATH") else None
print("Model download completed.")
PY

echo
echo "Downloaded model profile: ${PROFILE}"
echo "Models stored in: ${MODELS_DIR}"
echo "Suggested next step:"
echo "  cd ${BACKEND_DIR} && source .venv311/bin/activate && uvicorn app.main:app --reload"
