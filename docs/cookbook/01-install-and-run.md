# Installation and Run Guide

이 문서는 현재 저장소 기준의 실제 실행 순서를 정리합니다. 기준 흐름은 `setup -> download -> env 확인 -> backend -> frontend`입니다.

## 요구 사항

- Python `3.11+`
- Node.js `18+`
- `npm`
- 권장: `ffmpeg`, `sox`
- 실모델 모드에서 Hugging Face 다운로드가 가능한 네트워크

## 1. Clone

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
```

## 2. 백엔드 준비

### macOS / Linux

```bash
./scripts/setup_backend.sh
```

### Windows PowerShell

```powershell
.\scripts\setup_backend.ps1
```

이 단계에서 하는 일:

- 루트 `.venv` 생성 또는 재사용
- `ensurepip`로 `pip` 자동 복구 시도
- `uv sync`
- `uv pip install hf_transfer certifi`
- `vendor/Applio`, `vendor/MMAudio` clone 또는 재사용
- vendor repo의 `requirements.txt`가 있으면 추가 설치 시도
- `app/backend/.env` 생성
- `ffmpeg`, `sox` 점검
- 현재 머신의 `device` / `attention` 요약 출력

직접 복구가 필요할 때는 아래 명령을 사용할 수 있습니다.

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
uv pip install hf_transfer certifi
```

## 3. 모델과 오디오 툴 자산 다운로드

### macOS / Linux

```bash
./scripts/download_models.sh
```

### Windows PowerShell

```powershell
.\scripts\download_models.ps1
```

기본 프로필 `all`은 아래를 받습니다.

- `Qwen3-TTS-Tokenizer-12Hz`
- `Qwen3-TTS-12Hz-0.6B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `Qwen3-TTS-12Hz-0.6B-Base`
- `Qwen3-TTS-12Hz-1.7B-Base`
- `whisper-large-v3`

추가 동작:

- `vendor/Applio`, `vendor/MMAudio` clone 또는 재사용
- `APPLIO_RVC_MODEL_URL`, `APPLIO_RVC_INDEX_URL`가 설정된 경우 `data/rvc-models/`로 다운로드
- `MMAUDIO_MODEL_URL`, `MMAUDIO_CONFIG_URL`가 설정된 경우 `data/mmaudio/`로 다운로드

가볍게만 준비하려면 `core`를 쓸 수 있습니다.

```bash
./scripts/download_models.sh core
```

```powershell
.\scripts\download_models.ps1 core
```

## 4. `.env` 확인

기본 템플릿은 [app/backend/.env.example](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/.env.example)입니다.

중요한 변수:

- `QWEN_DEMO_SIMULATION`
- `QWEN_DEMO_DEVICE`
- `QWEN_DEMO_ATTN_IMPL`
- `QWEN_DEMO_CUSTOM_MODEL`
- `QWEN_DEMO_DESIGN_MODEL`
- `QWEN_DEMO_BASE_MODEL`
- `QWEN_DEMO_TOKENIZER_MODEL`
- `MMAUDIO_REPO_URL`
- `APPLIO_REPO_URL`
- `APPLIO_REPO_ROOT`
- `MMAUDIO_REPO_ROOT`
- `APPLIO_PYTHON_EXECUTABLE`
- `MMAUDIO_PYTHON_EXECUTABLE`
- `MMAUDIO_INFER_SCRIPT`
- `MMAUDIO_COMMAND_TEMPLATE`
- `APPLIO_RVC_MODEL_URL`
- `APPLIO_RVC_INDEX_URL`
- `MMAUDIO_MODEL_URL`
- `MMAUDIO_CONFIG_URL`

기준 메모:

- `Applio`는 기본 공식 저장소 URL이 스크립트에 들어 있습니다.
- `MMAudio`도 기본 공식 저장소 URL이 스크립트에 들어 있습니다.
- 체크포인트와 설정 파일이 별도로 필요하면 `MMAUDIO_MODEL_URL`, `MMAUDIO_CONFIG_URL`을 넣는 방식을 권장합니다.
- 사운드 효과는 더 이상 가짜 procedural fallback을 쓰지 않습니다. `MMAudio`가 준비되지 않으면 capability가 비활성으로 내려옵니다.

## 5. 백엔드 실행

### macOS / Linux

```bash
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --reload
```

### Windows PowerShell

```powershell
cd app\backend
..\..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

## 6. 프런트엔드 실행

다른 터미널에서:

```bash
cd app/frontend
npm install
npm run dev
```

Windows PowerShell도 동일합니다.

## 7. 기본 확인

백엔드 상태 확인:

```bash
curl http://127.0.0.1:8000/api/health
```

헬스 응답에서 특히 볼 값:

- `runtime_mode`
- `device`
- `attention_implementation`
- `recommended_instruction_language`

UI 기준 확인 포인트:

- `빠르게 들어보기`
  - 한국어 대사 + 영어 style/instruction 조합
- `목소리 복제`
  - `Base` 모델 선택 후 clone prompt / preset 저장
- `사운드 효과`
  - `MMAudio` 준비 여부
- `보이스 체인저`
  - `Applio` 준비 여부와 RVC 모델 목록
- `오디오 분리`
  - 독립 페이지에서 업로드/서버 오디오 선택
- `Training Lab`
  - dataset 생성, prepare, fine-tuning

## 8. 현재 구현 기준 운영 포인트

- 시뮬레이션은 `qwen_tts`가 없을 때 fallback 용도입니다.
- 실모델 모드에서는 기능별 모델 선택이 웹에서 가능합니다.
- macOS / Apple Silicon에서는 `sdpa` fallback이 기본 경로입니다.
- Windows 또는 Ubuntu에서 CUDA가 감지되면 `flash-attn` 설치를 우선 시도하고, 가능할 때 `flash_attention_2`를 사용합니다.
- `flash_attn`이 없거나 CPU-only 환경이면 `sdpa`로 fallback 합니다.
- `CustomVoice` instruction, `VoiceDesign` 설명문, 사운드 효과 프롬프트는 영어 기준을 권장합니다.
- 생성 초반에 아주 짧은 저레벨 프리롤이 들리는 경우를 줄이기 위해, 백엔드는 생성 후 첫 `35ms` 안에서만 보수적인 leading trim과 짧은 fade-in을 적용합니다.
- 적용 여부는 생성 메타데이터의 `postprocess.leading_trim_samples`, `postprocess.fade_in_samples`에서 확인할 수 있습니다.

## 9. 다음 문서

- 백엔드 구조: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 구조: [03-frontend-guide.md](./03-frontend-guide.md)
- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
