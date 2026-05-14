# CosyVoice 생성 화면 레이아웃 정리

## 작업 내용

- CosyVoice 생성 화면에서 상단 중복 모드 미니탭을 실제 코드에서 제거했다.
- `Text`를 본문 첫 입력으로 두고, `Task / Model`은 오른쪽 생성 설정 카드로 분리해 사이드바 탭과 중복되지 않게 정리했다.
- instruct, prompt transcript, voice conversion 원본 음성, 참조 음성 입력을 본문 하위 영역으로 재정렬했다.
- `Language / Seed / Format`을 하단 보조 옵션 카드로 묶었다.
- URL로 `?tab=cosyvoice_tts` 직접 진입해도 `Task`가 빈 셀렉트처럼 보이지 않도록 현재 탭 기준 task 값을 렌더 단계에서 보정했다.
- CosyVoice 사이드바와 메타 라벨을 `목소리 프리셋`, `데이터셋 만들기`, `학습 실행`처럼 기능명 중심으로 수정했다.

## 검증

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- Headless Chrome 스크린샷: `/private/tmp/cosyvoice-headless-fixed.png`
