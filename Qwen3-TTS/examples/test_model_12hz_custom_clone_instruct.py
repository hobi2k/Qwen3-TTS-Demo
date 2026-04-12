# coding=utf-8
# Copyright 2026 The Alibaba Qwen team.
# SPDX-License-Identifier: Apache-2.0

"""Experimental hybrid inference: clone prompt + CustomVoice instruct.

This script uses a Base model to build a voice-clone prompt, then feeds the
resulting speaker prompt into a CustomVoice model together with instruction
text. It is intended for fast experimentation when we want both:
  1) custom timbre from a reference voice
  2) instruct-style control from a CustomVoice checkpoint

This path is experimental and not part of the upstream stable wrapper API.
"""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Optional

import soundfile as sf
import torch

from qwen_tts import Qwen3TTSModel


def build_arg_parser():
    """Build the CLI parser for hybrid clone+instruct inference.

    Returns:
        Configured argument parser.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model_path", type=str, required=True)
    parser.add_argument("--custom_model_path", type=str, required=True)
    parser.add_argument("--ref_audio", type=str, required=True)
    parser.add_argument("--ref_text", type=str, default="")
    parser.add_argument("--text", type=str, required=True)
    parser.add_argument("--instruct", type=str, default="")
    parser.add_argument("--language", type=str, default="Auto")
    parser.add_argument("--output_wav", type=str, default="hybrid_clone_instruct.wav")
    parser.add_argument("--x_vector_only_mode", action="store_true")
    parser.add_argument("--non_streaming_mode", action="store_true")
    parser.add_argument("--do_sample", type=str, default="true")
    parser.add_argument("--top_k", type=int, default=50)
    parser.add_argument("--top_p", type=float, default=1.0)
    parser.add_argument("--temperature", type=float, default=0.9)
    parser.add_argument("--repetition_penalty", type=float, default=1.05)
    parser.add_argument("--subtalker_dosample", type=str, default="true")
    parser.add_argument("--subtalker_top_k", type=int, default=50)
    parser.add_argument("--subtalker_top_p", type=float, default=1.0)
    parser.add_argument("--subtalker_temperature", type=float, default=0.9)
    parser.add_argument("--max_new_tokens", type=int, default=2048)
    return parser


def parse_bool(text: str) -> bool:
    """Convert a CLI text value into a boolean.

    Args:
        text: Raw CLI string.

    Returns:
        Parsed boolean.
    """

    return text.strip().lower() not in {"0", "false", "no", "off"}


def build_generate_kwargs(args: argparse.Namespace) -> Dict[str, Any]:
    """Translate CLI options into model.generate kwargs.

    Args:
        args: Parsed CLI namespace.

    Returns:
        Generate kwargs dictionary.
    """

    return {
        "do_sample": parse_bool(args.do_sample),
        "top_k": args.top_k,
        "top_p": args.top_p,
        "temperature": args.temperature,
        "repetition_penalty": args.repetition_penalty,
        "subtalker_dosample": parse_bool(args.subtalker_dosample),
        "subtalker_top_k": args.subtalker_top_k,
        "subtalker_top_p": args.subtalker_top_p,
        "subtalker_temperature": args.subtalker_temperature,
        "max_new_tokens": args.max_new_tokens,
    }


def resolve_attention_implementation() -> str:
    """Choose a safe attention backend for the current environment.

    Returns:
        Attention implementation name.
    """

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn_3"):
        return "flash_attention_3"
    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def prompt_items_to_dict(base_tts: Qwen3TTSModel, prompt_items) -> Dict[str, Any]:
    """Convert Base-model prompt items into raw prompt tensors.

    Args:
        base_tts: Base-model wrapper.
        prompt_items: Prompt items from `create_voice_clone_prompt`.

    Returns:
        Raw prompt dictionary accepted by the core model.
    """

    return base_tts._prompt_items_to_voice_clone_prompt(prompt_items)


def generate_custom_clone_with_instruct(
    *,
    base_tts: Qwen3TTSModel,
    custom_tts: Qwen3TTSModel,
    text: str,
    language: str,
    instruct: str,
    ref_audio: str,
    ref_text: Optional[str],
    x_vector_only_mode: bool,
    non_streaming_mode: bool,
    **generate_kwargs: Any,
):
    """Generate speech with cloned timbre and CustomVoice instruct control.

    Args:
        base_tts: Base-model wrapper used to extract clone prompt tensors.
        custom_tts: CustomVoice wrapper used for instruct-capable synthesis.
        text: Target speech text.
        language: Generation language.
        instruct: Style instruction text.
        ref_audio: Reference audio path.
        ref_text: Reference transcript for ICL mode.
        x_vector_only_mode: Whether to ignore reference codes and use speaker embedding only.
        non_streaming_mode: Forwarded generation flag.

    Returns:
        Tuple of generated wav list and sample rate.
    """

    if custom_tts.model.tts_model_type != "custom_voice":
        raise ValueError("custom_tts must point to a CustomVoice checkpoint.")
    if base_tts.model.tts_model_type != "base":
        raise ValueError("base_tts must point to a Base checkpoint.")

    prompt_items = base_tts.create_voice_clone_prompt(
        ref_audio=ref_audio,
        ref_text=ref_text,
        x_vector_only_mode=x_vector_only_mode,
    )
    voice_clone_prompt = prompt_items_to_dict(base_tts, prompt_items)
    ref_ids = []
    for item in prompt_items:
        if item.ref_text:
            ref_ids.append(custom_tts._tokenize_texts([custom_tts._build_ref_text(item.ref_text)])[0])
        else:
            ref_ids.append(None)

    input_ids = custom_tts._tokenize_texts([custom_tts._build_assistant_text(text)])
    instruct_ids: List[Optional[torch.Tensor]] = []
    if instruct.strip():
        instruct_ids.append(custom_tts._tokenize_texts([custom_tts._build_instruct_text(instruct)])[0])
    else:
        instruct_ids.append(None)

    talker_codes_list, _ = custom_tts.model.generate(
        input_ids=input_ids,
        instruct_ids=instruct_ids,
        ref_ids=ref_ids,
        voice_clone_prompt=voice_clone_prompt,
        languages=[language],
        speakers=[None],
        non_streaming_mode=non_streaming_mode,
        **custom_tts._merge_generate_kwargs(**generate_kwargs),
    )

    codes_for_decode = []
    ref_code_list = voice_clone_prompt.get("ref_code", None)
    for index, codes in enumerate(talker_codes_list):
        if ref_code_list is not None and ref_code_list[index] is not None:
            codes_for_decode.append(torch.cat([ref_code_list[index].to(codes.device), codes], dim=0))
        else:
            codes_for_decode.append(codes)

    wavs_all, sample_rate = custom_tts.model.speech_tokenizer.decode([{"audio_codes": codes} for codes in codes_for_decode])

    wavs_out = []
    for index, wav in enumerate(wavs_all):
        if ref_code_list is not None and ref_code_list[index] is not None:
            ref_len = int(ref_code_list[index].shape[0])
            total_len = int(codes_for_decode[index].shape[0])
            cut = int(ref_len / max(total_len, 1) * wav.shape[0])
            wavs_out.append(wav[cut:])
        else:
            wavs_out.append(wav)

    return wavs_out, sample_rate


def main():
    """Run the hybrid clone+instruct inference demo from CLI."""

    parser = build_arg_parser()
    args = parser.parse_args()

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    attn_implementation = resolve_attention_implementation()

    base_tts = Qwen3TTSModel.from_pretrained(
        args.base_model_path,
        device_map=device,
        dtype=dtype,
        attn_implementation=attn_implementation,
    )
    custom_tts = Qwen3TTSModel.from_pretrained(
        args.custom_model_path,
        device_map=device,
        dtype=dtype,
        attn_implementation=attn_implementation,
    )

    wavs, sample_rate = generate_custom_clone_with_instruct(
        base_tts=base_tts,
        custom_tts=custom_tts,
        text=args.text,
        language=args.language,
        instruct=args.instruct,
        ref_audio=args.ref_audio,
        ref_text=args.ref_text or None,
        x_vector_only_mode=args.x_vector_only_mode,
        non_streaming_mode=args.non_streaming_mode,
        **build_generate_kwargs(args),
    )

    output_path = Path(args.output_wav)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, wavs[0], sample_rate)
    print(f"Saved hybrid clone+instruct wav to {output_path}")


if __name__ == "__main__":
    main()
