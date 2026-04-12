# FlashAttention 2 설치 가이드

이 문서는 `Qwen3-TTS-Demo`를 Linux 또는 WSL2 + NVIDIA CUDA 환경에서 실행할 때,
이 프로젝트가 실제로 검증한 `FlashAttention 2` 설치 경로를 설명합니다.

핵심 원칙은 단순합니다.

- Linux + CUDA에서는 `flash_attention_2`를 기본 경로로 사용합니다.
- `sdpa`는 macOS, CPU-only, MPS, 또는 FlashAttention을 실제로 쓸 수 없는 환경에서만 fallback입니다.
- 이 프로젝트에서는 `flash-attn v2`가 실제 GPU smoke test까지 통과한 뒤에 문서화했습니다.

## 1. 이 문서가 필요한 환경

아래 조건이면 이 가이드를 따르는 것이 맞습니다.

- Ubuntu 또는 WSL2 Linux
- NVIDIA GPU
- `torch.cuda.is_available() == True`
- `Qwen3-TTS` 추론 또는 파인튜닝을 CUDA로 돌릴 예정

반대로 아래 환경은 `sdpa` fallback이 정상입니다.

- macOS
- CPU-only 환경
- CUDA/PyTorch 조합이 맞지 않아 FlashAttention을 쓸 수 없는 환경

## 2. 현재 검증한 조합

이 저장소에서 실제로 통과한 조합은 아래와 같습니다.

- Python: `3.11`
- PyTorch: `2.11.0`
- CUDA runtime line: `cu130`
- GPU: RTX 5080 계열
- FlashAttention package: `flash-attn 2.8.3`

중요한 점은, 이 경로는 소스 빌드가 아니라 **Linux prebuilt wheel**을 사용했다는 것입니다.
그래서 WSL에서 `nvcc` 빌드 때문에 시스템이 얼어붙는 문제를 피할 수 있었습니다.

## 3. 설치 명령

프로젝트 루트에서 아래 순서로 실행합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
uv pip uninstall -y flash-attn-3
uv pip install --no-cache-dir "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.9.4/flash_attn-2.8.3+cu130torch2.11-cp311-cp311-linux_x86_64.whl"
```

참고 출처:

- `https://github.com/mjun0812/flash-attention-prebuild-wheels/releases`

이 wheel은 현재 프로젝트 조합과 맞는 Linux/WSL용 `flash-attn v2` 경로로 실제 검증했습니다.

## 4. 설치 검증

설치 직후 아래 명령을 실행해 import와 GPU 실행을 둘 다 확인합니다.

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
source .venv/bin/activate
uv pip show flash-attn
python -c "import importlib.util; print(importlib.util.find_spec('flash_attn') is not None)"
python -c "import torch; from flash_attn.flash_attn_interface import flash_attn_func; q=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); k=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); v=torch.randn(1,16,8,64,device='cuda',dtype=torch.bfloat16); out=flash_attn_func(q,k,v,0.0,softmax_scale=None,causal=False); print(tuple(out.shape), out.dtype, out.device)"
```

정상이라면:

- `uv pip show flash-attn`가 버전 정보를 출력합니다.
- `find_spec('flash_attn')`가 `True`를 출력합니다.
- 마지막 GPU smoke test가 `(1, 16, 8, 64) torch.bfloat16 cuda:0` 형태로 성공합니다.

## 5. 프로젝트가 이 패키지를 사용하는 방식

이 저장소는 attention 구현을 아래 우선순위로 고릅니다.

1. Linux + CUDA + `flash_attn` 설치됨: `flash_attention_2`
2. macOS, CPU, MPS, 또는 FlashAttention 미설치: `sdpa`

즉 이 프로젝트에서는 Linux CUDA 머신이라면 `flash_attention_2`가 정상 경로이고,
`sdpa`는 예외 상황용 fallback입니다.

## 6. 왜 소스 빌드보다 wheel을 우선하나

이 프로젝트에서는 WSL + 최신 GPU + CUDA 13.x 조합에서 소스 빌드가 자주 문제를 만들었습니다.

대표 증상:

- `nvcc` 또는 `ninja`가 장시간 CPU와 메모리를 점유
- WSL 세션 정지 또는 심한 버벅임
- 마지막 extension compile 단계에서 실패
- 설치는 끝나도 실제 CUDA 커널 실행에서 실패

반면 prebuilt wheel 경로는 다음 장점이 있습니다.

- 장시간 컴파일이 없다
- 설치 시간이 짧다
- WSL 전체가 얼어붙을 가능성이 크게 줄어든다
- 같은 Python/CUDA/PyTorch 조합에서 재현성이 높다

## 7. 주의사항

- 이 wheel은 공식 PyPI가 아니라 community prebuilt 배포처입니다.
- 운영 환경에 도입할 때는 출처 정책을 팀 기준으로 검토하는 것이 좋습니다.
- 이 프로젝트는 `flash_attention_2`를 Linux CUDA 기본 경로로 본다는 원칙을 유지합니다.
- `sdpa`는 “FlashAttention을 못 쓰는 환경”에서만 fallback으로 사용합니다.

## 8. 문제 해결

### `flash_attn`이 import되지 않는 경우

아래를 다시 확인합니다.

```bash
source .venv/bin/activate
uv pip show flash-attn
python -c "import importlib.util; print(importlib.util.find_spec('flash_attn'))"
```

패키지가 보이지 않으면 다른 Python 환경에 설치됐거나, 설치가 중간에 실패한 것입니다.

### 설치는 됐는데 backend가 `sdpa`를 쓰는 경우

아래를 확인합니다.

- 백엔드가 루트 `.venv`를 쓰고 있는지
- `torch.cuda.is_available()`가 `True`인지
- `QWEN_DEMO_ATTN_IMPL` 환경 변수가 강제로 `sdpa`를 넣고 있지 않은지

확인 예시:

```bash
python -c "import torch; print(torch.cuda.is_available())"
python -c "import os; print(os.getenv('QWEN_DEMO_ATTN_IMPL'))"
```

### macOS에서 FlashAttention을 기대하는 경우

macOS는 이 프로젝트에서 `sdpa` fallback 대상입니다. 이 문서의 설치 경로는 Linux + CUDA 전용입니다.
