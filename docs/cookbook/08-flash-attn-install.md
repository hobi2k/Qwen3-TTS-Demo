# FlashAttention 설치 가이드

이 문서는 `Qwen3-TTS-Demo`를 Linux + NVIDIA CUDA 환경에서 실행할 때 `FlashAttention`을 어떻게 준비하는지 설명합니다.

이 프로젝트의 목표는 가능하면 `sdpa`가 아니라 `FlashAttention`을 사용해 추론과 학습을 더 빠르고 안정적으로 돌리는 것입니다.
다만 운영체제, CUDA 버전, PyTorch 빌드 조합에 따라 설치 경로가 달라질 수 있으므로, 이 문서는 현재 이 저장소에서 실제로 확인한 경로를 기준으로 적습니다.

## 1. 언제 필요한가

다음 조건이면 이 문서를 따르는 것이 좋습니다.

- Linux 또는 WSL2에서 실행한다.
- NVIDIA GPU를 사용한다.
- `torch.cuda.is_available()`가 `True`다.
- 이 프로젝트의 Qwen3-TTS 추론 또는 파인튜닝을 실제 CUDA로 돌린다.

반대로 아래 환경에서는 `sdpa` fallback이 정상입니다.

- macOS
- CPU-only 환경
- CUDA 툴체인과 PyTorch wheel 조합이 맞지 않아 `FlashAttention` 설치가 불가능한 환경

## 2. 현재 프로젝트 기준 권장 경로

이 저장소에서 현재 사용한 조합은 아래와 같습니다.

- PyTorch: `2.11.0`
- CUDA runtime line: `cu130`
- GPU: RTX 5080 계열
- 권장 패키지: `flash_attn_3`

소스 빌드 기반 `flash-attn`은 이 조합에서 설치가 쉽게 깨질 수 있었기 때문에, 현재는 third-party prebuilt wheel 인덱스를 우선 사용합니다.

참고 사이트:

- https://windreamer.github.io/flash-attention3-wheels/

위 사이트에는 `CUDA 13.0, PyTorch 2.11.0`용 wheel 인덱스가 올라와 있습니다.

## 3. 설치 명령

프로젝트 루트에서 아래 명령을 실행합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
uv pip install --no-cache-dir flash_attn_3 --find-links https://windreamer.github.io/flash-attention3-wheels/cu130_torch2110
```

이 명령은 wheel을 직접 받아 설치하므로, WSL에서 장시간 `nvcc` 소스 빌드를 돌리며 시스템이 멈추는 문제를 피하는 데 유리합니다.

## 4. 설치 확인

설치 직후 아래 명령으로 확인합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
uv pip show flash-attn-3
python -c "import importlib.util; print(importlib.util.find_spec('flash_attn_3') is not None)"
python -c "import flash_attn_3; print(flash_attn_3.__path__)"
```

정상이라면:

- `uv pip show flash-attn-3`가 버전 정보를 출력합니다.
- `find_spec('flash_attn_3')`가 `True`를 출력합니다.
- `flash_attn_3.__path__`가 site-packages 경로를 보여줍니다.

## 5. 프로젝트가 이 패키지를 어떻게 사용하나

이 저장소는 CUDA 환경에서 attention 구현을 아래 우선순위로 고릅니다.

1. `flash_attn_3`가 설치되어 있으면 `flash_attention_3`
2. 그렇지 않고 `flash_attn`이 설치되어 있으면 `flash_attention_2`
3. 둘 다 없으면 `sdpa`

즉 Linux + CUDA 머신에서 `flash_attn_3`를 설치하면, 백엔드 추론과 파인튜닝 스크립트는 자동으로 `flash_attention_3`를 우선 사용합니다.

## 6. 왜 source build보다 wheel을 우선하나

이 프로젝트에서는 WSL + 최신 GPU + CUDA 13.x 조합에서 source build 방식이 자주 불안정했습니다.

문제로 나타난 증상:

- `flash-attn` 컴파일 시간이 매우 길어짐
- `nvcc` 또는 `ninja`가 장시간 시스템 리소스를 점유함
- WSL이 얼어붙거나 세션이 끊김
- 소스 빌드 마지막 단계에서 extension compile 실패

반면 prebuilt wheel 경로는 아래 장점이 있습니다.

- 컴파일 단계를 생략한다.
- 설치 시간이 짧다.
- WSL 전체가 멈출 확률이 훨씬 낮다.
- 같은 환경에서 재현이 쉽다.

## 7. 주의사항

- 이 wheel 인덱스는 upstream 공식 PyPI가 아니라 third-party 배포처입니다.
- 따라서 운영 환경에 도입할 때는 팀 정책에 맞춰 출처 검토가 필요할 수 있습니다.
- `flash_attn_3`가 설치되어 있어도, 실제 모델은 CUDA + `bf16/fp16` 쪽에서 사용하는 것이 맞습니다.
- CPU에서 `flash_attention_3`를 강제로 쓰는 것은 권장되지 않습니다.
- 업스트림 tokenizer 서브모듈은 여전히 `flash_attn` v2 Python interface를 기대합니다.
  그래서 일부 로그에는 tokenizer 쪽만 manual PyTorch 경로라는 안내가 보일 수 있습니다.
  이 경우에도 메인 Qwen 모델 로더는 별도로 `flash_attention_3`를 사용할 수 있습니다.

## 8. 문제 해결

### `flash_attn_3`가 import되지 않는 경우

아래를 다시 확인합니다.

```bash
source .venv/bin/activate
uv pip show flash-attn-3
python -c "import importlib.util; print(importlib.util.find_spec('flash_attn_3'))"
```

패키지가 안 보이면 설치가 끝나지 않았거나, 다른 Python 환경에 설치된 것입니다.

### 여전히 `sdpa`로 동작하는 경우

아래를 확인합니다.

- 백엔드가 올바른 `.venv`를 사용하고 있는지
- `torch.cuda.is_available()`가 `True`인지
- `QWEN_DEMO_ATTN_IMPL` 환경 변수가 강제로 다른 값을 넣고 있지 않은지

확인 예시:

```bash
python -c "import torch; print(torch.cuda.is_available())"
python -c "import os; print(os.getenv('QWEN_DEMO_ATTN_IMPL'))"
```

### macOS에서 FlashAttention을 기대하는 경우

macOS는 이 프로젝트에서 `sdpa` fallback 대상입니다. 이 문서의 설치 경로는 Linux + CUDA 전용입니다.
