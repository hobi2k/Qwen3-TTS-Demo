# Qwen3-TTS-Demo

`Qwen3-TTS`, `Fish Speech S2-Pro`, `Applio`, `MMAudio`를 하나의 로컬 작업실로 묶은 음성 데모 애플리케이션입니다.

현재 구조는 “기능을 나열하는 데모”가 아니라, 사용자가 실제로 아래 작업을 구분해서 쓸 수 있는 제품형 흐름을 기준으로 정리되어 있습니다.

- `텍스트 음성 변환`
  메인 TTS 화면입니다. stock 모델, fine-tuned 모델, Base/CustomVoice 차이를 한 화면에서 다룹니다.
- `목소리 복제`
  참조 음성에서 clone prompt를 만들고 스타일 자산으로 저장합니다.
- `목소리 설계`
  설명문으로 새 목소리를 만들고 프리셋으로 저장합니다.
- `프리셋 기반 생성`
  저장한 프리셋을 기준으로 반복 생성하거나, 프리셋 위에 말투 지시를 덧입혀 생성합니다.
- `나의 목소리들`
  저장한 프리셋과 최종 학습 모델만 관리하는 화면입니다.
- `생성 갤러리`
  최근 생성 결과를 갤러리처럼 모아 보고, 선택 삭제/개별 삭제하는 화면입니다.
- `데이터셋 만들기`
  학습용 오디오와 텍스트를 정리해 `data/datasets/<dataset_id>/` 구조로 저장합니다.
- `학습 실행`
  준비된 데이터셋으로 `Base`, `CustomVoice`, `VoiceBox` 학습을 실행합니다.
- `VoiceBox 융합`
  CustomVoice 학습 결과와 Base speaker encoder를 합쳐 독립 모델을 만듭니다.
- `VoiceBox Clone`
  VoiceBox 하나만 사용해 참조 음성의 음색을 복제합니다.
- `Clone + Instruct`
  VoiceBox 하나만 사용해 참조 음성 복제와 말투 지시를 함께 적용합니다.
- `사운드 효과`
  `MMAudio` 기반 효과음 생성 화면입니다.
- `보이스 체인저`
  `Applio / RVC` 기반 audio-to-audio 변환 화면입니다.
- `오디오 분리`
  `audio-separator` 기반 Stem Separator로 보컬/반주 또는 다중 stem을 분리합니다. 기본 보컬 모델은 `vocals_mel_band_roformer.ckpt`입니다.
- `S2-Pro 태그 생성 / 목소리 복제 / 멀티 스피커 / 다국어 생성`
  Fish Speech S2-Pro 방식의 기능별 작업실입니다. clone한 목소리는 저장 목소리로 남아 S2-Pro에서 계속 쓰고, 같은 참조 자산을 Qwen 복제/TTS 흐름에도 넘길 수 있습니다.
- `가이드`
  앱이 지원하는 모든 탭과 사용 순서를 앱 안에서 바로 확인하는 문서형 화면입니다.

## 문서 허브

- 문서 시작점: [docs/cookbook/00-index.md](docs/cookbook/00-index.md)
- 설치 및 실행: [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)
- 백엔드 구조: [docs/cookbook/02-backend-guide.md](docs/cookbook/02-backend-guide.md)
- 프런트엔드 구조: [docs/cookbook/03-frontend-guide.md](docs/cookbook/03-frontend-guide.md)
- 업스트림 개요: [docs/cookbook/04-qwen3-tts-overview.md](docs/cookbook/04-qwen3-tts-overview.md)
- examples와 파인튜닝: [docs/cookbook/05-finetuning-and-examples.md](docs/cookbook/05-finetuning-and-examples.md)
- 프리셋 + instruct 원리: [docs/cookbook/12-preset-plus-instruct.md](docs/cookbook/12-preset-plus-instruct.md)
- CustomVoice 파인튜닝: [docs/cookbook/13-customvoice-finetuning.md](docs/cookbook/13-customvoice-finetuning.md)
- VoiceBox 문서 허브: [docs/voicebox/README.md](docs/voicebox/README.md)
- VoiceBox 체크포인트 변환: [docs/voicebox/01-checkpoint-conversion.md](docs/voicebox/01-checkpoint-conversion.md)
- VoiceBox 파인튜닝: [docs/voicebox/02-finetuning.md](docs/voicebox/02-finetuning.md)
- VoiceBox clone 실험: [docs/voicebox/03-clone-experiment.md](docs/voicebox/03-clone-experiment.md)
- VoiceBox clone + instruct 실험: [docs/voicebox/04-clone-plus-instruct.md](docs/voicebox/04-clone-plus-instruct.md)
- 현재 실험 결과: [docs/cookbook/18-current-experiment-results.md](docs/cookbook/18-current-experiment-results.md)
- 스크립트 진입점 정리: [docs/cookbook/19-script-entrypoints.md](docs/cookbook/19-script-entrypoints.md)
- 개인 Hugging Face 자산 mirror: [docs/cookbook/20-private-hf-assets.md](docs/cookbook/20-private-hf-assets.md)
- S2-Pro 작업실: [docs/cookbook/21-s2-pro-workspace.md](docs/cookbook/21-s2-pro-workspace.md)

VoiceBox 관련 스크립트는 이제 `Qwen3-TTS` 안에서 역할별로 분리합니다.

- 1단계 plain `CustomVoice` 학습:
  - [sft_custom_voice_12hz.py](Qwen3-TTS/finetuning/sft_custom_voice_12hz.py)
- 2단계 `CustomVoice -> VoiceBox` 변환:
  - [make_voicebox_checkpoint.py](Qwen3-TTS/fusion/make_voicebox_checkpoint.py)
- 3단계 `VoiceBox -> VoiceBox` 재학습:
  - [sft_voicebox_12hz.py](Qwen3-TTS/finetuning/sft_voicebox_12hz.py)
- VoiceBox 추론:
  - [clone_instruct.py](Qwen3-TTS/inference/voicebox/clone_instruct.py)

보조 경로:

- [sft_voicebox_bootstrap_12hz.py](Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py)
  - `CustomVoice + Base 1.7B`를 한 번에 묶는 보조 진입점

`voicebox/`와 `scripts/qwen3_tts_voicebox_*.py` 파일들은 예전 명령어를 깨지 않기 위한 호환 래퍼입니다.
새 훈련 로직은 `Qwen3-TTS/finetuning`, 변환 로직은 `Qwen3-TTS/fusion`, 추론 로직은 `Qwen3-TTS/inference` 쪽 canonical script에 먼저 반영합니다.

## 현재 프로젝트 구조

```text
Qwen3-TTS-Demo/
  Qwen3-TTS/                 # upstream reference repo
  vendor/
    Applio/                  # tracked source
    MMAudio/                 # tracked source
  app/
    backend/                 # FastAPI API server
    frontend/                # React + TypeScript + Vite
  data/
    models/                  # downloaded Qwen/Whisper models
    rvc-models/              # local RVC model assets, gitignored
    uploads/                 # uploaded source audio
    generated/               # generated audio + metadata
    audio-tools/             # sound effect / changer / separation metadata
    s2-pro-voices/           # saved Fish Speech reference voice records
    clone-prompts/           # saved clone prompt assets
    presets/                 # saved presets
    datasets/                # canonical dataset folders
    finetune-runs/           # final fine-tuned model outputs
  docs/
    cookbook/
    plan.md
  scripts/
```

## 핵심 구조 원칙

### 1. 데이터셋은 `data/datasets/<dataset_id>/` 안에 모읍니다

학습용 데이터는 흩어두지 않습니다.

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

이 원칙을 지키는 이유는 단순합니다.

- 삭제와 백업이 쉬워집니다.
- “이 데이터셋이 무엇으로 만들어졌는지”를 한 폴더에서 파악할 수 있습니다.
- 학습 재현과 유지보수가 쉬워집니다.

### 2. 최근 생성 결과는 `생성 갤러리`에서만 관리합니다

최근 생성 이력을 모든 탭에 반복 노출하지 않습니다.

- 생성 결과는 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.

### 3. 학습 결과는 중간 체크포인트가 아니라 “최종 선택 모델” 중심으로 보여줍니다

여러 epoch 체크포인트를 사용자가 모두 직접 고르는 방식은 유지하지 않습니다.

- run 내부에는 epoch 산출물이 남을 수 있습니다.
- UI에서는 각 학습 run의 대표 최종 모델만 다시 선택하도록 정리합니다.

### 4. 사이드바는 제품군 기준으로 나눕니다

현재 사이드바는 아래처럼 나눕니다.

- `홈`: 홈, 나의 목소리들, 생성 갤러리
- `Qwen`: Qwen3-TTS 기반 생성, 프리셋, 오디오 작업
- `S2-Pro`: Fish Speech S2-Pro 전용 작업실
- `Qwen 학습`: 데이터셋 만들기, 학습 실행, VoiceBox 융합
- `도움말`: 가이드

### 5. 기본 화면은 사용자 기준으로 설명합니다

`seed`, `top_k`, `top_p`, `temperature`, `subtalker` 같은 내부/연구용 파라미터는 기본 화면에 드러내지 않습니다.

- 기본 사용자는 “무엇을 입력하면 어떤 결과가 나오는지”부터 이해해야 합니다.
- 세부 샘플링 제어는 `고급 제어`에서만 다룹니다.

## VoiceBox 3단계 워크플로

`VoiceBox`는 한 번에 마법처럼 만들어지는 모델이 아니라, 아래 세 단계를 분리해서 보는 것이 가장 정확합니다.

1. plain `CustomVoice`에 새 화자(`mai`) 추가 학습
2. 그 결과에 `Base 1.7B`의 `speaker_encoder`를 합쳐 self-contained `VoiceBox`로 변환
3. 변환된 `VoiceBox`만으로 추가 학습

이 구조를 택한 이유:

- 1단계는 plain `CustomVoice` 품질과 직접 비교하기 쉽습니다.
- 2단계는 “speaker encoder를 포함하는 자립형 모델”로 승격하는 단계입니다.
- 3단계는 외부 `Base` 의존성 없이 `VoiceBox -> VoiceBox` 경로를 재현하기 위한 단계입니다.

상세 설명은 [docs/voicebox/02-finetuning.md](docs/voicebox/02-finetuning.md)에 있습니다.

현재 MAI 한국어 데이터셋 기준으로 아래 단계는 실제로 검증되었습니다.

- plain `CustomVoice` full fine-tuning:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- `CustomVoice -> VoiceBox` 변환:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`
- 추가 학습된 VoiceBox의 clone / clone + instruct 검증:
  `data/generated/voicebox-clone-tests/20260425-extra1`

상세 수치와 재현 명령은 [docs/cookbook/18-current-experiment-results.md](docs/cookbook/18-current-experiment-results.md)에 있습니다.

## 모델 역할을 사용자 기준으로 이해하기

### `CustomVoice`

바로 말하게 만들기 쉬운 모델입니다.

- speaker를 고를 수 있음
- 말투 지시를 직접 넣을 수 있음
- 일반적인 텍스트 음성 변환에 가장 적합함

### `Base`

먼저 “이 목소리 기준으로 말하라”는 신호가 필요한 모델입니다.

- 참조 음성
- clone prompt
- 저장된 프리셋

이 셋 중 하나가 먼저 필요합니다.

즉 `Base`가 참조 음성을 요구하는 이유는 UI가 이상해서가 아니라, 모델의 역할이 다르기 때문입니다.

### 왜 `프리셋 기반 생성`에 모델이 두 개 필요한가

이 화면은 단순 TTS가 아니라, “저장한 스타일”과 “새로운 말투 지시”를 동시에 다루는 기능입니다.

- `Base`
  프리셋의 기준 음색과 스타일 신호를 읽습니다.
- `CustomVoice`
  그 스타일을 유지한 채 새 대사와 `instruct`를 적용해 말합니다.

상세 설명은 [docs/cookbook/12-preset-plus-instruct.md](docs/cookbook/12-preset-plus-instruct.md)에 정리했습니다.

## S2-Pro 작업실

`S2-Pro` 탭은 Fish Speech / Fish Audio 쪽 사용 방식에 맞춰 태그 기반 음성 생성을 별도 제품군으로 분리한 화면입니다.

지원하는 작업 흐름:

- `Tagged TTS`: `[laugh]`, `[breath]`, `[professional broadcast tone]` 같은 자유형 인라인 태그를 대사 안에 넣어 생성
- `Voice Clone`: 생성 갤러리 또는 업로드된 참조 음성을 기준으로 복제 생성
- `Multi Speaker`: `<|speaker:0|>`, `<|speaker:1|>` 형태의 화자 태그로 대화 생성
- `Multilingual`: S2-Pro의 80개 이상 언어 지원 방향에 맞춘 다국어 생성

Hosted API 키는 쓰지 않습니다. `./scripts/download_models.sh s2pro`로 Fish Speech 코드와 `fishaudio/s2-pro` 모델을 로컬에 받고, `./scripts/serve_s2_pro.sh`로 로컬 `/v1/tts` 서버를 띄운 뒤 웹 UI에서 생성합니다. Fish Speech는 메인 Qwen `.venv`와 섞지 않고 별도 `.venv-fish-speech`에서 실행합니다.

## 빠른 시작

macOS / Linux:

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
./scripts/setup_backend.sh
./scripts/download_models.sh
cd app/frontend
npm install
npm run build
cd ../backend
source ../../.venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

Windows PowerShell:

```powershell
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
.\scripts\setup_backend.ps1
.\scripts\download_models.ps1
cd app\frontend
npm install
npm run build
cd ..\backend
..\..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

상세 절차는 [docs/cookbook/01-install-and-run.md](docs/cookbook/01-install-and-run.md)에 있습니다.

기본 접속 주소:

- `http://127.0.0.1:8190/`
- 같은 서버에서 `/api/*`와 빌드된 프런트를 함께 제공합니다.

프런트 개발 서버는 Next.js dev 서버입니다. 개발 중 HMR이 필요할 때만 별도로 사용합니다.

```bash
cd app/frontend
BACKEND_PORT=<BACKEND_PORT> npm run dev
```

## 백엔드 준비와 모델 다운로드

`setup_backend.sh` / `.ps1`가 하는 일:

- 루트 `.venv` 생성 또는 재사용
- `ensurepip` 복구
- `uv sync`
- `uv pip install hf_transfer certifi`
- `vendor/Applio`, `vendor/MMAudio` 준비
- `app/backend/.env` 생성
- `ffmpeg`, `sox` 점검

`download_models.sh` / `.ps1`가 하는 일:

- `Qwen3-TTS-Tokenizer-12Hz`
- `Qwen3-TTS-12Hz-0.6B/1.7B-Base`
- `Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `whisper-large-v3`
- 기본 RVC `.pth + .index` 자산
- `data/mmaudio/nsfw/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors`
- Stem Separator `vocals_mel_band_roformer.ckpt`

NSFW용 MMAudio는 일반 `MMAudio` 모델과 별개로 다룹니다.
다운로드 스크립트가 기본으로 받으며, 실제 추론에 연결하려면 `MMAUDIO_NSFW_COMMAND_TEMPLATE`가 필요합니다.

개인 Hugging Face repo에 자산을 모아 두려면 `PRIVATE_ASSET_REPO_ID`를 설정합니다.
업로드 준비 manifest는 [docs/manifests/private-hf-assets.json](docs/manifests/private-hf-assets.json)이며,
생성/업로드 스크립트는 [prepare_private_hf_assets.py](scripts/prepare_private_hf_assets.py)입니다.

## FlashAttention 2

Linux + CUDA 환경에서는 `FlashAttention 2`를 우선 사용합니다.

- Linux + CUDA: `flash_attention_2`
- macOS / CPU / 미지원 환경: `sdpa`

설치 경로와 GPU smoke test는 [docs/cookbook/08-flash-attn-install.md](docs/cookbook/08-flash-attn-install.md)에 정리되어 있습니다.

1.7B full fine-tuning에서 RTX 5080 16GB 기준 `AdamW` optimizer state가 메모리 피크를 크게 만들 수 있어,
현재 검증된 MAI full run은 `QWEN_DEMO_OPTIMIZER=adafactor`를 사용했습니다. 이 변경은 품질 향상 목적이 아니라
학습을 끝까지 안정적으로 완료하기 위한 운영 선택입니다.

## 현재 기준으로 꼭 알아둘 점

- `텍스트 음성 변환`이 메인 TTS 화면입니다.
- `목소리 복제`와 `목소리 설계`는 다른 작업입니다.
- `프리셋 기반 생성`은 저장된 스타일의 반복 생성용 화면입니다.
- `보이스 체인저`는 TTS 재합성이 아니라 `Applio / RVC` 기반 audio-to-audio 변환을 전제로 합니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.
- `app/backend/.env`는 절대경로를 기본값으로 쓰지 않습니다.
- 모델 경로는 비워 두면 `data/models/*`를 자동으로 찾습니다.
- 기본 운영은 `FastAPI`가 빌드된 프런트까지 함께 서빙하는 방식입니다.

## 남은 핵심 과제

- `보이스박스` 화면에서 실제 실행 버튼과 진행 상태를 더 촘촘히 연결하는 작업
- `MMAudio`와 `Applio/RVC` 운영 가이드를 더 다듬는 작업
- 프런트 시각 언어를 더 제품 수준으로 밀어 올리는 작업

남은 구조 과제는 [TODO.md](TODO.md), 현재 운영 기준과 마무리 단계는 [docs/plan.md](docs/plan.md)에 정리했습니다.
