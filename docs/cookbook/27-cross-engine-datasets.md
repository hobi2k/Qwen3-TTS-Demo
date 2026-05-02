# Cross-Engine Dataset Builder

이 문서는 Qwen 외 엔진용 데이터셋 준비 흐름을 정리합니다.

이전에는 Qwen 학습용 데이터셋만 생성 갤러리와 폴더 입력을 모두 지원했고,
S2-Pro, VibeVoice, Applio/RVC, MMAudio, ACE-Step 쪽은 학습 화면에서 이미
정리된 경로나 JSONL을 다시 입력해야 했습니다. 지금 구조에서는 모든 엔진이
같은 규칙을 따릅니다. 데이터셋 탭은 데이터를 만들거나 가져오는 곳이고,
학습 탭은 준비된 데이터셋을 선택해서 학습 설정만 조정하는 곳입니다.

## 지원 입력

모델별 데이터셋 탭은 공통적으로 두 가지 입력을 지원합니다.

- `생성 갤러리`
  - 앱에서 만든 음성을 골라 데이터셋 샘플로 넣습니다.
  - 선택한 샘플은 화면에서 바로 재생하고 제거할 수 있습니다.
  - 샘플에 저장된 transcript가 있으면 그대로 쓰고, 없으면 ASR로 전사합니다.
- `폴더 경로`
  - 로컬 폴더 안의 `wav`, `mp3`, `m4a`, `flac`, `ogg`, `opus` 파일을 스캔합니다.
  - 같은 이름의 `.txt` 또는 `.lab` 파일이 있으면 전사로 사용합니다.
  - 전사 파일이 없으면 선택한 ASR 모델로 자동 전사합니다.

S2-Pro와 ACE-Step처럼 이미 전처리된 자산을 직접 받을 수 있는 엔진은 세 번째
미니 탭을 추가로 제공합니다.

- `S2-Pro / Prepared proto`
  - Fish Speech proto 폴더를 다시 복사하지 않고 학습 탭으로 바로 넘깁니다.
- `ACE-Step / Prepared tensor`
  - 이미 preprocess가 끝난 tensor 폴더를 LoRA/LoKr 학습 탭으로 바로 넘깁니다.

## ASR 자동 전사

공통 데이터셋 빌더는 `asr_model_id`를 요청에 포함합니다.

기본값은 Qwen3-ASR 1.7B이며, UI에서 모델을 바꿀 수 있습니다.

동작 방식:

1. 갤러리 샘플에 transcript가 있으면 그것을 사용합니다.
2. 폴더 샘플 옆에 `.txt` 또는 `.lab`가 있으면 그것을 사용합니다.
3. 텍스트가 비어 있고 `transcribe=true`이면 ASR로 전사합니다.

ASR 전사는 데이터셋 생성 단계에서만 실행됩니다. 학습 버튼을 누를 때마다
다시 전사하지 않습니다.

## 생성되는 폴더 구조

모든 엔진용 데이터셋은 `data/datasets/<dataset_id>/` 아래에 모입니다.

```text
data/datasets/<dataset_id>/
  audio/
    00001_sample.wav
    00002_sample.wav
  lab_audio/
    00001_sample.wav
    00001_sample.lab
    00002_sample.wav
    00002_sample.lab
  reference.wav
  train.jsonl
  validation.jsonl
  dataset.json
  manifest.json
```

각 파일의 역할:

- `audio/`
  - 일반 엔진용 정규화 WAV 샘플입니다.
- `lab_audio/`
  - S2-Pro raw voice folder용 WAV + `.lab` 전사 묶음입니다.
- `reference.wav`
  - VibeVoice voice prompt나 참조 기반 흐름에 쓸 기준 음성입니다.
- `train.jsonl`
  - VibeVoice TTS/ASR, 기타 JSONL 학습 흐름에 넘길 수 있는 기본 학습 파일입니다.
- `validation.jsonl`
  - 마지막 샘플을 validation으로 둔 최소 검증 파일입니다.
- `dataset.json`
  - ACE-Step 등 JSON 기반 전처리 흐름에 넘길 수 있는 프롬프트/오디오 목록입니다.
- `manifest.json`
  - 어떤 원본 파일이 어떤 데이터셋 샘플로 복사되었는지 추적합니다.

## 엔진별 연결

각 모델의 학습 탭은 Qwen 학습 탭처럼 `준비된 데이터셋` 선택 패널을 갖습니다.
따라서 데이터셋 탭에서 만든 결과는 새로고침 후에도 bootstrap의 `audio_datasets`
목록으로 다시 표시되고, `학습 입력에 적용` 버튼으로 각 학습 폼에 들어갑니다.
학습 탭에는 raw folder, proto path, tensor path, JSONL path 같은 데이터 입력란을
반복해서 두지 않습니다.

연결 기준:

- S2-Pro: 데이터셋의 raw voice folder 또는 prepared proto를 학습 입력에 연결합니다.
- VibeVoice: 데이터셋의 train/validation JSONL과 루트 폴더를 내부적으로 연결합니다.
- Applio/RVC: 데이터셋의 정규화 WAV 묶음을 목표 목소리 학습 입력에 연결합니다.
- MMAudio: 데이터셋 manifest를 기준으로 configured training 입력에 연결합니다.
- ACE-Step: dataset JSON, audio 묶음, 또는 prepared tensor를 학습 입력에 연결합니다.

### S2-Pro

`생성 갤러리` 또는 `폴더 경로`로 만들면 `lab_audio/`가 S2-Pro 학습 입력에
자동으로 연결됩니다. 학습 화면에서 raw voice folder를 다시 입력하지 않습니다.

이미 proto가 있으면 `Prepared proto` 탭에서 proto 폴더를 입력하고 바로 학습 탭으로
넘깁니다.

### VibeVoice

공통 빌더가 만든 train/validation JSONL과 데이터셋 루트가 VibeVoice TTS/ASR
학습 입력에 연결됩니다.

기본 컬럼은 `text`, `audio`, `voice_prompts`입니다.

### Applio / RVC

RVC는 전사를 직접 사용하지 않지만, 같은 데이터셋 폴더의 `audio/`를 목표 화자
WAV 폴더로 사용합니다.

manifest에는 전사 결과도 남기므로 나중에 같은 음성 묶음을 다른 TTS 학습으로
재사용할 수 있습니다.

### MMAudio

MMAudio는 upstream config 기반 학습이 중심이지만, 앱에서는 효과음/오디오 샘플을
한 폴더에 모아 `dataset.json`과 manifest를 먼저 만들 수 있습니다.

이 데이터셋은 로컬 실험용 config 작성이나 개인 Hugging Face mirror 업로드 전
자산 정리에 사용합니다.

### ACE-Step

공통 빌더가 만든 dataset JSON과 audio 묶음을 ACE-Step 학습 입력에 연결합니다.

이미 tensor 전처리를 끝낸 경우 `Prepared tensor` 탭에서 tensor 폴더를 넘깁니다.

## API

공통 데이터셋 생성 엔드포인트:

```http
POST /api/audio-datasets/build
```

요청 예시:

```json
{
  "name": "mai-s2pro-voice",
  "target": "s2_pro",
  "source_type": "gallery",
  "samples": [
    {
      "audio_path": "data/generated/qwen/2026-05-02/sample.wav",
      "text": "오늘은 정말 힘들었어."
    }
  ],
  "transcribe": true,
  "asr_model_id": "Qwen/Qwen3-ASR-1.7B"
}
```

`target` 값:

- `s2_pro`
- `vibevoice`
- `rvc`
- `mmaudio`
- `ace_step`

응답에는 `dataset_root_path`, `audio_dir_path`, `lab_audio_dir_path`,
`train_jsonl_path`, `validation_jsonl_path`, `dataset_json_path`, `manifest_path`가
포함됩니다.

목록 조회와 삭제:

```http
GET /api/audio-datasets
GET /api/audio-datasets/{dataset_id}/download
DELETE /api/audio-datasets/{dataset_id}
GET /api/datasets
GET /api/datasets/{dataset_id}/download
DELETE /api/datasets/{dataset_id}
```

`/api/audio-datasets/{dataset_id}` 삭제는 `target`이 `s2_pro`, `vibevoice`,
`rvc`, `mmaudio`, `ace_step`인 공용 오디오 데이터셋만 대상으로 합니다.
Qwen용 FineTuneDataset은 `/api/datasets/{dataset_id}`로 삭제합니다. 두 삭제
경로 모두 `data/datasets/<dataset_id>/` 폴더와 연결 manifest를 함께 제거합니다.

다운로드 엔드포인트는 삭제와 반대로 재현에 필요한 파일을 zip으로 묶습니다.
Qwen 데이터셋은 raw/prepared JSONL, 기준 음성, manifest를 포함하고,
공용 오디오 데이터셋은 `audio/`, `lab_audio/`, `train.jsonl`, `validation.jsonl`,
`dataset.json`, `manifest.json`을 가능한 한 함께 담습니다.

재사용 자산 다운로드:

```http
GET /api/presets/{preset_id}/download
GET /api/clone-prompts/{prompt_id}/download
GET /api/s2-pro/voices/{voice_id}/download
GET /api/audio-tools/voice-models/{model_id}/download
GET /api/finetune-runs/{run_id}/download
```

프리셋 zip에는 메타데이터, 참조 음성, clone prompt, 카드 이미지가 들어갑니다.
훈련 모델 zip에는 fine-tuning run 폴더, 최종 체크포인트, 로그, 실행 메타데이터가
들어갑니다. RVC 모델 zip에는 `.pth`, `.index`, 카드 이미지가 포함됩니다.

## 운영 화면

`나의 목소리들`은 이제 목소리 자산만이 아니라 운영에 필요한 학습 자산까지
확인하는 라이브러리 역할을 합니다.

- `훈련한 모델`: Qwen, CustomVoice, VoiceBox 등 바로 TTS에 쓸 수 있는 학습 결과
- `Qwen 프리셋`: Qwen clone prompt와 Qwen preset
- `S2-Pro 프리셋`: Fish Speech/S2-Pro에서 저장한 reusable voice asset
- `RVC 모델`: Applio/RVC 변환에 쓰는 `.pth`와 `.index`
- `데이터셋`: Qwen, S2-Pro, VibeVoice, RVC, MMAudio, ACE-Step용 데이터셋

`훈련한 모델` 카드의 삭제는 해당 fine-tuning run 폴더와 실행 레코드를 함께
제거합니다. 기본 모델은 이 영역에 나오지 않으므로 실수로 삭제되지 않습니다.
프리셋과 데이터셋 삭제처럼 확인 모달을 거쳐 실행합니다.

데이터셋 영역은 엔진별 미니 필터를 갖습니다. Qwen 데이터셋은 `FineTuneDataset`
목록에서 오며, `mai_ko_full`처럼 Qwen 학습 탭에서 만든 데이터셋도 여기에
표시됩니다. S2-Pro, VibeVoice, RVC, MMAudio, ACE-Step 데이터셋은
`audio_datasets` 목록에서 오며, 모두 `data/datasets/<dataset_id>/` 아래의
manifest로 추적됩니다.

데이터셋 카드의 `학습에 연결` 버튼은 엔진별 학습 폼에 맞는 경로를 자동으로
채웁니다. `삭제` 버튼은 데이터셋 폴더와 manifest를 함께 제거합니다.

운영 화면에서는 `dataset_root_path`, `train_jsonl_path`, checkpoint path 같은
내부 경로를 직접 노출하지 않습니다. 경로는 백엔드 metadata와 path 입력 모드에만
남기고, 카드에는 이름, 엔진, 샘플 수, 준비 상태처럼 사용자가 운영에 필요한
정보만 보여줍니다. 이렇게 해야 생성 갤러리와 자산 라이브러리가 파일 탐색기가
아니라 서비스 화면처럼 동작합니다.

## 생성 갤러리 분류

생성 갤러리는 운영자가 결과를 빠르게 찾을 수 있도록 결과를 분류합니다.

- `음성`: 일반 TTS, voice design, 모델 선택 생성
- `Qwen 프리셋 음성`: Qwen preset, clone prompt + instruct, hybrid 결과
- `S2-Pro 프리셋 음성`: S2-Pro 저장 목소리 또는 reference id를 사용한 결과
- `사운드 이펙트`: MMAudio 또는 procedural sound effect 결과
- `ACE-Step 음악`: text-to-music, cover, extend 등 음악 생성 결과
- `RVC 변환`: Applio/RVC voice conversion 결과
- `정제/분리`: denoise, audio separation, format convert 결과

프리셋 계열 결과는 가능한 경우 카드 보조 문구에 실제 프리셋 이름을 함께
보여줍니다. Qwen은 `preset_id`, clone prompt path, 참조 음성 경로를 기준으로
저장 프리셋을 찾고, S2-Pro는 `reference_id`, `s2_pro_reference_id`, 참조 음성
경로를 기준으로 저장 목소리를 찾습니다.

분류 버튼을 누르면 해당 결과만 보이고, `모두 선택`도 현재 분류에 보이는 항목만
선택합니다. 삭제 후에는 목록을 새로 읽어 지운 파일이 화면에 남지 않도록 합니다.
