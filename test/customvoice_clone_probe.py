"""Probe whether CustomVoice alone can perform clone-prompt style inference.

This script tests three separate questions against a CustomVoice checkpoint:

1. Does the official high-level API expose voice-clone prompt creation?
2. Does the official high-level API expose voice clone synthesis?
3. If we manually build a voice-clone prompt with low-level model pieces,
   does the underlying model.generate(...) path produce audio?

The goal is not to bless this as a supported workflow. The goal is to measure
what is technically possible in the current upstream codebase.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf
import torch

from qwen_tts import Qwen3TTSModel


@dataclass
class ProbeResult:
    """Store one probe step result in a JSON-friendly shape.

    Args:
        name: Stable probe identifier.
        supported: Whether the step succeeded.
        detail: Short human-readable summary.
        error_type: Exception class name when failed.
        output_path: Optional generated artifact path.
    """

    name: str
    supported: bool
    detail: str
    error_type: str | None = None
    output_path: str | None = None


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the CustomVoice clone probe.

    Returns:
        Parsed command-line arguments.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-path",
        default="data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        help="CustomVoice model path or repo id.",
    )
    parser.add_argument(
        "--ref-audio",
        default="data/datasets/mai_ko_full/audio/00044.wav",
        help="Reference audio used for the probe.",
    )
    parser.add_argument(
        "--ref-text",
        default="오늘은 정말 힘들었어. 그래도 여기서 멈출 수는 없어.",
        help="Transcript for the reference audio.",
    )
    parser.add_argument(
        "--text",
        default="오늘은 정말 힘들었어. 언제쯤 끝날까?",
        help="Target text to synthesize.",
    )
    parser.add_argument(
        "--language",
        default="Korean",
        help="Target language label.",
    )
    parser.add_argument(
        "--instruct",
        default="Speak softly, with restrained exhaustion but clear diction.",
        help="Optional CustomVoice instruct text.",
    )
    parser.add_argument(
        "--speaker",
        default="Sohee",
        help="Fallback stock speaker for the official CustomVoice API probe.",
    )
    parser.add_argument(
        "--output-dir",
        default="test/results/customvoice_clone_probe",
        help="Directory to store generated artifacts and JSON summary.",
    )
    return parser.parse_args()


def resolve_attention_implementation() -> str:
    """Resolve the best available attention backend for this machine.

    Returns:
        Transformers attention implementation name.
    """

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def load_model(model_path: str) -> Qwen3TTSModel:
    """Load the target CustomVoice model.

    Args:
        model_path: Local path or repo id.

    Returns:
        Loaded Qwen3TTSModel wrapper.
    """

    use_cuda = torch.cuda.is_available()
    return Qwen3TTSModel.from_pretrained(
        model_path,
        device_map="cuda:0" if use_cuda else "cpu",
        dtype=torch.bfloat16 if use_cuda else torch.float32,
        attn_implementation=resolve_attention_implementation(),
    )


def save_json(path: Path, payload: Any) -> None:
    """Save JSON payload with UTF-8 and stable formatting.

    Args:
        path: Destination JSON path.
        payload: JSON-serializable object.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def try_official_prompt_creation(model: Qwen3TTSModel, ref_audio: str, ref_text: str) -> ProbeResult:
    """Probe the official wrapper for clone prompt creation support.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_audio: Reference audio path.
        ref_text: Reference transcript.

    Returns:
        Probe result for the high-level prompt creation API.
    """

    try:
        model.create_voice_clone_prompt(ref_audio=ref_audio, ref_text=ref_text)
    except Exception as exc:  # noqa: BLE001 - we want the exact failure surface
        return ProbeResult(
            name="official_create_voice_clone_prompt",
            supported=False,
            detail=str(exc),
            error_type=type(exc).__name__,
        )
    return ProbeResult(
        name="official_create_voice_clone_prompt",
        supported=True,
        detail="Official high-level create_voice_clone_prompt call succeeded.",
    )


def try_official_voice_clone(model: Qwen3TTSModel, text: str, language: str, ref_audio: str, ref_text: str) -> ProbeResult:
    """Probe the official wrapper for voice clone synthesis support.

    Args:
        model: Loaded CustomVoice wrapper.
        text: Target text.
        language: Target language.
        ref_audio: Reference audio path.
        ref_text: Reference transcript.

    Returns:
        Probe result for the high-level voice clone API.
    """

    try:
        model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=ref_audio,
            ref_text=ref_text,
        )
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            name="official_generate_voice_clone",
            supported=False,
            detail=str(exc),
            error_type=type(exc).__name__,
        )
    return ProbeResult(
        name="official_generate_voice_clone",
        supported=True,
        detail="Official high-level generate_voice_clone call succeeded.",
    )


def build_manual_voice_clone_prompt(model: Qwen3TTSModel, ref_audio: str, ref_text: str) -> dict[str, Any]:
    """Build a voice_clone_prompt dict without using Base helper APIs.

    This recreates the prompt fields that the low-level model.generate(...)
    path expects. It intentionally avoids calling the high-level Base-only
    wrapper helpers so we can test what the CustomVoice checkpoint can do on
    its own.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_audio: Reference audio path.
        ref_text: Reference transcript.

    Returns:
        Low-level voice_clone_prompt dictionary.
    """

    normalized = model._normalize_audio_inputs([ref_audio])
    (wav, sr) = normalized[0]
    encode_payload = model.model.speech_tokenizer.encode(wav, sr=sr)
    ref_code = encode_payload.audio_codes[0]

    wav_for_spk = wav.astype(np.float32)
    if sr != model.model.speaker_encoder_sample_rate:
        wav_for_spk = librosa.resample(
            y=wav_for_spk,
            orig_sr=int(sr),
            target_sr=model.model.speaker_encoder_sample_rate,
        )

    ref_spk_embedding = model.model.extract_speaker_embedding(
        audio=wav_for_spk,
        sr=model.model.speaker_encoder_sample_rate,
    )

    return {
        "ref_code": [ref_code],
        "ref_spk_embedding": [ref_spk_embedding],
        "x_vector_only_mode": [False],
        "icl_mode": [True],
        "ref_text": [ref_text],
    }


def try_manual_low_level_clone(
    model: Qwen3TTSModel,
    ref_audio: str,
    ref_text: str,
    text: str,
    language: str,
    instruct: str,
    output_path: Path,
) -> ProbeResult:
    """Probe low-level clone-style generation using only the CustomVoice model.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_audio: Reference audio path.
        ref_text: Reference transcript.
        text: Target synthesis text.
        language: Target language.
        instruct: Optional instruct text.
        output_path: Destination WAV path.

    Returns:
        Probe result for the low-level manual prompt path.
    """

    if not callable(getattr(model.model, "speaker_encoder", None)):
        return ProbeResult(
            name="manual_low_level_voice_clone_prompt",
            supported=False,
            detail="CustomVoice checkpoint exposes extract_speaker_embedding(), but speaker_encoder is not callable (None), so reference-audio speaker embedding cannot be built.",
            error_type="SpeakerEncoderUnavailable",
        )

    try:
        prompt = build_manual_voice_clone_prompt(model=model, ref_audio=ref_audio, ref_text=ref_text)
        input_ids = model._tokenize_texts([model._build_assistant_text(text)])
        ref_ids = [model._tokenize_texts([model._build_ref_text(ref_text)])[0]]
        instruct_ids = [
            model._tokenize_texts([model._build_instruct_text(instruct)])[0]
            if instruct.strip()
            else None
        ]

        talker_codes_list, _ = model.model.generate(
            input_ids=input_ids,
            instruct_ids=instruct_ids,
            ref_ids=ref_ids,
            voice_clone_prompt=prompt,
            languages=[language],
            speakers=[None],
            non_streaming_mode=False,
            **model._merge_generate_kwargs(),
        )

        codes_for_decode = []
        ref_code_list = prompt.get("ref_code")
        for index, codes in enumerate(talker_codes_list):
            if ref_code_list is not None and ref_code_list[index] is not None:
                codes_for_decode.append(torch.cat([ref_code_list[index].to(codes.device), codes], dim=0))
            else:
                codes_for_decode.append(codes)

        wavs_all, sample_rate = model.model.speech_tokenizer.decode(
            [{"audio_codes": codes} for codes in codes_for_decode]
        )

        wav = wavs_all[0]
        if ref_code_list is not None and ref_code_list[0] is not None:
            ref_len = int(ref_code_list[0].shape[0])
            total_len = int(codes_for_decode[0].shape[0])
            cut = int(ref_len / max(total_len, 1) * wav.shape[0])
            wav = wav[cut:]

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, np.asarray(wav, dtype=np.float32), sample_rate)
        return ProbeResult(
            name="manual_low_level_voice_clone_prompt",
            supported=True,
            detail="Low-level model.generate(...) accepted a manually built voice_clone_prompt on CustomVoice.",
            output_path=str(output_path),
        )
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            name="manual_low_level_voice_clone_prompt",
            supported=False,
            detail=str(exc),
            error_type=type(exc).__name__,
        )


def inspect_model_capabilities(model: Qwen3TTSModel) -> dict[str, Any]:
    """Collect lightweight capability facts about the loaded CustomVoice model.

    Args:
        model: Loaded CustomVoice wrapper.

    Returns:
        Dictionary with structural capability facts.
    """

    return {
        "tts_model_type": getattr(model.model, "tts_model_type", None),
        "has_speech_tokenizer": hasattr(model.model, "speech_tokenizer"),
        "has_speaker_encoder": hasattr(model.model, "speaker_encoder"),
        "speaker_encoder_is_callable": callable(getattr(model.model, "speaker_encoder", None)),
        "has_extract_speaker_embedding": hasattr(model.model, "extract_speaker_embedding"),
        "supported_speakers_count": len(model.get_supported_speakers() or []),
    }


def main() -> None:
    """Run the CustomVoice clone probe and write a JSON summary."""

    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    model = load_model(args.model_path)
    summary: dict[str, Any] = {
        "model_path": args.model_path,
        "ref_audio": args.ref_audio,
        "language": args.language,
        "speaker": args.speaker,
        "capabilities": inspect_model_capabilities(model),
        "results": [],
    }

    results = [
        try_official_prompt_creation(model, args.ref_audio, args.ref_text),
        try_official_voice_clone(model, args.text, args.language, args.ref_audio, args.ref_text),
        try_manual_low_level_clone(
            model=model,
            ref_audio=args.ref_audio,
            ref_text=args.ref_text,
            text=args.text,
            language=args.language,
            instruct=args.instruct,
            output_path=output_dir / "customvoice_manual_clone.wav",
        ),
    ]
    summary["results"] = [asdict(item) for item in results]

    save_json(output_dir / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
