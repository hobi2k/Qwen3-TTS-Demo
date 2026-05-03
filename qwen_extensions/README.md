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

The backend resolves custom script paths through `QWEN_EXTENSIONS`, defaulting to
this directory. Missing extension scripts fail fast instead of falling back to a
vendored copy.
