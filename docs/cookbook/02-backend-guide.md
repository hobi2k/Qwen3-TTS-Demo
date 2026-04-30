# Backend Guide

이 문서는 현재 백엔드 구조를 기준으로 FastAPI API, 저장 구조, 모델 엔진, 오디오 툴 연동, 학습 래퍼를 설명합니다.

## 백엔드가 맡는 역할

- `Qwen3-TTS` 추론 래핑
- clone prompt / preset 저장
- dataset canonicalization
- Base / CustomVoice 학습 실행
- `Applio / RVC` voice changer 호출
- `MMAudio` sound effects 호출
- `ACE-Step` music composition 호출
- `VibeVoice` ASR/TTS/fine-tuning 호출
- 생성 결과와 메타데이터 저장
- `/files` 정적 제공
- 빌드된 프런트 정적 파일 서빙

## 핵심 파일

- [main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- [qwen.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py)
- [voice_changer.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)
- [mmaudio.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/mmaudio.py)
- [ace_step.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/ace_step.py)
- [vibevoice.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/vibevoice.py)
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
- `AceStepComposer(REPO_ROOT)` 생성
- `VibeVoiceEngine(REPO_ROOT)` 생성
- `/files` 정적 마운트
- `app/frontend/dist`가 있으면 프런트 SPA도 함께 서빙

## 저장 구조

`data/`는 사용자 자산과 실행 결과를 기능별로 나누어 저장합니다.

- `data/models`
  Qwen / Qwen3-ASR 모델
- `data/rvc-models`
  RVC `.pth + .index` 자산
- `data/uploads`
  업로드 원본 음성
- `data/generated`
  생성 오디오와 메타데이터
- `data/audio-tools`
  사운드 효과 / Applio 변환 / 분리 메타데이터
- `data/clone-prompts`
  clone prompt 자산
- `data/presets`
  저장 프리셋
- `data/datasets`
  canonical dataset 폴더
- `data/finetune-runs`
  학습 run과 결과 모델
- `data/models/ace-step`
  ACE-Step checkpoint/cache
- `data/models/vibevoice`
  VibeVoice ASR, Realtime 0.5B, 1.5B model snapshots

## 프런트 동시 서빙

현재 기준 기본 운영은 `FastAPI` 단독 서빙입니다.

- `/api/*`
  백엔드 API
- `/files/*`
  사용자 데이터 정적 파일
- `/_next/*`
  Next.js static export 산출물
- `/assets/*`
  이전 빌드 산출물 호환 fallback
- `/`
  빌드된 `index.html`

즉 배포나 로컬 실사용에서는 `next dev`가 필수가 아닙니다.

## 모델 엔진

[`qwen.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/qwen.py)의 `QwenDemoEngine`은 현재 아래 역할을 합니다.

- `CustomVoice` 생성
- `VoiceDesign` 생성
- `Base` clone prompt 생성
- `Base` voice clone 생성
- `preset + instruct` hybrid 생성
- Qwen3-ASR 전사

핵심 동작:

- `resolve_device()`
  `cuda`, `mps`, `cpu` 선택
- `resolve_attention_implementation()`
  Linux + CUDA에서는 `flash_attention_2`, 그 외 fallback은 `sdpa`
- 모델 캐시
- 출력 저장
- 생성 메타데이터 기록

## 오디오 툴 엔진

### Applio / RVC

[`voice_changer.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/voice_changer.py)의 `ApplioVoiceChanger`가 담당합니다.

현재 기준:

- `Applio / RVC` audio-to-audio 경로
- `.pth + .index` 모델 쌍 필요
- repo root는 기본 `vendor/Applio`
- Python 실행 경로는 override 가능
- `POST /api/audio-tools/voice-changer`는 단일 음성 변환
- `POST /api/audio-tools/voice-changer/batch`는 여러 음성을 같은 RVC 설정으로 변환
- `POST /api/audio-tools/voice-models/train`은 Applio RVC 학습 실행
- `POST /api/audio-tools/voice-models/blend`는 두 RVC 모델을 섞어 새 `.pth` 모델 생성

중요:

- 이 기능은 “전사 후 다시 읽기”가 아닙니다.
- 실제 voice conversion 전용 기능입니다.
- 단일 변환과 배치 변환 모두 업로드된 파일 경로와 생성 갤러리 파일 경로를 입력으로 받을 수 있습니다.

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

현재 구현은 librosa HPSS가 아니라 `audio-separator` 기반 Stem Separator입니다.
이 엔진은 `오디오 분리` API에서만 사용합니다. Qwen/S2-Pro 음성 생성, 목소리 저장, Qwen3-ASR 전사와는 독립입니다.

기본값:

- 패키지: `audio-separator>=0.44.1,<0.45.0`
- 기본 보컬 분리 모델: `vocals_mel_band_roformer.ckpt`
  설치된 `audio-separator 0.44.1`에서 vocals 필터 상위권에 있는 Roformer 모델입니다. 상위 후보 여러 개를 모두 설치하거나 ensemble하지 않고, 기본 워크플로우에서는 이 모델 하나만 씁니다.
- RVC용 보컬 추출 프리셋: `vocal_rvc`
- 다중 stem 옵션: `htdemucs_ft.yaml`
- 모델 캐시: `data/stem-separator-models/`
- 최소 입력 길이: 10초

이 기능은 TTS와 분리된 오디오 툴로 취급합니다. 결과는 보컬, 반주, 드럼, 베이스 같은 stem asset으로 저장되고 생성 갤러리/작업 이력에서 다시 쓸 수 있습니다.

### ACE-Step 작곡

[`ace_step.py`](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/ace_step.py)의 `AceStepComposer`가 담당합니다.

현재 기준:

- `POST /api/music/ace-step/generate`가 곡 생성 요청을 받습니다.
- FastAPI 프로세스가 직접 ACE-Step 모델을 import하지 않습니다.
- `scripts/run_ace_step_generate.py`를 별도 Python 프로세스로 실행합니다.
- 기본 ACE-Step 저장소는 `vendor/ACE-Step`입니다.
- 기본 Python은 `.venv-ace-step/bin/python`입니다.
- 기본 checkpoint/cache는 `data/models/ace-step`입니다.
- 생성 결과는 `data/generated/ace-step-music/`에 저장되고, `GenerationRecord`로 생성 갤러리에 연결됩니다.

이 분리는 의존성 충돌과 서버 멈춤을 줄이기 위한 것입니다.

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

### `/api/s2-pro/*`

S2-Pro는 Qwen 런타임이 아니라 Fish Speech / Fish Audio 계열 provider를 사용합니다. 기본은 `Local S2-Pro`이고, 선택적으로 hosted Fish Audio API도 사용할 수 있습니다.

로컬 provider는 내부적으로 Fish Speech 호환 HTTP 프로세스를 사용하지만, 사용자가 별도 서버를 직접 관리하는 구조가 아닙니다. 백엔드의 `S2ProEngine` wrapper가 `MMAudio`, `Applio`, `ACE-Step` wrapper처럼 capability와 준비 상태를 노출하고, 생성/저장 요청 시 local endpoint가 없으면 `scripts/serve_s2_pro.sh`를 자동 시작합니다.

- `GET /api/s2-pro/capabilities`
  S2-Pro provider capability를 반환합니다. 로컬 provider에서는 Fish Speech source, S2-Pro 모델 파일, 백엔드 시작 프로세스 설정, health 상태를 반환하고, API provider에서는 API key 구성 여부와 endpoint 설정을 반환합니다.
- `GET /api/s2-pro/voices`
  앱에 저장된 Fish Speech reference voice 목록을 반환합니다.
- `POST /api/s2-pro/voices`
  참조 음성을 선택 provider에 등록하고 `data/s2-pro-voices/`에 앱 레코드를 저장합니다. 로컬 provider는 Local S2-Pro 엔진을 확인/자동 시작한 뒤 `/v1/references/add`로 등록하고, API provider는 Fish Audio `/model`을 사용합니다.
- `POST /api/s2-pro/generate`
  tagged TTS, voice clone, multi speaker, multilingual 요청을 선택 provider의 `/v1/tts`에 전달하고 결과를 생성 갤러리에 저장합니다.

중요한 점:

- Hosted API는 선택 사항이며 `FISH_AUDIO_API_KEY`가 있을 때만 동작합니다.
- 선택한 provider가 준비되지 않았으면 가짜 결과를 만들지 않고 503을 반환합니다.
- `S2_PRO_AUTO_START=1`이면 로컬 provider 준비는 요청 안에서 자동으로 시도합니다.
- `S2_PRO_AUTO_START=0`이면 백엔드는 로컬 endpoint를 직접 시작하지 않습니다. 이 설정은 디버깅 또는 외부에서 이미 Fish Speech compatible endpoint를 관리할 때만 씁니다.
- 저장 목소리는 S2-Pro reference id와 Qwen에서 재사용할 참조 음성 경로를 함께 갖습니다.

### `/api/vibevoice/*`

VibeVoice는 `vibevoice-community/VibeVoice` checkout을 `vendor/VibeVoice`에 두고, 전용 `.venv-vibevoice`로 실행하는 vendor wrapper입니다. 코드 vendor는 community repo 하나만 사용하고, 모델은 `data/models/vibevoice` 아래에서 찾습니다.

- `GET /api/vibevoice/runtime`
  vendor checkout, Python executable, 모델 폴더, 지원 기능, 준비 상태를 반환합니다.
- `POST /api/vibevoice/tts`
  Realtime 0.5B, 1.5B, optional community 7B TTS를 실행하고 결과를 생성 갤러리에 저장합니다. 1.5B/7B는 `scripts/run_vibevoice_tts_15b.py` helper와 compatibility patch를 기본 경로로 사용합니다.
- `POST /api/vibevoice/asr`
  VibeVoice-ASR로 저장된 오디오를 전사합니다. context/hotwords가 있거나 upstream entrypoint가 맞지 않을 때는 `scripts/run_vibevoice_asr.py` helper를 사용합니다.
- `POST /api/vibevoice/train`
  community TTS fine-tuning은 `python -m vibevoice.finetune.train_vibevoice`로 실행합니다. ASR LoRA는 선택한 checkout이 `vendor/VibeVoice/finetuning-asr/lora_finetune.py`를 제공할 때만 실행합니다.

중요한 점:

- `vendor/VibeVoice`, `.venv-vibevoice`, `data/models/vibevoice`는 gitignore 대상입니다.
- `./scripts/download_models.sh vibevoice`가 vendor checkout, 전용 venv, ASR/0.5B/1.5B 모델을 한 번에 준비합니다.
- 7B community 모델은 `./scripts/download_models.sh vibevoice-7b`로 opt-in 준비합니다.
- 기본 fine-tuning 경로는 community TTS LoRA입니다. ASR LoRA는 checkout 제공 여부를 확인한 뒤 실행합니다.

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
- `vendor/VibeVoice`는 다운로드되는 runtime checkout이라 tracked source가 아닙니다.
- `data/rvc-models`는 local/downloaded asset이며 git에는 올리지 않습니다.
- `data/generated`와 `data/audio-tools`는 사용자 결과물 영역입니다.
- 최근 생성 이력은 프런트에서 `생성 갤러리` 한 탭으로 모읍니다.

다음 문서:

- [03-frontend-guide.md](./03-frontend-guide.md)
- [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
