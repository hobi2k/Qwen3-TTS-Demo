# Test Notes

이 폴더는 현재 저장소에서 바로 다시 돌려볼 수 있는 실험 스크립트와 결과 요약을 두는 공간입니다.

## `customvoice_clone_probe.py`

목적:

- `CustomVoice` 모델만으로 `voice clone`
- `CustomVoice` 모델만으로 `voice_clone_prompt`

가 가능한지 확인합니다.

이 스크립트는 세 단계를 나눠서 검사합니다.

1. 공식 `create_voice_clone_prompt(...)` 호출
2. 공식 `generate_voice_clone(...)` 호출
3. low-level `model.generate(..., voice_clone_prompt=...)` 수동 호출

현재 결론:

- 공식 high-level API 기준으로는 둘 다 지원되지 않습니다.
- low-level 수동 경로도 현재 `CustomVoice` 체크포인트에서는 막힙니다.
- 직접 원인을 파보면 `speaker_encoder`가 callable이 아니라 `None`이라, 참조 음성에서 speaker embedding을 뽑는 단계에서 실패합니다.

즉 현재 업스트림 기준으로는:

- `CustomVoice`는 `speaker + instruct` 경로
- `Base`는 `ref_audio / ref_text / voice_clone_prompt` 경로

로 역할이 나뉜다고 보는 편이 맞습니다.

## `customvoice_clone_from_scratch.py`

목적:

- 공식 `Base.create_voice_clone_prompt(...)`
- 공식 `Base.generate_voice_clone(...)`

를 전혀 쓰지 않고, `CustomVoice` 체크포인트만으로 clone 비슷한 경로를
억지로 만들 수 있는지 확인합니다.

이 스크립트는 세 전략을 나눠서 검사합니다.

1. stock speaker embedding을 빌리고 reference codec을 ICL처럼 함께 넣는 경로
2. reference codec embedding만으로 pseudo speaker embedding을 만드는 경로
3. pseudo speaker embedding + reference codec ICL을 같이 쓰는 경로

현재 결론:

- 세 전략 모두 **오디오는 생성됩니다.**
- 하지만 이것만으로 `CustomVoice`가 진짜 voice clone을 지원한다고 말할 수는 없습니다.
- 이유는 `CustomVoice` 체크포인트 안에 참조 음성에서 speaker embedding을 추출하는
  정식 `speaker_encoder`가 없기 때문입니다.
- 즉 성공한 경로는 “공식 clone 지원”이 아니라, 저수준 prompt packing을 이용한
  **비공식 실험적 하이브리드**에 가깝습니다.

정리하면:

- `Base` 없이도 `CustomVoice` 저수준 생성 경로를 강제로 태우는 건 가능했습니다.
- 하지만 참조 화자의 음색을 제대로 복제했다고 보장할 수 있는 구조는 아닙니다.
- 따라서 현재 단계에서는 “CustomVoice-only true clone”이 확인됐다기보다,
  “CustomVoice-only clone-like hack은 가능하다” 쪽이 더 정확합니다.
