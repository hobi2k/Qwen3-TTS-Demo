# Installation and Run Guide

이 문서는 `git clone`부터 루트 의존성 설치, 프런트엔드/백엔드 실행, 시뮬레이션 모드와 실모델 모드 전환, 기본 확인 명령까지 한 번에 정리합니다. 전체 문서 허브는 [00-index.md](./00-index.md)에서 시작합니다.

## 1. 요구 사항

- Python `3.11+`
- `uv`
- Node.js `18+`
- `npm`
- NVIDIA GPU를 실모델 모드에 쓸 경우 동작하는 드라이버와 CUDA 런타임
- 권장: `sox`

현재 저장소는 루트에서 `uv`, 프런트엔드에서 `npm`을 함께 사용합니다. `sox`는 현재 환경 기준으로 서버 기동의 필수 조건은 아니지만, 업스트림 `qwen-tts` 초기화 경고를 없애고 일부 오디오 처리 호환성을 높이기 위해 권장됩니다.

## 2. Clone

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
```

## 3. Python 의존성 설치

```bash
uv sync
```

이 단계에서 준비되는 것:

- FastAPI 백엔드 의존성
- 로컬 editable source로 연결된 [Qwen3-TTS](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS)
- `qwen-tts`, `torch`, `soundfile` 등 백엔드 런타임

## 4. Frontend 의존성 설치

```bash
cd app/frontend
npm install
cd ../..
```

## 5. 백엔드 실행

터미널 1:

```bash
cd app/backend
uv run --project ../.. uvicorn app.main:app --reload
```

기본값은 시뮬레이션 모드입니다.

- `QWEN_DEMO_SIMULATION=1`: 시뮬레이션 모드
- `QWEN_DEMO_SIMULATION=0`: 실모델 모드

실모델 모드 예시:

```bash
cd app/backend
export QWEN_DEMO_SIMULATION=0
export QWEN_DEMO_DEVICE=cuda:0
export HF_HOME="$PWD/../../models/huggingface"
uv run --project ../.. uvicorn app.main:app --host 127.0.0.1 --port 8000
```

관련 모델 환경 변수:

```bash
export QWEN_DEMO_CUSTOM_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
export QWEN_DEMO_DESIGN_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
export QWEN_DEMO_BASE_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base
```

## 6. 프런트엔드 실행

터미널 2:

```bash
cd app/frontend
npm run dev
```

기본 주소:

- 프런트엔드: `http://127.0.0.1:5173/`
- 백엔드: `http://127.0.0.1:8000/`

Vite 개발 서버는 `/api`, `/files`를 자동으로 백엔드로 프록시합니다.

## 7. 빌드 확인

프런트엔드 프로덕션 번들 확인:

```bash
cd app/frontend
npm run build
```

백엔드 파이썬 문법 확인:

```bash
python3 -m compileall app/backend/app
```

## 8. Smoke Test

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

## 9. 모델 캐시와 산출물 위치

권장 디렉터리:

- Hugging Face 캐시: `models/huggingface`
- 업스트림 또는 수동 다운로드 모델 폴더: `models/`
- 생성 오디오/업로드/프리셋/데이터셋: `data/`

루트 `.gitignore`는 `models/`와 런타임 산출물을 커밋 대상에서 제외합니다.

## 10. Troubleshooting

- `uv sync` 실패:
  `UV_CACHE_DIR=.uv-cache uv sync`처럼 작업 디렉터리 안 캐시를 지정하면 잠금 파일 문제를 피하기 쉽습니다.
- `npm run build` 실패:
  Node 버전과 `app/frontend/package.json`의 Vite 버전을 먼저 확인하세요.
- 실모델 다운로드가 오래 걸림:
  첫 실행에서 Hugging Face 모델이 `models/huggingface` 아래로 받아집니다. 네트워크 상태에 따라 오래 걸릴 수 있습니다.
- `torch.cuda.is_available()`가 `False`:
  샌드박스 밖이나 실제 터미널에서 다시 확인해야 합니다. 이 저장소 검증에서는 샌드박스 안에서는 `False`, 샌드박스 밖에서는 `True`가 확인되었습니다.
- `flash_attn` 미설치:
  현재 백엔드는 `flash_attn`이 없어도 `sdpa`로 자동 fallback 하도록 정리되어 있습니다. 성능 최적화가 필요할 때만 별도 설치를 검토하면 됩니다.
- `sox: command not found`:
  업스트림 패키지가 경고를 출력할 수 있습니다. 서버가 완전히 막히는 것은 아니지만, 시스템 패키지로 `sox` 설치를 권장합니다.

## 11. 다음 문서

- 문서 허브로 돌아가기: [00-index.md](./00-index.md)
- 백엔드 구조: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 구조: [03-frontend-guide.md](./03-frontend-guide.md)
- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
- examples와 파인튜닝: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
