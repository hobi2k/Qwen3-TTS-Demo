# Qwen3-TTS-Demo 계획서

## 현재 단계

이 프로젝트는 이제 “큰 기능 뼈대 만들기” 단계보다, 현재 구조를 안정화하고 마무리하는 단계에 가깝습니다.

즉 지금 계획의 핵심은 새 탭을 계속 늘리는 것이 아니라, 현재 구조를 기준으로

- 기능 역할을 더 명확히 하고
- 품질 검수를 반복 가능하게 유지하고
- 남은 기술 부채를 좁히는 것

입니다.

## 현재 구조 요약

현재 화면 구조는 아래 기준으로 정리되어 있습니다.

- `홈`
- `나의 목소리들`
- `생성 갤러리`
- `텍스트 음성 변환`
- `목소리 복제`
- `목소리 설계`
- `프리셋 기반 생성`
- `S2-Pro`
- `MMAudio 사운드 효과`
- `오디오 분리`
- `Applio RVC 모델 학습`
- `Applio 단일 변환`
- `Applio 배치 변환`
- `Applio 모델 블렌딩`
- `ACE-Step 작곡`
- `Qwen 데이터셋 만들기`
- `Qwen 학습 실행`
- `VoiceBox 융합`
- `S2-Pro 데이터셋 / 학습`
- `VibeVoice 데이터셋 / 학습`
- `Applio RVC 데이터셋 / 학습`
- `MMAudio 데이터셋 / 학습`
- `ACE-Step 데이터셋 / 학습`
- `가이드`

이 구조를 기준으로 앞으로의 계획도 정리합니다.

## 제품 목표

이 저장소의 목표는 `Qwen3-TTS`, `Fish Speech S2-Pro`, `Applio`, `MMAudio`, `ACE-Step`을 한데 묶어, 아래 흐름을 실제로 시연할 수 있는 로컬 음성/음악 작업실을 제공하는 것입니다.

1. `CustomVoice`로 바로 TTS를 생성하고 듣기
2. `Base`로 참조 음성에서 스타일을 추출하기
3. `VoiceDesign`으로 설명문 기반 스타일 만들기
4. 저장 프리셋을 반복 생성에 다시 쓰기
5. 저장 프리셋 위에 `instruct`를 덧입혀 생성하기
6. 오디오 툴을 독립 기능으로 사용하기
7. 데이터셋을 만들고 파인튜닝을 실행하기
8. Fish Speech S2-Pro 계열 태그 기반 생성을 별도 작업실로 제공하기
9. ACE-Step으로 장르 태그와 가사 구조 기반 음악을 생성하기

## 현재 구조에서 중요한 구분

### 1. 프리셋 / clone prompt

- 추론 자산
- 모델 재학습 없음
- 저장 후 반복 생성에 재사용

### 2. fine-tuning

- 학습 작업
- 모델 가중치 변경
- dataset, tokenizer, prepared data 필요

### 3. 생성 이력

- `생성 갤러리`에서만 관리
- 다른 탭에는 반복 노출하지 않음

### 4. 저장 자산

- `나의 목소리들`에서 관리
- 저장 프리셋과 최종 학습 모델 중심

### 5. S2-Pro

- Qwen 모델 선택 흐름과 분리
- 태그 기반 TTS, 참조 음성 복제, 멀티 스피커, 다국어 입력 중심
- Fish Speech/Fish Audio provider 기반 별도 제품군
- 기본 `Local S2-Pro` provider는 사용자가 별도 서버를 관리하지 않고, MMAudio/Applio/ACE-Step처럼 백엔드 wrapper가 로컬 엔진으로 다룸
- hosted API는 `FISH_AUDIO_API_KEY`를 백엔드 `.env`에 넣고 UI에서 `Fish Audio API` provider를 선택해 사용

### 6. 런타임 unload

- Qwen / Qwen-ASR는 FastAPI 프로세스 cache를 명시적으로 비움
- Local S2-Pro는 백엔드가 자동 시작한 Fish Speech server process를 필요 시 종료
- ACE-Step, MMAudio, VibeVoice, Applio/RVC는 subprocess 실행을 기준으로 하고, 실행 전 resident runtime을 비워 GPU 충돌을 줄임
- 운영 확인 endpoint는 `GET /api/runtime/status`, 수동 정리는 `POST /api/runtime/unload?include_s2_pro=true`

### 7. 가이드

- 사용자가 탭별 목적을 앱 안에서 확인
- 모델 선택 이유, 데이터셋 흐름, 학습 흐름을 문서형 화면으로 제공

### 8. Vendor upstream delta 관리

- `vendor/*`를 직접 수정하거나 compatibility patch를 추가하면 [cookbook/25-vendor-upstream-deltas.md](./cookbook/25-vendor-upstream-deltas.md)에 반드시 기록
- 특히 MMAudio처럼 원본 파일을 직접 수정한 경우, 파일별 이유와 upstream 업데이트 때 제거 가능한 조건을 함께 남김
- upstream 갱신 시 `git diff -- vendor qwen_extensions app/backend/app/vendor_patches`로 delta를 먼저 확인하고, 문서의 vendor별 재검증 명령을 순서대로 실행

### 9. 모델별 데이터셋 준비

Qwen만 데이터셋 생성 탭을 갖는 구조는 유지보수와 사용성 모두에서 맞지 않습니다.
각 엔진의 trainer가 기대하는 입력이 다르므로, 데이터셋 준비 탭도 모델군별로 분리합니다.

- Qwen
  - `data/datasets/<dataset_id>/audio`, `raw.jsonl`, `prepared.jsonl`, `manifest.json`을 생성
  - 결과는 `Qwen 학습 실행`의 dataset selector로 연결
- S2-Pro
  - 생성 갤러리/폴더 입력으로 raw voice folder를 만들거나 prepared proto를 가져옴
  - 결과는 학습 탭의 준비된 데이터셋 선택 패널로 연결
- VibeVoice
  - 생성 갤러리/폴더 입력으로 train/validation JSONL과 dataset root를 프로젝트 폴더에 생성
  - 결과는 TTS Fine-tune 또는 ASR Fine-tune의 준비된 데이터셋 선택 패널로 연결
- Applio/RVC
  - 생성 갤러리 WAV 여러 개 또는 같은 화자의 WAV 폴더를 프로젝트 데이터셋으로 정리
  - 결과는 RVC 학습 탭의 준비된 데이터셋 선택 패널로 연결
- ACE-Step
  - 음악 오디오/캡션 데이터셋을 만들거나 prepared tensor를 가져옴
  - 결과는 ACE-Step LoRA/LoKr 학습 탭의 준비된 데이터셋 선택 패널로 연결
- MMAudio
  - 효과음/오디오 샘플을 프로젝트 데이터셋 manifest로 정리
  - 결과는 MMAudio full/continued training 탭의 준비된 데이터셋 선택 패널로 연결

이 구조의 목표는 하나의 범용 폼으로 모든 모델을 억지로 처리하지 않는 것입니다.
사용자는 “지금 만들 데이터셋이 어떤 모델 학습으로 이어지는지”를 탭 이름과 입력 필드만 보고 알 수 있어야 합니다.
학습 탭은 데이터 경로를 다시 묻지 않고, 이미 프로젝트 폴더에 저장된 데이터셋을 선택만 하게 둡니다.

운영 자산은 삭제뿐 아니라 다운로드도 가능해야 합니다. `나의 목소리들`의 훈련 모델,
Qwen 프리셋, S2-Pro 프리셋, RVC 모델, Qwen/외부 엔진 데이터셋은 모두 zip으로
내보내서 다른 환경에서 재현하거나 백업할 수 있게 유지합니다.

### 10. ACE-Step 작곡

- Qwen / S2-Pro / Applio와 다른 음악 생성 제품군
- `Style prompt`, `Lyrics`, `Duration`, `Guidance`, `Seed`를 기준으로 완성형 음악을 생성
- 메인 FastAPI 서버 안에 모델을 직접 import하지 않고 `scripts/run_ace_step_generate.py`를 별도 프로세스로 실행
- 기본 checkout은 `vendor/ACE-Step`, 전용 venv는 `.venv-ace-step`, checkpoint/cache는 `data/models/ace-step`
- 결과는 다른 생성물과 동일하게 `생성 갤러리`에서 관리

## 현재 우선 과제

### 1. VoiceBox 설계

이 프로젝트 안에서는 `speaker_encoder`를 포함한 self-contained `CustomVoice` 계열을
임시 제품/모델 명칭으로 `VoiceBox`라고 부릅니다.

의미:

- 출발점은 `CustomVoice`
- 여기에 `Base 1.7B`의 `speaker_encoder`를 포함시켜
- 단일 체크포인트만으로 추가 fine-tuning과 확장 실험이 가능한 형태

즉 `VoiceBox`는 “Base와 CustomVoice를 그냥 합친 새 범용 모델”이 아니라,
현재 `CustomVoice` 경로를 유지하면서도 학습 자립성을 갖춘 self-contained 확장형을 가리키는 작업명입니다.

현재 단계에서는 `VoiceBox`를 내부 설계와 문서에서 명확히 쓰고,
WEB UI에서는 사용자가 혼동하지 않도록 “speaker encoder 포함 모델”이라는 설명과 함께 노출하는 방향입니다.

현재 검증된 VoiceBox 산출물:

- `data/finetune-runs/mai_ko_voicebox17b_full/final`
- `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`

두 번째 체크포인트는 `VoiceBox -> VoiceBox` 1 epoch 추가 학습까지 끝난 결과입니다.

### 2. CustomVoice self-contained checkpoint

가장 큰 구조 과제였던 “speaker encoder를 포함한 self-contained checkpoint”는
현재 `VoiceBox` 전용 경로로 재현 가능하게 분리되어 있습니다.

현재는 `CustomVoice Fine-Tune` 시 `Base 1.7B`의 `speaker_encoder`를 보조로 빌려 쓰고 있습니다.

현재 결론:

- plain `CustomVoice`는 여전히 `speaker_encoder`를 포함하지 않는 결과로 유지할 수 있다
- `VoiceBox` 변환 단계에서 `Base 1.7B`의 `speaker_encoder`를 합친다
- `VoiceBox -> VoiceBox` 추가 학습은 외부 `speaker_encoder_model_path` 없이 가능하다

최종 목표:

- fine-tuned `CustomVoice` 결과물 자체가 `speaker_encoder`를 포함한다
- 결과 체크포인트 하나만으로 다시 추가 fine-tuning이 가능하다
- 이 self-contained 결과물을 내부적으로 `VoiceBox` 계열로 분류한다

구체적 구현 기획:

1. 저장 포맷 바꾸기

- 현재 `CustomVoice Fine-Tune` 결과 저장 시 제거되는 `speaker_encoder.*` 가중치를 유지한다
- 최종 `model.safetensors` 안에 아래가 함께 들어가게 한다
  - `talker.*`
  - `thinker.*`
  - `speech_tokenizer.*`가 아닌 현재 저장 대상
  - `speaker_encoder.*`
- 즉 결과물을 “추론 전용 축약본”이 아니라 “재학습 가능한 전체 체크포인트”로 저장한다

2. `Base 1.7B` speaker encoder 고정

- `CustomVoice 1.7B`를 self-contained로 만들 때 가져오는 기본 encoder 소스는 `Base 1.7B`로 고정한다
- `0.6B` encoder를 `1.7B` 계열에 섞지 않는다
- 차후 `0.6B` 실험을 별도로 열기 전까지 현재 기획 범위는 `1.7B -> 1.7B` 조합만 대상으로 한다

3. 로더 경로 바꾸기

- `CustomVoice` 체크포인트를 열 때 `speaker_encoder`가 있으면 우선 그 가중치를 로드한다
- 없을 때만 기존 fallback 경로를 쓴다
  - 예: `speaker_encoder_model_path`
- 목표는 새 체크포인트는 self-contained로 열리고, 예전 체크포인트도 깨지지 않게 하는 것이다

4. 학습 스크립트 분리 유지

- 기존 upstream `sft_12hz.py`는 비교/호환용으로 남기고, 실제 데모 학습은 `qwen_extensions`의 별도 스크립트에서 책임진다
- 즉 upstream 기본 흐름과 데모 확장을 계속 분리한다
- 관련 주체:
  - `qwen_extensions/finetuning/sft_base_12hz.py`
  - `qwen_extensions/finetuning/sft_custom_voice_12hz.py`
  - `qwen_extensions/finetuning/sft_voicebox_12hz.py`
  - `qwen_extensions/finetuning/voicebox_training_common.py`
  - `scripts/live_training_step_smoke.py`

5. 학습 스텝 검증 방식

- 풀 트레이닝을 매번 반복하지 않는다
- `scripts/live_training_step_smoke.py`로 Base, CustomVoice, VoiceBox가 실제 `Epoch 0 | Step 0 | Loss`까지 내려오는지 먼저 확인한다
- 성공하면 프로세스 그룹을 중단하고 `data/training-smoke` 임시 산출물을 삭제한다
- 품질 검증은 별도의 full run과 청취/지표 비교에서 수행한다

6. 체크포인트 메타데이터 보강

- 결과 `config.json` 또는 부가 메타에서 아래를 명시한다
  - `tts_model_type = "custom_voice"`
  - `speaker_encoder_included = true`
  - `demo_model_family = "voicebox"`
  - 새로 추가된 `speaker_name`
  - 이 체크포인트가 self-contained인지 여부
- 나중에 UI와 백엔드가 “외부 speaker encoder가 더 필요한 모델인지” 바로 판단할 수 있게 한다

7. 호환 전략

- 기존 배포 `CustomVoice` 체크포인트는 여전히 `speaker_encoder`가 없을 수 있다
- 따라서 로딩 우선순위는 아래처럼 둔다
  1. 체크포인트 내부 `speaker_encoder`
  2. 외부 `speaker_encoder_model_path`
  3. 둘 다 없으면 명시적 에러
- 이 순서를 문서와 코드 둘 다에서 일관되게 유지한다

8. 검증 단계

- 1차: 체크포인트 저장 후 `state_dict` 안에 `speaker_encoder.*` 키가 실제로 들어 있는지 확인
- 2차: 외부 `speaker_encoder_model_path` 없이 같은 체크포인트로 재로딩 확인
- 3차: 그 체크포인트만으로 `CustomVoice Fine-Tune` 추가 1 epoch smoke run 확인
- 4차: 학습 후 추론이 기존 self-contained가 아닌 체크포인트보다 깨지지 않는지 확인
- 5차: 문서화와 UI 라벨까지 반영

현재 완료된 검증:

- `speaker_encoder.*` 텐서 포함 확인: 완료
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습: 완료
- `mai` speaker id 유지: 완료
- 일반 instruct 추론: 완료
- low-level clone 생성: 완료
- low-level clone + instruct 생성: 완료
- Qwen3-ASR 전사와 speaker similarity 자동 검수: 완료
- 2026-05-02 Base / CustomVoice / VoiceBox 학습 step smoke: 완료
- 2026-05-02 S2-Pro / Applio / MMAudio / ACE-Step / VibeVoice 훈련 CLI smoke: 완료
- 2026-05-02 S2-Pro / VibeVoice / Applio-RVC / MMAudio / ACE-Step backend training endpoint smoke: 완료
- 2026-05-02 frontend production build, backend compile, dependency check, non-heavy live HTTP E2E, full heavy live HTTP E2E: 완료

8. 완료 기준

- `CustomVoice` FT 체크포인트 하나만 있으면 다시 학습 가능하다
- `speaker_encoder_model_path`가 필수가 아니다
- 기존 non-self-contained 체크포인트도 계속 로딩 가능하다
- 백엔드와 문서가 이 차이를 사용자에게 숨기거나 혼란스럽게 만들지 않는다
- 내부적으로 `VoiceBox` 계열로 식별 가능한 메타데이터가 있다

예상 리스크:

- 저장 용량 증가
- 로딩 시 shape mismatch 가능성
- 기존 체크포인트와 새 체크포인트를 섞어 쓸 때 분기 복잡도 증가
- 업스트림 업데이트를 따라갈 때 self-contained 저장 규칙을 별도 유지해야 함

이 과제는 단순 리팩터링이 아니라, `CustomVoice`를 “실험용 학습 산출물”에서 “독립적으로 이어서 키울 수 있는 모델 형식”으로 올리는 작업으로 본다.

현재 세부 결과는 [cookbook/18-current-experiment-results.md](./cookbook/18-current-experiment-results.md)를 기준으로 본다.

### 2. FlashAttention 2 운영 유지

Linux + CUDA 기준 `flash_attention_2`를 우선 경로로 유지합니다.

원칙:

- Linux + CUDA: `flash_attention_2`
- macOS / CPU / 미지원 환경: `sdpa`

현재 검증된 설치 경로는 prebuilt Linux wheel입니다. WSL에서 source build로 `nvcc`/`ninja`를 오래 돌리는 경로는
시스템 정지 위험이 크므로 기본 절차로 삼지 않습니다.

### 3. Optimizer 운영

1.7B full fine-tuning에서 optimizer state 메모리가 WSL/GPU 안정성에 직접 영향을 줍니다.

현재 정책:

- 기본 구현은 `AdamW`를 유지한다
- full run이 16GB GPU에서 불안정하면 `QWEN_DEMO_OPTIMIZER=adafactor`를 사용한다
- optimizer 선택은 품질 판정이 아니라 학습 안정성 기록으로 문서에 남긴다
- 품질은 생성 wav, Qwen3-ASR 전사, speaker similarity, 실제 청취로 판단한다

### 4. 프런트 visual polish

정보 구조는 거의 잡혔지만, 시각 완성도는 계속 다듬어야 합니다.

남은 포인트:

- 더 살아 있는 motion
- 덜 박스형인 레이아웃
- 메인 액션이 먼저 보이는 정보 밀도

## 현재 범위 안에 포함되는 것

- React + TypeScript 프런트엔드
- FastAPI 백엔드
- stock `CustomVoice`, `Base`, `VoiceDesign`
- clone prompt / preset 저장과 재사용
- `Base` / `CustomVoice` fine-tuning 실행
- `Applio / RVC` 모델 학습, 단일 변환, 배치 변환, 모델 블렌딩
- `MMAudio` sound effects
- `audio-separator` 기반 Stem Separator 오디오 분리
- 품질 검수 스크립트와 보고서
- VoiceBox 변환 / 재학습 / clone / clone + instruct 실험
- 개인 Hugging Face 자산 mirror 준비

## 현재 범위에서 제외되는 것

- 다중 사용자 인증
- 분산 작업 큐
- 실시간 스트리밍 TTS
- 프로덕션 배포 구조
- 멀티 스피커 fine-tuning

## 품질 검수 원칙

현재 구조에서 품질 검수는 아래 질문에 답해야 합니다.

1. dataset 음색이 실제로 반영되는가
2. instruct를 실제로 따르는가
3. stock보다 나아졌는가, 아니면 최소한 유지되는가
4. 프리셋 기반 생성에서 스타일과 instruct가 같이 유지되는가

이 검수는 문서와 스크립트 기준으로 반복 가능해야 합니다.

현재 추가된 검수 스크립트:

- `scripts/evaluate_customvoice_voicebox_quality.py`
- `qwen_extensions/inference/voicebox/clone.py`
- `qwen_extensions/inference/voicebox/clone_instruct.py`

현재 기준 대표 결과:

- plain CustomVoice mean speaker similarity: `0.9693`
- VoiceBox mean speaker similarity: `0.9630`
- VoiceBox clone+instruct `embedded_encoder_only`: target text similarity `1.000`

## 저장 구조 원칙

### dataset

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

### 사용자 결과

- `data/generated`
- `data/audio-tools`
- `data/clone-prompts`
- `data/presets`
- `data/finetune-runs`

### 모델 자산

- `data/models`
- `data/rvc-models`

## 다음에 계속 볼 문서

- 루트 TODO: [../TODO.md](../TODO.md)
- 설치 및 실행: [cookbook/01-install-and-run.md](./cookbook/01-install-and-run.md)
- 프런트 구조: [cookbook/03-frontend-guide.md](./cookbook/03-frontend-guide.md)
- 백엔드 구조: [cookbook/02-backend-guide.md](./cookbook/02-backend-guide.md)
- 프리셋 + instruct: [cookbook/12-preset-plus-instruct.md](./cookbook/12-preset-plus-instruct.md)
- CustomVoice 파인튜닝: [cookbook/13-customvoice-finetuning.md](./cookbook/13-customvoice-finetuning.md)
- 현재 실험 결과: [cookbook/18-current-experiment-results.md](./cookbook/18-current-experiment-results.md)
- 스크립트 진입점 정리: [cookbook/19-script-entrypoints.md](./cookbook/19-script-entrypoints.md)
