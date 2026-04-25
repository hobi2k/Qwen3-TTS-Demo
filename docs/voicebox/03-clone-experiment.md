# VoiceBox clone 실험

이 문서는 `VoiceBox` 또는 `CustomVoice` 계열 체크포인트가
공식 `Base` clone API 없이도 clone-like 조건부 생성을 할 수 있는지 실험하는 경로를 설명합니다.

## 성격

이 실험은 업스트림 공식 high-level clone API가 아니라, 데모에서 분리한 low-level VoiceBox 실험입니다.

- 공식 clone 경로는 `Base`
- 이 문서의 실험은 VoiceBox에 내장된 `speaker_encoder`와 저수준 `model.generate(...)` 조합

즉, “Base clone API를 그대로 대체한다”가 아니라, VoiceBox가 자체 encoder로 clone-like conditioning을 할 수 있는지 보는 경로입니다.

## 사용 스크립트

- 래퍼:
  - [clone.py](../../voicebox/clone.py)
- 실제 실험:
  - [clone_low_level.py](../../voicebox/clone_low_level.py)

## 확인하는 질문

1. `CustomVoice`만으로 clone prompt 생성이 가능한가
2. 공식 high-level API를 우회하면 ref audio 기반 생성이 가능한가
3. 생성은 되더라도 진짜 clone이라고 부를 수 있을 정도로 안정적인가

## 전략 차이

### `embedded_encoder_only`

참조 음성에서 embedded `speaker_encoder`로 화자 embedding만 추출해 씁니다.

- 장점: 문장 보존과 instruct 결합이 안정적
- 단점: 참조 음성의 세부 리듬/codec 흐름은 덜 따라갈 수 있음

### `embedded_encoder_with_ref_code`

화자 embedding에 더해 참조 음성의 codec token 흐름인 `ref_code`도 같이 씁니다.

- 장점: 참조 발화의 리듬/스타일을 더 강하게 끌고 올 가능성
- 단점: aggressive instruct에서 문장 보존이 흔들릴 수 있음

## 현재 결론

- 공식 업스트림 high-level API: 아님
- VoiceBox low-level clone: 생성 성공
- 현재 안정 후보: `embedded_encoder_only`

현재 검증 결과:

```text
data/generated/voicebox-clone-tests/20260425-extra1/quality_check.json
```

대표 수치:

- `embedded_encoder_only`: speaker similarity `0.9689`, target text similarity `1.000`
- `embedded_encoder_with_ref_code`: speaker similarity `0.9670`, target text similarity `1.000`
