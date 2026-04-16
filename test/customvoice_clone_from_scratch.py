"""Experiment clone-like generation with only a CustomVoice checkpoint.

This script intentionally avoids the official Base-only clone helpers.
Instead, it tests whether we can coerce a CustomVoice checkpoint into a
reference-conditioned workflow by constructing low-level prompt structures
ourselves.

The experiment matters because the official API splits responsibilities:
Base handles clone prompts, while CustomVoice handles speaker + instruct.
Here we test whether that separation is merely a wrapper choice, or a real
model limitation.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F

from qwen_tts import Qwen3TTSModel

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from voicebox_runtime import load_qwen_or_voicebox_model  # type: ignore


@dataclass
class StrategyResult:
    """Store one strategy outcome in a JSON-friendly format.

    Args:
        name: Stable strategy identifier.
        ok: Whether synthesis completed.
        detail: Human-readable explanation.
        output_path: Optional generated wav path.
        transcript_like_text: Target text used for synthesis.
        similarity_to_stock_speaker: Cosine similarity against a borrowed stock
            speaker embedding when available. This helps tell whether a pseudo
            embedding collapsed back toward a stock voice.
    """

    name: str
    ok: bool
    detail: str
    output_path: str | None = None
    transcript_like_text: str | None = None
    similarity_to_stock_speaker: float | None = None


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the CustomVoice clone-from-scratch probe.

    Returns:
        Parsed command-line arguments.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-path",
        default="data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        help="CustomVoice checkpoint path or repo id.",
    )
    parser.add_argument(
        "--ref-audio",
        default="data/datasets/mai_ko_full/audio/00000.wav",
        help="Reference audio used for conditioning attempts.",
    )
    parser.add_argument(
        "--ref-text",
        default="그래서 말인데, 올해는 요괴도 인간도 함께 즐길 수 있게 「미카와 축제」를 제대로 열어보려고",
        help="Reference transcript that matches the reference audio.",
    )
    parser.add_argument(
        "--text",
        default="오늘은 정말 힘들었어. 언제쯤 끝날까?",
        help="Target text to synthesize.",
    )
    parser.add_argument(
        "--language",
        default="Korean",
        help="Target language.",
    )
    parser.add_argument(
        "--instruct",
        default="Speak softly, with restrained exhaustion but clear diction.",
        help="Instruction text for the CustomVoice path.",
    )
    parser.add_argument(
        "--speaker",
        default="Sohee",
        help="Stock speaker used for control and borrowed-speaker experiments.",
    )
    parser.add_argument(
        "--output-dir",
        default="test/results/customvoice_clone_from_scratch",
        help="Directory for generated audio and summary JSON.",
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
        help="Subset of strategies to run. Use this to keep heavy experiments sequential and narrow.",
    )
    return parser.parse_args()


def resolve_attention_implementation() -> str:
    """Choose the best available attention backend.

    Returns:
        Transformers attention backend name.
    """

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def load_model(model_path: str) -> Qwen3TTSModel:
    """Load the CustomVoice wrapper.

    Args:
        model_path: Local path or repo id.

    Returns:
        Loaded wrapper.
    """

    use_cuda = torch.cuda.is_available()
    return load_qwen_or_voicebox_model(
        model_path,
        device_map="cuda:0" if use_cuda else "cpu",
        dtype=torch.bfloat16 if use_cuda else torch.float32,
        attn_implementation=resolve_attention_implementation(),
    )


def save_json(path: Path, payload: Any) -> None:
    """Write JSON with UTF-8 and stable formatting.

    Args:
        path: Destination path.
        payload: JSON-serializable object.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def get_stock_speaker_embedding(model: Qwen3TTSModel, speaker: str) -> torch.Tensor:
    """Fetch one stock speaker embedding from the CustomVoice table.

    Args:
        model: Loaded CustomVoice wrapper.
        speaker: Supported speaker name.

    Returns:
        Speaker embedding tensor on the model device.
    """

    spk_id = model.model.config.talker_config.spk_id[speaker.lower()]
    input_dtype = torch.long
    return model.model.talker.get_input_embeddings()(
        torch.tensor(spk_id, device=model.model.talker.device, dtype=input_dtype)
    )


def encode_reference_audio(model: Qwen3TTSModel, ref_audio: str) -> torch.Tensor:
    """Encode the reference audio into codec ids using the CustomVoice tokenizer.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_audio: Reference wav path.

    Returns:
        Codec ids for the first sample.
    """

    normalized = model._normalize_audio_inputs([ref_audio])
    wav, sr = normalized[0]
    encoded = model.model.speech_tokenizer.encode(wav, sr=sr)
    return encoded.audio_codes[0]


def build_ref_ids(model: Qwen3TTSModel, ref_text: str) -> torch.Tensor:
    """Tokenize the reference text in the same assistant format as upstream.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_text: Reference transcript.

    Returns:
        Token ids tensor for the reference text.
    """

    return model._tokenize_texts([model._build_ref_text(ref_text)])[0]


def build_target_ids(model: Qwen3TTSModel, text: str) -> torch.Tensor:
    """Tokenize target text using the standard assistant wrapper.

    Args:
        model: Loaded CustomVoice wrapper.
        text: Text to synthesize.

    Returns:
        Token ids tensor for the target text.
    """

    return model._tokenize_texts([model._build_assistant_text(text)])[0]


def build_instruct_ids(model: Qwen3TTSModel, instruct: str) -> torch.Tensor | None:
    """Tokenize instruction text if provided.

    Args:
        model: Loaded CustomVoice wrapper.
        instruct: Instruction string.

    Returns:
        Token ids tensor or None.
    """

    if not instruct:
        return None
    return model._tokenize_texts([model._build_instruct_text(instruct)])[0]


def pseudo_embedding_from_ref_code(model: Qwen3TTSModel, ref_code: torch.Tensor) -> torch.Tensor:
    """Approximate a speaker embedding from reference codec embeddings.

    This is not an official method. The idea is to project the reference audio
    into the same 2048-dim space that stock CustomVoice speakers already live
    in, using only modules present inside the CustomVoice checkpoint.

    Args:
        model: Loaded CustomVoice wrapper.
        ref_code: Codec ids with shape [T, num_code_groups].

    Returns:
        A single 2048-dim pseudo speaker embedding.
    """

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


def true_embedding_from_ref_audio(model: Qwen3TTSModel, ref_audio: str) -> torch.Tensor | None:
    """Extract a real speaker embedding through the embedded VoiceBox encoder.

    Args:
        model: Loaded wrapper.
        ref_audio: Reference wav path.

    Returns:
        Extracted speaker embedding or None when no encoder is attached.
    """

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
    model: Qwen3TTSModel,
    *,
    text: str,
    language: str,
    instruct: str,
    ref_text: str,
    ref_code: torch.Tensor,
    ref_spk_embedding: torch.Tensor,
    x_vector_only_mode: bool,
    icl_mode: bool,
    output_path: Path,
) -> tuple[bool, str]:
    """Run low-level generation with a hand-built voice_clone_prompt.

    Args:
        model: Loaded CustomVoice wrapper.
        text: Target text.
        language: Target language.
        instruct: Instruction text.
        ref_text: Reference transcript.
        ref_code: Reference codec ids.
        ref_spk_embedding: Speaker-like embedding to inject.
        x_vector_only_mode: Whether to use embedding-only mode.
        icl_mode: Whether to include ICL prompt.
        output_path: Destination wav path.

    Returns:
        Tuple of success flag and short detail string.
    """

    input_ids = [build_target_ids(model, text)]
    instruct_ids = [build_instruct_ids(model, instruct)]
    ref_ids = [build_ref_ids(model, ref_text)]
    voice_clone_prompt = {
        "ref_code": [None if x_vector_only_mode else ref_code],
        "ref_spk_embedding": [ref_spk_embedding],
        "x_vector_only_mode": [x_vector_only_mode],
        "icl_mode": [icl_mode],
    }

    try:
        codes, _ = model.model.generate(
            input_ids=input_ids,
            instruct_ids=instruct_ids,
            ref_ids=ref_ids,
            voice_clone_prompt=voice_clone_prompt,
            languages=[language],
            speakers=[None],
            non_streaming_mode=False,
            max_new_tokens=1024,
            do_sample=True,
            top_k=30,
            top_p=0.95,
            temperature=0.8,
        )
        wavs, fs = model.model.speech_tokenizer.decode([{"audio_codes": codes[0]}])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, wavs[0], fs)
        return True, f"Generated audio at {output_path}"
    except Exception as exc:  # noqa: BLE001 - experiment wants raw failure
        return False, f"{type(exc).__name__}: {exc}"


def cosine_similarity(a: torch.Tensor, b: torch.Tensor) -> float:
    """Compute cosine similarity between two embeddings.

    Args:
        a: First vector.
        b: Second vector.

    Returns:
        Cosine similarity as float.
    """

    a = a.detach().float().view(1, -1)
    b = b.detach().float().view(1, -1)
    return float(F.cosine_similarity(a, b).item())


def run_control_customvoice(
    model: Qwen3TTSModel,
    *,
    text: str,
    language: str,
    instruct: str,
    speaker: str,
    output_path: Path,
) -> StrategyResult:
    """Generate a normal CustomVoice sample for comparison.

    Args:
        model: Loaded wrapper.
        text: Target text.
        language: Target language.
        instruct: Instruction text.
        speaker: Stock speaker name.
        output_path: Destination wav path.

    Returns:
        Strategy result.
    """

    try:
        wavs, fs = model.generate_custom_voice(
            text=text,
            speaker=speaker,
            language=language,
            instruct=instruct,
            max_new_tokens=1024,
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
        return StrategyResult(
            name="control_stock_customvoice",
            ok=False,
            detail=f"{type(exc).__name__}: {exc}",
        )


def main() -> None:
    """Run all manual CustomVoice clone-like strategies and save a summary."""

    args = parse_args()
    output_dir = Path(args.output_dir)
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

    ref_code = encode_reference_audio(model, args.ref_audio)
    stock_embed = get_stock_speaker_embedding(model, args.speaker)
    pseudo_embed = pseudo_embedding_from_ref_code(model, ref_code)
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
                output_path=output_dir / "control_stock_customvoice.wav",
            )
        )

    if "embedded_encoder_only" in selected:
        if embedded_encoder_embed is None:
            results.append(
                StrategyResult(
                    name="embedded_encoder_only",
                    ok=False,
                    detail="speaker_encoder is not attached at runtime.",
                )
            )
        else:
            ok, detail = synthesize_with_manual_prompt(
                model,
                text=args.text,
                language=args.language,
                instruct=args.instruct,
                ref_text=args.ref_text,
                ref_code=ref_code,
                ref_spk_embedding=embedded_encoder_embed,
                x_vector_only_mode=True,
                icl_mode=False,
                output_path=output_dir / "embedded_encoder_only.wav",
            )
            results.append(
                StrategyResult(
                    name="embedded_encoder_only",
                    ok=ok,
                    detail=detail,
                    output_path=str(output_dir / "embedded_encoder_only.wav") if ok else None,
                    transcript_like_text=args.text,
                    similarity_to_stock_speaker=cosine_similarity(embedded_encoder_embed, stock_embed),
                )
            )

    if "embedded_encoder_with_ref_code" in selected:
        if embedded_encoder_embed is None:
            results.append(
                StrategyResult(
                    name="embedded_encoder_with_ref_code",
                    ok=False,
                    detail="speaker_encoder is not attached at runtime.",
                )
            )
        else:
            ok, detail = synthesize_with_manual_prompt(
                model,
                text=args.text,
                language=args.language,
                instruct=args.instruct,
                ref_text=args.ref_text,
                ref_code=ref_code,
                ref_spk_embedding=embedded_encoder_embed,
                x_vector_only_mode=False,
                icl_mode=True,
                output_path=output_dir / "embedded_encoder_with_ref_code.wav",
            )
            results.append(
                StrategyResult(
                    name="embedded_encoder_with_ref_code",
                    ok=ok,
                    detail=detail,
                    output_path=str(output_dir / "embedded_encoder_with_ref_code.wav") if ok else None,
                    transcript_like_text=args.text,
                    similarity_to_stock_speaker=cosine_similarity(embedded_encoder_embed, stock_embed),
                )
            )

    if "borrowed_stock_embed_with_ref_code" in selected:
        ok, detail = synthesize_with_manual_prompt(
            model,
            text=args.text,
            language=args.language,
            instruct=args.instruct,
            ref_text=args.ref_text,
            ref_code=ref_code,
            ref_spk_embedding=stock_embed,
            x_vector_only_mode=False,
            icl_mode=True,
            output_path=output_dir / "borrowed_stock_embed_with_ref_code.wav",
        )
        results.append(
            StrategyResult(
                name="borrowed_stock_embed_with_ref_code",
                ok=ok,
                detail=detail,
                output_path=str(output_dir / "borrowed_stock_embed_with_ref_code.wav") if ok else None,
                transcript_like_text=args.text,
                similarity_to_stock_speaker=1.0,
            )
        )

    if "pseudo_embed_only" in selected:
        ok, detail = synthesize_with_manual_prompt(
            model,
            text=args.text,
            language=args.language,
            instruct=args.instruct,
            ref_text=args.ref_text,
            ref_code=ref_code,
            ref_spk_embedding=pseudo_embed,
            x_vector_only_mode=True,
            icl_mode=False,
            output_path=output_dir / "pseudo_embed_only.wav",
        )
        results.append(
            StrategyResult(
                name="pseudo_embed_only",
                ok=ok,
                detail=detail,
                output_path=str(output_dir / "pseudo_embed_only.wav") if ok else None,
                transcript_like_text=args.text,
                similarity_to_stock_speaker=cosine_similarity(pseudo_embed, stock_embed),
            )
        )

    if "pseudo_embed_with_ref_code" in selected:
        ok, detail = synthesize_with_manual_prompt(
            model,
            text=args.text,
            language=args.language,
            instruct=args.instruct,
            ref_text=args.ref_text,
            ref_code=ref_code,
            ref_spk_embedding=pseudo_embed,
            x_vector_only_mode=False,
            icl_mode=True,
            output_path=output_dir / "pseudo_embed_with_ref_code.wav",
        )
        results.append(
            StrategyResult(
                name="pseudo_embed_with_ref_code",
                ok=ok,
                detail=detail,
                output_path=str(output_dir / "pseudo_embed_with_ref_code.wav") if ok else None,
                transcript_like_text=args.text,
                similarity_to_stock_speaker=cosine_similarity(pseudo_embed, stock_embed),
            )
        )

    payload = {
        "model_path": args.model_path,
        "ref_audio": args.ref_audio,
        "ref_text": args.ref_text,
        "text": args.text,
        "language": args.language,
        "speaker": args.speaker,
        "notes": [
            "This experiment does not use Base.create_voice_clone_prompt or Base.generate_voice_clone.",
            "It still uses the CustomVoice checkpoint's own tokenizer and low-level model.generate path.",
            "A successful result does not automatically mean true reference-speaker cloning succeeded.",
            "If the pseudo embedding stays too close to a stock speaker embedding, the result is better described as a hacky hybrid than real clone support.",
        ],
        "capabilities": {
            "tts_model_type": model.model.tts_model_type,
            "speaker_encoder_present": model.model.speaker_encoder is not None,
            "supported_speakers": model.get_supported_speakers(),
            "pseudo_vs_stock_similarity": cosine_similarity(pseudo_embed, stock_embed),
            "embedded_vs_stock_similarity": None
            if embedded_encoder_embed is None
            else cosine_similarity(embedded_encoder_embed, stock_embed),
        },
        "results": [asdict(item) for item in results],
    }
    save_json(output_dir / "summary.json", payload)


if __name__ == "__main__":
    main()
