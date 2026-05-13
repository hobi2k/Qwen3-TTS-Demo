# 작업 요약

- VibeVoice는 `download_models.sh`/`.ps1`에서 런타임 venv 설치 코드를 제거하고, 모델 weight만 받도록 정리했다.
- VibeVoice, CosyVoice, VoxCPM, Supertonic의 오디오 입력 UI를 `AudioSourceField`/`MultiAudioSourceField`로 통합해 생성 갤러리 선택, 업로드, 직접 경로 입력이 한 흐름 안에서 보이게 했다.
- VibeVoice TTS에는 LoRA checkpoint 선택 select를 추가하고, `speaker_name`/`speaker_names`/`speaker_audio_paths` 의미가 드러나도록 라벨을 바꿨다.
- `나의 목소리들`에 외부 모델 탭을 추가해 VibeVoice 모델 자산, CosyVoice/VoxCPM/Supertonic/OmniVoice 프리셋을 한곳에서 보고 생성에 사용할 수 있게 했다.
- README와 설치 가이드에서 VibeVoice가 `.venv-vibevoice`를 만든다는 오래된 설명을 제거했다.

# 검증

- `bash -n scripts/download_models.sh`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `git diff --check`

# 남은 개선

- `download_models` 진행 상태를 `data/runtime/model-downloads/*.json`으로 저장하고 웹에서 다운로드 중/완료/누락 상태를 직접 보여주는 API를 추가하면 좋다.
- vendor preset 다운로드 endpoint를 통일하면 `나의 목소리들`에서 모든 자산에 다운로드 버튼을 붙일 수 있다.
