# Private Hugging Face Asset Mirror

이 문서는 모델과 오디오 도구 자산을 개인 Hugging Face 저장소에 모아 두는 운영 계획입니다.

목표는 외부 URL이 바뀌거나 내려가도 프로젝트가 같은 구조로 복구되게 만드는 것입니다.

## 왜 필요한가

현재 프로젝트는 아래 외부 자산에 의존합니다.

- Qwen3-TTS stock 모델과 tokenizer
- Qwen3-ASR 1.7B / 0.6B
- Applio/RVC 기본 `.pth + .index`
- MMAudio NSFW checkpoint
- Stem Separator checkpoint와 YAML (`오디오 분리` 탭 전용)
- Fish Speech S2-Pro 모델 자산
- ACE-Step checkpoint/cache 자산

이 자산들은 git에 직접 올리면 안 됩니다. 크기가 크고, GitHub 제한에 걸리며, 저장소 clone도 느려집니다.

대신 개인 Hugging Face model repo에 같은 구조로 업로드하고, `download_models.*`가 그 repo에서 먼저 받아오게 합니다.

## 개인 repo 내부 경로

권장 repo 예:

```text
<your-hf-username>/qwen3-tts-demo-assets
```

repo 내부 구조:

```text
models/
  Qwen3-TTS-Tokenizer-12Hz/
  Qwen3-TTS-12Hz-0.6B-Base/
  Qwen3-TTS-12Hz-1.7B-Base/
  Qwen3-TTS-12Hz-0.6B-CustomVoice/
  Qwen3-TTS-12Hz-1.7B-CustomVoice/
  Qwen3-TTS-12Hz-1.7B-VoiceDesign/
  Qwen3-ASR-1.7B/
  Qwen3-ASR-0.6B/
rvc-models/
  yui-mix-pro-hq-40k.pth
  added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index
mmaudio/
  nsfw/
    mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors
stem-separator-models/
  vocals_mel_band_roformer.ckpt
  vocals_mel_band_roformer.yaml
fish-speech/
  s2-pro/
    codec.pth
    model-00001-of-00002.safetensors
    model-00002-of-00002.safetensors
    model.safetensors.index.json
    tokenizer.json
    tokenizer_config.json
    special_tokens_map.json
ace-step/
  checkpoints-or-cache-files...
```

## 업로드 준비

보조 자산만 manifest로 준비:

```bash
./.venv/bin/python scripts/prepare_private_hf_assets.py
```

Qwen/Qwen3-ASR mirror까지 포함해서 준비:

```bash
./.venv/bin/python scripts/prepare_private_hf_assets.py --include-public-models
```

생성되는 manifest:

```text
docs/manifests/private-hf-assets.json
```

## 업로드 실행

먼저 Hugging Face token을 준비합니다.

```bash
export HF_TOKEN=...
```

보조 자산 업로드:

```bash
./.venv/bin/python scripts/prepare_private_hf_assets.py \
  --repo-id <your-hf-username>/qwen3-tts-demo-assets \
  --private \
  --upload
```

Qwen/Qwen3-ASR mirror까지 업로드:

```bash
./.venv/bin/python scripts/prepare_private_hf_assets.py \
  --repo-id <your-hf-username>/qwen3-tts-demo-assets \
  --private \
  --include-public-models \
  --upload
```

## 다운로드 실행

개인 repo를 우선 사용:

```bash
export PRIVATE_ASSET_REPO_ID=<your-hf-username>/qwen3-tts-demo-assets
export PRIVATE_ASSET_REVISION=main
./scripts/download_models.sh
```

Qwen/Qwen3-ASR 모델도 개인 mirror에서 받으려면:

```bash
export PRIVATE_ASSET_REPO_ID=<your-hf-username>/qwen3-tts-demo-assets
export PRIVATE_ASSET_REVISION=main
export QWEN_USE_PRIVATE_ASSET_REPO=1
./scripts/download_models.sh
```

## 현재 구현 기준

- `PRIVATE_ASSET_REPO_ID`가 있으면 RVC, MMAudio NSFW, Stem Separator, Fish Speech S2-Pro 자산을 개인 repo에서 먼저 찾습니다.
- Stem Separator mirror는 오디오 분리 탭의 기본 보컬 모델 1개만 대상으로 합니다. 같은 Roformer 계열 상위 후보를 모두 mirror할 필요는 없습니다.
- 개인 repo에 파일이 없으면 기존 public URL 또는 `audio-separator` 다운로드 경로로 되돌아갑니다.
- `QWEN_USE_PRIVATE_ASSET_REPO=1`이면 Qwen/Qwen3-ASR 모델도 `models/<model-dir>/...` mirror에서 받습니다.
- S2-Pro는 `fish-speech/s2-pro/...` mirror에서 받습니다.
- ACE-Step은 `ace-step/...` mirror에서 받아 `data/models/ace-step`에 복구합니다.
- 모델과 생성물 폴더는 gitignore 대상입니다.

## 남은 운영 과제

- 개인 repo에 업로드한 파일의 revision을 고정합니다.
- 공개 원본 URL과 개인 mirror URL을 둘 다 문서에 남깁니다.
- CI 또는 smoke script에서 `PRIVATE_ASSET_REPO_ID` 기준 bootstrap을 검증합니다.
