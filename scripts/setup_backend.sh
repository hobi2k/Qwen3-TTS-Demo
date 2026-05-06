#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/app/backend"
UPSTREAM_DIR="${ROOT_DIR}/vendor/Qwen3-TTS"
QWEN_EXTENSIONS_DIR="${ROOT_DIR}/qwen_extensions"
VENV_DIR="${ROOT_DIR}/.venv"
MMAUDIO_VENV="${ROOT_DIR}/.venv-mmaudio"
VENDOR_DIR="${ROOT_DIR}/vendor"
FLASH_ATTN_WHEEL_URL="https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.9.4/flash_attn-2.8.3+cu130torch2.11-cp311-cp311-linux_x86_64.whl"

if [[ -n "${QWEN_DEMO_PYTHON:-}" ]]; then
  PYTHON_BIN="${QWEN_DEMO_PYTHON}"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "Python 3.11+ interpreter not found." >&2
  exit 1
fi

echo "Using Python: ${PYTHON_BIN}"
echo "Repo root: ${ROOT_DIR}"

export UV_CACHE_DIR="${UV_CACHE_DIR:-${ROOT_DIR}/.uv-cache}"
mkdir -p "${VENDOR_DIR}"

if [[ ! -d "${UPSTREAM_DIR}" ]]; then
  echo "vendor/Qwen3-TTS is missing. This repository expects Qwen3-TTS to be vendored under ${UPSTREAM_DIR}." >&2
  exit 1
fi

if [[ ! -d "${QWEN_EXTENSIONS_DIR}" ]]; then
  echo "qwen_extensions is missing. CustomVoice/VoiceBox fine-tuning scripts are expected under ${QWEN_EXTENSIONS_DIR}." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but not installed." >&2
  exit 1
fi

if ! command -v sox >/dev/null 2>&1; then
  echo "Warning: sox is not installed."
  echo "On macOS run: brew install sox"
  echo "On Ubuntu run: sudo apt-get install sox"
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Warning: ffmpeg is not installed."
  echo "Qwen3-ASR transcription can fail without ffmpeg in PATH."
  echo "On macOS run: brew install ffmpeg"
  echo "On Ubuntu run: sudo apt-get install ffmpeg"
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "Creating virtual environment at ${VENV_DIR}"
  uv venv --python "${PYTHON_BIN}" "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

if ! python -m pip --version >/dev/null 2>&1; then
  python -m ensurepip --upgrade
fi

uv sync
uv pip install hf_transfer certifi

OS_NAME="$(uname -s)"
if [[ "${OS_NAME}" == "Darwin" ]]; then
  export QWEN_DEMO_ATTN_IMPL="${QWEN_DEMO_ATTN_IMPL:-sdpa}"
  echo "macOS detected: defaulting attention to sdpa."
elif command -v nvidia-smi >/dev/null 2>&1; then
  if ! python -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('flash_attn') else 1)" >/dev/null 2>&1; then
    echo "CUDA environment detected: attempting to install the validated flash-attn v2 wheel."
    if ! uv pip install --no-cache-dir "${FLASH_ATTN_WHEEL_URL}"; then
      echo "Warning: flash-attn installation failed. Falling back to sdpa."
    fi
  fi
fi

if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
  echo "Created ${BACKEND_DIR}/.env from template."
fi

set -a
source "${BACKEND_DIR}/.env"
set +a

install_optional_repo_requirements() {
  local repo_dir="$1"
  for requirements_file in \
    "${repo_dir}/requirements.txt" \
    "${repo_dir}/requirements/main.txt" \
    "${repo_dir}/requirements/base.txt"
  do
    if [[ -f "${requirements_file}" ]]; then
      echo "Installing optional requirements from ${requirements_file}"
      if ! uv pip install -r "${requirements_file}"; then
        echo "Warning: failed to install ${requirements_file}. Continue and configure manually if needed."
      fi
      return
    fi
  done
}

MMAUDIO_REPO_ROOT="${MMAUDIO_REPO_ROOT:-${VENDOR_DIR}/MMAudio}"
APPLIO_REPO_ROOT="${APPLIO_REPO_ROOT:-${VENDOR_DIR}/Applio}"
FISH_SPEECH_REPO_ROOT="${FISH_SPEECH_REPO_ROOT:-${VENDOR_DIR}/fish-speech}"

install_optional_repo_requirements "${APPLIO_REPO_ROOT}"
echo "Fish Speech sources are vendored in this repo. S2-Pro uses a separate .venv-fish-speech runtime."

if [[ -d "${MMAUDIO_REPO_ROOT}" ]]; then
  if [[ ! -d "${MMAUDIO_VENV}" ]]; then
    echo "Creating MMAudio venv -> ${MMAUDIO_VENV}"
    python -m venv "${MMAUDIO_VENV}"
  fi
  "${MMAUDIO_VENV}/bin/python" -m pip install --upgrade pip wheel setuptools hatchling
  MMAUDIO_TORCH_PROFILE="${MMAUDIO_TORCH_PROFILE:-}"
  if [[ -z "${MMAUDIO_TORCH_PROFILE}" ]]; then
    if [[ "${OS_NAME}" == "Darwin" ]]; then
      MMAUDIO_TORCH_PROFILE="current"
    elif command -v nvidia-smi >/dev/null 2>&1; then
      MMAUDIO_TORCH_PROFILE="cu130"
    else
      MMAUDIO_TORCH_PROFILE="cpu"
    fi
  fi
  echo "Installing MMAudio runtime into ${MMAUDIO_VENV} (torch profile: ${MMAUDIO_TORCH_PROFILE})"
  MMAUDIO_TORCH_PROFILE="${MMAUDIO_TORCH_PROFILE}" \
    "${MMAUDIO_VENV}/bin/python" "${ROOT_DIR}/scripts/install_mmaudio_runtime.py" --repo-root "${MMAUDIO_REPO_ROOT}"
fi

python - <<'PY'
import importlib.util
import platform
import torch

device = "cpu"
if torch.cuda.is_available():
    device = "cuda:0"
elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
    device = "mps"

attn = "sdpa"
if platform.system() != "Darwin" and device.startswith("cuda") and importlib.util.find_spec("flash_attn"):
    attn = "flash_attention_2"
print(f"Runtime summary: device={device}, attention={attn}, torch={torch.__version__}")
PY

echo
echo "Backend setup complete."
echo "Next steps:"
echo "  1. Edit ${BACKEND_DIR}/.env if needed"
echo "  2. Run ./scripts/download_models.sh"
echo "     For S2-Pro only: ./scripts/download_models.sh s2pro"
echo "     S2-Pro local engine is started by the backend when first used."
echo "  3. Start backend with:"
echo "     cd ${BACKEND_DIR} && source ../../.venv/bin/activate && uvicorn app.main:app --reload"
