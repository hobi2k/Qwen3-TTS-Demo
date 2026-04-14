# Qwen3-TTS-Demo

React + TypeScript 프런트엔드와 Python/FastAPI 백엔드로 만든 `Qwen3-TTS` 로컬 데모입니다.

이 프로젝트는 아래 사용자 작업을 하나의 로컬 제품으로 묶습니다.

- `텍스트 음성 변환`
  메인 TTS 화면입니다. 빠른 확인과 모델 선택형 추론을 한 화면으로 합쳤습니다.
- `목소리 복제`
  참조 음성에서 clone prompt를 만들고 저장합니다.
- `목소리 설계`
  설명문으로 새 스타일을 설계하고 저장합니다.
- `프리셋 프로젝트`
  저장한 스타일 프리셋으로 반복 생성과 프로젝트 관리를 합니다.
- `스토리 스튜디오`
  긴 대본을 한 번에 생성합니다.
- `갤러리`
  최근 생성 이력과 저장 자산을 한곳에서 관리합니다.
- `데이터셋 만들기`
  학습용 오디오와 전사 텍스트를 정리합니다.
- `훈련 랩`
  준비된 데이터셋으로 `Base` 또는 `CustomVoice` 파인튜닝을 실행합니다.
- `사운드 효과`, `보이스 체인저`, `오디오 분리`
  TTS 외 오디오 작업을 담당합니다.
- 학습 결과 음성 품질 검증 워크플로우

## 문서 허브

- 문서 시작점: [docs/cookbook/00-index.md](docs/cookbook/00-index.md)
- 설치 및 실행: [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)
- 백엔드 구조: [docs/cookbook/02-backend-guide.md](docs/cookbook/02-backend-guide.md)
- 프런트엔드 구조: [docs/cookbook/03-frontend-guide.md](docs/cookbook/03-frontend-guide.md)
- 업스트림 개요: [docs/cookbook/04-qwen3-tts-overview.md](docs/cookbook/04-qwen3-tts-overview.md)
- examples와 파인튜닝: [docs/cookbook/05-finetuning-and-examples.md](docs/cookbook/05-finetuning-and-examples.md)
- 학습 파이프라인 변경 상세: [docs/cookbook/06-training-pipeline-changes.md](docs/cookbook/06-training-pipeline-changes.md)
- 추론 파이프라인 변경 상세: [docs/cookbook/07-inference-pipeline-changes.md](docs/cookbook/07-inference-pipeline-changes.md)
- FlashAttention 설치 가이드: [docs/cookbook/08-flash-attn-install.md](docs/cookbook/08-flash-attn-install.md)
- Speech Quality Validation Workflow: [docs/cookbook/09-quality-validation-workflow.md](docs/cookbook/09-quality-validation-workflow.md)
- Quality Validation Plan: [docs/cookbook/10-quality-validation-plan.md](docs/cookbook/10-quality-validation-plan.md)

## 구조

```text
Qwen3-TTS-Demo/
  Qwen3-TTS/           # upstream reference repo
  app/
    backend/           # FastAPI API server
    frontend/          # React + TypeScript app
  data/                # uploads, generated audio, presets, datasets, finetune runs
  docs/
    plan.md
    cookbook/          # 설치, 실행, 코드 구조 설명서
```

## 데이터셋 레이아웃 원칙

이 프로젝트에서 데이터셋은 반드시 `data/datasets/<dataset_id>/` 단일 폴더 안에 모아 둡니다.
오디오 자산, raw/prepared JSONL, manifest, UI용 dataset record가 한곳에 있어야 유지보수와 삭제, 백업, 재학습이 쉬워집니다.

예시:

```text
data/datasets/mai_ko_full/
  audio/
    00000.wav
    00001.wav
    ...
  raw.jsonl
  train_raw.jsonl
  eval_raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json
```

추가 원칙:

- `dataset_id`는 랜덤 `dataset_xxx`가 아니라 데이터셋 이름 기반 slug를 우선 사용합니다.
- 기준 음성은 `reference_<원본이름>.wav`, 샘플은 `sample_0001_<원본이름>.wav`처럼 복사됩니다.
- WEB UI와 API는 `dataset_root_path`, `audio_dir_path`, `manifest_path`를 함께 노출해 폴더 전체를 추적할 수 있게 합니다.

## 생성 파일명 원칙

생성 오디오도 더 이상 flat `audio_xxx.wav`만 쓰지 않습니다. 새로 생성되는 파일은 기능별/날짜별 폴더에 읽을 수 있는 slug 이름으로 저장됩니다.

예시:

```text
data/generated/sound-effects/2026-04-13/151244_짧은-쇳소리-충돌음.wav
data/generated/tts-custom/2026-04-13/152015_sohee_오늘은-정말-힘들었어.wav
data/generated/audio-separation/2026-04-13/152430_harmonic_00000-wav.wav
```

이 규칙은 다운로드 파일명, 이력 카드, 오디오 자산 브라우저에서 모두 같은 이름을 보게 하기 위한 것입니다.

기존 flat/random 산출물도 서버 시작 시 한 번 정리합니다.

- `data/generated/*.wav`, `gen_*.json` 같은 옛 파일은 기능별/date 폴더로 이동합니다.
- `data/audio-tools/*.json`도 tool/date 구조로 이동합니다.
- `data/clone-prompts/*.pkl|json`, `data/presets/*.json`도 읽을 수 있는 slug 이름으로 재배치됩니다.

`데이터셋 만들기` 화면에서 새 데이터셋을 만들 때도 외부 파일 경로를 그대로 참조하지 않고,
선택한 음성 파일을 이 폴더 안 `audio/`로 복사한 뒤 JSONL을 생성하는 것을 표준으로 삼습니다.

## UI 구조

현재 사용자 기준 화면 구조는 아래와 같습니다.

- `홈`
  무엇을 할지 고르는 시작 화면
- `갤러리`
  최근 생성 이력과 저장 자산을 한곳에서 보는 화면
- `텍스트 음성 변환`
  모델을 고르고 바로 들어보는 메인 TTS 화면
- `목소리 복제`
  참조 음성에서 스타일을 추출하는 화면
- `목소리 설계`
  설명문으로 스타일을 만드는 화면
- `프리셋 프로젝트`
  저장한 프리셋으로 반복 생성하는 화면
- `스토리 스튜디오`
  장시간 대본을 한 번에 처리하는 화면
- `사운드 효과`
- `보이스 체인저`
- `오디오 분리`
- `데이터셋 만들기`
- `훈련 랩`

문서 기준 원칙:

- 최근 생성 이력은 여러 탭에 흩어두지 않고 `갤러리`에서 관리합니다.
- `텍스트 음성 변환`은 “빠르게 들어보기”와 “모델 선택 추론”을 합친 메인 화면입니다.
- `목소리 복제`와 `목소리 설계`는 별도 탭으로 나눕니다.
- `프리셋 프로젝트`는 반복 생성 전용 탭입니다.
- `스토리 스튜디오`는 장면 번호를 읽게 하는 기능이 아니라 긴 대본 생성 기능입니다.
- `데이터셋 만들기`와 `훈련 랩`은 분리합니다.

## Base와 CustomVoice를 사용자 입장에서 이해하기

두 모델의 차이는 기술 구현보다 “무엇을 먼저 준비해야 하는지”로 이해하는 편이 쉽습니다.

- `CustomVoice`
  이미 화자와 말투 지시를 바로 받을 수 있는 모델입니다. 짧은 문장 확인, 일반적인 TTS, 말투 지시 실험에 적합합니다.
- `Base`
  누구 목소리로 말할지 먼저 알려줘야 하는 모델입니다. 그래서 `Base`를 쓸 때는 참조 음성이나 저장된 스타일 프리셋이 필요합니다.

정리하면:

- `CustomVoice`는 바로 말시키기 쉬운 모델
- `Base`는 목소리 기준을 먼저 알려줘야 하는 모델

이 차이 때문에 UI도 다르게 구성합니다.

- `텍스트 음성 변환`에서는 보통 `CustomVoice`를 가장 쉽게 씁니다.
- `목소리 복제`에서는 `Base`로 스타일을 추출해 프리셋을 만듭니다.
- 저장한 프리셋은 이후 `텍스트 음성 변환`, `프리셋 프로젝트`, `스토리 스튜디오`에서 다시 사용합니다.

## 빠른 시작

macOS / Linux:

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
./scripts/setup_backend.sh
./scripts/download_models.sh
cd app/frontend && npm install && cd ../..
cd app/backend && source ../../.venv/bin/activate && uvicorn app.main:app --reload
```

Windows PowerShell:

```powershell
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
.\scripts\setup_backend.ps1
.\scripts\download_models.ps1
cd app\frontend
npm install
cd ..\..
cd app\backend
..\..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

다른 터미널에서:

```bash
cd app/frontend
npm run dev
```

상세 절차와 실모델 실행 방법은 [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)에 정리되어 있습니다.

## 가상환경과 다운로드 준비

가상환경 안 `pip`가 없거나 깨진 경우에는 먼저 아래 명령을 실행합니다. `setup_backend.sh`도 이 복구를 자동으로 시도합니다.

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
```

`setup_backend.sh`와 `setup_backend.ps1`는 현재 아래 작업까지 한 번에 수행합니다.

- 루트 `.venv` 생성 또는 재사용
- `python -m ensurepip --upgrade` 자동 복구
- `uv sync`
- `uv pip install hf_transfer certifi`
- `vendor/Applio`, `vendor/MMAudio` 체크아웃 또는 재사용
- vendor repo에 `requirements.txt`가 있으면 추가 설치 시도
- `app/backend/.env` 템플릿 생성
- 시스템 의존성 점검: `ffmpeg`, `sox`
- 플랫폼별 attention 기본값 정리
  - macOS: `sdpa`
  - Linux + CUDA: `flash_attn`이 설치되어 있으면 `flash_attention_2`
  - 그 외 CUDA 환경: `sdpa`

## FlashAttention 2

이 프로젝트는 Linux + CUDA 서버에서 `sdpa`보다 `FlashAttention` 사용을 우선합니다.
현재 `torch 2.11.0 + cu130` 환경에서는 소스 빌드보다, 아래 Linux prebuilt wheel을 사용한
`flash_attn` v2 설치가 가장 재현 가능했고 실제 GPU smoke test까지 통과했습니다.

출처:

- FlashAttention v2 Linux prebuilt wheels:
  `https://github.com/mjun0812/flash-attention-prebuild-wheels/releases`

우리 환경에서 사용한 설치 명령:

```bash
uv pip install --no-cache-dir "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.9.4/flash_attn-2.8.3+cu130torch2.11-cp311-cp311-linux_x86_64.whl"
```

설치 후 검증:

```bash
uv pip show flash-attn
python -c "import importlib.util; print(importlib.util.find_spec('flash_attn') is not None)"
python -c "import torch; from flash_attn.flash_attn_interface import flash_attn_func; q=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); k=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); v=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); out=flash_attn_func(q,k,v,0.0,softmax_scale=None,causal=False); print(tuple(out.shape), out.dtype, out.device)"
python -c "from qwen_tts import Qwen3TTSModel; print('import ok')"
```

상세 절차와 주의사항은 [docs/cookbook/08-flash-attn-install.md](docs/cookbook/08-flash-attn-install.md)에 정리되어 있습니다.

Hugging Face 다운로드 가속을 수동으로 먼저 준비하고 싶다면 루트에서 아래 명령을 실행합니다.

```bash
uv pip install hf_transfer
```

## 백엔드 시작 전에 꼭 해야 하는 것

백엔드는 바로 켜는 구조가 아니라 아래 순서를 먼저 밟는 걸 기준으로 합니다.

1. `./scripts/setup_backend.sh`
2. `./scripts/download_models.sh`
3. `app/backend/.env` 확인
4. 백엔드 실행

Windows PowerShell 기준:

1. `.\scripts\setup_backend.ps1`
2. `.\scripts\download_models.ps1`
3. `app/backend/.env` 확인
4. 백엔드 실행

### `setup_backend.sh`

- 루트 `.venv` 가상환경 생성 또는 재사용
- `pip`가 없으면 `ensurepip`로 자동 복구
- `uv sync`로 Python 의존성 동기화
- `hf_transfer`, `certifi` 추가 설치
- `ffmpeg` 설치 여부 경고
- `sox` 설치 여부 경고
- macOS면 `sdpa` 기본값 사용
- Ubuntu + CUDA 환경이면 `flash-attn` 설치 시도
- 현재 머신의 device / attention 요약 출력
- `app/backend/.env` 템플릿 생성

### `setup_backend.ps1`

- Windows PowerShell용 백엔드 부트스트랩
- 루트 `.venv` 가상환경 생성 또는 재사용
- `pip`가 없으면 `ensurepip`로 자동 복구
- `uv sync`로 Python 의존성 동기화
- `hf_transfer`, `certifi` 추가 설치
- `ffmpeg` PATH 경고
- `sox` PATH 경고
- 현재 머신의 device / attention 요약 출력
- `app/backend/.env` 템플릿 생성

### `download_models.sh`

- Hugging Face에서 로컬 모델 디렉터리로 다운로드
- 기본 프로필 `all`
  - `Qwen3-TTS-Tokenizer-12Hz`
  - `Qwen3-TTS-12Hz-0.6B-CustomVoice`
  - `Qwen3-TTS-12Hz-1.7B-CustomVoice`
  - `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
  - `Qwen3-TTS-12Hz-0.6B-Base`
  - `Qwen3-TTS-12Hz-1.7B-Base`
  - `whisper-large-v3`
- 가벼운 빠른 준비만 원하면 `core`
  - `Qwen3-TTS-Tokenizer-12Hz`
  - `Qwen3-TTS-12Hz-0.6B-CustomVoice`
  - `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
  - `Qwen3-TTS-12Hz-0.6B-Base`
  - `whisper-large-v3`
- `vendor/Applio`와 `vendor/MMAudio` 저장소 clone
- 주의:
  - Applio 저장소 clone만으로는 보이스 체인저용 RVC 모델이 생기지 않습니다.
  - `.pth`와 `.index`를 함께 받으려면 `APPLIO_RVC_MODEL_URL`, `APPLIO_RVC_INDEX_URL`를 둘 다 지정해야 합니다.
  - 현재 다운로드 상태는 `python scripts/inspect_applio_downloads.py`로 바로 확인할 수 있습니다.
- 프런트엔드에서는 다운로드된 전체 모델 중에서 기능별로 선택 가능
  - clone prompt용 참조 텍스트 자동 전사도 `data/models/whisper-large-v3`를 우선 사용
- 추가로 vendor repo와 오디오 툴 자산도 처리
  - `vendor/Applio`, `vendor/MMAudio` clone 또는 재사용
  - `APPLIO_RVC_MODEL_URL`, `APPLIO_RVC_INDEX_URL`가 설정된 경우 기본 RVC 모델 자산 다운로드
  - `MMAUDIO_MODEL_URL`, `MMAUDIO_CONFIG_URL`가 설정된 경우 MMAudio 자산 다운로드

중요한 점:

- `Applio`는 setup/download 스크립트가 기본 공식 저장소 URL을 사용해 준비합니다.
- `MMAudio`도 setup/download 스크립트가 기본 공식 저장소 URL을 사용해 준비합니다.
- 추가 체크포인트나 설정 파일이 필요하면 `MMAUDIO_MODEL_URL`, `MMAUDIO_CONFIG_URL`을 `.env`에 넣어 받습니다.
- 사운드 효과는 더 이상 간이 procedural fallback을 쓰지 않습니다. `MMAudio`가 준비되지 않으면 백엔드 capability에서 비활성으로 보입니다.

## 오디오 툴 메모

- `Sound Effects`
  - `MMAudio` 기반입니다.
  - 길이와 강도 입력은 실제 요청 파라미터로 전달됩니다.
  - `MMAudio` repo 또는 체크포인트가 없으면 사용할 수 없습니다.
- `Voice Changer`
  - `Applio` 기반 RVC 호출입니다.
  - 제품 UI는 모델 경로 직접 입력보다, 서버에서 발견한 모델 목록을 고르는 흐름을 우선합니다.
- `Audio Separation`
  - 독립 페이지로 분리되어 있고, 업로드 또는 서버 오디오 선택 기준으로 사용합니다.

```bash
./scripts/download_models.sh core
```

PowerShell:

```powershell
.\scripts\download_models.ps1 core
```

모델은 `data/models/` 아래에 저장되고, `.env`에서는 그 로컬 경로를 읽어 사용합니다.
스크립트는 루트 `.venv`를 사용합니다.

## 기본 검증

백엔드 상태 확인:

```bash
curl http://127.0.0.1:8000/api/health
```

프런트엔드 프록시 확인:

```bash
curl http://127.0.0.1:5173/api/health
```

권장 입력 원칙:

- 대사 텍스트는 한국어로 넣어도 됩니다.
- `CustomVoice`의 말투 지시와 `목소리 설계` 설명문은 영어 입력을 기본 권장으로 사용합니다.
- `GET /api/health`에서 `runtime_mode=real`인지 먼저 확인한 뒤 실제 음성을 점검하는 흐름을 권장합니다.

## 품질 검증

학습된 Base FT, CustomVoice FT, clone prompt 재사용, hybrid clone+instruct 경로를 한 번에 확인하려면 아래 스크립트를 사용합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --probe-text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --suite all \
  --prompt-set aggressive
```

결과는 `data/generated/quality-validation/<timestamp>/` 아래에 저장됩니다.
자세한 해석은 [docs/cookbook/09-quality-validation-workflow.md](docs/cookbook/09-quality-validation-workflow.md)를 보세요.

검증 우선순위와 현재 막힌 점은 [docs/cookbook/10-quality-validation-plan.md](docs/cookbook/10-quality-validation-plan.md)에 따로 정리했습니다.

## 주요 API

- `GET /api/health`
- `GET /api/models`
- `GET /api/speakers`
- `GET /api/history`
- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`
- `POST /api/generate/model`
- `POST /api/generate/hybrid-clone-instruct`
- `POST /api/clone-prompts/from-generated-sample`
- `POST /api/clone-prompts/from-upload`
- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/:id/generate`
- `POST /api/datasets`
- `POST /api/datasets/:id/prepare-codes`
- `POST /api/finetune-runs`

## 고급 경로

### 1. Base Fine-Tune

- 업스트림 기본 경로
- 실행 스크립트: `Qwen3-TTS/finetuning/sft_12hz.py`
- WEB UI:
  `훈련 랩`
- 결과는 여러 체크포인트를 모두 노출하는 대신, 최종 선택용 모델 하나를 기준으로 다시 사용합니다.

### 2. CustomVoice Fine-Tune

- 별도 경로로 분리된 `CustomVoice` 전용 엔트리
- 실행 스크립트:
  `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py`
- 핵심 차이:
  `CustomVoice` 체크포인트는 speaker encoder가 없어서, `Base` 체크포인트의 speaker encoder를 보조로 받아 새 화자를 추가합니다.
- WEB UI:
  `훈련 랩`
  여기서 `speaker_encoder_model_path`도 함께 선택합니다.

### 3. Clone Prompt + Instruct Hybrid

- 목표:
  `Base`의 clone prompt 음색과 `CustomVoice`의 instruct 제어를 한 번에 실험
- 별도 스크립트:
  `Qwen3-TTS/examples/test_model_12hz_custom_clone_instruct.py`
- WEB UI:
  `프리셋 프로젝트`
- 입력:
  저장된 `스타일 프리셋`을 먼저 고르고, 필요하면 `Base 모델`, 참조 음성, 참조 텍스트를 고급 입력으로 덮어쓴 뒤 `CustomVoice 모델`, `instruct`, `대사`, 고급 생성 파라미터를 조절합니다.

### 4. WEB UI에서 확인되는 것

- `홈`
  - 기능 진입점과 현재 준비 상태 요약
- `갤러리`
  - 최근 생성 음성, 저장 프리셋, 프로젝트 자산 확인
- `텍스트 음성 변환`
  - 모델 선택, 대사 입력, 필요 시 저장 프리셋 적용
  - `Base`를 고르면 왜 참조 음성 또는 프리셋이 필요한지 함께 설명
- `목소리 복제`
  - 참조 음성에서 clone prompt와 프리셋 생성
- `목소리 설계`
  - 설명문에서 스타일 생성 및 저장
- `프리셋 프로젝트`
  - 저장한 프리셋을 반복 생성용 프로젝트로 관리
- `스토리 스튜디오`
  - 긴 대본 생성
- `사운드 효과`
  - `MMAudio` 기반 효과음 생성
- `보이스 체인저`
  - `Applio/RVC` 기반 audio-to-audio 음색 변환
- `오디오 분리`
  - 업로드 또는 서버 오디오 선택 후 분리 실행
- `데이터셋 만들기`
  - 학습 샘플 정리와 데이터셋 생성
- `훈련 랩`
  - 준비된 데이터셋을 골라 Base / CustomVoice 학습 실행

## 주의 사항

- 현재 파인튜닝 흐름은 upstream `Qwen3-TTS/finetuning/README.md` 기준의 `Base` 단일 화자 워크플로우를 기본으로 하고, `CustomVoice`는 별도 엔트리로 확장합니다.
- 실제 파인튜닝 실행은 `qwen-tts`, `torch`, GPU, tokenizer/model 다운로드 상태에 따라 추가 설정이 필요합니다.
- `ffmpeg`는 Python `requirements.txt`에 넣는 항목이 아니라 시스템 바이너리입니다. Whisper 전사를 쓰려면 PATH에 설치되어 있어야 합니다.
- `sox`는 현재 환경 기준 필수는 아니지만, 설치되지 않으면 업스트림 초기화 경고가 출력됩니다.
- macOS / Apple Silicon에서는 `sdpa` fallback이 기본 경로입니다.
- Windows 또는 Ubuntu에서 CUDA가 감지되면 `flash-attn` 설치를 우선 시도하고, 가능할 때 `flash_attention_2`를 사용합니다.
- `보이스 체인저`는 별도의 RVC 모델 자산이 필요합니다.
- `setup_backend.sh`가 `uv sync` 단계에서 실패한다면, 대개 네트워크 또는 DNS 문제입니다.
- Apple Silicon 환경에서는 `device=mps`, `attention=sdpa` 조합이 정상 동작 경로일 수 있습니다.
- 일부 생성 결과에서 시작 직후 아주 짧은 저레벨 웅얼거림처럼 들리는 앞머리 구간이 있을 수 있어, 백엔드에서는 생성 후 첫 `35ms` 범위 안에서만 보수적인 leading trim과 짧은 fade-in을 적용합니다.
- 이 보정이 실제로 적용됐는지는 생성 이력 JSON의 `meta.postprocess.leading_trim_samples`와 `meta.postprocess.fade_in_samples`에서 확인할 수 있습니다.
- 업스트림에는 `negative prompt` 개념이 별도로 노출되어 있지 않습니다.
- 대신 웹 UI의 `고급 제어`에서 `seed`, `do_sample`, `top_k`, `top_p`, `temperature`, `repetition_penalty`, `subtalker_*`, `max_new_tokens`, `non_streaming_mode`, `extra_generate_kwargs`를 직접 조절할 수 있습니다.
- 같은 프롬프트에서도 `seed`를 고정하지 않으면 샘플링 차이로 한숨, 숨소리, 어택 차이가 생길 수 있습니다.

## 학습 샘플 수와 기대치

학습 화면에는 아래 기준을 함께 안내하는 것을 권장합니다.

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  아주 작은 실험용
- `20~50개`
  최소한의 화자 적응을 기대할 수 있는 구간
- `50개 이상`
  음색 반영과 안정성이 더 나아질 가능성이 큼

중요한 점:

- `Base Fine-Tune`은 dataset 음색 적응 실험에는 쓸 수 있지만, instruct 준수까지 자동으로 좋아지는 것은 아닙니다.
- `CustomVoice Fine-Tune`은 말투 지시를 유지한 채 dataset 음색을 반영하는 후보 경로이지만, 데이터 품질과 양에 따라 결과 차이가 큽니다.
- 품질 평가는 반드시 두 축으로 확인해야 합니다.
  - dataset 음색을 제대로 닮았는지
  - 말투 지시를 여전히 잘 따르는지
