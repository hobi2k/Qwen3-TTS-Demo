# S2-Pro Workspace

이 문서는 웹 UI의 `S2-Pro` 제품군을 설명합니다. S2-Pro는 Qwen 모델 선택 흐름에 끼워 넣지 않고, Fish Speech / Fish Audio 방식의 별도 작업실로 둡니다.

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
- 사용자가 직접 `[whisper in small voice]`, `[professional broadcast tone]`, `[pitch up]` 같은 자연어 태그를 Text에 입력할 수 있습니다.

현재 라이브러리 범주:

- `Emotion`
  - happy, sad, angry, excited, calm, nervous, confident, surprised, satisfied, delighted, scared, worried, upset, frustrated, depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed, grateful, curious, sarcastic, anxious, hysterical, indifferent, uncertain, doubtful, confused, disappointed, regretful, guilty, jealous, hopeful, pessimistic, nostalgic, lonely, determined, shocked 등
- `Vocal action`
  - laugh, chuckle, sigh, breath, inhale, exhale, gasp, sob, whisper, shout, scream, cough, clears throat, moaning, panting, yawning, tsk, singing, interrupting, audience laughter, pause, break 등
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
- Fish Speech local server에 등록된 `reference_id`
- 참조 음성 경로와 재생 URL
- 참조 텍스트
- 언어
- Qwen clone prompt로 브릿지한 경우 prompt id와 prompt path

S2-Pro 서버는 `/v1/references/add`로 reference voice를 저장하고, 앱은 `/api/s2-pro/voices`로 그 목록을 관리합니다.

## Qwen 브릿지

clone한 S2-Pro 목소리는 S2-Pro 안에서만 쓰지 않습니다.

UI 동작:

- `Qwen 복제로 보내기`
  - S2-Pro 저장 목소리의 참조 음성과 참조 텍스트를 Qwen `목소리 복제` 탭으로 전달합니다.
- `Qwen TTS로 보내기`
  - 참조 음성과 참조 텍스트를 Qwen `텍스트 음성 변환` 입력으로 전달합니다.
- `Qwen clone prompt도 함께 생성`
  - S2-Pro voice 저장 시 Base 모델로 clone prompt `.pkl`을 함께 만들어 Qwen 프리셋 기반 흐름에서도 쓸 수 있게 합니다.

이 브릿지는 “S2-Pro 모델을 Qwen 모델로 흉내 내는 것”이 아닙니다. 같은 참조 음성 자산을 두 런타임이 각자의 방식으로 읽도록 연결하는 것입니다.

## 백엔드 API

- `GET /api/s2-pro/capabilities`
  - Fish Speech 코드, S2-Pro 모델 파일, 로컬 서버/API 설정 상태를 확인합니다.
- `GET /api/s2-pro/voices`
  - 앱이 저장한 S2-Pro reference voice 목록을 반환합니다.
- `POST /api/s2-pro/voices`
  - 참조 음성을 로컬 Fish Speech `/v1/references/add` 또는 hosted Fish Audio `/model`에 등록하고 앱 레코드를 저장합니다.
- `POST /api/s2-pro/generate`
  - tagged TTS, voice clone, multi speaker, multilingual 생성 요청을 선택한 `/v1/tts` 런타임으로 전달하고 결과를 생성 갤러리에 저장합니다.

## 런타임 선택

S2-Pro는 두 가지 방식으로 실행할 수 있습니다.

- `Local Fish Speech`
  로컬 GPU에서 Fish Speech 서버를 띄우고 생성합니다. 기본값이며 API 키가 필요 없습니다.
- `Fish Audio API`
  hosted Fish Audio API를 사용합니다. API 키는 `.env`에만 저장하고 프런트에는 노출하지 않습니다.

UI의 `Runtime` 선택 값은 각 생성 요청과 voice clone 요청에 함께 전달됩니다. 저장 목소리 레코드도 어떤 런타임에서 만든 목소리인지 `runtime_source`로 기록합니다.

## 로컬 런타임 연결

로컬 모드는 Fish Speech 저장소와 `fishaudio/s2-pro` 모델을 로컬로 내려받고, 로컬 HTTP 서버에 요청합니다.

필수 파일:

- `vendor/fish-speech/tools/api_server.py`
- `data/models/fish-speech/s2-pro/codec.pth`
- `data/models/fish-speech/s2-pro/model-00001-of-00002.safetensors`
- `data/models/fish-speech/s2-pro/model-00002-of-00002.safetensors`
- `data/models/fish-speech/s2-pro/model.safetensors.index.json`
- `data/models/fish-speech/s2-pro/tokenizer.json`
- `data/models/fish-speech/s2-pro/tokenizer_config.json`
- `data/models/fish-speech/s2-pro/special_tokens_map.json`

설치 및 실행:

```bash
./scripts/setup_backend.sh
./scripts/download_models.sh s2pro
./scripts/serve_s2_pro.sh
```

`serve_s2_pro.sh`는 메인 `.venv`를 쓰지 않고 `.venv-fish-speech`를 별도로 만듭니다. Fish Speech 의존성과 Qwen/flash-attn 환경을 섞지 않기 위해서입니다. 다만 torch/CUDA 라인은 Qwen 쪽과 맞춰 기본적으로 `torch 2.11.0 + cu130`을 설치합니다.

환경변수:

```bash
FISH_SPEECH_REPO_ROOT=vendor/fish-speech
FISH_SPEECH_MODEL_DIR=data/models/fish-speech/s2-pro
FISH_SPEECH_MODEL=s2-pro
FISH_SPEECH_SERVER_URL=http://127.0.0.1:8080
FISH_SPEECH_TIMEOUT_SEC=180
FISH_SPEECH_TORCH_VERSION=2.11.0
FISH_SPEECH_TORCH_PROFILE=cu130
```

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

`S2_PRO_RUNTIME`을 비워 두면 기본은 로컬입니다. 이 경우에도 UI에서 `Runtime`을 `Fish Audio API`로 고르면 해당 요청만 API 경로를 사용합니다.

API 모드 동작:

- voice clone 저장은 Fish Audio `/model`에 private TTS model을 만들고 반환된 model id를 `reference_id`로 저장합니다.
- TTS 생성은 Fish Audio `/v1/tts`에 `model: s2-pro` 헤더와 함께 요청합니다.
- 참조 음성을 직접 넣는 one-shot clone은 msgpack body로 `references`를 전달합니다.

원칙:

- 로컬 모드는 hosted API 키를 요구하지 않습니다.
- API 모드는 `FISH_AUDIO_API_KEY`가 없으면 503을 반환합니다.
- 선택한 런타임이 준비되지 않았으면 503을 반환합니다.
- 준비되지 않은 상태에서 가짜 음성을 만들지 않습니다.
- Qwen 모델로 S2-Pro 결과를 흉내 내지 않습니다.
