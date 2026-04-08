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

macOS / Linux:

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
uv pip install hf_transfer
./scripts/setup_backend.sh
./scripts/download_models.sh
cd app/frontend && npm install && cd ../..
cd app/backend && source .venv311/bin/activate && uvicorn app.main:app --reload
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
.\.venv311\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

다른 터미널에서:

```bash
cd app/frontend
npm run dev
```

상세 절차와 실모델 실행 방법은 [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)에 정리되어 있습니다.

## 가상환경과 다운로드 준비

가상환경 안 `pip`가 없거나 깨진 경우에는 먼저 아래 명령을 실행합니다.

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
```

Hugging Face 다운로드 가속을 쓰려면 루트에서 아래 명령을 실행합니다.

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

- Python 가상환경 생성
- `fastapi`, `qwen-tts`, upstream editable install
- `sox` 설치 여부 경고
- 현재 머신의 device / attention 요약 출력
- `app/backend/.env` 템플릿 생성

### `setup_backend.ps1`

- Windows PowerShell용 백엔드 부트스트랩
- Python 가상환경 생성
- `fastapi`, `qwen-tts`, upstream editable install
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
- 가벼운 빠른 준비만 원하면 `core`
  - `Qwen3-TTS-Tokenizer-12Hz`
  - `Qwen3-TTS-12Hz-0.6B-CustomVoice`
  - `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
  - `Qwen3-TTS-12Hz-0.6B-Base`
- 프런트엔드에서는 다운로드된 전체 모델 중에서 기능별로 선택 가능

```bash
./scripts/download_models.sh core
```

PowerShell:

```powershell
.\scripts\download_models.ps1 core
```

모델은 `data/models/` 아래에 저장되고, `.env`에서는 그 로컬 경로를 읽어 사용합니다.

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
- `CustomVoice` instruction과 `VoiceDesign` 설명문은 영어를 기본 권장으로 사용합니다.
- `GET /api/health`에서 `runtime_mode=real`인지 먼저 확인한 뒤 실제 음성을 점검하는 흐름을 권장합니다.

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
- `flash_attention_2`는 설치되어 있을 때만 사용하고, 없으면 `sdpa`로 자동 fallback 합니다.
- Apple Silicon 환경에서는 `device=mps`, `attention=sdpa` 조합이 정상 동작 경로일 수 있습니다.
- 일부 생성 결과에서 시작 직후 아주 짧은 저레벨 웅얼거림처럼 들리는 앞머리 구간이 있을 수 있어, 백엔드에서는 생성 후 첫 `35ms` 범위 안에서만 보수적인 leading trim과 짧은 fade-in을 적용합니다.
- 이 보정이 실제로 적용됐는지는 생성 이력 JSON의 `meta.postprocess.leading_trim_samples`와 `meta.postprocess.fade_in_samples`에서 확인할 수 있습니다.
- 업스트림에는 `negative prompt` 개념이 별도로 노출되어 있지 않습니다.
- 대신 웹 UI의 `Advanced Controls`에서 `seed`, `do_sample`, `top_k`, `top_p`, `temperature`, `repetition_penalty`, `subtalker_*`, `max_new_tokens`, `non_streaming_mode`, `extra_generate_kwargs`를 직접 조절할 수 있습니다.
- 같은 프롬프트에서도 `seed`를 고정하지 않으면 샘플링 차이로 한숨, 숨소리, 어택 차이가 생길 수 있습니다.
