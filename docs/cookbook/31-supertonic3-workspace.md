# 31. Supertonic 3 작업실

> Supertone Supertonic 3 (BigScience Open RAIL-M) 통합. 31개 언어 ONNX TTS.
> 업스트림은 ONNX 추론만 공개하지만, 이 데모는 built-in style vector를 섞고 참조 오디오 특징을 반영해 커스텀 style JSON을 만드는 실험적 클로닝 경로를 제공한다.

## 한 줄 요약

`app/backend/app/supertonic.py`의 `Supertonic3Engine`이 vendor 디렉토리의
`py/helper.py`를 동적으로 import해 메인 venv 안에서 직접 onnxruntime으로
추론한다 (subprocess 불필요). UI는 사이드바 **SUPERTONIC** 섹션의 4개 탭에서
사용.

## 모델 / 라이선스

| 항목 | 값 |
|---|---|
| 라이선스 | BigScience Open RAIL-M (상업 사용 OK, Attachment A 행위 제한) |
| 권장 가중치 | `Supertone/supertonic-3` (HuggingFace ~260 MB ONNX 번들) |
| 한국어 지원 | (31개 언어 중) |
| 표현 태그 | `<laugh>`, `<breath>`, `<sigh>` 3개만 (대괄호 `[ ]`는 전처리에서 제거) |
| 클로닝 | zero-shot 임베딩 추출은 미지원. 대신 참조 오디오 특징 기반 style JSON 생성 지원 |
| 학습 | full fine-tune 미지원. `/api/supertonic/train`은 역공학 기반 style-vector clone/train adapter |

## 설치 / 셋업

가벼운 ONNX 모델이라 별도 venv 불필요. 메인 `.venv`에 의존성만 추가:

```bash
.venv/bin/pip install "onnxruntime==1.23.1" soundfile librosa
```

ONNX 모델 다운로드 (HuggingFace):

```bash
pip install huggingface-hub
python -c "
from huggingface_hub import snapshot_download
snapshot_download('Supertone/supertonic-3',
                 local_dir='data/models/supertonic3')
"
```

**필수 자산 구조**:
```
data/models/supertonic3/
├── onnx/
│   ├── duration_predictor.onnx
│   ├── text_encoder.onnx
│   ├── vector_estimator.onnx
│   ├── vocoder.onnx
│   ├── unicode_indexer.json
│   └── tts.json
└── voice_styles/
    ├── M1.json
    ├── M2.json
    ├── ...
    └── F4.json
```

**환경 변수** (선택):
```bash
export SUPERTONIC_REPO_ROOT=vendor/Supertonic
export SUPERTONIC_MODEL_DIR=$(pwd)/data/models/supertonic3
export SUPERTONIC_VOICE_DIR=$(pwd)/data/supertonic3-voices
```

## API

### `GET /api/supertonic/runtime`

가용성 / ONNX 자산 / built-in voice style / 사용자 프리셋 / 지원 언어 /
표현 태그 / training_supported 플래그를 반환.

### `POST /api/supertonic/generate`

요청 스키마: `Supertonic3GenerateRequest`

| 필드 | 설명 |
|---|---|
| `text` | 합성할 텍스트 |
| `language` | `ko`, `en`, `ja` 등 31개 중 하나 |
| `voice_style` | `M1`~`F4` (built-in) 또는 저장된 프리셋 이름 |
| `total_step` | denoising step (기본 8) |
| `speed` | 1.0=원본 속도, >1=빠름 (기본 1.05) |
| `silence_duration` | 청크 사이 무음 (초, 기본 0.3) |
| `use_gpu` | onnxruntime CUDA EP 사용 여부 (실험적) |

예시 (한국어):
```bash
curl -X POST http://localhost:8000/api/supertonic/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "안녕하세요, 오늘 날씨가 정말 좋네요. <breath> 산책하기 좋은 날입니다.",
    "language": "ko",
    "voice_style": "M4",
    "total_step": 8,
    "speed": 1.05
  }'
```

### `GET/POST/DELETE /api/supertonic/voices`

Built-in voice style + 라벨/메모 묶음 프리셋 CRUD. `/api/supertonic/train`에서 만든 커스텀 style JSON도 같은 프리셋 목록에 표시된다.

### `POST /api/supertonic/train`

참조 오디오 또는 `target=supertonic` 데이터셋에서 pitch/RMS/spectral centroid를 추출하고, M1~F4 style vector를 보수적으로 blend한 뒤 낮은 강도의 deterministic adaptation을 적용해 새 style JSON을 만든다.

요청 핵심 필드:

| 필드 | 설명 |
|---|---|
| `dataset_id` | Supertonic 데이터셋 탭에서 만든 데이터셋 ID |
| `reference_audio_path` | 단일 참조 오디오 경로. `dataset_id` 없이도 사용 가능 |
| `base_voice_styles` | `["M4", "F4"]` 같은 blend source |
| `adaptation_strength` | 0.0~0.35. 높을수록 참조 특징 반영이 강하지만 깨질 수 있음 |
| `run_final_sample` | style 저장 후 바로 샘플 TTS 생성 |

주의: 이것은 업스트림 PyTorch 모델을 재학습하는 full fine-tune이 아니다. 공개된 ONNX/JSON 자산으로 가능한 실용적 역공학 클로닝 경로이며, 결과물은 `data/supertonic3-voices/voice_styles/<name>.json`에 저장된다.

## 표현 태그 한계

| 시도 | 결과 |
|---|---|
| `<laugh>`, `<breath>`, `<sigh>` | 학습된 마커, 작동 |
| `[moaning]`, `[laugh]` (대괄호) | 전처리에서 `[ ]` 제거되어 그냥 단어로 발음 |
| `<moan>`, `<gasp>` (학습 안 됨) | 학습 데이터 없음, 무시되거나 글자로 발음 |
| 자연어 instruct (`흥분된 톤:`) | instruct 모드 없음 |

도메인 특화 NSFW/강감정 표현이 필요하면 **Fish Speech S2-Pro**(비상업 라이선스
주의), **VoxCPM2 LoRA 파인튜닝**, 또는 **CosyVoice 3 instruct2** 라인을 사용.

## 일관성 체크리스트 (다른 vendor와 동일 패턴)

- [x] `app/backend/app/supertonic.py`에 `Engine` 클래스
- [x] `status` / `availability_notes` / `run` / `save_voice_preset` / `delete_voice_preset` / `create_cloned_voice_style` 메서드
- [x] 환경 변수 `SUPERTONIC_REPO_ROOT` / `SUPERTONIC_MODEL_DIR` / `SUPERTONIC_VOICE_DIR`
- [x] FastAPI 라우트 `/api/supertonic/{runtime,generate,voices,train}`
- [x] Pydantic 요청·응답 모델 4종
- [x] `data/models/supertonic3/`, `data/supertonic3-voices/` 자동 생성
- [x] TS 타입 5개 (`lib/types.ts`)
- [x] API 클라이언트 wrapper 5개 (`lib/api.ts`)
- [x] `TabKey` enum + `PRODUCT_PAGES` 항목 4종
- [x] App.tsx 패널 4종 (TTS / Voices / Dataset / Training)
- [x] 사이드바 nav group (SUPERTONIC 섹션 4개 버튼)
- [x] i18n 번역 (한국어/영어/일본어 5개 키 × 3 = 15개)
- [x] TypeScript 컴파일 검증 (`tsc --noEmit` 통과)
- [x] vendor git 메타데이터 제거
- [ ] **한국어 wav smoke test** (사용자 환경에서 ONNX 다운로드 후 실행)

## 라이선스 — Toptoon 도메인 적용 참고

- **상업 사용 허용** (Apache 스타일 + 사용 제한)
- **(b) 미성년자** — 모든 미성년자 관련 콘텐츠 금지
- **(g) 동의 없는 사칭** — 실제 인물 음성 모사 금지 (built-in voice라 영향 없음)
- **(e) AI 생성 미고지** — 약관/메타데이터에 AI 음성 표기 필요
- NSFW 자체는 라이선스상 금지되지 않음 (단, 모델 표현력이 부족함)

상세 분석은 conversation history 참고 (BigScience Open RAIL-M Attachment A).

## 알려진 한계

1. **첫 추론 시 ONNX 그래프 로딩**으로 수십 초 ~ 1분 소요. 이후 캐시된다.
2. **`onnxruntime-gpu`로 전환**하면 `use_gpu=true`가 의미를 가진다. 기본은 CPU.
3. **표현력이 매우 제한적** — 위 표 참조. NSFW/강감정 워크플로우에는 부적합.
4. **full fine-tune 미지원** — 현재 학습 탭은 새 style JSON을 만드는 clone/train adapter다.

## 다음 단계

- [ ] **Phase 3.5** — 사용자 환경에서 ONNX 다운로드 + 한국어 smoke test
- [ ] **Phase 4** — ONNX→PyTorch 재구현 + LoRA 학습 루프 검토 (현재 style-vector clone adapter와 별도)
