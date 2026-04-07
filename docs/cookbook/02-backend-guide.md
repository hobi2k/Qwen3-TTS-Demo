# Backend Guide

문서 허브: [00-index](./00-index.md)

이 문서는 `Qwen3-TTS-Demo` 백엔드의 코드 구조와 요청 흐름을 설명한다. 프런트엔드 구조는 [03-frontend-guide](./03-frontend-guide.md)에서 이어서 볼 수 있다.

## 1. 역할 요약

백엔드는 FastAPI 기반의 로컬 API 서버다. 핵심 역할은 다음과 같다.

- 생성 요청을 받아 `qwen_tts` 실제 모델 또는 시뮬레이션 모드로 오디오를 만든다.
- 생성 결과, clone prompt, 프리셋, 데이터셋, 파인튜닝 실행 기록을 로컬 파일에 저장한다.
- 업로드된 참조 음성과 생성된 결과를 프런트엔드가 바로 재생할 수 있도록 정적 URL로 노출한다.
- 업스트림 `Qwen3-TTS/finetuning`의 `prepare_data.py`, `sft_12hz.py`를 감싼다.

## 2. 파일 구조

- [app/backend/app/main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- [app/backend/app/qwen.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py)
- [app/backend/app/schemas.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/schemas.py)
- [app/backend/app/storage.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/storage.py)

## 3. 진입점과 앱 설정

[`main.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py) 가 실제 API 진입점이다.

- `FastAPI(title="Qwen3-TTS Demo API")` 로 앱을 만들고 CORS 를 전체 허용한다.
- `StaticFiles(directory=storage.data_dir)` 를 `/files` 에 마운트해 `data/` 아래 파일을 바로 내려준다.
- `REPO_ROOT` 와 `UPSTREAM_QWEN_DIR` 를 계산해 로컬 저장소와 업스트림 finetuning 경로를 분리한다.
- `storage = Storage(REPO_ROOT)` 와 `engine = QwenDemoEngine(storage)` 로 저장소와 모델 엔진을 한 번만 생성한다.

## 4. 저장소 계층

[`storage.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/storage.py) 는 파일 시스템을 저장소처럼 다룬다.

- `data/uploads` 는 업로드 원본 음성 저장소다.
- `data/generated` 는 합성 결과 오디오와 생성 이력 JSON 저장소다.
- `data/clone-prompts` 는 clone prompt pickle 과 JSON 메타데이터 저장소다.
- `data/presets` 는 캐릭터 프리셋 저장소다.
- `data/datasets` 는 파인튜닝용 raw JSONL, prepared JSONL, 데이터셋 JSON 저장소다.
- `data/finetune-runs` 는 실행 결과와 로그 저장소다.

`Storage` 는 `new_id`, `relpath`, `write_json`, `list_json_records`, `get_record` 같은 공통 유틸을 제공해서 라우터 코드가 얇게 유지되도록 돕는다.

## 5. 엔진 계층

[`qwen.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py) 의 `QwenDemoEngine` 이 실제 모델과 시뮬레이션 모드를 모두 감싼다.

- `simulation_mode` 는 `QWEN_DEMO_SIMULATION` 으로 제어한다.
- `_bootstrap()` 은 `torch` 와 `qwen_tts` import 가능 여부를 판별한다.
- `_get_model()` 은 모델별 캐시를 두고 `from_pretrained()` 로 지연 로드한다.
- `generate_custom_voice`, `generate_voice_design`, `generate_voice_clone` 이 세 가지 생성 경로를 담당한다.
- `supported_speakers()` 는 프런트엔드 speaker 셀렉트 박스의 기본 데이터다.

시뮬레이션 경로에서는 `_fake_wave()` 로 결정적인 테스트용 WAV 를 만들고, 실제 경로에서는 `qwen_tts.Qwen3TTSModel` 을 호출한다.

## 6. 스키마 계층

[`schemas.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/schemas.py) 는 요청/응답 모델을 정의한다.

- 생성 입력은 `CustomVoiceRequest`, `VoiceDesignRequest`, `VoiceCloneRequest` 로 분리된다.
- 생성 결과는 `GenerationRecord` 와 `GenerationResponse` 로 감싼다.
- clone prompt 는 `ClonePromptCreateFromSampleRequest`, `ClonePromptCreateFromUploadRequest`, `ClonePromptRecord` 를 사용한다.
- 프리셋은 `CharacterPresetCreateRequest`, `CharacterPreset` 을 사용한다.
- 데이터셋과 파인튜닝은 `FineTuneDatasetCreateRequest`, `PrepareDatasetRequest`, `FineTuneRunCreateRequest`, `FineTuneDataset`, `FineTuneRun` 으로 분리된다.

## 7. 요청 흐름

### 7.1 상태 확인

- `GET /api/health` 는 simulation 여부, `qwen_tts` 가용성, `data_dir` 를 돌려준다.

### 7.2 모델/화자 조회

- `GET /api/models` 는 CustomVoice, VoiceDesign, Base clone 용 모델 메타데이터를 반환한다.
- `GET /api/speakers` 는 `QwenDemoEngine.supported_speakers()` 를 그대로 반환한다.

### 7.3 생성 이력

- `GET /api/history` 는 `data/generated/*.json` 을 최신순으로 반환한다.
- `POST /api/generate/custom-voice` 는 `QwenDemoEngine.generate_custom_voice()` 를 호출한다.
- `POST /api/generate/voice-design` 는 `QwenDemoEngine.generate_voice_design()` 를 호출한다.
- `POST /api/generate/voice-clone` 는 프리셋 또는 참조 음성/텍스트를 이용해 Base clone 경로를 실행한다.

### 7.4 clone prompt

- `POST /api/clone-prompts/from-generated-sample` 은 VoiceDesign 생성 이력에서 clone prompt 를 만든다.
- `POST /api/clone-prompts/from-upload` 는 업로드 참조 음성으로 clone prompt 를 만든다.

### 7.5 프리셋

- `GET /api/presets` 는 저장된 캐릭터 프리셋을 반환한다.
- `POST /api/presets` 는 새 프리셋을 저장한다.
- `POST /api/presets/{preset_id}/generate` 는 저장된 프리셋을 이용해 다시 생성한다.

### 7.6 데이터셋과 파인튜닝

- `POST /api/datasets` 는 `audio`, `text`, `ref_audio` 구조의 raw JSONL 을 만든다.
- `POST /api/datasets/{dataset_id}/prepare-codes` 는 `prepare_data.py` 를 실행하거나 시뮬레이션으로 `audio_codes` 를 채운다.
- `POST /api/finetune-runs` 는 `sft_12hz.py` 를 실행하거나 시뮬레이션 체크포인트를 만든다.

## 8. 핵심 구현 포인트

- `build_generation_record()` 는 모든 합성 결과를 동일한 저장 포맷으로 통일한다.
- `create_clone_prompt_file()` 은 시뮬레이션과 실모델 모두에서 같은 파일 위치를 쓴다.
- `create_clone_prompt_record()` 는 pickle 파일과 JSON 메타데이터를 같이 만든다.
- `write_dataset_jsonl()` 은 raw JSONL 을 한 곳에서 생성해 프런트엔드 입력과 업스트림 포맷을 맞춘다.
- `run_upstream_command()` 는 업스트림 경로 존재 여부를 먼저 확인한다.

## 9. 운영 메모

- 실모델 경로를 쓰려면 `qwen_tts`, `torch`, 관련 GPU 의존성이 필요하다.
- 시뮬레이션 모드는 UI 검증과 API 플로우 확인에 적합하다.
- 업로드된 음성과 생성된 결과는 `data/` 아래에 남으므로 `.gitignore` 에서 제외한다.

다음 문서: [03-frontend-guide](./03-frontend-guide.md)
