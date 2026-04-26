# Script Entrypoints

이 문서는 현재 저장소에서 실제로 유지보수하는 실행 진입점만 정리합니다.

예전에는 최상위 `voicebox/` 폴더와 `scripts/qwen3_tts_voicebox_*.py` 계열 파일이 canonical script를 감싸는 호환 래퍼로 남아 있었습니다. 지금은 중복 경로가 오히려 유지보수를 흐리므로 제거했습니다.

원칙은 단순합니다.

- VoiceBox 학습 코드는 `Qwen3-TTS/finetuning`에 둡니다.
- VoiceBox 체크포인트 변환과 업로드 코드는 `Qwen3-TTS/fusion`에 둡니다.
- VoiceBox 추론 코드는 `Qwen3-TTS/inference/voicebox`에 둡니다.
- 일반 유틸리티와 평가 스크립트만 `scripts/`에 둡니다.
- 새 기능을 만들 때 `scripts/`나 최상위 폴더에 얇은 래퍼를 추가하지 않습니다.

## Canonical VoiceBox Scripts

| 책임 | 실행 파일 |
| --- | --- |
| plain CustomVoice fine-tuning | `Qwen3-TTS/finetuning/sft_custom_voice_12hz.py` |
| shared training implementation | `Qwen3-TTS/finetuning/voicebox_training_common.py` |
| VoiceBox bootstrap training | `Qwen3-TTS/finetuning/sft_voicebox_bootstrap_12hz.py` |
| VoiceBox -> VoiceBox retraining | `Qwen3-TTS/finetuning/sft_voicebox_12hz.py` |
| CustomVoice -> VoiceBox conversion | `Qwen3-TTS/fusion/make_voicebox_checkpoint.py` |
| Hugging Face upload | `Qwen3-TTS/fusion/upload_voicebox_to_hub.py` |
| non-VoiceBox clone prompt + instruct | `Qwen3-TTS/inference/hybrid_clone_instruct.py` |
| VoiceBox normal instruct inference | `Qwen3-TTS/inference/voicebox/infer_instruct.py` |
| VoiceBox clone experiment | `Qwen3-TTS/inference/voicebox/clone.py` |
| VoiceBox clone + instruct experiment | `Qwen3-TTS/inference/voicebox/clone_instruct.py` |
| shared low-level VoiceBox clone logic | `Qwen3-TTS/inference/voicebox/clone_low_level.py` |
| shared VoiceBox loader/runtime | `Qwen3-TTS/inference/voicebox/runtime.py` |

## Current Training Code Path

현재 검증된 MAI 학습 흐름은 아래 세 단계입니다.

```bash
# 1. plain CustomVoice
.venv/bin/python Qwen3-TTS/finetuning/sft_custom_voice_12hz.py ...

# 2. CustomVoice -> VoiceBox
.venv/bin/python Qwen3-TTS/fusion/make_voicebox_checkpoint.py ...

# 3. VoiceBox -> VoiceBox
.venv/bin/python Qwen3-TTS/finetuning/sft_voicebox_12hz.py ...
```

현재 full-run 데이터셋은 아래 파일입니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

현재 1.7B full-run에서 안정적으로 완료된 optimizer 설정은 아래입니다.

```bash
QWEN_DEMO_OPTIMIZER=adafactor
```

`Adafactor`는 품질 보장용이 아니라 16GB GPU에서 optimizer state 메모리 피크를 낮추기 위한 운영 옵션입니다. 품질은 생성 wav, Whisper 전사, speaker similarity, 실제 청취로 따로 확인합니다.

## S2-Pro Runtime Scripts

S2-Pro는 Qwen/VoiceBox 학습 경로가 아닙니다. 로컬 Fish Speech 자산을 별도 런타임으로 사용합니다.

- source checkout: `vendor/fish-speech`
- model directory: `data/models/fish-speech/s2-pro`
- isolated runtime venv: `.venv-fish-speech`

Fish Speech는 메인 Qwen `.venv`에 설치하지 않습니다. Fish Speech upstream은 torch 버전 pin을 포함할 수 있으므로, Qwen/flash-attn 런타임과 섞이면 Torch/CUDA 구성이 흔들릴 수 있습니다. `scripts/serve_s2_pro.sh`는 독립 `.venv-fish-speech`를 만들고, 선택한 torch-family build를 먼저 설치한 뒤 Fish Speech를 설치합니다.

```bash
./scripts/download_models.sh s2pro
./scripts/serve_s2_pro.sh
```

기본 로컬 S2-Pro torch 라인:

```bash
FISH_SPEECH_TORCH_VERSION=2.11.0
FISH_SPEECH_TORCH_PROFILE=cu130
```

런타임 설치 구현은 아래 파일입니다.

```text
scripts/install_fish_speech_runtime.py
```

## Remaining Scripts

`scripts/`에는 현재 아래 성격의 파일만 남깁니다.

- 모델 다운로드와 환경 준비
- 데이터셋 import / prepare
- 품질 평가와 검증
- 외부 런타임 설치와 실행
- 개인 Hugging Face asset manifest 준비

현재 `scripts/`의 VoiceBox 관련 파일은 평가용 `evaluate_customvoice_voicebox_quality.py`만 남깁니다. 학습, 변환, 추론 자체는 `Qwen3-TTS` 내부 canonical script를 직접 사용합니다.

## What Not To Do

- 최상위 `voicebox/` 폴더를 다시 만들지 않습니다.
- `scripts/qwen3_tts_voicebox_*.py` 같은 호환 래퍼를 다시 추가하지 않습니다.
- 학습 루프를 `scripts/`에 복제하지 않습니다.
- 새 VoiceBox 기능을 만들 때 canonical script가 아닌 별도 우회 경로부터 만들지 않습니다.
- 문서에는 삭제된 래퍼 명령을 재현 경로로 남기지 않습니다.
