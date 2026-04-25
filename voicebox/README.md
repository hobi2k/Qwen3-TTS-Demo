# VoiceBox Scripts

이 폴더는 `VoiceBox` 전용 엔트리포인트를 모아 둔 작업 디렉터리입니다.

핵심 원칙:

- 기존 `scripts/`와 `Qwen3-TTS` 안의 기존 경로는 그대로 유지합니다.
- 이 폴더는 `VoiceBox` 관련 작업을 **세 단계**로 재현 가능하게 분리해 둔 전용 진입점 모음입니다.
- 공통 런타임 로직은 이 폴더 안의 `runtime.py`와 `clone_low_level.py`에 둡니다.
- 새 VoiceBox 기능 수정은 이 폴더의 canonical script에 먼저 반영합니다.
- `scripts/qwen3_tts_voicebox_*.py` 파일들은 오래된 명령 호환용 래퍼입니다.

중복 스크립트 정리는 [docs/cookbook/19-script-entrypoints.md](../docs/cookbook/19-script-entrypoints.md)에 별도로 기록되어 있습니다.

## 세 단계

### 1. plain `CustomVoice`에 새 화자 추가 후 파인튜닝

목적:
- `mai` 같은 새 화자를 먼저 plain `CustomVoice`에 안정적으로 추가합니다.
- 이 단계의 결과는 아직 `VoiceBox`가 아닙니다.
- 학습 중에는 외부 `Base 1.7B`의 `speaker_encoder`를 빌려 씁니다.

스크립트:
- `sft_plain_custom_voice_12hz.py`
- `train_customvoice.py` (호환 래퍼)

### 2. 파인튜닝된 `CustomVoice`를 self-contained `VoiceBox`로 변환

목적:
- 1단계 결과에 `Base 1.7B`의 `speaker_encoder`를 합쳐
  self-contained 체크포인트를 만듭니다.
- 이 단계에서 처음 `VoiceBox`가 만들어집니다.

스크립트:
- `make_checkpoint.py`

### 3. `VoiceBox -> VoiceBox` 추가 학습

목적:
- 이제 외부 `Base` 경로 없이 `VoiceBox`만으로 다시 학습합니다.
- `speaker_encoder`도 계속 checkpoint 안에 유지됩니다.

스크립트:
- `sft_voicebox_12hz.py`
- `retrain.py` (호환 래퍼)

## 보조 스크립트

- `sft_voicebox_bootstrap_12hz.py`
  - 1단계와 2단계를 한 번에 처리하는 독립 보조 경로입니다.
- `bootstrap.py`
  - 위 스크립트의 호환 래퍼입니다.
  - 현재 권장 주 경로는 아닙니다. 재현성과 디버깅을 위해 1→2→3 순서를 우선합니다.
- `infer_instruct.py`
  - `VoiceBox`를 일반 `CustomVoice`처럼 불러 `speaker + instruct` 추론을 실행합니다.
- `clone.py`
  - embedded `speaker_encoder`를 쓰는 clone 실험 진입점입니다.
- `clone_instruct.py`
  - embedded `speaker_encoder`를 쓰는 clone + instruct 실험 진입점입니다.
- `upload_to_hub.py`
  - `VoiceBox` 체크포인트를 허깅페이스 모델 저장소로 올립니다.

## 현재 검증된 산출물

- plain CustomVoice:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- VoiceBox 변환본:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- VoiceBox 1 epoch 추가 학습본:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`
- clone / clone + instruct 검수 결과:
  `data/generated/voicebox-clone-tests/20260425-extra1`

현재 안정적인 clone+instruct 후보는 `embedded_encoder_only`입니다.
`embedded_encoder_with_ref_code`는 참조 codec 흐름까지 넣는 방식이라 clone 느낌이 강해질 수 있지만,
aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.

## 권장 순서 예시

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo

# 1) plain CustomVoice에 mai 추가 학습
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
.venv/bin/python voicebox/sft_plain_custom_voice_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --speaker_encoder_model_path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output_model_path data/finetune-runs/mai_ko_customvoice17b_full \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 3 \
  --speaker_name mai

# 2) plain CustomVoice -> VoiceBox 변환
.venv/bin/python voicebox/make_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final

# 3) VoiceBox -> VoiceBox 추가 학습
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
.venv/bin/python voicebox/sft_voicebox_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output_model_path data/finetune-runs/mai_ko_voicebox17b_full_extra1 \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 1 \
  --speaker_name mai
```

## 품질 검수

plain CustomVoice와 VoiceBox를 비교하려면:

```bash
.venv/bin/python scripts/evaluate_customvoice_voicebox_quality.py \
  --plain-model data/finetune-runs/mai_ko_customvoice17b_full/final \
  --voicebox-model data/finetune-runs/mai_ko_voicebox17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --speaker mai \
  --language Korean
```

VoiceBox clone을 확인하려면:

```bash
.venv/bin/python voicebox/clone.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --ref-audio data/datasets/mai_ko_full/audio/00002.wav \
  --ref-text "음, 훌륭해. 너희의 결심과 노력이 보여" \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --language Korean \
  --speaker mai \
  --output-dir data/generated/voicebox-clone-tests/manual-clone \
  --strategies embedded_encoder_only embedded_encoder_with_ref_code
```
