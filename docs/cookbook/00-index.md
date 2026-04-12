# Cookbook Index

`Qwen3-TTS-Demo`를 처음 클론한 뒤 환경 준비, 모델 다운로드, 실행, 코드 구조 파악까지 한 번에 따라갈 수 있도록 정리한 문서 허브입니다.

## 추천 읽기 순서

1. [설치 및 실행 가이드](./01-install-and-run.md)
2. [백엔드 구조 가이드](./02-backend-guide.md)
3. [프런트엔드 구조 가이드](./03-frontend-guide.md)
4. [Qwen3-TTS 업스트림 개요](./04-qwen3-tts-overview.md)
5. [Fine-tuning 및 examples 가이드](./05-finetuning-and-examples.md)
6. [학습 파이프라인 변경 상세](./06-training-pipeline-changes.md)
7. [추론 파이프라인 변경 상세](./07-inference-pipeline-changes.md)
8. [FlashAttention 설치 가이드](./08-flash-attn-install.md)
9. [Speech Quality Validation Workflow](./09-quality-validation-workflow.md)
10. [Quality Validation Plan](./10-quality-validation-plan.md)
11. [Pristine Upstream Fine-Tune Wrappers](./11-pristine-upstream-finetune.md)

## 문서 맵

- 바로 띄우려면 [01-install-and-run.md](./01-install-and-run.md)부터 보면 됩니다.
- 모델 로딩, clone prompt, 데이터셋, 파인튜닝 API는 [02-backend-guide.md](./02-backend-guide.md)에 정리했습니다.
- 웹에서 모델 선택과 탭별 워크플로우는 [03-frontend-guide.md](./03-frontend-guide.md)에 정리했습니다.
- 업스트림 `Qwen3-TTS` 구조는 [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)를 보면 됩니다.
- 업스트림 examples와 fine-tuning 연결은 [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)를 보면 됩니다.
- 학습 파이프라인이 어떻게 확장되었는지는 [06-training-pipeline-changes.md](./06-training-pipeline-changes.md)를 보면 됩니다.
- 추론 파이프라인이 어떻게 확장되었는지는 [07-inference-pipeline-changes.md](./07-inference-pipeline-changes.md)를 보면 됩니다.
- Linux + CUDA에서 FlashAttention 2를 설치하는 절차는 [08-flash-attn-install.md](./08-flash-attn-install.md)를 보면 됩니다.
- 깨끗한 upstream 기준으로 Base/CustomVoice fine-tuning을 돌리는 demo-side wrapper
  명령은 [11-pristine-upstream-finetune.md](./11-pristine-upstream-finetune.md)를 보면 됩니다.

## 빠른 링크

- 루트 소개: [README.md](../../README.md)
- 구현 계획: [plan.md](../plan.md)
- 백엔드 진입점: [main.py](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/backend/app/main.py)
- 프런트엔드 진입점: [App.tsx](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- 업스트림 소개: [README.md](/Users/ahnhs2k/Desktop/personal/Qwen3-TTS-Demo/Qwen3-TTS/README.md)

## 현재 문서 기준 핵심 변경점

- 백엔드는 바로 실행하는 구조가 아니라 `setup -> download -> start` 순서를 기준으로 문서화합니다.
- macOS/Linux용 `.sh`와 Windows PowerShell용 `.ps1`를 모두 제공합니다.
- 모델 다운로드 기본값은 `all`이며, 웹 UI에서 기능별로 모델을 선택할 수 있습니다.
- `clone prompt / 프리셋`과 `fine-tuning`은 다른 기능군으로 구분합니다.
- 학습 결과의 음성 품질 검증 방법은 [09-quality-validation-workflow.md](./09-quality-validation-workflow.md)를 보면 됩니다.
- 검증 순서와 현재 막힌 점은 [10-quality-validation-plan.md](./10-quality-validation-plan.md)를 보면 됩니다.

## 참고

- [02-backend.md](./02-backend.md), [03-frontend.md](./03-frontend.md), [04-qwen3-tts.md](./04-qwen3-tts.md)는 기존 링크 호환용 안내 페이지입니다.
- 실제 설명은 `*-guide.md`, `*-overview.md` 문서를 기준으로 유지합니다.
