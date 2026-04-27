#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/app/backend"
VENV_DIR="${ROOT_DIR}/.venv"
MODELS_DIR="${ROOT_DIR}/data/models"
VENDOR_DIR="${ROOT_DIR}/vendor"
APPLIO_DIR="${APPLIO_REPO_ROOT:-${VENDOR_DIR}/Applio}"
MMAUDIO_DIR="${MMAUDIO_REPO_ROOT:-${VENDOR_DIR}/MMAudio}"
ACE_STEP_DIR="${ACE_STEP_REPO_ROOT:-${VENDOR_DIR}/ACE-Step}"
RVC_DIR="${ROOT_DIR}/data/rvc-models"
MMAUDIO_MODELS_DIR="${ROOT_DIR}/data/mmaudio"
STEM_SEPARATOR_MODELS_DIR="${ROOT_DIR}/data/stem-separator-models"
ACE_STEP_MODEL_DIR="${ACE_STEP_CHECKPOINT_PATH:-${ROOT_DIR}/data/models/ace-step}"
FISH_SPEECH_DIR="${FISH_SPEECH_REPO_ROOT:-${VENDOR_DIR}/fish-speech}"
FISH_SPEECH_MODEL_DIR="${FISH_SPEECH_MODEL_DIR:-${ROOT_DIR}/data/models/fish-speech/s2-pro}"
PROFILE="${1:-all}"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "Virtual environment not found. Run ./scripts/setup_backend.sh first." >&2
  exit 1
fi

mkdir -p "${MODELS_DIR}"
mkdir -p "${VENDOR_DIR}"
mkdir -p "${RVC_DIR}"
mkdir -p "${MMAUDIO_MODELS_DIR}"
mkdir -p "${STEM_SEPARATOR_MODELS_DIR}"
mkdir -p "${ACE_STEP_MODEL_DIR}"
mkdir -p "${FISH_SPEECH_MODEL_DIR}"
source "${VENV_DIR}/bin/activate"

if [[ -f "${BACKEND_DIR}/.env" ]]; then
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

export HF_HUB_ENABLE_HF_TRANSFER="${HF_HUB_ENABLE_HF_TRANSFER:-1}"
PRIVATE_ASSET_REPO_ID="${PRIVATE_ASSET_REPO_ID:-}"
PRIVATE_ASSET_REVISION="${PRIVATE_ASSET_REVISION:-main}"
QWEN_USE_PRIVATE_ASSET_REPO="${QWEN_USE_PRIVATE_ASSET_REPO:-0}"

download_private_asset() {
  local repo_path="$1"
  local target_path="$2"
  if [[ -z "${PRIVATE_ASSET_REPO_ID}" ]]; then
    return 1
  fi
  if [[ -f "${target_path}" ]]; then
    echo "Private asset already present: ${target_path}"
    return 0
  fi
  mkdir -p "$(dirname "${target_path}")"
  python - "${PRIVATE_ASSET_REPO_ID}" "${PRIVATE_ASSET_REVISION}" "${repo_path}" "${target_path}" <<'PY'
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

repo_id, revision, filename, target = sys.argv[1:5]
cached = hf_hub_download(repo_id=repo_id, filename=filename, revision=revision, repo_type="model")
target_path = Path(target)
target_path.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(cached, target_path)
print(f"Downloaded private asset {repo_id}/{filename} -> {target_path}")
PY
}

python - "${MODELS_DIR}" "${PROFILE}" "${PRIVATE_ASSET_REPO_ID}" "${PRIVATE_ASSET_REVISION}" "${QWEN_USE_PRIVATE_ASSET_REPO}" <<'PY'
import os
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download, list_repo_files, snapshot_download

models_dir = Path(sys.argv[1])
profile = sys.argv[2]
private_repo_id = sys.argv[3]
private_revision = sys.argv[4]
use_private_assets = sys.argv[5] == "1"

profiles = {
    "ace-step": [],
    "s2pro": [],
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
    raise SystemExit(f"Unknown profile: {profile}. Use 'core', 'all', 's2pro', or 'ace-step'.")

for repo_id, dirname in profiles[profile]:
    local_dir = models_dir / dirname
    if private_repo_id and use_private_assets:
        prefix = f"models/{dirname}/"
        print(f"Downloading private mirror {private_repo_id}/{prefix} -> {local_dir}")
        files = [item for item in list_repo_files(private_repo_id, repo_type="model", revision=private_revision) if item.startswith(prefix)]
        if not files:
            raise SystemExit(f"Private model mirror missing path: {prefix}")
        for filename in files:
            rel = filename.removeprefix(prefix)
            target = local_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            cached = hf_hub_download(repo_id=private_repo_id, filename=filename, revision=private_revision, repo_type="model")
            shutil.copy2(cached, target)
    else:
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

FISH_SPEECH_REPO_URL="${FISH_SPEECH_REPO_URL:-https://github.com/fishaudio/fish-speech.git}"
if [[ "${PROFILE}" == "all" || "${PROFILE}" == "s2pro" ]]; then
  if [[ ! -d "${FISH_SPEECH_DIR}/.git" ]]; then
    echo "Cloning Fish Speech -> ${FISH_SPEECH_DIR}"
    git clone "${FISH_SPEECH_REPO_URL}" "${FISH_SPEECH_DIR}"
  else
    echo "Fish Speech already present at ${FISH_SPEECH_DIR}"
  fi

  python - "${FISH_SPEECH_MODEL_DIR}" "${PRIVATE_ASSET_REPO_ID}" "${PRIVATE_ASSET_REVISION}" "${QWEN_USE_PRIVATE_ASSET_REPO}" <<'PY'
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download, list_repo_files, snapshot_download

target_dir = Path(sys.argv[1])
private_repo_id = sys.argv[2]
private_revision = sys.argv[3]
use_private_assets = sys.argv[4] == "1"

if private_repo_id and use_private_assets:
    prefix = "fish-speech/s2-pro/"
    print(f"Downloading private Fish Speech mirror {private_repo_id}/{prefix} -> {target_dir}")
    files = [item for item in list_repo_files(private_repo_id, repo_type="model", revision=private_revision) if item.startswith(prefix)]
    if not files:
        raise SystemExit(f"Private S2-Pro mirror missing path: {prefix}")
    for filename in files:
        rel = filename.removeprefix(prefix)
        target = target_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        cached = hf_hub_download(repo_id=private_repo_id, filename=filename, revision=private_revision, repo_type="model")
        shutil.copy2(cached, target)
else:
    print(f"Downloading fishaudio/s2-pro -> {target_dir}")
    snapshot_download(
        repo_id="fishaudio/s2-pro",
        local_dir=str(target_dir),
        local_dir_use_symlinks=False,
        resume_download=True,
    )
print("Fish Speech S2-Pro model download completed.")
PY
fi

ACE_STEP_REPO_URL="${ACE_STEP_REPO_URL:-https://github.com/ace-step/ACE-Step-1.5.git}"
ACE_STEP_VENV="${ACE_STEP_VENV:-${ROOT_DIR}/.venv-ace-step}"
ACE_STEP_DOWNLOAD_PROFILE="${ACE_STEP_DOWNLOAD_PROFILE:-main}"
if [[ "${PROFILE}" == "all" || "${PROFILE}" == "ace-step" ]]; then
  if [[ ! -d "${ACE_STEP_DIR}/.git" ]]; then
    echo "Cloning ACE-Step-1.5 -> ${ACE_STEP_DIR}"
    git clone --depth 1 "${ACE_STEP_REPO_URL}" "${ACE_STEP_DIR}"
  else
    echo "ACE-Step already present at ${ACE_STEP_DIR}"
  fi

  if [[ ! -d "${ACE_STEP_VENV}" ]]; then
    echo "Creating ACE-Step venv -> ${ACE_STEP_VENV}"
    python -m venv "${ACE_STEP_VENV}"
  fi
  "${ACE_STEP_VENV}/bin/python" -m pip install --upgrade pip wheel setuptools hatchling
  echo "Installing ACE-Step-1.5 into ${ACE_STEP_VENV} (this may take a while)"
  if command -v uv >/dev/null 2>&1; then
    # ACE-Step 1.5 declares nano-vllm as a local source in pyproject.toml.
    # Plain pip ignores [tool.uv.sources] and tries PyPI instead, so prefer uv.
    uv pip install --python "${ACE_STEP_VENV}/bin/python" -e "${ACE_STEP_DIR}"
    if [[ "${HF_HUB_ENABLE_HF_TRANSFER:-}" == "1" ]]; then
      # The downloader prefers Hugging Face first. When hf_transfer is enabled
      # but missing, huggingface_hub aborts before it can resume the model files.
      uv pip install --python "${ACE_STEP_VENV}/bin/python" hf_transfer
    fi
  else
    echo "uv not found; using pip fallback with local nano-vllm source." >&2
    "${ACE_STEP_VENV}/bin/python" -m pip install -e "${ACE_STEP_DIR}/acestep/third_parts/nano-vllm"
    "${ACE_STEP_VENV}/bin/python" -m pip install --no-deps -e "${ACE_STEP_DIR}"
    if [[ "${HF_HUB_ENABLE_HF_TRANSFER:-}" == "1" ]]; then
      "${ACE_STEP_VENV}/bin/python" -m pip install hf_transfer
    fi
  fi

  if [[ -n "${PRIVATE_ASSET_REPO_ID}" ]] && [[ "${QWEN_USE_PRIVATE_ASSET_REPO}" == "1" ]]; then
    python - "${ACE_STEP_MODEL_DIR}" "${PRIVATE_ASSET_REPO_ID}" "${PRIVATE_ASSET_REVISION}" <<'PY'
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download, list_repo_files

target_dir = Path(sys.argv[1])
private_repo_id = sys.argv[2]
private_revision = sys.argv[3]
prefix = "ace-step/"
files = [item for item in list_repo_files(private_repo_id, repo_type="model", revision=private_revision) if item.startswith(prefix)]
if not files:
    raise SystemExit(f"Private ACE-Step mirror missing path: {prefix}")
for filename in files:
    rel = filename.removeprefix(prefix)
    target = target_dir / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    cached = hf_hub_download(repo_id=private_repo_id, filename=filename, revision=private_revision, repo_type="model")
    shutil.copy2(cached, target)
print("ACE-Step private model mirror download completed.")
PY
  else
    echo "Downloading ACE-Step-1.5 checkpoints (profile: ${ACE_STEP_DOWNLOAD_PROFILE}) -> ${ACE_STEP_MODEL_DIR}"
    export ACESTEP_CHECKPOINTS_DIR="${ACE_STEP_MODEL_DIR}"
    case "${ACE_STEP_DOWNLOAD_PROFILE}" in
      none|skip)
        echo "ACE_STEP_DOWNLOAD_PROFILE=${ACE_STEP_DOWNLOAD_PROFILE}: skipping checkpoint download. Models will be fetched on first generation."
        ;;
      all)
        "${ACE_STEP_VENV}/bin/python" -m acestep.model_downloader --all --dir "${ACE_STEP_MODEL_DIR}" || {
          echo "ACE-Step model download failed. You can retry with: ${ACE_STEP_VENV}/bin/python -m acestep.model_downloader --all --dir ${ACE_STEP_MODEL_DIR}" >&2
        }
        ;;
      main|"")
        "${ACE_STEP_VENV}/bin/python" -m acestep.model_downloader --dir "${ACE_STEP_MODEL_DIR}" || {
          echo "ACE-Step main model download failed. You can retry with: ${ACE_STEP_VENV}/bin/python -m acestep.model_downloader --dir ${ACE_STEP_MODEL_DIR}" >&2
        }
        ;;
      *)
        "${ACE_STEP_VENV}/bin/python" -m acestep.model_downloader --model "${ACE_STEP_DOWNLOAD_PROFILE}" --dir "${ACE_STEP_MODEL_DIR}" || {
          echo "ACE-Step download for model '${ACE_STEP_DOWNLOAD_PROFILE}' failed." >&2
        }
        ;;
    esac
  fi
fi

APPLIO_REPO_URL="${APPLIO_REPO_URL:-https://github.com/IAHispano/Applio.git}"
MMAUDIO_REPO_URL="${MMAUDIO_REPO_URL:-https://github.com/hkchengrex/MMAudio.git}"
APPLIO_DEFAULT_RVC_MODEL_URL="${APPLIO_DEFAULT_RVC_MODEL_URL:-https://huggingface.co/SmlCoke/rvc-yui/resolve/main/weights/yui-mix-pro-hq-40k.pth}"
APPLIO_DEFAULT_RVC_INDEX_URL="${APPLIO_DEFAULT_RVC_INDEX_URL:-https://huggingface.co/SmlCoke/rvc-yui/resolve/main/index/added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index}"
APPLIO_DEFAULT_RVC_MODEL_FILENAME="${APPLIO_DEFAULT_RVC_MODEL_FILENAME:-yui-mix-pro-hq-40k.pth}"
APPLIO_DEFAULT_RVC_INDEX_FILENAME="${APPLIO_DEFAULT_RVC_INDEX_FILENAME:-added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index}"
APPLIO_SKIP_DEFAULT_RVC="${APPLIO_SKIP_DEFAULT_RVC:-0}"

if [[ "${PROFILE}" == "all" || "${PROFILE}" == "core" ]]; then

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
  RVC_MODEL_FILENAME="${APPLIO_DEFAULT_RVC_MODEL_FILENAME}"
  RVC_INDEX_FILENAME="${APPLIO_DEFAULT_RVC_INDEX_FILENAME}"
  if [[ -n "${PRIVATE_ASSET_REPO_ID}" ]] && \
    download_private_asset "rvc-models/${RVC_MODEL_FILENAME}" "${RVC_DIR}/${RVC_MODEL_FILENAME}" && \
    download_private_asset "rvc-models/${RVC_INDEX_FILENAME}" "${RVC_DIR}/${RVC_INDEX_FILENAME}"; then
    echo "Downloaded Applio/RVC assets from private asset repo."
  else
    echo "No explicit Applio/RVC model URLs provided. Downloading the default demo voice-conversion pair."
    RVC_MODEL_URL="${APPLIO_DEFAULT_RVC_MODEL_URL}"
    RVC_INDEX_URL="${APPLIO_DEFAULT_RVC_INDEX_URL}"
  fi
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
    if [[ -n "${PRIVATE_ASSET_REPO_ID}" ]] && download_private_asset "mmaudio/nsfw/$(basename "${TARGET_NSFW_MODEL}")" "${TARGET_NSFW_MODEL}"; then
      echo "Downloaded MMAudio NSFW model from private asset repo."
    else
      echo "Downloading MMAudio NSFW model -> ${TARGET_NSFW_MODEL}"
      curl -L "${MMAUDIO_NSFW_MODEL_URL}" -o "${TARGET_NSFW_MODEL}"
    fi
  else
    echo "MMAudio NSFW model already present: ${TARGET_NSFW_MODEL}"
  fi
fi

STEM_SEPARATOR_MODEL_FILENAME="${STEM_SEPARATOR_MODEL_FILENAME:-vocals_mel_band_roformer.ckpt}"
if [[ "${PROFILE}" == "all" ]]; then
  if [[ -n "${PRIVATE_ASSET_REPO_ID}" ]] && download_private_asset "stem-separator-models/${STEM_SEPARATOR_MODEL_FILENAME}" "${STEM_SEPARATOR_MODELS_DIR}/${STEM_SEPARATOR_MODEL_FILENAME}"; then
    download_private_asset "stem-separator-models/${STEM_SEPARATOR_MODEL_FILENAME%.ckpt}.yaml" "${STEM_SEPARATOR_MODELS_DIR}/${STEM_SEPARATOR_MODEL_FILENAME%.ckpt}.yaml" || true
    echo "Downloaded Stem Separator model from private asset repo."
  elif python -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('audio_separator') else 1)" >/dev/null 2>&1; then
    echo "Downloading Stem Separator model -> ${STEM_SEPARATOR_MODELS_DIR}/${STEM_SEPARATOR_MODEL_FILENAME}"
    audio-separator \
      --download_model_only \
      --model_filename "${STEM_SEPARATOR_MODEL_FILENAME}" \
      --model_file_dir "${STEM_SEPARATOR_MODELS_DIR}"
  else
    echo "audio-separator is not installed. Run ./scripts/setup_backend.sh, then rerun this script to fetch the Stem Separator model."
  fi
fi

fi

echo "Suggested next step:"
echo "  cd ${BACKEND_DIR} && source ../../.venv/bin/activate && uvicorn app.main:app --reload"
