# Inference CLI Extensions

This mirror keeps the same standalone CLI entrypoints as `qwen_extensions`.

## Hybrid Clone Prompt + CustomVoice Instruct

Run without the web UI:

```bash
python inference/hybrid_clone_instruct.py \
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

`--customvoice-speaker` is an alias for `--speaker-anchor`. Use `auto` to choose
a language-native speaker from the checkpoint speaker map, or pass a specific
speaker token to force that anchor.

## VoiceBox Clone

`inference/voicebox/clone_low_level.py` supports:

- `embedded_encoder_with_ref_code` (default for preset timbre preservation)
- `speaker_anchor_with_ref_code`
- `morphed_speaker_with_ref_code`
- comparison strategies such as `embedded_encoder_only`
