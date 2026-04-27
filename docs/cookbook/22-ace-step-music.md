# ACE-Step Music Workspace

이 문서는 `ACE-Step 작곡` 탭과 로컬 ACE-Step 실행 구조를 정리합니다.

목표는 효과음이 아니라 “장르 설명 + 가사 구조 -> 완성형 음악”입니다. 사용자는 화면에서 곡 이름, 스타일 프롬프트, 가사, 길이와 guidance 값을 조절하고, 결과는 다른 생성물처럼 `생성 갤러리`에 저장됩니다.

## 1. 실행 구조

ACE-Step은 Qwen TTS와 의존성이 다를 수 있으므로 FastAPI 프로세스 안으로 직접 import하지 않습니다.

현재 구조:

- 백엔드 엔드포인트:
  - `POST /api/music/ace-step/generate`
- 백엔드 래퍼:
  - `app/backend/app/ace_step.py`
- 분리 실행 스크립트:
  - `scripts/run_ace_step_generate.py`
- 기본 ACE-Step checkout:
  - `vendor/ACE-Step`
- 기본 ACE-Step 전용 venv:
  - `.venv-ace-step`
- 기본 checkpoint/cache 경로:
  - `data/models/ace-step`
- 생성 결과:
  - `data/generated/ace-step-music/<date>/...wav`

이 방식의 장점:

- 웹 서버가 음악 모델 로딩 때문에 멈추지 않습니다.
- ACE-Step 전용 Python 환경을 따로 둘 수 있습니다.
- torch / CUDA / xformers 계열 의존성 충돌을 Qwen 메인 `.venv`와 분리할 수 있습니다.

## 2. 설치와 다운로드

ACE-Step만 준비하려면:

```bash
./scripts/download_models.sh ace-step
```

전체 자산을 한 번에 준비하려면:

```bash
./scripts/download_models.sh all
```

스크립트가 하는 일:

1. `vendor/ACE-Step`에 공식 ACE-Step 저장소를 clone합니다.
2. `.venv-ace-step` 가상환경을 만듭니다.
3. `pip install -e vendor/ACE-Step`로 ACE-Step을 설치합니다.
4. 개인 Hugging Face mirror가 설정되어 있으면 `ace-step/` prefix를 `data/models/ace-step`으로 내려받습니다.
5. mirror가 없으면 ACE-Step 실행 시 checkpoint cache를 `data/models/ace-step`에 두도록 준비합니다.

관련 환경변수:

```env
ACE_STEP_REPO_ROOT=vendor/ACE-Step
ACE_STEP_PYTHON=.venv-ace-step/bin/python
ACE_STEP_CHECKPOINT_PATH=data/models/ace-step
ACE_STEP_REPO_URL=https://github.com/ace-step/ACE-Step.git
ACE_STEP_VENV=.venv-ace-step
```

## 3. UI 입력값

### Track name

생성 갤러리에 표시할 파일 이름입니다.

### Style prompt

장르, 분위기, 악기, 보컬 톤을 영어로 적습니다.

예:

```text
Korean city pop, warm analog synths, clean female vocal, night drive, glossy drums, melodic bass
```

### Lyrics

실제 가사와 곡 구조를 적습니다.

예:

```text
[verse]
오늘 밤도 불빛은 천천히 흐르고
창밖의 도시는 말없이 반짝여

[chorus]
우린 멀리 가도 같은 노래를 기억해
끝나지 않을 밤처럼 다시 시작해
```

## 4. Advanced controls

기본값은 바로 시험 생성이 가능하도록 잡아두고, 세부 값은 접히는 `Advanced controls` 안에 둡니다.

- `Duration`
  생성할 길이입니다. 너무 길게 잡으면 VRAM과 시간이 증가합니다.
- `Steps`
  diffusion inference step입니다. 높을수록 오래 걸립니다.
- `Guidance`
  prompt와 lyrics를 얼마나 강하게 따를지 조절합니다.
- `Seed`
  같은 결과를 재현하기 위한 seed입니다.
- `Scheduler`
  ACE-Step scheduler입니다. 기본은 `euler`입니다.
- `CFG type`
  guidance 방식입니다. 기본은 `apg`입니다.
- `Omega scale`
  ACE-Step의 추가 guidance scale입니다.
- `ERG tag`, `ERG lyric`, `ERG diffusion`
  prompt/lyrics/diffusion 쪽 ERG guidance를 켜고 끄는 옵션입니다.
- `BF16`
  지원 GPU에서는 기본값으로 켜 둡니다.
- `CPU offload`
  VRAM이 부족할 때만 켭니다. 속도는 느려집니다.

## 5. 생성 갤러리 연결

생성이 성공하면 백엔드는 `GenerationRecord`를 저장합니다.

저장 메타데이터:

- `mode = "ace_step_music"`
- `instruction = style prompt`
- `text = lyrics`
- `language = "Music"`
- ACE-Step 실행 옵션 전체
- ACE-Step runner stdout/stderr

따라서 결과는 `생성 갤러리`에서 다운로드, 삭제, 추후 데이터셋 재료로 사용할 수 있습니다.

## 6. 운영 주의점

- ACE-Step은 큰 음악 모델이므로 Qwen fine-tuning, S2-Pro, Applio 변환과 동시에 돌리지 않는 것을 권장합니다.
- `.venv-ace-step`은 메인 `.venv`와 분리합니다.
- `vendor/ACE-Step/.git`은 저장소에 그대로 커밋하지 않습니다. 필요한 경우 source snapshot을 vendoring할 때 `.git`을 제거하고 커밋합니다.
- 대형 checkpoint는 git에 올리지 않고 `data/models/ace-step`에 두며, 장기적으로 개인 Hugging Face mirror의 `ace-step/` prefix에 업로드합니다.

