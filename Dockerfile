# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /frontend
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/frontend ./
RUN npm run build

ARG CUDA_BASE_IMAGE=nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04
FROM ${CUDA_BASE_IMAGE} AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG DEBIAN_FRONTEND=noninteractive
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130
ARG TORCH_VERSION=2.11.0
ARG TORCHAUDIO_VERSION=2.11.0
ARG TORCHVISION_VERSION=0.26.0
ARG BACKEND_PORT=8190

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    PATH="/app/.venv/bin:/root/.local/bin:${PATH}" \
    HF_HOME=/app/data/cache/huggingface \
    TORCH_HOME=/app/data/cache/torch \
    XDG_CACHE_HOME=/app/data/cache \
    MPLCONFIGDIR=/app/data/cache/matplotlib \
    BACKEND_PORT=${BACKEND_PORT}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        ffmpeg \
        git \
        git-lfs \
        libgl1 \
        libglib2.0-0 \
        libsndfile1 \
        ninja-build \
        pkg-config \
        sox \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

WORKDIR /app

# Resolve Python and GPU torch first. The project lock then installs the rest
# without accidentally falling back to a CPU torch wheel.
COPY pyproject.toml uv.lock README.md ./
COPY vendor ./vendor
RUN uv venv --python 3.11 .venv \
    && uv pip install --python .venv/bin/python \
        --index-url "${TORCH_INDEX_URL}" \
        "torch==${TORCH_VERSION}" \
        "torchaudio==${TORCHAUDIO_VERSION}" \
        "torchvision==${TORCHVISION_VERSION}" \
    && uv sync --frozen --no-dev --python .venv/bin/python

COPY . .
COPY --from=frontend-builder /frontend/out /app/app/frontend/out

RUN mkdir -p \
    /app/data/cache/huggingface \
    /app/data/cache/matplotlib \
    /app/data/cache/torch \
    /app/data/datasets \
    /app/data/finetune-runs \
    /app/data/generated \
    /app/data/models \
    /app/data/rvc-models \
    /app/data/runtime \
    /app/logs

WORKDIR /app/app/backend
EXPOSE ${BACKEND_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD /app/.venv/bin/python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('BACKEND_PORT', '8190') + '/api/health', timeout=5).read()"

CMD ["bash", "-lc", "exec uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8190}"]
