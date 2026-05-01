# Script Entrypoints

이 문서는 현재 저장소에서 실제로 유지보수하는 실행 진입점만 정리합니다.

예전에는 최상위 `voicebox/` 폴더와 `scripts/qwen3_tts_voicebox_*.py` 계열 파일이 canonical script를 감싸는 호환 래퍼로 남아 있었습니다. 지금은 중복 경로가 오히려 유지보수를 흐리므로 제거했습니다.

현재 기준에서는 `vendor/Qwen3-TTS` 안에 이미 들어간 커스텀 파일을 당장 삭제하지 않습니다. 대신 동일한 내용을 `qwen_extensions`에 복사해 두고, 실제 백엔드 실행은 `QWEN_EXTENSIONS`가 가리키는 확장 폴더를 우선 사용합니다. `vendor/Qwen3-TTS` 안 복사본은 호환과 비교를 위한 legacy mirror입니다.

원칙은 단순합니다.

- VoiceBox 학습 코드는 `qwen_extensions/finetuning`에 둡니다.
- VoiceBox 체크포인트 변환과 업로드 코드는 `qwen_extensions/fusion`에 둡니다.
- VoiceBox 추론 코드는 `qwen_extensions/inference/voicebox`에 둡니다.
- 기존 `vendor/Qwen3-TTS` 안 커스텀 파일은 이번 정리 단계에서는 삭제하지 않습니다.
- 일반 유틸리티와 평가 스크립트만 `scripts/`에 둡니다.
- 새 기능을 만들 때 `scripts/`나 최상위 폴더에 얇은 래퍼를 추가하지 않습니다.

## Canonical VoiceBox Scripts

| 책임 | 실행 파일 |
| --- | --- |
| Base speaker fine-tuning | `qwen_extensions/finetuning/sft_base_12hz.py` |
| plain CustomVoice fine-tuning | `qwen_extensions/finetuning/sft_custom_voice_12hz.py` |
| shared training implementation | `qwen_extensions/finetuning/voicebox_training_common.py` |
| VoiceBox bootstrap training | `qwen_extensions/finetuning/sft_voicebox_bootstrap_12hz.py` |
| VoiceBox -> VoiceBox retraining | `qwen_extensions/finetuning/sft_voicebox_12hz.py` |
| CustomVoice -> VoiceBox conversion | `qwen_extensions/fusion/make_voicebox_checkpoint.py` |
| Hugging Face upload | `qwen_extensions/fusion/upload_voicebox_to_hub.py` |
| non-VoiceBox clone prompt + instruct | `qwen_extensions/inference/hybrid_clone_instruct.py` |
| VoiceBox normal instruct inference | `qwen_extensions/inference/voicebox/infer_instruct.py` |
| VoiceBox clone experiment | `qwen_extensions/inference/voicebox/clone.py` |
| VoiceBox clone + instruct experiment | `qwen_extensions/inference/voicebox/clone_instruct.py` |
| shared low-level VoiceBox clone logic | `qwen_extensions/inference/voicebox/clone_low_level.py` |
| shared VoiceBox loader/runtime | `qwen_extensions/inference/voicebox/runtime.py` |

## Backend Resolution

FastAPI는 아래 순서로 Qwen 확장 스크립트를 찾습니다.

1. `QWEN_EXTENSIONS`가 있으면 해당 디렉터리
2. 없으면 저장소 루트의 `qwen_extensions`
3. 해당 파일이 없을 때만 legacy fallback으로 `vendor/Qwen3-TTS`

예시:

```env
QWEN_EXTENSIONS=qwen_extensions
```

상대 경로는 저장소 루트 기준입니다. 절대 경로를 넣으면 그 경로를 그대로 사용합니다.

Qwen 데이터 준비와 fine-tuning subprocess는 기본적으로 백엔드와 같은 Python interpreter를 사용합니다.
`QWEN_DEMO_PYTHON`을 지정하면 그 값을 우선하지만, 일반 운영에서는 비워 두는 편이 안전합니다.
백엔드는 subprocess 환경에 아래 경로를 넣습니다.

```text
vendor/Qwen3-TTS
vendor/Qwen3-TTS/finetuning
qwen_extensions
```

이렇게 해야 `Base`, `CustomVoice`, `VoiceBox` 학습이 모두 `qwen_extensions/finetuning`의 현재 검증된 엔트리포인트를 안정적으로 import할 수 있습니다. 업스트림 `vendor/Qwen3-TTS/finetuning/sft_12hz.py`는 비교와 호환을 위해 남기지만, 백엔드 실행 기준은 `qwen_extensions/finetuning/sft_base_12hz.py`입니다.

## Current Training Code Path

현재 검증된 MAI 학습 흐름은 아래 세 단계입니다.

```bash
# 1. plain CustomVoice
.venv/bin/python qwen_extensions/finetuning/sft_custom_voice_12hz.py ...

# 2. CustomVoice -> VoiceBox
.venv/bin/python qwen_extensions/fusion/make_voicebox_checkpoint.py ...

# 3. VoiceBox -> VoiceBox
.venv/bin/python qwen_extensions/finetuning/sft_voicebox_12hz.py ...
```

현재 full-run 데이터셋은 아래 파일입니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

현재 1.7B full-run에서 안정적으로 완료된 optimizer 설정은 아래입니다.

```bash
QWEN_DEMO_OPTIMIZER=adafactor
```

`Adafactor`는 품질 보장용이 아니라 16GB GPU에서 optimizer state 메모리 피크를 낮추기 위한 운영 옵션입니다. 품질은 생성 wav, Qwen3-ASR 전사, speaker similarity, 실제 청취로 따로 확인합니다.

## S2-Pro Engine Scripts

S2-Pro는 Qwen/VoiceBox 학습 경로가 아닙니다. 로컬 Fish Speech 자산을 별도 엔진으로 사용합니다.

- source checkout: `vendor/fish-speech`
- model directory: `data/models/fish-speech/s2-pro`
- isolated runtime venv: `.venv-fish-speech`

Fish Speech는 메인 Qwen `.venv`에 설치하지 않습니다. Fish Speech upstream은 torch 버전 pin을 포함할 수 있으므로, Qwen/flash-attn 런타임과 섞이면 Torch/CUDA 구성이 흔들릴 수 있습니다. `scripts/serve_s2_pro.sh`는 독립 `.venv-fish-speech`를 만들고, 선택한 torch-family build를 먼저 설치한 뒤 Fish Speech를 설치합니다.

일반 사용 흐름에서는 이 스크립트를 직접 먼저 실행하지 않습니다. FastAPI 백엔드가 `S2ProEngine` wrapper를 통해 로컬 provider 상태를 보고, S2-Pro 생성/목소리 저장 요청 시 endpoint가 없으면 이 스크립트를 lazy start합니다. 수동 실행은 디버깅, 포트 점검, 백엔드 시작 전 warm-up이 필요할 때만 사용합니다.

```bash
./scripts/download_models.sh s2pro
```

수동 디버깅:

```bash
./scripts/serve_s2_pro.sh
```

기본 로컬 S2-Pro torch 라인:

```env
S2_PRO_RUNTIME=local
S2_PRO_AUTO_START=1
FISH_SPEECH_TORCH_VERSION=2.11.0
FISH_SPEECH_TORCH_PROFILE=cu130
```

엔진 설치 구현은 아래 파일입니다.

```text
scripts/install_fish_speech_runtime.py
```

백엔드가 관리하는 로컬 엔진 로그는 아래 파일에 기록됩니다.

```text
data/runtime/fish-speech-s2-pro.log
```

## Remaining Scripts

`scripts/`에는 현재 아래 성격의 파일만 남깁니다.

- 모델 다운로드와 환경 준비
- 데이터셋 import / prepare
- 품질 평가와 검증
- 외부 런타임 설치와 실행
- 개인 Hugging Face asset manifest 준비

현재 `scripts/`의 VoiceBox 관련 파일은 평가용 `evaluate_customvoice_voicebox_quality.py`만 남깁니다. 학습, 변환, 추론 자체는 `qwen_extensions` 내부 canonical script를 직접 사용합니다.

## Training Endpoint Entrypoints

UI의 학습 탭은 아래 백엔드 엔드포인트를 호출합니다. 이 항목들은 모두 장시간 작업이므로 live E2E 자동 검증에서는 버튼을 누르지 않고, 단일 작업으로 따로 실행합니다.

학습용 데이터셋 준비 UI도 Qwen 전용으로 두지 않습니다. 현재 프런트엔드는 아래처럼 모델군별 데이터셋 탭을 따로 둡니다.

| 데이터셋 탭 | 목적 | 학습 탭으로 넘기는 값 |
| --- | --- | --- |
| Qwen 데이터셋 만들기 | Qwen Base/CustomVoice/VoiceBox용 `audio/`, `raw.jsonl`, `prepared.jsonl`, `manifest.json` 생성 | `dataset_id` |
| S2-Pro 데이터셋 | Fish Speech `text2semantic_finetune`용 `wav + .lab` 폴더 또는 proto 폴더 선택 | `lab_audio_dir` 또는 `proto_dir` |
| VibeVoice 데이터셋 | VibeVoice TTS/ASR용 local dataset path, HF dataset id, train/validation JSONL 지정 | `data_dir`, `train_jsonl`, `validation_jsonl` |
| Applio RVC 데이터셋 | 같은 화자의 생성 갤러리 WAV 묶음 또는 정리된 WAV 폴더 선택 | `audio_paths` 또는 `dataset_path` |
| ACE-Step 데이터셋 | LoRA/LoKr 학습용 tensor 폴더, 오디오 폴더, dataset JSON 지정 | `tensor_dir`, `audio_dir`, `dataset_json` |
| MMAudio 데이터셋 | upstream `example_train` 검증 모드 또는 Hydra config 등록 데이터셋 모드 선택 | `data_mode` |

중요한 구분은 “모든 모델이 Qwen처럼 JSONL 하나로 끝나지 않는다”는 점입니다. S2-Pro, VibeVoice, ACE-Step, MMAudio, Applio는 upstream trainer가 기대하는 입력 형식이 서로 다르므로, UI도 하나의 범용 데이터셋 폼으로 뭉치지 않고 모델별 준비 탭으로 나눕니다.

| 기능 | API | 실행 기준 |
| --- | --- | --- |
| Qwen 데이터 준비 | `POST /api/datasets/{dataset_id}/prepare-for-training` | `scripts/qwen3_tts_prepare_data.py` |
| Qwen Base/CustomVoice/VoiceBox fine-tune | `POST /api/finetune-runs` | `qwen_extensions/finetuning/sft_base_12hz.py`, `sft_custom_voice_12hz.py`, `sft_voicebox_12hz.py` |
| VoiceBox fusion | `POST /api/voicebox/fusion` | `qwen_extensions/fusion/make_voicebox_checkpoint.py` |
| S2-Pro LoRA/full fine-tune | `POST /api/s2-pro/train` | `vendor/fish-speech/fish_speech/train.py --config-name text2semantic_finetune` |
| Applio/RVC model train | `POST /api/audio-tools/rvc-train` | Applio CLI preprocess/extract/train/index |
| MMAudio full/continued train | `POST /api/audio-tools/mmaudio-train` | `vendor/MMAudio/train.py` |
| ACE-Step LoRA/LoKr adapter train | `POST /api/music/ace-step/train-adapter` | `vendor/ACE-Step/train.py fixed/vanilla` |
| VibeVoice ASR/TTS train | `POST /api/vibevoice/train` | VibeVoice ASR LoRA script 또는 TTS trainer/template |

## What Not To Do

- 최상위 `voicebox/` 폴더를 다시 만들지 않습니다.
- `scripts/qwen3_tts_voicebox_*.py` 같은 호환 래퍼를 다시 추가하지 않습니다.
- 학습 루프를 `scripts/`에 복제하지 않습니다.
- 새 CustomVoice/VoiceBox 코드를 `vendor/Qwen3-TTS`에만 추가하지 않습니다. 먼저 `qwen_extensions`에 반영하고, legacy mirror가 필요할 때만 별도로 동기화합니다.
- 새 VoiceBox 기능을 만들 때 canonical script가 아닌 별도 우회 경로부터 만들지 않습니다.
- 문서에는 삭제된 래퍼 명령을 재현 경로로 남기지 않습니다.
