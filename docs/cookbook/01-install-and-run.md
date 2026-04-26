# Installation and Run Guide

이 문서는 현재 저장소 기준 실제 실행 순서를 정리합니다.

기준 흐름:

`setup -> download -> env 확인 -> frontend build -> backend 단독 서빙`

## 요구 사항

- Python `3.11+`
- Node.js `18+`
- `npm`
- 권장 시스템 패키지: `ffmpeg`, `sox`
- 실모델 다운로드가 가능한 네트워크

오디오 분리는 `audio-separator`를 사용합니다. 모델 파일은 최초 분리 실행 시
`data/stem-separator-models/` 아래로 자동 다운로드되며, 이 폴더는 git에 올리지 않습니다.

## 1. Clone

```bash
git clone <your-repo-url> Qwen3-TTS-Demo
cd Qwen3-TTS-Demo
```

## 2. 백엔드 준비

macOS / Linux:

```bash
./scripts/setup_backend.sh
```

Windows PowerShell:

```powershell
.\scripts\setup_backend.ps1
```

이 단계에서 하는 일:

- 루트 `.venv` 생성 또는 재사용
- `ensurepip`로 `pip` 복구
- `uv sync`
- `uv pip install hf_transfer certifi`
- `vendor/Applio`, `vendor/MMAudio`, `vendor/fish-speech` 준비
- `app/backend/.env` 생성
- 시스템 의존성 점검

가상환경 `pip`가 깨졌을 때 직접 복구하려면:

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip setuptools wheel
uv pip install hf_transfer certifi
```

## 3. 모델과 오디오 툴 자산 다운로드

macOS / Linux:

```bash
./scripts/download_models.sh
```

Windows PowerShell:

```powershell
.\scripts\download_models.ps1
```

기본 다운로드에는 아래가 포함됩니다.

- `Qwen3-TTS-Tokenizer-12Hz`
- `Qwen3-TTS-12Hz-0.6B/1.7B-Base`
- `Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice`
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `whisper-large-v3`
- Fish Speech S2-Pro:
  `data/models/fish-speech/s2-pro`
- 기본 RVC `.pth + .index`
- NSFW용 MMAudio 모델:
  `data/mmaudio/nsfw/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors`
- Stem Separator 모델:
  `data/stem-separator-models/vocals_mel_band_roformer.ckpt`

개인 Hugging Face mirror를 먼저 사용하려면:

```bash
export PRIVATE_ASSET_REPO_ID=<your-hf-username>/qwen3-tts-demo-assets
export PRIVATE_ASSET_REVISION=main
./scripts/download_models.sh
```

Qwen/Whisper 모델까지 개인 mirror에서 받으려면:

```bash
export QWEN_USE_PRIVATE_ASSET_REPO=1
./scripts/download_models.sh
```

업로드 준비와 repo layout은 [20-private-hf-assets.md](./20-private-hf-assets.md)를 기준으로 합니다.

가볍게만 준비하려면:

```bash
./scripts/download_models.sh core
```

S2-Pro만 준비하려면:

```bash
./scripts/download_models.sh s2pro
```

## 4. `.env` 확인

기본 템플릿은 [app/backend/.env.example](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/.env.example)입니다.

주요 변수:

- `QWEN_DEMO_SIMULATION`
- `QWEN_DEMO_DEVICE`
- `QWEN_DEMO_ATTN_IMPL`
- `QWEN_DEMO_CUSTOM_MODEL`
- `QWEN_DEMO_DESIGN_MODEL`
- `QWEN_DEMO_BASE_MODEL`
- `QWEN_DEMO_TOKENIZER_MODEL`
- `APPLIO_REPO_ROOT`
- `MMAUDIO_REPO_ROOT`
- `APPLIO_PYTHON_EXECUTABLE`
- `MMAUDIO_PYTHON_EXECUTABLE`
- `APPLIO_RVC_MODEL_URL`
- `APPLIO_RVC_INDEX_URL`
- `MMAUDIO_MODEL_URL`
- `MMAUDIO_CONFIG_URL`
- `MMAUDIO_NSFW_MODEL_URL`
- `MMAUDIO_NSFW_COMMAND_TEMPLATE`
- `FISH_SPEECH_REPO_ROOT`
- `FISH_SPEECH_MODEL_DIR`
- `FISH_SPEECH_SERVER_URL`
- `FISH_SPEECH_MODEL`

현재 기준 원칙:

- 절대경로를 기본값으로 쓰지 않습니다.
- `QWEN_DEMO_CUSTOM_MODEL`, `QWEN_DEMO_BASE_MODEL` 등을 비워 두면 `data/models/*`를 자동으로 찾습니다.
- 개발 머신마다 다른 경로를 `.env`에 박아두지 않는 쪽이 맞습니다.

## 4-1. S2-Pro 로컬 서버 실행

S2-Pro는 API 키가 아니라 로컬 Fish Speech 서버를 사용합니다.

```bash
./scripts/download_models.sh s2pro
./scripts/serve_s2_pro.sh
```

`serve_s2_pro.sh`는 `.venv-fish-speech`를 별도로 만들어 Fish Speech를 설치합니다. 메인 `.venv`에 Fish Speech를 직접 설치하면 Torch와 flash-attn 조합이 바뀔 수 있으므로 분리합니다.

기본 서버 주소:

```text
http://127.0.0.1:8080/v1/tts
```

웹 UI는 `/api/s2-pro/capabilities`에서 로컬 코드, 모델 파일, 서버 연결 상태를 확인하고 `/api/s2-pro/generate`로 생성 결과를 생성 갤러리에 저장합니다.

## 5. 프런트 빌드

기본 운영은 백엔드가 빌드된 프런트까지 함께 서빙하는 구조입니다.

```bash
cd app/frontend
npm install
npm run build
```

## 6. 백엔드 실행

macOS / Linux:

```bash
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

Windows PowerShell:

```powershell
cd app\backend
..\..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

접속 주소:

```text
http://127.0.0.1:8190/
```

## 7. 선택 사항: `next dev`

프런트 HMR이 필요할 때만 별도 개발 서버를 씁니다.

```bash
cd app/frontend
BACKEND_PORT=<BACKEND_PORT> npm run dev
```

이 경우 브라우저는 보통 `http://127.0.0.1:5173/`를 엽니다. `npm run dev`는 `NEXT_PUBLIC_API_BASE_URL`이 없으면 `BACKEND_PORT` 기준으로 API 주소를 잡습니다.

## 8. 기본 확인

백엔드 상태:

```bash
curl http://127.0.0.1:8190/api/health
```

특히 볼 값:

- `runtime_mode`
- `device`
- `attention_implementation`

프런트 엔트리 확인:

```bash
curl http://127.0.0.1:8190/
```

## 9. UI 기준 확인 포인트

- `텍스트 음성 변환`
  메인 TTS 화면으로 열리는지
- `목소리 복제`
  참조 음성에서 스타일 추출이 가능한지
- `목소리 설계`
  설명문으로 스타일을 만들 수 있는지
- `프리셋 기반 생성`
  저장 프리셋 반복 생성과 말투 지시 적용이 가능한지
- `생성 갤러리`
  생성 결과가 이 탭에만 모이고, 삭제 후 즉시 목록에서 사라지는지
- `데이터셋 만들기`
  dataset folder가 canonical 구조로 만들어지는지
- `학습 실행`
  준비된 dataset으로 Base / CustomVoice 학습을 시작할 수 있는지
- `사운드 효과`
  MMAudio 준비 여부가 보이는지
- `보이스 체인저`
  Applio + RVC 모델 자산이 준비되어 있는지
- `오디오 분리`
  독립 기능으로 동작하는지

## 10. 현재 운영 기준

- 메인 TTS는 `텍스트 음성 변환`입니다.
- 최근 생성 이력은 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.
- `목소리 복제`와 `목소리 설계`는 프리셋 생성용 탭입니다.
- `프리셋 기반 생성`은 저장 스타일의 반복 생성용 탭입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.

## 11. Base와 CustomVoice 이해하기

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

즉 `Base`가 참조 음성을 요구하는 이유는 UI 예외가 아니라 모델 역할 차이 때문입니다.

## 12. 샘플 수와 기대치

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  작은 실험용
- `20~50개`
  최소한의 화자 적응 기대 구간
- `50개 이상`
  음색 반영 안정성 개선 기대 구간

최근 기준으로는, 목소리 파인튜닝 권장 분량은 `10~30분`, 최소 실용선은 `5분 이상`으로 보는 것이 맞습니다.

기대치:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만 instruct 유지가 자동 보장되진 않음
- `CustomVoice Fine-Tune`
  음색 반영과 말투 지시 유지 후보 경로

## 13. 현재 검증된 MAI / VoiceBox 흐름

현재 MAI 한국어 기준 검증된 학습 입력은 아래입니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

검증된 산출물:

- plain CustomVoice:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- VoiceBox:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- VoiceBox 1 epoch 추가 학습:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`

1.7B full fine-tuning에서 RTX 5080 16GB 환경은 optimizer state 메모리 피크가 큽니다.
현재 검증된 full run은 아래 운영 변수를 사용했습니다.

```bash
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
QWEN_DEMO_OPTIMIZER=adafactor
QWEN_DEMO_LOG_EVERY=25
QWEN_DEMO_GRAD_ACCUM_STEPS=1
```

자세한 결과와 재현 명령은 [18-current-experiment-results.md](./18-current-experiment-results.md)를 봅니다.

다음 문서:

- [02-backend-guide.md](./02-backend-guide.md)
- [03-frontend-guide.md](./03-frontend-guide.md)
