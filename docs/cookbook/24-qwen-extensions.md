# Qwen Extensions 구조

이 문서는 `Qwen3-TTS-Demo`에서 원본 Qwen 코드와 데모 전용 확장 코드를 어떻게 분리하는지 설명합니다.

## 왜 분리하는가

`Qwen3-TTS`는 업스트림 코드와 비교해야 하는 기준점입니다. 여기에 CustomVoice 파인튜닝, VoiceBox 변환, clone+instruct 실험 코드를 계속 직접 추가하면 나중에 업스트림 변경을 따라가거나 문제를 재현할 때 기준선이 흐려집니다.

그래서 현재 구조는 아래 원칙을 따릅니다.

- 업스트림 체크아웃은 `vendor/Qwen3-TTS`에 둡니다.
- 데모가 직접 유지보수하는 Qwen 확장 스크립트는 `qwen_extensions`에 둡니다.
- 이미 `vendor/Qwen3-TTS` 안에 들어간 커스텀 파일은 당장 삭제하지 않고 legacy mirror로 남겨 둡니다.
- 백엔드는 `qwen_extensions`를 우선 실행합니다.

## 디렉터리 역할

```text
Qwen3-TTS-Demo/
  vendor/Qwen3-TTS/
    finetuning/
    inference/
    ...
  qwen_extensions/
    finetuning/
    fusion/
    inference/
      voicebox/
```

`vendor/Qwen3-TTS`는 모델 클래스, tokenizer, processor, 기본 fine-tuning script, upstream dataset helper를 제공하는 기준 코드입니다.

`qwen_extensions`는 이 데모가 추가한 실행 진입점입니다.

| 폴더 | 책임 |
| --- | --- |
| `qwen_extensions/finetuning` | CustomVoice 화자 추가, VoiceBox bootstrap, VoiceBox 재학습 |
| `qwen_extensions/fusion` | CustomVoice checkpoint에 Base 1.7B speaker encoder를 포함해 VoiceBox 생성 |
| `qwen_extensions/inference/hybrid_clone_instruct.py` | Base clone prompt와 CustomVoice instruct를 조합하는 기존 hybrid 경로 |
| `qwen_extensions/inference/voicebox` | VoiceBox 단일 모델 추론, clone, clone+instruct 실험 |

## 백엔드 실행 기준

FastAPI는 `app/backend/app/main.py`에서 Qwen 확장 스크립트를 아래 순서로 찾습니다.

1. `QWEN_EXTENSIONS` 환경변수
2. 저장소 루트의 `qwen_extensions`
3. 같은 상대 경로가 없을 때만 `vendor/Qwen3-TTS` legacy mirror

기본값:

```env
QWEN_EXTENSIONS=qwen_extensions
```

절대 경로도 사용할 수 있습니다.

```env
QWEN_EXTENSIONS=/home/hosung/pytorch-demo/Qwen3-TTS-Demo/qwen_extensions
```

## 실행 예시

plain CustomVoice 학습:

```bash
.venv/bin/python qwen_extensions/finetuning/sft_custom_voice_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --speaker_encoder_model_path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output_model_path data/finetune-runs/mai_ko_customvoice17b_full \
  --speaker_name mai
```

VoiceBox 변환:

```bash
.venv/bin/python qwen_extensions/fusion/make_voicebox_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final
```

VoiceBox 재학습:

```bash
.venv/bin/python qwen_extensions/finetuning/sft_voicebox_12hz.py \
  --train_jsonl data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl \
  --init_model_path data/finetune-runs/mai_ko_voicebox17b_full/final \
  --output_model_path data/finetune-runs/mai_ko_voicebox17b_full_extra1 \
  --speaker_name mai
```

## 유지보수 규칙

- 새 Qwen 확장 기능은 먼저 `qwen_extensions`에 추가합니다.
- `vendor/Qwen3-TTS` 안 커스텀 파일은 지금 단계에서는 보존하지만, 백엔드 실행 기준으로 삼지 않습니다.
- `scripts/`에는 다운로드, 데이터셋 준비, 품질 평가, 외부 런타임 관리처럼 제품 전체를 다루는 도구만 둡니다.
- 학습 루프나 VoiceBox runtime을 `scripts/`에 다시 복제하지 않습니다.
- 문서에서 “canonical script”라고 부르는 경로는 `qwen_extensions`입니다.

## 이후 정리 방향

현재는 `vendor/Qwen3-TTS`를 다른 외부 엔진과 같은 vendor source로 취급합니다. 데모 전용 Qwen 코드는 계속 `qwen_extensions`가 실행 기준이고, vendor 안 복사본은 legacy mirror입니다.
