# VoiceBox clone 실험

이 문서는 `VoiceBox` 또는 `CustomVoice` 계열 체크포인트가
공식 `Base` clone API 없이도 clone-like 조건부 생성을 할 수 있는지 실험하는 경로를 설명합니다.

## 성격

이 실험은 공식 지원 경로가 아닙니다.

- 공식 clone 경로는 `Base`
- 이 문서의 실험은 저수준 `model.generate(...)`와 수동 prompt 조합

즉, 제품 기능이라기보다 기술 가능성 확인용입니다.

## 사용 스크립트

- 래퍼:
  - [voicebox_clone_experiment.py](../../scripts/voicebox_clone_experiment.py)
- 실제 실험:
  - [customvoice_clone_from_scratch.py](../../test/customvoice_clone_from_scratch.py)
  - [customvoice_clone_probe.py](../../test/customvoice_clone_probe.py)

## 확인하는 질문

1. `CustomVoice`만으로 clone prompt 생성이 가능한가
2. 공식 high-level API를 우회하면 ref audio 기반 생성이 가능한가
3. 생성은 되더라도 진짜 clone이라고 부를 수 있을 정도로 안정적인가

## 현재 결론

- 공식 지원: 아님
- 저수준 hack: 일부 오디오는 생성됨
- 하지만 정식 clone 경로로 보기엔 불안정

즉 현재 프로젝트 기준으로 clone의 기본 책임은 여전히 `Base`에 있습니다.
