# UI 체크박스 및 토글 정리

## 개요
전역 UI에서 기본 브라우저 checkbox와 대충 붙은 inline switch 라벨을 제거하고, Voice Studio의 어두운 그리드 테마에 맞춘 공통 토글 카드 패턴으로 정리했다. 생성 갤러리는 실제 캡처를 확인하며 선택 컨트롤이 썸네일과 헷갈리지 않도록 pill 버튼으로 바꿨다.

## 주요 변경사항
- 개선한 것: `ToggleCard` 공통 컴포넌트를 추가해 학습/추론 옵션 토글의 스타일을 통일
- 수정한 것: 생성 갤러리 선택 checkbox를 `선택/선택됨` pill 버튼으로 교체
- 개선한 것: CosyVoice, VoxCPM, Supertonic, OmniVoice, VibeVoice, ACE-Step 옵션 영역의 낡은 checkbox/inline switch UI를 카드형 토글로 정리
- 검증한 것: 갤러리, VibeVoice 학습, Supertonic TTS, OmniVoice 데이터셋, ACE-Step 화면을 headless Chrome 스크린샷으로 확인

## 결과
- ✅ `./node_modules/.bin/tsc --noEmit` 통과
- ✅ `npm run build` 통과
- ✅ `git diff --check` 통과

## 다음 단계
- 각 모델별 고급 옵션 `details` 패널의 정보 밀도와 정렬을 한 번 더 캡처 기반으로 다듬기
- 사이드바가 긴 모델 목록에서 현재 섹션을 더 쉽게 찾도록 접기/검색 UX 검토
