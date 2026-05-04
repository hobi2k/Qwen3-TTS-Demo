# coding=utf-8
"""Experimental clone-prompt plus instruct inference path.

This script stays separate from the stock upstream examples. It combines:

1. a Base checkpoint that turns reference audio/text into a clone prompt
2. a CustomVoice checkpoint that still receives an instruct prompt

The goal is to test whether we can keep zero-shot voice identity from the Base
clone prompt while still using the CustomVoice instruct controls.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
UPSTREAM_ROOT = REPO_ROOT / "vendor" / "Qwen3-TTS"
if not UPSTREAM_ROOT.exists() and (SCRIPT_PATH.parents[1] / "qwen_tts").exists():
    UPSTREAM_ROOT = SCRIPT_PATH.parents[1]
if str(UPSTREAM_ROOT) not in sys.path:
    sys.path.insert(0, str(UPSTREAM_ROOT))

from qwen_tts import Qwen3TTSModel, VoiceClonePromptItem


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the hybrid inference example.

    Returns:
        Parsed CLI namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model-path", required=True)
    parser.add_argument("--custom-model-path", required=True)
    parser.add_argument("--ref-audio", default="")
    parser.add_argument("--ref-text", default="")
    parser.add_argument("--voice-clone-prompt-path", default="")
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", default="Korean")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--x-vector-only-mode", action="store_true")
    parser.add_argument(
        "--speaker-anchor",
        default="auto",
        help="CustomVoice speaker token used to keep instruct conditioning in-distribution. Use 'auto' to pick by language, or 'none' to keep the clone prompt speaker embedding.",
    )
    parser.add_argument(
        "--customvoice-speaker",
        default="",
        help="Alias for --speaker-anchor. Use this when the target text should be conditioned on a specific CustomVoice speaker, e.g. Sohee.",
    )
    parser.add_argument(
        "--generation-options",
        default="{}",
        help="JSON object forwarded to Qwen generate controls, e.g. '{\"max_new_tokens\": 1024, \"temperature\": 0.8}'.",
    )
    parser.add_argument("--non-streaming-mode", action="store_true")
    return parser.parse_args()


def resolve_attention_implementation() -> str:
    """Resolve the best attention backend for the local machine.

    Returns:
        Attention implementation string for Transformers.
    """

    configured = os.getenv("QWEN_DEMO_ATTN_IMPL", "").strip()
    if configured:
        return configured
    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def parse_generation_options(raw: str) -> dict:
    """Parse optional JSON generation controls."""

    if not raw.strip():
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise SystemExit("--generation-options must be a JSON object.")
    return payload


def load_voice_clone_prompt_items(path: str) -> list[VoiceClonePromptItem]:
    """Load upstream-style saved clone prompt items from a .pt file."""

    payload = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(payload, dict) or "items" not in payload:
        raise SystemExit(f"Invalid voice clone prompt file: {path}")
    items_raw = payload["items"]
    if not isinstance(items_raw, list) or not items_raw:
        raise SystemExit(f"Empty voice clone prompt file: {path}")

    items: list[VoiceClonePromptItem] = []
    for item in items_raw:
        if not isinstance(item, dict):
            raise SystemExit(f"Invalid voice clone prompt item in: {path}")
        ref_code = item.get("ref_code", None)
        if ref_code is not None and not torch.is_tensor(ref_code):
            ref_code = torch.tensor(ref_code)
        ref_spk_embedding = item.get("ref_spk_embedding", None)
        if ref_spk_embedding is None:
            raise SystemExit(f"Voice clone prompt item is missing ref_spk_embedding: {path}")
        if not torch.is_tensor(ref_spk_embedding):
            ref_spk_embedding = torch.tensor(ref_spk_embedding)
        items.append(
            VoiceClonePromptItem(
                ref_code=ref_code,
                ref_spk_embedding=ref_spk_embedding,
                x_vector_only_mode=bool(item.get("x_vector_only_mode", False)),
                icl_mode=bool(item.get("icl_mode", not bool(item.get("x_vector_only_mode", False)))),
                ref_text=item.get("ref_text", None),
            )
        )
    return items


def language_anchor_speaker(model: Qwen3TTSModel, language: str) -> str | None:
    """Pick a stock CustomVoice speaker token for the target language."""

    supported = set()
    if callable(getattr(model, "get_supported_speakers", None)):
        supported = {str(item).lower() for item in (model.get_supported_speakers() or [])}
    spk_id = getattr(getattr(model.model.config, "talker_config", None), "spk_id", {})
    if not supported and isinstance(spk_id, dict):
        supported = {str(item).lower() for item in spk_id.keys()}
    if not supported:
        return None

    preferred_by_language = {
        "korean": ["sohee"],
        "ko": ["sohee"],
        "japanese": ["ono_anna"],
        "ja": ["ono_anna"],
        "english": ["aiden", "ryan", "dylan", "eric"],
        "en": ["aiden", "ryan", "dylan", "eric"],
        "chinese": ["vivian", "serena", "uncle_fu"],
        "zh": ["vivian", "serena", "uncle_fu"],
        "auto": ["sohee", "ono_anna", "aiden", "vivian", "serena"],
    }
    language_key = (language or "auto").strip().lower()
    for candidate in preferred_by_language.get(language_key, preferred_by_language["auto"]):
        if candidate in supported:
            return candidate
    return sorted(supported)[0]


def speaker_token_embedding(model: Qwen3TTSModel, speaker: str) -> torch.Tensor | None:
    """Return a CustomVoice speaker token embedding from the talker table."""

    if not speaker:
        return None
    spk_id = getattr(model.model.config.talker_config, "spk_id", {})
    lowered = {str(key).lower(): value for key, value in spk_id.items()} if isinstance(spk_id, dict) else {}
    token_id = lowered.get(speaker.lower())
    if token_id is None:
        return None
    token = torch.tensor(token_id, device=model.model.talker.device, dtype=torch.long)
    return model.model.talker.get_input_embeddings()(token).detach().view(-1).cpu()


def anchor_prompt_items_for_instruct(
    custom_model: Qwen3TTSModel,
    prompt_items: list,
    language: str,
    speaker_anchor: str,
) -> tuple[list, str | None]:
    """Keep ref_code/ref_text but anchor speaker conditioning to CustomVoice.

    Base clone-prompt embeddings are not guaranteed to live in the same speaker
    token manifold that stock CustomVoice instruction following was trained on.
    Reference codes keep the cloned acoustics; the anchor token keeps instruct
    conditioning stable.
    """

    if speaker_anchor.strip().lower() == "none":
        return prompt_items, None
    if getattr(custom_model.model, "tts_model_type", "") != "custom_voice":
        return prompt_items, None

    anchor_speaker = speaker_anchor.strip()
    if not anchor_speaker or anchor_speaker.lower() == "auto":
        anchor_speaker = language_anchor_speaker(custom_model, language) or ""
    anchor_embedding = speaker_token_embedding(custom_model, anchor_speaker)
    if anchor_embedding is None:
        if speaker_anchor.strip() and speaker_anchor.strip().lower() != "auto":
            raise RuntimeError(f"CustomVoice speaker anchor is not available in this checkpoint: {speaker_anchor}")
        return prompt_items, None

    anchored_items = []
    for item in prompt_items:
        anchored_items.append(
            item.__class__(
                ref_code=item.ref_code,
                ref_spk_embedding=anchor_embedding,
                x_vector_only_mode=item.x_vector_only_mode,
                icl_mode=item.icl_mode,
                ref_text=item.ref_text,
            )
        )
    return anchored_items, anchor_speaker.lower()


def main() -> None:
    """Create a clone prompt with Base and synthesize with CustomVoice instruct."""

    args = parse_args()
    if args.customvoice_speaker.strip():
        args.speaker_anchor = args.customvoice_speaker.strip()
    if not args.voice_clone_prompt_path and not args.ref_audio:
        raise SystemExit("--voice-clone-prompt-path or --ref-audio is required.")

    attn_implementation = resolve_attention_implementation()
    generation_options = parse_generation_options(args.generation_options)
    non_streaming_mode = bool(args.non_streaming_mode or generation_options.pop("non_streaming_mode", False))

    custom_model = Qwen3TTSModel.from_pretrained(
        args.custom_model_path,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        attn_implementation=attn_implementation,
    )

    if args.voice_clone_prompt_path:
        prompt_items = load_voice_clone_prompt_items(args.voice_clone_prompt_path)
    else:
        base_model = Qwen3TTSModel.from_pretrained(
            args.base_model_path,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
            dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
            attn_implementation=attn_implementation,
        )
        prompt_items = base_model.create_voice_clone_prompt(
            ref_audio=args.ref_audio,
            ref_text=args.ref_text or None,
            x_vector_only_mode=args.x_vector_only_mode,
        )
    prompt_items_for_generation, anchor_speaker = anchor_prompt_items_for_instruct(
        custom_model,
        prompt_items,
        args.language,
        args.speaker_anchor,
    )
    voice_clone_prompt = custom_model._prompt_items_to_voice_clone_prompt(prompt_items_for_generation)

    ref_ids = []
    for item in prompt_items:
        if item.ref_text:
            ref_ids.append(custom_model._tokenize_texts([custom_model._build_ref_text(item.ref_text)])[0])
        else:
            ref_ids.append(None)

    input_ids = custom_model._tokenize_texts([custom_model._build_assistant_text(args.text)])
    instruct_ids = [
        custom_model._tokenize_texts([custom_model._build_instruct_text(args.instruct)])[0]
        if args.instruct.strip()
        else None
    ]

    talker_codes_list, _ = custom_model.model.generate(
        input_ids=input_ids,
        instruct_ids=instruct_ids,
        ref_ids=ref_ids,
        voice_clone_prompt=voice_clone_prompt,
        languages=[args.language],
        speakers=[None],
        non_streaming_mode=non_streaming_mode,
        **custom_model._merge_generate_kwargs(**generation_options),
    )

    ref_code_list = voice_clone_prompt.get("ref_code", None)
    codes_for_decode = []
    for index, codes in enumerate(talker_codes_list):
        if ref_code_list is not None and ref_code_list[index] is not None:
            codes_for_decode.append(torch.cat([ref_code_list[index].to(codes.device), codes], dim=0))
        else:
            codes_for_decode.append(codes)

    wavs_all, sample_rate = custom_model.model.speech_tokenizer.decode(
        [{"audio_codes": codes} for codes in codes_for_decode]
    )

    wav = wavs_all[0]
    if ref_code_list is not None and ref_code_list[0] is not None:
        ref_len = int(ref_code_list[0].shape[0])
        total_len = int(codes_for_decode[0].shape[0])
        cut = int(ref_len / max(total_len, 1) * wav.shape[0])
        wav = wav[cut:]

    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, np.asarray(wav, dtype=np.float32), sample_rate)
    strategy = "customvoice_speaker_anchor_with_ref_code" if anchor_speaker else "embedded_encoder_with_ref_code"
    print(f"{output_path}\nstrategy={strategy}\nanchor_speaker={anchor_speaker or ''}")


if __name__ == "__main__":
    main()
