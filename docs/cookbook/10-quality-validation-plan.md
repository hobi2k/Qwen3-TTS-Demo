# Quality Validation Plan

이 문서는 현재 구조 기준으로 음성 품질 검수를 어떤 순서와 기준으로 반복할지 정리한 문서입니다.

현재는 “언젠가 검증할 계획”보다, 이미 있는 기능과 모델을 어떻게 계속 재검증할지에 더 가깝습니다.

## 현재 검수 대상

- stock `Base`
- stock `CustomVoice`
- stock `VoiceDesign`
- fine-tuned `Base`
- fine-tuned `CustomVoice`
- `VoiceBox`
- `프리셋 기반 생성` hybrid 경로

## 검수에서 답해야 하는 질문

1. dataset 음색이 실제로 반영되는가
2. instruct를 실제로 따르는가
3. stock보다 나아졌는가, 아니면 최소한 유지되는가
4. 프리셋 기반 생성에서 스타일과 instruct가 같이 유지되는가

## 검수 순서

### Phase A. stock Base

확인할 것:

- 참조 음성 + 참조 텍스트로 정상 합성되는가
- clone prompt 저장 후 재사용해도 결과가 유지되는가

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8190 \
  --suite base \
  --reference-audio data/datasets/mai_ko_full/audio/00000.wav
```

### Phase B. stock CustomVoice

확인할 것:

- instruct 차이가 실제로 들리는가
- 문장 내용이 무너지지 않는가

권장 명령:

```bash
python scripts/validate_speech_quality.py \
  --api-base http://127.0.0.1:8190 \
  --suite customvoice
```

### Phase C. fine-tuned Base

확인할 것:

- stock Base보다 음색 적응이 나아졌는가
- clone prompt 재사용 품질이 유지되는가

### Phase D. fine-tuned CustomVoice

확인할 것:

- stock CustomVoice보다 dataset 음색 반영이 좋아졌는가
- instruct 준수가 유지되거나 개선되었는가

### Phase E. 프리셋 기반 생성

확인할 것:

- 저장된 스타일이 유지되는가
- 같은 스타일 위에 instruct 차이가 실제로 붙는가

### Phase F. VoiceBox

확인할 것:

- `speaker_encoder.*`가 checkpoint에 포함되어 있는가
- 외부 `Base` 없이 `VoiceBox -> VoiceBox` 추가 학습이 되는가
- 일반 instruct 추론이 되는가
- clone / clone + instruct 저수준 실험이 되는가
- `speaker_anchor_with_ref_code`, `embedded_encoder_only`, `embedded_encoder_with_ref_code` 중 어떤 전략이 더 안정적인가

## 판정 기준

자동 점수는 보조 지표입니다.

우선순위:

1. 실제로 듣는다
2. transcript를 본다
3. similarity를 본다
4. style 차이와 content 차이를 분리해서 본다

## 현재 기준 결론

현재 구조에서 특히 중요한 것은:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만 instruct 유지가 자동 보장되지는 않음
- `CustomVoice Fine-Tune`
  음색 반영과 instruct 유지 후보 경로
- `프리셋 기반 생성`
  스타일 저장과 말투 지시를 함께 확인할 수 있는 핵심 검수 대상
- `VoiceBox`
  self-contained speaker encoder 실험 경로이며, 현재 clone+instruct 기본 후보는 `speaker_anchor_with_ref_code`

## 남은 운영 과제

- `CustomVoice` self-contained checkpoint 전환
- validation harness를 이후 UI/데이터 변경에도 계속 재사용 가능하게 유지
- VoiceBox 결과를 WEB UI 설명과 모델 선택 UX에 자연스럽게 반영

## 실행 원칙

- stock 검증과 fine-tuned 검증은 분리해서 본다
- 검수 결과는 보고서와 샘플 오디오를 같이 남긴다
- UI가 바뀌어도 검수 질문은 바꾸지 않는다
- optimizer, attention backend, dataset manifest를 결과 문서에 함께 남긴다
