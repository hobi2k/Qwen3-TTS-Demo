# Backend Guide

이 문서는 현재 백엔드 구현을 기준으로 FastAPI 구조, 모델 선택 흐름, 저장 구조를 정리합니다.

## 역할 요약

백엔드는 다음 일을 담당합니다.

- `qwen_tts` 실제 모델 또는 시뮬레이션 모드로 음성 생성
- 생성 결과, clone prompt, 프리셋, 데이터셋, 파인튜닝 실행 기록 저장
- 업로드 음성과 생성 결과를 `/files`로 정적 제공
- 업스트림 `prepare_data.py`, `sft_12hz.py` 실행 래핑
- 기능별 모델 목록 제공
- 요청마다 선택된 모델 id 또는 로컬 경로 사용

## 핵심 파일

- [main.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/main.py)
- [qwen.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/qwen.py)
- [schemas.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/schemas.py)
- [storage.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/storage.py)
- [requirements.txt](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/requirements.txt)
- [setup_backend.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/setup_backend.sh)
- [download_models.sh](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/scripts/download_models.sh)

## 앱 시작 시점

[`main.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/main.py)에서는 아래를 초기화합니다.

- `.env` 로드
- `REPO_ROOT`, `UPSTREAM_QWEN_DIR` 계산
- `Storage(REPO_ROOT)` 생성
- `QwenDemoEngine(storage)` 생성
- `/files` 정적 마운트

## 저장 구조

`data/` 아래를 저장소처럼 사용합니다.

- `data/uploads`: 업로드 원본 음성
- `data/generated`: 생성 오디오와 생성 이력 JSON
- `data/clone-prompts`: clone prompt pickle + 메타데이터 JSON
- `data/presets`: 고정 캐릭터 프리셋
- `data/datasets`: raw/prepared JSONL과 데이터셋 JSON
- `data/finetune-runs`: 파인튜닝 실행 결과와 로그
- `data/models`: 다운로드한 로컬 모델 디렉터리

## 엔진 계층

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

이제 생성 함수들은 모두 `model_id`를 인자로 받아서, 웹에서 선택된 모델을 그대로 사용할 수 있습니다.

추가 메모:

- macOS / Apple Silicon에서는 `sdpa`를 기본으로 사용합니다.
- Windows 또는 Ubuntu에서 CUDA가 감지되면 `flash-attn` 설치를 우선 시도하고, 가능할 때 `flash_attention_2`를 사용합니다.
- `flash_attn`이 없거나 CPU-only 환경이면 `sdpa`를 사용합니다.
- 생성 후 저장 직전에 아주 짧은 앞머리 저에너지 구간만 정리하는 `_postprocess_generated_wav(...)`가 적용됩니다.
- 이 후처리는 첫 `35ms` 범위만 검사하고, trim이 실제로 일어났을 때만 짧은 fade-in을 적용합니다.
- 적용 결과는 생성 메타데이터의 `postprocess.leading_trim_samples`, `postprocess.fade_in_samples`에 기록됩니다.

## 스키마 계층

[`schemas.py`](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/schemas.py)에서 중요한 변경점:

- `ModelInfo`는 `category`, `recommended`를 포함합니다.
- `CustomVoiceRequest`, `VoiceDesignRequest`, `VoiceCloneRequest`는 `model_id`를 받습니다.
- clone prompt 생성 요청도 `model_id`를 받습니다.
- 헬스 응답은 `runtime_mode`, `device`, `attention_implementation`까지 포함합니다.

## 모델 목록 API

`GET /api/models`는 현재 다음 카테고리를 돌려줍니다.

- `custom_voice`
- `voice_design`
- `base_clone`
- `tokenizer`

각 항목은 label, model id, 권장 여부를 포함합니다.

다운로드된 로컬 모델이 있으면 그 경로를 우선 보여주고, 없으면 Hugging Face repo id를 보여줍니다.

## 주요 요청 흐름

### 상태 확인

- `GET /api/health`
  - `runtime_mode`
  - `device`
  - `attention_implementation`
  - `qwen_tts_available`
  - `recommended_instruction_language`

### 생성 결과 점검

- 생성 오디오의 앞부분에 아주 짧은 웅얼거림이나 프리롤이 들리면, 먼저 생성 이력 JSON의 `meta.postprocess`를 확인합니다.
- `leading_trim_samples`가 `0`보다 크면 시작부 저레벨 구간을 trim한 것입니다.
- `fade_in_samples`는 trim 이후 첫 클릭음을 줄이기 위해 적용된 매우 짧은 페이드 길이입니다.
- 업스트림에는 `negative prompt` 입력이 별도 API로 노출되어 있지 않습니다.
- 대신 `seed`와 generation kwargs를 요청마다 전달할 수 있게 래핑했고, 이 값들은 `meta.seed`, `meta.generation_kwargs`에도 남습니다.

### 생성

- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`

각 요청은 선택된 `model_id`를 받을 수 있습니다.

### clone prompt

- `POST /api/clone-prompts/from-generated-sample`
- `POST /api/clone-prompts/from-upload`

이 경로도 선택된 `Base` 모델을 기준으로 prompt를 만듭니다.

### 프리셋

- `POST /api/presets`
- `POST /api/presets/{preset_id}/generate`

프리셋에는 `base_model`을 저장하므로, 나중에 다시 생성할 때도 같은 Base 계열로 재사용됩니다.

### 파인튜닝

- `POST /api/datasets`
- `POST /api/datasets/{dataset_id}/prepare-codes`
- `POST /api/finetune-runs`

`prepare-codes`는 tokenizer 경로를 받고, fine-tune run은 `init_model_path`를 받습니다.

현재 표준 dataset 저장 구조는 아래와 같습니다.

```text
data/datasets/<dataset_id>/
  audio/          # dataset 전용 복사본 음성 자산
  raw.jsonl
  train_raw.jsonl
  eval_raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json    # UI와 API가 읽는 canonical metadata
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

## 현재 구현 기준 메모

- 백엔드는 “실행 전에 먼저 환경 준비와 모델 다운로드를 해야 하는 구조”를 기준으로 문서화합니다.
- `all` 모델 다운로드가 기본값입니다.
- 실모델 여부와 attention/device 상태는 반드시 `/api/health`로 먼저 확인하는 흐름을 권장합니다.

다음 문서: [03-frontend-guide.md](./03-frontend-guide.md)
