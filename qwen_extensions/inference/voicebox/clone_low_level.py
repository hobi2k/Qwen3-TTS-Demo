#!/usr/bin/env python3
"""Low-level VoiceBox clone and clone+instruct inference.

This is the canonical VoiceBox inference entrypoint for this demo. It stays
under ``qwen_extensions/inference/voicebox`` so self-contained VoiceBox
experiments are separate from the non-VoiceBox hybrid clone-prompt path and
from the upstream ``vendor/Qwen3-TTS`` checkout.
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
import torch.nn.functional as F

from runtime import load_qwen_or_voicebox_model


@dataclass
class StrategyResult:
    """One experiment result in a JSON-friendly shape."""

    name: str
    ok: bool
    detail: str
    output_path: str | None = None
    transcript_like_text: str | None = None
    similarity_to_stock_speaker: float | None = None


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for low-level clone experiments."""

    parser = argparse.ArgumentParser(description="Run low-level VoiceBox clone experiments.")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--ref-audio", default="")
    parser.add_argument("--ref-text", default="")
    parser.add_argument("--voice-clone-prompt-path", default="")
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", default="Korean")
    parser.add_argument("--instruct", default="Speak softly, with restrained exhaustion but clear diction.")
    parser.add_argument("--speaker", default="mai")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--generation-options",
        default="{}",
        help="JSON object forwarded to Qwen generate controls. Supports seed, non_streaming_mode, sampling, subtalker, max_new_tokens, and extra generate kwargs.",
    )
    parser.add_argument(
        "--strategies",
        nargs="+",
        choices=[
            "control_stock_customvoice",
            "embedded_encoder_only",
            "embedded_encoder_with_ref_code",
            "borrowed_stock_embed_with_ref_code",
            "pseudo_embed_only",
            "pseudo_embed_with_ref_code",
            "all",
        ],
        default=["all"],
    )
    return parser.parse_args()


def parse_generation_options(raw: str) -> dict[str, Any]:
    """Parse generation controls passed by the backend."""

    if not raw.strip():
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise RuntimeError("--generation-options must be a JSON object.")
    return payload


def apply_seed(seed: Any) -> None:
    """Apply an optional deterministic seed for the current process."""

    if seed is None:
        return
    value = int(seed)
    np.random.seed(value)
    torch.manual_seed(value)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(value)


def voicebox_generate_kwargs(options: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    """Build generation kwargs while preserving the existing VoiceBox defaults."""

    kwargs = {
        "do_sample": True,
        "top_k": 30,
        "top_p": 0.95,
        "temperature": 0.8,
        "max_new_tokens": 1024,
    }
    non_streaming_mode = False
    for key, value in options.items():
        if key == "seed":
            continue
        if key == "non_streaming_mode":
            non_streaming_mode = bool(value)
            continue
        kwargs[key] = value
    return non_streaming_mode, kwargs


def resolve_attention_implementation() -> str:
    """Choose the best available attention backend."""

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def load_model(model_path: str):
    """Load a VoiceBox or regular Qwen checkpoint."""

    use_cuda = torch.cuda.is_available()
    return load_qwen_or_voicebox_model(
        model_path,
        device_map="cuda:0" if use_cuda else "cpu",
        dtype=torch.bfloat16 if use_cuda else torch.float32,
        attn_implementation=resolve_attention_implementation(),
    )


def save_json(path: Path, payload: Any) -> None:
    """Write a JSON summary."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def get_stock_speaker_embedding(model, speaker: str) -> torch.Tensor:
    """Fetch one speaker embedding from the talker embedding table."""

    spk_id = model.model.config.talker_config.spk_id[speaker.lower()]
    return model.model.talker.get_input_embeddings()(
        torch.tensor(spk_id, device=model.model.talker.device, dtype=torch.long)
    )


def encode_reference_audio(model, ref_audio: str) -> torch.Tensor:
    """Encode reference audio into codec ids."""

    normalized = model._normalize_audio_inputs([ref_audio])
    wav, sr = normalized[0]
    encoded = model.model.speech_tokenizer.encode(wav, sr=sr)
    return encoded.audio_codes[0]


def load_voice_clone_prompt_item(path: str) -> dict[str, Any]:
    """Load one upstream-style Qwen voice clone prompt item from .pt."""

    payload = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(payload, dict) or "items" not in payload:
        raise RuntimeError("Invalid voice clone prompt: missing items.")
    items = payload["items"]
    if not isinstance(items, list) or not items:
        raise RuntimeError("Invalid voice clone prompt: empty items.")
    item = items[0]
    if not isinstance(item, dict):
        raise RuntimeError("Invalid voice clone prompt item.")
    if item.get("ref_spk_embedding") is None:
        raise RuntimeError("Invalid voice clone prompt item: missing ref_spk_embedding.")
    return item


def build_ref_ids(model, ref_text: str) -> torch.Tensor:
    """Tokenize reference text with upstream helper formatting."""

    return model._tokenize_texts([model._build_ref_text(ref_text)])[0]


def build_target_ids(model, text: str) -> torch.Tensor:
    """Tokenize target text with assistant formatting."""

    return model._tokenize_texts([model._build_assistant_text(text)])[0]


def build_instruct_ids(model, instruct: str) -> torch.Tensor | None:
    """Tokenize instruct text if provided."""

    if not instruct:
        return None
    return model._tokenize_texts([model._build_instruct_text(instruct)])[0]


def pseudo_embedding_from_ref_code(model, ref_code: torch.Tensor) -> torch.Tensor:
    """Approximate a speaker embedding from codec embeddings only."""

    ref_code = ref_code.detach().clone().to(device=model.model.talker.device, dtype=torch.long)
    per_group_embeds: list[torch.Tensor] = []
    for group_idx in range(model.model.talker.config.num_code_groups):
        token_ids = ref_code[:, group_idx]
        if group_idx == 0:
            emb = model.model.talker.get_input_embeddings()(token_ids)
        else:
            emb = model.model.talker.code_predictor.get_input_embeddings()[group_idx - 1](token_ids)
        per_group_embeds.append(emb)
    stacked = torch.stack(per_group_embeds, dim=0).mean(dim=0)
    return stacked.mean(dim=0)


def true_embedding_from_ref_audio(model, ref_audio: str) -> torch.Tensor | None:
    """Extract a real embedding through the embedded VoiceBox speaker encoder."""

    if getattr(model.model, "speaker_encoder", None) is None:
        return None
    wav, sr = sf.read(ref_audio)
    if isinstance(wav, np.ndarray) and wav.ndim > 1:
        wav = np.mean(wav, axis=1)
    target_sr = int(model.model.speaker_encoder_sample_rate)
    if int(sr) != target_sr:
        wav = librosa.resample(y=wav.astype(np.float32), orig_sr=int(sr), target_sr=target_sr)
        sr = target_sr
    return model.model.extract_speaker_embedding(audio=np.asarray(wav, dtype=np.float32), sr=int(sr))


def synthesize_with_manual_prompt(
    model,
    *,
    text: str,
    language: str,
    instruct: str,
    ref_text: str,
    ref_code: torch.Tensor,
    ref_spk_embedding: torch.Tensor,
    x_vector_only_mode: bool,
    icl_mode: bool,
    generation_options: dict[str, Any],
    output_path: Path,
) -> tuple[bool, str]:
    """Run low-level generation with a hand-built voice_clone_prompt."""

    device = model.model.talker.device
    dtype = next(model.model.talker.parameters()).dtype
    ref_code = ref_code.detach().to(device=device, dtype=torch.long)
    ref_spk_embedding = ref_spk_embedding.detach().to(device=device, dtype=dtype)
    input_ids = [build_target_ids(model, text)]
    instruct_ids = [build_instruct_ids(model, instruct)]
    ref_ids = [build_ref_ids(model, ref_text)]
    voice_clone_prompt = {
        "ref_code": [None if x_vector_only_mode else ref_code],
        "ref_spk_embedding": [ref_spk_embedding],
        "x_vector_only_mode": [x_vector_only_mode],
        "icl_mode": [icl_mode],
    }
    non_streaming_mode, generate_kwargs = voicebox_generate_kwargs(generation_options)

    try:
        codes, _ = model.model.generate(
            input_ids=input_ids,
            instruct_ids=instruct_ids,
            ref_ids=ref_ids,
            voice_clone_prompt=voice_clone_prompt,
            languages=[language],
            speakers=[None],
            non_streaming_mode=non_streaming_mode,
            **generate_kwargs,
        )
        wavs, fs = model.model.speech_tokenizer.decode([{"audio_codes": codes[0]}])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, wavs[0], fs)
        return True, f"Generated audio at {output_path}"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def cosine_similarity(a: torch.Tensor, b: torch.Tensor) -> float:
    """Compute cosine similarity between two embeddings."""

    left = a.detach().float().view(1, -1)
    right = b.detach().float().to(device=left.device).view(1, -1)
    return float(F.cosine_similarity(left, right).item())


def run_control_customvoice(
    model,
    *,
    text: str,
    language: str,
    instruct: str,
    speaker: str,
    generation_options: dict[str, Any],
    output_path: Path,
) -> StrategyResult:
    """Generate a normal CustomVoice sample for comparison."""

    try:
        non_streaming_mode, generate_kwargs = voicebox_generate_kwargs(generation_options)
        wavs, fs = model.generate_custom_voice(
            text=text,
            speaker=speaker,
            language=language,
            instruct=instruct,
            non_streaming_mode=non_streaming_mode,
            **generate_kwargs,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, wavs[0], fs)
        return StrategyResult(
            name="control_stock_customvoice",
            ok=True,
            detail=f"Generated control sample with stock speaker {speaker}.",
            output_path=str(output_path),
            transcript_like_text=text,
        )
    except Exception as exc:  # noqa: BLE001
        return StrategyResult(name="control_stock_customvoice", ok=False, detail=f"{type(exc).__name__}: {exc}")


def main() -> None:
    """Run selected low-level clone strategies and save a summary."""

    args = parse_args()
    if not args.voice_clone_prompt_path and (not args.ref_audio or not args.ref_text):
        raise SystemExit("--voice-clone-prompt-path or both --ref-audio/--ref-text are required.")
    output_dir = Path(args.output_dir)
    generation_options = parse_generation_options(args.generation_options)
    apply_seed(generation_options.get("seed"))
    model = load_model(args.model_path)
    selected = set(args.strategies)
    if "all" in selected:
        selected = {
            "control_stock_customvoice",
            "embedded_encoder_only",
            "embedded_encoder_with_ref_code",
            "borrowed_stock_embed_with_ref_code",
            "pseudo_embed_only",
            "pseudo_embed_with_ref_code",
        }

    prompt_item = load_voice_clone_prompt_item(args.voice_clone_prompt_path) if args.voice_clone_prompt_path else None
    if prompt_item is not None and prompt_item.get("ref_code") is not None:
        ref_code = prompt_item["ref_code"]
    else:
        ref_code = encode_reference_audio(model, args.ref_audio)
    stock_embed = get_stock_speaker_embedding(model, args.speaker)
    pseudo_embed = pseudo_embedding_from_ref_code(model, ref_code)
    if prompt_item is not None:
        embedded_encoder_embed = prompt_item["ref_spk_embedding"]
        prompt_ref_text = str(prompt_item.get("ref_text") or "").strip()
        if prompt_ref_text:
            args.ref_text = prompt_ref_text
    else:
        embedded_encoder_embed = true_embedding_from_ref_audio(model, args.ref_audio)

    results: list[StrategyResult] = []
    if "control_stock_customvoice" in selected:
        results.append(
            run_control_customvoice(
                model,
                text=args.text,
                language=args.language,
                instruct=args.instruct,
                speaker=args.speaker,
                generation_options=generation_options,
                output_path=output_dir / "control_stock_customvoice.wav",
            )
        )

    def append_manual(name: str, embed: torch.Tensor | None, xvec_only: bool, icl_mode: bool, output_name: str) -> None:
        if embed is None:
            results.append(StrategyResult(name=name, ok=False, detail="speaker_encoder is not attached at runtime."))
            return
        ok, detail = synthesize_with_manual_prompt(
            model,
            text=args.text,
            language=args.language,
            instruct=args.instruct,
            ref_text=args.ref_text,
            ref_code=ref_code,
            ref_spk_embedding=embed,
            x_vector_only_mode=xvec_only,
            icl_mode=icl_mode,
            generation_options=generation_options,
            output_path=output_dir / output_name,
        )
        results.append(
            StrategyResult(
                name=name,
                ok=ok,
                detail=detail,
                output_path=str(output_dir / output_name) if ok else None,
                transcript_like_text=args.text,
                similarity_to_stock_speaker=cosine_similarity(embed, stock_embed),
            )
        )

    if "embedded_encoder_only" in selected:
        append_manual("embedded_encoder_only", embedded_encoder_embed, True, False, "embedded_encoder_only.wav")
    if "embedded_encoder_with_ref_code" in selected:
        append_manual(
            "embedded_encoder_with_ref_code",
            embedded_encoder_embed,
            False,
            True,
            "embedded_encoder_with_ref_code.wav",
        )
    if "borrowed_stock_embed_with_ref_code" in selected:
        append_manual(
            "borrowed_stock_embed_with_ref_code",
            stock_embed,
            False,
            True,
            "borrowed_stock_embed_with_ref_code.wav",
        )
    if "pseudo_embed_only" in selected:
        append_manual("pseudo_embed_only", pseudo_embed, True, False, "pseudo_embed_only.wav")
    if "pseudo_embed_with_ref_code" in selected:
        append_manual("pseudo_embed_with_ref_code", pseudo_embed, False, True, "pseudo_embed_with_ref_code.wav")

    payload = {
        "model_path": args.model_path,
        "ref_audio": args.ref_audio,
        "ref_text": args.ref_text,
        "voice_clone_prompt_path": args.voice_clone_prompt_path or None,
        "voice_clone_prompt_used": prompt_item is not None,
        "text": args.text,
        "language": args.language,
        "speaker": args.speaker,
        "generation_options": generation_options,
        "capabilities": {
            "tts_model_type": model.model.tts_model_type,
            "speaker_encoder_present": model.model.speaker_encoder is not None,
            "supported_speakers": model.get_supported_speakers(),
            "pseudo_vs_stock_similarity": cosine_similarity(pseudo_embed, stock_embed),
            "embedded_vs_stock_similarity": None if embedded_encoder_embed is None else cosine_similarity(embedded_encoder_embed, stock_embed),
        },
        "results": [asdict(item) for item in results],
    }
    save_json(output_dir / "summary.json", payload)


if __name__ == "__main__":
    main()
