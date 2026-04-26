# Current Experiment Results

이 문서는 현재 로컬 저장소에서 실제로 끝낸 실험 결과를 한곳에 모아 둡니다.

목적은 “어떤 기능이 된다고 주장하는가”가 아니라, 다음 사람이 같은 체크포인트와
같은 명령으로 다시 확인할 수 있게 하는 것입니다.

## 1. 기준 데이터셋

현재 MAI 한국어 학습은 아래 cleaned prepared JSONL을 기준으로 합니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

정리 결과:

- 원본: `1042` rows
- 유지: `727` rows
- 제외: `315` rows

제외 기준:

- 너무 짧거나 긴 샘플
- `{NICKNAME}` 같은 placeholder 포함 샘플
- 대괄호/중괄호 등 특수 제어 문자열 포함 샘플
- 현재 학습 텍스트로 부적합한 특수 문자 포함 샘플

manifest:

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s_manifest.json
```

## 2. plain CustomVoice fine-tuning

최종 체크포인트:

```text
data/finetune-runs/mai_ko_customvoice17b_full/final
```

검증된 메타데이터:

- `tts_model_type = custom_voice`
- `mai` speaker id: `3067`
- `speaker_encoder.*` 텐서 없음
- tensor count: `404`

해석:

- 이 결과는 plain `CustomVoice` fine-tuned checkpoint입니다.
- 학습 중에는 `Base 1.7B`의 `speaker_encoder`를 보조로 사용했습니다.
- 결과 체크포인트 자체는 아직 self-contained VoiceBox가 아닙니다.

## 3. VoiceBox 변환

변환 명령:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python Qwen3-TTS/fusion/make_voicebox_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final
```

최종 체크포인트:

```text
data/finetune-runs/mai_ko_voicebox17b_full/final
```

검증된 메타데이터:

- `tts_model_type = custom_voice`
- `demo_model_family = voicebox`
- `speaker_encoder_included = true`
- `mai` speaker id: `3067`
- `speaker_encoder.*` 텐서 있음
- speaker encoder tensor count: `76`
- total tensor count: `480`

해석:

- 이 단계부터 체크포인트 하나만으로 speaker encoder를 포함합니다.
- 추론 호환성을 위해 `tts_model_type`은 여전히 `custom_voice`입니다.
- 데모 내부 분류는 `demo_model_family = voicebox`로 판단합니다.

## 4. VoiceBox 1 epoch 추가 학습

추가 학습 명령:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
QWEN_DEMO_OPTIMIZER=adafactor \
QWEN_DEMO_LOG_EVERY=25 \
QWEN_DEMO_GRAD_ACCUM_STEPS=1 \
.venv/bin/python -u Qwen3-TTS/finetuning/sft_voicebox_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output_model_path data/finetune-runs/mai_ko_voicebox17b_full_extra1 \
  --batch_size 1 \
  --lr 2e-6 \
  --num_epochs 1 \
  --speaker_name mai
```

최종 체크포인트:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

검증된 메타데이터:

- `tts_model_type = custom_voice`
- `demo_model_family = voicebox`
- `speaker_encoder_included = true`
- `mai` speaker id: `3067`
- speaker encoder tensor count: `76`
- total tensor count: `480`

훈련 로그:

- dataset rows: `727`
- epoch: `1`
- 마지막 확인 step: `725`
- WSL/GPU 튕김 없이 완료

## 5. plain CustomVoice vs VoiceBox 품질 비교

평가 스크립트:

```text
scripts/evaluate_customvoice_voicebox_quality.py
```

평가 명령:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
.venv/bin/python -u scripts/evaluate_customvoice_voicebox_quality.py \
  --plain-model data/finetune-runs/mai_ko_customvoice17b_full/final \
  --voicebox-model data/finetune-runs/mai_ko_voicebox17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav \
  --speaker mai \
  --language Korean \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --output-root data/generated/plain-vs-voicebox-quality \
  --seed 42
```

대표 결과:

```text
data/generated/plain-vs-voicebox-quality/20260425-041354
```

자동 지표:

| variant | neutral speaker sim | mean speaker sim | duration range | rms range | centroid range |
| --- | ---: | ---: | ---: | ---: | ---: |
| plain_customvoice | 0.9679 | 0.9693 | 0.9600 | 0.033984 | 454.3639 |
| voicebox | 0.9652 | 0.9630 | 1.2800 | 0.010750 | 947.1604 |

Whisper large-v3 전사:

- plain CustomVoice: 4개 중 3개 target similarity `1.000`, neutral만 `0.947`
- VoiceBox: 4개 모두 target similarity `1.000`

해석:

- 둘 다 MAI 음색 반영은 speaker similarity 기준 높게 나왔습니다.
- plain CustomVoice가 평균 화자 유사도는 약간 높았습니다.
- VoiceBox는 문장 보존과 instruct별 음향 변화폭이 더 안정적으로 나왔습니다.

## 6. VoiceBox clone / clone + instruct 검증

기준 모델:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

참조 음성:

```text
data/datasets/mai_ko_full/audio/00002.wav
```

참조 텍스트:

```text
음, 훌륭해. 너희의 결심과 노력이 보여
```

대상 문장:

```text
오늘은 정말 힘들었어. 언제쯤 끝날까?
```

결과 위치:

```text
data/generated/voicebox-clone-tests/20260425-extra1
```

품질 검수 요약:

| case | strategy | speaker sim to ref | target text sim | duration | note |
| --- | --- | ---: | ---: | ---: | --- |
| clone | embedded_encoder_only | 0.9689 | 1.000 | 4.00s | stable |
| clone | embedded_encoder_with_ref_code | 0.9670 | 1.000 | 3.84s | stable |
| breathy clone+instruct | embedded_encoder_only | 0.9655 | 1.000 | 4.64s | stable |
| breathy clone+instruct | embedded_encoder_with_ref_code | 0.9688 | 1.000 | 3.84s | stable |
| angry clone+instruct | embedded_encoder_only | 0.9614 | 1.000 | 3.20s | stable |
| angry clone+instruct | embedded_encoder_with_ref_code | 0.9630 | 0.923 | 4.56s | one text error |

해석:

- `embedded_encoder_only`는 현재 VoiceBox clone+instruct 기본 후보입니다.
- `embedded_encoder_with_ref_code`는 참조 코드까지 넣으므로 clone 느낌이 강해질 수 있지만,
  공격적인 instruct에서 문장 보존이 흔들릴 수 있습니다.

## 7. Optimizer 변경 사항

VoiceBox / CustomVoice 계열 full fine-tuning에서는 optimizer를 환경 변수로 바꿀 수 있습니다.

```bash
QWEN_DEMO_OPTIMIZER=adamw
QWEN_DEMO_OPTIMIZER=adafactor
```

현재 MAI full run 기준 운영 선택:

- 기본 구현은 `AdamW`를 유지합니다.
- RTX 5080 16GB 환경의 1.7B full fine-tuning에서는 optimizer state 메모리 때문에
  `Adafactor`가 더 안정적이었습니다.
- 그래서 실제 MAI full CustomVoice / VoiceBox run은 `QWEN_DEMO_OPTIMIZER=adafactor`로 검증했습니다.

관련 환경 변수:

```bash
QWEN_DEMO_OPTIMIZER=adafactor
QWEN_DEMO_GRAD_ACCUM_STEPS=1
QWEN_DEMO_LOG_EVERY=25
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
```

주의:

- `Adafactor`는 품질을 자동으로 올리는 optimizer가 아닙니다.
- 목적은 16GB GPU에서 optimizer state 메모리를 줄여 학습을 끝까지 완료하는 것입니다.
- 최종 품질은 반드시 Whisper 전사, speaker similarity, 실제 청취로 다시 확인해야 합니다.

## 8. 현재 기준 결론

- plain `CustomVoice` fine-tuning은 완료되었습니다.
- plain `CustomVoice -> VoiceBox` 변환도 완료되었습니다.
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습도 완료되었습니다.
- 추가 학습된 VoiceBox는 `mai` 화자를 유지합니다.
- 추가 학습된 VoiceBox 하나만으로 low-level clone과 clone+instruct 생성이 가능합니다.
- 현재 안정 후보는 `embedded_encoder_only`입니다.

## 9. 관련 스크립트 정리

현재 실험에서 기준으로 삼는 구현은 `Qwen3-TTS` 안의 역할별 canonical script입니다.

- `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py`
- `Qwen3-TTS/fusion/make_voicebox_checkpoint.py`
- `Qwen3-TTS/finetuning/sft_voicebox_12hz.py`
- `Qwen3-TTS/inference/voicebox/clone.py`
- `Qwen3-TTS/inference/voicebox/clone_instruct.py`

예전 명령을 유지하기 위한 최상위 `voicebox/` 폴더와 `scripts/qwen3_tts_voicebox_*.py` 계열 래퍼는 제거했습니다.
재현 명령은 위 canonical script를 직접 호출합니다.

현재 유지되는 진입점 목록은 [19-script-entrypoints.md](./19-script-entrypoints.md)를 봅니다.
