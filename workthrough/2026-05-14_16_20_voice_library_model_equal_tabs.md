# 나의 목소리들 모델별 동등 탭 정리

## 개요
`나의 목소리들` 화면에서 Qwen, S2-Pro만 최상위로 보이고 나머지 모델이 `프리셋/학습 결과`에 묶여 있던 구조를 정리했다. VibeVoice, CosyVoice, VoxCPM, Supertonic, OmniVoice도 같은 레벨의 탭으로 승격해 모델별 프리셋과 학습 결과를 동등하게 찾을 수 있게 했다.

## 주요 변경사항
- 개발한 것: VibeVoice, CosyVoice, VoxCPM, Supertonic, OmniVoice 전용 최상위 탭 추가
- 수정한 것: `model_assets` 묶음 탭과 내부 미니탭 제거
- 개선한 것: 각 모델 탭에서 사용, 삭제, 관련 생성/학습 화면 이동 흐름을 직접 제공

## 결과
- 빌드 성공: `npm run build`
- 화면 확인: `나의 목소리들` 탭에서 모든 모델이 같은 줄의 동등한 탭으로 표시됨

## 다음 단계
- 모델별 프리셋 카드에 미리듣기 또는 대표 샘플 오디오가 있으면 함께 표시
- VibeVoice LoRA와 병합 모델도 필요하면 다운로드 버튼을 추가
