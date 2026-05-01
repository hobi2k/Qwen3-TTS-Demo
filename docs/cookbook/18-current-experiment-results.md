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
.venv/bin/python qwen_extensions/fusion/make_voicebox_checkpoint.py \
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
.venv/bin/python -u qwen_extensions/finetuning/sft_voicebox_12hz.py \
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

Qwen3-ASR 전사:

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
- 최종 품질은 반드시 Qwen3-ASR 전사, speaker similarity, 실제 청취로 다시 확인해야 합니다.

## 8. 현재 기준 결론

- plain `CustomVoice` fine-tuning은 완료되었습니다.
- plain `CustomVoice -> VoiceBox` 변환도 완료되었습니다.
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습도 완료되었습니다.
- 추가 학습된 VoiceBox는 `mai` 화자를 유지합니다.
- 추가 학습된 VoiceBox 하나만으로 low-level clone과 clone+instruct 생성이 가능합니다.
- 현재 안정 후보는 `embedded_encoder_only`입니다.

Fine-tuning류 기능의 현재 검증 해석:

- Qwen CustomVoice/VoiceBox 계열은 실제 MAI full run 산출물과 품질 평가 스크립트 기준으로 검증했습니다.
- S2-Pro, Applio/RVC, MMAudio, ACE-Step, VibeVoice의 training endpoint는 실행 명령, 입력 검증, 로그/산출 경로가 구현되어 있습니다.
- 다만 2026-05-01 live E2E 자동 검증은 장시간/파괴적 학습을 시작하지 않았습니다. live E2E는 생성/변환/분리/저장/재사용 runtime을 검증하고, fine-tuning은 별도 단일 실행으로 검증하는 정책입니다.
- Qwen prepare/fine-tune subprocess는 더 이상 bare `python3`에 의존하지 않고, 기본적으로 백엔드와 같은 Python interpreter를 사용합니다.

## 9. 2026-05-01 live E2E 결과

검증 명령:

```bash
./.venv/bin/python scripts/live_e2e_verify.py --include-heavy
```

실행 환경:

- backend: 임시 uvicorn 서버
- runtime: `real`
- device: `cuda:0`
- attention: `flash_attention_2`
- ASR: `data/models/Qwen3-ASR-1.7B`

최종 재검증 결과:

- 실행 시각: 2026-05-01
- 결과: 전체 PASS
- backend: 임시 uvicorn 서버 `http://127.0.0.1:51991`
- catalog 상태: models 9, gallery 220, audio assets 220, clone prompts 6, presets 5, datasets 1, fine-tune runs 3, RVC models 1
- 완료 후 `nvidia-smi` 기준 GPU 프로세스 없음

통과한 항목:

| check | result |
| --- | --- |
| frontend static shell | PASS |
| backend health/bootstrap/model catalog/gallery/audio assets | PASS |
| Applio/RVC model catalog | PASS |
| S2-Pro capabilities/voices | PASS |
| ACE-Step runtime | PASS |
| VibeVoice runtime | PASS |
| audio converter / denoise / edit | PASS |
| Qwen CustomVoice generation | PASS |
| Qwen model-select generation | PASS |
| Qwen VoiceDesign generation | PASS |
| Qwen VoiceClone generation | PASS |
| Qwen clone prompt from upload | PASS |
| Qwen preset create / preset generate | PASS |
| Qwen hybrid clone+instruct | PASS |
| VoiceBox clone | PASS |
| VoiceBox clone+instruct | PASS |
| Qwen3-ASR transcription | PASS |
| S2-Pro local generation | PASS |
| S2-Pro save voice | PASS |
| S2-Pro saved voice TTS | PASS |
| S2-Pro dialogue | PASS |
| audio translation | PASS |
| Applio/RVC single conversion | PASS |
| Applio/RVC batch conversion | PASS |
| Stem Separator | PASS |
| ACE-Step generation | PASS |
| VibeVoice generation | PASS |
| MMAudio sound effect generation | PASS |

대표 산출물:

```text
data/generated/tts-custom/2026-05-01/e2e-qwen-custom_11.wav
data/generated/tts-custom/2026-05-01/e2e-qwen-model-select_5.wav
data/generated/voice-design/2026-05-01/e2e-qwen-design_11.wav
data/generated/voice-clone/2026-05-01/e2e-qwen-clone_10.wav
data/generated/hybrid-clone-instruct/2026-05-01/e2e-qwen-hybrid_5.wav
data/generated/voicebox_clone/2026-05-01/111025_e2e-voicebox-clone.wav
data/generated/voicebox_clone_instruct/2026-05-01/111035_e2e-voicebox-clone-instruct.wav
data/generated/s2-pro/2026-05-01/111156_e2e-s2pro.wav
data/generated/s2-pro/2026-05-01/112404_e2e-s2pro-saved-voice.wav
data/generated/s2-pro/2026-05-01/112737_e2e-s2pro-dialogue.wav
data/generated/voice-changer/2026-05-01/113139_voice-conversion.wav
data/generated/voice-changer/2026-05-01/113202_batch-voice-conversion-1.wav
data/generated/audio-separation/2026-05-01/113211_live_input_12s-stems/live_input_12s_(other)_vocals_mel_band_roformer.wav
data/generated/ace-step-music/2026-05-01/111053_e2e-ace-step.wav
data/generated/vibevoice-tts/2026-05-01/113224_e2e-vibevoice.wav
data/generated/sound-effects/2026-05-01/113406_short-soft-rain-on-a-window-clean-recording.wav
```

검증 중 발견하고 수정한 문제:

- S2-Pro 저장 목소리 재사용은 Fish Speech runtime의 `torchcodec` 누락으로 실패했습니다. `scripts/install_fish_speech_runtime.py`가 Fish Speech 전용 venv에 `torchcodec`을 설치하도록 수정했습니다.
- Applio/RVC 변환은 `beautifulsoup4`, `wget`, `noisereduce`, `pedalboard`, `torchcrepe`, `faiss-cpu`, `torchfcpe` 누락과 `contentvec`, `rmvpe.pt` 런타임 다운로드 의존 때문에 실패했습니다. 메인 `pyproject.toml`/`uv.lock`에 의존성을 추가했고, `scripts/download_models.sh`가 Applio runtime asset을 미리 받도록 수정했습니다.
- Applio subprocess는 `MPLCONFIGDIR`을 프로젝트 내부 `data/cache/matplotlib`로 고정해 홈 디렉터리 쓰기 권한 문제를 피합니다.

검증 후 `nvidia-smi` 기준 GPU 프로세스가 남아 있지 않았습니다.

## 10. 관련 스크립트 정리

현재 실험에서 기준으로 삼는 구현은 `qwen_extensions` 안의 역할별 canonical script입니다.

- `qwen_extensions/finetuning/sft_custom_voice_12hz.py`
- `qwen_extensions/fusion/make_voicebox_checkpoint.py`
- `qwen_extensions/finetuning/sft_voicebox_12hz.py`
- `qwen_extensions/inference/voicebox/clone.py`
- `qwen_extensions/inference/voicebox/clone_instruct.py`

예전 명령을 유지하기 위한 최상위 `voicebox/` 폴더와 `scripts/qwen3_tts_voicebox_*.py` 계열 래퍼는 제거했습니다.
재현 명령은 위 canonical script를 직접 호출합니다.

현재 유지되는 진입점 목록은 [19-script-entrypoints.md](./19-script-entrypoints.md)를 봅니다.
