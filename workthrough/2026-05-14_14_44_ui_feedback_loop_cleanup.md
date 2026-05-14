# UI 피드백 루프 정리

## 개요
스크린샷을 확인하며 CosyVoice, VibeVoice, VoxCPM, OmniVoice, Supertonic, 학습/데이터셋 화면을 3회 루프로 점검했다. 특히 CosyVoice의 `Instruct text` 안내가 이상하게 줄바꿈되던 문제와 VibeVoice TTS의 입력 배치 불균형을 수정했다.

## 주요 변경사항
- 수정한 것: CosyVoice `Instruct text` 라벨을 필드명, `영어 권장` 배지, `<|endofprompt|>` 토큰으로 분리
- 수정한 것: CosyVoice/VoxCPM의 긴 prompt label을 작은 보조 배지로 분리
- 개선한 것: VibeVoice TTS에서 `Text`를 가장 먼저 넓게 배치하고 `Model / Output name`을 설정 그룹으로 이동
- 개선한 것: OmniVoice 템플릿 카드의 고정 `bg-white`를 테마 대응 `bg-surface`로 변경
- 개선한 것: 토글 카드 활성 배경을 중립화해 스위치와 테두리 중심으로 상태를 읽게 정리

## 결과
- ✅ `./node_modules/.bin/tsc --noEmit` 통과
- ✅ `npm run build` 통과
- ✅ `git diff --check` 통과
- ✅ CosyVoice, VoxCPM, OmniVoice, Supertonic, VibeVoice, 학습/데이터셋 화면 스크린샷 확인

## 다음 단계
- 사이드바가 긴 모델 목록에서 잘리는 문제를 접기/검색/섹션 sticky 방식으로 추가 개선
- 라이트 테마 기준으로도 동일한 화면군을 한 번 더 캡처해 대비와 여백 점검
