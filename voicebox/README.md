# VoiceBox Scripts

이 폴더는 `VoiceBox` 전용 엔트리포인트를 모아 둔 작업 디렉터리입니다.

핵심 원칙:

- 기존 `scripts/`와 `Qwen3-TTS` 안의 기존 경로는 그대로 유지합니다.
- 이 폴더는 `VoiceBox` 관련 작업을 **세 단계**로 재현 가능하게 분리해 둔 전용 진입점 모음입니다.
- 공통 런타임 로직은 이 폴더 안의 `runtime.py`와 `clone_low_level.py`에 둡니다.

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

## 권장 순서 예시

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo

# 1) plain CustomVoice에 mai 추가 학습
.venv/bin/python voicebox/sft_plain_custom_voice_12hz.py \
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
  --init-model-path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --speaker-encoder-model-path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-model-path data/finetune-runs/mai_ko_customvoice17b_full \
  --speaker-name mai

# 2) plain CustomVoice -> VoiceBox 변환
.venv/bin/python voicebox/make_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final

# 3) VoiceBox -> VoiceBox 추가 학습
.venv/bin/python voicebox/sft_voicebox_12hz.py \
  --train-jsonl data/datasets/mai_ko_full/prepared.jsonl \
  --init-voicebox-model-path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output-model-path data/finetune-runs/mai_ko_voicebox17b_full_retrain \
  --speaker-name mai
```
