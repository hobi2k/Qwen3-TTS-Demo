# VibeVoice 7B 다운로드 및 TTS 레이아웃 수정

## 작업 내용

- `scripts/download_models.sh`와 `scripts/download_models.ps1`에서 `all`, `vibevoice`, `vibevoice-7b` 프로필이 모두 VibeVoice 7B weight를 받도록 변경했다.
- README와 VibeVoice/Backend cookbook에서 7B를 별도 opt-in으로 설명하던 문구를 현재 동작에 맞게 수정했다.
- VibeVoice TTS 상단 입력을 `Model / Output name / Text` 순서로 재배치했다.
- 참조 음성 선택 UI를 `경로 / 생성 갤러리 / 파일 선택` 미니탭으로 변경했다.
- 단일 화자 라벨과 LoRA checkpoint 영역을 별도 카드형 행으로 정리하고, LoRA 선택과 직접 경로 입력이 한 줄 안에서 자연스럽게 보이도록 바꿨다.

## 검증

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `bash -n scripts/download_models.sh`
- `git diff --check`

## 참고

- 현재 macOS 환경에는 `pwsh`가 없어 `download_models.ps1`의 PowerShell 파서 검사는 직접 실행하지 못했다.
