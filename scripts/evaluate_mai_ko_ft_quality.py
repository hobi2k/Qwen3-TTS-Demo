#!/usr/bin/env python3
"""Evaluate mai_ko fine-tuned checkpoints for timbre reflection and instruct following.

This script is intentionally kept outside the upstream Qwen3-TTS repository.
It checks two things for both the Base FT export and the CustomVoice FT export:

1. Whether the generated voice stays close to the dataset reference timbre.
2. Whether the model keeps the spoken text while reacting to instruct prompts.

The report is written under ``data/generated/mai-ko-ft-quality`` so the audio,
JSON, and Markdown summary stay together for manual listening review.
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
from transformers import AutoConfig, pipeline


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "Qwen3-TTS"))

from qwen_tts import Qwen3TTSModel  # noqa: E402
from qwen_tts.core.models.configuration_qwen3_tts import Qwen3TTSConfig  # noqa: E402
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSSpeakerEncoder  # noqa: E402


DEFAULT_OUTPUT_ROOT = REPO_ROOT / "data" / "generated" / "mai-ko-ft-quality"
DEFAULT_REFERENCE_AUDIO = REPO_ROOT / "data" / "datasets" / "mai_ko_full" / "audio" / "00000.wav"
DEFAULT_REFERENCE_TEXT = "그래서 말인데, 올해는 요괴도 인간도 함께 즐길 수 있게 「미카와 축제」를 제대로 열어보려고"
DEFAULT_EVAL_TEXT = "오늘은 정말 힘들었어. 언제쯤 끝날까?"
DEFAULT_LANGUAGE = "Korean"
DEFAULT_WHISPER = REPO_ROOT / "data" / "models" / "whisper-large-v3"
DEFAULT_SPEAKER_ENCODER_SOURCE = REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base"


@dataclass
class EvaluationRow:
    """One generated sample with transcript, timbre, and acoustic statistics."""

    suite: str
    variant: str
    model_path: str
    speaker: str | None
    prompt_name: str
    instruct: str
    mode: str
    audio_path: str
    transcript: str
    transcript_similarity: float
    speaker_similarity: float
    duration_sec: float
    rms: float
    spectral_centroid: float
    zcr: float


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the quality evaluation run.

    Returns:
        Parsed command-line namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-audio", default=str(DEFAULT_REFERENCE_AUDIO))
    parser.add_argument("--reference-text", default=DEFAULT_REFERENCE_TEXT)
    parser.add_argument("--text", default=DEFAULT_EVAL_TEXT)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--speaker", default="mai")
    parser.add_argument("--whisper-model", default=str(DEFAULT_WHISPER))
    parser.add_argument("--speaker-encoder-source", default=str(DEFAULT_SPEAKER_ENCODER_SOURCE))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--suite", choices=["base_ft", "customvoice_ft", "all"], default="all")
    return parser.parse_args()


def runtime_dtype() -> tuple[str, torch.dtype]:
    """Pick a device string and dtype for local generation.

    Returns:
        Pair of device map string and torch dtype.
    """

    if torch.cuda.is_available():
        return "cuda:0", torch.bfloat16
    if sys.platform == "darwin" and torch.backends.mps.is_available():
        return "mps", torch.float32
    return "cpu", torch.float32


def attention_backend() -> str:
    """Choose the best available attention backend for this machine.

    Returns:
        Attention backend name for ``Qwen3TTSModel.from_pretrained``.
    """

    if not torch.cuda.is_available():
        return "sdpa"
    if importlib.util.find_spec("flash_attn") is not None:
        return "flash_attention_2"
    return "sdpa"


def load_qwen_model(model_path: str) -> Qwen3TTSModel:
    """Load one TTS model checkpoint.

    Args:
        model_path: Local model directory.

    Returns:
        Ready-to-generate Qwen3TTSModel.
    """

    device_map, dtype = runtime_dtype()
    return Qwen3TTSModel.from_pretrained(
        model_path,
        dtype=dtype,
        device_map=device_map,
        attn_implementation=attention_backend(),
    )


def build_transcriber(model_path: str):
    """Create a local Whisper transcription pipeline.

    Args:
        model_path: Local Whisper model directory.

    Returns:
        Configured automatic speech recognition pipeline.
    """

    device = 0 if torch.cuda.is_available() else -1
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    asr = pipeline(
        task="automatic-speech-recognition",
        model=model_path,
        device=device,
        dtype=dtype,
    )
    if hasattr(asr, "model") and hasattr(asr.model, "generation_config"):
        generation_config = asr.model.generation_config
        if hasattr(generation_config, "forced_decoder_ids"):
            generation_config.forced_decoder_ids = None
    return asr


def load_speaker_encoder(model_path: str) -> Qwen3TTSSpeakerEncoder:
    """Load the speaker encoder from a model checkpoint that includes it.

    Args:
        model_path: Local checkpoint directory with ``speaker_encoder.*`` weights.

    Returns:
        Standalone speaker encoder module.
    """

    AutoConfig.register("qwen3_tts", Qwen3TTSConfig)
    config = AutoConfig.from_pretrained(model_path)
    speaker_encoder = Qwen3TTSSpeakerEncoder(config.speaker_encoder_config)
    state_dict = load_file(str(Path(model_path) / "model.safetensors"))
    speaker_state = {
        key.removeprefix("speaker_encoder."): value
        for key, value in state_dict.items()
        if key.startswith("speaker_encoder.")
    }
    if not speaker_state:
        raise RuntimeError(f"No speaker_encoder weights were found in {model_path}")

    device_map, dtype = runtime_dtype()
    speaker_encoder.load_state_dict(speaker_state)
    speaker_encoder = speaker_encoder.to(device=device_map, dtype=dtype)
    speaker_encoder.eval()
    return speaker_encoder


def normalize_text(value: str) -> str:
    """Normalize text before computing simple transcript similarity.

    Args:
        value: Raw text or transcript.

    Returns:
        Whitespace-flattened normalized text.
    """

    keep = "".join(ch for ch in value.lower().strip() if ch.isalnum() or ch.isspace())
    return " ".join(keep.split())


def transcript_similarity(expected: str, actual: str) -> float:
    """Compute a normalized similarity score between target and transcript.

    Args:
        expected: Intended text.
        actual: Whisper transcript.

    Returns:
        ``0.0`` to ``1.0`` similarity ratio.
    """

    from difflib import SequenceMatcher

    return float(SequenceMatcher(None, normalize_text(expected), normalize_text(actual)).ratio())


def summarize_audio(audio_path: Path) -> dict[str, float]:
    """Compute lightweight acoustic metrics for a generated wav.

    Args:
        audio_path: Wave file to summarize.

    Returns:
        Numeric acoustic metrics used to compare prompt reactions.
    """

    waveform, sample_rate = librosa.load(audio_path, sr=None)
    return {
        "duration_sec": float(len(waveform) / sample_rate),
        "rms": float(np.sqrt(np.mean(np.square(waveform)))),
        "spectral_centroid": float(np.mean(librosa.feature.spectral_centroid(y=waveform, sr=sample_rate))),
        "zcr": float(np.mean(librosa.feature.zero_crossing_rate(waveform))),
    }


def load_audio_24k(audio_path: Path) -> np.ndarray:
    """Load one wav file as 24 kHz mono float audio.

    Args:
        audio_path: Audio file path.

    Returns:
        Resampled mono waveform.
    """

    waveform, _ = librosa.load(audio_path, sr=24000, mono=True)
    return waveform.astype(np.float32)


def cosine_similarity(left: torch.Tensor, right: torch.Tensor) -> float:
    """Compute cosine similarity for two embedding vectors.

    Args:
        left: First embedding.
        right: Second embedding.

    Returns:
        Cosine similarity score.
    """

    left = left.float()
    right = right.float()
    denominator = torch.norm(left) * torch.norm(right)
    if float(denominator) == 0.0:
        return 0.0
    return float(torch.dot(left, right) / denominator)


def compute_speaker_similarity(
    speaker_encoder: Qwen3TTSSpeakerEncoder,
    reference_audio: Path,
    candidate_audio: Path,
) -> float:
    """Compare a generated sample to the dataset reference timbre.

    Args:
        speaker_encoder: Standalone speaker encoder module.
        reference_audio: Dataset reference audio.
        candidate_audio: Generated audio file.

    Returns:
        Cosine similarity between reference and candidate speaker embeddings.
    """

    device = next(speaker_encoder.parameters()).device
    dtype = next(speaker_encoder.parameters()).dtype

    def to_embedding(audio_path: Path) -> torch.Tensor:
        waveform = load_audio_24k(audio_path)
        from qwen_tts.core.models.modeling_qwen3_tts import mel_spectrogram  # noqa: WPS433

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
            return speaker_encoder(mel.to(device=device, dtype=dtype))[0].detach().cpu()

    return cosine_similarity(to_embedding(reference_audio), to_embedding(candidate_audio))


def prompt_pack() -> list[tuple[str, str]]:
    """Return a fixed instruct set with clearly separated emotional targets.

    Returns:
        Prompt-name and instruct string pairs.
    """

    return [
        ("neutral", "자연스럽고 담담하게, 또박또박 읽어주세요."),
        (
            "breathy_feminine",
            "숨결이 느껴지는 breathy한 톤으로, 살짝 female mannering을 섞어 가까이 속삭이듯 읽어주세요.",
        ),
        (
            "furious",
            "감정을 크게 끌어올려 화가 난 상태로, 강하게 몰아붙이듯 빠르고 세게 읽어주세요.",
        ),
        (
            "cold_detached",
            "차갑고 감정을 눌러 담은 말투로, 거리를 두듯 절제해서 읽어주세요.",
        ),
    ]


def variant_map() -> dict[str, list[dict[str, str]]]:
    """Define the model variants to evaluate for both FT lines.

    Returns:
        Mapping from suite name to ordered variants.
    """

    return {
        "base_ft": [
            {
                "variant": "stock-base-clone",
                "model_path": str(REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-Base"),
                "mode": "voice_clone",
                "speaker": "",
            },
            {
                "variant": "base-ft-epoch-0",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-0"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
            {
                "variant": "base-ft-epoch-1",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-1"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
            {
                "variant": "base-ft-epoch-2",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_base17b_full" / "checkpoint-epoch-2"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
        ],
        "customvoice_ft": [
            {
                "variant": "stock-customvoice",
                "model_path": str(REPO_ROOT / "data" / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice"),
                "mode": "custom_voice",
                "speaker": "Sohee",
            },
            {
                "variant": "customvoice-ft-epoch-0",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-0"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
            {
                "variant": "customvoice-ft-epoch-1",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-1"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
            {
                "variant": "customvoice-ft-epoch-2",
                "model_path": str(REPO_ROOT / "data" / "finetune-runs" / "mai_ko_customvoice17b_full" / "checkpoint-epoch-2"),
                "mode": "custom_voice",
                "speaker": "mai",
            },
        ],
    }


def save_audio(output_path: Path, waveform: np.ndarray, sample_rate: int) -> None:
    """Write one generated waveform and ensure parent directories exist.

    Args:
        output_path: Destination wav path.
        waveform: Generated audio samples.
        sample_rate: Output sampling rate.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, np.asarray(waveform, dtype=np.float32), sample_rate)


def run_variant(
    tts: Qwen3TTSModel,
    *,
    variant: dict[str, str],
    output_dir: Path,
    text: str,
    language: str,
    reference_audio: Path,
    reference_text: str,
    prompts: list[tuple[str, str]],
    transcriber: Any,
    speaker_encoder: Qwen3TTSSpeakerEncoder,
    suite: str,
) -> list[EvaluationRow]:
    """Generate and score all prompt variants for one model checkpoint.

    Args:
        tts: Loaded TTS model.
        variant: Variant description.
        output_dir: Run output directory.
        text: Target spoken text.
        language: Language label.
        reference_audio: Dataset reference audio.
        reference_text: Transcript for stock Base clone reference.
        prompts: Instruct prompts to test.
        transcriber: Whisper pipeline.
        speaker_encoder: Speaker encoder for timbre similarity.
        suite: Suite name such as ``base_ft`` or ``customvoice_ft``.

    Returns:
        Result rows for this model variant.
    """

    rows: list[EvaluationRow] = []

    for prompt_name, instruct in prompts:
        if variant["mode"] == "voice_clone":
            wavs, sample_rate = tts.generate_voice_clone(
                text=text,
                ref_audio=[(load_audio_24k(reference_audio), 24000)],
                ref_text=reference_text,
                language=language,
            )
        else:
            wavs, sample_rate = tts.generate_custom_voice(
                text=text,
                language=language,
                speaker=variant["speaker"],
                instruct=instruct,
            )

        output_path = output_dir / suite / variant["variant"] / f"{prompt_name}.wav"
        save_audio(output_path, np.asarray(wavs[0], dtype=np.float32), sample_rate)

        transcript = str(transcriber(str(output_path), generate_kwargs={"task": "transcribe"})["text"]).strip()
        metrics = summarize_audio(output_path)
        similarity = compute_speaker_similarity(speaker_encoder, reference_audio, output_path)

        rows.append(
            EvaluationRow(
                suite=suite,
                variant=variant["variant"],
                model_path=variant["model_path"],
                speaker=variant["speaker"] or None,
                prompt_name=prompt_name,
                instruct=instruct if variant["mode"] == "custom_voice" else "",
                mode=variant["mode"],
                audio_path=str(output_path.relative_to(REPO_ROOT)),
                transcript=transcript,
                transcript_similarity=transcript_similarity(text, transcript),
                speaker_similarity=similarity,
                duration_sec=metrics["duration_sec"],
                rms=metrics["rms"],
                spectral_centroid=metrics["spectral_centroid"],
                zcr=metrics["zcr"],
            )
        )

    return rows


def aggregate_rows(rows: list[EvaluationRow]) -> dict[str, Any]:
    """Summarize rows into a compact verdict-friendly dictionary.

    Args:
        rows: Detailed row records.

    Returns:
        JSON-serializable nested summary.
    """

    summary: dict[str, Any] = {}
    for suite in sorted({row.suite for row in rows}):
        suite_rows = [row for row in rows if row.suite == suite]
        variants: dict[str, Any] = {}
        for variant in sorted({row.variant for row in suite_rows}):
            variant_rows = [row for row in suite_rows if row.variant == variant]
            prompt_rows = {row.prompt_name: row for row in variant_rows}
            neutral_similarity = prompt_rows["neutral"].speaker_similarity
            mean_transcript_similarity = float(np.mean([row.transcript_similarity for row in variant_rows]))
            instruction_spread = {
                "duration_range_sec": float(
                    max(row.duration_sec for row in variant_rows) - min(row.duration_sec for row in variant_rows)
                ),
                "rms_range": float(max(row.rms for row in variant_rows) - min(row.rms for row in variant_rows)),
                "centroid_range": float(
                    max(row.spectral_centroid for row in variant_rows)
                    - min(row.spectral_centroid for row in variant_rows)
                ),
            }
            variants[variant] = {
                "mode": variant_rows[0].mode,
                "speaker": variant_rows[0].speaker,
                "neutral_speaker_similarity": neutral_similarity,
                "mean_speaker_similarity": float(np.mean([row.speaker_similarity for row in variant_rows])),
                "mean_transcript_similarity": mean_transcript_similarity,
                "instruction_spread": instruction_spread,
                "rows": [asdict(row) for row in variant_rows],
            }
        summary[suite] = variants
    return summary


def markdown_report(summary: dict[str, Any]) -> str:
    """Render a human-readable Markdown summary.

    Args:
        summary: Aggregated summary dictionary.

    Returns:
        Markdown report text.
    """

    lines = [
        "# mai_ko Fine-Tuned Voice Quality Evaluation",
        "",
        "검수 기준:",
        "- 데이터셋 음색 반영: `neutral_speaker_similarity`와 `mean_speaker_similarity`가 stock 대비 높아지는지 확인",
        "- instruct 준수: `mean_transcript_similarity`가 유지되면서 prompt별 duration/rms/centroid 변화가 생기는지 확인",
        "",
    ]

    for suite, variants in summary.items():
        lines.append(f"## {suite}")
        lines.append("")
        lines.append("| variant | neutral speaker sim | mean speaker sim | mean transcript sim | duration range | rms range | centroid range |")
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
        for variant, item in variants.items():
            spread = item["instruction_spread"]
            lines.append(
                "| "
                f"{variant} | "
                f"{item['neutral_speaker_similarity']:.4f} | "
                f"{item['mean_speaker_similarity']:.4f} | "
                f"{item['mean_transcript_similarity']:.4f} | "
                f"{spread['duration_range_sec']:.4f} | "
                f"{spread['rms_range']:.6f} | "
                f"{spread['centroid_range']:.4f} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def unload_model(model: Qwen3TTSModel | None) -> None:
    """Release model memory between variants.

    Args:
        model: Model instance to release.
    """

    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def main() -> None:
    """Run the full timbre and instruct quality evaluation for mai_ko FT models."""

    args = parse_args()
    output_root = Path(args.output_root) / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_root.mkdir(parents=True, exist_ok=True)

    transcriber = build_transcriber(args.whisper_model)
    speaker_encoder = load_speaker_encoder(args.speaker_encoder_source)
    prompts = prompt_pack()

    all_rows: list[EvaluationRow] = []
    selected = variant_map()
    if args.suite != "all":
        selected = {args.suite: selected[args.suite]}

    for suite, variants in selected.items():
        for variant in variants:
            model = load_qwen_model(variant["model_path"])
            try:
                rows = run_variant(
                    model,
                    variant=variant,
                    output_dir=output_root,
                    text=args.text,
                    language=args.language,
                    reference_audio=Path(args.reference_audio),
                    reference_text=args.reference_text,
                    prompts=prompts,
                    transcriber=transcriber,
                    speaker_encoder=speaker_encoder,
                    suite=suite,
                )
                all_rows.extend(rows)
                for row in rows:
                    print(json.dumps(asdict(row), ensure_ascii=False))
            finally:
                unload_model(model)

    summary = aggregate_rows(all_rows)
    (output_root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_root / "summary.md").write_text(markdown_report(summary), encoding="utf-8")
    print(f"saved_summary={output_root / 'summary.json'}")


if __name__ == "__main__":
    main()
