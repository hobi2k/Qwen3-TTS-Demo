# TODO

이 문서는 지금 구조가 거의 완성 단계에 들어온 뒤에도, 다음 구현에서 절대 놓치면 안 되는 남은 핵심 과제를 적어두는 문서입니다.

## 1. CustomVoice Fine-Tune 결과를 self-contained checkpoint로 만들기

현재 `CustomVoice Fine-Tune` 경로는 학습 시 새 화자를 붙이기 위해
`Base` 체크포인트의 `speaker_encoder`를 보조로 빌려 쓰는 구조입니다.

관련 스크립트:

- [sft_custom_voice_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_custom_voice_12hz.py)
- [sft_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_12hz.py)

### 현재 상태

- `CustomVoice` 체크포인트만으로는 새 화자 추가 학습이 완전히 닫히지 않습니다.
- 학습 시 `speaker_encoder_model_path`로 `Base` 모델을 별도로 넘겨야 합니다.
- 저장된 fine-tuned `CustomVoice` 결과물도 완전한 self-contained 재학습 체크포인트는 아닙니다.

### 목표 상태

- fine-tuned `CustomVoice` 체크포인트 안에 `speaker_encoder` 가중치가 포함된다
- 그 체크포인트 하나만으로 다시 `CustomVoice Fine-Tune`을 이어서 할 수 있다
- `speaker_encoder_model_path`는 선택 옵션이 되거나 없어도 동작한다

### 완료 조건

1. 결과 체크포인트에 `speaker_encoder.*` 가중치가 실제로 저장된다
2. 그 체크포인트만으로 추가 fine-tune이 성공한다
3. `speaker_encoder_model_path` 없이도 추가 fine-tune이 된다
4. 문서에 기존 구조와 변경 후 구조가 모두 설명된다

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
