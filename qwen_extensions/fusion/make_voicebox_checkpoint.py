#!/usr/bin/env python3
"""Create a self-contained VoiceBox checkpoint from plain CustomVoice + Base."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from safetensors.torch import load_file, save_file


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for VoiceBox checkpoint conversion."""

    parser = argparse.ArgumentParser(description="Create a self-contained VoiceBox checkpoint.")
    parser.add_argument("--input-checkpoint", required=True, help="Plain CustomVoice checkpoint directory.")
    parser.add_argument("--speaker-encoder-source", required=True, help="Base 1.7B checkpoint directory.")
    parser.add_argument("--output-checkpoint", required=True, help="Destination VoiceBox checkpoint directory.")
    return parser.parse_args()


def load_config(path: Path) -> dict:
    """Load a checkpoint config JSON."""

    return json.loads(path.read_text(encoding="utf-8"))


def sanitize_speaker_encoder_config(config_dict: dict | None) -> dict | None:
    """Keep only keys accepted by Qwen3TTSSpeakerEncoderConfig."""

    if config_dict is None:
        return None
    allowed_keys = {
        "mel_dim",
        "enc_dim",
        "enc_channels",
        "enc_kernel_sizes",
        "enc_dilations",
        "enc_attention_channels",
        "enc_res2net_scale",
        "enc_se_channels",
        "sample_rate",
    }
    return {key: value for key, value in dict(config_dict).items() if key in allowed_keys}


def main() -> None:
    """Copy a plain CustomVoice checkpoint and embed speaker_encoder weights."""

    args = parse_args()
    input_checkpoint = Path(args.input_checkpoint).resolve()
    speaker_source = Path(args.speaker_encoder_source).resolve()
    output_checkpoint = Path(args.output_checkpoint).resolve()

    if not input_checkpoint.exists():
        raise SystemExit(f"Input checkpoint not found: {input_checkpoint}")
    if not speaker_source.exists():
        raise SystemExit(f"Speaker encoder source not found: {speaker_source}")

    if output_checkpoint.exists():
        shutil.rmtree(output_checkpoint)
    shutil.copytree(input_checkpoint, output_checkpoint)

    state_dict = load_file(str(output_checkpoint / "model.safetensors"))
    speaker_source_state = load_file(str(speaker_source / "model.safetensors"))
    speaker_encoder_state = {k: v for k, v in speaker_source_state.items() if k.startswith("speaker_encoder.")}
    if not speaker_encoder_state:
        raise SystemExit(f"No speaker_encoder weights found in {speaker_source}")

    state_dict.update(speaker_encoder_state)
    save_file(state_dict, str(output_checkpoint / "model.safetensors"))

    config = load_config(output_checkpoint / "config.json")
    source_config = load_config(speaker_source / "config.json")
    config["tts_model_type"] = "custom_voice"
    config["demo_model_family"] = "voicebox"
    config["speaker_encoder_included"] = True
    config["speaker_encoder_source_model_path"] = str(speaker_source)
    config["speaker_encoder_config"] = sanitize_speaker_encoder_config(source_config.get("speaker_encoder_config"))
    (output_checkpoint / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"VoiceBox checkpoint written to: {output_checkpoint}")


if __name__ == "__main__":
    main()
