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
import os
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from qwen_tts import Qwen3TTSModel


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the hybrid inference example.

    Returns:
        Parsed CLI namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model-path", required=True)
    parser.add_argument("--custom-model-path", required=True)
    parser.add_argument("--ref-audio", required=True)
    parser.add_argument("--ref-text", default="")
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", default="Korean")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--x-vector-only-mode", action="store_true")
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


def main() -> None:
    """Create a clone prompt with Base and synthesize with CustomVoice instruct."""

    args = parse_args()
    attn_implementation = resolve_attention_implementation()

    base_model = Qwen3TTSModel.from_pretrained(
        args.base_model_path,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        attn_implementation=attn_implementation,
    )
    custom_model = Qwen3TTSModel.from_pretrained(
        args.custom_model_path,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        attn_implementation=attn_implementation,
    )

    prompt_items = base_model.create_voice_clone_prompt(
        ref_audio=args.ref_audio,
        ref_text=args.ref_text or None,
        x_vector_only_mode=args.x_vector_only_mode,
    )
    voice_clone_prompt = base_model._prompt_items_to_voice_clone_prompt(prompt_items)

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
        non_streaming_mode=False,
        **custom_model._merge_generate_kwargs(),
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
    print(output_path)


if __name__ == "__main__":
    main()
