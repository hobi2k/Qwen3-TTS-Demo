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
FISH_SPEECH_TORCH_VERSION="${FISH_SPEECH_TORCH_VERSION:-2.11.0}"
FISH_SPEECH_TORCH_PROFILE="${FISH_SPEECH_TORCH_PROFILE:-}"

OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"
if [[ -z "${FISH_SPEECH_TORCH_PROFILE}" ]]; then
  if [[ "${OS_NAME}" == "Darwin" ]]; then
    FISH_SPEECH_TORCH_PROFILE="current"
  elif command -v nvidia-smi >/dev/null 2>&1; then
    FISH_SPEECH_TORCH_PROFILE="cu130"
  else
    FISH_SPEECH_TORCH_PROFILE="cpu"
  fi
fi

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

if ! python - "${FISH_SPEECH_TORCH_VERSION}" "${FISH_SPEECH_TORCH_PROFILE}" <<'PY' >/dev/null 2>&1
import sys

expected_version = sys.argv[1]
expected_profile = sys.argv[2].lower()

try:
    import pyrootutils  # noqa: F401
    import torch
except Exception:
    raise SystemExit(1)

if expected_profile not in {"current", "none", "skip"} and not torch.__version__.startswith(expected_version):
    raise SystemExit(1)
if expected_profile.startswith("cu"):
    expected_cuda = expected_profile.removeprefix("cu")
    if not torch.version.cuda or torch.version.cuda.replace(".", "") != expected_cuda:
        raise SystemExit(1)
PY
then
  echo "Installing Fish Speech runtime with torch ${FISH_SPEECH_TORCH_VERSION}+${FISH_SPEECH_TORCH_PROFILE}."
  python "${ROOT_DIR}/scripts/install_fish_speech_runtime.py" \
    --repo-root "${FISH_SPEECH_REPO_ROOT}" \
    --torch-version "${FISH_SPEECH_TORCH_VERSION}" \
    --torch-profile "${FISH_SPEECH_TORCH_PROFILE}"
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

echo "Starting local Fish Speech S2-Pro engine on ${FISH_SPEECH_HOST}:${FISH_SPEECH_PORT}"
python "${ARGS[@]}"
