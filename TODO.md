# TODO

이 문서는 지금 구조가 거의 완성 단계에 들어온 뒤에도, 다음 구현에서 절대 놓치면 안 되는 남은 핵심 과제를 적어두는 문서입니다.

## 1. VoiceBox self-contained checkpoint 경로 유지

plain `CustomVoice Fine-Tune` 경로는 학습 시 새 화자를 붙이기 위해
`Base 1.7B` 체크포인트의 `speaker_encoder`를 보조로 빌려 씁니다.

이 문제를 해결하기 위해 현재 프로젝트는 별도 `VoiceBox` 경로를 둡니다.

1. plain `CustomVoice`에 새 화자 추가 학습
2. `Base 1.7B`의 `speaker_encoder`를 합쳐 self-contained `VoiceBox`로 변환
3. `VoiceBox -> VoiceBox` 추가 학습

관련 스크립트:

- [sft_custom_voice_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_custom_voice_12hz.py)
- [make_voicebox_checkpoint.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/fusion/make_voicebox_checkpoint.py)
- [sft_voicebox_12hz.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/finetuning/sft_voicebox_12hz.py)
- [clone_instruct.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/Qwen3-TTS/inference/voicebox/clone_instruct.py)

### 현재 상태

- plain `CustomVoice` checkpoint:
  `data/finetune-runs/mai_ko_customvoice17b_full/final`
- self-contained `VoiceBox` checkpoint:
  `data/finetune-runs/mai_ko_voicebox17b_full/final`
- `VoiceBox -> VoiceBox` 1 epoch 추가 학습 결과:
  `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`
- 추가 학습된 VoiceBox에서 clone / clone + instruct 생성 검증 완료

### 목표 상태

- VoiceBox 체크포인트 안에 `speaker_encoder.*` 가중치가 포함된다
- 그 체크포인트 하나만으로 다시 fine-tune을 이어서 할 수 있다
- `demo_model_family = "voicebox"`와 `speaker_encoder_included = true` 메타데이터를 유지한다
- clone / clone + instruct 경로를 계속 회귀 검증한다

### 완료 조건

1. 결과 체크포인트에 `speaker_encoder.*` 가중치가 실제로 저장된다: 완료
2. 그 체크포인트만으로 추가 fine-tune이 성공한다: 완료
3. `speaker_encoder_model_path` 없이도 추가 fine-tune이 된다: 완료
4. clone / clone + instruct 샘플 생성이 된다: 완료
5. aggressive instruct에서도 문장 보존이 안정적인 전략을 고른다: 진행 중

현재 안정 후보:

- `embedded_encoder_only`

주의 후보:

- `embedded_encoder_with_ref_code`
  - clone은 되지만, 공격적인 instruct에서 문장 보존이 한 번 흔들렸습니다.

## 2. 프런트 visual system 정리

현재 정보 구조는 거의 자리 잡았지만, 시각 언어는 아직 더 손봐야 합니다.

남은 과제:

- fish.audio 수준의 더 살아 있는 motion / waveform / hover affordance 정리
- “박스형 카드 반복”이 아닌 리스트/리듬 중심 레이아웃으로 정리
- `텍스트 음성 변환`, `목소리 복제`, `사운드 효과` 화면의 정보 밀도 재조정

## 3. 학습 결과 모델 선택 UX 정리

현재 방향은 “중간 epoch를 전부 노출”이 아니라 “run당 최종 선택 모델 하나”입니다.

남은 과제:

- 학습 완료 후 대표 모델을 더 명확히 표시
- `나의 목소리들`에서 최종 모델만 자연스럽게 보이게 정리
- 중간 체크포인트 관리 정책 문서화

## 4. Audio Tools 운영 문서 보강

`Applio / RVC`, `MMAudio`는 연결은 되어 있지만, 운영 문서가 아직 더 필요합니다.

남은 과제:

- RVC 모델 `.pth + .index` 교체 방법
- MMAudio 체크포인트 교체 방법
- 문제 발생 시 capability 진단 흐름

## 4-1. ACE-Step-1.5 음악 생성 운영 검증

ACE-Step 작곡 기능은 실제 로컬 ACE-Step-1.5 checkout과 전용 Python 환경을 사용합니다.

완료된 작업:

- `./scripts/download_models.sh ace-step` 프로필을 ACE-Step-1.5 + `acestep-download` 호출로 갱신
- 환경변수로 다운로드 프로필 선택 가능 (`ACE_STEP_DOWNLOAD_PROFILE=main|all|<model>|none`)
- `vendor/ACE-Step`, `.venv-ace-step`, `data/models/ace-step` 경로 표준화 (`ACESTEP_CHECKPOINTS_DIR` 자동 export)
- ACE-Step-1.5 설치를 `uv pip install --python .venv-ace-step/bin/python -e vendor/ACE-Step` 기준으로 정리
- `HF_HUB_ENABLE_HF_TRANSFER=1`일 때 ACE-Step 전용 venv에 `hf_transfer`를 자동 설치하도록 다운로드 스크립트 보정
- `scripts/run_ace_step_generate.py`를 `AceStepHandler` + `LLMHandler` + `generate_music()`으로 재작성
- 모든 task 지원: text2music / cover / repaint / extend(`complete`) / extract / lego / complete / understand / create_sample / format_sample
- `app/backend/app/ace_step.py`에 LoRA / 모델 변형 / LM 모델 목록 + 일반화된 `run(task, payload)` API 추가
- 새 백엔드 엔드포인트:
  - `GET /api/music/ace-step/runtime`
  - `POST /api/music/ace-step/{generate,cover,repaint,extend,extract,lego,complete,understand,create-sample,format-sample}`
- 새 Pydantic 스키마 (`AceStepCoverRequest` 등) + `AceStepRuntimeResponse` / `AceStepUnderstandResponse`
- 프런트엔드 ACE-Step 탭에 모드 선택 strip + 모드별 sub-form + 모델/LoRA 공통 패널 추가
- Inspiration / Format 결과를 자동으로 text2music 폼에 채워 합성으로 이어지게 연결
- 문서 [22-ace-step-music.md](./docs/cookbook/22-ace-step-music.md)을 1.5 구조로 갱신
- `acestep-v15-turbo` + RTX 5080에서 text2music smoke 성공
- `generate_ace_step_music()` 경로로 `ace_step_music` 생성 레코드 저장 성공

남은 운영 과제:

- 실제 ACE-Step checkpoint를 내려받은 환경에서 source-audio 기반 모드 smoke test (cover/repaint/extract/lego/complete)
- 개인 Hugging Face mirror에 `ace-step/` prefix로 1.5 checkpoint와 LoRA 업로드
- 새 clone 환경에서 `PRIVATE_ASSET_REPO_ID=... ./scripts/download_models.sh ace-step` 복구 검증
- LoRA train 스크립트(`vendor/ACE-Step/train.py`)를 백엔드 RvcTrainingResponse 패턴과 동일하게 노출할지 결정

## 5. 개인 Hugging Face 자산 mirror 구축

외부 모델 URL과 외부 저장소 의존성을 줄이기 위해, 운영에 필요한 대형 자산을 개인 Hugging Face model repo로 모아야 합니다.

## 6. Fish Speech S2-Pro 로컬 자산 운영

`S2-Pro` 탭은 Hosted API 키 없이 로컬 Fish Speech 서버로 생성하도록 연결했습니다.

완료된 작업:

- Fish Speech 설치 위치와 서버 URL을 `FISH_SPEECH_*` 환경변수로 표준화
- S2-Pro 모델 자산 다운로드를 `./scripts/download_models.sh s2pro`에 추가
- 로컬 Fish Speech 서버 실행 스크립트 `./scripts/serve_s2_pro.sh` 추가
- `/api/s2-pro/capabilities`, `/api/s2-pro/generate` 백엔드 엔드포인트 추가
- S2-Pro 기능을 `태그 생성`, `목소리 복제`, `멀티 스피커`, `다국어 생성` 사이드바 탭으로 분리
- 공식 문서와 모델 설명 기준 태그를 검색 가능한 S2-Pro tag library로 확장
- Fish Speech `/v1/references/add/list`를 사용한 저장 목소리 레지스트리 추가
- 저장한 S2-Pro 목소리를 S2-Pro 생성과 Qwen 복제/TTS 흐름으로 넘기는 브릿지 추가
- Tagged TTS, Voice Clone, Multi Speaker, Multilingual 생성 결과를 생성 갤러리와 연결
- S2-Pro 모델 자산을 개인 Hugging Face mirror upload manifest에 포함

남은 운영 과제:

- `data/models/fish-speech/s2-pro`의 모든 S2-Pro 샤드가 내려받아졌는지 검증
- 개인 HF repo에 `fish-speech/s2-pro/...` 레이아웃으로 업로드

현재 준비된 기준:

- upload manifest: [private-hf-assets.json](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/docs/manifests/private-hf-assets.json)
- 준비/업로드 스크립트: [prepare_private_hf_assets.py](/home/hosung/pytorch-demo/Qwen3-TTS-Demo/scripts/prepare_private_hf_assets.py)
- 다운로드 스크립트는 `PRIVATE_ASSET_REPO_ID`가 있으면 개인 repo를 먼저 확인합니다.

포함해야 하는 자산:

- `data/rvc-models/*.pth`
- `data/rvc-models/*.index`
- `data/mmaudio/nsfw/*.safetensors`
- `data/stem-separator-models/*.ckpt`
- `data/stem-separator-models/*.yaml`
- `data/models/ace-step/**`
- 필요하면 `data/models/*`의 Qwen/Whisper mirror

완료 조건:

1. 개인 HF repo를 private로 생성한다.
2. `scripts/prepare_private_hf_assets.py --repo-id ... --private --upload`로 보조 자산을 올린다.
3. 필요 시 `--include-public-models`로 Qwen/Whisper mirror까지 올린다.
4. 새 clone 환경에서 `PRIVATE_ASSET_REPO_ID=... ./scripts/download_models.sh`가 공개 fallback 없이 복구되는지 검증한다.
5. 검증된 repo revision을 문서에 고정한다.

## 7. FlashAttention 2 운영 검증 유지

WSL/Linux 기준 `flash-attn` v2 설치 경로는 확보했고, GPU smoke test도 통과했습니다.

유지 조건:

1. Linux + CUDA에서는 `flash_attention_2` 우선
2. macOS / 미지원 환경에서만 `sdpa`
3. PyTorch/CUDA 조합이 바뀌면 문서보다 먼저 smoke test 재검증

## 8. Optimizer 운영 정책 유지

현재 1.7B full fine-tuning에서는 optimizer 선택을 환경 변수로 제어합니다.

- 기본: `QWEN_DEMO_OPTIMIZER=adamw`
- RTX 5080 16GB full run 검증: `QWEN_DEMO_OPTIMIZER=adafactor`

`Adafactor`는 품질 향상용 설정이 아니라 optimizer state 메모리 피크를 낮춰
학습을 끝까지 완료하기 위한 안정화 선택입니다.

유지 조건:

1. 새 학습 결과 문서에 optimizer를 반드시 기록한다
2. AdamW로 실패하거나 GPU가 불안정했던 경우를 숨기지 않는다
3. 품질 판정은 optimizer 이름이 아니라 실제 생성음, 전사, speaker similarity로 한다
