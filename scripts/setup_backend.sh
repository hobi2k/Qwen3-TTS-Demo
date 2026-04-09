#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/app/backend"
UPSTREAM_DIR="${ROOT_DIR}/Qwen3-TTS"
VENV_DIR="${ROOT_DIR}/.venv"

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

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but not installed." >&2
  exit 1
fi

if ! command -v sox >/dev/null 2>&1; then
  echo "Warning: sox is not installed."
  echo "On macOS run: brew install sox"
  echo "On Ubuntu run: sudo apt-get install sox"
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

if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
  echo "Created ${BACKEND_DIR}/.env from template."
fi

python - <<'PY'
import importlib.util
import torch

device = "cpu"
if torch.cuda.is_available():
    device = "cuda:0"
elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
    device = "mps"

attn = "flash_attention_2" if importlib.util.find_spec("flash_attn") else "sdpa"
print(f"Runtime summary: device={device}, attention={attn}, torch={torch.__version__}")
PY

echo
echo "Backend setup complete."
echo "Next steps:"
echo "  1. Edit ${BACKEND_DIR}/.env if needed"
echo "  2. Run ./scripts/download_models.sh"
echo "  3. Start backend with:"
echo "     cd ${BACKEND_DIR} && source ../../.venv/bin/activate && uvicorn app.main:app --reload"
