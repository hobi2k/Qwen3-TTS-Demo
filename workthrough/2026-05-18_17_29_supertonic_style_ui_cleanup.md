# Supertonic 스타일 UI 정리

## 개요
Supertonic의 기본 M1~F4 스타일을 다시 프리셋으로 저장하게 보이던 흐름을 제거했습니다. 참조 음성 기반 생성 화면은 학습이 아니라 스타일 만들기로 표현을 바꾸고, 사용자 화면에 개발자 설명이 노출되지 않게 정리했습니다.

## 주요 변경사항
- 수정한 것: `Supertonic 프리셋` 내비게이션과 렌더 화면 제거
- 개선한 것: `Supertonic 학습`을 `Supertonic 스타일 만들기`로 변경
- 개선한 것: `style vector`, `fine-tune`, `pitch/energy/spectral` 같은 내부 설명을 사용자용 문구로 교체
- 수정한 것: 새 Supertonic 스타일의 `kind`를 `custom_style`로 저장

## 결과
- ✅ `npm run build` 성공
- ✅ `PYTHONPYCACHEPREFIX=.pycache python3 -m py_compile app/backend/app/supertonic.py app/backend/app/main.py` 성공

## 다음 단계
- 기존에 저장된 label-only Supertonic 프리셋이 있으면 마이그레이션 또는 정리 정책 결정
