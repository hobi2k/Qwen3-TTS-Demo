# Cookbook Index

`Qwen3-TTS-Demo`를 처음 클론한 뒤 설치, 실행, 코드 구조 파악, 업스트림 `Qwen3-TTS` 이해까지 한 번에 따라갈 수 있도록 정리한 문서 허브입니다.

## 추천 읽기 순서

1. [설치 및 실행 가이드](./01-install-and-run.md)
2. [백엔드 구조 가이드](./02-backend-guide.md)
3. [프런트엔드 구조 가이드](./03-frontend-guide.md)
4. [Qwen3-TTS 업스트림 개요](./04-qwen3-tts-overview.md)
5. [Fine-tuning 및 examples 가이드](./05-finetuning-and-examples.md)

## 문서 맵

- 빠르게 띄우고 싶다면 [01-install-and-run.md](./01-install-and-run.md)부터 보면 됩니다.
- API, 저장 구조, 모델 호출 래퍼를 이해하려면 [02-backend-guide.md](./02-backend-guide.md)를 보세요.
- React 화면과 상태 흐름을 따라가려면 [03-frontend-guide.md](./03-frontend-guide.md)를 보세요.
- 업스트림 `qwen_tts` 패키지 구조는 [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)에서 정리했습니다.
- 예제 코드와 파인튜닝 워크플로우는 [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)에서 이어집니다.

## 빠른 링크

- 루트 소개: [README.md](../../README.md)
- 구현 계획: [docs/plan.md](../plan.md)
- 백엔드 진입점: [app/backend/app/main.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/backend/app/main.py)
- 프런트엔드 진입점: [app/frontend/src/App.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- 업스트림 소개: [Qwen3-TTS/README.md](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/README.md)

## 참고

- `02-backend.md`, `03-frontend.md`, `04-qwen3-tts.md`는 기존 링크 호환을 위한 안내 페이지입니다.
- 실제 설명은 `*-guide.md`, `*-overview.md` 문서를 기준으로 유지합니다.
