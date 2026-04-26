#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/app/backend"
VENV_DIR="${ROOT_DIR}/.venv"
MODELS_DIR="${ROOT_DIR}/data/models"
VENDOR_DIR="${ROOT_DIR}/vendor"
APPLIO_DIR="${APPLIO_REPO_ROOT:-${VENDOR_DIR}/Applio}"
MMAUDIO_DIR="${MMAUDIO_REPO_ROOT:-${VENDOR_DIR}/MMAudio}"
RVC_DIR="${ROOT_DIR}/data/rvc-models"
MMAUDIO_MODELS_DIR="${ROOT_DIR}/data/mmaudio"
PROFILE="${1:-all}"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "Virtual environment not found. Run ./scripts/setup_backend.sh first." >&2
  exit 1
fi

mkdir -p "${MODELS_DIR}"
mkdir -p "${VENDOR_DIR}"
mkdir -p "${RVC_DIR}"
mkdir -p "${MMAUDIO_MODELS_DIR}"
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
        ("openai/whisper-large-v3", "whisper-large-v3"),
    ],
    "all": [
        ("Qwen/Qwen3-TTS-Tokenizer-12Hz", "Qwen3-TTS-Tokenizer-12Hz"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "Qwen3-TTS-12Hz-0.6B-CustomVoice"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "Qwen3-TTS-12Hz-1.7B-CustomVoice"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
        ("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "Qwen3-TTS-12Hz-0.6B-Base"),
        ("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "Qwen3-TTS-12Hz-1.7B-Base"),
        ("openai/whisper-large-v3", "whisper-large-v3"),
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

APPLIO_REPO_URL="${APPLIO_REPO_URL:-https://github.com/IAHispano/Applio.git}"
MMAUDIO_REPO_URL="${MMAUDIO_REPO_URL:-https://github.com/hkchengrex/MMAudio.git}"
APPLIO_DEFAULT_RVC_MODEL_URL="${APPLIO_DEFAULT_RVC_MODEL_URL:-https://huggingface.co/SmlCoke/rvc-yui/resolve/main/weights/yui-mix-pro-hq-40k.pth}"
APPLIO_DEFAULT_RVC_INDEX_URL="${APPLIO_DEFAULT_RVC_INDEX_URL:-https://huggingface.co/SmlCoke/rvc-yui/resolve/main/index/added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index}"
APPLIO_DEFAULT_RVC_MODEL_FILENAME="${APPLIO_DEFAULT_RVC_MODEL_FILENAME:-yui-mix-pro-hq-40k.pth}"
APPLIO_DEFAULT_RVC_INDEX_FILENAME="${APPLIO_DEFAULT_RVC_INDEX_FILENAME:-added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index}"
APPLIO_SKIP_DEFAULT_RVC="${APPLIO_SKIP_DEFAULT_RVC:-0}"

if [[ ! -d "${APPLIO_DIR}/.git" ]]; then
  echo "Cloning Applio -> ${APPLIO_DIR}"
  git clone "${APPLIO_REPO_URL}" "${APPLIO_DIR}"
else
  echo "Applio already present at ${APPLIO_DIR}"
fi

if [[ ! -d "${MMAUDIO_DIR}/.git" ]]; then
  echo "Cloning MMAudio -> ${MMAUDIO_DIR}"
  git clone "${MMAUDIO_REPO_URL}" "${MMAUDIO_DIR}"
else
  echo "MMAudio already present at ${MMAUDIO_DIR}"
fi

RVC_MODEL_URL="${APPLIO_RVC_MODEL_URL:-}"
RVC_INDEX_URL="${APPLIO_RVC_INDEX_URL:-}"
RVC_MODEL_FILENAME="${APPLIO_RVC_MODEL_FILENAME:-}"
RVC_INDEX_FILENAME="${APPLIO_RVC_INDEX_FILENAME:-}"

if [[ -z "${RVC_MODEL_URL}" && -z "${RVC_INDEX_URL}" && "${APPLIO_SKIP_DEFAULT_RVC}" != "1" ]]; then
  echo "No explicit Applio/RVC model URLs provided. Downloading the default demo voice-conversion pair."
  RVC_MODEL_URL="${APPLIO_DEFAULT_RVC_MODEL_URL}"
  RVC_INDEX_URL="${APPLIO_DEFAULT_RVC_INDEX_URL}"
  RVC_MODEL_FILENAME="${APPLIO_DEFAULT_RVC_MODEL_FILENAME}"
  RVC_INDEX_FILENAME="${APPLIO_DEFAULT_RVC_INDEX_FILENAME}"
fi

if [[ -n "${RVC_MODEL_URL}" ]]; then
  TARGET_ARCHIVE="${RVC_DIR}/${RVC_MODEL_FILENAME:-$(basename "${RVC_MODEL_URL}")}"
  if [[ ! -f "${TARGET_ARCHIVE}" ]]; then
    echo "Downloading Applio/RVC model -> ${TARGET_ARCHIVE}"
    curl -L "${RVC_MODEL_URL}" -o "${TARGET_ARCHIVE}"
  else
    echo "Applio/RVC model already present: ${TARGET_ARCHIVE}"
  fi
fi

if [[ -n "${RVC_INDEX_URL}" ]]; then
  TARGET_INDEX="${RVC_DIR}/${RVC_INDEX_FILENAME:-$(basename "${RVC_INDEX_URL}")}"
  if [[ ! -f "${TARGET_INDEX}" ]]; then
    echo "Downloading Applio/RVC index -> ${TARGET_INDEX}"
    curl -L "${RVC_INDEX_URL}" -o "${TARGET_INDEX}"
  else
    echo "Applio/RVC index already present: ${TARGET_INDEX}"
  fi
fi

if [[ -z "${RVC_MODEL_URL}" || -z "${RVC_INDEX_URL}" ]]; then
  echo
  echo "Applio repository is present, but no default RVC voice-conversion model was downloaded."
  echo "Reason: provide APPLIO_RVC_MODEL_URL and APPLIO_RVC_INDEX_URL, or leave APPLIO_SKIP_DEFAULT_RVC unset so the built-in demo pair downloads."
  echo "Current RVC asset directory: ${RVC_DIR}"
fi

if [[ -n "${MMAUDIO_MODEL_URL:-}" ]]; then
  TARGET_ARCHIVE="${MMAUDIO_MODELS_DIR}/${MMAUDIO_MODEL_FILENAME:-$(basename "${MMAUDIO_MODEL_URL}")}"
  if [[ ! -f "${TARGET_ARCHIVE}" ]]; then
    echo "Downloading MMAudio model -> ${TARGET_ARCHIVE}"
    curl -L "${MMAUDIO_MODEL_URL}" -o "${TARGET_ARCHIVE}"
  else
    echo "MMAudio model already present: ${TARGET_ARCHIVE}"
  fi
fi

if [[ -n "${MMAUDIO_CONFIG_URL:-}" ]]; then
  TARGET_CONFIG="${MMAUDIO_MODELS_DIR}/${MMAUDIO_CONFIG_FILENAME:-$(basename "${MMAUDIO_CONFIG_URL}")}"
  if [[ ! -f "${TARGET_CONFIG}" ]]; then
    echo "Downloading MMAudio config -> ${TARGET_CONFIG}"
    curl -L "${MMAUDIO_CONFIG_URL}" -o "${TARGET_CONFIG}"
  else
    echo "MMAudio config already present: ${TARGET_CONFIG}"
  fi
fi

MMAUDIO_NSFW_MODEL_URL="${MMAUDIO_NSFW_MODEL_URL:-https://huggingface.co/phazei/NSFW_MMaudio/resolve/main/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors}"
if [[ "${PROFILE}" == "all" && -n "${MMAUDIO_NSFW_MODEL_URL:-}" ]]; then
  TARGET_NSFW_MODEL="${MMAUDIO_MODELS_DIR}/nsfw/${MMAUDIO_NSFW_MODEL_FILENAME:-mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors}"
  mkdir -p "$(dirname "${TARGET_NSFW_MODEL}")"
  if [[ ! -f "${TARGET_NSFW_MODEL}" ]]; then
    echo "Downloading MMAudio NSFW model -> ${TARGET_NSFW_MODEL}"
    curl -L "${MMAUDIO_NSFW_MODEL_URL}" -o "${TARGET_NSFW_MODEL}"
  else
    echo "MMAudio NSFW model already present: ${TARGET_NSFW_MODEL}"
  fi
fi

echo "Suggested next step:"
echo "  cd ${BACKEND_DIR} && source ../../.venv/bin/activate && uvicorn app.main:app --reload"
