#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
FISH_SPEECH_VENV="${FISH_SPEECH_VENV:-${ROOT_DIR}/.venv-fish-speech}"
FISH_SPEECH_REPO_ROOT="${FISH_SPEECH_REPO_ROOT:-${ROOT_DIR}/vendor/fish-speech}"
FISH_SPEECH_MODEL_DIR="${FISH_SPEECH_MODEL_DIR:-${ROOT_DIR}/data/models/fish-speech/s2-pro}"
FISH_SPEECH_HOST="${FISH_SPEECH_HOST:-127.0.0.1}"
FISH_SPEECH_PORT="${FISH_SPEECH_PORT:-8080}"
FISH_SPEECH_COMPILE="${FISH_SPEECH_COMPILE:-0}"
FISH_SPEECH_HALF="${FISH_SPEECH_HALF:-1}"
FISH_SPEECH_WORKERS="${FISH_SPEECH_WORKERS:-1}"
FISH_SPEECH_DECODER_CONFIG="${FISH_SPEECH_DECODER_CONFIG:-modded_dac_vq}"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but not installed." >&2
  exit 1
fi

if [[ ! -f "${FISH_SPEECH_REPO_ROOT}/tools/api_server.py" ]]; then
  echo "Fish Speech source is missing: ${FISH_SPEECH_REPO_ROOT}" >&2
  echo "Run ./scripts/download_models.sh s2pro first." >&2
  exit 1
fi

if [[ ! -f "${FISH_SPEECH_MODEL_DIR}/codec.pth" ]]; then
  echo "S2-Pro model weights are missing: ${FISH_SPEECH_MODEL_DIR}" >&2
  echo "Run ./scripts/download_models.sh s2pro first." >&2
  exit 1
fi

if [[ ! -d "${FISH_SPEECH_VENV}" ]]; then
  echo "Creating isolated Fish Speech environment at ${FISH_SPEECH_VENV}"
  uv venv --python "${FISH_SPEECH_PYTHON:-python3.11}" "${FISH_SPEECH_VENV}"
fi

source "${FISH_SPEECH_VENV}/bin/activate"
if ! python -c "import pyrootutils" >/dev/null 2>&1; then
  echo "Installing Fish Speech into isolated runtime environment."
  uv pip install -e "${FISH_SPEECH_REPO_ROOT}"
fi

cd "${FISH_SPEECH_REPO_ROOT}"

ARGS=(
  "tools/api_server.py"
  "--llama-checkpoint-path" "${FISH_SPEECH_MODEL_DIR}"
  "--decoder-checkpoint-path" "${FISH_SPEECH_MODEL_DIR}/codec.pth"
  "--decoder-config-name" "${FISH_SPEECH_DECODER_CONFIG}"
  "--listen" "${FISH_SPEECH_HOST}:${FISH_SPEECH_PORT}"
  "--workers" "${FISH_SPEECH_WORKERS}"
)

if [[ "${FISH_SPEECH_HALF}" == "1" ]]; then
  ARGS+=("--half")
fi

if [[ "${FISH_SPEECH_COMPILE}" == "1" ]]; then
  ARGS+=("--compile")
fi

if [[ -n "${FISH_SPEECH_API_KEY:-}" ]]; then
  ARGS+=("--api-key" "${FISH_SPEECH_API_KEY}")
fi

echo "Starting local Fish Speech S2-Pro server on ${FISH_SPEECH_HOST}:${FISH_SPEECH_PORT}"
python "${ARGS[@]}"
