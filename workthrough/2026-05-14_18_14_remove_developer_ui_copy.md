# 개발자용 UI 문구 제거

## 작업 내용
- VibeVoice 학습 결과 빈 상태에서 `Microsoft 공식 finetuning-asr/lora_finetune.py` 같은 내부 구현 설명을 제거했다.
- VibeVoice, VoxCPM, OmniVoice, MMAudio, ACE-Step 관련 화면 문구에서 `upstream`, `checkout`, `script`, `공식` 같은 개발자용 표현을 사용자 작업 중심 문구로 바꿨다.
- Voice Design 가이드에서도 특정 엔진명과 공식 가이드 노출을 줄이고, 프롬프트 작성 원칙만 남겼다.

## 검증
- 프론트 코드에서 `upstream`, `checkout`, `Microsoft 공식`, `finetuning-asr`, `lora_finetune`, `공식` 문구 검색 결과 없음.
- `npm run build`
- `git diff --check`
