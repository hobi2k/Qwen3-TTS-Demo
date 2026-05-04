# Qwen Extensions

This directory contains the demo-maintained Qwen scripts that are not part of
the stock `Qwen3-TTS` upstream repository.

The current rule is:

- Run backend-managed custom Qwen work from this directory by default.
- Keep upstream model, tokenizer, dataset, and runtime imports pointed at
  `vendor/Qwen3-TTS` so the extension scripts do not duplicate upstream code.
- Treat any custom files under `vendor/Qwen3-TTS` as a separate mirror/export
  target, not as this backend's runtime fallback.
- Override the extension root with `QWEN_EXTENSIONS=/path/to/qwen_extensions`
  when testing another copy.

## Layout

| Area | Purpose |
| --- | --- |
| `finetuning/` | CustomVoice speaker addition, VoiceBox bootstrap, and VoiceBox retraining. |
| `fusion/` | CustomVoice plus Base speaker-encoder fusion and VoiceBox Hub upload helper. |
| `inference/hybrid_clone_instruct.py` | Base clone-prompt plus CustomVoice instruction path. |
| `inference/voicebox/` | Self-contained VoiceBox inference, clone, and clone-plus-instruct paths. |
| `voicebox_morph/` | Persistent VoiceBox speaker-row morphing, e.g. language auto anchor -> `kangsora`. |

## Clone Prompt Plus Instruct

The hybrid clone-prompt plus instruct path keeps the Base clone prompt's
`ref_code`/`ref_text`, but anchors speaker conditioning to an in-distribution
CustomVoice speaker token by default. With `--speaker-anchor auto`, the script
resolves a language-native anchor from the checkpoint's actual speaker map
(Korean -> Sohee when present, Japanese -> Ono_Anna, English -> Aiden/Ryan,
Chinese -> Vivian/Serena).

It is a standalone CLI and does not require the web UI:

```bash
python qwen_extensions/inference/hybrid_clone_instruct.py \
  --base-model-path data/models/Qwen3-TTS-12Hz-1.7B-Base \
  --custom-model-path data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --voice-clone-prompt-path data/clone-prompts/kangsora.pt \
  --speaker-anchor auto \
  --language Korean \
  --text "오늘은 정말 힘들었어. 언제쯤 끝날까?" \
  --instruct "Breathy, emotionally unstable, and clear Korean diction." \
  --generation-options '{"max_new_tokens": 1024, "temperature": 0.8}' \
  --output-path data/generated/hybrid-kangsora.wav
```

`--customvoice-speaker` is an alias for `--speaker-anchor`; use it when the
target text should be conditioned through a specific CustomVoice speaker token.
Use `auto` for the language resolver, or an explicit speaker name when you want
to force a particular anchor.

This is intentional: CustomVoice instruction following is most stable in the
speaker-token conditioning path it was trained with, while `ref_code` carries
the cloned acoustic/style context. Use `--speaker-anchor none` only for
regression comparison against the raw Base speaker embedding behavior.

The matching backend implementation lives in `app/backend/app/qwen.py`. Keep
that runtime and this extension script in sync whenever this rule changes.

VoiceBox clone/clone-plus-instruct uses the same naming convention:
`speaker_anchor_with_ref_code` is the default strategy, and legacy
`borrowed_stock_embed_with_ref_code` remains only for comparison.

## VoiceBox Speaker Morph

`voicebox_morph/create_morphed_speaker.py` is the permanent-speaker path. It
copies a VoiceBox checkpoint, copies a language-selected anchor speaker row, then
blends in reference timbre from a clone prompt or reference audio and writes the
result as a new speaker name. This is not the same as runtime clone-prompt
generation.

It is also a standalone CLI:

```bash
python qwen_extensions/voicebox_morph/create_morphed_speaker.py \
  --model-path data/finetune-runs/mai_ko_voicebox17b_full_extra1/final \
  --output-model-path data/finetune-runs/kangsora_voicebox_morph/final \
  --language Korean \
  --anchor-speaker auto \
  --target-speaker kangsora \
  --voice-clone-prompt-path data/clone-prompts/kangsora.pt \
  --timbre-strength 0.72 \
  --preserve-norm
```

Use `morphed_speaker_with_ref_code` during generation when the new speaker row
should still be combined with the stored clone prompt's `ref_code`.

The backend resolves custom script paths through `QWEN_EXTENSIONS`, defaulting to
this directory. Missing extension scripts fail fast instead of falling back to a
vendored copy.
