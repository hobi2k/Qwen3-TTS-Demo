# 학습 화면 개발자 설명 제거

## 작업 내용
- CosyVoice 학습 화면의 내부 처리 단계 설명을 사용자용 안내로 교체했다.
- 같은 유형의 VoxCPM 학습 화면 설명도 함께 정리했다.

## 변경 사항
- `prepare`, `extract_embedding`, `speech_tokenizer`, `make_parquet`, `torchrun` 같은 내부 단계명을 화면에서 제거했다.
- 내부 저장 경로를 설명 문장으로 노출하지 않도록 정리했다.
- CosyVoice 학습 폼의 주요 라벨을 `학습 데이터셋`, `학습 대상`, `학습 방식`, `반복 횟수`처럼 사용자 기준 용어로 바꿨다.

## 검증
- `rg`로 해당 개발자 문구가 프론트엔드 화면 코드에 남아있지 않은 것을 확인했다.
- `npm run build`
- `git diff --check`
