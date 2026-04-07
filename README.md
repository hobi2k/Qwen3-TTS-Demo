# Qwen3-TTS-Demo

React + TypeScript 프론트엔드와 Python/FastAPI 백엔드로 만든 `Qwen3-TTS` 데모입니다.

이 프로젝트는 아래 흐름을 실제로 연결합니다.

- `CustomVoice` 빠른 품질 확인
- `VoiceDesign` 전용 실험 페이지
- `VoiceDesign -> Base clone prompt -> 고정 캐릭터 프리셋`
- 사용자 업로드 음성 -> `Base clone prompt -> 고정 캐릭터 프리셋`
- `Base` 단일 화자 파인튜닝용 데이터셋 빌더
- `prepare_data.py`, `sft_12hz.py` 실행 진입점

## 구조

```text
Qwen3-TTS-Demo/
  Qwen3-TTS/           # upstream reference repo
  app/
    backend/           # FastAPI API server
    frontend/          # React + TypeScript app
  data/                # uploads, generated audio, presets, datasets, finetune runs
  docs/plan.md         # 구현 계획서
```

## 실행 방법

### 1. 백엔드

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

기본값은 시뮬레이션 모드입니다.

- 시뮬레이션 모드: `QWEN_DEMO_SIMULATION=1`
- 실제 `qwen-tts` 사용: `QWEN_DEMO_SIMULATION=0`

실제 모델 모드에서는 현재 환경에 `qwen-tts`, `torch`, 필요한 GPU 의존성이 설치되어 있어야 합니다.

선택 가능한 환경 변수:

```bash
export QWEN_DEMO_SIMULATION=0
export QWEN_DEMO_DEVICE=cuda:0
export QWEN_DEMO_CUSTOM_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
export QWEN_DEMO_DESIGN_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
export QWEN_DEMO_BASE_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base
```

### 2. 프론트엔드

```bash
cd app/frontend
npm install
npm run dev
```

Vite 개발 서버는 `/api`, `/files`를 자동으로 `http://127.0.0.1:8000`으로 프록시합니다.

## 백엔드가 제공하는 주요 API

- `GET /api/health`
- `GET /api/models`
- `GET /api/speakers`
- `GET /api/history`
- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/clone-prompts/from-generated-sample`
- `POST /api/clone-prompts/from-upload`
- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/:id/generate`
- `POST /api/datasets`
- `POST /api/datasets/:id/prepare-codes`
- `POST /api/finetune-runs`

## 주의 사항

- 현재 파인튜닝 흐름은 upstream `Qwen3-TTS/finetuning/README.md` 기준의 `Base` 단일 화자 워크플로우에 맞춰져 있습니다.
- 시뮬레이션 모드에서는 실제 모델 대신 테스트용 오디오와 더미 학습 산출물을 만들어 전체 UX 흐름을 검증할 수 있습니다.
- 실제 파인튜닝 실행은 `qwen-tts`, `torch`, GPU, tokenizer/model 다운로드 상태에 따라 추가 설정이 필요합니다.

