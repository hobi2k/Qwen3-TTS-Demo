# Backend Guide

이 문서는 현재 백엔드 구현을 기준으로 FastAPI 구조, 모델 선택 흐름, 저장 구조, 외부 오디오 툴 연동을 정리합니다.

## 역할 요약

백엔드는 아래 일을 담당합니다.

- `qwen_tts` 실제 모델 또는 시뮬레이션 모드로 음성 생성
- 생성 결과, clone prompt, 프리셋, 데이터셋, 파인튜닝 실행 기록 저장
- 업로드 음성과 생성 결과를 `/files`로 정적 제공
- 업스트림 `prepare_data.py`, `sft_12hz.py` 실행 래핑
- `Applio` 기반 voice changer 호출
- `MMAudio` 기반 sound effects 호출
- 기능별 모델 목록과 capability 상태 제공

## 핵심 파일

- [main.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/main.py)
- [qwen.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/qwen.py)
- [mmaudio.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/mmaudio.py)
- [voice_changer.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)
- [schemas.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/schemas.py)
- [storage.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/storage.py)
- [setup_backend.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/setup_backend.sh)
- [download_models.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/download_models.sh)

## 앱 시작 시점

[`main.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/main.py)에서는 아래를 초기화합니다.

- `.env` 로드
- `REPO_ROOT`, `UPSTREAM_QWEN_DIR` 계산
- `Storage(REPO_ROOT)` 생성
- `QwenDemoEngine(storage)` 생성
- `ApplioVoiceChanger(REPO_ROOT)` 생성
- `MMAudioSoundEffectEngine(REPO_ROOT)` 생성
- `/files` 정적 마운트

## 저장 구조

`data/` 아래를 저장소처럼 사용합니다.

- `data/uploads`: 업로드 원본 음성
- `data/generated`: 생성 오디오와 생성 이력 JSON
- `data/audio-tools`: 오디오 분리, 보이스 체인저, 효과음 실행 결과
- `data/clone-prompts`: clone prompt pickle + 메타데이터 JSON
- `data/presets`: 고정 캐릭터 프리셋
- `data/datasets`: raw/prepared JSONL과 canonical dataset record
- `data/finetune-runs`: 파인튜닝 실행 결과와 로그
- `data/models`: 다운로드한 로컬 모델 디렉터리
- `data/rvc-models`: Applio/RVC용 모델 자산
- `data/mmaudio`: MMAudio 체크포인트 자산

## TTS 엔진 계층

[`qwen.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/qwen.py)의 `QwenDemoEngine`은 실제 모델과 시뮬레이션을 함께 관리합니다.

핵심 포인트:

- `qwen_tts_available` 판별
- `simulation_mode` 자동 또는 환경변수 기반 제어
- `resolve_device()`로 `cuda:0`, `mps`, `cpu` 자동 선택
- `resolve_attention_implementation()`로 `flash_attention_2` 또는 `sdpa` 선택
- 모델별 캐시
- `generate_custom_voice`
- `generate_voice_design`
- `generate_voice_clone`

추가 메모:

- macOS / Apple Silicon에서는 `sdpa`를 기본으로 사용합니다.
- Windows 또는 Ubuntu에서 CUDA가 감지되면 `flash-attn` 설치를 우선 시도하고, 가능할 때 `flash_attention_2`를 사용합니다.
- `flash_attn`이 없거나 CPU-only 환경이면 `sdpa`를 사용합니다.
- 생성 후 저장 직전에 아주 짧은 앞머리 저에너지 구간만 정리하는 `_postprocess_generated_wav(...)`가 적용됩니다.
- 적용 결과는 생성 메타데이터의 `postprocess.leading_trim_samples`, `postprocess.fade_in_samples`에 기록됩니다.

## 오디오 툴 엔진 계층

### Applio Voice Changer

[`voice_changer.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)의 `ApplioVoiceChanger`는 `Applio`의 `core.py infer` 경로를 `subprocess`로 호출합니다.

현재 기준:

- 실제 Applio/RVC 실행 래퍼입니다.
- repo root는 `APPLIO_REPO_ROOT` 또는 기본 `vendor/Applio`를 사용합니다.
- Python 실행 파일은 `APPLIO_PYTHON_EXECUTABLE`로 override 가능합니다.
- 제품 UI는 직접 경로 입력보다, 서버가 찾은 RVC 모델 목록을 고르는 흐름을 우선합니다.

### MMAudio Sound Effects

[`mmaudio.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/mmaudio.py)의 `MMAudioSoundEffectEngine`은 외부 `MMAudio` 추론 스크립트를 실행합니다.

현재 기준:

- 간이 procedural fallback은 제거했습니다.
- `MMAudio` repo, infer script, 체크포인트가 준비되지 않으면 capability가 비활성으로 내려갑니다.
- repo root는 `MMAUDIO_REPO_ROOT` 또는 기본 `vendor/MMAudio`를 사용합니다.
- 실행 스크립트는 `MMAUDIO_INFER_SCRIPT`로 명시하는 방식을 권장합니다.
- 필요하면 `MMAUDIO_COMMAND_TEMPLATE`로 호출 템플릿을 완전히 override할 수 있습니다.

## 스키마 계층

[`schemas.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/schemas.py)에서 중요한 점:

- `ModelInfo`는 `category`, `recommended`를 포함합니다.
- `CustomVoiceRequest`, `VoiceDesignRequest`, `VoiceCloneRequest`는 `model_id`를 받습니다.
- 헬스 응답은 `runtime_mode`, `device`, `attention_implementation`를 포함합니다.
- bootstrap 응답은 프런트 초기 로딩에 필요한 묶음 상태를 한 번에 제공합니다.

## 모델 목록과 capability API

### `GET /api/models`

현재 다음 카테고리를 돌려줍니다.

- `custom_voice`
- `voice_design`
- `base_clone`
- `tokenizer`

다운로드된 로컬 모델이 있으면 그 경로를 우선 보여주고, 없으면 Hugging Face repo id를 보여줍니다.

### `GET /api/health`

특히 볼 값:

- `runtime_mode`
- `device`
- `attention_implementation`
- `qwen_tts_available`
- `recommended_instruction_language`

### 오디오 툴 capability

사운드 효과와 보이스 체인저는 “기능 있음”만 표시하는 게 아니라, 실제 백엔드 가용성을 반영합니다.

- `sound_effects`
  - `MMAudio` 준비 여부에 따라 `available`이 바뀝니다.
- `voice_changer`
  - `Applio` repo/root 점검 결과를 반영합니다.
- `audio_separation`
  - 백엔드 제공 여부를 반영합니다.

## 주요 요청 흐름

### 생성

- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`

각 요청은 선택된 `model_id`를 받을 수 있습니다.

### clone prompt / 프리셋

- `POST /api/clone-prompts/from-generated-sample`
- `POST /api/clone-prompts/from-upload`
- `POST /api/presets`
- `POST /api/presets/{preset_id}/generate`

`Base` 모델은 clone prompt 생성과 preset 저장에 함께 반영됩니다.

### 사운드 효과

- `POST /api/audio-tools/sound-effects`

입력 길이와 강도는 실제 MMAudio 요청 파라미터로 전달됩니다. `MMAudio`가 준비되지 않았으면 `503`으로 명확히 실패합니다.

### 보이스 체인저

- `POST /api/audio-tools/voice-changer`

현재 구현은 `Applio` 래퍼를 호출합니다.

### 오디오 분리

- `POST /api/audio-tools/separate`

독립 페이지에서 업로드 또는 서버 오디오 선택을 기준으로 사용합니다.

### 파인튜닝

- `POST /api/datasets`
- `POST /api/datasets/{dataset_id}/prepare-codes`
- `POST /api/finetune-runs`

현재 표준 dataset 저장 구조:

```text
data/datasets/<dataset_id>/
  audio/
  raw.jsonl
  train_raw.jsonl
  eval_raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json
```

중요한 규칙:

- dataset 자산은 다른 폴더와 섞지 않습니다.
- dataset 생성 시 외부 경로를 그대로 저장하지 않고 dataset 폴더 안으로 복사합니다.
- API는 `data/datasets/<dataset_id>/dataset.json`을 canonical record로 취급합니다.

## 부트스트랩 스크립트

### macOS / Linux

- [setup_backend.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/setup_backend.sh)
- [download_models.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/download_models.sh)

### Windows PowerShell

- [setup_backend.ps1](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/setup_backend.ps1)
- [download_models.ps1](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/download_models.ps1)

스크립트 기준 메모:

- `Applio`는 기본 공식 저장소 URL을 사용합니다.
- `MMAudio`는 기본 공식 저장소를 기준으로 준비하고, 필요하면 `MMAUDIO_MODEL_URL`, `MMAUDIO_CONFIG_URL`을 추가 지정합니다.
- `ffmpeg`, `sox`는 Python requirements가 아니라 시스템 의존성입니다.

## 현재 구현 기준 메모

- 백엔드는 “실행 전에 먼저 환경 준비와 모델 다운로드를 해야 하는 구조”를 기준으로 문서화합니다.
- `all` 모델 다운로드가 기본값입니다.
- 실모델 여부와 attention/device 상태는 `/api/health`로 먼저 확인하는 흐름을 권장합니다.
- 최근 생성 이력은 JSON record가 없는 `data/generated` 오디오도 보강해서 읽습니다.

다음 문서: [03-frontend-guide.md](./03-frontend-guide.md)
