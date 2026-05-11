# 27. CosyVoice 3 작업실

> FunAudioLLM CosyVoice 3 (Apache 2.0) 통합. 한국어 등 9개 언어의 zero-shot
> / cross-lingual / instruct2 / SFT / voice conversion을 지원한다.

## 한 줄 요약

`scripts/run_cosyvoice_generate.py` + `scripts/run_cosyvoice_train.py`를
`.venv-cosyvoice3` subprocess로 실행한다. 백엔드의 `CosyVoice3Engine`
(``app/backend/app/cosyvoice.py``)이 모든 호출을 감싼다. UI 패널은 별도
세션에서 추가 예정 (현재 백엔드/스키마/API/타입/탭 정의까지 완료).

## 모델 / 라이선스

| 항목 | 값 |
|---|---|
| 라이선스 | Apache 2.0 |
| 권장 가중치 | ``Fun-CosyVoice3-0.5B`` (ModelScope/HF) |
| 한국어 지원 | ✅ cross-lingual 모드 권장 |
| 표현 태그 | ``[laughter]``, ``[breath]`` 등 fine-grained control |
| 학습 모드 | SFT (``llm`` / ``flow`` / ``hifigan`` 서브모듈 선택) — LoRA 미지원 |

## 설치 / 셋업

1. **vendor clone** (이미 완료)
   ```bash
   git -C vendor clone --depth 1 https://github.com/FunAudioLLM/CosyVoice.git
   git -C vendor/CosyVoice submodule update --init --recursive
   ```

2. **가상환경 생성**
   ```bash
   python3.11 -m venv .venv-cosyvoice3
   source .venv-cosyvoice3/bin/activate
   ```

3. **의존성 설치**
   ```bash
   python scripts/install_cosyvoice_runtime.py --torch-profile cu121
   # macOS: --torch-profile mps  /  CPU only: --torch-profile cpu
   ```

4. **사전학습 모델 다운로드** (ModelScope 권장)
   ```bash
   pip install modelscope
   python -c "
   from modelscope import snapshot_download
   snapshot_download('iic/Fun-CosyVoice3-0.5B',
                    local_dir='data/models/cosyvoice3/Fun-CosyVoice3-0.5B')
   "
   ```

5. **환경 변수** (선택 — 기본값을 쓰면 설정 불필요)
   ```bash
   export COSYVOICE_REPO_ROOT=vendor/CosyVoice
   export COSYVOICE_PYTHON_EXECUTABLE=$(pwd)/.venv-cosyvoice3/bin/python
   export COSYVOICE_MODEL_DIR=$(pwd)/data/models/cosyvoice3
   ```

## API

### `GET /api/cosyvoice/runtime`

가용성 / 모델 변형 / 프리셋 / 지원 task / 지원 언어를 반환.

### `POST /api/cosyvoice/generate`

요청 스키마: ``CosyVoice3GenerateRequest``

| task | 필수 필드 | 한국어 권장 여부 |
|---|---|---|
| ``zero_shot`` | ``text``, ``prompt_text``, ``prompt_audio_path`` | △ (영어/중국어 prompt_text가 안정적) |
| ``cross_lingual`` | ``text``, ``prompt_audio_path`` | **✅ 한국어 1순위** |
| ``instruct2`` | ``text``, ``instruct_text``, ``prompt_audio_path`` | △ (instruct_text는 영어 권장) |
| ``sft`` | ``text``, ``speaker`` | ❌ (Chinese/English SFT 모델만) |
| ``vc`` | ``source_audio_path``, ``prompt_audio_path`` | ✅ (텍스트 없음) |

응답: ``GenerationResponse`` (다른 vendor와 동일한 record 포맷).

예시 (cross_lingual, 한국어):
```bash
curl -X POST http://localhost:8000/api/cosyvoice/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "cross_lingual",
    "text": "안녕하세요, 오늘 날씨가 정말 좋네요. [breath] 산책하기 딱 좋은 날이에요.",
    "prompt_audio_path": "data/generated/sample-voice.wav",
    "language": "ko",
    "model_name": "Fun-CosyVoice3-0.5B"
  }'
```

### `GET/POST /api/cosyvoice/voices`

zero-shot/cross-lingual 프리셋 (참조 오디오 + 대본) 저장·조회.

저장 요청 (``CosyVoice3VoicePresetCreateRequest``):
```json
{
  "name": "my_voice_01",
  "prompt_text": "이 음성은 차분한 톤의 한국어 샘플입니다.",
  "prompt_audio_path": "data/generated/sample.wav",
  "language": "ko",
  "task": "cross_lingual",
  "notes": "한국어 차분한 톤 프리셋"
}
```

### `DELETE /api/cosyvoice/voices/{name}`

프리셋 삭제.

### `POST /api/cosyvoice/train`

요청 스키마: ``CosyVoice3TrainingRequest``

| 필드 | 설명 |
|---|---|
| ``dataset_id`` | ``data/datasets/<id>/manifest.jsonl`` 위치 |
| ``cv_dataset_id`` | 검증 데이터셋 (선택) |
| ``submodels`` | ``["llm"]`` / ``["flow"]`` / ``["hifigan"]`` 중 다중 선택 |
| ``train_engine`` | ``torch_ddp`` 또는 ``deepspeed`` |
| ``base_model`` | 기본 ``Fun-CosyVoice3-0.5B`` |
| ``max_epoch``, ``batch_size``, ``learning_rate``, ``num_workers`` | 학습 하이퍼파라미터 |

데이터셋 manifest 포맷 (JSONL):
```jsonl
{"audio": "wavs/utt_001.wav", "text": "안녕하세요", "speaker": "spk_main"}
{"audio": "wavs/utt_002.wav", "text": "반갑습니다", "speaker": "spk_main"}
```

학습 파이프라인은 다음 단계를 자동으로 실행:
1. ``prepare`` — wav.scp / text / utt2spk / spk2utt 생성
2. ``extract_embedding`` — ``campplus.onnx`` 화자 임베딩
3. ``extract_speech_token`` — ``speech_tokenizer_v1.onnx`` 토큰화
4. ``make_parquet`` — parquet 직렬화
5. ``train_<submodel>`` — ``cosyvoice/bin/train.py`` 실행

GPU가 보이면 ``torchrun --nproc_per_node=N``로 자동 분산. GPU가 없으면
단일 프로세스 fallback (``deepspeed`` 인자 자동 제거). 학습 결과는
``data/finetune-runs/cosyvoice3/<run_id>/exp/<submodel>/``에 저장.

## 한국어 사용 팁

1. **무조건 cross_lingual 모드**가 한국어에 가장 안정적. zero_shot은
   ``prompt_text``가 중국어/영어인 경우에만 권장.
2. **fine-grained control 태그** (``[breath]``, ``[laughter]``)는 한국어
   문장 안에 그대로 삽입해도 작동한다.
3. **instruct2 모드**의 ``instruct_text``는 영어로 작성하는 것이 안전.
   예: ``"You are a helpful assistant. Speak in a calm, low voice.<|endofprompt|>"``.
4. **참조 오디오 (prompt_audio_path)**는 16kHz 모노 WAV 또는 24kHz 이상 권장.
   3~10초 사이의 깨끗한 한국어 발성이 가장 좋다.

## 일관성 체크리스트 (다른 vendor와 동일 패턴)

- [x] ``app/backend/app/cosyvoice.py``에 ``Engine`` 클래스
- [x] ``status``/``availability_notes``/``run``/``train`` 메서드 제공
- [x] 환경 변수 ``COSYVOICE_REPO_ROOT``/``COSYVOICE_PYTHON_EXECUTABLE``/``COSYVOICE_MODEL_DIR`` 인식
- [x] FastAPI 라우트 ``/api/cosyvoice/runtime``/``generate``/``voices``/``train`` 등록
- [x] Pydantic 요청·응답 모델 6종
- [x] ``scripts/install_cosyvoice_runtime.py``
- [x] ``scripts/run_cosyvoice_generate.py`` subprocess JSON 프로토콜
- [x] ``scripts/run_cosyvoice_train.py`` 5단계 파이프라인
- [x] ``data/models/cosyvoice3/``, ``data/finetune-runs/cosyvoice3/``, ``data/cosyvoice3-voices/`` 자동 생성
- [x] TS 타입 ``app/frontend/src/lib/types.ts``
- [x] API 클라이언트 ``app/frontend/src/lib/api.ts``
- [x] ``TabKey`` enum + ``PRODUCT_PAGES`` 항목 4종
- [x] App.tsx 패널 4종 (TTS / Voices / Dataset / Training)
- [x] 사이드바 nav group (COSYVOICE 섹션 4개 버튼)
- [x] i18n 번역 (한국어/영어/일본어 9개 키)
- [x] TypeScript 컴파일 검증 (``tsc --noEmit`` 통과)
- [x] vendor git 메타데이터 제거 (다른 vendor와 동일하게 정리)
- [ ] **한국어 wav smoke test** (사용자 환경에서 모델 다운로드 후 실행)

## 알려진 한계

1. **macOS/CPU 학습은 smoke test 용도**. 실 학습은 NVIDIA GPU + Linux
   필수 (NCCL, deepspeed, optional flash-attn 의존).
2. **CosyVoice는 LoRA를 공식 지원하지 않음.** 전체 ``llm``/``flow``/``hifigan``
   파인튜닝만 가능. LoRA 어댑터가 필요하면 별도 패치 작업이 요구된다.
3. **첫 추론 시 ModelScope 캐시 다운로드**로 수분 이상 소요될 수 있다.
   ``MODELSCOPE_CACHE``를 미리 설정하면 캐시 위치를 통제할 수 있다.
4. **vendor/CosyVoice/third_party/Matcha-TTS** 서브모듈이 비어 있으면
   추론이 즉시 실패한다. clone 직후 ``git submodule update --init --recursive``
   필수.

## 다음 단계

- [ ] **Phase 1.5** — 사용자 환경에서 ``.venv-cosyvoice3`` 셋업 + Fun-CosyVoice3-0.5B
       다운로드 + 한국어 cross_lingual smoke test
- [ ] **Phase 2** — VoxCPM2 통합 (동일 패턴)
- [ ] **Phase 3** — Supertonic 3 추론 통합 (메인 venv ONNX)
- [ ] **Phase 4** — Supertonic 3 역공학 학습 (별도 평가 후 진행)
- [ ] **Phase 2** — VoxCPM2 통합 (동일 패턴)
- [ ] **Phase 3** — Supertonic 3 추론 통합
- [ ] **Phase 4** — Supertonic 3 역공학 학습 (별도 평가 후 진행)
