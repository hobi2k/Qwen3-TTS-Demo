# VibeVoice Workspace

이 문서는 저장소에 포함된 VibeVoice vendor source를 이 앱에서 어떤 방식으로 tool처럼 다루는지 정리합니다.

## 역할

VibeVoice는 Qwen/S2-Pro를 대체하는 하나의 단일 TTS 탭이 아니라, 별도 provider 제품군입니다.

- `VibeVoice TTS`
  Realtime 0.5B, Long-form 1.5B, community Long-form 7B TTS를 실행합니다.
- `VibeVoice ASR`
  생성 갤러리/업로드/직접 경로의 단일 파일, 폴더 단위 오디오, Hugging Face dataset split을 VibeVoice-ASR로 전사합니다.
- `VibeVoice TTS Fine-tune`
  community VibeVoice TTS trainer를 dataset/column/LoRA/diffusion 옵션까지 노출해 실행합니다.
- `VibeVoice ASR Fine-tune`
  checkout에 포함된 VibeVoice-ASR LoRA trainer를 별도 탭에서 실행합니다.
- `VibeVoice Model Tools`
  TTS LoRA merge, merge 검증, NnScaler checkpoint 변환을 실행합니다.

## 설치와 다운로드

```bash
./scripts/download_models.sh vibevoice
```

이 명령은 아래 세 가지를 준비합니다.

| 경로 | 용도 |
| --- | --- |
| `vendor/VibeVoice` | 저장소에 포함된 VibeVoice vendor source |
| `.venv-vibevoice` | VibeVoice 전용 Python 환경 |
| `data/models/vibevoice` | ASR, Realtime 0.5B, 1.5B, optional 7B 모델 weight |

VibeVoice는 다운로드 시점에 git clone하지 않습니다. `vendor/VibeVoice`는 Applio/MMAudio처럼 저장소에 들어 있는 일반 vendor source여야 하며, `download_models.sh`는 이 폴더가 존재하는지 확인한 뒤 전용 venv와 모델 weight만 준비합니다. 따라서 embedded git repository 경고가 뜨면 안 됩니다.

다운로드 대상:

- `microsoft/VibeVoice-ASR`
- `microsoft/VibeVoice-Realtime-0.5B`
- `vibevoice/VibeVoice-1.5B`
- `vibevoice/VibeVoice-7B` optional community model

`all` 프로필에는 공식/기본 세 모델이 포함됩니다. 7B는 community 모델이고 용량이 크기 때문에 별도 opt-in입니다.

```bash
./scripts/download_models.sh all
./scripts/download_models.sh vibevoice-7b
```

## Git 관리

VibeVoice vendor source는 저장소에 포함됩니다. 전용 venv와 모델 weight만 로컬 산출물입니다.

`.gitignore` 기준:

- `.venv-vibevoice/`
- `data/models/`

따라서 `vendor/VibeVoice` 소스는 git에 남기고, 20GB 이상의 모델 파일과 `.venv-vibevoice`만 git에 올리지 않습니다.

## 기본 환경 변수

대부분은 비워 두면 기본 경로를 씁니다.

```env
VIBEVOICE_REPO_ROOT=vendor/VibeVoice
VIBEVOICE_MODEL_DIR=data/models/vibevoice
VIBEVOICE_PYTHON=.venv-vibevoice/bin/python
VIBEVOICE_ASR_MODEL_PATH=data/models/vibevoice/VibeVoice-ASR
VIBEVOICE_REALTIME_MODEL_PATH=data/models/vibevoice/VibeVoice-Realtime-0.5B
VIBEVOICE_TTS_15B_MODEL_PATH=data/models/vibevoice/VibeVoice-1.5B
VIBEVOICE_TTS_7B_MODEL_PATH=data/models/vibevoice/VibeVoice-7B
VIBEVOICE_TTS_15B_INFERENCE_STEPS=10
VIBEVOICE_TTS_7B_INFERENCE_STEPS=12
```

Command template은 기본 엔트리포인트를 바꿔야 할 때만 사용합니다.

```env
VIBEVOICE_ASR_COMMAND_TEMPLATE=
VIBEVOICE_TTS_COMMAND_TEMPLATE=
VIBEVOICE_TTS_15B_COMMAND_TEMPLATE=
VIBEVOICE_TTS_7B_COMMAND_TEMPLATE=
VIBEVOICE_TTS_FINETUNE_COMMAND_TEMPLATE=
```

## TTS 기능

### Realtime 0.5B

Realtime 0.5B는 VibeVoice upstream의 realtime inference 경로를 사용합니다. UI에서는 짧은 TTS 확인이나 빠른 음성 생성용으로 둡니다.

### Long-form 1.5B / Community 7B

Long-form 1.5B와 community 7B는 품질 우선 helper인 `scripts/run_vibevoice_tts_15b.py`를 기본 실행 경로로 씁니다. 두 모델 모두 community model repo인 `vibevoice/VibeVoice-1.5B`, `vibevoice/VibeVoice-7B`에서 받습니다.

지원하는 입력:

- 일반 텍스트
- `Speaker 1: ...` 형식의 speaker-labeled script
- 사용자 speaker name을 `Speaker N`으로 매핑
- speaker reference audio 1개 이상

지원하는 설정:

- `cfg_scale`
- `inference_steps`
- `max_length_times`
- `max_new_tokens`
- `seed`
- `device`
- `attn_implementation`
- `disable_prefill`
- `show_progress`
- 추가 CLI args

Microsoft/VibeVoice 계열 long-form inference class가 vendor source와 맞지 않는 경우를 위해 `app/backend/app/vendor_patches/vibevoice/modeling_vibevoice_inference.py`를 compatibility patch로 둡니다. 이 patch는 앱의 integration code이며, 모델 weight는 git에 포함하지 않습니다.

## ASR 기능

VibeVoice-ASR는 공통 ASR 모델 목록에도 노출됩니다.

지원하는 설정:

- 언어 또는 auto
- 전사 task
- context / hotwords
- timestamps
- device
- precision
- attention implementation
- batch size
- max new tokens
- beam count
- temperature
- top-p

context / hotwords가 없는 기본 전사는 가능한 경우 upstream demo script를 사용합니다. context가 필요하거나 upstream entrypoint가 맞지 않을 때는 `scripts/run_vibevoice_asr.py` helper를 사용합니다.

ASR 입력 방식:

- `Audio file`
  생성 갤러리, 업로드, 직접 경로 중 하나를 선택합니다.
- `Folder`
  폴더 안의 오디오를 upstream ASR demo script의 batch path로 넘깁니다.
- `HF dataset`
  `dataset`, `split`, `max_duration`을 지정해 upstream dataset inference path를 사용합니다.

## Fine-tuning

### TTS LoRA

community VibeVoice repo는 TTS fine-tuning 경로를 제공합니다. 이 앱의 `VibeVoice TTS Fine-tune` 탭은 `python -m vibevoice.finetune.train_vibevoice`를 실행합니다.

주요 설정:

- model path
- data dir
- output dir
- process count
- epochs
- per-device batch size
- gradient accumulation
- learning rate
- LoRA rank / alpha / dropout
- warmup ratio
- weight decay
- max grad norm
- max audio length
- logging / save steps
- bf16
- gradient checkpointing
- customized context
- dataset config / train split / eval split
- text/audio/voice prompt column mapping
- local train/validation JSONL
- LoRA target modules
- diffusion head LoRA wrapping
- diffusion head / connector training
- DDPM batch multiplier
- CE / diffusion loss weight
- debug save / debug CE details
- extra args

### ASR LoRA

ASR LoRA는 `VibeVoice ASR Fine-tune` 탭에서 실행합니다. 선택한 checkout이 `finetuning-asr/lora_finetune.py`를 제공할 때만 실행되며, 해당 스크립트가 없으면 앱은 fake success를 만들지 않고 오류를 반환합니다.

별도 TTS trainer를 직접 연결하려면 아래 환경 변수를 사용합니다.

```env
VIBEVOICE_TTS_FINETUNE_COMMAND_TEMPLATE="..."
```

## Model Tools

`VibeVoice Model Tools` 탭은 학습 이후 모델 자산을 정리하는 전용 화면입니다.

- `Merge LoRA into base model`
  `vibevoice/scripts/merge_vibevoice_models.py`로 base model과 LoRA checkpoint를 병합합니다.
- `Verify merged checkpoint`
  같은 merge script의 verify mode를 실행해 병합 결과를 점검합니다.
- `Convert NnScaler checkpoint`
  `vibevoice/scripts/convert_nnscaler_checkpoint_to_transformers.py`로 NnScaler checkpoint를 Transformers 폴더로 변환합니다.

## 모델 준비 확인

```bash
test -d vendor/VibeVoice
test -d .venv-vibevoice
test -d data/models/vibevoice/VibeVoice-ASR
test -d data/models/vibevoice/VibeVoice-Realtime-0.5B
test -d data/models/vibevoice/VibeVoice-1.5B
test -d data/models/vibevoice/VibeVoice-7B
find data/models/vibevoice -maxdepth 2 -name '*.safetensors'
```

정상 준비 후 대략적인 구조:

```text
data/models/vibevoice/
  VibeVoice-ASR/
    model-00001-of-00008.safetensors
    ...
    model-00008-of-00008.safetensors
    model.safetensors.index.json
  VibeVoice-Realtime-0.5B/
    model.safetensors
  VibeVoice-1.5B/
    model-00001-of-00003.safetensors
    model-00002-of-00003.safetensors
    model-00003-of-00003.safetensors
    model.safetensors.index.json
  VibeVoice-7B/
    model-00001-of-0000N.safetensors
    ...
    model.safetensors.index.json
```

## Private Hugging Face mirror

개인 mirror를 사용할 때는 아래 prefix를 사용합니다.

```text
vibevoice/VibeVoice-ASR/...
vibevoice/VibeVoice-Realtime-0.5B/...
vibevoice/VibeVoice-1.5B/...
vibevoice/VibeVoice-7B/...
```

`QWEN_USE_PRIVATE_ASSET_REPO=1`이면 `download_models.sh vibevoice`도 이 mirror를 먼저 확인합니다.
