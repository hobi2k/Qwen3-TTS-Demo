# CosyVoice 고급 옵션 및 지시문 UI 정리

## 작업 내용
- CosyVoice 생성 요청에 실제로 적용되는 고급 옵션을 추가했다.
- 말투 지시문 영역에서 어색한 종료 토큰 노출을 제거하고, 생성 요청 단계에서 필요한 형식을 자동 보정하도록 바꿨다.
- CosyVoice 실행 스크립트가 `speed`, `stream`, `zero_shot_spk_id`, `text_frontend`를 실제 추론 함수에 전달하도록 연결했다.

## 변경 사항
- `speed`: 0.5-2.0 범위로 입력 가능하며, 스트리밍 모드에서는 안전하게 1.0으로 고정된다.
- `stream`: 긴 문장 첫 출력 대기시간을 줄이는 옵션으로 UI에서 직접 켜고 끌 수 있다.
- `text_frontend`: 숫자, 기호, 다국어 문장 정규화 여부를 UI에서 직접 조절할 수 있다.
- `zero_shot_spk_id`: 참조 음성에서 바로 추출하거나 저장된 화자 ID를 지정할 수 있게 했다.
- `label`: CosyVoice 출력 이름을 고급 옵션에서 지정할 수 있게 했다.

## 검증
- `python3.11 -m py_compile app/backend/app/schemas.py scripts/run_cosyvoice_generate.py`
- `npm run build`
- `git diff --check`

## 다음 개선 후보
- CosyVoice 실제 생성 샘플을 한 번 돌려 `speed`와 `stream` 조합별 결과 품질을 UI 안내에 반영하면 더 좋다.
