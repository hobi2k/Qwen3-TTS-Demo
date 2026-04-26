# Inference Pipeline Changes

이 문서는 현재 구조 기준으로 추론 파이프라인이 어떻게 정리되었는지 설명합니다.

지금 기준 추론은 단순히 “음성을 한 번 만든다”가 아니라 아래 전체 흐름을 뜻합니다.

- 어떤 화면에서 어떤 작업을 해야 하는지 구분
- 어떤 모델을 선택하는지 결정
- 어떤 입력이 필요한지 안내
- 백엔드가 적절한 생성 경로를 선택
- 결과를 저장하고 다시 재사용

## 현재 추론 구조의 핵심

현재 추론은 아래 네 갈래로 나뉩니다.

1. `텍스트 음성 변환`
2. `목소리 복제`
3. `목소리 설계`
4. `프리셋 기반 생성`
5. `VoiceBox` 실험 경로

즉 예전처럼 “기능이 어디에 있는지부터 다시 배워야 하는 구조”보다,
사용자 작업 기준으로 추론을 나눈 상태라고 보는 편이 맞습니다.

## 1. 메인 추론 화면은 `텍스트 음성 변환`입니다

현재 메인 추론 화면은 `텍스트 음성 변환`입니다.

이 화면에서 하는 일:

- stock 모델 선택
- 최종 fine-tuned 모델 선택
- `CustomVoice` 기반 일반 TTS
- `Base` 기반 음색 조건화 TTS

중요한 점:

- “빠르게 들어보기”와 “모델 선택형 추론”은 현재 하나의 메인 TTS 화면으로 합쳤습니다.
- 실험용 샘플링 파라미터는 `고급 제어` 안으로 넣습니다.

## 2. 모델 선택형 통합 추론

백엔드는 stock 모델과 local fine-tuned 모델을 한 카탈로그로 관리합니다.

프런트는 이 카탈로그를 보고:

- 어떤 입력 폼을 보여줄지
- speaker를 보여줄지
- instruct를 보여줄지
- ref audio를 요구할지

를 결정합니다.

즉 프런트가 모델별 라우트를 일일이 외우는 구조가 아니라, 모델 메타데이터를 기준으로 화면이 바뀌는 구조입니다.

`VoiceBox` 계열은 아래 메타데이터로 식별합니다.

- `tts_model_type = custom_voice`
- `demo_model_family = voicebox`
- `speaker_encoder_included = true`

추론 호환성을 위해 `tts_model_type`은 `custom_voice`로 유지하지만,
UI와 백엔드는 `demo_model_family`를 보고 speaker encoder 포함 모델임을 구분할 수 있습니다.

## 3. `/api/generate/model`

통합 추론용 엔드포인트는 아래입니다.

- `POST /api/generate/model`

이 라우트는 선택된 모델의 성격을 보고 내부적으로 적절한 생성 경로를 탑니다.

왜 필요한가:

- 프런트가 라우트 분기를 직접 다 알 필요가 없음
- stock 모델과 fine-tuned 모델을 같은 방식으로 고를 수 있음
- 모델 교체와 비교가 쉬움

## 4. `Base`와 `CustomVoice`의 역할 차이

사용자 입장에서 핵심은 이것입니다.

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

그래서:

- `CustomVoice`는 speaker + instruct + text 중심
- `Base`는 ref audio / ref text / clone prompt 중심

이 차이가 현재 UI 구조를 나누는 기준이 됩니다.

## 5. `목소리 복제`

이 화면은 추론 화면이면서 동시에 스타일 자산 생성 화면입니다.

흐름:

1. 참조 음성 선택
2. 참조 텍스트 입력 또는 전사
3. `Base`로 clone prompt 생성
4. 저장

즉 `목소리 복제`는 결과 음성을 듣는 것보다, 이후 반복 생성에 쓰일 스타일 자산을 만드는 단계에 더 가깝습니다.

## 6. `목소리 설계`

이 화면은 설명문 기반 스타일 설계 경로입니다.

흐름:

1. 설명문 입력
2. 샘플 대사 입력
3. `VoiceDesign` 생성
4. 마음에 들면 프리셋 저장

즉 참조 음성 복제와는 다른 추론 경로입니다.

## 7. `프리셋 기반 생성`

이 화면은 저장 프리셋을 다시 쓰는 화면입니다.

현재 두 경로가 있습니다.

- 프리셋 그대로 생성
- 프리셋 + 말투 지시

이때 왜 모델 두 개가 필요한지는 [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)에 자세히 정리되어 있습니다.

간단히 말하면:

- `Base`는 저장된 스타일 신호를 읽고
- `CustomVoice`는 새 대사와 instruct를 적용합니다

별도 실험 경로인 `VoiceBox`는 한 체크포인트 안에 speaker encoder를 포함하므로,
clone-like conditioning과 instruct를 한 모델에서 같이 실험할 수 있습니다.

현재 안정 후보:

- `embedded_encoder_only`

주의 후보:

- `embedded_encoder_with_ref_code`
  - 참조 codec 흐름까지 넣기 때문에 aggressive instruct에서 문장 보존이 흔들릴 수 있습니다.

## 8. 학습 결과 모델을 바로 다시 쓰는 구조

현재 추론 파이프라인의 중요한 특징은 학습과 추론이 한 워크플로우로 이어진다는 점입니다.

흐름:

1. `데이터셋 만들기`
2. `학습 실행`
3. 최종 모델 생성
4. `텍스트 음성 변환` 또는 `나의 목소리들`에서 다시 선택

즉 학습 결과를 별도 스크립트로만 테스트하는 구조가 아니라, UI 안으로 다시 가져오는 구조입니다.

현재 검증된 학습 결과:

- `data/finetune-runs/mai_ko_customvoice17b_full/final`
- `data/finetune-runs/mai_ko_voicebox17b_full/final`
- `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`

## 9. 오디오 툴은 추론과 분리합니다

현재 아래 기능은 메인 TTS 추론과 분리된 독립 작업실입니다.

- `사운드 효과`
- `오디오 분리`
- `Applio RVC 모델 학습`
- `Applio 단일 변환`
- `Applio 배치 변환`
- `Applio 모델 블렌딩`

특히 `Applio`는 TTS 재합성이 아니라 `Applio / RVC` audio-to-audio 경로라는 점을 명확히 구분합니다.

## 정리

현재 추론 파이프라인은 아래 기준으로 보면 됩니다.

- 메인 TTS: `텍스트 음성 변환`
- 스타일 자산 생성: `목소리 복제`, `목소리 설계`
- 스타일 재활용: `프리셋 기반 생성`
- self-contained clone/instruct 실험: `VoiceBox`
- 오디오 툴: `사운드 효과`, `S2-Pro`, `Applio`

즉 지금의 변화는 “기능을 더 많이 붙인 것”보다, 각 기능의 역할을 사용자 작업 흐름에 맞게 다시 나눈 것이라고 보는 편이 정확합니다.
