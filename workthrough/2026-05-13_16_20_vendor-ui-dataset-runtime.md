# 벤더 UI, 데이터셋, 모델 다운로드 정리

## 개요
CosyVoice, VoxCPM, OmniVoice의 데이터셋/학습 흐름을 기존 엔진들과 같은 방식으로 연결했다. 모델 다운로드 스크립트는 런타임 설치와 모델 다운로드를 분리하고, 누락 모델을 바로 발견하도록 검증을 추가했다.

## 주요 변경사항
- 개발한 것: CosyVoice/VoxCPM/OmniVoice용 공용 오디오 데이터셋 빌더와 학습 연결 UX 추가
- 수정한 것: VibeVoice/CosyVoice/VoxCPM/OmniVoice 다운로드 시 기본 런타임 설치를 비활성화하고 모델 폴더 검증 추가
- 개선한 것: 최근 생성 결과를 다운로드 가능한 `AudioCard`로 통일하고, Google Fonts 의존성을 제거해 오프라인 빌드 가능하게 변경

## 결과
- `./node_modules/.bin/tsc --noEmit` 통과
- `python3.11 -m py_compile app/backend/app/main.py app/backend/app/schemas.py` 통과
- `bash -n scripts/download_models.sh` 통과
- `npm run build` 통과

## 다음 단계
- PowerShell 스크립트는 현재 macOS에 `pwsh`가 없어 문법 실행 검증이 필요하다.
- 실제 CosyVoice/VoxCPM/OmniVoice 학습을 짧은 샘플 데이터셋으로 한 번씩 dry-run 검증하는 것이 좋다.
