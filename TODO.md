# TODO

이 문서는 지금 바로 이어서 손봐야 하는 구조적 작업을 짧게 적어두는 메모가 아니라,
다음 구현에서 절대 놓치면 안 되는 핵심 유지보수 과제를 명확히 남기기 위한 문서입니다.

## 1. CustomVoice Fine-Tune 결과를 self-contained checkpoint로 만들기

현재 `CustomVoice Fine-Tune` 경로는 학습 시 새 화자를 붙이기 위해
`Base` 체크포인트의 `speaker_encoder`를 **보조 입력으로 빌려 쓰는 방식**입니다.

관련 스크립트:

- [sft_custom_voice_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_custom_voice_12hz.py)
- [sft_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_12hz.py)

### 현재 상태

- `CustomVoice` 체크포인트만으로는 새 화자 추가 학습이 완전히 닫히지 않습니다.
- 학습 시에는 `speaker_encoder_model_path`로 `Base` 모델을 별도로 넘겨야 합니다.
- 학습이 끝난 뒤 저장되는 fine-tuned `CustomVoice` 결과물도 기본적으로는
  `speaker_encoder`를 포함하지 않는 export 형태에 가깝습니다.

즉 지금 구조는:

1. `CustomVoice`를 시작 모델로 사용
2. `Base`의 `speaker_encoder`를 외부에서 가져옴
3. 새 화자 임베딩을 학습
4. 결과 체크포인트는 추론용으로는 쓸 수 있지만,
   다음 번 추가 fine-tuning에서도 다시 `Base speaker_encoder` 의존성이 생김

### 왜 이 작업이 필요한가

프로젝트 목표는 단순히 “한 번 학습된다”가 아니라:

- 유지보수가 쉬워야 하고
- 모델 구조가 이해 가능해야 하며
- 결과 체크포인트 하나만으로 다시 이어서 학습할 수 있어야 하고
- 사용자나 운영자가 나중에 `Base` 체크포인트 경로를 다시 맞추지 않아도 돼야 합니다

그래서 최종적으로는 fine-tuned `CustomVoice` 모델이 아래 조건을 만족해야 합니다.

### 목표 상태

- fine-tuned `CustomVoice` 체크포인트 안에 `speaker_encoder` 가중치가 포함된다
- 그 체크포인트 하나만으로 다시 `CustomVoice Fine-Tune`을 이어서 할 수 있다
- `speaker_encoder_model_path`는 선택 옵션이 되거나, 아예 없어도 동작한다
- WEB UI에서도 “이 모델은 독립적으로 재학습 가능한 self-contained CustomVoice checkpoint”인지 보이게 한다

### 완료 조건

아래 조건을 모두 만족해야 이 TODO를 완료로 봅니다.

1. `sft_custom_voice_12hz.py` 결과 체크포인트에 `speaker_encoder.*` 가중치가 실제로 저장된다
2. 그 결과 체크포인트만을 `--init_model_path`로 사용해 추가 fine-tuning이 성공한다
3. 추가 fine-tuning 시 `--speaker_encoder_model_path` 없이도 동작한다
4. WEB UI `Training Lab`과 `Inference Lab`에서 이 self-contained 모델이 정상적으로 보이고 추론된다
5. 관련 문서에 “기존 구조”와 “변경 후 구조”가 모두 설명된다

### 구현 시 주의사항

- 기존 stock `Base`, stock `CustomVoice`, stock `VoiceDesign` 모델은 절대 수정하지 않습니다.
- 업스트림 원본 스크립트의 의미를 흐리지 않도록, 변경은 별도 함수/분기/문서로 명확히 남깁니다.
- 단순히 저장 크기만 늘리는 식으로 끝내지 말고,
  실제 재학습 가능성까지 검증해야 합니다.

## 2. FlashAttention 2 운영 검증 유지

WSL/Linux 기준 `flash-attn` v2 설치 경로는 이미 확보했고, 실제 CUDA smoke test도 통과했습니다.
현재 원칙은 아래와 같습니다.

- Linux + CUDA: `flash_attention_2`
- macOS, CPU, MPS, 또는 FlashAttention 미지원 환경: `sdpa`

이 항목은 “새 설치 경로를 찾기”가 아니라, 앞으로도 아래 조건을 깨지 않도록 유지하는 운영 TODO입니다.

### 유지 조건

1. 새 환경 셋업 문서가 항상 `flash-attn v2` Linux wheel 경로를 기준으로 유지된다
2. 백엔드와 새 스크립트가 Linux CUDA에서 `flash_attention_2`를 우선 선택한다
3. `sdpa`는 unsupported 환경 fallback으로만 남는다
4. PyTorch/CUDA 조합이 바뀌면 GPU smoke test를 다시 통과한 뒤에만 문서를 수정한다
