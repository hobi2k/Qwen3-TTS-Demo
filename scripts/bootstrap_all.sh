#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-all}"

echo "Bootstrapping Qwen3-TTS-Demo"
echo "Repo root: ${ROOT_DIR}"
echo "Model profile: ${PROFILE}"
echo

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required before bootstrap." >&2
  echo "Install uv first: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required before bootstrap." >&2
  echo "Install Node.js 18+ first, then rerun this script." >&2
  exit 1
fi

"${ROOT_DIR}/scripts/setup_backend.sh"
"${ROOT_DIR}/scripts/download_models.sh" "${PROFILE}"

pushd "${ROOT_DIR}/app/frontend" >/dev/null
npm install
npm run build
popd >/dev/null

echo
echo "Bootstrap complete."
echo "Start the integrated backend/frontend server with:"
echo "  cd ${ROOT_DIR}/app/backend"
echo "  source ../../.venv/bin/activate"
echo "  uvicorn app.main:app --host 127.0.0.1 --port 8190"
echo
echo "Open:"
echo "  http://127.0.0.1:8190/"
