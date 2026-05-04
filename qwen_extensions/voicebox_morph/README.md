# VoiceBox Speaker Morph

`voicebox_morph` creates a persistent speaker inside a VoiceBox checkpoint. It
updates the selected checkpoint in place by default; copying to a new checkpoint
is an explicit option. It is not the same as clone-prompt inference.

- Clone-prompt VoiceBox combines `ref_code` and a speaker embedding at runtime.
- Speaker morph copies a language-native anchor speaker selected by `--language`
  and `--anchor-speaker auto`, then
  writes a new speaker row, such as `kangsora`, into `model.safetensors`.
- The resulting checkpoint can be selected later by speaker name.

Typical Korean flow:

```bash
python qwen_extensions/voicebox_morph/create_morphed_speaker.py \
  --model-path data/finetune-runs/voicebox/final \
  --update-in-place \
  --language Korean \
  --anchor-speaker auto \
  --target-speaker kangsora \
  --voice-clone-prompt-path data/presets/kangsora/clone_prompt.pt \
  --timbre-strength 0.72 \
  --preserve-norm
```

The script writes:

- `config.json` with the new speaker name and `voicebox_morph` metadata
- `model.safetensors` with the new speaker embedding row
- `speaker_morph.pt` for inspection or reuse
- `voicebox_morph.json` with cosine diagnostics

To create a separate model copy instead, omit `--update-in-place` and pass
`--output-model-path data/finetune-runs/kangsora_voicebox/final`.
