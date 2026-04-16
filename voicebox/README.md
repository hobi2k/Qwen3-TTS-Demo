# VoiceBox Scripts

이 폴더는 `VoiceBox` 전용 엔트리포인트를 한곳에 모아 둔 작업 디렉터리입니다.

원칙:

- 기존 `scripts/`와 `Qwen3-TTS` 안의 기존 경로는 그대로 유지합니다.
- 이 폴더는 `VoiceBox` 제작부터 추가 학습, 일반 지시 추론, clone, clone + instruct,
  허깅페이스 업로드까지를 한 세트로 따라가기 위한 복사본/전용 진입점입니다.
- 공통 런타임 로직은 이 폴더 안의 `runtime.py`와 `clone_low_level.py`에 둡니다.

구성:

- `make_checkpoint.py`
  - plain `CustomVoice` 체크포인트에 `Base 1.7B`의 `speaker_encoder`를 합쳐
    self-contained `VoiceBox` 체크포인트를 만듭니다.
- `bootstrap.py`
  - `CustomVoice + Base 1.7B`로 첫 `VoiceBox`를 학습/생성합니다.
- `retrain.py`
  - 기존 `VoiceBox`만으로 추가 학습합니다.
- `infer_instruct.py`
  - `VoiceBox`를 일반 `CustomVoice`처럼 불러 `speaker + instruct` 추론을 실행합니다.
- `clone.py`
  - embedded `speaker_encoder`를 쓰는 clone 실험 진입점입니다.
- `clone_instruct.py`
  - embedded `speaker_encoder`를 쓰는 clone + instruct 실험 진입점입니다.
- `upload_to_hub.py`
  - `VoiceBox` 체크포인트를 허깅페이스 모델 저장소로 올립니다.

기본 예시:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo

# 1) 기존 CustomVoice -> VoiceBox 체크포인트 변환
.venv/bin/python voicebox/make_checkpoint.py \
  --input-checkpoint data/finetune-runs/mai_ko_customvoice17b_full/final \
  --speaker-encoder-source data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --output-checkpoint data/finetune-runs/mai_ko_voicebox17b_full/final

# 2) VoiceBox 지시 추론
.venv/bin/python voicebox/infer_instruct.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_retrain/final \
  --speaker mai \
  --language Korean \
  --text "안녕하세요. VoiceBox 테스트입니다." \
  --instruct "Speak naturally and calmly."
```
