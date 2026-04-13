# Speech Quality Validation Report

- created_at: `20260413-040750`
- runtime_mode: `real`
- attention_implementation: `flash_attention_2`
- reference_audio: `data/datasets/mai_ko_full/audio/00000.wav`
- reference_text: `그래서 말인데, 올해는 유괴도 인단도 함께 즐길 수 있게 미카 집재를 제대로 열어보려고.`
- probe_text: `오늘은 정말 힘들었어. 언제쯤 끝날까?`
- prompt_set: `aggressive`
- transcript_similarity_threshold: `0.6`

## hybrid

- samples: `3`
- transcript_similarity: min `1.000`, mean `1.000`, max `1.000`
- duration_sec: min `4.16`, mean `4.29`, max `4.40`

| variant | prompt | similarity | duration | content_ok | transcript | audio |
| --- | --- | ---: | ---: | --- | --- | --- |
| furious | furious | 1.000 | 4.40 | true | 오늘은 정말 힘들었어 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630/hybrid/furious/audio_3d19fa23c348.wav` |
| shaken | shaken | 1.000 | 4.32 | true | 오늘은 정말 힘들었어 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630/hybrid/shaken/audio_0edfab305f5b.wav` |
| cold | cold | 1.000 | 4.16 | true | 오늘은 정말 힘들었어 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630/hybrid/cold/audio_06c70ca955e4.wav` |

## Notes

- `content_ok` is only a loose intelligibility check; style differences still need listening.
- `base` validates clone prompt reuse and Base FT output side by side.
- `customvoice` validates instruct-following drift across neutral/angry/gentle/breathy prompts.
- `hybrid` validates clone-prompt-plus-instruct behavior with a reusable reference style.

## Raw Artifact Locations

- run_dir: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630`
- report_json: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630/report.json`
- report_md: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-040630/report.md`
