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
python Qwen3-TTS/inference/voicebox/clone.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --ref-audio data/datasets/mai_ko_full/audio/00002.wav \
  --ref-text "음, 훌륭해. 너희의 결심과 노력이 보여" \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --language Korean \
  --speaker mai \
  --output-dir data/generated/voicebox-clone-tests/manual-clone \
  --strategies embedded_encoder_only embedded_encoder_with_ref_code
```

```bash
python Qwen3-TTS/inference/voicebox/clone_instruct.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --ref-audio data/datasets/mai_ko_full/audio/00002.wav \
  --ref-text "음, 훌륭해. 너희의 결심과 노력이 보여" \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --language Korean \
  --speaker mai \
  --instruct "Soft breathy Korean female voice, exhausted and close to the microphone, but keep the sentence clear." \
  --output-dir data/generated/voicebox-clone-tests/manual-clone-instruct \
  --strategies embedded_encoder_only embedded_encoder_with_ref_code
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

- `embedded_encoder_only`는 현재 가장 안정적인 clone+instruct 후보입니다.
- `embedded_encoder_with_ref_code`는 참조 codec 흐름까지 넣어 clone 느낌을 더 강하게 줄 수 있지만,
  aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.
- 따라서 제품화 기본값은 `embedded_encoder_only`를 먼저 검토합니다.

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
