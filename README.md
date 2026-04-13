# Qwen3-TTS-Demo

React + TypeScript 프런트엔드와 Python/FastAPI 백엔드로 만든 `Qwen3-TTS` 로컬 데모입니다.

이 프로젝트는 아래 흐름을 실제로 연결합니다.

- `CustomVoice` 빠른 품질 확인
- `VoiceDesign` 전용 실험 페이지
- `VoiceDesign -> Base clone prompt -> 고정 캐릭터 프리셋`
- 사용자 업로드 음성 -> `Base clone prompt -> 고정 캐릭터 프리셋`
- `Sound Effects`, `Voice Changer`, `Audio Converter`, `Audio Separation`, `Audio Translation` 작업실
- `Base` 단일 화자 파인튜닝용 데이터셋 빌더
- `CustomVoice` 전용 파인튜닝 실행 경로
- `Base clone prompt + CustomVoice instruct` 실험 경로
- `prepare_data.py`, `sft_12hz.py` 실행 진입점
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

`Training Lab`에서 새 데이터셋을 만들 때도 외부 파일 경로를 그대로 참조하지 않고,
선택한 음성 파일을 이 폴더 안 `audio/`로 복사한 뒤 JSONL을 생성하는 것을 표준으로 삼습니다.

## UI 구조

fish.audio 스타일을 참고해 좌측 제품 네비게이션과 작업실 중심 흐름으로 정리했습니다.

- `홈`: 전체 상태, 최근 작업, 빠른 시작 카드
- `나의 목소리들`: 프리셋, 최근 생성 음성, fine-tuned 체크포인트, 데이터셋 라이브러리
- `발견`: 템플릿, instruct 레시피, 각 제품 진입점
- `빠르게 들어보기`, `텍스트 음성 변환`, `목소리 복제`, `스토리 스튜디오`, `사운드 효과`, `오디오 분리`, `전사와 재합성`, `보이스 체인저`
- `Inference Lab`, `Training Lab`

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
- 프런트엔드에서는 다운로드된 전체 모델 중에서 기능별로 선택 가능
  - clone prompt용 참조 텍스트 자동 전사도 `data/models/whisper-large-v3`를 우선 사용

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
- `CustomVoice` instruction과 `VoiceDesign` 설명문은 영어를 기본 권장으로 사용합니다.
- `GET /api/health`에서 `runtime_mode=real`인지 먼저 확인한 뒤 실제 음성을 점검하는 흐름을 권장합니다.

시뮬레이션 생성 확인:

```bash
curl -X POST http://127.0.0.1:8000/api/generate/custom-voice \
  -H 'Content-Type: application/json' \
  -d '{"text":"시뮬레이션 검증 문장입니다.","language":"Korean","speaker":"Sohee","instruct":"또렷하게"}'
```

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
  `Training Lab -> 학습 모드 = Base Fine-Tune`
- 결과 체크포인트는 현재 WEB UI `Inference Lab`에서 직접 선택해 추론할 수 있습니다.

### 2. CustomVoice Fine-Tune

- 별도 경로로 분리된 `CustomVoice` 전용 엔트리
- 실행 스크립트:
  `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py`
- 핵심 차이:
  `CustomVoice` 체크포인트는 speaker encoder가 없어서, `Base` 체크포인트의 speaker encoder를 보조로 받아 새 화자를 추가합니다.
- WEB UI:
  `Training Lab -> 학습 모드 = CustomVoice Fine-Tune`
  여기서 `speaker_encoder_model_path`도 함께 선택합니다.

### 3. Clone Prompt + Instruct Hybrid

- 목표:
  `Base`의 clone prompt 음색과 `CustomVoice`의 instruct 제어를 한 번에 실험
- 별도 스크립트:
  `Qwen3-TTS/examples/test_model_12hz_custom_clone_instruct.py`
- WEB UI:
  `Inference Lab -> Style Preset + Instruct Hybrid`
- 입력:
  저장된 `스타일 프리셋`을 먼저 고르고, 필요하면 `Base 모델`, `ref_audio_path`, `ref_text`를 고급 입력으로 덮어쓴 뒤 `CustomVoice 모델`, `instruct`, `대사`, 고급 생성 파라미터를 조절합니다.

### 4. WEB UI에서 확인되는 것

- `Inference Lab`
  - stock 모델과 local fine-tuned 체크포인트 선택 추론
  - 기본 선택지는 `git clone` 직후에도 바로 동작하도록 stock 모델 기준으로 유지
  - fine-tuned 체크포인트는 기본값이 아니라 추가 선택지로 노출
  - `instruct`, `대사`, `language`, `seed`, `top_k`, `top_p`, `temperature`, `repetition_penalty`, `subtalker_*`, `max_new_tokens`, `extra_generate_kwargs`
  - `Base` 계열이면 `ref_audio_path`, `ref_text`, `voice_clone_prompt_path`, `x_vector_only_mode`
  - 별도 `Style Preset + Instruct Hybrid` 카드 제공
  - hybrid 기본값은 `Base 1.7B` + stock `CustomVoice 1.7B`, 저장된 프리셋이 있으면 그 프리셋을 먼저 불러오고 없으면 수동 입력으로 진행
- 상단 `Voice Studio` 대시보드
  - runtime, attention, preset/dataset/checkpoint 개수 즉시 확인
  - stock playground, preset hybrid, training pipeline으로 바로 점프
- recipe bars
  - `Quick Check`, `Design Lab`, `Style Preset + Instruct Hybrid`에 one-click prompt recipe 제공
  - 공격적인 감정 비교용 instruct pack을 바로 불러와 청취 검수 가능
- `Audio Suite`
  - `Sound Effects`: 텍스트 프롬프트에서 로컬 procedural 효과음 생성
  - `Voice Changer`: Applio/RVC 기반 audio-to-audio 음색 변환
  - `Audio Converter`: `wav`, `flac`, `ogg` 변환과 샘플레이트 조정
  - `Audio Separation`: lightweight HPSS 기반 `harmonic/percussive` stem 분리
  - `Audio Translation`: Whisper 전사 후 사용자가 확정한 번역문으로 재합성
  - 최근 작업은 각 작업실과 공용 이력에서 다시 확인 가능
- `Training Lab`
  - `Base Fine-Tune`
  - `CustomVoice Fine-Tune`
  - 실행 스크립트가 UI에서 명시적으로 보임

## 주의 사항

- 현재 파인튜닝 흐름은 upstream `Qwen3-TTS/finetuning/README.md` 기준의 `Base` 단일 화자 워크플로우에 맞춰져 있습니다.
- 시뮬레이션 모드에서는 실제 모델 대신 테스트용 오디오와 더미 학습 산출물을 만들어 전체 UX 흐름을 검증할 수 있습니다.
- 실제 파인튜닝 실행은 `qwen-tts`, `torch`, GPU, tokenizer/model 다운로드 상태에 따라 추가 설정이 필요합니다.
- `ffmpeg`는 Python `requirements.txt`에 넣는 항목이 아니라 시스템 바이너리입니다. Whisper 전사를 쓰려면 PATH에 설치되어 있어야 합니다.
- `sox`는 현재 환경 기준 필수는 아니지만, 설치되지 않으면 업스트림 초기화 경고가 출력됩니다.
- macOS / Apple Silicon에서는 `sdpa` fallback이 기본 경로입니다.
- Windows 또는 Ubuntu에서 CUDA가 감지되면 `flash-attn` 설치를 우선 시도하고, 가능할 때 `flash_attention_2`를 사용합니다.
- `보이스 체인저`는 별도의 RVC 모델 `.pth`와 `.index`가 필요합니다.
- `setup_backend.sh`가 `uv sync` 단계에서 실패한다면, 대개 네트워크 또는 DNS 문제입니다.
- Apple Silicon 환경에서는 `device=mps`, `attention=sdpa` 조합이 정상 동작 경로일 수 있습니다.
- 일부 생성 결과에서 시작 직후 아주 짧은 저레벨 웅얼거림처럼 들리는 앞머리 구간이 있을 수 있어, 백엔드에서는 생성 후 첫 `35ms` 범위 안에서만 보수적인 leading trim과 짧은 fade-in을 적용합니다.
- 이 보정이 실제로 적용됐는지는 생성 이력 JSON의 `meta.postprocess.leading_trim_samples`와 `meta.postprocess.fade_in_samples`에서 확인할 수 있습니다.
- 업스트림에는 `negative prompt` 개념이 별도로 노출되어 있지 않습니다.
- 대신 웹 UI의 `Advanced Controls`에서 `seed`, `do_sample`, `top_k`, `top_p`, `temperature`, `repetition_penalty`, `subtalker_*`, `max_new_tokens`, `non_streaming_mode`, `extra_generate_kwargs`를 직접 조절할 수 있습니다.
- 같은 프롬프트에서도 `seed`를 고정하지 않으면 샘플링 차이로 한숨, 숨소리, 어택 차이가 생길 수 있습니다.
