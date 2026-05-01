# Training Pipeline Changes

이 문서는 `Qwen3-TTS-Demo`에서 **학습 파이프라인이 처음 상태에서 어떻게 확장되었는지**를 처음 읽는 사람 기준으로 자세히 설명합니다.

이 문서의 목적은 세 가지입니다.

- 원래 업스트림 `Qwen3-TTS`가 제공하던 학습 흐름이 무엇이었는지 이해하기
- 이 데모에서 어떤 기능을 추가했고 왜 그렇게 했는지 이해하기
- WEB UI, 백엔드 API, 업스트림 스크립트가 어떻게 연결되는지 한 번에 파악하기

## 먼저 알아야 할 큰 그림

이 프로젝트의 학습 파이프라인은 아래 세 층으로 나뉩니다.

1. 데이터셋 준비
2. `audio_codes` 전처리
3. 실제 SFT 학습 실행

업스트림 `Qwen3-TTS`는 기본적으로 `Base` 모델 단일 화자 학습 경로를 제공합니다.  
이 데모는 거기서 멈추지 않고, 아래 두 경로를 모두 다룰 수 있게 확장했습니다.

- `Base Fine-Tune`
- `CustomVoice Fine-Tune`

즉 지금은 "데이터셋만 만든다" 수준이 아니라, **사용자가 데이터셋을 만들고, 준비된 데이터셋으로 학습을 실행하고, 결과 모델을 다시 추론에 연결하는 구조**까지 포함합니다.

## 원래 업스트림에 있던 학습 흐름

업스트림 기준 출발점은 [vendor/Qwen3-TTS/finetuning/README.md](../../vendor/Qwen3-TTS/finetuning/README.md)와 `prepare_data.py`, `sft_12hz.py`입니다.

원래 기본 흐름은 이렇습니다.

1. `train_raw.jsonl` 준비
2. `prepare_data.py`로 `audio_codes` 생성
3. `sft_12hz.py`로 `Base` 모델을 단일 화자 SFT
4. 생성된 체크포인트를 `generate_custom_voice(...)`로 시험 추론

여기서 중요한 점은, 업스트림은 "학습 시작 모델"로 `Base`를 전제하고 있고, WEB UI나 백엔드 API까지 포함한 제품형 워크플로우는 제공하지 않는다는 점입니다.

## 이 데모에서 학습 파이프라인에 추가된 것

학습 파이프라인에는 크게 다섯 가지가 추가되었습니다.

1. 데이터셋 생성 API와 WEB UI
2. 학습 실행 이력 관리
3. `CustomVoice` 전용 별도 학습 엔트리
4. `speaker_encoder_model_path`를 이용한 보조 encoder 주입
5. 학습 결과 체크포인트를 추론 모델 목록으로 다시 노출하는 연결

아래에서 하나씩 풀어서 설명합니다.

## 1. 데이터셋 생성 단계가 제품 안으로 들어왔습니다

원래 업스트림은 사용자가 직접 JSONL을 만들어야 했습니다.  
지금 데모는 그 단계를 백엔드와 프런트엔드 안으로 가져왔습니다.

관련 위치:

- 백엔드 가이드: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 가이드: [03-frontend-guide.md](./03-frontend-guide.md)
- examples 연결 문서: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)

현재 데이터셋 생성 단계에서 다루는 핵심 필드는 아래와 같습니다.

- `audio`
- `text`
- `ref_audio`

이 구조는 업스트림 `train_raw.jsonl` 형식과 맞춰져 있습니다.  
즉 데모의 `데이터셋 만들기` 화면은 단순한 내부 포맷이 아니라, **업스트림 `prepare_data.py`가 바로 읽을 수 있는 학습 입력을 만들어 주는 도구**입니다.

### 왜 이 단계가 중요했는가

처음 보는 사람은 보통 "파인튜닝"을 누르면 바로 학습이 시작될 거라고 생각하기 쉽습니다. 하지만 실제로는 아래 두 단계가 먼저 필요합니다.

- 학습에 쓸 샘플 모으기
- 샘플을 업스트림이 요구하는 JSONL 형식으로 정리하기

이 데모는 그 과정을 WEB UI 안에서 보이게 만들어, 사용자가 파일 구조를 직접 손으로 맞추지 않아도 되게 했습니다.

현재 사용자용 정보 구조는 아래처럼 분리하는 것이 기준입니다.

- `데이터셋 만들기`
  샘플 수집, 전사 정리, JSONL 생성
- `학습 실행`
  준비된 데이터셋 선택, 학습 설정 확인, 학습 실행

## 2. 전처리 단계가 실행 가능한 워크플로우로 연결되었습니다

학습용 raw JSONL을 만든 뒤에는 `audio_codes`를 추출해야 합니다.  
이 단계는 업스트림의 `prepare_data.py`가 담당합니다.

이 데모에서는 이 전처리 단계가 "문서에만 존재"하는 단계가 아니라, 실제 실행 흐름의 일부로 연결되어 있습니다.

핵심 개념:

- `raw JSONL`: 사람이 만들거나 UI가 구성한 원본 학습 샘플 목록
- `prepared JSONL`: tokenizer를 거쳐 `audio_codes`가 포함된 학습 입력

즉 내부적으로는 "데이터셋 생성"과 "prepare codes"가 분리되어 있지만, 사용자에게는 아래처럼 설명하는 편이 더 이해하기 쉽습니다.

- `데이터셋 만들기`
  학습용 샘플을 정리하는 단계
- `학습 시작 준비`
  모델이 실제로 읽을 수 있는 형태로 전처리하는 단계

### 초심자가 자주 헷갈리는 지점

- 데이터셋 생성은 "학습 샘플 목록 정리"
- `prepare_data.py`는 "모델이 학습할 수 있는 토큰화된 음성 코드 만들기"

이 차이를 문서와 UI 모두에서 분리해서 보여주는 것이 이 데모의 중요한 변경점입니다.

## 3. Qwen 학습 엔진은 `qwen_extensions` 기준으로 분리되었습니다

파일:

- [sft_base_12hz.py](../../qwen_extensions/finetuning/sft_base_12hz.py)
- [sft_custom_voice_12hz.py](../../qwen_extensions/finetuning/sft_custom_voice_12hz.py)
- [sft_voicebox_12hz.py](../../qwen_extensions/finetuning/sft_voicebox_12hz.py)
- [voicebox_training_common.py](../../qwen_extensions/finetuning/voicebox_training_common.py)

업스트림 [sft_12hz.py](../../vendor/Qwen3-TTS/finetuning/sft_12hz.py)는 원본 비교와 호환을 위해 남겨 둡니다. 하지만 현재 백엔드 실행 기준은 `qwen_extensions/finetuning`입니다. 이렇게 해야 업스트림 코드를 직접 덮어쓰지 않으면서도 `accelerate`, optimizer, VoiceBox speaker encoder 같은 데모 전용 요구사항을 한곳에서 관리할 수 있습니다.

공통 학습 엔진에서 관리하는 핵심 요소:

- `run_customvoice_training(...)`
- `finalize_checkpoint_layout(...)`
- `export_customvoice_checkpoint(...)`
- `resolve_speaker_encoder_source(...)`
- `load_speaker_encoder(...)`
- `resolve_output_speaker_id(...)`
- `Accelerator(..., project_dir=...)`
- `QWEN_DEMO_OPTIMIZER`
- `QWEN_DEMO_TRAIN_PRECISION`
- `QWEN_DEMO_GRAD_ACCUM_STEPS`
- `QWEN_DEMO_LOG_EVERY`

### 이 변경이 왜 필요했는가

`CustomVoice` 전용 학습 엔트리를 새로 만들려면, 기존 학습 로직을 통째로 복사하는 대신 공통 부분을 재사용하는 편이 훨씬 안전합니다.

그래서 현재 구조는 이렇게 바뀌었습니다.

- `sft_base_12hz.py`
  - `Base` speaker SFT 전용 진입점
- `sft_custom_voice_12hz.py`
  - `CustomVoice` 전용 진입점
- `sft_voicebox_12hz.py`
  - speaker encoder가 내장된 `VoiceBox` 재학습 진입점
- `voicebox_training_common.py`
  - 세 진입점이 함께 쓰는 실제 학습 구현

즉 같은 기능을 두 파일에 복붙한 구조가 아니라, **기본 경로와 확장 경로를 분리하면서도 유지보수 가능한 구조**로 바꾼 것입니다.

## 4. `CustomVoice Fine-Tune` 전용 스크립트가 추가되었습니다

파일: [sft_custom_voice_12hz.py](../../qwen_extensions/finetuning/sft_custom_voice_12hz.py)

이 파일은 이번 변경에서 가장 중요한 학습 파이프라인 확장 중 하나입니다.

### 왜 별도 파일이 필요한가

사용자 요구는 단순했습니다.

- 기존 업스트림 `Base` 학습 스크립트는 그대로 보존할 것
- `CustomVoice` 쪽 실험은 별도 스크립트로 분리할 것

이 요구를 반영해, 현재는 아래처럼 경로가 분리되어 있습니다.

- `Base Fine-Tune`: `sft_base_12hz.py`
- `CustomVoice Fine-Tune`: `sft_custom_voice_12hz.py`

### 이 스크립트가 해결하려는 문제

`CustomVoice` 체크포인트는 `Base`와 구조가 완전히 같지 않습니다.  
특히 현재 번들된 `CustomVoice` 체크포인트는 학습 시 새 화자를 붙이는 데 필요한 `speaker_encoder`를 직접 제공하지 않습니다.

그래서 `CustomVoice Fine-Tune`에서는 추가 입력이 필요합니다.

- `init_model_path`
- `speaker_encoder_model_path`
- `speaker_name`

여기서 `speaker_encoder_model_path`는 보통 `Base` 체크포인트를 가리킵니다.

즉 현재 `CustomVoice Fine-Tune` 경로는 아래 방식으로 동작합니다.

1. `CustomVoice` 체크포인트를 시작 모델로 사용
2. 새 화자 추가에 필요한 `speaker_encoder`는 `Base` 체크포인트에서 보조로 가져옴
3. 결과를 `custom_voice` 타입 체크포인트처럼 저장

이 구조 덕분에 "기존 `CustomVoice` 계열 추론 방식과 더 자연스럽게 이어지는 학습 경로"를 실험할 수 있게 되었습니다.

### 아직 남아 있는 후속 작업과 현재 VoiceBox 해결 경로

plain `CustomVoice` 결과 체크포인트는 여전히 self-contained라고 보기는 어렵습니다.

그래서 현재 프로젝트는 별도 `VoiceBox` 경로를 추가했습니다.

- 1단계: plain `CustomVoice`에 새 화자 추가
- 2단계: `Base 1.7B`의 `speaker_encoder`를 합쳐 `VoiceBox`로 변환
- 3단계: `VoiceBox -> VoiceBox` 추가 학습

이 경로는 [../voicebox/02-finetuning.md](../voicebox/02-finetuning.md)에 별도로 정리되어 있습니다.

## 5. 학습 모드 선택 개념이 추가되었습니다

이전에는 사실상 "학습 = Base FT"에 가까웠습니다.  
지금은 학습 실행을 만들 때 아래 개념을 명시적으로 고릅니다.

- `training_mode = base`
- `training_mode = custom_voice`

이 개념은 단순 UI 드롭다운이 아니라, 실제 백엔드 실행 경로를 바꿉니다.

관련 위치:

- 백엔드: [main.py](../../app/backend/app/main.py)
- 스키마: [schemas.py](../../app/backend/app/schemas.py)
- 프런트엔드: [App.tsx](../../app/frontend/src/App.tsx)

백엔드에서는 `training_mode`를 보고 어떤 스크립트를 실행할지 결정합니다.

- `base`면 `sft_base_12hz.py`
- `custom_voice`면 `sft_custom_voice_12hz.py`
- `voicebox`면 `sft_voicebox_12hz.py`

실행 interpreter는 기본적으로 백엔드와 같은 Python입니다. 예전처럼 bare `python3`를 호출하면 시스템 Python이 잡혀 `torch`, `qwen-tts`, `flash_attn`, editable package가 빠질 수 있으므로, 백엔드는 `QWEN_DEMO_PYTHON`이 명시된 경우만 그 값을 사용하고 보통은 `sys.executable`을 씁니다.

즉 현재 `학습 실행`은 단순 입력 폼이 아니라, **Qwen 확장 폴더의 서로 다른 학습 진입점을 선택하는 런처 역할**을 합니다.

## 6. 실행 기록에 "어떻게 학습했는지"가 남도록 바뀌었습니다

학습 파이프라인은 결과 체크포인트만 남아서는 나중에 다시 해석하기 어렵습니다.  
그래서 실행 기록에는 아래 정보가 같이 남습니다.

- `training_mode`
- `init_model_path`
- `speaker_encoder_model_path`
- `output_model_path`

이 변경은 초심자에게도 중요합니다.  
왜냐하면 "이 체크포인트가 Base에서 나왔는지, CustomVoice 경로에서 나왔는지"를 결과 폴더 이름만 보고는 놓치기 쉽기 때문입니다.

즉 실행 기록은 로그 이상의 역할을 합니다.

- 재현성 확보
- 추론 연결 시 모델 성격 판별
- 나중에 품질 비교 실험 정리

## 7. WEB UI `학습 실행`이 실제 학습 제어판으로 확장되었습니다

현재 `학습 실행`에서 사용자는 아래 항목을 직접 선택할 수 있습니다.

- 학습 모드
- 초기 모델
- tokenizer 모델
- speaker 이름
- `speaker_encoder_model_path` 여부
- 배치 크기, epoch, learning rate 등 학습 하이퍼파라미터

이 UI는 단순히 "값을 보내는 입력창"이 아닙니다.  
학습 모드에 따라 보여주는 필드가 달라집니다.

예를 들어:

- `Base Fine-Tune`일 때는 Base 계열 init model을 중심으로 보여줌
- `CustomVoice Fine-Tune`일 때는 `speaker_encoder_model_path`를 추가로 보여줌

또한 어떤 스크립트가 실제로 실행될지도 읽기 전용으로 드러납니다.

- `sft_base_12hz.py`
- `sft_custom_voice_12hz.py`
- `sft_voicebox_12hz.py`

이 덕분에 초심자도 "지금 내가 어떤 파이프라인을 타고 있는지"를 화면에서 확인할 수 있습니다.

## 8. 샘플 수와 학습 기대치를 함께 안내해야 합니다

학습 문서는 실행 방법만 적어서는 부족합니다. 아래 기대치도 같이 안내해야 사용자가 결과를 과하게 기대하지 않습니다.

- `1~5개 샘플`
  파이프라인 점검용
- `10개 안팎`
  아주 작은 실험용
- `20~50개`
  최소한의 화자 적응을 기대할 수 있는 구간
- `50개 이상`
  음색 반영과 안정성이 더 나아질 가능성이 큼

모델별 기대치:

- `Base Fine-Tune`
  dataset 음색 적응 실험에는 의미가 있지만, instruct 준수까지 자동으로 좋아진다고 보면 안 됩니다.
- `CustomVoice Fine-Tune`
  dataset 음색 반영과 말투 지시 유지라는 두 목표를 함께 노리는 경로입니다. 다만 데이터 품질과 전사 정확도에 크게 영향을 받습니다.

현재 MAI 한국어 full run은 clean prepared dataset 기준 `727`개 샘플로 진행했습니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

이 데이터셋은 placeholder, 특수 문자, 길이 조건에 맞지 않는 샘플을 제외한 결과입니다.

## 9. 학습 결과가 추론으로 다시 연결되도록 바뀌었습니다

과거에는 "학습은 했는데, 그 결과를 웹에서 바로 써볼 수 없는" 끊긴 경험이 생기기 쉬웠습니다.  
지금은 로컬 fine-tuned 체크포인트가 모델 카탈로그에 스캔되고, 추론 페이지에서 선택할 수 있습니다.

이 변화는 단순 편의 기능이 아닙니다.  
학습 파이프라인이 **닫힌 실험실**이 아니라 **추론 파이프라인과 이어진 제품 흐름**이 되었다는 뜻입니다.

이 연결 덕분에 사용자는 이렇게 움직일 수 있습니다.

1. 데이터셋 생성
2. `prepare_data.py` 실행
3. `Base` 또는 `CustomVoice` 학습 실행
4. 생성된 체크포인트를 현재 생성 페이지의 모델 선택 영역에서 바로 선택
5. 실제 음성을 듣고 품질 비교

## 9. 학습 파이프라인 확장의 이유: instruct 보존 여부를 실험하기 위해서입니다

이번 학습 파이프라인 변경은 단순한 기능 추가가 아니었습니다.  
핵심 질문이 있었기 때문입니다.

- `Base`를 파인튜닝한 뒤에도 `CustomVoice`처럼 instruct를 잘 따를 수 있는가?
- 만약 그렇지 않다면, `CustomVoice` 자체를 학습하는 별도 길이 필요한가?

그래서 실제로 아래 실험들이 진행되었습니다.

- `Base` fine-tune subset4
- `Base` fine-tune subset16
- `Base` fine-tune subset64
- `CustomVoice` fine-tune subset4

관련 정리:

- examples 연결 문서: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
- 추론 파이프라인 상세: [07-inference-pipeline-changes.md](./07-inference-pipeline-changes.md)

### 현재까지 얻은 실무적 해석

- `Base FT`는 작게 보면 instruct가 남아 보일 수 있음
- 하지만 샘플이 늘어나면 전사 안정성이 흔들릴 수 있음
- 그래서 "Base FT만으로 instruct 유지가 보장된다"고 보긴 어려움
- 이 때문에 `CustomVoice Fine-Tune` 경로를 별도 스크립트로 추가할 필요가 생김

즉 학습 파이프라인 확장은 UI 편의성 때문만이 아니라, **모델 거동 자체를 검증하기 위한 실험 인프라 구축**이기도 합니다.

## 10. 처음 읽는 사람이 기억하면 좋은 핵심 구분

### `Base Fine-Tune`

- 업스트림의 공식 출발점에 가장 가까운 경로
- 단일 화자 적응 실험에 적합
- instruct 보존은 별도 검증이 필요

### `CustomVoice Fine-Tune`

- 이 데모에서 추가한 확장 경로
- `CustomVoice` 계열 추론과 더 직접적으로 연결하려는 시도
- 현재는 `Base`의 `speaker_encoder`를 보조로 사용

### `VoiceBox Fine-Tune`

- plain `CustomVoice` FT 결과에 `Base 1.7B` speaker encoder를 합친 self-contained 경로
- 결과 체크포인트 안에 `speaker_encoder.*`가 포함됨
- 외부 `speaker_encoder_model_path` 없이 `VoiceBox -> VoiceBox` 추가 학습 가능
- 현재 `mai` 화자 기준 1 epoch 추가 학습까지 완료

### Optimizer 운영

- 기본 optimizer는 `AdamW`
- 1.7B full fine-tuning에서 RTX 5080 16GB 메모리 피크가 문제가 될 때 `Adafactor` 사용
- 설정은 `QWEN_DEMO_OPTIMIZER=adafactor`
- `Adafactor`는 품질 보장 장치가 아니라 학습 완료 안정성을 위한 선택

### 데이터셋 생성

- 학습 샘플 목록을 만드는 단계
- 아직 모델이 학습 가능한 상태는 아님

### `prepare_data.py`

- `audio_codes`를 추출하는 전처리 단계
- 실제 학습 직전 준비 작업

### 학습 실행 기록

- 어떤 모드로 어떤 init model을 썼는지 남겨 재현성과 비교를 돕는 장치

## 관련 문서

- 설치 및 실행: [01-install-and-run.md](./01-install-and-run.md)
- 백엔드 구조: [02-backend-guide.md](./02-backend-guide.md)
- 프런트엔드 구조: [03-frontend-guide.md](./03-frontend-guide.md)
- 업스트림 개요: [04-qwen3-tts-overview.md](./04-qwen3-tts-overview.md)
- 현재 실험 결과: [18-current-experiment-results.md](./18-current-experiment-results.md)
- examples와 파인튜닝 연결: [05-finetuning-and-examples.md](./05-finetuning-and-examples.md)
- 추론 파이프라인 변경 상세: [07-inference-pipeline-changes.md](./07-inference-pipeline-changes.md)
