# VoiceBox clone + instruct 실험

이 문서는 기존 링크 호환용 요약 페이지입니다.

현재 기준 상세 문서는 아래를 봅니다.

- [../voicebox/04-clone-plus-instruct.md](../voicebox/04-clone-plus-instruct.md)
- [18-current-experiment-results.md](./18-current-experiment-results.md)

## 현재 기준

VoiceBox clone + instruct는 한 체크포인트 안에서 아래를 같이 실험하는 경로입니다.

- 참조 음성에서 speaker embedding 추출
- target text 생성
- `instruct` 적용

사용 스크립트:

```text
Qwen3-TTS/inference/voicebox/clone_instruct.py
Qwen3-TTS/inference/voicebox/clone_low_level.py
```

현재 검증된 모델:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

## 현재 결과 요약

- breathy `embedded_encoder_only`: speaker similarity `0.9655`, target text similarity `1.000`
- breathy `embedded_encoder_with_ref_code`: speaker similarity `0.9688`, target text similarity `1.000`
- angry `embedded_encoder_only`: speaker similarity `0.9614`, target text similarity `1.000`
- angry `embedded_encoder_with_ref_code`: speaker similarity `0.9630`, target text similarity `0.923`

현재 안정 후보:

- `embedded_encoder_only`

주의 후보:

- `embedded_encoder_with_ref_code`
  - 참조 codec 흐름까지 쓰므로 clone 느낌이 강해질 수 있지만, aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.
