# Speech Quality Validation Workflow

이 문서는 `Qwen3-TTS-Demo`에서 **음성 추론 품질을 실제로 검증하는 절차**를 설명합니다.

목표는 단순 smoke test가 아닙니다. 다음 세 가지를 한 번에 확인하는 것이 목적입니다.

- `Base` fine-tune 결과가 원래 clone 계열 품질을 크게 망가뜨리지 않는지
- `CustomVoice` fine-tune 결과가 instruct 입력에 따라 스타일이 달라지는지
- `clone prompt + instruct hybrid` 경로가 저장된 스타일 자산과 instruct 제어를 함께 살리는지
- `VoiceBox`가 embedded speaker encoder만으로 clone / clone + instruct 실험을 수행할 수 있는지

기본 instruct pack은 `aggressive`입니다. 이 pack은 감정 차이를 크게 벌려서,
CustomVoice와 hybrid의 instruct 준수 여부를 듣기로 판별하기 쉽게 만듭니다.

이 워크플로우는 **업스트림 `Qwen3-TTS` 코드를 수정하지 않습니다.**
대신 저장소 루트의 `scripts/`와 `docs/`만 사용해서 검증합니다.

## 1. 이 워크플로우가 확인하는 것

### Base FT

`Base` 계열 모델은 참조 음성 + 참조 텍스트를 바탕으로 clone 품질을 확인합니다.

검증 포인트:

- 같은 참조 음성에서 stock `Base`와 fine-tuned `Base`가 둘 다 정상적으로 합성되는지
- clone prompt를 한 번 저장한 뒤 그 prompt를 다시 재사용해도 결과가 나오는지
- fine-tuned `Base`가 텍스트를 크게 훼손하지 않는지

### CustomVoice FT

`CustomVoice` 계열 모델은 instruct에 따라 스타일이 바뀌는지 확인합니다.

검증 포인트:

- stock `CustomVoice`와 fine-tuned `CustomVoice`가 둘 다 합성되는지
- `neutral`, `angry`, `gentle`, `breathy` 같은 instruct 차이에 따라 출력이 달라지는지
- instruct를 바꾸어도 발화 내용이 크게 무너지지 않는지

### Hybrid clone + instruct

`clone prompt + instruct hybrid`는 참조 음성의 스타일을 다시 쓰면서, `CustomVoice` instruct도 함께 넣는 실험 경로입니다.

검증 포인트:

- clone prompt로 스타일 자산을 저장한 뒤 다시 쓸 수 있는지
- hybrid 경로에서 `Base` clone 성질과 `CustomVoice` instruct 성질이 동시에 유지되는지

### VoiceBox clone / clone + instruct

`VoiceBox`는 `CustomVoice`에 `Base 1.7B` speaker encoder를 포함한 self-contained 실험 경로입니다.

검증 포인트:

- 체크포인트 안에 `speaker_encoder.*`가 실제로 있는지
- 외부 `Base` 없이 참조 음성에서 embedding을 뽑는지
- clone 생성 결과가 무음이 아닌지
- clone+instruct에서 문장 내용이 유지되는지
- aggressive instruct에서도 문장 보존이 흔들리지 않는 전략이 무엇인지

## 1.1 Aggressive instruct pack

기본 `aggressive` pack은 아래 3개 문장을 사용합니다.

- `furious`: 폭발 직전의 분노, 날카롭고 거친 발화
- `shaken`: 분노와 공포가 동시에 올라오는, 숨이 가쁘고 떨리는 발화
- `cold`: 감정을 억누른 채 차갑고 단호하게 압박하는 발화

스크립트에서 해당 pack은 `--prompt-set aggressive`로 선택할 수 있습니다.

예시:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8190 \
  --suite customvoice \
  --prompt-set aggressive
```

## 2. 준비 조건

실행 전에 아래 조건이 맞아야 합니다.

- 루트 `.venv`가 준비되어 있어야 합니다.
- 백엔드가 실제 모델 모드로 실행 중이어야 합니다.
- `data/models/Qwen3-ASR-1.7B` 또는 `data/models/Qwen3-ASR-0.6B`가 준비되어 있어야 합니다.
- 기준 참조 음성은 로컬 파일 경로로 존재해야 합니다.

권장 순서:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
./scripts/setup_backend.sh
./scripts/download_models.sh
cd app/frontend
npm install
npm run build
cd app/backend
source ../../.venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8190
```

## 3. 실행 명령

가장 일반적인 실행은 아래와 같습니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8190 \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --probe-text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --suite all
```

### 전체 제품 표면 live E2E

`scripts/live_e2e_verify.py`는 백엔드를 임시 포트로 직접 띄운 뒤, 프론트 정적 shell과 실제 백엔드 API를 호출합니다.
`--include-heavy`를 붙이면 Qwen, S2-Pro, Applio/RVC, Stem Separator, ACE-Step, VibeVoice, MMAudio까지 실제 모델을 로드해 오디오 파일을 생성합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
./.venv/bin/python scripts/live_e2e_verify.py --include-heavy
```

검증 범위:

- 프론트 정적 shell
- `/api/health`, `/api/bootstrap`, `/api/models`
- 생성 갤러리와 오디오 자산 조회
- Qwen CustomVoice, VoiceDesign, VoiceClone 실제 생성
- Qwen clone prompt 생성, preset 생성, preset 기반 생성
- Qwen hybrid clone+instruct 실제 생성
- VoiceBox clone, VoiceBox clone+instruct 실제 생성
- Qwen3-ASR 참조 음성 전사
- S2-Pro local Fish Speech 실제 생성
- S2-Pro 목소리 저장, 저장 목소리 재사용 TTS, dialogue 생성
- Applio/RVC 단일 변환과 배치 변환
- Stem Separator 실제 분리
- ACE-Step 실제 음악 생성
- VibeVoice 실제 TTS 생성
- MMAudio 실제 효과음 생성
- 오디오 변환, 노이즈 제거, 편집

주의:

- 이 명령은 smoke test가 아니라 live E2E입니다. 여러 대형 모델을 순차 로드하므로 10분 이상 걸릴 수 있습니다.
- Qwen / S2-Pro / Applio / MMAudio / ACE-Step / VibeVoice가 실제 local runtime으로 동작하는지 확인합니다. API mock, fallback audio, simulation mode를 성공으로 처리하지 않습니다.
- 훈련 endpoint는 장시간/파괴적 작업이므로 이 E2E에서 자동 실행하지 않습니다. 대신 Qwen 학습 경로는 `scripts/live_training_step_smoke.py`로 실제 `Step/Loss`가 내려오는지 확인하고, 품질 검증은 별도 학습 로그와 산출 체크포인트 평가로 수행합니다.
- MMAudio는 모델 초기화와 생성이 특히 느릴 수 있어 E2E 스크립트에서 마지막에 실행합니다.
- 각 단계는 `[live-e2e] START/PASS/FAIL` 로그를 즉시 출력하므로, 멈춘 경우 어느 기능에서 걸렸는지 확인할 수 있습니다.
- 완료 후 스크립트가 임시 uvicorn 프로세스 그룹을 종료합니다. 종료 후 `nvidia-smi`에서 GPU 프로세스가 남아 있지 않아야 합니다.

### Fine-tuning 계열 검증 기준

Fine-tuning 기능은 생성 기능과 검증 방식이 다릅니다. 실제 학습은 수십 분에서 수 시간 걸리고 기존 체크포인트를 만들거나 덮어쓸 수 있으므로, live E2E 스크립트는 학습 버튼을 자동으로 누르지 않습니다. 대신 아래 세 층으로 확인합니다.

| 범위 | 확인 방법 | 현재 상태 |
| --- | --- | --- |
| Qwen dataset prepare | `qwen3_tts_prepare_data.py`와 `/api/datasets/{id}/prepare-for-training`가 같은 프로젝트 Python과 `qwen_extensions` 경로를 쓰는지 확인 | 정리됨 |
| Qwen Base / CustomVoice / VoiceBox 학습 | `qwen_extensions/finetuning/*` canonical script, `QWEN_DEMO_OPTIMIZER`, `QWEN_DEMO_TRAIN_PRECISION`, `QWEN_DEMO_GRAD_ACCUM_STEPS`로 실행 | MAI full run 결과 문서화됨. 2026-05-01 step smoke 통과 |
| VoiceBox fusion | `qwen_extensions/fusion/make_voicebox_checkpoint.py`로 speaker encoder 내장 여부 확인 | MAI VoiceBox 결과 문서화됨 |
| S2-Pro fine-tune | `/api/s2-pro/train`이 Fish Speech `text2semantic_finetune`와 LoRA merge를 호출 | training endpoint smoke PASS |
| Applio/RVC training | `/api/audio-tools/rvc-train`이 Applio preprocess/extract/train/index 순서로 실행 | training endpoint smoke PASS |
| MMAudio training | `/api/audio-tools/mmaudio-train`이 upstream `train.py` full/continued training을 호출 | training endpoint smoke PASS |
| ACE-Step LoRA/LoKr | `/api/music/ace-step/train-adapter`가 preprocess 후 upstream `train.py fixed/vanilla`를 호출 | training endpoint smoke PASS |
| VibeVoice training | `/api/vibevoice/train`이 ASR LoRA 또는 TTS trainer/template를 호출 | training endpoint smoke PASS |

학습 기능을 실제로 끝까지 검증할 때는 한 번에 하나만 실행합니다. 동시에 여러 학습을 돌리면 VRAM 피크, CUDA allocator, subprocess cache가 겹쳐 WSL 안정성이 떨어질 수 있습니다.

### 외부 엔진 훈련 스모크

Qwen 외 모델도 아래 명령으로 실제 backend training endpoint를 호출합니다. 이 검증은 help 출력이 아니라 tiny fixture로 학습 루프에 진입하고, 가능한 경우 체크포인트/adapter 산출까지 확인합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
./.venv/bin/python scripts/live_external_training_smoke.py --engines s2pro vibevoice applio mmaudio ace-step
```

2026-05-02 순차 실행 결과:

| 엔진 | 결과 로그 |
| --- | --- |
| S2-Pro | `data/audio-tools/s2_pro_training/s2train_05b38f7348c3/train.log` |
| VibeVoice | `data/audio-tools/vibevoice_training/2026-05-01/vibevoice_train_285e857178fc_smoke_vibevoice/train.log` |
| Applio/RVC | `vendor/Applio/logs/smoke_external_rvc/smoke_external_rvc_1e_12s.pth` |
| MMAudio | `data/audio-tools/mmaudio_training/mmtrain_3995af8d5d6b/train.log` |
| ACE-Step | `data/audio-tools/ace_step_training/ace_train_8714b0a50e2a/train.log` |

### Qwen 학습 스텝 스모크

풀 트레이닝을 기다리기 전에 아래 명령으로 학습 루프가 실제로 첫 스텝까지 내려오는지 확인합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python scripts/live_training_step_smoke.py
```

동작 방식:

- `data/datasets/mai_ko_subsets/prepared_4.jsonl`을 사용합니다.
- Base 1.7B, CustomVoice 1.7B, VoiceBox 1.7B를 순서대로 하나씩 실행합니다.
- `Epoch 0 | Step 0 | Loss: ...`가 찍히면 해당 프로세스 그룹을 중단합니다.
- 임시 출력은 `data/training-smoke`에만 생성하고 검증 후 삭제합니다.
- WSL/GPU 안정성을 위해 동시에 여러 학습을 실행하지 않습니다.

2026-05-01 확인 결과:

| 경로 | 확인 로그 |
| --- | --- |
| Base 1.7B | `Epoch 0 | Step 0 | Loss: 14.1813` |
| CustomVoice 1.7B | `Epoch 0 | Step 0 | Loss: 12.5594` |
| VoiceBox 1.7B | `Epoch 0 | Step 0 | Loss: 7.1637` |

`accelerate`는 PyPI 최신 `1.13.0`도 스텝 진입은 통과했지만, `qwen-asr`와 `qwen-tts` 패키지가 `accelerate==1.12.0`을 요구하므로 프로젝트 환경은 `1.12.0`을 유지합니다. `project_dir`를 명시해 최신 계열의 logging 요구사항에도 맞도록 코드가 정리되어 있습니다.

2026-05-02 재검증:

- `scripts/live_training_step_smoke.py --timeout-seconds 900` 기준 Base / CustomVoice / VoiceBox 모두 `Step 0`까지 진입했습니다.
- `npm run build`로 Next.js production build를 확인했습니다.
- `python -m pip check` 결과 broken requirement가 없습니다.
- `scripts/live_e2e_verify.py --port 8199` non-heavy HTTP E2E가 통과했습니다.
- Qwen 생성 직후 ACE-Step을 실행하면 CUDA unknown error가 나던 경로를 재현했고, non-Qwen 대형 엔진 실행 전에 Qwen/ASR cache를 명시적으로 해제하도록 수정한 뒤 같은 순서의 Qwen -> ACE-Step 생성이 통과했습니다.
- `scripts/live_e2e_verify.py --include-heavy --port 8202` full heavy HTTP E2E가 통과했습니다. 이 run에서 Qwen -> ACE-Step -> S2-Pro -> Applio/RVC -> Stem Separator -> VibeVoice -> MMAudio 순차 생성이 모두 성공했습니다.

외부 훈련 진입점 smoke:

| 엔진 | 확인 명령 | 결과 |
| --- | --- | --- |
| Fish Speech S2-Pro | `vendor/fish-speech/fish_speech/train.py --config-name text2semantic_finetune --help` | PASS |
| Applio/RVC | `vendor/Applio/core.py train --help` | PASS |
| ACE-Step | `vendor/ACE-Step/train.py --help` | PASS |
| VibeVoice | `vendor/VibeVoice -m vibevoice.finetune.train_vibevoice --help` | PASS |
| MMAudio | `vendor/MMAudio/train.py --help` | PASS |

MMAudio는 torch/torchaudio cu130에서 `torio`가 빠진 점 때문에 비디오 평가/추출 도구를 lazy import로 바꿨습니다. 사운드 효과 생성과 pre-extracted feature 기반 학습 진입점은 유지되고, raw video 평가/추출을 실제로 사용할 때만 `torio` 호환 빌드 또는 별도 video I/O 환경이 필요하다는 명확한 오류를 냅니다.

### plain CustomVoice vs VoiceBox 비교

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
python scripts/evaluate_customvoice_voicebox_quality.py \
  --plain-model data/finetune-runs/mai_ko_customvoice17b_full/final \
  --voicebox-model data/finetune-runs/mai_ko_voicebox17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --speaker mai \
  --language Korean \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?"
```

### VoiceBox clone / clone + instruct

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
python qwen_extensions/inference/voicebox/clone.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --ref-audio data/datasets/mai_ko_full/audio/00002.wav \
  --ref-text "음, 훌륭해. 너희의 결심과 노력이 보여" \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --language Korean \
  --speaker mai \
  --output-dir data/generated/voicebox-clone-tests/manual-clone \
  --strategies speaker_anchor_with_ref_code embedded_encoder_only embedded_encoder_with_ref_code
```

```bash
python qwen_extensions/inference/voicebox/clone_instruct.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --ref-audio data/datasets/mai_ko_full/audio/00002.wav \
  --ref-text "음, 훌륭해. 너희의 결심과 노력이 보여" \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --language Korean \
  --speaker mai \
  --instruct "Soft breathy Korean female voice, exhausted and close to the microphone, but keep the sentence clear." \
  --output-dir data/generated/voicebox-clone-tests/manual-clone-instruct \
  --strategies speaker_anchor_with_ref_code embedded_encoder_only embedded_encoder_with_ref_code
```

### 자동 선택을 믿지 않고 명시적으로 고정하고 싶다면

모델이 여러 개 남아 있거나, 특정 체크포인트만 보고 싶다면 `model_id`를 직접 넘길 수 있습니다.

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8190 \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --base-model-id /path/to/Qwen3-TTS-12Hz-1.7B-Base \
  --base-ft-model-id /path/to/finetuned/base/checkpoint-epoch-0 \
  --customvoice-model-id /path/to/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --customvoice-ft-model-id /path/to/finetuned/customvoice/checkpoint-epoch-0 \
  --hybrid-base-model-id /path/to/Qwen3-TTS-12Hz-1.7B-Base \
  --hybrid-custom-model-id /path/to/finetuned/customvoice/checkpoint-epoch-0
```

## 4. 출력물 구조

스크립트는 매번 타임스탬프가 들어간 새 디렉터리를 만듭니다.

예시:

```text
data/generated/quality-validation/20260412-153000/
  report.json
  report.md
  reference/
    reference.json
    00000.wav
  base/
    stock-direct/
    stock-clone-prompt/
    ft-direct/
  customvoice/
    stock-neutral/
    stock-angry/
    stock-gentle/
    stock-breathy/
    ft-neutral/
    ft-angry/
    ft-gentle/
    ft-breathy/
  hybrid/
    neutral/
    angry/
    gentle/
    breathy/
```

### `report.json`

기계 판독용 요약입니다.

- backend health
- reference audio / probe text
- 각 샘플의 transcript
- `transcript_similarity`
- `duration_sec`
- `rms`
- `spectral_centroid`
- `zcr`
- `content_ok`

### `report.md`

사람이 바로 읽고 듣기 위한 요약입니다.

- 어느 모델을 썼는지
- 어떤 prompt를 넣었는지
- 어떤 결과 wav가 만들어졌는지
- 자동 점수는 어땠는지

`report.md`는 각 suite별로 결과를 표로 정리하므로, 생성된 WAV를 순서대로 들어 보면서
`furious -> shaken -> cold` 순으로 감정이 실제로 갈라지는지 확인할 수 있습니다.

## 5. 자동 점수 해석

스크립트는 각 샘플에 대해 아주 느슨한 자동 점수를 계산합니다.

- `transcript_similarity`
- `duration_sec`
- `rms`
- `spectral_centroid`
- `zcr`
- `content_ok`

여기서 중요한 점은 `content_ok`가 **최종 품질 판정이 아니라는 것**입니다.

이 값은 다음 정도만 봅니다.

- 텍스트가 거의 망가지지 않았는가
- 출력이 너무 짧거나 비정상적으로 끊기지 않았는가

즉 자동 점수는 “재생해 볼 가치가 있는가”를 고르는 정도로만 보세요.
실제 품질 판정은 반드시 WAV를 들어서 해야 합니다.

## 6. 어떤 결과를 기대해야 하나

### Base FT

- stock `Base`와 fine-tuned `Base`가 둘 다 자연스럽게 나온다
- clone prompt를 재사용해도 동일한 스타일 자산이 유지된다
- 내용이 심하게 틀어지지 않는다

### CustomVoice FT

- `furious`, `shaken`, `cold` 사이의 느낌 차이가 들린다
- instruct를 바꿔도 문장 내용은 유지된다
- fine-tuned 결과가 stock보다 더 목적에 맞게 보정되어 있다

### Hybrid

- 참조 음성 스타일이 유지된다
- instruct 제어도 들린다
- clone prompt + instruct를 함께 썼을 때 결과가 아예 무너지지 않는다

### VoiceBox

- `speaker_anchor_with_ref_code`는 현재 제품 기본 clone+instruct 후보입니다.
- `embedded_encoder_only`는 과거 안정 비교군으로 유지합니다.
- `embedded_encoder_with_ref_code`는 참조 codec 흐름까지 넣어 clone 느낌을 더 강하게 줄 수 있지만,
  aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.
- 따라서 제품화 기본값은 `speaker_anchor_with_ref_code`를 먼저 검토합니다.

## 7. 청취 평가 순서

결과가 생성되면 아래 순서로 듣는 것을 권장합니다.

1. `report.md`를 열고 suite별 표를 본다.
2. `customvoice`의 `furious`, `shaken`, `cold`를 연속해서 듣는다.
3. 같은 순서로 `hybrid`를 듣고, 스타일이 clone prompt 쪽으로 고정되는지 확인한다.
4. transcript가 너무 틀어진 샘플이 있으면 `report.json`의 `transcript_similarity`를 확인한다.
5. 최종 평가는 자동 점수보다 실제 청취를 우선한다.

## 8. 실패했을 때 보는 순서

1. `GET /api/health`가 `runtime_mode=real`인지 확인합니다.
2. `GET /api/models` 또는 `GET /api/bootstrap`에서 원하는 stock / fine-tuned 모델이 보이는지 확인합니다.
3. `data/models/Qwen3-ASR-1.7B` 또는 `data/models/Qwen3-ASR-0.6B`가 준비되어 있는지 확인합니다.
4. 참조 음성 경로가 실제 파일인지 확인합니다.
5. 특정 체크포인트만 점검하고 싶다면 `--base-ft-model-id`, `--customvoice-ft-model-id` 같은 명시적 인자를 사용합니다.

## 9. 이 워크플로우의 역할

이 검증 스크립트는 훈련이 "돌아갔다"를 확인하는 도구가 아닙니다.
이 스크립트는 다음 질문에 답하기 위한 도구입니다.

- 학습된 모델이 정말 들을 만한 소리를 내는가
- instruct 입력이 실제로 반영되는가
- 저장된 clone prompt를 다시 써도 스타일이 유지되는가
- hybrid 경로가 품질을 망치지 않는가
- VoiceBox가 self-contained clone / clone+instruct 경로로 실제 쓸 수 있는가

이 질문에 대해 자신 있게 답할 수 있을 때만 다음 단계로 넘어가야 합니다.

현재 검증 결과는 [18-current-experiment-results.md](./18-current-experiment-results.md)에 기록합니다.
