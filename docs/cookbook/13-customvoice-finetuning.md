# CustomVoice 파인튜닝 가이드

이 문서는 이 프로젝트에서 `CustomVoice`를 어떻게 파인튜닝하는지 설명합니다.

목표는 아래 질문에 답하는 것입니다.

- `CustomVoice` 파인튜닝은 무엇을 위한 것인가?
- `Base` 파인튜닝과 무엇이 다른가?
- 데이터셋은 어떻게 준비해야 하는가?
- 어떤 입력이 필요하고, 어떤 결과물이 남는가?
- instruct 준수는 자동으로 유지되는가?

## 1. 먼저 결론

`CustomVoice` 파인튜닝의 목표는 단순히 학습이 “돌아가게 하는 것”이 아닙니다.

이 프로젝트에서 `CustomVoice` 파인튜닝은 아래 두 가지를 함께 노립니다.

- 데이터셋 화자의 음색을 반영하기
- `CustomVoice`가 원래 가지고 있던 말투 지시 능력을 가능한 한 유지하기

즉 `Base` 파인튜닝과 달리, `CustomVoice` 파인튜닝은 음색만이 아니라 `instruct`도 함께 중요합니다.

## 2. 왜 Base와 CustomVoice를 따로 파인튜닝하는가

두 모델은 역할이 다릅니다.

### Base 파인튜닝

`Base`는 참조 음성을 바탕으로 스타일을 읽고 복제하는 쪽에 가깝습니다.

그래서 `Base` 파인튜닝은 보통 아래 질문에 답하려고 씁니다.

- 이 데이터셋의 음색이 더 잘 붙는가?
- clone 계열 품질이 좋아지는가?

하지만 `Base`는 원래부터 `CustomVoice`처럼 `instruct` 중심 모델이 아닙니다.

즉 `Base`를 파인튜닝했다고 해서, 감정 지시나 말투 지시가 자동으로 좋아진다고 보면 안 됩니다.

### CustomVoice 파인튜닝

`CustomVoice`는 대사 생성과 `instruct` 제어가 핵심입니다.

그래서 `CustomVoice` 파인튜닝은 보통 아래 질문에 답하려고 씁니다.

- 내 데이터셋 화자의 음색으로 바뀌는가?
- 그래도 여전히 `instruct`를 따르는가?

## 3. 이 프로젝트의 CustomVoice 파인튜닝 흐름

웹 UI와 백엔드는 아래 순서로 연결됩니다.

1. `데이터셋 만들기` 탭에서 학습용 오디오와 텍스트를 정리
2. 저장과 동시에 `prepared.jsonl`까지 생성
3. `학습 실행` 탭에서 `CustomVoice Fine-Tune` 선택
4. 초기 `CustomVoice` 모델 경로 선택
5. 필요하면 `speaker encoder` 기준 모델도 함께 지정
6. 실행 완료 후 마지막 체크포인트만 모델 선택지에 노출

즉 사용자는:

- 데이터셋 생성
- 학습 실행

두 단계만 신경 쓰면 되고, 중간 전처리 파일은 내부적으로 관리됩니다.

현재 MAI 한국어 실험에서는 UI에서 만든 원본 데이터셋을 그대로 쓰지 않고,
학습 전에 clean prepared JSONL을 만들었습니다.

```text
data/datasets/mai_ko_full/prepared_train_clean_text_2s_to_30s.jsonl
```

이 파일은 특수 문자열, placeholder, 길이 조건에 맞지 않는 샘플을 제외한 `727`개 샘플로 구성됩니다.

## 4. 데이터셋은 어떻게 준비해야 하는가

### 4.1 최소 구성

학습용 데이터셋에는 결국 아래 정보가 필요합니다.

- 기준 음성 `ref_audio`
- 각 샘플 음성 `audio`
- 각 샘플 텍스트 `text`

즉 음성만으로는 학습이 끝나지 않습니다.

텍스트가 비어 있으면, 프로젝트는 Whisper로 자동 전사를 시도합니다.

### 4.2 권장 샘플 수

실무적으로는 아래 정도를 권장합니다.

- 최소 실험선: 20개 이상
- 권장선: 50개 이상
- 더 안정적인 결과: 100개 이상

중요한 것은 개수뿐 아니라:

- 같은 화자인지
- 녹음 품질이 일정한지
- 문장 길이와 억양이 다양한지

입니다.

## 5. 데이터셋 폴더는 어디에 어떻게 저장되는가

이 프로젝트는 데이터셋을 아래 구조로 정리합니다.

```text
data/datasets/<dataset_id>/
  audio/
  raw.jsonl
  prepared.jsonl
  manifest.json
  dataset.json
```

이 구조를 유지하는 이유는 단순합니다.

- 데이터셋 관련 파일이 한 폴더에 모여 있어야 관리가 쉽기 때문입니다.
- 나중에 학습을 다시 하거나 검수할 때도 경로가 덜 꼬입니다.

## 6. `prepared.jsonl`은 무엇인가

사용자 입장에서는 그냥 “학습 가능한 상태”라고 이해하면 됩니다.

내부적으로는 토크나이저와 prepare 단계가 지나면서:

- 오디오 경로가 정리되고
- 학습에 필요한 코드 정보가 붙고
- 학습 스크립트가 읽기 쉬운 형태로 바뀝니다.

웹 UI에서는 이 단계를 따로 노출하지 않으려고, 데이터셋 저장 시 학습 가능한 상태까지 함께 준비합니다.

## 7. CustomVoice 파인튜닝 실행 시 필요한 값

학습 실행 탭에서 중요한 입력은 아래 네 가지입니다.

- 학습할 데이터셋
- 초기 `CustomVoice` 모델
- 화자 이름
- 학습 설정

보통 기본값으로 시작해도 되는 항목:

- batch size
- epoch
- learning rate

다만 실제 품질이 중요하면 이 값들은 품질 검수 결과를 보고 다시 조정해야 합니다.

## 8. 결과물은 무엇이 남는가

실행이 끝나면 `data/finetune-runs/<run-id>/` 아래에 학습 결과가 남습니다.

이 프로젝트는 여러 epoch를 UI에 다 노출하지 않고, 각 run의 마지막 체크포인트만 선택지로 씁니다.

이렇게 하는 이유는:

- 사용자가 `checkpoint-epoch-0`, `checkpoint-epoch-1`, `checkpoint-epoch-2`를 일일이 고르는 것은 혼란스럽기 때문입니다.
- 보통 실제 사용자는 “이 run의 최종 결과”만 고르면 충분하기 때문입니다.

현재 검증된 plain CustomVoice 결과:

```text
data/finetune-runs/mai_ko_customvoice17b_full/final
```

메타데이터:

- `tts_model_type = custom_voice`
- `mai` speaker id: `3067`
- `speaker_encoder.*` 없음

이 결과는 이어서 `VoiceBox` 변환의 입력으로 사용했습니다.

## 9. instruct 준수는 자동으로 유지되는가

아닙니다. 이건 가장 중요한 주의사항입니다.

`CustomVoice`를 파인튜닝한다고 해서 instruct 준수 능력이 자동으로 보장되지는 않습니다.

왜냐하면 학습 데이터셋은 보통 아래 정보만 갖기 때문입니다.

- 오디오
- 텍스트
- 기준 음성

즉 `angry`, `breathy`, `cold`, `gentle` 같은 명시적 instruct supervision이 없습니다.

따라서 학습 후에는 반드시 품질 검수를 해야 합니다.

## 10. 그럼 무엇을 검수해야 하는가

이 프로젝트에서는 두 가지를 같이 봐야 합니다.

### 10.1 데이터셋 음색 반영

질문:

- 학습된 결과가 정말 데이터셋 화자처럼 들리는가?

### 10.2 instruct 준수

질문:

- 같은 문장에 다른 말투 지시를 넣었을 때 실제로 느낌이 바뀌는가?
- 그리고 문장 내용은 무너지지 않는가?

즉 `CustomVoice` 파인튜닝의 합격 기준은:

- 음색만 좋아지는 것
- instruct만 남는 것

둘 중 하나가 아니라, 둘 다 어느 정도 유지되는 것입니다.

## 11. 현재 프로젝트에서의 해석 기준

현재 프로젝트에서는 `CustomVoice` 파인튜닝 결과를 아래 기준으로 봅니다.

- dataset 음색 반영이 stock보다 좋아졌는가
- instruct를 바꿔도 텍스트는 유지되는가
- `breathy`, `furious`, `cold` 같은 지시 차이가 실제로 들리는가

즉 “학습이 끝났다”는 것과 “쓸 만한 품질이다”는 전혀 다른 이야기입니다.

## 12. speaker encoder 관련 주의사항

이 프로젝트에서는 `CustomVoice` 파인튜닝 경로를 다루면서 `speaker encoder`도 별도로 신경 씁니다.

핵심은 이겁니다.

- `CustomVoice` 파인튜닝은 음색 적응과 연결되기 때문에
- 학습 과정에서 화자 정보를 다루는 경로를 분명히 이해해야 합니다.

현재 기준으로는 아래처럼 구분합니다.

- plain `CustomVoice` FT:
  - 학습 중 `Base 1.7B` speaker encoder를 보조로 사용
  - 결과 체크포인트에는 `speaker_encoder.*`를 넣지 않음
- `VoiceBox`:
  - plain `CustomVoice` 결과에 `Base 1.7B` speaker encoder를 합친 self-contained 체크포인트
  - 이후 추가 파인튜닝도 그 체크포인트 하나로 가능

즉 “CustomVoice 자체를 항상 self-contained로 저장한다”가 아니라,
현재는 `VoiceBox`라는 별도 모델 패밀리로 분리해 관리합니다.

## 12.1 Optimizer와 안정성

1.7B full fine-tuning에서는 optimizer state가 GPU 메모리 사용량에 큰 영향을 줍니다.

현재 학습 스크립트는 아래 환경 변수를 지원합니다.

```bash
QWEN_DEMO_OPTIMIZER=adamw
QWEN_DEMO_OPTIMIZER=adafactor
QWEN_DEMO_GRAD_ACCUM_STEPS=1
QWEN_DEMO_LOG_EVERY=25
```

현재 MAI full run에서 실제로 안정적으로 사용한 조합:

```bash
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
QWEN_DEMO_OPTIMIZER=adafactor
```

`Adafactor`는 품질을 올리기 위한 선택이 아니라,
RTX 5080 16GB 환경에서 optimizer state 메모리를 줄여 학습을 끝까지 완료하기 위한 선택입니다.

## 13. 웹 UI에서는 어떻게 보이는가

웹 UI에서는 `나의 목소리들`에서 학습된 목소리를 볼 수 있고,
`텍스트 음성 변환`에서 실제로 그 모델을 다시 선택해 써볼 수 있습니다.

중요한 점은:

- 최종 모델만 보이게 할 것
- 내부 경로를 그대로 보여주지 말 것
- 사용자가 “학습용 준비”, “마지막 체크포인트”, “selectable path” 같은 내부 용어를 몰라도 되게 할 것

입니다.

## 14. 추천 사용 순서

처음 시작하는 사람에게는 아래 순서를 권합니다.

1. 데이터셋 만들기
2. 데이터셋 저장
3. 학습 실행 탭으로 이동
4. `CustomVoice Fine-Tune` 선택
5. 학습 완료 후 `텍스트 음성 변환`에서 결과 확인
6. 같은 문장에 여러 `instruct`를 넣어 비교

## 15. 같이 읽으면 좋은 문서

- [11-pristine-upstream-finetune.md](./11-pristine-upstream-finetune.md)
- [09-quality-validation-workflow.md](./09-quality-validation-workflow.md)
- [12-preset-plus-instruct.md](./12-preset-plus-instruct.md)
- [18-current-experiment-results.md](./18-current-experiment-results.md)
- [../voicebox/02-finetuning.md](../voicebox/02-finetuning.md)
