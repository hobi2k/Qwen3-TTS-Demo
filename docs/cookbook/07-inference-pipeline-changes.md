# Inference Pipeline Changes

이 문서는 `Qwen3-TTS-Demo`에서 **추론 파이프라인이 어떻게 확장되었는지**를 처음 읽는 사람도 이해할 수 있게 설명합니다.

여기서 말하는 "추론 파이프라인"은 단순히 음성을 한 번 생성하는 함수만 뜻하지 않습니다.  
이 프로젝트에서는 아래 전체 흐름을 뜻합니다.

- 어떤 모델을 선택할지 결정하는 단계
- 어떤 입력 폼이 필요한지 결정하는 단계
- 백엔드가 어떤 추론 경로를 호출할지 결정하는 단계
- 생성 결과를 파일과 메타데이터로 저장하는 단계
- WEB UI에서 다시 재생하거나 비교하는 단계

## 먼저 큰 그림부터

초기 데모는 기능별 화면이 분리되어 있었습니다.

- `CustomVoice`
- `VoiceDesign`
- `Character Builder`
- `Training Lab`

이 구조는 각 기능을 이해하기엔 좋지만, 시간이 지나면 아래 문제가 생깁니다.

- 학습된 체크포인트를 어디서 추론해야 하는지 명확하지 않음
- stock 모델과 fine-tuned 모델을 같은 기준으로 비교하기 어려움
- "이 모델은 `speaker`를 받는가, `ref_audio`를 받는가, `instruct`를 받는가"를 화면마다 따로 배워야 함

그래서 현재 추론 파이프라인은 두 방향으로 확장되었습니다.

1. **모델 선택형 통합 추론**
2. **Clone Prompt + Instruct Hybrid 실험 경로**

## 원래 있던 추론 경로

기존 데모는 기능별 라우트가 분리되어 있었습니다.

- `POST /api/generate/custom-voice`
- `POST /api/generate/voice-design`
- `POST /api/generate/voice-clone`

이 구조는 "각 기능을 독립적으로 시연"하는 데는 적합합니다.  
하지만 아래 질문에는 답하기 어렵습니다.

- 방금 학습한 체크포인트를 어떤 탭에서 시험하지?
- stock `CustomVoice`와 local fine-tuned 모델을 같은 화면에서 비교할 수 있나?
- `Base` 계열과 `CustomVoice` 계열을 공통 파라미터 인터페이스로 다룰 수 있나?

이 한계를 해결하려고 통합 추론 경로가 추가되었습니다.

## 1. 모델 선택형 통합 추론이 추가되었습니다

가장 큰 변화는 `Inference Lab`의 도입입니다.

관련 위치:

- 프런트엔드: [App.tsx](../../app/frontend/src/App.tsx)
- 백엔드: [main.py](../../app/backend/app/main.py)
- 타입 정의: [types.ts](../../app/frontend/src/lib/types.ts)
- API 클라이언트: [api.ts](../../app/frontend/src/lib/api.ts)

### 이 기능이 하는 일

`Inference Lab`은 stock 모델과 local fine-tuned 체크포인트를 **한 화면에서 모델처럼 선택**할 수 있게 합니다.

즉 사용자는 더 이상 "이건 어느 탭으로 가야 하지?"를 먼저 고민하지 않아도 됩니다.  
대신 아래 순서로 생각하면 됩니다.

1. 내가 쓰려는 모델이 무엇인가
2. 그 모델은 어떤 입력을 요구하는가
3. 같은 화면에서 바로 생성하고 비교할 수 있는가

### 백엔드에서 추가된 핵심 개념: 모델 카탈로그

백엔드는 이제 단순히 "사전에 정해 둔 stock 모델 목록"만 반환하지 않습니다.  
로컬 fine-tuned 체크포인트까지 포함한 모델 카탈로그를 만들어 반환합니다.

이 카탈로그에는 단순 모델 이름 외에 아래 정보도 함께 담깁니다.

- `inference_mode`
- `source`
- `available_speakers`
- `default_speaker`

이 정보가 중요한 이유는, 프런트엔드가 이를 보고 어떤 폼을 보여줘야 할지 결정하기 때문입니다.

예를 들어:

- `custom_voice`
  - `speaker`
  - `instruct`
  - `text`
- `voice_clone`
  - `ref_audio_path`
  - `ref_text`
  - `voice_clone_prompt_path`
- `voice_design`
  - 디자인 설명문
  - 대사

즉 통합 추론은 "모든 모델을 한 폼으로 억지로 우겨 넣는 구조"가 아니라, **모델 카탈로그의 메타데이터를 기준으로 폼을 동적으로 바꾸는 구조**입니다.

## 2. `POST /api/generate/model`이 추가되었습니다

기존의 기능별 엔드포인트와 별개로, 지금은 통합 추론용 엔드포인트가 있습니다.

- `POST /api/generate/model`

이 라우트는 사용자가 선택한 모델의 `inference_mode`를 보고 내부적으로 적절한 생성 경로를 탑니다.

### 왜 이 라우트가 필요한가

기능별 엔드포인트만 유지하면 아래 문제가 계속 남습니다.

- 프런트엔드가 "이 모델은 어느 라우트를 때려야 하지?"를 직접 알아야 함
- local fine-tuned checkpoint가 늘어날수록 프런트엔드 분기문이 복잡해짐
- 추론 탭을 만들 때 stock 모델과 fine-tuned 모델을 따로 처리하게 됨

`/api/generate/model`은 이 복잡성을 줄이기 위해 생겼습니다.  
즉 프런트엔드는 "모델 선택"과 "입력값 수집"에 집중하고, 실제 추론 경로 선택은 백엔드가 담당합니다.

## 3. `Inference Lab`에서 고급 파라미터까지 조정할 수 있게 되었습니다

현재 `Inference Lab`은 단순 데모 버튼이 아닙니다.  
상세 추론 제어판에 가깝습니다.

조정 가능한 대표 항목:

- `text`
- `language`
- `instruct`
- `speaker`
- `seed`
- `top_k`
- `top_p`
- `temperature`
- `repetition_penalty`
- `max_new_tokens`
- `subtalker_temperature`
- `subtalker_top_k`
- `subtalker_top_p`
- `extra_generate_kwargs`

`Base` 계열이나 clone 경로에서는 아래 항목도 다룹니다.

- `ref_audio_path`
- `ref_text`
- `voice_clone_prompt_path`
- `x_vector_only_mode`

이 변경은 중요합니다.  
이제 WEB UI는 단순 "예시 페이지"가 아니라, **실험 조건을 바꿔 가며 모델을 비교하는 검증 도구** 역할도 할 수 있습니다.

## 4. 학습된 모델을 WEB UI에서 직접 고를 수 있게 되었습니다

추론 파이프라인에서 가장 큰 사용성 개선 중 하나는 이것입니다.

- 학습 완료된 로컬 체크포인트를 자동으로 모델 목록에 포함
- `Inference Lab`에서 바로 선택 가능

이 변화 전에는 사용자가 학습에 성공해도, 그 모델을 테스트하려면 별도 스크립트나 수동 경로 지정이 필요했습니다.  
지금은 그 단계를 줄였습니다.

즉 현재 추론 파이프라인은 이렇게 이어집니다.

1. `Training Lab`에서 학습 실행
2. 체크포인트 생성
3. 백엔드가 체크포인트 스캔
4. `GET /api/models`에 반영
5. `Inference Lab`에서 즉시 선택

이 덕분에 "학습과 추론이 이어진 하나의 워크플로우"가 됩니다.

## 5. `Clone Prompt + Instruct Hybrid` 실험 경로가 추가되었습니다

이 경로는 이번 추론 파이프라인 변경에서 가장 실험적인 부분입니다.

관련 파일:

- 업스트림 examples 추가 스크립트: [test_model_12hz_custom_clone_instruct.py](../../Qwen3-TTS/examples/test_model_12hz_custom_clone_instruct.py)
- 백엔드 엔진 구현: [qwen.py](../../app/backend/app/qwen.py)
- 백엔드 라우트: [main.py](../../app/backend/app/main.py)

### 이 경로가 해결하려는 문제

사용자 목표는 분명했습니다.

- 참조 음성의 음색은 유지하고 싶다
- 동시에 `CustomVoice`의 `instruct` 제어도 쓰고 싶다

하지만 업스트림 공식 경로는 대체로 아래처럼 나뉩니다.

- `Base`
  - clone prompt 중심
- `CustomVoice`
  - `speaker + instruct` 중심

즉 "둘 다 한 번에" 쓰는 길이 공식 안정 경로로 정리돼 있지 않았습니다.  
그래서 별도 실험 경로를 분리해서 추가했습니다.

### 이 경로의 동작 방식

개념적으로는 아래와 같습니다.

1. `Base` 모델로 참조 음성에서 clone prompt를 생성
2. 그 prompt를 `CustomVoice` 생성 경로에 맞게 변환
3. `CustomVoice` 모델에 `instruct`와 함께 넣어 생성

즉 이 하이브리드 경로는 "모델을 합친다"기보다, **`Base`가 잘하는 음색 조건화와 `CustomVoice`가 잘하는 instruct 제어를 한 번의 실험적 생성 흐름 안에 배치**하는 방식입니다.

### 왜 별도 스크립트여야 했는가

사용자 요구는 "기존 업스트림 스크립트는 그대로 두고, 새로운 실험은 별도 스크립트로 분리"하는 것이었습니다.

그래서 현재는:

- 기존 examples는 유지
- 새 실험은 `test_model_12hz_custom_clone_instruct.py`로 분리

이 구조를 통해 "무엇이 공식 예제이고, 무엇이 데모 확장 실험인지"를 코드 차원에서 구분할 수 있습니다.

## 6. WEB UI에도 하이브리드 추론 카드가 추가되었습니다

하이브리드 경로는 스크립트에만 있지 않습니다.  
`Inference Lab` 안에 별도 카드로 노출됩니다.

사용자가 넣는 대표 입력:

- `Base model`
- `CustomVoice model`
- `ref_audio_path`
- `ref_text`
- `text`
- `instruct`
- 언어
- 샘플링 파라미터

즉 이 UI는 "향후 연구용 실험판" 같은 위치입니다.  
기존 `CustomVoice`, `VoiceClone` 경로와 섞지 않고, **실험 경로임을 드러내는 별도 블록**으로 유지하고 있습니다.

## 7. Whisper 기반 참조 음성 전사도 추론 파이프라인 일부가 되었습니다

최근 변경에서 중요한 보완 중 하나는, 참조 음성 기반 작업에 Whisper 전사를 연결한 것입니다.

이 기능은 특히 아래 경우에 중요합니다.

- 사용자가 참조 음성 파일은 갖고 있지만 transcript는 모를 때
- clone prompt 생성 전에 `ref_text`를 자동으로 채우고 싶을 때
- dataset builder에서 음성만 먼저 모으고 텍스트는 보조적으로 자동 생성하고 싶을 때

현재 기본 전사 모델은 `whisper-large-v3`를 우선 사용하도록 정리되어 있습니다.

이 변화는 추론 파이프라인 관점에서 중요합니다.  
왜냐하면 `voice clone`이나 hybrid 경로는 보통 `ref_text` 품질에 민감하기 때문입니다.

즉 Whisper는 별도 부가 기능이 아니라, **입력 정확도를 높여 주는 전처리형 추론 보조 단계**로 들어온 것입니다.

## 8. 추론 파이프라인 변경의 배경: instruct 보존 문제를 검증하기 위해서입니다

추론 파이프라인이 이렇게 확장된 이유는 단순히 기능을 많게 보이게 하려는 목적이 아니었습니다.

실제 핵심 질문은 아래였습니다.

- `Base` 파인튜닝 결과가 정말 `instruct`를 잘 따르는가?
- 그렇지 않다면 `CustomVoice Fine-Tune`이나 hybrid 경로가 대안이 될 수 있는가?

그래서 현재 추론 파이프라인은 "예쁜 데모"보다 **비교 실험에 적합한 구조**를 우선합니다.

예를 들어 한 화면에서 아래를 비교할 수 있어야 합니다.

- stock `CustomVoice`
- stock `Base` clone
- local fine-tuned `Base`
- local fine-tuned `CustomVoice`
- hybrid clone + instruct

이 요구가 `Inference Lab`과 `/api/generate/model` 추가의 근본 이유입니다.

## 9. 초심자가 꼭 기억해야 하는 구분

### `CustomVoice`

- 화자 선택과 `instruct` 제어 중심
- `speaker` 개념이 중요

### `VoiceClone`

- 참조 음성과 참조 텍스트 중심
- `ref_audio_path`, `ref_text`, `clone prompt`가 중요

### `VoiceDesign`

- 목소리 설명문으로 스타일을 설계하는 경로

### `Hybrid Clone + Instruct`

- `Base` clone prompt와 `CustomVoice` instruct를 조합하는 실험 경로
- 공식 기본 경로라기보다 연구/검증용 확장 경로로 이해하는 것이 좋음

### 통합 추론

- 모델을 먼저 선택하고
- 모델 유형에 맞는 폼을 동적으로 보여주는 구조

## 10. 지금의 추론 파이프라인이 주는 실제 장점

- 학습된 모델을 WEB UI에서 바로 시험 가능
- stock 모델과 fine-tuned 모델을 같은 화면에서 비교 가능
- 기능별 데모와 연구용 실험 경로를 동시에 유지 가능
- 하이퍼파라미터 조정 폭이 넓어 실제 품질 비교에 유리
- hybrid 같은 실험 경로도 제품형 UI에서 재현 가능

## 관련 문서

- 설치 및 실행: [01-install-and-run.md](./01-install-and-run.md)
- 백엔드 구조: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 구조: [03-frontend-guide.md](./03-frontend-guide.md)
- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
- examples와 파인튜닝 연결: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
- 학습 파이프라인 변경 상세: [06-training-pipeline-changes.md](./06-training-pipeline-changes.md)
