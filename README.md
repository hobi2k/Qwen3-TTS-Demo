# Qwen3-TTS-Demo

React + TypeScript 프런트엔드와 Python/FastAPI 백엔드로 만든 `Qwen3-TTS` 로컬 데모입니다.

이 프로젝트는 아래 흐름을 실제로 연결합니다.

- `CustomVoice` 빠른 품질 확인
- `VoiceDesign` 전용 실험 페이지
- `VoiceDesign -> Base clone prompt -> 고정 캐릭터 프리셋`
- 사용자 업로드 음성 -> `Base clone prompt -> 고정 캐릭터 프리셋`
- `Base` 단일 화자 파인튜닝용 데이터셋 빌더
- `prepare_data.py`, `sft_12hz.py` 실행 진입점

## 문서 허브

- 문서 시작점: [docs/cookbook/00-index.md](docs/cookbook/00-index.md)
- 설치 및 실행: [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)
- 백엔드 구조: [docs/cookbook/02-backend-guide.md](docs/cookbook/02-backend-guide.md)
- 프런트엔드 구조: [docs/cookbook/03-frontend-guide.md](docs/cookbook/03-frontend-guide.md)
- 업스트림 개요: [docs/cookbook/04-qwen3-tts-overview.md](docs/cookbook/04-qwen3-tts-overview.md)
- examples와 파인튜닝: [docs/cookbook/05-finetuning-and-examples.md](docs/cookbook/05-finetuning-and-examples.md)

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

## 빠른 시작

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
uv sync
cd app/frontend && npm install && cd ../..
cd app/backend && uv run --project ../.. uvicorn app.main:app --reload
```

다른 터미널에서:

```bash
cd app/frontend
npm run dev
```

상세 절차와 실모델 실행 방법은 [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)에 정리되어 있습니다.

## 기본 검증

백엔드 상태 확인:

```bash
curl http://127.0.0.1:8000/api/health
```

프런트엔드 프록시 확인:

```bash
curl http://127.0.0.1:5173/api/health
```

시뮬레이션 생성 확인:

```bash
curl -X POST http://127.0.0.1:8000/api/generate/custom-voice \
  -H 'Content-Type: application/json' \
  -d '{"text":"시뮬레이션 검증 문장입니다.","language":"Korean","speaker":"Sohee","instruct":"또렷하게"}'
```

## 주요 API

- `GET /api/health`
- `GET /api/models`
- `GET /api/speakers`
- `GET /api/history`
- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`
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
- `sox`는 현재 환경 기준 필수는 아니지만, 설치되지 않으면 업스트림 초기화 경고가 출력됩니다.
