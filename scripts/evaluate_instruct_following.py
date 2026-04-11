"""Evaluate instruct-following behavior for Qwen3-TTS custom voice checkpoints.

This script generates the same text with multiple instruct prompts, transcribes
the results with local Whisper, and reports simple acoustic metrics so we can
compare whether a fine-tuned checkpoint still reacts to instruct changes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from transformers import pipeline


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for instruct-following evaluation.

    Returns:
        Parsed CLI namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", default="ja")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--whisper-model", required=True)
    return parser.parse_args()


def load_qwen_model(model_path: str):
    """Load a Qwen3-TTS model from a local checkpoint.

    Args:
        model_path: Local checkpoint directory.

    Returns:
        Loaded Qwen3TTSModel instance.
    """

    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "Qwen3-TTS"))
    from qwen_tts import Qwen3TTSModel

    return Qwen3TTSModel.from_pretrained(
        model_path,
        dtype=torch.bfloat16,
        device_map="cuda:0",
        attn_implementation="sdpa",
    )


def build_transcriber(model_path: str):
    """Create a Whisper transcription pipeline.

    Args:
        model_path: Local Whisper model directory.

    Returns:
        Configured ASR pipeline.
    """

    asr = pipeline(
        task="automatic-speech-recognition",
        model=model_path,
        device=0,
        dtype=torch.float16,
    )
    if hasattr(asr, "model") and hasattr(asr.model, "generation_config"):
        generation_config = asr.model.generation_config
        if hasattr(generation_config, "forced_decoder_ids"):
            generation_config.forced_decoder_ids = None
    return asr


def summarize_audio(audio_path: Path) -> dict[str, float]:
    """Compute lightweight acoustic metrics for one generated wav.

    Args:
        audio_path: Wave file to summarize.

    Returns:
        Mapping of metric names to numeric values.
    """

    waveform, sample_rate = librosa.load(audio_path, sr=None)
    return {
        "duration_sec": float(len(waveform) / sample_rate),
        "rms": float(np.sqrt(np.mean(np.square(waveform)))),
        "spectral_centroid": float(np.mean(librosa.feature.spectral_centroid(y=waveform, sr=sample_rate))),
        "zcr": float(np.mean(librosa.feature.zero_crossing_rate(waveform))),
    }


def main() -> None:
    """Generate multi-instruct samples and save a JSON summary."""

    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompts = {
        "neutral": "自然で落ち着いた口調で読んでください。",
        "angry": "かなり怒っていて、語尾を強く、早口気味に読んでください。",
        "gentle": "とても優しく、落ち着いて、相手を慰めるように読んでください。",
    }

    tts = load_qwen_model(args.model_path)
    asr = build_transcriber(args.whisper_model)
    results: list[dict[str, object]] = []

    for prompt_name, instruct in prompts.items():
        wavs, sample_rate = tts.generate_custom_voice(
            text=args.text,
            language=args.language,
            speaker=args.speaker,
            instruct=instruct,
        )
        output_path = output_dir / f"{args.label}_{prompt_name}.wav"
        sf.write(output_path, np.asarray(wavs[0], dtype=np.float32), sample_rate)

        metrics = summarize_audio(output_path)
        transcript = asr(str(output_path), generate_kwargs={"task": "transcribe"})["text"].strip()

        item = {
            "label": args.label,
            "model_path": args.model_path,
            "speaker": args.speaker,
            "prompt": prompt_name,
            "instruct": instruct,
            "text": args.text,
            "language": args.language,
            "audio_path": str(output_path),
            "transcript": transcript,
            **metrics,
        }
        results.append(item)
        print(json.dumps(item, ensure_ascii=False))

    summary_path = output_dir / f"{args.label}_summary.json"
    summary_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved_summary={summary_path}")


if __name__ == "__main__":
    main()
