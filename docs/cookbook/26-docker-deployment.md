# Docker Deployment

이 문서는 fresh clone 검증을 대체하지 않습니다. 목적은 현재 정리된
Voice Studio 앱을 Docker Compose로 서비스 배포할 수 있게 만드는 것입니다.

## 구조

- `Dockerfile`
  - `app/frontend`를 먼저 Next.js static export로 빌드합니다.
  - CUDA 13.0 기반 런타임 이미지에 Python 3.11, torch `2.11.0+cu130`,
    torchaudio `2.11.0+cu130`, torchvision `0.26.0+cu130`을 설치합니다.
  - 루트 `uv.lock` 기준으로 백엔드와 vendored Qwen/MMAudio 의존성을 설치합니다.
  - 빌드된 `app/frontend/out`을 FastAPI 컨테이너 안에 복사합니다.
- `docker-compose.yml`
  - `voice-studio` 단일 서비스가 `/api/*`와 프런트 페이지를 함께 서빙합니다.
  - `model-setup` profile은 같은 이미지로 모델 다운로드 스크립트를 실행합니다.
  - 모델, 데이터셋, 생성물, 로그는 이미지에 굽지 않고 호스트 볼륨으로 유지합니다.

## 준비

NVIDIA GPU를 쓰려면 호스트에 NVIDIA driver, Docker, NVIDIA Container Toolkit이
설치되어 있어야 합니다.

```bash
docker run --rm --gpus all nvidia/cuda:13.0.2-base-ubuntu24.04 nvidia-smi
```

선택적으로 Docker용 환경 파일을 만듭니다.

```bash
cp .env.docker.example .env
```

개인 Hugging Face mirror나 token을 쓰는 경우 `.env`에 아래 값을 넣습니다.

```bash
HF_TOKEN=...
PRIVATE_ASSET_REPO_ID=your-name/qwen3-tts-demo-assets
QWEN_USE_PRIVATE_ASSET_REPO=1
```

## 이미지 빌드

```bash
docker compose build voice-studio
```

기본 빌드 인자:

- `CUDA_BASE_IMAGE=nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04`
- `TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130`
- `TORCH_VERSION=2.11.0`
- `TORCHAUDIO_VERSION=2.11.0`
- `TORCHVISION_VERSION=0.26.0`

다른 CUDA/PyTorch 라인을 시험할 때는 `.env` 또는 shell env에서 값을 바꿉니다.

## 모델 다운로드

이미 호스트 `data/`에 모델이 준비되어 있으면 이 단계는 생략할 수 있습니다.
컨테이너 안에서 준비하려면 setup profile을 실행합니다.

```bash
docker compose --profile setup run --rm model-setup
```

이 명령은 `./data` 볼륨과 아래 named volume에 자산을 남깁니다.

- `fish-speech-venv`: S2-Pro/Fish Speech runtime
- `ace-step-venv`: ACE-Step runtime
- `vibevoice-venv`: VibeVoice runtime
- `hf-cache`, `uv-cache`: 다운로드와 패키지 캐시

## 실행

```bash
docker compose up voice-studio
```

기본 접속 주소:

```text
http://127.0.0.1:8190/
```

상태 확인:

```bash
curl http://127.0.0.1:8190/api/health
curl http://127.0.0.1:8190/api/runtime/status
```

VRAM을 정리하고 싶을 때:

```bash
curl -X POST "http://127.0.0.1:8190/api/runtime/unload?include_s2_pro=true"
```

## 운영 원칙

- 모델과 생성 파일은 Docker image에 포함하지 않습니다.
- `data/`, `logs/`, `weights/`, `ext_weights/`는 compose volume으로 유지합니다.
- Qwen, MMAudio, Applio는 기본적으로 메인 `/app/.venv`를 사용합니다.
- S2-Pro, ACE-Step, VibeVoice는 기존 프로젝트 구조와 동일하게 전용 venv volume을
  사용합니다. `model-setup` profile이 이 venv들을 만듭니다.
- macOS/CPU 환경은 이 compose의 기본 목표가 아닙니다. 그런 환경에서는
  `QWEN_DEMO_DEVICE=cpu`, `QWEN_DEMO_ATTN_IMPL=sdpa`로 별도 compose override를
  두는 편이 안전합니다.

## 검증

compose 파일 문법 확인:

```bash
docker compose config
```

컨테이너 실행 후 API smoke:

```bash
curl http://127.0.0.1:8190/api/bootstrap
```

전체 live E2E는 호스트에서처럼 컨테이너 안에서도 실행할 수 있습니다.

```bash
docker compose exec voice-studio \
  bash -lc "cd /app && ./.venv/bin/python scripts/live_e2e_verify.py --include-heavy --port 8290"
```

단, 이 검증은 실제 모델을 모두 로드하므로 VRAM을 크게 사용합니다.

