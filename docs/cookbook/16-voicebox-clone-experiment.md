# VoiceBox clone 실험

이 문서는 기존 링크 호환용 요약 페이지입니다.

현재 기준 상세 문서는 아래를 봅니다.

- [../voicebox/03-clone-experiment.md](../voicebox/03-clone-experiment.md)
- [18-current-experiment-results.md](./18-current-experiment-results.md)

## 현재 기준

VoiceBox clone은 업스트림 공식 `Base` clone high-level API가 아니라,
VoiceBox에 내장된 `speaker_encoder`를 쓰는 low-level 실험 경로입니다.

사용 스크립트:

```text
qwen_extensions/inference/voicebox/clone.py
qwen_extensions/inference/voicebox/clone_low_level.py
```

현재 검증된 모델:

```text
data/finetune-runs/mai_ko_voicebox17b_full_extra1/final
```

검증 결과:

- `embedded_encoder_only`: speaker similarity `0.9689`, target text similarity `1.000`
- `embedded_encoder_with_ref_code`: speaker similarity `0.9670`, target text similarity `1.000`

현재 제품 기본 후보는 `speaker_anchor_with_ref_code`입니다.
위 수치는 과거 비교군으로 유지합니다.
