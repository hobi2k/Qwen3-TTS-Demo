# 30. VoxCPM2 작업실

> OpenBMB VoxCPM2 (Apache 2.0) 통합. 30개 언어 voice_design / voice_cloning /
> ultimate_cloning. **한국어 SIM 83.3 (자체 벤치 1위)** 모델로 클로닝 충실도가
> 강점이다. LoRA 파인튜닝 지원.

## 한 줄 요약

`scripts/run_voxcpm_generate.py` + `scripts/run_voxcpm_train.py`를
`.venv-voxcpm2` subprocess로 실행한다. 백엔드 `VoxCPM2Engine`
(`app/backend/app/voxcpm.py`)이 모든 호출을 감싼다. UI는 사이드바
**VOXCPM** 섹션의 4개 탭(TTS / 프리셋 / 데이터셋 / 학습)에서 사용.

## 모델 / 라이선스

| 항목 | 값 |
|---|---|
| 라이선스 | Apache 2.0 |
| 권장 가중치 | `VoxCPM2` (HuggingFace `openbmb/VoxCPM2`) |
| 한국어 지원 | ✅ (30개 언어 중 / SIM 83.3 1위) |
| 표현 제어 | 자연어 괄호 디스크립터 `(A young woman, gentle voice)` |
| 학습 모드 | LoRA (lm / dit / proj 어댑터 선택) |

## 설치 / 셋업

1. **vendor clone** (이미 완료, git 메타데이터 제거됨)

2. **가상환경 생성**
   ```bash
   python3.11 -m venv .venv-voxcpm2
   source .venv-voxcpm2/bin/activate
   ```

3. **의존성 설치**
   ```bash
   python scripts/install_voxcpm_runtime.py --torch-profile cu121
   # macOS: --torch-profile mps  /  CPU: --torch-profile cpu
   ```

4. **사전학습 모델 다운로드**
   ```bash
   pip install huggingface-hub
   python -c "
   from huggingface_hub import snapshot_download
   snapshot_download('openbmb/VoxCPM2',
                    local_dir='data/models/voxcpm2/VoxCPM2')
   "
   ```

5. **환경 변수** (선택)
   ```bash
   export VOXCPM_REPO_ROOT=vendor/VoxCPM
   export VOXCPM_PYTHON_EXECUTABLE=$(pwd)/.venv-voxcpm2/bin/python
   export VOXCPM_MODEL_DIR=$(pwd)/data/models/voxcpm2
   ```

## API

### `GET /api/voxcpm/runtime`

가용성 / 모델 변형 / 프리셋 / 지원 task / 지원 언어 반환.

### `POST /api/voxcpm/generate`

요청 스키마: `VoxCPM2GenerateRequest`

| task | 필수 필드 | 한국어 효과 |
|---|---|---|
| `voice_design` | `text` (앞에 `(description)`) | ⚠️ 영어 디스크립터 권장 |
| `voice_cloning` | `text`, `reference_wav_path` | **✅ 1순위** (SIM 83.3) |
| `ultimate_cloning` | `text`, `prompt_wav_path`, `prompt_text` (+ `reference_wav_path`) | ✅ 최고 충실도 |

예시 (voice_cloning, 한국어):
```bash
curl -X POST http://localhost:8000/api/voxcpm/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "voice_cloning",
    "text": "안녕하세요, 오늘 날씨가 정말 좋네요.",
    "reference_wav_path": "data/generated/sample-voice.wav",
    "language": "ko",
    "model_name": "VoxCPM2",
    "cfg_value": 2.0,
    "inference_timesteps": 10
  }'
```

### `GET/POST /api/voxcpm/voices`

프리셋 저장·조회. 저장 요청 (`VoxCPM2VoicePresetCreateRequest`):
```json
{
  "name": "my_voice_01",
  "task": "voice_cloning",
  "reference_wav_path": "data/generated/sample.wav",
  "language": "ko",
  "notes": "한국어 차분한 톤"
}
```

### `DELETE /api/voxcpm/voices/{name}`

### `POST /api/voxcpm/train`

요청 스키마: `VoxCPM2TrainingRequest`

| 필드 | 설명 |
|---|---|
| `dataset_id` | `data/datasets/<id>/manifest.jsonl` 위치 |
| `cv_dataset_id` | 검증 데이터셋 (선택) |
| `base_model` | 기본 `VoxCPM2` |
| `lora.enable_lm` / `enable_dit` / `enable_proj` | LoRA 적용 위치 |
| `batch_size`, `grad_accum_steps`, `num_iters`, `max_steps`, `learning_rate`, … | 학습 하이퍼파라미터 |

manifest 포맷 (JSONL):
```jsonl
{"audio": "wavs/utt_001.wav", "text": "안녕하세요"}
{"audio": "wavs/utt_002.wav", "text": "반갑습니다"}
```

학습 파이프라인:
1. **prepare** — workshop manifest → VoxCPM JSONL 형식 (절대경로 audio)
2. **train** — upstream `scripts/train_voxcpm_finetune.py` 호출 (LoRA 모드)

체크포인트: `data/finetune-runs/voxcpm2/<run_id>/checkpoints/`
TensorBoard: `data/finetune-runs/voxcpm2/<run_id>/tensorboard/`

## 한국어 사용 팁

1. **voice_cloning이 한국어 1순위**. SIM 83.3은 30개 언어 비교 중 최고.
2. **참조 오디오는 16kHz 모노 WAV** 3~10초 권장. `denoise=true` 옵션으로
   ZipEnhancer denoiser를 통과시키면 노이즈 있는 샘플도 안전.
3. **voice_design의 괄호 디스크립터는 영어로** 작성하는 게 안전
   (학습 데이터가 영어 위주).
4. **ultimate_cloning은 `prompt_text` (transcript)가 정확해야** 최대
   효과. 길이는 5~30초 prompt audio가 sweet spot.

## 일관성 체크리스트 (다른 vendor와 동일 패턴)

- [x] `app/backend/app/voxcpm.py`에 `Engine` 클래스
- [x] `status` / `availability_notes` / `run` / `train` 메서드
- [x] 환경 변수 `VOXCPM_REPO_ROOT` / `VOXCPM_PYTHON_EXECUTABLE` / `VOXCPM_MODEL_DIR`
- [x] FastAPI 라우트 `/api/voxcpm/runtime` / `generate` / `voices` / `train`
- [x] Pydantic 요청·응답 모델 7종
- [x] `scripts/install_voxcpm_runtime.py`
- [x] `scripts/run_voxcpm_generate.py` subprocess JSON 프로토콜
- [x] `scripts/run_voxcpm_train.py` upstream wrapper
- [x] `data/models/voxcpm2/`, `data/finetune-runs/voxcpm2/`, `data/voxcpm2-voices/` 자동 생성
- [x] TS 타입 7개 (`lib/types.ts`)
- [x] API 클라이언트 wrapper 6개 (`lib/api.ts`)
- [x] `TabKey` enum + `PRODUCT_PAGES` 항목 4종
- [x] App.tsx 패널 4종 (TTS / Voices / Dataset / Training)
- [x] 사이드바 nav group (VOXCPM 섹션 4개 버튼)
- [x] i18n 번역 (한국어/영어/일본어 9개 키)
- [x] TypeScript 컴파일 검증 (`tsc --noEmit` 통과)
- [x] vendor git 메타데이터 제거
- [ ] **한국어 wav smoke test** (사용자 환경에서 모델 다운로드 후 실행)

## 알려진 한계

1. **macOS/CPU 학습은 smoke test 용도**. 실 학습은 NVIDIA GPU 권장.
2. **VoxCPM2는 LoRA만 공식 지원** — 전체 SFT 경로는 따로 활성화해야 한다.
3. **첫 추론 시 HF Hub 다운로드**가 ~수 GB 발생. `HF_HOME` 환경 변수로 캐시 위치 통제.
4. **denoiser (ZipEnhancer) ONNX**는 ModelScope `iic/speech_zipenhancer_ans_multiloss_16k_base`에서 자동 다운로드. 오프라인 환경에서는 미리 받아두어야 한다.

## 다음 단계

- [ ] **Phase 2.5** — 사용자 환경에서 `.venv-voxcpm2` + `openbmb/VoxCPM2` 다운로드 + 한국어 voice_cloning smoke test
- [ ] **Phase 3** — Supertonic 3 추론 통합 (ONNX in-process)
- [ ] **Phase 4** — Supertonic 3 역공학 학습 (별도 평가 후 진행)
