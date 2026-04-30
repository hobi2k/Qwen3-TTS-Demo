# S2-Pro Workspace

이 문서는 웹 UI의 `S2-Pro` 제품군을 설명합니다. S2-Pro는 Qwen 모델 선택 흐름에 끼워 넣지 않고, Fish Speech / Fish Audio 방식의 별도 작업실로 둡니다.

현재 기준에서 가장 중요한 운영 원칙은 아래입니다.

- S2-Pro는 사용자가 별도 서버를 직접 관리하는 기능이 아닙니다.
- 기본값은 `Local S2-Pro`입니다.
- 로컬 provider를 선택하면 FastAPI 백엔드가 S2-Pro 엔진 준비 상태를 확인하고, 필요할 때 `scripts/serve_s2_pro.sh`를 자동으로 실행합니다.
- 이 구조는 `MMAudio`, `Applio`, `ACE-Step`과 같은 방향입니다. 프런트는 “외부 서버 켜짐/꺼짐”을 다루지 않고, 백엔드가 관리하는 오디오 엔진 capability를 보고 기능을 노출합니다.
- hosted API를 쓸 때만 `.env`에 `FISH_AUDIO_API_KEY`를 넣고 UI에서 `Fish Audio API` provider를 고릅니다.

참고 기준:

- Fish Audio web app: https://fish.audio/ko/app/
- Fish Speech repository: https://github.com/fishaudio/fish-speech
- Fish Speech docs: https://speech.fish.audio/
- Fish Audio emotion docs: https://docs.fish.audio/developer-guide/core-features/emotions

## 탭 구조

S2-Pro는 하나의 페이지 안에 모든 기능을 밀어 넣지 않습니다. 사이드바에서 기능별로 직접 들어갑니다.

- `S2-Pro 텍스트 음성 변환`
  - 저장 목소리 또는 기본 S2-Pro voice로 대사를 생성합니다.
  - bracket tag는 태그 자체를 생성하는 기능이 아니라, 대사 안에 넣는 표현 제어 도구입니다.
- `S2-Pro 목소리 저장`
  - 참조 음성을 Fish Speech reference voice로 저장하고 계속 재사용합니다.
- `S2-Pro 대화 생성`
  - 저장 목소리와 `<|speaker:i|>` 태그를 사용해 대화형 음성을 만듭니다.
- `S2-Pro 다국어 TTS`
  - 저장 목소리를 유지한 채 여러 언어 문장을 생성합니다.

## 태그 정책

S2-Pro는 “정해진 버튼 몇 개”만 쓰는 모델이 아닙니다. Fish Speech 모델 설명은 S2-Pro가 15,000개 이상의 unique tag와 자연어 bracket tag를 지원한다고 설명합니다.

따라서 UI는 두 가지를 모두 지원합니다.

- 공식 문서와 모델 설명에 등장한 기준 태그를 검색 가능한 라이브러리로 제공합니다.
- 사용자가 직접 `[low voice]`, `[professional broadcast tone]`, `[pitch up]` 같은 자연어 태그를 Text에 입력할 수 있습니다.

현재 라이브러리 범주:

- `Emotion`
  - happy, sad, angry, excited, calm, nervous, confident, surprised, satisfied, delighted, scared, worried, upset, frustrated, depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed, grateful, curious, sarcastic, anxious, hysterical, indifferent, uncertain, doubtful, confused, disappointed, regretful, guilty, jealous, hopeful, pessimistic, nostalgic, lonely, determined, shocked 등
- `Vocal action`
  - laugh, chuckle, sigh, breath, inhale, exhale, gasp, sob, low voice, shout, scream, cough, clears throat, moaning, panting, yawning, tsk, singing, interrupting, audience laughter, pause, break 등
- `Performance`
  - professional broadcast tone, news anchor, narration, storytelling, documentary, radio host, ASMR, soft spoken, dramatic, villain, heroine, late night, in a hurry tone, volume up/down, pitch up, echo 등
- `Language cue`
  - Korean, English, Japanese, Chinese, Cantonese, American English, Seoul dialect 등

## 저장 목소리

Fish Audio 앱처럼 voice clone 결과는 일회성 생성으로 끝나면 안 됩니다. 현재 앱은 S2-Pro clone을 다음 구조로 저장합니다.

```text
data/s2-pro-voices/
  voices/
    YYYY-MM-DD/
      HHMMSS_<voice-name>__s2voice_xxxxx.json
```

레코드에는 다음 값이 들어갑니다.

- 사용자가 입력한 목소리 이름
- 선택한 provider에 등록된 `reference_id`
- 참조 음성 경로와 재생 URL
- 참조 텍스트
- 언어
- provider/source 정보
- Qwen clone prompt로 브릿지한 경우 prompt id와 prompt path

로컬 provider에서는 백엔드가 관리하는 Fish Speech 호환 엔진의 `/v1/references/add`에 reference voice를 등록합니다. API provider에서는 Fish Audio `/model`에 private TTS model을 만들고 반환된 model id를 reference id로 저장합니다. 앱 레코드는 provider와 관계없이 `data/s2-pro-voices/` 아래에 저장되고, `/api/s2-pro/voices`로 목록을 관리합니다.

웹 UI의 `나의 목소리들`에서는 S2-Pro 저장 목소리를 “목소리 프로젝트”로 보여줍니다.
각 프로젝트는 아래 자산을 한 줄에서 확인하고 다음 작업으로 넘길 수 있어야 합니다.

- 참조 음성
- 참조 텍스트
- 연결된 S2-Pro 생성 결과 수
- 연결된 Qwen clone prompt / 프리셋 여부
- Qwen 복제, S2-Pro TTS, 데이터셋 구성으로 보내는 액션

## Qwen 브릿지

clone한 S2-Pro 목소리는 S2-Pro 안에서만 쓰지 않습니다.

UI 동작:

- `Qwen 복제로 보내기`
  - S2-Pro 저장 목소리의 참조 음성과 참조 텍스트를 Qwen `목소리 복제` 탭으로 전달합니다.
- `Qwen TTS로 보내기`
  - 참조 음성과 참조 텍스트를 Qwen `텍스트 음성 변환` 입력으로 전달합니다.
- `Qwen clone prompt도 함께 생성`
  - S2-Pro voice 저장 시 Base 모델로 clone prompt `.pkl`을 함께 만들어 Qwen 프리셋 기반 흐름에서도 쓸 수 있게 합니다.

이 브릿지는 “S2-Pro 모델을 Qwen 모델로 흉내 내는 것”이 아닙니다. 같은 참조 음성 자산을 S2-Pro provider와 Qwen 런타임이 각자의 방식으로 읽도록 연결하는 것입니다.

## 백엔드 API

- `GET /api/s2-pro/capabilities`
  - S2-Pro 엔진 capability를 반환합니다.
  - 로컬 provider에서는 Fish Speech source, S2-Pro 모델 파일, 백엔드 시작 프로세스 설정, health 상태를 봅니다.
  - API provider에서는 `FISH_AUDIO_API_KEY` 구성 여부와 API endpoint 설정을 봅니다.
- `GET /api/s2-pro/voices`
  - 앱이 저장한 S2-Pro reference voice 목록을 반환합니다.
- `POST /api/s2-pro/voices`
  - 참조 음성을 선택 provider에 등록하고 앱 레코드를 저장합니다.
  - 로컬 provider라면 백엔드가 먼저 Local S2-Pro 엔진을 확인/자동 시작한 뒤 `/v1/references/add`에 등록합니다.
  - API provider라면 Fish Audio `/model`에 등록합니다.
- `POST /api/s2-pro/generate`
  - tagged TTS, voice clone, multi speaker, multilingual 생성 요청을 선택 provider의 `/v1/tts`로 전달하고 결과를 생성 갤러리에 저장합니다.
  - 로컬 provider가 아직 준비되지 않았다면 백엔드가 같은 요청 안에서 Local S2-Pro 엔진을 시작하고 readiness timeout 안에 준비될 때까지 기다립니다.

## Provider 선택

S2-Pro는 두 가지 방식으로 실행할 수 있습니다.

- `Local S2-Pro`
  로컬 GPU에서 백엔드가 관리하는 S2-Pro 엔진으로 생성합니다. 기본값이며 API 키가 필요 없습니다. 웹 UI에서 생성/저장을 실행하면 백엔드가 필요한 로컬 엔진 프로세스를 자동으로 준비합니다.
- `Fish Audio API`
  hosted Fish Audio API를 사용합니다. API 키는 `.env`에만 저장하고 프런트에는 노출하지 않습니다.

UI의 `Provider` 선택 값은 각 생성 요청과 voice clone 요청에 함께 전달됩니다. 저장 목소리 레코드도 어떤 provider에서 만든 목소리인지 `runtime_source`로 기록합니다.

권장 운영:

- 일반 로컬 작업: `.env`에서 `S2_PRO_RUNTIME=local`, UI provider는 `Local S2-Pro`.
- API 전용 작업: `.env`에서 `S2_PRO_RUNTIME=api`, `FISH_AUDIO_API_KEY=...`.
- 요청별 전환: `.env` 기본값은 `local`로 두고, 특정 폼에서만 `Fish Audio API` provider를 선택합니다.
- 로컬 자동 시작을 끄고 직접 endpoint를 관리하고 싶을 때만 `S2_PRO_AUTO_START=0`을 둡니다.

## Local S2-Pro

로컬 모드는 Fish Speech 저장소와 `fishaudio/s2-pro` 모델을 로컬로 내려받고, 백엔드가 관리하는 로컬 S2-Pro 엔진으로 실행합니다.

내부적으로는 Fish Speech 호환 HTTP 프로세스를 사용합니다. 다만 사용자는 이 프로세스를 별도 제품처럼 다루지 않습니다. 백엔드의 `S2ProEngine` wrapper가 readiness를 확인하고, `ensure_local_s2_pro_server()`가 필요한 순간에 `scripts/serve_s2_pro.sh`를 lazy start합니다. 이 점이 MMAudio/Applio/ACE-Step과 맞춘 부분입니다.

수동 실행은 디버깅용입니다. 예를 들어 Fish Speech 로그를 실시간으로 보고 싶거나, 백엔드 시작 전에 S2-Pro endpoint를 미리 데워 두고 싶을 때만 아래 스크립트를 직접 실행합니다.

필수 파일:

- `vendor/fish-speech/tools/api_server.py`
- `data/models/fish-speech/s2-pro/codec.pth`
- `data/models/fish-speech/s2-pro/model-00001-of-00002.safetensors`
- `data/models/fish-speech/s2-pro/model-00002-of-00002.safetensors`
- `data/models/fish-speech/s2-pro/model.safetensors.index.json`
- `data/models/fish-speech/s2-pro/tokenizer.json`

## S2-Pro 학습

`S2-Pro LoRA / Full 학습` 탭은 Fish Speech upstream의 `fish_speech/train.py --config-name text2semantic_finetune`을 실행합니다.

- `LoRA`: `+lora@model.model.lora_config=r_8_alpha_16` 또는 `r_32_alpha_16_fast`를 붙여 text2semantic LoRA를 학습합니다. 옵션을 켜면 학습 후 `tools/llama/merge_lora.py`로 일반 checkpoint로 변환합니다.
- `Full`: LoRA config를 주입하지 않고 `text2semantic_finetune.yaml`의 LLAMA/text2semantic 모델을 full fine-tuning합니다.
- `Protobuf dataset`: 이미 `tools/llama/build_dataset.py`로 만든 `data/protos` 같은 폴더를 바로 씁니다.
- `Audio + .lab folder`: `.wav/.mp3/.flac`와 같은 이름의 `.lab` 파일이 있는 폴더를 받아 `tools/vqgan/extract_vq.py`와 `tools/llama/build_dataset.py`를 먼저 실행합니다.

실행 로그는 `data/audio-tools/s2_pro_training/<run-id>/train.log`에 저장됩니다. LoRA merge 결과는 기본적으로 `data/models/fish-speech/<run-name>__<run-id>` 아래에 만들어집니다.
- `data/models/fish-speech/s2-pro/tokenizer_config.json`
- `data/models/fish-speech/s2-pro/special_tokens_map.json`

설치:

```bash
./scripts/setup_backend.sh
./scripts/download_models.sh s2pro
```

그 다음에는 FastAPI 백엔드만 실행하면 됩니다. 사용자가 S2-Pro 생성 또는 목소리 저장을 누르면 백엔드가 Local S2-Pro 엔진을 자동으로 시작합니다.

```bash
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

디버깅을 위해 로컬 S2-Pro 엔진만 수동 실행하려면:

```bash
./scripts/serve_s2_pro.sh
```

`serve_s2_pro.sh`는 메인 `.venv`를 쓰지 않고 `.venv-fish-speech`를 별도로 만듭니다. Fish Speech 의존성과 Qwen/flash-attn 환경을 섞지 않기 위해서입니다. 다만 torch/CUDA 라인은 Qwen 쪽과 맞춰 기본적으로 `torch 2.11.0 + cu130`을 설치합니다.

환경변수:

```env
S2_PRO_RUNTIME=local
S2_PRO_AUTO_START=1
S2_PRO_START_TIMEOUT_SEC=120
FISH_SPEECH_REPO_ROOT=vendor/fish-speech
FISH_SPEECH_MODEL_DIR=data/models/fish-speech/s2-pro
FISH_SPEECH_MODEL=s2-pro
FISH_SPEECH_SERVER_URL=http://127.0.0.1:8080
FISH_SPEECH_TIMEOUT_SEC=180
FISH_SPEECH_HOST=127.0.0.1
FISH_SPEECH_PORT=8080
FISH_SPEECH_HALF=1
FISH_SPEECH_COMPILE=0
FISH_SPEECH_WORKERS=1
FISH_SPEECH_DECODER_CONFIG=modded_dac_vq
FISH_SPEECH_TORCH_VERSION=2.11.0
FISH_SPEECH_TORCH_PROFILE=cu130
```

각 변수 의미:

- `S2_PRO_RUNTIME`
  UI가 `auto`를 보낼 때 사용할 기본 provider입니다. `local` 또는 `api`.
- `S2_PRO_AUTO_START`
  `1`이면 백엔드가 로컬 엔진을 자동 시작합니다. `0`이면 사용자가 endpoint를 직접 켜야 합니다.
- `S2_PRO_START_TIMEOUT_SEC`
  자동 시작 후 `/v1/health`가 준비될 때까지 기다리는 시간입니다.
- `FISH_SPEECH_SERVER_URL`
  백엔드가 호출할 로컬 Fish Speech 호환 endpoint입니다. 기본은 `http://127.0.0.1:8080`.
- `FISH_SPEECH_HOST`, `FISH_SPEECH_PORT`
  백엔드가 로컬 엔진 프로세스를 시작할 때 `serve_s2_pro.sh`에 넘기는 listen 주소입니다.
- `FISH_SPEECH_MODEL_DIR`
  `fishaudio/s2-pro` 모델 파일 위치입니다.
- `FISH_SPEECH_VENV`, `FISH_SPEECH_PYTHON`
  Fish Speech 전용 가상환경 위치와 생성에 사용할 Python을 바꿀 때 사용합니다.
- `FISH_SPEECH_TORCH_VERSION`, `FISH_SPEECH_TORCH_PROFILE`
  Fish Speech 전용 venv에 설치할 torch 계열을 고릅니다.

Fish Speech 원본 `pyproject.toml`은 `torch==2.8.0`을 고정합니다. 이 프로젝트는 `scripts/install_fish_speech_runtime.py`로 다음 순서로 설치해 cu130 환경을 유지합니다.

1. `torch==2.11.0+cu130`, `torchaudio==2.11.0+cu130`을 먼저 설치합니다.
2. Fish Speech의 일반 의존성을 설치하되 `torch`, `torchaudio`, `torchvision` pin은 제외합니다.
3. Fish Speech 패키지는 `uv pip install --no-deps -e vendor/fish-speech`로 설치합니다.

다른 CUDA wheel을 쓰려면 `FISH_SPEECH_TORCH_PROFILE`을 `cu129`, `cu128`, `cpu`, `current`로 바꿉니다. `current`는 이미 설치된 torch를 유지해야 할 때만 사용합니다.

## Fish Audio API 연결

Hosted API를 쓰려면 백엔드 `.env`에 다음 값을 넣습니다.

```env
S2_PRO_RUNTIME=api
FISH_AUDIO_API_KEY=...
FISH_AUDIO_API_URL=https://api.fish.audio
FISH_AUDIO_MODEL=s2-pro
FISH_AUDIO_TIMEOUT_SEC=180
```

`S2_PRO_RUNTIME=api`는 기본 provider를 API로 바꾸는 설정입니다. 기본값을 로컬로 두고 요청별로만 API를 쓰려면 `S2_PRO_RUNTIME=local`로 두거나 비워 두고, UI에서 해당 폼의 `Provider`만 `Fish Audio API`로 선택합니다.

API 모드 동작:

- voice clone 저장은 Fish Audio `/model`에 private TTS model을 만들고 반환된 model id를 `reference_id`로 저장합니다.
- TTS 생성은 Fish Audio `/v1/tts`에 `model: s2-pro` 헤더와 함께 요청합니다.
- 참조 음성을 직접 넣는 one-shot clone은 msgpack body로 `references`를 전달합니다.

원칙:

- 로컬 모드는 hosted API 키를 요구하지 않습니다.
- API 모드는 `FISH_AUDIO_API_KEY`가 없으면 503을 반환합니다.
- 선택한 provider가 준비되지 않았으면 503을 반환합니다.
- 준비되지 않은 상태에서 가짜 음성을 만들지 않습니다.
- Qwen 모델로 S2-Pro 결과를 흉내 내지 않습니다.

## 문제 해결

`Local S2-Pro`가 준비되지 않는 경우 확인 순서:

1. `./scripts/download_models.sh s2pro`를 실행했는지 확인합니다.
2. `vendor/fish-speech/tools/api_server.py`가 있는지 확인합니다.
3. `data/models/fish-speech/s2-pro/codec.pth`와 safetensors 파일들이 있는지 확인합니다.
4. 백엔드 로그와 `data/runtime/fish-speech-s2-pro.log`를 확인합니다.
5. 포트 충돌이 있으면 `FISH_SPEECH_SERVER_URL`, `FISH_SPEECH_HOST`, `FISH_SPEECH_PORT`를 같은 포트로 맞춰 바꿉니다.
6. 자동 시작을 꺼둔 경우 `S2_PRO_AUTO_START=1`로 되돌리거나 `./scripts/serve_s2_pro.sh`를 직접 실행합니다.

`Fish Audio API`가 503을 반환하는 경우:

1. `FISH_AUDIO_API_KEY`가 백엔드 `.env`에 있는지 확인합니다.
2. 백엔드를 재시작해 `.env`가 다시 로드되게 합니다.
3. UI provider가 `Fish Audio API`인지 확인합니다.
4. `FISH_AUDIO_API_URL`을 기본값 `https://api.fish.audio`로 되돌려 봅니다.
