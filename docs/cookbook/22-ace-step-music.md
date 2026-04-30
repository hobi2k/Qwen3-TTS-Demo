# ACE-Step-1.5 Music Workspace

이 문서는 `ACE-Step 작곡` 탭과 로컬 ACE-Step-1.5 실행 구조를 정리합니다.

이전 1.x ACE-Step의 단일 `ACEStepPipeline` 클래스 대신, 1.5는 DiT 핸들러
(`AceStepHandler`)와 5Hz 언어 모델 핸들러(`LLMHandler`)를 분리해 호출합니다.
이 변경에 맞춰 백엔드/스크립트/프런트엔드를 모두 다시 묶었습니다.

## 1. 실행 구조

ACE-Step-1.5는 Qwen TTS와 의존성이 충돌할 수 있어 FastAPI 프로세스에 직접 import
하지 않습니다. 백엔드는 `scripts/run_ace_step_generate.py`를 별도 Python으로 실행
하고 결과 오디오와 메타 JSON만 받습니다.

| 위치 | 역할 |
| --- | --- |
| `vendor/ACE-Step` | ACE-Step-1.5 소스 체크아웃 |
| `.venv-ace-step` | ACE-Step 전용 virtualenv |
| `data/models/ace-step` | ACE-Step DiT/LM/VAE checkpoint 캐시 (= `ACESTEP_CHECKPOINTS_DIR`) |
| `data/models/ace-step/loras` | UI에서 선택할 LoRA 파일/디렉터리 |
| `app/backend/app/ace_step.py` | 서브프로세스 래퍼 + LoRA/모델 변형 목록 |
| `scripts/run_ace_step_generate.py` | task별 ACE-Step 호출 스크립트 |
| `data/generated/ace-step-<task>/<date>/...` | 결과 저장 위치 |

## 2. 설치와 다운로드

ACE-Step-1.5만 준비하려면:

```bash
./scripts/download_models.sh ace-step
```

전체 자산을 한 번에:

```bash
./scripts/download_models.sh all
```

스크립트가 하는 일:

1. `vendor/ACE-Step`에 ACE-Step-1.5 저장소를 clone (`--depth 1`).
2. `.venv-ace-step` 가상환경 생성.
3. `uv pip install --python .venv-ace-step/bin/python -e vendor/ACE-Step` 로 ACE-Step-1.5 설치.
   ACE-Step-1.5는 `nano-vllm`을 `pyproject.toml`의 `[tool.uv.sources]` 로컬 소스로
   선언하므로 일반 `pip install -e`는 PyPI에서 `nano-vllm`을 찾다가 실패합니다.
   `uv`가 없을 때만 스크립트가 `acestep/third_parts/nano-vllm`을 먼저 설치하고
   `--no-deps -e vendor/ACE-Step`로 fallback합니다.
4. 기본적으로 `acestep-download`(메인 모델 + 1.7B LM + VAE)를 실행해 `data/models/ace-step`에 캐시.
5. Hugging Face 개인 미러(`PRIVATE_ASSET_REPO_ID`)가 설정되어 있으면 `ace-step/` prefix를 그대로 미러에서 받습니다.

다운로드 프로필은 환경변수 `ACE_STEP_DOWNLOAD_PROFILE`로 조절합니다:

| 값 | 효과 |
| --- | --- |
| `main` (기본) | 메인 ACE-Step v1.5 + 1.7B LM + VAE (`acestep-download`) |
| `all` | DiT 변형(turbo/sft/base/xl) 전체와 LM 전부 (`--all`) |
| `acestep-v15-sft`, `acestep-v15-xl-base`, `acestep-5Hz-lm-4B` … | 특정 모델만 (`--model NAME`) |
| `none` / `skip` | 다운로드를 건너뛰고 첫 생성 시 자동 다운로드 |

관련 환경변수:

```env
ACE_STEP_REPO_ROOT=vendor/ACE-Step
ACE_STEP_PYTHON=.venv-ace-step/bin/python
ACE_STEP_CHECKPOINT_PATH=data/models/ace-step
ACE_STEP_LORA_DIR=data/models/ace-step/loras
ACE_STEP_REPO_URL=https://github.com/ace-step/ACE-Step-1.5.git
ACE_STEP_VENV=.venv-ace-step
ACE_STEP_DOWNLOAD_PROFILE=main
```

## 3. 지원 모드

UI 상단 모드 탭에 1:1 매핑되며, 백엔드는 별도 엔드포인트를 가집니다.

| 모드 | 엔드포인트 | 설명 |
| --- | --- | --- |
| Text → Music | `POST /api/music/ace-step/generate` | 프롬프트 + 가사로 새 트랙 생성 |
| Cover | `POST /api/music/ace-step/cover` | 원곡 분위기를 유지한 스타일 변환 |
| Repaint | `POST /api/music/ace-step/repaint` | `[start,end)` 구간만 다시 그리기 |
| Extend | `POST /api/music/ace-step/extend` | ACE-Step `complete` task로 트랙 이어붙이기 |
| Extract | `POST /api/music/ace-step/extract` | 원곡에서 단일 stem 분리 |
| Lego | `POST /api/music/ace-step/lego` | 기존 트랙 위에 한 트랙 추가 |
| Complete | `POST /api/music/ace-step/complete` | 누락된 여러 트랙을 한 번에 채움 |
| Understand | `POST /api/music/ace-step/understand` | 5Hz LM이 BPM/캡션/가사/키 추정 |
| Inspiration | `POST /api/music/ace-step/create-sample` | 한 줄 NL → caption/lyrics/메타 |
| Format | `POST /api/music/ace-step/format-sample` | 사용자가 적은 caption/lyrics 정리 |
| LoRA / LoKr 학습 | `POST /api/music/ace-step/train-adapter` | upstream `train.py fixed/vanilla`로 adapter 학습 |

런타임 정보는 `GET /api/music/ace-step/runtime`에서 조회합니다. 응답에는
`model_variants`, `lm_models`, `lora_adapters`, `track_names`, `supported_tasks`가 포함되어
있어 프런트엔드 드롭다운을 동적으로 채웁니다.

## 4. UI 입력값

### 공통 (모든 모드)

* **DiT 모델**: `acestep-v15-turbo` / `acestep-v15-sft` / `acestep-v15-base` / XL 변형 등
* **5Hz LM 모델**: `acestep-5Hz-lm-1.7B`(기본) / `0.6B` / `4B`
* **LoRA**: `data/models/ace-step/loras` 안의 `.safetensors` / `.bin` / LyCORIS LoKr 디렉터리
  * scale, adapter_name 추가 가능

### Text → Music

`Style prompt`에 장르/악기/보컬 톤을 영어로, `Lyrics`에 `[verse]`, `[chorus]`로 곡 구조를 적습니다.

```text
Korean city pop, warm analog synths, clean female vocal, night drive

[verse]
오늘 밤도 불빛은 천천히 흐르고
창밖의 도시는 말없이 반짝여

[chorus]
우린 멀리 가도 같은 노래를 기억해
끝나지 않을 밤처럼 다시 시작해
```

### Cover / Repaint / Extend / Extract / Lego / Complete

* `Source audio`: 원본 오디오 경로(또는 업로드). 데이터셋 업로드와 동일하게 `data/uploads/` 아래에 저장됩니다.
* Cover는 `audio_cover_strength`(0=새로 그리기, 1=원곡에 가깝게)와 `cover_noise_strength`로 스타일 강도를 조절.
* Repaint는 `repainting_start` / `repainting_end`(초)와 `repaint_mode`(`conservative` / `balanced` / `aggressive`).
* Extract / Lego는 트랙 한 개를, Extend / Complete는 콤마로 여러 트랙을 지정합니다 (`vocals`, `drums`, `bass`, `guitar`, ...).

### Understand / Inspiration / Format

오디오 또는 자연어 한 줄에서 BPM, 키, 가사, 캡션을 LM이 추정하거나 사용자가 적은 caption/lyrics를 ACE-Step 정형 포맷으로 정리합니다. 결과는 화면 하단 메타 패널에 보이고, Inspiration / Format 결과는 자동으로 Text → Music 폼에 채워 넣어 바로 합성으로 이어가게 합니다.

### LoRA / LoKr 학습

ACE-Step upstream의 Side-Step 학습 CLI(`vendor/ACE-Step/train.py`)를 백엔드가 별도 프로세스로 실행합니다. UI에서는 입력 방식을 탭으로 나눕니다.

* `Tensors`: 이미 preprocess가 끝난 `.pt` tensor 폴더를 바로 `--dataset-dir`로 학습합니다.
* `Audio folder`: WAV/MP3/FLAC 폴더를 먼저 `--preprocess --audio-dir`로 tensor화한 뒤 같은 실행에서 학습합니다.
* `Dataset JSON`: ACE-Step dataset JSON을 `--preprocess --dataset-json`로 tensor화한 뒤 학습합니다.

결과는 기본적으로 `data/models/ace-step/loras/<adapter-name>__<run-id>/final`에 저장됩니다. 실행 로그는 `data/audio-tools/ace_step_training/<run-id>/train.log`에 남고, 학습이 성공하면 프런트는 런타임 정보를 다시 읽어 `Model & LoRA` 선택 목록에 새 adapter가 나타나게 합니다.

## 5. 생성 갤러리 연결

작업이 끝나면 백엔드는 `GenerationRecord`를 저장합니다.

저장 메타데이터:

* `mode = "ace_step_<task>"` (예: `ace_step_music`, `ace_step_cover`, ...)
* `instruction`: caption/style prompt
* `text`: 가사(또는 단일 트랙 이름 등)
* `language = "Music"`
* ACE-Step subprocess가 남긴 `audios`, `time_costs`, `lm_metadata`
* 요청 그대로(`request_payload`) 저장되어 재현 가능

따라서 결과는 `생성 갤러리`에서 다운로드 / 삭제 / 데이터셋 재료로 재사용할 수 있습니다.

## 6. 운영 주의점

* ACE-Step-1.5는 메모리를 많이 씁니다 (turbo/SFT 4B + 5Hz LM 1.7B 기준 ~16GB+). VRAM이 작으면 UI에서 `CPU offload`를 켜고 LM은 0.6B로 낮추세요.
* `.venv-ace-step` 은 메인 `.venv`와 분리합니다. ACE-Step은 PyTorch cu128 빌드를 강제 설치하므로 메인 환경을 오염시키지 않아야 합니다.
* ACE-Step 설치는 `uv` 기준으로 검증합니다. 일반 `pip`는 ACE-Step-1.5의 로컬 `nano-vllm` 의존성을 해석하지 못할 수 있습니다.
* `HF_HUB_ENABLE_HF_TRANSFER=1`일 때는 ACE-Step 전용 venv에도 `hf_transfer`가 필요합니다. 다운로드 스크립트는 `.venv-ace-step`에 ACE-Step을 설치한 뒤 `hf_transfer`를 함께 설치해 Hugging Face 다운로드가 바로 재개되게 합니다.
* Hugging Face 다운로드가 실제 네트워크 문제로 실패하면 스크립트는 ModelScope 다운로드로 이어갑니다. 이 경우 여러 대형 파일을 동시에 내려받아 시간이 오래 걸릴 수 있습니다.
* Transformers 동적 모듈과 matplotlib 캐시는 프로젝트 내부 `data/cache/ace-step`으로 고정합니다. 샌드박스나 서버 환경에서 `/home/<user>/.cache`가 쓰기 불가일 때도 모델 로드가 실패하지 않게 하기 위함입니다.
* `vendor/ACE-Step/.git`은 저장소에 그대로 커밋하지 않습니다. 필요하면 source snapshot vendoring 시 `.git`을 제거하고 커밋하세요.
* 큰 checkpoint는 git에 올리지 않고 `data/models/ace-step`에 두며, 장기적으로는 개인 Hugging Face mirror의 `ace-step/` prefix에 업로드합니다.
* extract / lego / complete task는 base DiT가 강제됩니다. UI 드롭다운에서 `acestep-v15-base`를 선택하거나 `config_path`에 base 변형을 지정하세요.

## 7. 검증 기록

2026-04-27 기준 로컬 WSL + RTX 5080 환경에서 다음을 확인했습니다.

* `ACE_STEP_DOWNLOAD_PROFILE=main ./scripts/download_models.sh ace-step`
  - `vendor/ACE-Step` checkout 확인
  - `.venv-ace-step` 생성/재사용
  - `ace-step==1.5.0`, local `nano-vllm`, `hf_transfer` 설치 확인
  - Hugging Face resume으로 `Qwen3-Embedding-0.6B`, `acestep-5Hz-lm-1.7B`, `acestep-v15-turbo`, `vae` 다운로드 완료
* `GET /api/music/ace-step/runtime` 내부 함수 검증
  - runtime available: `true`
  - DiT: `acestep-v15-turbo`
  - LM: `acestep-5Hz-lm-1.7B`
  - tasks: text2music / cover / repaint / extend / extract / lego / complete / understand / create_sample / format_sample
* 실제 text2music smoke
  - prompt: `short warm lofi loop, soft drums, mellow synth, no vocals`
  - duration: 4초
  - inference steps: 2
  - LM skip: `thinking=false`, CoT flags off
  - output: `data/generated/ace-step-smoke/2026-04-27/064107_ace-step-smoke-lofi.wav`
* 생성 갤러리 record 저장 smoke
  - mode: `ace_step_music`
  - output: `data/generated/ace-step-music/2026-04-27/064153_ace-step-gallery-smoke.wav`
  - record: `data/generated/ace_step_music-records/2026-04-27/064206_short-warm-lofi-loop-soft-drums-mellow-synth-no__music_cd6a70f18c43.json`
