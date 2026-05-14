# VoxCPM 고급 옵션, 디바이스 선택, LoRA 선택 개선

## 작업 내용
- VoxCPM 생성 화면에 실제 추론 요청으로 전달되는 고급 옵션 영역을 정리했다.
- 디바이스를 직접 입력하지 않고 드롭다운으로 선택할 수 있게 했다.
- VoxCPM 학습 결과 LoRA를 나의 목소리들에서 불러와 생성 화면에서 선택할 수 있게 했다.

## 변경 사항
- `디바이스`: 자동, CUDA, CUDA 0, Apple MPS, CPU 중 선택.
- `고급 옵션`: CFG, 추론 단계, 최소/최대 길이, 텍스트 정규화, 참조 음성 정리, 디노이저, 최적화 옵션을 접이식 영역으로 정리.
- `LoRA 가중치`: 나의 목소리들에 저장된 VoxCPM 학습 결과를 선택하거나 폴더 경로를 직접 입력 가능.
- `나의 목소리들 > VoxCPM`: 프리셋과 훈련한 모델을 구분해서 표시.
- VoxCPM 학습 완료 후 자산 목록을 자동 갱신.

## 검증
- `python3.11 -m py_compile app/backend/app/main.py app/backend/app/schemas.py scripts/run_voxcpm_generate.py`
- `npm run build`
- `git diff --check`
