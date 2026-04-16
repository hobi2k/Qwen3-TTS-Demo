# VoiceBox 문서

이 폴더는 `VoiceBox` 전용 문서를 모아 둔 기준 위치입니다.

`VoiceBox`는 다음 개념을 함께 다룹니다.

- plain `CustomVoice` 체크포인트에 `Base 1.7B`의 `speaker_encoder`를 합쳐
  self-contained 체크포인트를 만드는 과정
- `VoiceBox -> VoiceBox` 추가 파인튜닝 경로
- embedded `speaker_encoder`를 실제로 쓰는 clone / clone + instruct 실험 경로

문서 순서:

1. [체크포인트 변환](./01-checkpoint-conversion.md)
2. [파인튜닝](./02-finetuning.md)
3. [clone 실험](./03-clone-experiment.md)
4. [clone + instruct 실험](./04-clone-plus-instruct.md)
