# Installation and Run Guide

이 문서는 현재 저장소 기준 실제 실행 순서를 정리합니다.

기준 흐름:

`setup -> download -> env 확인 -> backend -> frontend`

## 요구 사항

- Python `3.11+`
- Node.js `18+`
- `npm`
- 권장 시스템 패키지: `ffmpeg`, `sox`
- 실모델 다운로드가 가능한 네트워크

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
- `vendor/Applio`, `vendor/MMAudio` 준비
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
- 기본 RVC `.pth + .index`

가볍게만 준비하려면:

```bash
./scripts/download_models.sh core
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

## 5. 백엔드 실행

macOS / Linux:

```bash
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --reload
```

Windows PowerShell:

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

## 7. 기본 확인

백엔드 상태:

```bash
curl http://127.0.0.1:8000/api/health
```

특히 볼 값:

- `runtime_mode`
- `device`
- `attention_implementation`

## 8. UI 기준 확인 포인트

- `텍스트 음성 변환`
  메인 TTS 화면으로 열리는지
- `목소리 복제`
  참조 음성에서 스타일 추출이 가능한지
- `목소리 설계`
  설명문으로 스타일을 만들 수 있는지
- `프리셋 기반 생성`
  저장 프리셋 반복 생성과 말투 지시 적용이 가능한지
- `스토리 스튜디오`
  긴 대본 생성 흐름인지
- `생성 갤러리`
  생성 결과가 이 탭에만 모이는지
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

## 9. 현재 운영 기준

- 메인 TTS는 `텍스트 음성 변환`입니다.
- 최근 생성 이력은 `생성 갤러리`에서만 관리합니다.
- `나의 목소리들`은 저장 프리셋과 최종 학습 모델만 보여줍니다.
- `목소리 복제`와 `목소리 설계`는 프리셋 생성용 탭입니다.
- `프리셋 기반 생성`은 저장 스타일의 반복 생성용 탭입니다.
- `스토리 스튜디오`는 장문 전용 작업실입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.

## 10. Base와 CustomVoice 이해하기

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

즉 `Base`가 참조 음성을 요구하는 이유는 UI 예외가 아니라 모델 역할 차이 때문입니다.

## 11. 샘플 수와 기대치

- `1~5개`
  파이프라인 점검용
- `10개 안팎`
  작은 실험용
- `20~50개`
  최소한의 화자 적응 기대 구간
- `50개 이상`
  음색 반영 안정성 개선 기대 구간

기대치:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만 instruct 유지가 자동 보장되진 않음
- `CustomVoice Fine-Tune`
  음색 반영과 말투 지시 유지 후보 경로

다음 문서:

- [02-backend-guide.md](./02-backend-guide.md)
- [03-frontend-guide.md](./03-frontend-guide.md)
