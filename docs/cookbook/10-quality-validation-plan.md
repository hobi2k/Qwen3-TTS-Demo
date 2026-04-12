# Quality Validation Plan

이 문서는 현재 `Qwen3-TTS-Demo`의 **음성 품질 검증 계획**을 단계별로 정리합니다.

핵심 원칙은 하나입니다.

- 업스트림 `Qwen3-TTS` 코드는 건드리지 않는다.
- 품질 검증은 저장소 루트의 `scripts/validate_speech_quality.py`와 `docs/`만으로 관리한다.
- stock 모델 검증과 future fine-tuned 모델 검증을 분리해서 본다.

## 1. 현재 상태 요약

clean reset 이후 현재 이 저장소에서 바로 확인 가능한 것은 아래입니다.

- stock `Base`
- stock `CustomVoice`
- stock `VoiceDesign`
- `whisper-large-v3`
- 데이터셋 `mai_ko_full`

현재 아직 없는 것은 아래입니다.

- fine-tuned `Base` checkpoint
- fine-tuned `CustomVoice` checkpoint
- hybrid clone+instruct를 검증할 대상 fine-tuned `CustomVoice` checkpoint

즉 지금은 **stock 모델 검증이 1차 목표**이고, fine-tuned 검증은 checkpoint가 다시 생긴 뒤 이어서 확인하는 구조입니다.

## 2. 검증 목표

이번 품질 검증은 다음 질문에 답해야 합니다.

1. stock `Base`가 clone prompt 재사용과 참조 음성 기반 합성을 정상적으로 수행하는가
2. stock `CustomVoice`가 instruct 입력에 따라 서로 다른 스타일을 내는가
3. future `Base FT`가 stock `Base`보다 clone 품질을 해치지 않는가
4. future `CustomVoice FT`가 stock `CustomVoice`보다 instruct 준수와 음색 유지에 유리한가
5. future hybrid clone+instruct가 저장된 스타일과 instruct 제어를 함께 유지하는가

## 3. 검증 순서

### Phase A. stock Base

목표:

- 참조 음성 + 참조 텍스트로 stock `Base`가 정상 합성되는지 확인
- 같은 참조 음성을 `clone prompt`로 저장하고 재사용해도 결과가 유지되는지 확인

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --suite base \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav
```

현재 스크립트는 fine-tuned Base checkpoint가 없으면 `ft-direct` 항목을 자동으로 건너뛰고, report에 skipped check로 남깁니다.

### Phase B. stock CustomVoice

목표:

- stock `CustomVoice`가 `neutral`, `angry`, `gentle`, `breathy` instruct 차이를 반영하는지 확인
- 내용 보존이 완전히 무너지지 않는지 확인

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --suite customvoice
```

현재 스크립트는 fine-tuned CustomVoice checkpoint가 없으면 FT 구간을 자동으로 건너뛰고, report에 skipped check로 남깁니다.

### Phase C. future Base FT

목표:

- 한국어 `mai_ko_full`로 학습한 `Base FT`가 stock `Base`보다 품질을 크게 망치지 않는지 확인
- clone prompt 재사용과 direct reference 합성 결과를 비교

필요 조건:

- `data/finetune-runs/<run>/checkpoint-epoch-*` 아래에 실제 `Base` fine-tune checkpoint가 존재해야 함
- `/api/bootstrap` 또는 `/api/models`에서 해당 checkpoint가 `finetuned`로 노출되어야 함

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --suite base \
  --base-ft-model-id /path/to/base/checkpoint-epoch-0 \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav
```

### Phase D. future CustomVoice FT

목표:

- `CustomVoice FT`가 instruct 입력에 따라 `neutral`, `angry`, `gentle`, `breathy`를 구분하는지 확인
- 화자 음색과 instruct 제어가 함께 유지되는지 확인

필요 조건:

- `data/finetune-runs/<run>/checkpoint-epoch-*` 아래에 실제 `CustomVoice` fine-tune checkpoint가 존재해야 함
- `/api/bootstrap` 또는 `/api/models`에서 해당 checkpoint가 `finetuned`로 노출되어야 함

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --suite customvoice \
  --customvoice-ft-model-id /path/to/customvoice/checkpoint-epoch-0
```

### Phase E. hybrid clone+instruct

목표:

- `Base clone prompt`를 만들고
- `CustomVoice FT`에 instruct를 같이 넣어서
- 스타일 저장과 instruct 준수를 동시에 확인

필요 조건:

- `Base` stock checkpoint
- `CustomVoice FT` checkpoint
- 참조 음성 파일
- 참조 텍스트 또는 Whisper 전사 가능 상태

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8000 \
  --suite hybrid \
  --hybrid-base-model-id /path/to/Qwen3-TTS-12Hz-1.7B-Base \
  --hybrid-custom-model-id /path/to/customvoice/checkpoint-epoch-0 \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav
```

## 4. 판정 기준

자동 점수는 보조 지표로만 사용합니다.

검토 우선순위는 다음과 같습니다.

1. WAV를 실제로 들어본다.
2. `report.md`의 transcript와 similarity를 확인한다.
3. `content_ok`가 너무 많은 샘플에서 실패하면 입력이나 모델 경로를 다시 본다.
4. style 차이와 content 차이를 분리해서 판단한다.

### stock Base 합격 기준

- direct reference 경로와 clone prompt 경로 모두 합성된다.
- transcript가 probe text와 크게 어긋나지 않는다.
- 출력 길이가 비정상적으로 짧지 않다.

### stock CustomVoice 합격 기준

- `neutral`, `angry`, `gentle`, `breathy`가 청취상 구분된다.
- 문장 내용이 너무 무너지지 않는다.
- 적어도 instruct가 전혀 무시되지는 않는다.

### future Base FT 합격 기준

- stock Base보다 음색 적응이 나아지거나 최소한 악화되지 않는다.
- clone prompt 재사용 품질이 유지된다.

### future CustomVoice FT 합격 기준

- stock CustomVoice보다 instruct 제어가 더 안정적이거나 최소한 유지된다.
- 세 가지 감정 대비와 breathy 경향이 청취상 드러난다.

### hybrid 합격 기준

- clone prompt 기반 스타일과 instruct 효과가 동시에 들린다.
- stock clone만 쓴 경우보다 style control이 더 명확하다.
- CustomVoice instruct만 쓴 경우보다 참조 스타일이 더 유지된다.

## 5. 현재 막힌 부분

현재 final quality verification을 가로막는 것은 아래입니다.

- fine-tuned Base checkpoint가 아직 없다.
- fine-tuned CustomVoice checkpoint가 아직 없다.
- 따라서 hybrid clone+instruct의 최종 품질 검증도 아직 불가능하다.
- `flash-attn`은 설치 경로는 정리됐지만, 실제 모델 품질 검증은 checkpoint가 있어야 의미가 있다.

즉 지금은 **검증 harness와 stock baseline 검증은 준비 완료**이고,
final quality verification은 **새 fine-tuned checkpoint가 다시 생성되는 시점**에 마무리할 수 있습니다.

## 6. 실행 원칙

- stock 검증은 지금 바로 실행 가능하다.
- future fine-tuned 검증은 checkpoint가 생성된 뒤 실행한다.
- hybrid 검증은 fine-tuned `CustomVoice`가 생기기 전에는 하지 않는다.
- 검증 report는 `data/generated/quality-validation/<timestamp>/` 아래에 남긴다.
