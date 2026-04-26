# Frontend Guide

이 문서는 현재 프런트엔드의 정보 구조와 화면 역할을 설명합니다.

기준은 “내부 구현이 아니라 사용자가 어떤 작업을 어떤 화면에서 처리하는가”입니다.

현재 프런트엔드는 `Next.js App Router` 기준입니다. 기본 운영은 `next dev`가 아니라, `next build`로 만든 정적 export를 백엔드가 함께 서빙하는 구조입니다.
즉 프런트 구조 설명은 유지하되, 실행 방식은 `build -> backend serve` 기준으로 이해하면 됩니다.

## 핵심 원칙

- 기능 이름과 실제 역할이 일치해야 합니다.
- 최근 생성 이력은 한 탭에만 모읍니다.
- 기본 화면은 사용자 중심으로 단순하게 유지하고, 실험용 옵션은 `고급 제어`로 보냅니다.
- `목소리 복제`, `목소리 설계`, `프리셋 기반 생성`은 서로 다른 작업이므로 탭도 분리합니다.

## 핵심 파일

- [layout.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/app/layout.tsx)
- [page.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/app/page.tsx)
- [App.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/App.tsx)
- [app-ui.tsx](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/app-ui.tsx)
- [api.ts](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/api.ts)
- [types.ts](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/lib/types.ts)
- [styles.css](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/app/frontend/src/styles.css)

## 실행 기준

- 기본:
  `npm run build` 후 FastAPI가 `app/frontend/out`의 정적 프런트까지 함께 제공
- 선택:
  `BACKEND_PORT=<BACKEND_PORT> npm run dev`

즉 `next dev`는 개발 편의용이고, 제품형 실행 흐름의 기준은 아닙니다.

## 현재 페이지 구조

좌측 네비게이션 기준 현재 페이지는 아래와 같습니다.

- `홈`
- `나의 목소리들`
- `생성 갤러리`
- `텍스트 음성 변환`
- `목소리 복제`
- `목소리 설계`
- `프리셋 기반 생성`
- `사운드 효과`
- `보이스 체인저`
- `오디오 분리`
- `S2-Pro`
- `데이터셋 만들기`
- `학습 실행`
- `VoiceBox 융합`
- `가이드`

## 페이지별 역할

### 홈

- 전체 제품 진입점
- 지금 무엇을 할지 고르는 시작 화면
- 각 주요 작업실로 이동

### 나의 목소리들

- S2-Pro 저장 목소리 프로젝트
- 저장 프리셋
- 최종 선택된 학습 모델

이 세 가지를 관리하는 화면입니다.

중요:

- 최근 생성 이력은 여기 두지 않습니다.
- 학습 중간 체크포인트도 여기 다 늘어놓지 않습니다.
- S2-Pro 저장 목소리는 참조 음성, Qwen clone prompt, 생성 결과, 데이터셋 연결을 한 프로젝트로 묶어 보여줍니다.

### 생성 갤러리

- 생성 결과 전용 화면
- 오디오 카드 갤러리처럼 관리
- 개별 삭제
- 선택 삭제
- 모두 선택 / 선택 해제

최근 생성 이력은 이 탭에서만 관리하는 것이 현재 원칙입니다.

### 텍스트 음성 변환

메인 TTS 화면입니다.

이 화면에서 하는 일:

- stock 모델 선택
- 최종 fine-tuned 모델 선택
- `CustomVoice`로 바로 생성
- `Base` 모델일 때만 참조 음성 또는 clone prompt 사용
- 결과를 아래에서 바로 확인

기본 사용자에게 보여주는 건 아래 정도면 충분합니다.

- 모델
- 언어
- 목소리
- 대사
- 말투 지시

그 외 `seed`, `top_k`, `top_p`, `temperature`, `subtalker_*` 등은 `고급 제어`에 넣습니다.

#### 왜 Base는 참조 음성이 필요한가

`Base`는 “어떤 음색으로 말할지” 기준을 먼저 받아야 하는 모델입니다.

즉:

- `CustomVoice`
  바로 말하게 만들기 쉬운 모델
- `Base`
  먼저 음색 기준을 넣어야 하는 모델

이 차이를 설명하지 않으면 사용자가 “왜 어떤 모델은 바로 되고 어떤 모델은 참조 음성이 필요하지?”라고 느끼게 됩니다.

### 목소리 복제

- 참조 음성 기반 스타일 추출
- `Base` 중심 화면
- 업로드 음성 -> clone prompt 생성 -> 프리셋 저장

이 화면의 목적은 “스타일 자산을 만드는 것”입니다.

### 목소리 설계

- 설명문 기반 스타일 생성
- `VoiceDesign` 중심 화면
- 설명문으로 샘플 생성
- 마음에 드는 결과를 프리셋으로 저장

이 화면은 “참조 음성 복제”와 다릅니다.

### 프리셋 기반 생성

저장한 프리셋을 다시 쓰는 화면입니다.

이 화면에서 하는 일:

- 프리셋 그대로 생성
- 프리셋 + 말투 지시
- 반복 생성

이 화면에서는 `Base`와 `CustomVoice`를 같이 고를 수 있습니다.

이유:

- `Base`는 프리셋의 스타일 신호를 읽습니다.
- `CustomVoice`는 새 대사와 말투 지시를 적용합니다.

상세 원리는 [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)에 따로 정리했습니다.

### 사운드 효과

- `MMAudio` 기반 효과음 생성 화면
- 라이브러리 탐색 + 프롬프트 입력 + 결과 확인

현재 UX 목표:

- 리스트가 너무 박스형으로 답답하지 않게
- 파형/행/재생 버튼이 살아 있게
- 결과는 아래 또는 같은 흐름에서 자연스럽게 확인

### 보이스 체인저

- `Applio / RVC` 기반 audio-to-audio 변환 화면
- 기존 음성의 보컬 음색을 바꾸는 기능

중요:

- 전사해서 다시 읽는 기능이 아닙니다.
- `.pth + .index` RVC 모델 자산이 필요합니다.

### 오디오 분리

- 업로드 음성을 보컬/반주 또는 다중 stem으로 분리하는 독립 작업 화면
- 기본 모델은 `audio-separator`의 Roformer vocal model입니다.
- `RVC vocal preset`은 보이스 체인저용 보컬 추출을 빠르게 이어가기 위한 선택지입니다.
- 사용자는 모델 프로필과 출력 형식을 고르고, 결과 stem을 바로 재생/다운로드할 수 있어야 합니다.

### S2-Pro

Fish Speech S2-Pro 계열 작업은 Qwen 화면과 섞지 않고 기능별 사이드바 탭으로 분리합니다.

분리된 화면:

- `S2-Pro 텍스트 음성 변환`
  저장한 목소리 또는 기본 S2-Pro voice로 대사를 생성합니다. bracket tag는 이 화면 안에서 대사에 삽입하는 표현 도구입니다.
- `S2-Pro 목소리 저장`
  참조 음성을 Fish Speech reference voice로 저장합니다. 저장한 목소리는 이후 S2-Pro 생성에서 계속 선택할 수 있습니다.
- `S2-Pro 대화 생성`
  저장 목소리와 speaker tag 기반 대사를 조합합니다.
- `S2-Pro 다국어 TTS`
  저장 목소리를 유지하면서 여러 언어 문장을 생성합니다.

S2-Pro는 `Base`, `CustomVoice`, `VoiceBox`를 고르는 Qwen 모델 선택 화면과 목적이 다릅니다. 저장 목소리 기반 TTS와 Fish Speech/Fish Audio `/v1/tts` 런타임을 기준으로 별도 작업실을 둡니다.

원칙:

- 기본 런타임은 로컬 Fish Speech입니다.
- `./scripts/download_models.sh s2pro`로 모델을 로컬에 받습니다.
- `./scripts/serve_s2_pro.sh`로 로컬 서버를 띄웁니다.
- Hosted API를 쓸 때는 `.env`의 `FISH_AUDIO_API_KEY`를 백엔드가 읽고, UI에서는 `Runtime`만 선택합니다.
- 저장 목소리는 `/api/s2-pro/voices`로 관리하고, S2-Pro와 Qwen 양쪽에서 재사용합니다.
- 생성 결과는 다른 Qwen 결과와 동일하게 생성 갤러리에 저장합니다.

### 데이터셋 만들기

- 학습용 오디오와 텍스트 정리
- 결과를 canonical dataset 폴더로 저장

현재 사용자에게 꼭 보여줘야 하는 것:

- 권장 샘플 수
- 기준 음성 개념
- 텍스트를 비우면 Whisper 자동 전사
- 저장 후 바로 학습에 쓸 수 있음

즉 사용자 입장에서는 “raw냐 prepared냐”보다 “지금 저장하면 학습 가능한 상태가 되는가”가 더 중요합니다.

### 학습 실행

- 이미 준비된 데이터셋 선택
- `Base` 또는 `CustomVoice` 학습 시작
- 최종 산출물 확인

원칙:

- 데이터셋 생성과 학습은 분리
- epoch별 모든 중간 체크포인트를 직접 고르게 하지 않음
- 최종 선택 모델 중심으로 다시 사용

### 가이드

앱 안에서 바로 읽는 문서형 화면입니다. 한 페이지에 모든 설명을 카드로 밀어 넣지 않고, 왼쪽 문서 목록과 오른쪽 본문으로 나눕니다.

가이드 탭에는 아래 내용을 둡니다.

- 탭별 역할
- 사용 순서
- 모델 선택이 필요한 이유
- 데이터셋과 학습 흐름
- VoiceBox와 S2-Pro의 차이

## 초기 로딩 구조

시작 시 `GET /api/bootstrap`을 호출해 아래를 한 번에 읽습니다.

- `health`
- `models`
- `speakers`
- `history`
- `presets`
- `datasets`
- `finetune_runs`
- `audio_assets`
- `audio_tool_capabilities`

이 bootstrap 응답을 기준으로 화면을 채우고, 이후 각 탭에서 세부 요청만 추가합니다.

## UX 기준 정리

- 최근 생성 이력은 `생성 갤러리` 한 탭에 모읍니다.
- `나의 목소리들`은 S2-Pro 저장 목소리 프로젝트, 저장 프리셋, 최종 학습 모델만 관리합니다.
- `텍스트 음성 변환`은 메인 TTS입니다.
- `목소리 복제`와 `목소리 설계`는 프리셋 생성용 탭입니다.
- `프리셋 기반 생성`은 저장 프리셋 재활용용 탭입니다.
- `데이터셋 만들기`와 `학습 실행`은 분리합니다.
- `S2-Pro`는 Fish Speech 전용 작업실로 분리합니다.
- `가이드`는 사용법을 앱 안에서 바로 확인하는 탭입니다.

## 사용자 안내 문구 기준

- `1~5개 샘플`
  파이프라인 점검용
- `10개 안팎`
  아주 작은 실험용
- `20~50개`
  최소한의 화자 적응을 기대할 수 있는 구간
- `50개 이상`
  음색 반영과 안정성이 더 나아질 가능성이 큼

추가 기대치:

- `Base Fine-Tune`
  음색 적응 실험에는 의미가 있지만, instruct 준수까지 자동 보장되진 않음
- `CustomVoice Fine-Tune`
  음색 반영과 말투 지시 유지 후보 경로

다음 문서:

- [02-backend-guide.md](./02-backend-guide.md)
- [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)
- [13-customvoice-finetuning.md](./13-customvoice-finetuning.md)
