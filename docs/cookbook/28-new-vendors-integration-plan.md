# 26. 신규 vendor 통합 계획 — CosyVoice 3 / VoxCPM2 / Supertonic 3

## 목적

기존 워크숍이 따르는 vendor 통합 패턴(Qwen3-TTS, Fish Speech S2-Pro, VibeVoice, ACE-Step, MMAudio, Applio)과 **완전한 일관성**을 유지하면서 세 모델을 추가한다. 우선순위는 사용자 결정에 따라 **CosyVoice 3 → VoxCPM2 → Supertonic 3** 순으로 추론 → 학습 → UI를 모델별로 완성한다.

## 모델별 공개 상태 / 라이선스 / 능력 요약

| 모델 | 라이선스 | 공개 weights | 한국어 | 추론 모드 | 학습 모드 |
|---|---|---|---|---|---|
| **CosyVoice 3** | Apache 2.0 | ModelScope/HF | (9개 언어 중) | zero-shot / cross-lingual / instruct / streaming | LoRA / SFT (examples/libritts) |
| **VoxCPM2** | Apache 2.0 | HF `openbmb/VoxCPM2` | (30개 언어) | voice design / cloning / ultimate cloning / streaming | 커스텀 학습 |
| **Supertonic 3** | BigScience Open RAIL-M | HF `Supertone/supertonic-3` | (31개 언어) | TTS (3개 표현 태그: `<laugh>` `<breath>` `<sigh>`) | **업스트림 학습 코드 없음 — 역공학 필요** |

## Supertonic 3 역공학 — 별도 위험 평가

업스트림 레포는 다음 ONNX 추론 그래프 4개만 공개한다:
- `duration_predictor.onnx`
- `text_encoder.onnx`
- `vector_estimator.onnx`
- `vocoder.onnx`

학습용 PyTorch 모델 정의, 손실 함수, 옵티마이저 설정, 토크나이저 학습 코드는 **전무**하다. 역공학으로 학습 코드를 만들기 위한 현실적 작업:

1. **ONNX 그래프 분석**: `onnx`/`netron`으로 각 모듈의 입출력 차원과 연산자 시퀀스를 파악
2. **PyTorch 재구현**: ONNX 그래프에서 추정되는 아키텍처를 PyTorch로 다시 작성
3. **가중치 이식**: ONNX 텐서를 PyTorch 모듈로 매핑
4. **학습 루프 작성**: 손실 함수는 표준 TTS 학습(latent flow matching + duration loss + 보코더 보조 손실)을 추정해 작성
5. **검증**: 추론 결과가 원본 ONNX와 일치하는지 확인 후 학습 실험

결과 보장 불가, 추가 작업량은 최소 1~2주 수준, 학습 안정성·품질은 미지수. 추론 통합 완료 후 별도 마일스톤으로 분리한다.

## 기존 vendor 패턴 매핑

| 신규 모델 | 미러링할 기존 패턴 | 사유 |
|---|---|---|
| **CosyVoice 3** | VibeVoice 패턴 (subprocess + `.venv-cosyvoice3`) | 별도 의존성 스택(modelscope, cosyvoice 패키지), 학습 토치 버전 분리 필요 |
| **VoxCPM2** | VibeVoice 패턴 (subprocess + `.venv-voxcpm2`) | MiniCPM-4 백본 + 별도 패키지, 학습 스크립트 동봉 |
| **Supertonic 3 (추론)** | Qwen3-TTS 경량 in-process 패턴 (단, ONNX) | onnxruntime 의존성만 필요, 메인 venv에서 가능 |
| **Supertonic 3 (학습)** | 역공학 결과 기반 별도 subprocess + `.venv-supertonic3` | 가중치 호환 PyTorch 모델 작성 후 |

## 디렉터리 / 파일 레이아웃 (추가될 항목)

### vendor 코드
```
vendor/
├── CosyVoice/                              # vendored FunAudioLLM/CosyVoice source, git metadata removed
├── VoxCPM/                                 # git clone OpenBMB/VoxCPM
└── Supertonic/                             # git clone supertone-inc/supertonic
```

### 백엔드 엔진
```
app/backend/app/
├── cosyvoice.py                            # CosyVoice3Engine (subprocess)
├── voxcpm.py                               # VoxCPM2Engine (subprocess)
└── supertonic.py                           # Supertonic3Engine (in-process ONNX)
```

### 스키마 (`app/backend/app/schemas.py`에 추가)
```
CosyVoice3RuntimeResponse
CosyVoice3GenerateRequest (zero_shot / cross_lingual / instruct 분기)
CosyVoice3TrainingRequest / CosyVoice3TrainingResponse
VoxCPM2RuntimeResponse
VoxCPM2GenerateRequest (voice_design / cloning / ultimate)
VoxCPM2TrainingRequest / VoxCPM2TrainingResponse
Supertonic3RuntimeResponse
Supertonic3GenerateRequest
Supertonic3TrainingRequest / Supertonic3TrainingResponse (역공학 완료 후)
```

### API 엔드포인트 (`app/backend/app/main.py`에 추가)
```
GET  /api/cosyvoice/runtime
POST /api/cosyvoice/generate
POST /api/cosyvoice/voices/save
POST /api/cosyvoice/train
GET  /api/voxcpm/runtime
POST /api/voxcpm/generate
POST /api/voxcpm/voices/save
POST /api/voxcpm/train
GET  /api/supertonic/runtime
POST /api/supertonic/generate
POST /api/supertonic/voices/save
POST /api/supertonic/train          # 역공학 후
```

### 학습/추론 런처 스크립트
```
scripts/
├── run_cosyvoice_generate.py               # subprocess JSON 프로토콜
├── run_cosyvoice_train.py                  # SFT/LoRA 트레이너 호출
├── install_cosyvoice_runtime.py            # .venv-cosyvoice3 셋업
├── run_voxcpm_generate.py
├── run_voxcpm_train.py
├── install_voxcpm_runtime.py
├── run_supertonic_generate.py              # 메인 venv 사용
└── install_supertonic_runtime.py
```

### 프런트엔드 (`app/frontend/src/`)
```
lib/app-ui.tsx          : TabKey enum + PRODUCT_PAGES 항목 추가
lib/types.ts            : 새 Request/Response 타입 미러
lib/api.ts              : fetch 래퍼 추가
App.tsx                 : 새 패널 라우팅 추가
components/
├── CosyVoice3TtsPanel.tsx
├── CosyVoice3VoicesPanel.tsx
├── CosyVoice3TrainingPanel.tsx
├── VoxCPM2TtsPanel.tsx
├── VoxCPM2VoicesPanel.tsx
├── VoxCPM2TrainingPanel.tsx
├── Supertonic3TtsPanel.tsx
├── Supertonic3VoicesPanel.tsx
└── Supertonic3TrainingPanel.tsx
```

### TabKey 신규 항목
```
cosyvoice_tts / cosyvoice_voices / cosyvoice_dataset / cosyvoice_train
voxcpm_tts / voxcpm_voices / voxcpm_dataset / voxcpm_train
supertonic_tts / supertonic_voices / supertonic_dataset / supertonic_train
```

### 데이터 디렉터리
```
data/
├── models/
│   ├── cosyvoice3/                         # 사전학습 가중치
│   ├── voxcpm2/
│   └── supertonic3/
├── finetune-runs/
│   ├── cosyvoice3/
│   ├── voxcpm2/
│   └── supertonic3/
├── cosyvoice3-voices/                      # 프리셋 (S2-Pro 보이스 디렉터리와 동일 패턴)
├── voxcpm2-voices/
└── supertonic3-voices/
```

### 문서 (`docs/cookbook/`)
```
27-cosyvoice3-workspace.md
28-voxcpm2-workspace.md
29-supertonic3-workspace.md
00-index.md (각 항목 링크 추가)
```

## 환경 변수 컨벤션

기존 패턴과 동일하게:
```
COSYVOICE_REPO_ROOT            (default: vendor/CosyVoice)
COSYVOICE_PYTHON_EXECUTABLE    (default: .venv-cosyvoice3/bin/python)
COSYVOICE_MODEL_DIR            (default: data/models/cosyvoice3)
VOXCPM_REPO_ROOT               (default: vendor/VoxCPM)
VOXCPM_PYTHON_EXECUTABLE       (default: .venv-voxcpm2/bin/python)
VOXCPM_MODEL_DIR               (default: data/models/voxcpm2)
SUPERTONIC_REPO_ROOT           (default: vendor/Supertonic)
SUPERTONIC_MODEL_DIR           (default: data/models/supertonic3)
```

## 단계별 작업 계획 (체크포인트 기준)

### Phase 1 — CosyVoice 3 (1순위)

1. **추론 통합**
   - vendor/CosyVoice vendored source 확인, install_cosyvoice_runtime.py 작성, `.venv-cosyvoice3` 셋업
   - `app/backend/app/cosyvoice.py`에 `CosyVoice3Engine` 작성 (subprocess JSON 프로토콜)
   - `scripts/run_cosyvoice_generate.py` 작성 (zero_shot/cross_lingual/instruct 분기 처리)
   - `schemas.py`에 Request/Response 추가
   - `main.py`에 `/api/cosyvoice/runtime`, `/api/cosyvoice/generate`, `/api/cosyvoice/voices/save` 등록
   - Smoke test: 한국어 텍스트 zero-shot 생성 → wav 파일 확인

2. **학습 통합**
   - `scripts/run_cosyvoice_train.py` 작성 — CosyVoice `examples/libritts` 학습 스크립트 래핑
   - 데이터셋 구조: `data/datasets/<dataset_id>/` (오디오 + 텍스트 JSONL)
   - `CosyVoice3TrainingRequest` 추가 (LoRA / SFT 모드, GPU, epochs 등)
   - `/api/cosyvoice/train` 엔드포인트 등록
   - 체크포인트 저장 위치: `data/finetune-runs/cosyvoice3/<run_id>/`

3. **UI 통합**
   - `lib/app-ui.tsx`에 `cosyvoice_tts`, `cosyvoice_voices`, `cosyvoice_dataset`, `cosyvoice_train` TabKey 추가
   - `lib/types.ts`에 TS 타입 추가
   - 4개 React 패널 컴포넌트 작성 (S2-Pro 패널 구조 참고)
   - `App.tsx`에 라우팅 추가

4. **문서**
   - `docs/cookbook/27-cosyvoice3-workspace.md` 작성 (사용법, 한계, 라이선스, 한국어 팁)
   - `docs/cookbook/00-index.md`에 링크 추가

5. **검증**
   - 한국어 zero-shot, cross-lingual, instruct 모드 각각 wav 생성 확인
   - LoRA 학습 1 step smoke test
   - UI 4개 탭 렌더 확인

### Phase 2 — VoxCPM2

CosyVoice 3와 동일한 5단계, 다음 차이만:
- 추론 모드: `voice_design (자연어 괄호)`, `cloning`, `ultimate_cloning`, `streaming`
- 학습: 데이터셋을 고르면 VoxCPM용 커스텀 목소리를 만들고, 완료된 결과를 생성 화면에서 바로 재사용
- 한국어 클로닝 SIM 1위 모델임을 강조한 문서

### Phase 3 — Supertonic 3 추론

- onnxruntime만 사용하므로 메인 venv 재활용
- in-process 엔진 (`app/backend/app/supertonic.py`)
- 추론 모드: 텍스트 + 화자 스타일 + (선택) 3개 표현 태그
- 학습 탭은 일시적으로 "역공학 진행 중" 안내 패널만 노출 (다른 vendor와 UI 구조는 동일하게 유지)

### Phase 4 — Supertonic 3 역공학 학습

별도 마일스톤:
1. ONNX 그래프 → PyTorch 재구현
2. 가중치 변환 도구 작성 (ONNX 텐서 → state_dict)
3. 학습 루프 작성 (latent flow matching loss 등 표준 TTS 학습 추정)
4. 추론 일치성 검증 (PyTorch 재구현이 원본 ONNX와 비트 단위는 아니더라도 청취상 동일한지)
5. 학습 smoke test 성공 후 UI training panel 활성화

**이 단계는 결과 보장이 불가하며, Phase 1~3 완료 후 별도 평가를 거쳐 진행 여부 재결정 권장.**

## 일관성 체크리스트 (각 모델 완료 시 만족해야 할 항목)

- [ ] `app/backend/app/<model>.py`에 Engine 클래스가 있고 `status()`, `generate()`, (가능 시) `train()` 메서드 제공
- [ ] 환경 변수 `<MODEL>_REPO_ROOT`, `<MODEL>_PYTHON_EXECUTABLE`, `<MODEL>_MODEL_DIR` 인식
- [ ] FastAPI `/api/<model>/runtime`, `/api/<model>/generate`, `/api/<model>/train` 라우트 등록
- [ ] `schemas.py`에 Request/Response Pydantic 모델 정의
- [ ] `lib/app-ui.tsx`에 TabKey + PRODUCT_PAGES 항목 등록
- [ ] React 패널 컴포넌트 4종(TTS, Voices, Dataset, Training) 작성
- [ ] `scripts/install_<model>_runtime.py` 작성, `.venv-<model>` 셋업 가능
- [ ] `scripts/run_<model>_generate.py` 또는 in-process 추론 경로 검증
- [ ] `scripts/run_<model>_train.py` (해당 시)
- [ ] `data/models/<model>/`, `data/finetune-runs/<model>/`, `data/<model>-voices/` 디렉터리 자동 생성
- [ ] `docs/cookbook/2X-<model>-workspace.md` 작성
- [ ] `docs/cookbook/00-index.md`에 링크 추가
- [ ] 한국어 smoke test 성공

## 위험 / 미해결 사항

1. **CosyVoice 3 한국어 instruct prompt 언어**: 영어 prompt만 학습되었을 가능성. 한국어로 `"흥분된 목소리로:"` 같은 instruct를 넣었을 때 작동 여부 실험 필요.
2. **VoxCPM2 voice design 한국어 prompt**: 영어 디스크립터 위주로 학습됐을 가능성. `"(부드럽고 따뜻한 목소리로)"` 같은 한국어 prompt 효과 검증 필요.
3. **Supertonic 3 라이선스 적용 범위**: BigScience Open RAIL-M의 Attachment A 사용 제한이 Toptoon 도메인 사용 시 어떻게 적용되는지 별도 법무 검토 권장 (특히 (g) 동의 없는 사칭 / (e) AI 생성 고지 조항).
4. **GPU 메모리**: CosyVoice 3 + VoxCPM2를 메인 워크숍에 추가하면 동시 로드 시 VRAM 초과 가능. on-demand load/unload 전략 필요할 수 있음.
5. **워크숍 통합 시 conflict**: `app-ui.tsx`의 TabKey enum, `schemas.py`의 import 순서, `main.py`의 라우트 등록 순서 등에서 기존 코드와 머지 충돌 가능. 모델별로 PR 단위로 잘게 나눠 검증.

## 검증 절차

각 모델 완료 시 다음을 실행:

```bash
# 백엔드 import 검증
.venv/bin/python -c "from app.backend.app.cosyvoice import CosyVoice3Engine"

# 추론 smoke test
.venv-cosyvoice3/bin/python scripts/run_cosyvoice_generate.py \
    --text "한국어 추론 테스트" --lang ko --output /tmp/test.wav

# API smoke test (uvicorn 실행 후)
curl -X POST http://localhost:8000/api/cosyvoice/generate \
    -H "Content-Type: application/json" \
    -d '{"text":"한국어 테스트","language":"ko"}'

# UI 빌드 검증
cd app/frontend && npm run typecheck && npm run build

# 학습 1 step smoke
.venv-cosyvoice3/bin/python scripts/run_cosyvoice_train.py \
    --dataset_id smoke_test --max_steps 1
```

## 승인 후 즉시 시작할 작업 (Phase 1, CosyVoice 3 추론)

1. `vendor/CosyVoice` clone
2. `scripts/install_cosyvoice_runtime.py` 작성 + `.venv-cosyvoice3` 셋업
3. `scripts/run_cosyvoice_generate.py` 작성 (subprocess JSON 프로토콜)
4. `app/backend/app/cosyvoice.py`에 `CosyVoice3Engine` 작성
5. `schemas.py` Request/Response 추가
6. `main.py`에 `/api/cosyvoice/runtime`, `/api/cosyvoice/generate` 등록
7. 한국어 smoke test → wav 청취 검증

UI/학습/문서는 이 추론 라인이 안정화된 뒤 같은 Phase 1 안에서 이어 작업.
