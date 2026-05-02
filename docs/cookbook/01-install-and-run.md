# Installation and Run Guide

이 문서는 현재 저장소 기준 실제 실행 순서를 정리합니다.

기준 흐름:

`setup -> download -> env 확인 -> frontend build -> backend 단독 서빙`

## 요구 사항

- Python `3.11+`
- Node.js `18+`
- `npm`
- 권장 시스템 패키지: `ffmpeg`, `sox`
- 실모델 다운로드가 가능한 네트워크

오디오 분리는 `audio-separator`를 사용합니다. 이 모델은 `오디오 분리` 탭에서 보컬/반주를 분리할 때만 필요하며, Qwen TTS, S2-Pro 목소리 저장, ASR 전사에는 쓰이지 않습니다.
기본 보컬 모델은 `vocals_mel_band_roformer.ckpt` 하나입니다. 모델 파일은 다운로드 스크립트 또는 최초 분리 실행 시 `data/stem-separator-models/` 아래로 내려받으며, 이 폴더는 git에 올리지 않습니다.

## 1. Clone

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
```

## 1-1. 한 번에 준비하기

WSL/Linux에서는 아래 명령 하나로 백엔드 설정, 모델 다운로드, 프런트 설치/빌드를 순서대로 실행할 수 있습니다.

```bash
./scripts/bootstrap_all.sh
```

프로필을 지정할 수도 있습니다.

```bash
./scripts/bootstrap_all.sh core      # Qwen 핵심 모델만
./scripts/bootstrap_all.sh s2pro     # Fish Speech S2-Pro만
./scripts/bootstrap_all.sh ace-step  # ACE-Step만
./scripts/bootstrap_all.sh vibevoice # VibeVoice ASR/TTS만
```

이 스크립트는 `uv`, `npm`이 이미 설치되어 있다고 가정합니다. `ffmpeg`, `sox`는 시스템 패키지라 자동 설치하지 않고 `setup_backend.sh`에서 경고만 표시합니다.

수동으로 나눠 실행하고 싶으면 아래 2~6단계를 그대로 따르면 됩니다.

## 2. 백엔드 준비

macOS / Linux:

```bash
./scripts/setup_backend.sh
```

Windows PowerShell:

```powershell
.\scripts\setup_backend.ps1
```

이 단계에서 하는 일:

- 루트 `.venv` 생성 또는 재사용
- `ensurepip`로 `pip` 복구
- `uv sync`
- `uv pip install hf_transfer certifi`
- `vendor/Applio`, `vendor/MMAudio`, `vendor/fish-speech` 준비
- ACE-Step은 기본 setup 단계가 아니라 `download_models.sh ace-step` 또는 `all`에서 별도 준비
- `app/backend/.env` 생성
- 시스템 의존성 점검

메인 `.venv`의 Gradio 계열은 `gradio>=5.50,<6` 라인으로 고정합니다.
이유는 VibeVoice가 `gradio==5.50.0`을 기준으로 하고, MMAudio도 `gradio<6`을 요구하기 때문입니다.
`hf-gradio`는 `gradio-client>=2,<3`을 요구해 `gradio 5.50.0`의 `gradio-client 1.14.0`과 충돌하므로 메인 런타임에 설치하지 않습니다.
설치 후 아래 명령이 깨끗해야 합니다.

```bash
.venv/bin/python -m pip check
```

가상환경 `pip`가 깨졌을 때 직접 복구하려면:

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
uv pip install hf_transfer certifi
```

## 3. 모델과 오디오 툴 자산 다운로드

macOS / Linux:

```bash
./scripts/download_models.sh
```

Windows PowerShell:

```powershell
.\scripts\download_models.ps1
```

기본 다운로드에는 아래가 포함됩니다.

- `Qwen3-TTS-Tokenizer-12Hz`
- `Qwen3-TTS-12Hz-0.6B/1.7B-Base`
- `Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `Qwen3-ASR-1.7B`
- `Qwen3-ASR-0.6B`
- Fish Speech S2-Pro:
  `data/models/fish-speech/s2-pro`
- 기본 RVC `.pth + .index`
- NSFW용 MMAudio 모델:
  `data/mmaudio/nsfw/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors`
- Stem Separator 모델 (`오디오 분리` 탭용):
  `data/stem-separator-models/vocals_mel_band_roformer.ckpt`
- ACE-Step 작곡 런타임:
  `vendor/ACE-Step`, `.venv-ace-step`, `data/models/ace-step`
- VibeVoice ASR/TTS 런타임:
  `vendor/VibeVoice`, `.venv-vibevoice`, `data/models/vibevoice`

개인 Hugging Face mirror를 먼저 사용하려면:

```bash
export PRIVATE_ASSET_REPO_ID=<your-hf-username>/qwen3-tts-demo-assets
export PRIVATE_ASSET_REVISION=main
./scripts/download_models.sh
```

Qwen/Qwen3-ASR 모델까지 개인 mirror에서 받으려면:

```bash
export QWEN_USE_PRIVATE_ASSET_REPO=1
./scripts/download_models.sh
```

업로드 준비와 repo layout은 [20-private-hf-assets.md](./20-private-hf-assets.md)를 기준으로 합니다.

가볍게만 준비하려면:

```bash
./scripts/download_models.sh core
```

S2-Pro만 준비하려면:

```bash
./scripts/download_models.sh s2pro
```

ACE-Step 작곡만 준비하려면:

```bash
./scripts/download_models.sh ace-step
```

VibeVoice만 준비하려면:

```bash
./scripts/download_models.sh vibevoice
```

VibeVoice community 7B까지 준비하려면:

```bash
./scripts/download_models.sh vibevoice-7b
```

ACE-Step-1.5는 내부 `nano-vllm`을 로컬 소스로 들고 있어서 일반 `pip install -e`가
실패할 수 있습니다. 다운로드 스크립트는 `.venv-ace-step`을 만들고 `uv pip install
--python .venv-ace-step/bin/python -e vendor/ACE-Step`로 설치하는 흐름을 우선 사용합니다.
`HF_HUB_ENABLE_HF_TRANSFER=1`이면 `.venv-ace-step` 안에 `hf_transfer`도 설치합니다.
Hugging Face 다운로드가 실제 네트워크 문제로 막히면 ModelScope로 fallback되며, 이 경우 4GB+ DiT 모델과
3GB+ 5Hz LM을 동시에 받아 시간이 오래 걸릴 수 있습니다.

검증된 ACE-Step main 구성:

- `data/models/ace-step/acestep-v15-turbo/model.safetensors`
- `data/models/ace-step/acestep-5Hz-lm-1.7B/model.safetensors`
- `data/models/ace-step/Qwen3-Embedding-0.6B/model.safetensors`
- `data/models/ace-step/vae/diffusion_pytorch_model.safetensors`

ACE-Step subprocess는 Transformers / matplotlib 캐시를 `data/cache/ace-step`에 씁니다.
서버나 샌드박스에서 홈 디렉터리 캐시가 read-only여도 동적 모듈 로드가 실패하지 않게 하기 위한 설정입니다.

## 4. `.env` 확인

기본 템플릿은 [app/backend/.env.example](../../app/backend/.env.example)입니다. `setup_backend.sh` / `setup_backend.ps1`는 `app/backend/.env`가 없을 때 이 템플릿을 복사합니다.

주요 변수:

### Qwen

- `QWEN_DEMO_SIMULATION`
  `0`이면 실제 모델을 사용합니다. UI/API smoke test만 할 때는 `1`로 둘 수 있습니다.
- `QWEN_DEMO_DEVICE`
  비워 두면 `cuda:0`, `mps`, `cpu`를 자동 선택합니다.
- `QWEN_DEMO_ATTN_IMPL`
  비워 두면 환경에 따라 `flash_attention_2` 또는 `sdpa`를 선택합니다.
- `QWEN_DEMO_CUSTOM_MODEL`
- `QWEN_DEMO_DESIGN_MODEL`
- `QWEN_DEMO_BASE_MODEL`
- `QWEN_DEMO_TOKENIZER_MODEL`
  비워 두면 `data/models/*`에서 자동으로 찾습니다.
- `QWEN_DEMO_ASR_MODEL`
  참조 텍스트 자동 입력에 사용할 Qwen3-ASR 모델을 직접 지정할 때 씁니다.
  기본값은 `Qwen/Qwen3-ASR-1.7B`이며, 빠른 확인용으로 `Qwen/Qwen3-ASR-0.6B` 또는 `0.6b`를 지정할 수 있습니다.
- `QWEN_DEMO_ASR_MAX_NEW_TOKENS`
  Qwen3-ASR 전사의 최대 생성 토큰 수입니다. 기본값은 `512`입니다.
- `QWEN_EXTENSIONS`
  CustomVoice 추가 학습, VoiceBox 변환, VoiceBox clone 실험처럼 데모가 추가한 Qwen 스크립트 위치입니다. 비워 두면 저장소 루트의 `qwen_extensions`를 사용합니다.
- `QWEN_DEMO_PYTHON`
  Qwen 데이터 준비/파인튜닝 subprocess에서 사용할 Python입니다. 비워 두면 백엔드와 같은 interpreter를 사용합니다. 일반적으로 비워 두는 것이 안전합니다.
- `QWEN_DEMO_TRAIN_PRECISION`
  Qwen CustomVoice/VoiceBox 학습 dtype 선택입니다. 비워 두면 CUDA에서는 `bf16`, CPU/MPS에서는 `fp32` 계열로 동작합니다. `fp32`, `float32`, `no`를 넣으면 mixed precision을 끕니다.
- `QWEN_DEMO_OPTIMIZER`
  Qwen CustomVoice/VoiceBox 학습 optimizer입니다. `adamw` 또는 `adafactor`를 씁니다. RTX 5080 16GB full run에서는 `adafactor`가 메모리 피크를 낮춰 안정적이었습니다.
- `QWEN_DEMO_GRAD_ACCUM_STEPS`
  Qwen CustomVoice/VoiceBox 학습 gradient accumulation step입니다. 기본값은 `1`입니다.
- `QWEN_DEMO_LOG_EVERY`
  Qwen CustomVoice/VoiceBox 학습 로그 출력 간격입니다. 기본값은 `10`, MAI 검증 run에서는 `25`를 사용했습니다.

### 외부 오디오 도구 공통

- `APPLIO_REPO_ROOT`
- `MMAUDIO_REPO_ROOT`
- `FISH_SPEECH_REPO_ROOT`
- `ACE_STEP_REPO_ROOT`
- `VIBEVOICE_REPO_ROOT`
  비워 두면 `vendor/*` 아래 체크아웃을 씁니다.
- `APPLIO_PYTHON_EXECUTABLE`
- `MMAUDIO_PYTHON_EXECUTABLE`
  특수한 가상환경을 직접 지정할 때만 씁니다.

### Applio / RVC

- `APPLIO_MODEL_DIR`
- `APPLIO_MODEL_PATH`
- `APPLIO_INDEX_PATH`
- `APPLIO_RVC_MODEL_URL`
- `APPLIO_RVC_INDEX_URL`
  기본 demo RVC pair가 아닌 다른 모델을 다운로드할 때 씁니다.
- `APPLIO_CONTENTVEC_MODEL_URL`
- `APPLIO_CONTENTVEC_CONFIG_URL`
- `APPLIO_RMVPE_URL`
  Applio가 변환 중 런타임 다운로드를 시도하지 않도록 `download_models.sh`가 미리 받는 embedder / predictor 자산입니다. 기본값은 IAHispano/Applio의 `contentvec`와 `rmvpe.pt`입니다.

### MMAudio

- `MMAUDIO_MODEL_URL`
- `MMAUDIO_CONFIG_URL`
- `MMAUDIO_COMMAND_TEMPLATE`
- `MMAUDIO_NSFW_MODEL_URL`
- `MMAUDIO_NSFW_COMMAND_TEMPLATE`
- `MMAUDIO_EMPTY_STRING_URL`
  MMAudio training에 필요한 empty-string text embedding입니다. 기본값은 upstream release의 `empty_string.pth`이며, `download_models.sh all`이 `vendor/MMAudio/ext_weights/empty_string.pth`로 미리 받습니다.

MMAudio 주의:

- 현재 메인 venv는 `torch/torchaudio 2.11.0+cu130` 기준입니다.
- 이 torchaudio wheel은 legacy `torio.io` 모듈을 제공하지 않습니다.
- 효과음 생성과 pre-extracted feature 기반 학습 진입점은 동작합니다.
- 44k pre-extracted feature 학습 smoke는 `v1-44.pth`, `synchformer_state_dict.pth`, `empty_string.pth` 기준으로 통과했습니다.
- raw video 평가/추출 유틸리티를 실제로 쓰려면 `torio` 호환 torch/torchaudio 빌드 또는 별도 video I/O 환경이 필요합니다.
- 백엔드의 MMAudio 학습 실행은 `MPLCONFIGDIR`를 `data/runtime/matplotlib` 아래로 고정해 홈 디렉터리 쓰기 권한 문제를 피합니다.
- 백엔드 training endpoint는 기본적으로 최종 샘플 평가를 학습 성공 조건에서 분리합니다. 필요할 때만 `run_final_sample=true`로 후처리 샘플링을 켭니다.

### S2-Pro

- `S2_PRO_RUNTIME`
  기본 provider입니다. `local` 또는 `api`.
- `S2_PRO_AUTO_START`
  `1`이면 백엔드가 Local S2-Pro 엔진을 자동 시작합니다.
- `S2_PRO_START_TIMEOUT_SEC`
  Local S2-Pro 엔진 readiness 대기 시간입니다. 첫 실행은 Fish Speech 모델 warm-up 때문에 길 수 있어 기본값을 600초로 둡니다.
- `FISH_SPEECH_MODEL_DIR`
- `FISH_SPEECH_SERVER_URL`
- `FISH_SPEECH_MODEL`
- `FISH_SPEECH_TIMEOUT_SEC`
  Local S2-Pro 생성 요청 제한 시간입니다. 첫 생성은 모델 warm-up까지 포함할 수 있어 기본값을 600초로 둡니다.
- `FISH_SPEECH_HOST`
- `FISH_SPEECH_PORT`
- `FISH_SPEECH_VENV`
- `FISH_SPEECH_PYTHON`
- `FISH_SPEECH_TORCH_VERSION`
- `FISH_SPEECH_TORCH_PROFILE`
  로컬 Fish Speech 전용 venv와 torch/CUDA line을 조절합니다.
- `FISH_AUDIO_API_KEY`
- `FISH_AUDIO_API_URL`
- `FISH_AUDIO_MODEL`
  Fish Audio API provider를 쓸 때만 API key가 필요합니다.

### VibeVoice

- `VIBEVOICE_REPO_ROOT`
- `VIBEVOICE_MODEL_DIR`
- `VIBEVOICE_PYTHON`
- `VIBEVOICE_ASR_MODEL_PATH`
- `VIBEVOICE_REALTIME_MODEL_PATH`
- `VIBEVOICE_TTS_15B_MODEL_PATH`
- `VIBEVOICE_TTS_7B_MODEL_PATH`
  비워 두면 `vendor/VibeVoice`, `.venv-vibevoice`, `data/models/vibevoice/*`를 씁니다.
- `VIBEVOICE_ASR_COMMAND_TEMPLATE`
- `VIBEVOICE_TTS_COMMAND_TEMPLATE`
- `VIBEVOICE_TTS_15B_COMMAND_TEMPLATE`
  공식 checkout의 엔트리포인트가 환경과 맞지 않거나 1.5B TTS 호환 엔트리포인트를 직접 지정해야 할 때만 씁니다.
- `VIBEVOICE_TTS_15B_INFERENCE_STEPS`
  앱에 포함된 1.5B TTS helper의 diffusion inference step 수입니다. 기본값은 `10`입니다.
- `VIBEVOICE_TTS_7B_INFERENCE_STEPS`
  7B community 모델의 diffusion inference step 수입니다. 기본값은 `12`입니다.
- `VIBEVOICE_TTS_FINETUNE_COMMAND_TEMPLATE`
  Microsoft VibeVoice repo가 공식 TTS LoRA trainer를 제공하지 않기 때문에, 별도 실험 trainer를 직접 연결할 때만 씁니다.

다운로드:

```bash
./scripts/download_models.sh vibevoice
```

VibeVoice code vendor는 `vendor/VibeVoice`에 저장소 일부로 포함되어 있어 별도 git clone을 하지 않습니다. `all` 프로필은 `microsoft/VibeVoice-ASR`, `microsoft/VibeVoice-Realtime-0.5B`, `vibevoice/VibeVoice-1.5B` 모델 weight를 모두 받습니다.
7B community 모델은 크기와 출처가 달라 기본 `all`에 포함하지 않고 `./scripts/download_models.sh vibevoice-7b` 또는 `VIBEVOICE_INCLUDE_7B=1 ./scripts/download_models.sh vibevoice`로 받습니다.
1.5B/7B TTS는 `scripts/run_vibevoice_tts_15b.py`와 `app/backend/app/vendor_patches/vibevoice/modeling_vibevoice_inference.py`를 통해 기본 실행됩니다.

VibeVoice는 다른 벤더 폴더처럼 앱 안에 이미 있어야 합니다. 다운로드 스크립트는 `vendor/VibeVoice`가 없으면 clone으로 복구하지 않고 오류를 냅니다. 새로 clone한 사용자가 바로 쓸 수 있도록 이 폴더는 저장소에 포함되어야 합니다.

VibeVoice의 로컬 산출물은 git에 넣지 않습니다.

```text
.venv-vibevoice/
data/models/vibevoice/
```

모델 준비 확인:

```bash
test -d vendor/VibeVoice
test -d .venv-vibevoice
test -d data/models/vibevoice/VibeVoice-ASR
test -d data/models/vibevoice/VibeVoice-Realtime-0.5B
test -d data/models/vibevoice/VibeVoice-1.5B
test -d data/models/vibevoice/VibeVoice-7B
find data/models/vibevoice -maxdepth 2 -name '*.safetensors'
```

VibeVoice 기능별 설명은 [23-vibevoice-workspace.md](./23-vibevoice-workspace.md)에 따로 정리했습니다.

### ACE-Step

- `ACE_STEP_REPO_ROOT`
- `ACE_STEP_PYTHON`
- `ACE_STEP_CHECKPOINT_PATH`
- `ACE_STEP_LORA_DIR`
- `ACE_STEP_VENV`
- `ACE_STEP_DOWNLOAD_PROFILE`

### Private asset mirror

- `PRIVATE_ASSET_REPO_ID`
- `PRIVATE_ASSET_REVISION`
- `QWEN_USE_PRIVATE_ASSET_REPO`
- `HF_HUB_ENABLE_HF_TRANSFER`
- `HF_TOKEN`

현재 기준 원칙:

- 절대경로를 기본값으로 쓰지 않습니다.
- `QWEN_DEMO_CUSTOM_MODEL`, `QWEN_DEMO_BASE_MODEL` 등을 비워 두면 `data/models/*`를 자동으로 찾습니다.
- 개발 머신마다 다른 경로는 `app/backend/.env`에만 두고, `.env.example`에는 넣지 않습니다.
- API key는 프런트에 두지 않습니다. Fish Audio API key는 백엔드 `.env`의 `FISH_AUDIO_API_KEY`만 사용합니다.

## 4-1. S2-Pro Provider

S2-Pro 기본값은 `Local S2-Pro`입니다. 이 경로는 API 비용 없이 로컬 GPU로 생성하고, 사용자가 별도 서버를 직접 켜는 구조가 아닙니다.

```bash
./scripts/download_models.sh s2pro
```

모델 다운로드 후에는 FastAPI 백엔드만 실행하면 됩니다. S2-Pro 생성 또는 목소리 저장 요청이 들어오면 백엔드가 `S2ProEngine` wrapper를 통해 Fish Speech source와 모델 파일을 확인하고, 로컬 endpoint가 아직 살아 있지 않으면 `scripts/serve_s2_pro.sh`를 자동으로 시작합니다.

이 구조는 `MMAudio`, `Applio`, `ACE-Step`처럼 “백엔드가 외부 오디오 엔진을 감싸고 상태를 관리하는 방식”에 맞춘 것입니다. `serve_s2_pro.sh`는 여전히 존재하지만 일반 사용자가 먼저 실행해야 하는 필수 단계가 아니라, 백엔드가 호출하는 launcher이자 디버깅용 수동 실행 진입점입니다.

`serve_s2_pro.sh`는 `.venv-fish-speech`를 별도로 만들어 Fish Speech를 설치합니다. Fish Speech 원본은 `torch==2.8.0`을 고정하지만, 이 프로젝트의 스크립트는 torch-family 패키지를 별도로 관리해서 기본값을 `torch 2.11.0 + cu130`으로 맞춥니다. 메인 `.venv`에 Fish Speech를 직접 설치하면 Torch와 flash-attn 조합이 바뀔 수 있으므로 분리합니다.

S2-Pro 로컬 런타임의 torch/CUDA 기본값:

```env
S2_PRO_RUNTIME=local
S2_PRO_AUTO_START=1
FISH_SPEECH_TORCH_VERSION=2.11.0
FISH_SPEECH_TORCH_PROFILE=cu130
```

다른 환경에서는 `FISH_SPEECH_TORCH_PROFILE=cu129`, `cu128`, `cpu`, `current` 중 하나로 바꿉니다. `current`는 torch 설치를 건드리지 않고 현재 venv에 들어 있는 torch를 그대로 씁니다.

기본 local endpoint:

```text
http://127.0.0.1:8080/v1/tts
```

웹 UI는 `/api/s2-pro/capabilities`에서 provider, 모델 파일, Local S2-Pro 엔진 상태를 확인하고 `/api/s2-pro/generate`로 생성 결과를 생성 갤러리에 저장합니다.

Hosted Fish Audio API를 쓰고 싶으면 백엔드 `.env`에 아래 값을 넣고, S2-Pro 화면에서 `Provider`를 `Fish Audio API`로 선택합니다. API 키는 프런트로 보내지 않고 백엔드에서만 사용합니다.

```env
S2_PRO_RUNTIME=api
FISH_AUDIO_API_KEY=...
FISH_AUDIO_API_URL=https://api.fish.audio
FISH_AUDIO_MODEL=s2-pro
```

로컬과 API를 화면에서 번갈아 쓰려면 `S2_PRO_RUNTIME=local`로 두고, 각 생성 폼의 `Provider`만 선택해도 됩니다.

## 4-2. ACE-Step 작곡 런타임

ACE-Step은 음악 모델 의존성이 크기 때문에 메인 Qwen `.venv`가 아니라 별도 `.venv-ace-step`에서 실행합니다.

```bash
./scripts/download_models.sh ace-step
```

기본 경로:

```env
ACE_STEP_REPO_ROOT=vendor/ACE-Step
ACE_STEP_PYTHON=.venv-ace-step/bin/python
ACE_STEP_CHECKPOINT_PATH=data/models/ace-step
```

웹 UI의 `ACE-Step 작곡` 탭은 `/api/music/ace-step/generate`를 호출하고, 백엔드는 `scripts/run_ace_step_generate.py`를 별도 프로세스로 실행합니다. 생성 결과는 `생성 갤러리`에 저장됩니다.

## 5. 프런트 빌드

기본 운영은 백엔드가 빌드된 프런트까지 함께 서빙하는 구조입니다.

```bash
cd app/frontend
npm install
npm run build
```

## 6. 백엔드 실행

macOS / Linux:

```bash
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

Windows PowerShell:

```powershell
cd app\backend
..\..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

접속 주소:

```text
http://127.0.0.1:8190/
```

## 7. 선택 사항: `next dev`

프런트 HMR이 필요할 때만 별도 개발 서버를 씁니다.

```bash
cd app/frontend
BACKEND_PORT=<BACKEND_PORT> npm run dev
```

이 경우 브라우저는 보통 `http://127.0.0.1:5173/`를 엽니다. `npm run dev`는 `NEXT_PUBLIC_API_BASE_URL`이 없으면 `BACKEND_PORT` 기준으로 API 주소를 잡습니다.

## 8. 기본 확인

백엔드 상태:

```bash
curl http://127.0.0.1:8190/api/health
```

특히 볼 값:

- `runtime_mode`
- `device`
- `attention_implementation`

프런트 엔트리 확인:

```bash
curl http://127.0.0.1:8190/
```

## 9. UI 기준 확인 포인트

- `텍스트 음성 변환`
  메인 TTS 화면으로 열리는지
- `목소리 복제`
  참조 음성에서 스타일 추출이 가능한지
- `목소리 설계`
  설명문으로 스타일을 만들 수 있는지
- `프리셋 기반 생성`
  저장 프리셋 반복 생성과 말투 지시 적용이 가능한지
- `생성 갤러리`
  생성 결과가 이 탭에만 모이고, 삭제 후 즉시 목록에서 사라지는지
- `데이터셋 만들기`
  dataset folder가 canonical 구조로 만들어지는지
- `학습 실행`
  준비된 dataset으로 Base / CustomVoice 학습을 시작할 수 있는지
- `사운드 효과`
  MMAudio 준비 여부가 보이는지
- `오디오 분리`
  Applio 변환/학습에 넘길 보컬 stem을 만들 수 있는지
- `Applio RVC 모델 학습`
  학습용 음성 폴더로 RVC 모델을 만들 수 있는지
- `Applio 단일 변환`
  업로드 파일과 생성 갤러리 음성을 RVC 모델로 변환할 수 있는지
- `Applio 배치 변환`
  여러 생성 갤러리 음성 또는 업로드 음성을 한 번에 변환할 수 있는지
- `Applio 모델 블렌딩`
  준비된 RVC 모델 두 개를 섞어 새 모델을 만들 수 있는지

## 10. 현재 운영 기준

- 메인 TTS는 `텍스트 음성 변환`입니다.
- 최근 생성 이력은 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.
- `목소리 복제`와 `목소리 설계`는 프리셋 생성용 탭입니다.
- `프리셋 기반 생성`은 저장 스타일의 반복 생성용 탭입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.

## 11. Base와 CustomVoice 이해하기

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

즉 `Base`가 참조 음성을 요구하는 이유는 UI 예외가 아니라 모델 역할 차이 때문입니다.

## 12. 샘플 수와 기대치

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  작은 실험용
- `20~50개`
  최소한의 화자 적응 기대 구간
- `50개 이상`
  음색 반영 안정성 개선 기대 구간

최근 기준으로는, 목소리 파인튜닝 권장 분량은 `10~30분`, 최소 실용선은 `5분 이상`으로 보는 것이 맞습니다.

기대치:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만 instruct 유지가 자동 보장되진 않음
- `CustomVoice Fine-Tune`
  음색 반영과 말투 지시 유지 후보 경로

## 13. 현재 검증된 MAI / VoiceBox 흐름

현재 MAI 한국어 기준 검증된 학습 입력은 아래입니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

검증된 산출물:

- plain CustomVoice:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- VoiceBox:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- VoiceBox 1 epoch 추가 학습:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`

1.7B full fine-tuning에서 RTX 5080 16GB 환경은 optimizer state 메모리 피크가 큽니다.
현재 검증된 full run은 아래 운영 변수를 사용했습니다.

```bash
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
QWEN_DEMO_OPTIMIZER=adafactor
QWEN_DEMO_LOG_EVERY=25
QWEN_DEMO_GRAD_ACCUM_STEPS=1
```

자세한 결과와 재현 명령은 [18-current-experiment-results.md](./18-current-experiment-results.md)를 봅니다.

다음 문서:

- [02-backend-guide.md](./02-backend-guide.md)
- [03-frontend-guide.md](./03-frontend-guide.md)
