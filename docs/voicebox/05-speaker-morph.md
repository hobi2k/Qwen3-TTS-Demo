# VoiceBox Speaker Morph

Speaker morph is the permanent-speaker path requested for cases like
`language auto anchor -> kangsora`.

This is different from the existing VoiceBox clone prompt path:

- `speaker_anchor_with_ref_code` is runtime-only. It uses the selected speaker
  embedding and clone-prompt `ref_code` during one generation.
- `voicebox_morph/create_morphed_speaker.py` updates the selected checkpoint in
  place by default and writes a new speaker row into
  `talker.model.codec_embedding.weight`.
- A separate copied checkpoint is still available as an explicit option, but the
  product default is now "add speaker to existing VoiceBox model".

The anchor is no longer hardcoded. `--anchor-speaker auto` resolves the
language-native speaker from the checkpoint's actual speaker map: Korean uses
`Sohee` when present, Japanese uses `Ono_Anna`, English uses `Aiden`/`Ryan`,
and Chinese uses `Vivian`/`Serena`. The reference voice supplies timbre through
`ref_spk_embedding` from a clone prompt or through the embedded VoiceBox speaker
encoder.

The implementation is mirrored in both places:

- `qwen_extensions/voicebox_morph/create_morphed_speaker.py`
- `vendor/Qwen3-TTS/voicebox_morph/create_morphed_speaker.py`

The backend endpoint is:

```text
POST /api/voicebox/speaker-morph
```

After creation, the existing VoiceBox model can be selected with the new speaker
name. Preset-based VoiceBox generation can then use
`morphed_speaker_with_ref_code` to combine the permanent speaker row with the
stored clone prompt.

## Live E2E Check

2026-05-04 live backend/frontend check:

- Morph API: `POST /api/voicebox/speaker-morph`
- Input model: `data/finetune-runs/mai_ko_voicebox17b_full_extra1/final`
- Language: `Korean`
- Requested anchor speaker: `auto`
- Resolved anchor speaker: `Sohee`
- Target speaker: `kangsora_e2e`
- Clone prompt:
  `data/clone-prompts/generated_voice_design/2026-05-03/155124_나는-마법소녀로서-세상의-평화를-지키겠어-오늘도-악의-무리를-소탕할-거야.pt`
- Output checkpoint: `data/finetune-runs/morph_6dd2b49eb9c9/final`
- New speaker id: `3068`
- Morph metadata:
  - `cosine_to_anchor`: `0.9612314701080322`
  - `cosine_to_reference`: `0.9952197670936584`

Generation check:

- Endpoint: `POST /api/generate/voicebox-clone-instruct`
- Strategy: `morphed_speaker_with_ref_code`
- Speaker: `kangsora_e2e`
- Output:
  `data/generated/voicebox_clone_instruct/2026-05-04/001842_e2e-kangsora-morph-voicebox-instruct.wav`
- Audio metrics: `24 kHz`, `10.56 s`, RMS `0.103473`, peak `0.535156`
- Qwen3-ASR transcript:
  `기분이 이상해. 내 몸 어떻게 된 거지? 음, 잠깐만. 숨이 조금 가빠서 나도 잘 모르겠어.`

Frontend check:

- `npm run build` passed.
- Dev server returned HTTP `200` for `/?tab=voicebox_morph`.
- Bootstrap exposed the morphed model as `kangsora_e2e`, `model_family=voicebox`,
  `speaker_encoder_included=true`.
