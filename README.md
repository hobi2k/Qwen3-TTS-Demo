# Qwen3-TTS-Demo

`Qwen3-TTS`, `Fish Speech S2-Pro`, `Applio`, `MMAudio`, `ACE-Step`, `VibeVoice`를 하나의 로컬 작업실로 묶은 음성/음악 데모 애플리케이션입니다.

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
- `Qwen 데이터셋 만들기 / 학습 실행`
  Qwen 계열 학습용 오디오와 텍스트를 정리해 `data/datasets/<dataset_id>/` 구조로 저장한 뒤 `Base`, `CustomVoice`, `VoiceBox` 학습을 실행합니다.
- `VoiceBox 융합`
  CustomVoice 학습 결과와 Base speaker encoder를 합쳐 독립 모델을 만듭니다.
- `VoiceBox Clone`
  VoiceBox 하나만 사용해 참조 음성의 음색을 복제합니다.
- `Clone + Instruct`
  VoiceBox 하나만 사용해 참조 음성 복제와 말투 지시를 함께 적용합니다.
- `사운드 효과 / MMAudio 학습`
  `MMAudio` 기반 효과음 생성 화면과 upstream `train.py` 기반 full/continued training 화면입니다. MMAudio upstream에는 LoRA/adapter 학습 경로가 없어 학습 탭은 기존 weight 이어학습 또는 전체 학습만 다룹니다.
- `S2-Pro 텍스트 음성 변환 / 목소리 저장 / 대화 생성 / 다국어 TTS / 데이터셋 / LoRA-Full 학습`
  Fish Speech S2-Pro 방식의 기능별 작업실입니다. 저장한 목소리는 S2-Pro에서 계속 쓰고, 같은 참조 자산을 Qwen 복제/TTS 흐름에도 넘길 수 있습니다. 학습 탭은 Fish Speech `text2semantic_finetune`을 호출해 LoRA 또는 full fine-tuning을 실행하고, LoRA는 필요하면 merged checkpoint로 변환합니다.
- `Applio`
  `오디오 분리`, `RVC 데이터셋`, `RVC 모델 학습`, `단일 변환`, `배치 변환`, `모델 블렌딩`을 묶은 voice conversion 작업공간입니다. 업로드 파일과 생성 갤러리 음성을 모두 변환 입력으로 사용할 수 있습니다.
  오디오 분리는 `audio-separator` 기반 Stem Separator로 보컬/반주 또는 다중 stem을 분리합니다. 이 기능은 TTS나 목소리 저장에는 필요 없고, RVC용 보컬 추출/반주 제거가 필요할 때만 씁니다. 기본 보컬 모델은 설치된 `audio-separator 0.44.1`의 vocals 필터 상위권 Roformer 모델인 `vocals_mel_band_roformer.ckpt` 하나만 사용합니다.
- `MMAudio 데이터셋 / 사운드 효과 / MMAudio 학습`
  효과음 생성과 MMAudio upstream full/continued training을 분리합니다. 학습 전에는 `example_train` 검증용 모드와 Hydra config에 등록된 실제 데이터셋 모드를 먼저 선택합니다.
- `ACE-Step 작곡 / 데이터셋 / LoRA-LoKr 학습`
  ACE-Step-1.5 기반 음악 작곡실입니다. text2music / cover / repaint / extend(complete) / extract / lego / complete / understand / inspiration / format 모드를 전환할 수 있고, DiT 모델 변형(turbo/SFT/base/XL)과 LoRA 어댑터를 UI에서 직접 선택할 수 있습니다. 별도 데이터셋 탭에서는 tensor 폴더, 오디오 폴더, dataset JSON을 정리하고, `LoRA / LoKr 학습` 탭에서는 upstream `train.py`를 호출해 ACE-Step 어댑터를 만듭니다.
- `VibeVoice`
  Microsoft VibeVoice를 vendor wrapper 방식으로 다룹니다. `VibeVoice TTS`는 Realtime 0.5B, Long-form 1.5B, optional 7B를 선택해 생성하고, `VibeVoice ASR`은 파일/폴더/HF dataset 전사를 제공합니다. 데이터셋 탭에서 TTS/ASR JSONL 또는 폴더 구조를 먼저 지정하고, 학습은 `TTS Fine-tune`과 `ASR Fine-tune`으로 나뉘며, `Model Tools`에서 LoRA merge, merge 검증, NnScaler 변환을 실행합니다.
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
- ACE-Step 작곡: [docs/cookbook/22-ace-step-music.md](docs/cookbook/22-ace-step-music.md)
- VibeVoice 작업실: [docs/cookbook/23-vibevoice-workspace.md](docs/cookbook/23-vibevoice-workspace.md)
- Vendor upstream 변경점: [docs/cookbook/25-vendor-upstream-deltas.md](docs/cookbook/25-vendor-upstream-deltas.md)

## Clone 후 전체 준비

WSL/Linux 기준으로는 아래 한 명령이 백엔드 환경, 모델/툴 자산 다운로드, 프런트 의존성 설치와 빌드까지 순서대로 실행합니다.

```bash
./scripts/bootstrap_all.sh
```

가볍게 Qwen 핵심 모델만 준비하려면:

```bash
./scripts/bootstrap_all.sh core
```

S2-Pro만 준비하려면:

```bash
./scripts/bootstrap_all.sh s2pro
```

ACE-Step만 준비하려면:

```bash
./scripts/bootstrap_all.sh ace-step
```

사전 요구 사항은 `uv`, `Node.js 18+`, `npm`, `ffmpeg`, `sox`입니다. `ffmpeg`와 `sox`는 스크립트가 경고만 띄우며 자동 설치하지 않습니다.

VoiceBox와 CustomVoice 확장 스크립트는 이제 `qwen_extensions`를 기준으로 실행합니다.
기존에 `vendor/Qwen3-TTS` 안에 추가해 둔 커스텀 파일은 당장 삭제하지 않고 호환용 복사본으로 남겨 둡니다.
FastAPI 백엔드는 `QWEN_EXTENSIONS` 환경변수를 먼저 보고, 없으면 기본값 `qwen_extensions`를 사용합니다.

- Base speaker SFT:
  - [sft_base_12hz.py](qwen_extensions/finetuning/sft_base_12hz.py)
- 1단계 plain `CustomVoice` 학습:
  - [sft_custom_voice_12hz.py](qwen_extensions/finetuning/sft_custom_voice_12hz.py)
- 2단계 `CustomVoice -> VoiceBox` 변환:
  - [make_voicebox_checkpoint.py](qwen_extensions/fusion/make_voicebox_checkpoint.py)
- 3단계 `VoiceBox -> VoiceBox` 재학습:
  - [sft_voicebox_12hz.py](qwen_extensions/finetuning/sft_voicebox_12hz.py)
- VoiceBox 추론:
  - [clone_instruct.py](qwen_extensions/inference/voicebox/clone_instruct.py)

보조 경로:

- [sft_voicebox_bootstrap_12hz.py](qwen_extensions/finetuning/sft_voicebox_bootstrap_12hz.py)
  - `CustomVoice + Base 1.7B`를 한 번에 묶는 보조 진입점

예전 명령어 유지를 위한 최상위 `voicebox/` 폴더와 `scripts/qwen3_tts_voicebox_*.py` 계열 래퍼는 제거했습니다.
새 훈련 로직은 `qwen_extensions/finetuning`, 변환 로직은 `qwen_extensions/fusion`, 추론 로직은 `qwen_extensions/inference` 쪽 canonical script에 반영합니다.
`vendor/Qwen3-TTS` 내부 커스텀 복사본은 현재 단계에서만 유지하는 legacy mirror이며, 백엔드 실행 기준은 아닙니다.

학습 기능을 검증할 때는 풀 에포크를 기다리지 않고 먼저 실제 학습 스텝까지 내려오는지 확인합니다.

```bash
.venv/bin/python scripts/live_training_step_smoke.py
```

이 스크립트는 Base 1.7B, CustomVoice 1.7B, VoiceBox 1.7B를 한 번에 하나씩 시작하고 `Epoch 0 | Step 0 | Loss`가 찍히면 즉시 중단합니다. 임시 출력은 `data/training-smoke`에만 만들고, 확인 뒤 삭제합니다.

2026-05-02 기준으로 Base 1.7B, CustomVoice 1.7B, VoiceBox 1.7B 모두 실제 `Step 0`까지 진입했습니다. 같은 날 S2-Pro, VibeVoice, Applio/RVC, MMAudio, ACE-Step도 실제 training endpoint smoke를 순차 실행해 모두 통과했습니다. 프론트 production build, Python dependency check, backend compile, non-heavy live HTTP E2E, full heavy live E2E도 통과했습니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
./.venv/bin/python -m pip check
./.venv/bin/python -m compileall app/backend/app qwen_extensions scripts
cd app/frontend && npm run build
cd ../..
./.venv/bin/python scripts/live_e2e_verify.py --port 8199
./.venv/bin/python scripts/live_external_training_smoke.py --engines s2pro vibevoice applio mmaudio ace-step
```

`--include-heavy`는 Qwen, S2-Pro, Applio/RVC, Stem Separator, ACE-Step, VibeVoice, MMAudio를 실제로 순차 로드해 생성까지 확인합니다. 장시간 실행이므로 한 번에 하나의 검증만 돌리는 것을 원칙으로 합니다.

`live_external_training_smoke.py`는 외부 엔진의 생성이 아니라 훈련 루프를 확인합니다. 각 엔진을 동시에 띄우지 않고 S2-Pro -> VibeVoice -> Applio/RVC -> MMAudio -> ACE-Step 순서로 실행해 VRAM 피크와 WSL 충돌을 피합니다.

## 현재 프로젝트 구조

```text
Qwen3-TTS-Demo/
  vendor/Qwen3-TTS/                 # upstream reference repo
  qwen_extensions/           # demo-owned Qwen training/fusion/inference scripts
  vendor/
    Applio/                  # vendored (tracked in this repo)
    MMAudio/                 # vendored (tracked in this repo)
    fish-speech/             # vendored (tracked in this repo)
    ACE-Step/                # vendored (tracked in this repo)
    VibeVoice/               # vendored VibeVoice source, tracked in this repo
  app/
    backend/                 # FastAPI API server
    frontend/                # Next.js + TypeScript
  data/
    models/                  # downloaded Qwen/Qwen3-ASR/S2-Pro/VibeVoice/ACE-Step models, gitignored
    rvc-models/              # local RVC model assets, gitignored
    uploads/                 # uploaded source audio
    generated/               # generated audio + metadata
    audio-tools/             # sound effect / changer / separation metadata
    s2-pro-voices/           # saved Fish Speech reference voice records
    models/ace-step/         # ACE-Step checkpoint/cache, gitignored
    models/vibevoice/        # VibeVoice ASR/0.5B/1.5B weights, gitignored
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
- `나의 목소리들`은 S2-Pro 저장 목소리 프로젝트, 저장 프리셋, 최종 학습 모델만 보여줍니다.

### 3. 학습 결과는 중간 체크포인트가 아니라 “최종 선택 모델” 중심으로 보여줍니다

여러 epoch 체크포인트를 사용자가 모두 직접 고르는 방식은 유지하지 않습니다.

- run 내부에는 epoch 산출물이 남을 수 있습니다.
- UI에서는 각 학습 run의 대표 최종 모델만 다시 선택하도록 정리합니다.

### 4. 사이드바는 제품군 기준으로 나눕니다

현재 사이드바는 아래처럼 나눕니다.

- `홈`: 홈, 나의 목소리들, 생성 갤러리
- `Qwen`: Qwen3-TTS 기반 목소리 설계, 텍스트 음성 변환, 복제, 프리셋 기반 생성
- `S2-Pro`: Fish Speech S2-Pro 전용 작업실
- `MMAudio`: 사운드 효과 생성
- `Applio`: RVC 변환, Stem Separator 분리
- `Music`: ACE-Step 작곡
- `VibeVoice`: Microsoft VibeVoice TTS, ASR, ASR LoRA 학습
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

- `S2-Pro 텍스트 음성 변환`: 저장 목소리 또는 기본 S2-Pro voice로 대사를 생성하고, `[laugh]`, `[breath]`, `[professional broadcast tone]` 같은 인라인 표현 태그를 대사 안에 넣음
- `S2-Pro 목소리 저장`: 생성 갤러리 또는 업로드된 참조 음성을 reusable voice asset으로 저장
- `S2-Pro 대화 생성`: `<|speaker:0|>`, `<|speaker:1|>` 형태의 화자 태그로 대화 생성
- `S2-Pro 다국어 TTS`: S2-Pro의 80개 이상 언어 지원 방향에 맞춘 다국어 생성

기본은 `Local S2-Pro`입니다. Fish Speech 코드는 `vendor/fish-speech/`에 vendored 되어 있고, `./scripts/download_models.sh s2pro`로 `fishaudio/s2-pro` 모델 weight를 받은 뒤에는 웹 UI에서 생성/저장을 실행할 때 백엔드가 필요한 로컬 엔진 프로세스를 자동으로 실행합니다. 사용자가 별도 S2-Pro 서버를 먼저 켜는 구조가 아니라, `MMAudio`, `Applio`, `ACE-Step`처럼 백엔드 wrapper가 capability와 lifecycle을 관리하는 구조입니다.

필요하면 `FISH_AUDIO_API_KEY`를 `.env`에 넣고 S2-Pro 화면의 `Provider`를 `Fish Audio API`로 바꿔 hosted API도 사용할 수 있습니다. Fish Speech는 메인 Qwen `.venv`와 섞지 않고 별도 `.venv-fish-speech`에서 실행합니다.

S2-Pro 관련 핵심 `.env` 값:

```env
S2_PRO_RUNTIME=local
S2_PRO_AUTO_START=1
FISH_SPEECH_SERVER_URL=http://127.0.0.1:8080
FISH_SPEECH_MODEL=s2-pro
FISH_AUDIO_API_KEY=
```

상세 provider/환경변수/문제 해결은 [docs/cookbook/21-s2-pro-workspace.md](docs/cookbook/21-s2-pro-workspace.md)와 [app/backend/.env.example](app/backend/.env.example)에 정리했습니다.

## VibeVoice 작업실

`VIBEVOICE` 탭은 vendored VibeVoice source를 Qwen/S2-Pro와 같은 wrapper 방식으로 붙인 화면입니다. VibeVoice 코드는 `vendor/VibeVoice`에 저장소 일부로 포함되어 있어 별도 git clone을 하지 않고, ASR/realtime처럼 Hugging Face weight가 필요한 모델 파일만 다운로드합니다.

지원 모델:

- `microsoft/VibeVoice-ASR`: VibeVoice ASR 탭과 공통 ASR 모델 선택에서 사용
- `microsoft/VibeVoice-Realtime-0.5B`: VibeVoice TTS의 realtime 모델
- `vibevoice/VibeVoice-1.5B`: 장문 TTS 모델 weight. 다운로드와 UI 선택을 지원하며, 앱에 포함된 `scripts/run_vibevoice_tts_15b.py`와 vendored VibeVoice inference code로 기본 실행 경로를 제공합니다.
- `vibevoice/VibeVoice-7B`: community 쪽 7B 장문 TTS 모델입니다. Microsoft official model zoo에는 enabled download로 남아 있지 않아 별도 opt-in 모델로 취급합니다.

설치/다운로드:

```bash
./scripts/download_models.sh vibevoice
```

`all` 프로필에도 위 세 모델이 모두 포함됩니다. `vendor/VibeVoice`는 Applio/MMAudio처럼 저장소에 포함된 vendor source입니다. `.venv-vibevoice`와 `data/models/vibevoice/*`만 로컬 산출물이라 `.gitignore`에 들어갑니다. `download_models.sh`는 VibeVoice 코드를 clone하지 않고, 이미 존재하는 `vendor/VibeVoice`를 사용해 전용 venv와 모델 weight만 준비합니다.

7B 모델은 용량과 출처가 다르므로 기본 `all`에는 넣지 않고 아래처럼 따로 받습니다.

```bash
./scripts/download_models.sh vibevoice-7b
```

community repo에는 TTS fine-tuning 경로가 포함되어 있어 앱의 기본 학습 모드는 `TTS LoRA (community)`입니다. ASR LoRA는 선택한 checkout이 `finetuning-asr/lora_finetune.py`를 제공할 때만 실행합니다.

상세 환경 변수, 1.5B helper 옵션, ASR/학습 탭 기준은 [docs/cookbook/23-vibevoice-workspace.md](docs/cookbook/23-vibevoice-workspace.md)에 있습니다.

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

모델 전환 중 VRAM이 남아 있으면 다음 기능이 불안정해질 수 있습니다.
백엔드는 heavy engine 진입 전에 resident runtime을 정리합니다.

- Qwen / Qwen-ASR: FastAPI 프로세스 안의 모델 cache를 비웁니다.
- S2-Pro Local: 백엔드가 자동 시작한 Fish Speech 서버 프로세스를 중지할 수 있습니다.
- ACE-Step / MMAudio / VibeVoice / Applio: 기본적으로 요청마다 subprocess로 실행되며 종료 시 weight를 반납합니다.

운영 확인용 endpoint:

- `GET /api/runtime/status`
- `POST /api/runtime/unload?include_s2_pro=true`

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
- `vendor/Applio`, `vendor/MMAudio` 의 선택적 requirements 설치 (소스 자체는 이 레포에 vendored)
- `app/backend/.env` 생성
- `ffmpeg`, `sox` 점검

메인 `.venv`의 Gradio 라인은 `gradio>=5.50,<6`으로 고정합니다.
VibeVoice는 `gradio==5.50.0`, MMAudio는 `gradio<6`을 전제로 하므로 `gradio 6.x`와 함께 들어오는 `hf-gradio`는 설치하지 않습니다.
설치 후 `./.venv/bin/python -m pip check`가 `No broken requirements found.`를 출력해야 정상입니다.

`download_models.sh` / `.ps1`가 하는 일:

- `Qwen3-TTS-Tokenizer-12Hz`
- `Qwen3-TTS-12Hz-0.6B/1.7B-Base`
- `Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `Qwen3-ASR-1.7B`
- `Qwen3-ASR-0.6B`
- Fish Speech S2-Pro 로컬 모델
- Applio/RVC 데모 모델과 index
- Applio/RVC runtime asset: `contentvec` embedder, `rmvpe.pt`
- MMAudio 일반/NSFW 효과음 모델
- Stem separator 모델
- 전용 `.venv-ace-step`, ACE-Step-1.5 음악 생성 checkpoint (소스는 이 레포에 vendored)

ACE-Step은 메인 `.venv`와 의존성이 달라 별도 `.venv-ace-step`에 설치합니다.
스크립트는 `uv pip install --python .venv-ace-step/bin/python -e vendor/ACE-Step`를 우선 사용하고,
`HF_HUB_ENABLE_HF_TRANSFER=1`일 때 필요한 `hf_transfer`도 ACE-Step venv 안에 설치합니다.
ACE-Step subprocess의 Hugging Face / Transformers / matplotlib 캐시는 `data/cache/ace-step`에
저장되어 홈 디렉터리 캐시 권한 문제를 피합니다.
- 기본 RVC `.pth + .index` 자산
- `data/mmaudio/nsfw/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors`
- Stem Separator `vocals_mel_band_roformer.ckpt` (`오디오 분리` 탭용 기본 보컬 모델)

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

Fine-tuning subprocess는 기본적으로 백엔드를 실행 중인 같은 Python을 사용합니다. 다른 interpreter를 강제로 쓰고 싶을 때만
`QWEN_DEMO_PYTHON`을 설정합니다. Qwen prepare/fine-tune 작업은 `PYTHONPATH`에 `vendor/Qwen3-TTS`,
`vendor/Qwen3-TTS/finetuning`, `qwen_extensions`를 같이 넣어 실행하므로 fresh clone에서도 확장 스크립트가 같은 방식으로 동작합니다.

전체 live E2E는 생성/변환/분리 런타임을 실제로 실행합니다. 다만 fine-tuning endpoint는 장시간/파괴적 작업이므로 자동 E2E에 포함하지 않고,
Qwen CustomVoice/VoiceBox full run, VoiceBox fusion, VoiceBox 추가 학습 결과와 각 학습 엔트리포인트 정합성을 문서와 별도 로그로 추적합니다.

## 현재 기준으로 꼭 알아둘 점

- `텍스트 음성 변환`이 메인 TTS 화면입니다.
- `목소리 복제`와 `목소리 설계`는 다른 작업입니다.
- `프리셋 기반 생성`은 저장된 스타일의 반복 생성용 화면입니다.
- `Applio`는 TTS 재합성이 아니라 `Applio / RVC` 기반 audio-to-audio 변환을 전제로 합니다.
- `Applio 단일 변환`과 `Applio 배치 변환`은 새 업로드 파일과 생성 갤러리 음성을 모두 입력으로 받을 수 있습니다.
- `Applio 모델 블렌딩`은 이미 준비된 RVC `.pth` 모델 두 개를 섞어 새 변환 모델을 만듭니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.
- `app/backend/.env`는 절대경로를 기본값으로 쓰지 않습니다.
- 모델 경로는 비워 두면 `data/models/*`를 자동으로 찾습니다.
- 기본 운영은 `FastAPI`가 빌드된 프런트까지 함께 서빙하는 방식입니다.
- `vendor/*` 또는 upstream-adjacent patch를 수정하면 [Vendor upstream 변경점](docs/cookbook/25-vendor-upstream-deltas.md)에 파일, 이유, 재적용 조건, 검증 명령을 반드시 남깁니다.

## 남은 핵심 과제

- `MMAudio`와 `Applio/RVC` 운영 가이드를 더 다듬는 작업
- 프런트 시각 언어를 더 제품 수준으로 밀어 올리는 작업

남은 구조 과제는 [TODO.md](TODO.md), 현재 운영 기준과 마무리 단계는 [docs/plan.md](docs/plan.md)에 정리했습니다.
