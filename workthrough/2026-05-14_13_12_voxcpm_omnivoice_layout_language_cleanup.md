# VoxCPM/OmniVoice 생성 화면 정리

## 작업 내용

- VoxCPM과 OmniVoice 생성 화면의 상단 중복 모드 미니탭을 제거했다.
- `Text`는 본문 첫 입력으로 두고, `Task/Mode`, `Model`, `Language`는 오른쪽 생성 설정 카드로 분리했다.
- CosyVoice, VoxCPM, OmniVoice에서 모델 언어 코드를 직접 입력하지 않고 드롭다운으로 선택하도록 공통 `ModelLanguageSelect`를 추가했다.
- VoxCPM/OmniVoice 프리셋 및 OmniVoice 배치 생성의 언어 입력도 드롭다운으로 바꿨다.
- VoxCPM/OmniVoice의 큰 네이티브 체크박스를 기존 UI 톤에 맞는 `Switch` 카드로 교체했다.
- VoxCPM/OmniVoice 생성 요청이 현재 사이드바 탭 기준 task를 사용하도록 정리했다.

## 검증

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `git diff --check`
- Headless Chrome 스크린샷: `/private/tmp/voxcpm-tts-fixed-2.png`
- Headless Chrome 스크린샷: `/private/tmp/omnivoice-tts-fixed-2.png`
