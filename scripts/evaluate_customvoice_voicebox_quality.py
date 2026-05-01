#!/usr/bin/env python3
"""Compare plain CustomVoice FT and converted VoiceBox quality.

The evaluator is intentionally scoped to the current MAI workflow:

* load one checkpoint at a time to avoid WSL/GPU contention;
* generate the same text with the same instruction prompts;
* compare generated timbre to a dataset reference via Qwen's speaker encoder;
* write audio, JSON, and Markdown into one timestamped report folder.
"""

from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf
import torch
from safetensors.torch import load_file
from transformers import AutoConfig


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "vendor" / "Qwen3-TTS"))
sys.path.insert(0, str(REPO_ROOT / "vendor" / "Qwen3-TTS" / "inference" / "voicebox"))

from qwen_tts.core.models.configuration_qwen3_tts import Qwen3TTSConfig  # noqa: E402
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSSpeakerEncoder, mel_spectrogram  # noqa: E402
from runtime import load_qwen_or_voicebox_model  # noqa: E402


DEFAULT_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_REFERENCE_AUDIO = REPO_ROOT / "data" / "datasets" / "mai_ko_full" / "audio" / "00000.wav"
DEFAULT_SPEAKER_ENCODER = REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base"
DEFAULT_PLAIN = REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "final"
DEFAULT_VOICEBOX = REPO_ROOT / "data" / "finetune-runs" / "mai_ko_voicebox17b_full" / "final"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "generated" / "plain-vs-voicebox-quality"


@dataclass
class QualityRow:
    """One generated sample and its objective comparison metrics."""

    variant: str
    model_path: str
    prompt_name: str
    instruct: str
    audio_path: str
    duration_sec: float
    rms: float
    peak: float
    spectral_centroid: float
    zcr: float
    speaker_similarity: float


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the quality comparison."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--plain-model", default=str(DEFAULT_PLAIN))
    parser.add_argument("--voicebox-model", default=str(DEFAULT_VOICEBOX))
    parser.add_argument("--speaker-encoder-source", default=str(DEFAULT_SPEAKER_ENCODER))
    parser.add_argument("--reference-audio", default=str(DEFAULT_REFERENCE_AUDIO))
    parser.add_argument("--speaker", default="mai")
    parser.add_argument("--language", default="Korean")
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def prompts() -> list[tuple[str, str]]:
    """Return instruction prompts with intentionally different targets."""

    return [
        ("neutral", "Natural Korean female voice, calm and conversational."),
        (
            "breathy_soft",
            "Soft breathy Korean female voice, close to the microphone, tired but gentle.",
        ),
        (
            "furious",
            "Angry and emotionally heightened Korean female voice, faster and sharper delivery.",
        ),
        (
            "cold_detached",
            "Cold detached Korean female voice, restrained emotion and slower deliberate pacing.",
        ),
    ]


def runtime() -> tuple[str, torch.dtype]:
    """Return device and dtype for Qwen generation."""

    if torch.cuda.is_available():
        return "cuda:0", torch.bfloat16
    return "cpu", torch.float32


def attention_backend() -> str:
    """Use FlashAttention on CUDA when installed, otherwise SDPA."""

    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def load_audio_24k(path: Path) -> np.ndarray:
    """Load mono 24 kHz audio for speaker encoder scoring."""

    waveform, _ = librosa.load(path, sr=24000, mono=True)
    return waveform.astype(np.float32)


def load_speaker_encoder(path: Path) -> Qwen3TTSSpeakerEncoder:
    """Load Qwen's speaker encoder from the Base checkpoint."""

    AutoConfig.register("qwen3_tts", Qwen3TTSConfig)
    config = AutoConfig.from_pretrained(str(path))
    encoder = Qwen3TTSSpeakerEncoder(config.speaker_encoder_config)
    state = load_file(str(path / "model.safetensors"))
    speaker_state = {
        key.removeprefix("speaker_encoder."): value
        for key, value in state.items()
        if key.startswith("speaker_encoder.")
    }
    if not speaker_state:
        raise RuntimeError(f"No speaker_encoder tensors found in {path}")
    device, dtype = runtime()
    encoder.load_state_dict(speaker_state)
    encoder = encoder.to(device=device, dtype=dtype)
    encoder.eval()
    return encoder


def speaker_embedding(encoder: Qwen3TTSSpeakerEncoder, audio_path: Path) -> torch.Tensor:
    """Extract one speaker embedding from a wav file."""

    device = next(encoder.parameters()).device
    dtype = next(encoder.parameters()).dtype
    waveform = load_audio_24k(audio_path)
    mel = mel_spectrogram(
        torch.from_numpy(waveform).unsqueeze(0),
        n_fft=1024,
        num_mels=128,
        sampling_rate=24000,
        hop_size=256,
        win_size=1024,
        fmin=0,
        fmax=12000,
    ).transpose(1, 2)
    with torch.inference_mode():
        return encoder(mel.to(device=device, dtype=dtype))[0].detach().cpu().float()


def cosine(left: torch.Tensor, right: torch.Tensor) -> float:
    """Return cosine similarity for two vectors."""

    denom = torch.norm(left) * torch.norm(right)
    if float(denom) == 0.0:
        return 0.0
    return float(torch.dot(left, right) / denom)


def summarize_audio(path: Path) -> dict[str, float]:
    """Compute lightweight acoustic metrics for one generated wav."""

    waveform, sample_rate = librosa.load(path, sr=None, mono=True)
    if len(waveform) == 0:
        return {"duration_sec": 0.0, "rms": 0.0, "peak": 0.0, "spectral_centroid": 0.0, "zcr": 0.0}
    return {
        "duration_sec": float(len(waveform) / sample_rate),
        "rms": float(np.sqrt(np.mean(np.square(waveform)))),
        "peak": float(np.max(np.abs(waveform))),
        "spectral_centroid": float(np.mean(librosa.feature.spectral_centroid(y=waveform, sr=sample_rate))),
        "zcr": float(np.mean(librosa.feature.zero_crossing_rate(waveform))),
    }


def unload_model(model: Any) -> None:
    """Release model memory before loading the next checkpoint."""

    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def generate_variant(
    *,
    variant: str,
    model_path: Path,
    speaker: str,
    language: str,
    text: str,
    seed: int,
    output_root: Path,
) -> list[Path]:
    """Generate all prompt samples for one checkpoint."""

    device, dtype = runtime()
    model = load_qwen_or_voicebox_model(
        str(model_path),
        device_map=device,
        dtype=dtype,
        attn_implementation=attention_backend(),
    )
    output_paths: list[Path] = []
    try:
        for prompt_name, instruct in prompts():
            wavs, sample_rate = model.generate_custom_voice(
                text=text,
                speaker=speaker,
                language=language,
                instruct=instruct,
                seed=seed,
            )
            output_path = output_root / variant / f"{prompt_name}.wav"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            sf.write(output_path, np.asarray(wavs[0], dtype=np.float32), sample_rate)
            output_paths.append(output_path)
            print(f"generated {variant}/{prompt_name}: {output_path}")
    finally:
        unload_model(model)
    return output_paths


def aggregate(rows: list[QualityRow]) -> dict[str, Any]:
    """Aggregate row metrics by model variant."""

    summary: dict[str, Any] = {}
    for variant in sorted({row.variant for row in rows}):
        subset = [row for row in rows if row.variant == variant]
        summary[variant] = {
            "mean_speaker_similarity": float(np.mean([row.speaker_similarity for row in subset])),
            "neutral_speaker_similarity": next(row.speaker_similarity for row in subset if row.prompt_name == "neutral"),
            "duration_range_sec": float(max(row.duration_sec for row in subset) - min(row.duration_sec for row in subset)),
            "rms_range": float(max(row.rms for row in subset) - min(row.rms for row in subset)),
            "centroid_range": float(max(row.spectral_centroid for row in subset) - min(row.spectral_centroid for row in subset)),
            "rows": [asdict(row) for row in subset],
        }
    return summary


def markdown(summary: dict[str, Any]) -> str:
    """Render a compact Markdown quality report."""

    lines = [
        "# Plain CustomVoice vs VoiceBox Quality",
        "",
        "| variant | neutral speaker sim | mean speaker sim | duration range | rms range | centroid range |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for variant, item in summary.items():
        lines.append(
            "| "
            f"{variant} | "
            f"{item['neutral_speaker_similarity']:.4f} | "
            f"{item['mean_speaker_similarity']:.4f} | "
            f"{item['duration_range_sec']:.4f} | "
            f"{item['rms_range']:.6f} | "
            f"{item['centroid_range']:.4f} |"
        )
    lines.append("")
    lines.append("Generated samples are under each variant folder. Speaker similarity is cosine similarity")
    lines.append("against the MAI dataset reference audio using the Base 1.7B speaker encoder.")
    return "\n".join(lines) + "\n"


def main() -> None:
    """Run generation and scoring for plain CustomVoice and VoiceBox."""

    args = parse_args()
    base_output_root = Path(args.output_root)
    if not base_output_root.is_absolute():
        base_output_root = REPO_ROOT / base_output_root
    output_root = (base_output_root / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    variants = [
        ("plain_customvoice", Path(args.plain_model)),
        ("voicebox", Path(args.voicebox_model)),
    ]
    generated: dict[str, list[Path]] = {}
    for variant, model_path in variants:
        generated[variant] = generate_variant(
            variant=variant,
            model_path=model_path,
            speaker=args.speaker,
            language=args.language,
            text=args.text,
            seed=args.seed,
            output_root=output_root,
        )

    encoder = load_speaker_encoder(Path(args.speaker_encoder_source))
    reference_embedding = speaker_embedding(encoder, Path(args.reference_audio))
    rows: list[QualityRow] = []
    prompt_map = dict(prompts())
    model_paths = dict(variants)
    for variant, paths in generated.items():
        for path in paths:
            prompt_name = path.stem
            metrics = summarize_audio(path)
            candidate_embedding = speaker_embedding(encoder, path)
            rows.append(
                QualityRow(
                    variant=variant,
                    model_path=str(model_paths[variant]),
                    prompt_name=prompt_name,
                    instruct=prompt_map[prompt_name],
                    audio_path=str(path.resolve().relative_to(REPO_ROOT)),
                    speaker_similarity=cosine(reference_embedding, candidate_embedding),
                    **metrics,
                )
            )

    summary = aggregate(rows)
    (output_root / "rows.json").write_text(
        json.dumps([asdict(row) for row in rows], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_root / "summary.md").write_text(markdown(summary), encoding="utf-8")
    print(f"saved_summary={output_root / 'summary.json'}")
    print(markdown(summary))


if __name__ == "__main__":
    main()
