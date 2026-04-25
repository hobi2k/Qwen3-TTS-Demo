# TODO

이 문서는 지금 구조가 거의 완성 단계에 들어온 뒤에도, 다음 구현에서 절대 놓치면 안 되는 남은 핵심 과제를 적어두는 문서입니다.

## 1. VoiceBox self-contained checkpoint 경로 유지

plain `CustomVoice Fine-Tune` 경로는 학습 시 새 화자를 붙이기 위해
`Base 1.7B` 체크포인트의 `speaker_encoder`를 보조로 빌려 씁니다.

이 문제를 해결하기 위해 현재 프로젝트는 별도 `VoiceBox` 경로를 둡니다.

1. plain `CustomVoice`에 새 화자 추가 학습
2. `Base 1.7B`의 `speaker_encoder`를 합쳐 self-contained `VoiceBox`로 변환
3. `VoiceBox -> VoiceBox` 추가 학습

관련 스크립트:

- [sft_plain_custom_voice_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/voicebox/sft_plain_custom_voice_12hz.py)
- [make_checkpoint.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/voicebox/make_checkpoint.py)
- [sft_voicebox_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/voicebox/sft_voicebox_12hz.py)

### 현재 상태

- plain `CustomVoice` checkpoint:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- self-contained `VoiceBox` checkpoint:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습 결과:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`
- 추가 학습된 VoiceBox에서 clone / clone + instruct 생성 검증 완료

### 목표 상태

- VoiceBox 체크포인트 안에 `speaker_encoder.*` 가중치가 포함된다
- 그 체크포인트 하나만으로 다시 fine-tune을 이어서 할 수 있다
- `demo_model_family = "voicebox"`와 `speaker_encoder_included = true` 메타데이터를 유지한다
- clone / clone + instruct 경로를 계속 회귀 검증한다

### 완료 조건

1. 결과 체크포인트에 `speaker_encoder.*` 가중치가 실제로 저장된다: 완료
2. 그 체크포인트만으로 추가 fine-tune이 성공한다: 완료
3. `speaker_encoder_model_path` 없이도 추가 fine-tune이 된다: 완료
4. clone / clone + instruct 샘플 생성이 된다: 완료
5. aggressive instruct에서도 문장 보존이 안정적인 전략을 고른다: 진행 중

현재 안정 후보:

- `embedded_encoder_only`

주의 후보:

- `embedded_encoder_with_ref_code`
  - clone은 되지만, 공격적인 instruct에서 문장 보존이 한 번 흔들렸습니다.

## 2. 프런트 visual system 정리

현재 정보 구조는 거의 자리 잡았지만, 시각 언어는 아직 더 손봐야 합니다.

남은 과제:

- fish.audio 수준의 더 살아 있는 motion / waveform / hover affordance 정리
- “박스형 카드 반복”이 아닌 리스트/리듬 중심 레이아웃으로 정리
- `텍스트 음성 변환`, `목소리 복제`, `사운드 효과` 화면의 정보 밀도 재조정

## 3. 학습 결과 모델 선택 UX 정리

현재 방향은 “중간 epoch를 전부 노출”이 아니라 “run당 최종 선택 모델 하나”입니다.

남은 과제:

- 학습 완료 후 대표 모델을 더 명확히 표시
- `나의 목소리들`에서 최종 모델만 자연스럽게 보이게 정리
- 중간 체크포인트 관리 정책 문서화

## 4. Audio Tools 운영 문서 보강

`Applio / RVC`, `MMAudio`는 연결은 되어 있지만, 운영 문서가 아직 더 필요합니다.

남은 과제:

- RVC 모델 `.pth + .index` 교체 방법
- MMAudio 체크포인트 교체 방법
- 문제 발생 시 capability 진단 흐름

## 5. FlashAttention 2 운영 검증 유지

WSL/Linux 기준 `flash-attn` v2 설치 경로는 확보했고, GPU smoke test도 통과했습니다.

유지 조건:

1. Linux + CUDA에서는 `flash_attention_2` 우선
2. macOS / 미지원 환경에서만 `sdpa`
3. PyTorch/CUDA 조합이 바뀌면 문서보다 먼저 smoke test 재검증

## 6. Optimizer 운영 정책 유지

현재 1.7B full fine-tuning에서는 optimizer 선택을 환경 변수로 제어합니다.

- 기본: `QWEN_DEMO_OPTIMIZER=adamw`
- RTX 5080 16GB full run 검증: `QWEN_DEMO_OPTIMIZER=adafactor`

`Adafactor`는 품질 향상용 설정이 아니라 optimizer state 메모리 피크를 낮춰
학습을 끝까지 완료하기 위한 안정화 선택입니다.

유지 조건:

1. 새 학습 결과 문서에 optimizer를 반드시 기록한다
2. AdamW로 실패하거나 GPU가 불안정했던 경우를 숨기지 않는다
3. 품질 판정은 optimizer 이름이 아니라 실제 생성음, 전사, speaker similarity로 한다
