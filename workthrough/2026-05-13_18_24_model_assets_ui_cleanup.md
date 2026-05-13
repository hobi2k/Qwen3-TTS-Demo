# 모델 자산 UI 정리

## 작업 내용

- `나의 목소리들 > 프리셋/학습 결과`를 모델 상태, 프리셋, LoRA, 병합 모델 탭으로 분리했다.
- CosyVoice, VoxCPM, Supertonic, OmniVoice 프리셋을 모델별 그룹으로 묶어 표시하고, 각 프리셋의 사용/삭제 동선을 유지했다.
- VibeVoice LoRA와 병합 모델을 서로 다른 목록으로 분리했다.
- 병합 모델은 TTS 입력으로 잘못 보내지 않고 `VibeVoice Model Tools`의 병합 검증 화면으로 열리도록 바꿨다.
- OmniVoice와 Supertonic 생성 화면에서 `Vendor ready/missing`, `런타임` 노출을 제거하고 필요한 모델 상태 확인은 라이브러리의 모델 상태 탭으로 모았다.
- 오래된 라이브러리 안내 문구를 현재 탭 구조에 맞게 수정했다.
- Supertonic/OmniVoice 사이드바와 상단 메타 라벨을 기능명 중심으로 정리해 Qwen/S2-Pro 탭 구조와 더 일관되게 맞췄다.

## 검증

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `git diff --check`

## 다음 개선 후보

- CosyVoice, VoxCPM, Supertonic, OmniVoice도 학습 결과 산출물이 생기면 모델별 LoRA/병합/프리셋 목록에 자동으로 더 세분화해 표시한다.
- 모델 다운로드 상태에서 누락 항목별 실행 스크립트 안내를 버튼으로 연결한다.
