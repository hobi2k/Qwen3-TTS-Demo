# Speech Quality Validation Report

- created_at: `20260413-035937`
- runtime_mode: `real`
- attention_implementation: `flash_attention_2`
- reference_audio: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/datasets/mai_ko_full/audio/00000.wav`
- reference_text: `그래서 말인데, 올해는 유괴도 인단도 함께 즐길 수 있게 미카 집재를 제대로 열어보려고.`
- probe_text: `오늘은 정말 힘들었어. 언제쯤 끝날까?`
- prompt_set: `aggressive`
- transcript_similarity_threshold: `0.6`

## customvoice

- samples: `6`
- transcript_similarity: min `1.000`, mean `1.000`, max `1.000`
- duration_sec: min `3.12`, mean `3.67`, max `4.24`

| variant | prompt | similarity | duration | content_ok | transcript | audio |
| --- | --- | ---: | ---: | --- | --- | --- |
| stock-furious | furious | 1.000 | 3.36 | true | 오늘은 정말 힘들었어. 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/stock-furious/audio_998f3b2b78f3.wav` |
| stock-shaken | shaken | 1.000 | 3.44 | true | 오늘은 정말 힘들었어. 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/stock-shaken/audio_4520108ceb3a.wav` |
| stock-cold | cold | 1.000 | 4.16 | true | 오늘은 정말 힘들었어. 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/stock-cold/audio_688357c20279.wav` |
| ft-furious | furious | 1.000 | 3.12 | true | 오늘은 정말 힘들었어, 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/ft-furious/audio_2d49f7b0e4e7.wav` |
| ft-shaken | shaken | 1.000 | 3.68 | true | 오늘은 정말 힘들었어. 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/ft-shaken/audio_7d5814d10d9d.wav` |
| ft-cold | cold | 1.000 | 4.24 | true | 오늘은 정말 힘들었어, 언제쯤 끝날까? | `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/customvoice/ft-cold/audio_59c1382fa111.wav` |

## Notes

- `content_ok` is only a loose intelligibility check; style differences still need listening.
- `base` validates clone prompt reuse and Base FT output side by side.
- `customvoice` validates instruct-following drift across neutral/angry/gentle/breathy prompts.
- `hybrid` validates clone-prompt-plus-instruct behavior with a reusable reference style.

## Raw Artifact Locations

- run_dir: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743`
- report_json: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/report.json`
- report_md: `/home/hosung/pytorch-demo/Qwen3-TTS-Demo/data/generated/quality-validation/20260413-035743/report.md`
