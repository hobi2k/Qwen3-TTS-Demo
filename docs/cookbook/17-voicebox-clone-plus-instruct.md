# VoiceBox clone + instruct 실험

이 문서는 `VoiceBox` 또는 `CustomVoice` 계열 모델에
clone-like 조건과 `instruct`를 동시에 넣는 실험 경로를 설명합니다.

## 목적

질문은 단순합니다.

- 참조 음성의 스타일/화자 특징을 어느 정도 붙잡으면서
- `instruct`도 같이 반영할 수 있는가

공식 업스트림은 이 경로를 보장하지 않기 때문에 별도 실험으로 분리합니다.

## 사용 스크립트

- 전용 래퍼:
  - [voicebox_clone_instruct_experiment.py](../../scripts/voicebox_clone_instruct_experiment.py)
- 실제 low-level 실험:
  - [customvoice_clone_from_scratch.py](../../test/customvoice_clone_from_scratch.py)

## 특징

- 공식 `generate_custom_voice()`만 쓰는 경로가 아님
- low-level prompt 구성과 `instruct`를 직접 결합함
- 결과는 기술 검증용으로만 해석해야 함

## 해석 기준

- 오디오가 나온다고 해서 공식 지원이라고 볼 수는 없음
- 참조 화자 유사도와 `instruct` 반응은 별도 검수가 필요
- 제품 기본 경로는 여전히
  - `Base` clone
  - `CustomVoice` instruct
  - 또는 두 단계를 나눈 hybrid
  로 보는 편이 안전합니다
