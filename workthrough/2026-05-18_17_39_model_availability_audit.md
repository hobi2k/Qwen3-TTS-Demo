# 모델 가용성 점검 및 빈 모델 폴더 차단

## 개요
CosyVoice, VoxCPM, OmniVoice, Supertonic, VibeVoice, S2-Pro의 모델 가용성 판단을 실제 파일 기준으로 점검했다. 빈 디렉터리만 있어도 사용 가능으로 보이던 경로를 막고, 프런트 생성/학습 버튼도 같은 기준을 따르도록 맞췄다.

## 주요 변경사항
- 수정한 것: CosyVoice/VoxCPM/OmniVoice 모델 variant 판정을 실제 가중치 파일 기준으로 변경
- 수정한 것: Supertonic ONNX와 기본 voice style 파일이 없으면 unavailable로 표시
- 개선한 것: VibeVoice와 S2-Pro 상태도 빈 폴더가 아니라 실제 파일/필수 파일 기준으로 판단
- 개선한 것: CosyVoice 기본 선택값을 현재 다운로드 스크립트 기본값인 `CosyVoice2-0.5B`와 일치시킴
- 개선한 것: 프런트 생성/학습 버튼을 runtime/model availability와 연결

## 결과
- ✅ 백엔드 py_compile 성공
- ✅ 프런트 `npm run build` 성공
- ✅ 로컬 상태 확인: CosyVoice2, OmniVoice, S2-Pro, VibeVoice 1.5B 사용 가능
- ✅ 로컬 상태 확인: VoxCPM, Supertonic은 모델 파일 미설치로 unavailable

## 다음 단계
- `./scripts/download_models.sh voxcpm`으로 VoxCPM2 가중치 설치
- `./scripts/download_models.sh supertonic`으로 Supertonic ONNX/voice style 설치
- VibeVoice 7B가 필요하면 `./scripts/download_models.sh vibevoice-7b` 재실행
