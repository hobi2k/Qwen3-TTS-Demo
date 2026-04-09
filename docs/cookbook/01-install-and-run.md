# Installation and Run Guide

이 문서는 현재 저장소 기준의 실제 실행 순서를 정리합니다. 현재 기준은 루트 `.venv`와 `uv` 기반 환경을 먼저 정리하고, 그 위에서 모델 다운로드와 백엔드/프런트 실행을 이어가는 방식입니다.

## 요구 사항

- Python `3.11+`
- Node.js `18+`
- `npm`
- 권장: `sox`
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

- 루트 `.venv` 가상환경 생성 또는 재사용
- `pip`가 없으면 `python -m ensurepip --upgrade` 자동 수행
- `uv sync`
- `uv pip install hf_transfer certifi`
- `app/backend/.env` 생성
- 현재 머신의 `device` / `attention` 요약 출력

직접 복구가 필요할 때는 아래 명령을 사용할 수 있습니다.

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
uv pip install hf_transfer certifi
```

## 3. 모델 다운로드

### 기본: 전 모델 다운로드

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

가볍게만 준비하려면 `core`를 쓸 수 있습니다.

```bash
./scripts/download_models.sh core
```

```powershell
.\scripts\download_models.ps1 core
```

모델은 `data/models/` 아래에 저장됩니다.
참조 음성 자동 전사도 기본적으로 `data/models/whisper-large-v3`를 사용합니다.

## 4. `.env` 확인

기본 템플릿은 [app/backend/.env.example](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/.env.example)입니다.

중요한 변수:

- `QWEN_DEMO_SIMULATION`
- `QWEN_DEMO_DEVICE`
- `QWEN_DEMO_ATTN_IMPL`
- `QWEN_DEMO_CUSTOM_MODEL`
- `QWEN_DEMO_DESIGN_MODEL`
- `QWEN_DEMO_BASE_MODEL`
- `QWEN_DEMO_TOKENIZER_MODEL`

백엔드는 `.env`를 시작 시 자동으로 읽습니다.

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

프런트엔드 프록시 확인:

```bash
curl http://127.0.0.1:5173/api/health
```

생성 입력 권장:

- 대사 텍스트는 한국어로 작성
- `CustomVoice` instruction은 영어로 작성
- `VoiceDesign` 설명문도 영어로 작성
- 실제 한국어 합성 품질 점검 전에는 `runtime_mode=real`을 먼저 확인

## 8. 현재 구현 기준 운영 포인트

- 시뮬레이션은 `qwen_tts`가 없을 때 fallback 용도입니다.
- 실모델 모드에서는 기능별 모델 선택이 웹에서 가능합니다.
- `flash_attention_2`는 설치되어 있을 때만 사용하고, 아니면 `sdpa`로 fallback 합니다.
- Apple Silicon에서는 `device=mps`, `attention=sdpa`가 정상 경로일 수 있습니다.
- CPU-only 환경에서는 `device=cpu`, `attention=sdpa` fallback이 정상입니다.
- `setup_backend` 실행 중 `onnxruntime` 등에서 재시도 후 실패하면, 대체로 코드 문제가 아니라 네트워크/DNS 문제입니다.
- 파인튜닝은 업스트림 `Base` 단일 화자 워크플로우를 기준으로 합니다.
- 생성 초반에 아주 짧은 저레벨 프리롤이 들리는 경우를 줄이기 위해, 백엔드는 생성 후 첫 `35ms` 안에서만 보수적인 leading trim과 짧은 fade-in을 적용합니다.
- 적용 여부는 `data/generated/gen_*.json`의 `meta.postprocess` 또는 API 응답 메타데이터에서 확인할 수 있습니다.

## 9. 다음 문서

- 백엔드 구조: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 구조: [03-frontend-guide.md](./03-frontend-guide.md)
- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
