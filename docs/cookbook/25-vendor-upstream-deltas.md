# Vendor Upstream Delta Register

이 문서는 `vendor/*`와 upstream-adjacent 코드가 원본 저장소와 달라진 이유를 추적하기 위한 기준 문서입니다.

목적은 단순 기록이 아니라, upstream repository가 업데이트되었을 때 현재 데모에 필요한 패치를 다시 적용할 수 있게 만드는 것입니다. `vendor` 안의 코드를 수정하거나 새 compatibility patch를 추가하면 반드시 이 문서를 같이 갱신합니다.

## 운영 원칙

- 가능한 한 upstream source는 그대로 둡니다.
- 데모 전용 Qwen/VoiceBox 코드는 `qwen_extensions/`에 둡니다.
- upstream 파일을 직접 수정해야 할 때는 이유, 파일, 재적용 방법, 검증 명령을 이 문서에 남깁니다.
- 모델 weight, dataset, generated output, venv는 vendor delta가 아닙니다. 이들은 `data/*`, `.venv-*` 아래에 두고 gitignore합니다.
- upstream을 새 버전으로 교체할 때는 이 문서의 항목을 하나씩 대조합니다.

## Upstream 업데이트 절차

1. 새 upstream 내용을 별도 브랜치에서 가져옵니다.
2. `git status --short vendor qwen_extensions app/backend/app/vendor_patches`로 현재 local delta를 확인합니다.
3. 이 문서의 vendor별 checklist를 보며 필요한 patch를 재적용합니다.
4. `python -m compileall`, backend endpoint smoke, frontend build를 실행합니다.
5. heavy runtime은 동시에 띄우지 말고 Qwen -> S2-Pro -> MMAudio -> ACE-Step -> VibeVoice -> Applio/RVC 순으로 하나씩 검증합니다.
6. upstream에서 동일 문제가 해결되었다면 해당 patch를 제거하고 이 문서에 “upstream absorbed”로 표시합니다.

기본 확인 명령:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
git diff --stat -- vendor qwen_extensions app/backend/app/vendor_patches
git diff -- vendor/MMAudio
./.venv/bin/python -m compileall app/backend/app qwen_extensions scripts
./.venv/bin/python -m pip check
cd app/frontend && npm run build
```

## Qwen3-TTS

### 상태

- Upstream source 위치: `vendor/Qwen3-TTS`
- 데모 확장 위치: `qwen_extensions`
- 백엔드 기준: `QWEN_EXTENSIONS` 환경변수, 기본값 `qwen_extensions`

### Delta

현재 운영 기준에서는 Qwen3-TTS upstream에 새 기능을 직접 섞지 않고, 데모 전용 코드를 `qwen_extensions`에 둡니다.

주요 데모 확장:

- `qwen_extensions/finetuning/sft_base_12hz.py`
- `qwen_extensions/finetuning/sft_custom_voice_12hz.py`
- `qwen_extensions/finetuning/sft_voicebox_12hz.py`
- `qwen_extensions/finetuning/voicebox_training_common.py`
- `qwen_extensions/fusion/make_voicebox_checkpoint.py`
- `qwen_extensions/inference/hybrid_clone_instruct.py`
- `qwen_extensions/inference/voicebox/*`

### 이유

- upstream fine-tuning script와 demo-specific VoiceBox workflow를 분리하기 위해서입니다.
- upstream 업데이트가 들어와도 Qwen 원본 파일과 데모 확장 파일을 독립적으로 비교할 수 있습니다.
- VoiceBox는 upstream 개념이 아니라 이 프로젝트의 self-contained CustomVoice 실험 경로입니다.

### 업데이트 시 확인

- upstream `finetuning/sft_12hz.py`의 tokenizer, dataset collator, optimizer, scheduler 변경이 있으면 `qwen_extensions/finetuning/voicebox_training_common.py`에 필요한 부분만 반영합니다.
- upstream inference API가 바뀌면 `qwen_extensions/inference/*`의 loader/runtime을 확인합니다.
- `scripts/live_training_step_smoke.py`로 Base, CustomVoice, VoiceBox가 `Epoch 0 | Step 0 | Loss`까지 진입하는지 확인합니다.

## MMAudio

### 상태

- Upstream source 위치: `vendor/MMAudio`
- 현재 이 프로젝트는 MMAudio upstream 파일 일부를 직접 수정합니다.
- 목적은 cu130 / torch 2.11 환경에서 audio-only generation과 pre-extracted training smoke가 import 단계에서 깨지지 않게 하는 것입니다.

### 수정 파일

| 파일 | 변경 내용 | 이유 |
| --- | --- | --- |
| `vendor/MMAudio/config/train_config.yaml` | `skip_final_sample` 옵션 추가 | 학습 저장 성공과 final sample/evaluation을 분리하기 위해서입니다. Smoke 또는 pre-extracted feature training에서 evaluation dependency 때문에 성공한 학습이 실패 처리되지 않게 합니다. |
| `vendor/MMAudio/train.py` | `skip_final_sample=True`일 때 마지막 `sample(eval_cfg)` 생략 | backend training endpoint에서 full/continued training 저장 검증을 먼저 안정화하기 위해서입니다. |
| `vendor/MMAudio/mmaudio/runner.py` | `av_bench.evaluate`, `av_bench.extract`를 lazy import | `av-benchmark`가 없어도 core training import와 help/smoke가 막히지 않게 합니다. Evaluation을 실제로 요청할 때만 명확한 오류를 냅니다. |
| `vendor/MMAudio/mmaudio/utils/media_io.py` | 신규 compatibility helper | TorchAudio cu130 계열에서 legacy `torio`가 빠진 경우, raw video I/O가 필요한 시점에만 actionable error를 내기 위해서입니다. |
| `vendor/MMAudio/mmaudio/data/eval/moviegen.py` | `StreamingMediaDecoder` 직접 import 제거, helper 사용 | import-time `torio` crash 방지 |
| `vendor/MMAudio/mmaudio/data/eval/video_dataset.py` | `StreamingMediaDecoder` 직접 import 제거, helper 사용 | import-time `torio` crash 방지 |
| `vendor/MMAudio/mmaudio/data/extraction/vgg_sound.py` | `StreamingMediaDecoder` 직접 import 제거, helper 사용 | import-time `torio` crash 방지 |
| `vendor/MMAudio/mmaudio/utils/video_joiner.py` | decoder/encoder helper 사용 | audio-only path와 pre-extracted training path가 raw video dependency에 묶이지 않게 합니다. |
| `vendor/MMAudio/mmaudio/sample.py` | `LOCAL_RANK`, `WORLD_SIZE` 직접 env 접근 대신 `dist_utils` 값 사용 | 단일 프로세스 smoke나 torchrun 환경 차이에서 import가 덜 취약하게 합니다. |
| `vendor/MMAudio/mmaudio/utils/logger.py` | git 정보 수집 예외 범위를 넓힘 | vendor source가 detached 상태이거나 `.git` metadata가 없는 배포 형태에서도 training logger가 죽지 않게 합니다. |

### 유지해야 하는 동작

- `MMAudioSoundEffectEngine`은 기존처럼 효과음 생성에 upstream/sample 경로를 사용합니다.
- training endpoint는 `skip_final_sample`을 payload의 `run_final_sample`과 연결합니다.
- raw video evaluation/extraction을 실제로 쓸 때는 `torio` 호환 torch/torchaudio 환경 또는 upstream이 권장하는 환경이 필요합니다.
- pre-extracted feature training과 audio-only generation은 `torio` 없이도 import 단계에서 살아 있어야 합니다.

### 업데이트 시 재적용 기준

upstream MMAudio가 다음 중 하나를 해결했다면 해당 local patch는 제거할 수 있습니다.

- `torio` 없는 환경에서 video I/O import를 lazy 처리함
- `av-benchmark`가 없는 환경에서도 runner import가 성공함
- final sampling/evaluation을 training 저장 성공과 분리하는 config를 제공함
- distributed env가 없는 단일 프로세스 import를 공식 지원함

재검증 명령:

```bash
cd ~/pytorch-demo/Qwen3-TTS-Demo
./.venv/bin/python -m compileall vendor/MMAudio/mmaudio app/backend/app
./.venv/bin/python scripts/live_external_training_smoke.py --engines mmaudio
./.venv/bin/python scripts/live_e2e_verify.py --include-heavy --port 8202
```

heavy E2E는 장시간 실행입니다. 다른 GPU 작업이 떠 있지 않은 상태에서 한 번에 하나만 실행합니다.

## Fish Speech / S2-Pro

### 상태

- Upstream source 위치: `vendor/fish-speech`
- 런타임 실행: `.venv-fish-speech`
- 모델 위치: `data/models/fish-speech/s2-pro`

### Delta

현재 Fish Speech source 자체를 직접 patch하는 대신, wrapper script와 backend bridge로 통합합니다.

관련 파일:

- `scripts/install_fish_speech_runtime.py`
- `scripts/serve_s2_pro.sh`
- `app/backend/app/fish_speech.py`

### 이유

- Fish Speech upstream은 torch version pin이 강할 수 있어 Qwen/flash-attn 환경과 같은 `.venv`에 섞으면 CUDA 조합이 흔들릴 수 있습니다.
- 따라서 source는 vendor에 두되, 설치와 실행은 별도 venv/process로 격리합니다.
- backend가 Local S2-Pro server를 lazy start하고, 다른 heavy engine 전환 시 managed process를 unload할 수 있게 합니다.

### 업데이트 시 확인

- upstream `tools/api_server.py` 인자 이름이 바뀌면 `scripts/serve_s2_pro.sh`를 갱신합니다.
- reference voice API가 바뀌면 `register_s2_pro_reference`, `generate_s2_pro_audio`의 endpoint/payload를 갱신합니다.
- `.venv-fish-speech`는 gitignore 대상이므로 source update 후 재설치가 필요할 수 있습니다.

## VibeVoice

### 상태

- Upstream/vendor source 위치: `vendor/VibeVoice`
- 데모 compatibility patch 위치: `app/backend/app/vendor_patches/vibevoice`
- 모델 위치: `data/models/vibevoice`
- 런타임 실행: `.venv-vibevoice`

### Delta

VibeVoice source는 vendored 상태로 두고, 모델 weight만 다운로드합니다. 일부 inference 호환 문제는 `app/backend/app/vendor_patches/vibevoice/modeling_vibevoice_inference.py`로 분리합니다.

관련 backend/script:

- `app/backend/app/vibevoice.py`
- `scripts/run_vibevoice_tts_15b.py`
- `scripts/run_vibevoice_asr.py`

### 이유

- Microsoft VibeVoice와 community 1.5B/7B 경로는 model class와 inference entrypoint가 서로 다를 수 있습니다.
- upstream source를 직접 덮어쓰기보다 backend compatibility patch를 분리해 업데이트 때 비교하기 쉽게 합니다.

### 업데이트 시 확인

- upstream long-form inference class가 현재 patch와 동일 기능을 제공하면 patch 제거를 검토합니다.
- `download_models.sh vibevoice`는 source를 clone하지 않고 vendored source 존재만 확인해야 합니다.
- `scripts/live_external_training_smoke.py --engines vibevoice`로 training endpoint smoke를 확인합니다.

## ACE-Step

### 상태

- Upstream/vendor source 위치: `vendor/ACE-Step`
- 런타임 실행: `.venv-ace-step`
- 모델/cache 위치: `data/models/ace-step`, `data/cache/ace-step`

### Delta

현재 ACE-Step source 직접 patch보다 wrapper 방식이 기준입니다.

관련 파일:

- `app/backend/app/ace_step.py`
- `scripts/run_ace_step_generate.py`
- `scripts/download_models.sh`

### 이유

- ACE-Step은 음악 생성 의존성이 Qwen과 달라 별도 venv/process로 실행해야 안정적입니다.
- backend는 text-to-music, cover, repaint, extend, extract, lego, complete, understand 등 기능별 endpoint를 wrapper로 노출합니다.

### 업데이트 시 확인

- upstream CLI 인자 순서나 command 이름이 바뀌면 `app/backend/app/ace_step.py`와 `scripts/run_ace_step_generate.py`를 갱신합니다.
- `scripts/live_external_training_smoke.py --engines ace-step`로 trainer 진입과 로그 생성을 확인합니다.

## Applio / RVC

### 상태

- Upstream/vendor source 위치: `vendor/Applio`
- 모델 위치: `data/rvc-models`
- runtime assets: `data/models/applio`

### Delta

현재 기준에서는 Applio source 직접 patch보다 backend wrapper와 download script 보강이 중심입니다.

관련 파일:

- `app/backend/app/voice_changer.py`
- `scripts/download_models.sh`
- `scripts/download_models.ps1`

### 이유

- Applio/RVC는 TTS가 아니라 audio-to-audio voice conversion입니다.
- 이 프로젝트는 생성 갤러리 음성, 업로드 음성, 경로 입력을 RVC model로 변환하고, RVC model training/batch/blend 기능을 UI에 연결합니다.
- `contentvec`, `rmvpe.pt`, demo RVC `.pth/.index`는 런타임 자산이므로 download script가 미리 준비합니다.

### 업데이트 시 확인

- Applio CLI command가 바뀌면 `voice_changer.py`의 command builder를 갱신합니다.
- runtime asset 경로가 바뀌면 download script와 `.gitignore`를 함께 갱신합니다.
- `scripts/live_external_training_smoke.py --engines applio`와 voice conversion E2E를 확인합니다.

## Upstream Delta를 남길 때의 작성 규칙

새 patch가 생기면 아래 항목을 추가합니다.

```text
### <Vendor Name>

- Upstream source:
- 수정 파일:
- 변경 이유:
- upstream 업데이트 때 제거 가능한 조건:
- 검증 명령:
```

특히 `vendor/*` 파일을 직접 수정했다면 “왜 wrapper로 충분하지 않았는지”를 반드시 적습니다.
