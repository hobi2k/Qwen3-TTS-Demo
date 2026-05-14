# 생성 갤러리 프리셋 그룹 개선

## 작업 내용
- 생성 갤러리의 `프리셋별` 모드를 실제 섹션 그룹 렌더링으로 변경했다.
- 모델 필터를 먼저 적용한 뒤 해당 범위 안의 프리셋/목소리 자산만 드롭다운에 표시하도록 정리했다.
- Qwen, S2-Pro 외에 VibeVoice, CosyVoice, VoxCPM, Supertonic, OmniVoice 결과도 가능한 경우 저장된 프리셋/목소리 자산과 매칭되도록 보강했다.
- 프리셋 드롭다운에 각 그룹별 결과 개수를 표시하도록 했다.
- CosyVoice, VoxCPM, Supertonic, OmniVoice 새 생성 요청에는 사용한 `preset_name`을 생성 이력 메타데이터에 저장하도록 했다.

## 검증
- `npm run build`
- `python3.11 -m py_compile app/backend/app/schemas.py app/backend/app/main.py`
- `git diff --check`

## 다음 개선 후보
- 각 생성 API가 사용한 프리셋 이름/ID를 메타데이터에 명시적으로 저장하면, 과거 파일 경로/프롬프트 매칭보다 더 정확하게 그룹화할 수 있다.
