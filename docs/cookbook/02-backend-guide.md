# Backend Guide

이 문서는 현재 백엔드 구조를 기준으로 FastAPI API, 저장 구조, 모델 엔진, 오디오 툴 연동, 학습 래퍼를 설명합니다.

## 백엔드가 맡는 역할

- `Qwen3-TTS` 추론 래핑
- clone prompt / preset 저장
- dataset canonicalization
- Base / CustomVoice 학습 실행
- `Applio / RVC` voice changer 호출
- `MMAudio` sound effects 호출
- 생성 결과와 메타데이터 저장
- `/files` 정적 제공
- 빌드된 프런트 정적 파일 서빙

## 핵심 파일

- [main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- [qwen.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py)
- [voice_changer.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)
- [mmaudio.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/mmaudio.py)
- [schemas.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/schemas.py)
- [storage.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/storage.py)
- [qwen3_tts_upstream_train.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/scripts/qwen3_tts_upstream_train.py)
- [qwen3_tts_prepare_data.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/scripts/qwen3_tts_prepare_data.py)

## 앱 시작 시점

[`main.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)에서는 아래를 초기화합니다.

- `.env` 로드
- 저장 루트 계산
- `Storage(REPO_ROOT)` 생성
- `QwenDemoEngine(storage)` 생성
- `ApplioVoiceChanger(REPO_ROOT)` 생성
- `MMAudioSoundEffectEngine(REPO_ROOT)` 생성
- `/files` 정적 마운트
- `app/frontend/dist`가 있으면 프런트 SPA도 함께 서빙

## 저장 구조

`data/`는 사용자 자산과 실행 결과를 기능별로 나누어 저장합니다.

- `data/models`
  Qwen / Whisper 모델
- `data/rvc-models`
  RVC `.pth + .index` 자산
- `data/uploads`
  업로드 원본 음성
- `data/generated`
  생성 오디오와 메타데이터
- `data/audio-tools`
  사운드 효과 / 보이스 체인저 / 분리 메타데이터
- `data/clone-prompts`
  clone prompt 자산
- `data/presets`
  저장 프리셋
- `data/datasets`
  canonical dataset 폴더
- `data/finetune-runs`
  학습 run과 결과 모델

## 프런트 동시 서빙

현재 기준 기본 운영은 `FastAPI` 단독 서빙입니다.

- `/api/*`
  백엔드 API
- `/files/*`
  사용자 데이터 정적 파일
- `/assets/*`
  프런트 빌드 산출물
- `/`
  빌드된 `index.html`

즉 배포나 로컬 실사용에서는 `vite dev`가 필수가 아닙니다.

## 모델 엔진

[`qwen.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py)의 `QwenDemoEngine`은 현재 아래 역할을 합니다.

- `CustomVoice` 생성
- `VoiceDesign` 생성
- `Base` clone prompt 생성
- `Base` voice clone 생성
- `preset + instruct` hybrid 생성
- Whisper 전사

핵심 동작:

- `resolve_device()`
  `cuda`, `mps`, `cpu` 선택
- `resolve_attention_implementation()`
  Linux + CUDA에서는 `flash_attention_2`, 그 외 fallback은 `sdpa`
- 모델 캐시
- 출력 저장
- 생성 메타데이터 기록

## 오디오 툴 엔진

### 보이스 체인저

[`voice_changer.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)의 `ApplioVoiceChanger`가 담당합니다.

현재 기준:

- `Applio / RVC` audio-to-audio 경로
- `.pth + .index` 모델 쌍 필요
- repo root는 기본 `vendor/Applio`
- Python 실행 경로는 override 가능

중요:

- 이 기능은 “전사 후 다시 읽기”가 아닙니다.
- 실제 voice conversion 전용 기능입니다.

### 사운드 효과

[`mmaudio.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/mmaudio.py)의 `MMAudioSoundEffectEngine`이 담당합니다.

현재 기준:

- `MMAudio`가 준비되지 않으면 capability를 `available=false`로 내립니다.
- 가짜 procedural fallback은 현재 기준 경로에서 사용하지 않습니다.
- 일반 효과음은 기본 `MMAudio` 경로를 사용합니다.
- NSFW 효과음은 `data/mmaudio/nsfw/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors` 파일을 전용 모델로 봅니다.
- NSFW 모델은 기본 `MMAudio` demo entrypoint가 임의 safetensors를 직접 받지 않기 때문에 `MMAUDIO_NSFW_COMMAND_TEMPLATE`를 지정해야 실행됩니다.

### 오디오 분리

오디오 분리 API는 별도 작업 라우트로 유지합니다.

이 기능은 TTS와 분리된 오디오 툴로 취급합니다.

## 스키마 계층

[`schemas.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/schemas.py)에서는 아래를 중심으로 타입을 정리합니다.

- 모델 목록
- 생성 요청 / 응답
- preset / dataset / finetune run
- audio tool jobs
- 갤러리 삭제 요청 / 응답

중요한 점:

- 프런트 첫 로딩에 필요한 값은 `bootstrap` 응답에서 한 번에 묶어 줍니다.
- 사용자가 직접 이해할 필요 없는 내부 구현 필드는 UI로 최대한 직접 노출하지 않습니다.

## 주요 API 흐름

### 상태와 부트스트랩

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/models`

`bootstrap`은 프런트 첫 진입에 필요한 상태를 한 번에 내려줍니다.

실제 기본 접속은 보통:

- `http://127.0.0.1:8190/`
- `http://127.0.0.1:8190/api/health`

### 생성

- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`
- `POST /api/generate/hybrid-clone-instruct`
- `POST /api/voicebox/fusion`
- `POST /api/generate/voicebox-clone`
- `POST /api/generate/voicebox-clone-instruct`

### clone prompt / preset

- `POST /api/clone-prompts/from-upload`
- `POST /api/clone-prompts/from-generated-sample`
- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/{preset_id}/generate`

### 데이터셋 / 학습

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

- dataset은 다른 폴더와 섞지 않습니다.
- 외부 경로를 그대로 참조하기보다 canonical dataset 폴더로 정리합니다.
- `dataset.json`을 canonical record로 사용합니다.

### 갤러리

- `DELETE /api/history/{record_id}`
- `POST /api/history/delete-batch`
- `DELETE /api/history`

프런트에서는 현재 `개별 삭제`, `선택 삭제` 중심으로 사용합니다.

### 오디오 툴

- `POST /api/audio-tools/sound-effects`
- `POST /api/audio-tools/voice-changer`
- `POST /api/audio-tools/separate`
- `GET /api/audio-tools/capabilities`

## 모델 목록과 capability

### `/api/models`

현재 주요 카테고리:

- `custom_voice`
- `voice_design`
- `base_clone`
- `tokenizer`

다운로드된 로컬 모델이 있으면 로컬 경로를, 없으면 repo id를 기준으로 보여줍니다.

### `/api/health`

특히 보는 값:

- `runtime_mode`
- `device`
- `attention_implementation`
- `qwen_tts_available`

### `/api/audio-tools/capabilities`

실제 준비 상태를 반영합니다.

- `sound_effects`
  MMAudio 준비 여부
- `voice_changer`
  Applio + RVC 모델 자산 준비 여부
- `audio_separation`
  분리 기능 준비 여부

## 학습 래퍼 원칙

현재 프로젝트는 업스트림 existing script를 직접 바꾸기보다, wrapper script로 감싸는 방향을 기준으로 합니다.

- Base 학습
  upstream `sft_12hz.py` 래핑
- CustomVoice 학습
  별도 `sft_custom_voice_12hz.py` 엔트리 사용
- prepare
  메모리 조건에 맞춰 demo-side 준비 스크립트 사용 가능

즉:

- 기존 upstream 코드는 기준선
- 데모 확장 기능은 별도 스크립트 / 래퍼

## 운영 메모

- `vendor/Applio`, `vendor/MMAudio`는 서브모듈이 아니라 일반 tracked source입니다.
- `data/rvc-models`는 local/downloaded asset이며 git에는 올리지 않습니다.
- `data/generated`와 `data/audio-tools`는 사용자 결과물 영역입니다.
- 최근 생성 이력은 프런트에서 `생성 갤러리` 한 탭으로 모읍니다.

다음 문서:

- [03-frontend-guide.md](./03-frontend-guide.md)
- [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
