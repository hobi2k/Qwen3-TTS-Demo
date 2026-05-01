# VoiceBox clone + instruct 실험

이 문서는 `VoiceBox` 또는 `CustomVoice` 계열 모델에
clone-like 조건과 `instruct`를 동시에 넣는 실험 경로를 설명합니다.

## 목적

질문은 단순합니다.

- 참조 음성의 스타일/화자 특징을 어느 정도 붙잡으면서
- `instruct`도 같이 반영할 수 있는가

공식 업스트림은 이 경로를 high-level API로 보장하지 않기 때문에 별도 실험으로 분리합니다.

## 사용 스크립트

- 전용 래퍼:
  - [clone_instruct.py](../../qwen_extensions/inference/voicebox/clone_instruct.py)
- 실제 low-level 실험:
  - [clone_low_level.py](../../qwen_extensions/inference/voicebox/clone_low_level.py)

## 특징

- 공식 `generate_custom_voice()`만 쓰는 경로가 아님
- low-level prompt 구성과 `instruct`를 직접 결합함
- 결과는 기술 검증용으로만 해석해야 함

## 전략 차이

### `embedded_encoder_only`

참조 음성에서 speaker embedding만 추출하고, target text와 instruct를 함께 넣습니다.

현재 결과상 clone+instruct 기본 후보입니다.

### `embedded_encoder_with_ref_code`

speaker embedding과 참조 audio codec 흐름을 함께 넣습니다.

clone 느낌이 강해질 수 있지만, aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.

## 현재 검증 결과

기준 체크포인트:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

결과 위치:

```text
data/generated/voicebox-clone-tests/20260425-extra1
```

대표 수치:

- breathy `embedded_encoder_only`: speaker similarity `0.9655`, target text similarity `1.000`
- breathy `embedded_encoder_with_ref_code`: speaker similarity `0.9688`, target text similarity `1.000`
- angry `embedded_encoder_only`: speaker similarity `0.9614`, target text similarity `1.000`
- angry `embedded_encoder_with_ref_code`: speaker similarity `0.9630`, target text similarity `0.923`

현재 결론:

- `embedded_encoder_only`가 더 안전한 기본 후보입니다.
- `embedded_encoder_with_ref_code`는 참조성을 더 강하게 줄 수 있지만 문장 안정성 검수가 더 필요합니다.

## 해석 기준

- 오디오가 나온다고 해서 공식 지원이라고 볼 수는 없음
- 참조 화자 유사도와 `instruct` 반응은 별도 검수가 필요
- 제품 기본 경로는 여전히
  - `Base` clone
  - `CustomVoice` instruct
  - 또는 두 단계를 나눈 hybrid
  로 보는 편이 안전합니다

다만 `VoiceBox` 경로는 “한 체크포인트 안에서 speaker encoder와 instruct를 함께 쓰는” 별도 실험 경로로 검증되었습니다.
