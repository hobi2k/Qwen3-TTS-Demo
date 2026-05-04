#!/usr/bin/env python3
"""Create a persistent VoiceBox speaker by morphing a stock speaker row.

This feature is intentionally separate from clone-prompt inference. Clone
prompt generation combines reference codec ids and a speaker embedding at
runtime; this script writes a new speaker row into a copied checkpoint so the
speaker can be selected later by name.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
from safetensors.torch import load_file, save_file


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
UPSTREAM_ROOT = REPO_ROOT / "vendor" / "Qwen3-TTS"
if not UPSTREAM_ROOT.exists() and (SCRIPT_PATH.parents[1] / "qwen_tts").exists():
    UPSTREAM_ROOT = SCRIPT_PATH.parents[1]
    REPO_ROOT = Path.cwd()

sys.path.insert(0, str(UPSTREAM_ROOT))

from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402


SPEAKER_WEIGHT_KEY = "talker.model.codec_embedding.weight"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(description="Create a persistent morphed VoiceBox speaker checkpoint.")
    parser.add_argument("--model-path", required=True, help="Local VoiceBox checkpoint directory to update or copy.")
    parser.add_argument("--output-model-path", default="", help="Directory where a copied checkpoint is written.")
    parser.add_argument(
        "--update-in-place",
        action="store_true",
        help="Add the speaker row to --model-path directly instead of creating a copied checkpoint.",
    )
    parser.add_argument("--target-speaker", required=True, help="New speaker name, e.g. kangsora.")
    parser.add_argument("--language", default="Korean", help="Target language used when --anchor-speaker is auto.")
    parser.add_argument(
        "--anchor-speaker",
        default="auto",
        help="Existing language-native speaker to copy from. Use auto to resolve from --language.",
    )
    parser.add_argument("--ref-audio", default="", help="Reference audio used when no clone prompt is supplied.")
    parser.add_argument("--voice-clone-prompt-path", default="", help="Qwen clone prompt .pt containing ref_spk_embedding.")
    parser.add_argument("--timbre-strength", type=float, default=0.72, help="0 keeps anchor timbre, 1 uses reference embedding.")
    parser.add_argument(
        "--preserve-norm",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Blend vector direction while keeping a blended embedding norm.",
    )
    return parser.parse_args()


def resolve_path(raw: str) -> Path:
    """Resolve a possibly repo-relative path."""

    path = Path(raw).expanduser()
    return path if path.is_absolute() else (REPO_ROOT / path)


def load_config(model_path: Path) -> dict[str, Any]:
    """Load checkpoint config."""

    config_path = model_path / "config.json"
    if not config_path.exists():
        raise SystemExit(f"config.json not found: {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def speaker_id(config: dict[str, Any], speaker: str) -> int:
    """Resolve speaker name to embedding row id."""

    spk_id = dict((config.get("talker_config", {}) or {}).get("spk_id", {}) or {})
    lowered = {str(key).lower(): int(value) for key, value in spk_id.items()}
    key = speaker.strip().lower()
    if key not in lowered:
        raise SystemExit(f"Speaker '{speaker}' is not in checkpoint speaker map.")
    return lowered[key]


def resolve_language_anchor_speaker(config: dict[str, Any], language: str, requested: str) -> str:
    """Resolve the anchor speaker, using the checkpoint's actual speaker map."""

    value = (requested or "auto").strip()
    if value.lower() == "none":
        raise SystemExit("Speaker morph requires an anchor speaker; --anchor-speaker none is not valid.")
    spk_id = dict((config.get("talker_config", {}) or {}).get("spk_id", {}) or {})
    if not spk_id:
        raise SystemExit("The checkpoint does not expose a speaker map.")

    by_lower = {str(key).lower(): str(key) for key in spk_id.keys()}
    if value and value.lower() != "auto":
        if value.lower() not in by_lower:
            raise SystemExit(f"Speaker '{value}' is not in checkpoint speaker map.")
        return by_lower[value.lower()]

    language_key = (language or "auto").strip().lower()
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
    for candidate in preferred_by_language.get(language_key, preferred_by_language["auto"]):
        if candidate in by_lower:
            return by_lower[candidate]
    return by_lower[sorted(by_lower.keys())[0]]


def next_available_speaker_id(config: dict[str, Any], capacity: int, speaker: str) -> int:
    """Pick a stable unused row id for the new speaker."""

    spk_id = dict((config.get("talker_config", {}) or {}).get("spk_id", {}) or {})
    speaker_key = speaker.strip()
    for key, value in spk_id.items():
        if str(key).lower() == speaker_key.lower():
            return int(value)

    used = {int(value) for value in spk_id.values()}
    preferred = max(used) + 1 if used else 0
    if preferred < capacity and preferred not in used:
        return preferred
    for candidate in range(capacity - 1, -1, -1):
        if candidate not in used:
            return candidate
    raise SystemExit(f"No unused speaker embedding row is available in {capacity} rows.")


def load_prompt_embedding(path: Path) -> torch.Tensor:
    """Load ref_spk_embedding from an upstream-style clone prompt."""

    payload = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(payload, dict) or "items" not in payload:
        raise SystemExit(f"Invalid clone prompt: {path}")
    items = payload["items"]
    if not isinstance(items, list) or not items:
        raise SystemExit(f"Clone prompt has no items: {path}")
    embedding = items[0].get("ref_spk_embedding")
    if embedding is None:
        raise SystemExit(f"Clone prompt has no ref_spk_embedding: {path}")
    return embedding.detach().cpu()


def load_audio_embedding(model_path: Path, ref_audio: Path) -> torch.Tensor:
    """Extract a speaker embedding from reference audio with the VoiceBox encoder."""

    model = Qwen3TTSModel.from_pretrained(
        str(model_path),
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        attn_implementation="sdpa",
    )
    if getattr(model.model, "speaker_encoder", None) is None:
        raise SystemExit("The checkpoint does not include a speaker_encoder; use --voice-clone-prompt-path instead.")
    wav, sr = sf.read(str(ref_audio))
    if isinstance(wav, np.ndarray) and wav.ndim > 1:
        wav = np.mean(wav, axis=1)
    return model.model.extract_speaker_embedding(audio=np.asarray(wav, dtype=np.float32), sr=int(sr)).detach().cpu()


def vectorize(embedding: torch.Tensor, *, dim: int) -> torch.Tensor:
    """Flatten and validate one speaker embedding."""

    vector = embedding.detach().float().cpu().view(-1)
    if vector.numel() != dim:
        raise SystemExit(f"Speaker embedding dimension mismatch: expected {dim}, got {vector.numel()}.")
    return vector


def morph_embedding(anchor: torch.Tensor, reference: torch.Tensor, strength: float, preserve_norm: bool) -> torch.Tensor:
    """Blend reference timbre into an anchor speaker embedding."""

    strength = max(0.0, min(1.0, float(strength)))
    morphed = torch.lerp(anchor, reference, strength)
    if preserve_norm:
        norm = torch.lerp(anchor.norm(), reference.norm(), strength)
        morphed = F.normalize(morphed, dim=0) * norm
    return morphed


def update_config(config: dict[str, Any], *, target_speaker: str, target_id: int, metadata: dict[str, Any]) -> dict[str, Any]:
    """Add the new speaker and morph metadata to config."""

    next_config = dict(config)
    talker_config = dict(next_config.get("talker_config", {}) or {})
    spk_id = dict(talker_config.get("spk_id", {}) or {})
    spk_is_dialect = dict(talker_config.get("spk_is_dialect", {}) or {})
    spk_id[target_speaker] = int(target_id)
    spk_is_dialect[target_speaker] = False
    talker_config["spk_id"] = spk_id
    talker_config["spk_is_dialect"] = spk_is_dialect
    next_config["talker_config"] = talker_config
    next_config["tts_model_type"] = "custom_voice"
    next_config["demo_model_family"] = "voicebox"
    next_config["voicebox_morph"] = metadata
    return next_config


def save_checkpoint_files(output_model_path: Path, state_dict: dict[str, torch.Tensor], config: dict[str, Any], metadata: dict[str, Any], morphed: torch.Tensor) -> None:
    """Write checkpoint files atomically enough for in-place model updates."""

    safetensors_path = output_model_path / "model.safetensors"
    config_path = output_model_path / "config.json"
    tmp_safetensors = output_model_path / "model.safetensors.tmp"
    tmp_config = output_model_path / "config.json.tmp"
    tmp_safetensors.unlink(missing_ok=True)
    tmp_config.unlink(missing_ok=True)
    save_file(state_dict, str(tmp_safetensors))
    tmp_config.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_safetensors, safetensors_path)
    os.replace(tmp_config, config_path)
    torch.save({"speaker_embedding": morphed.cpu(), "metadata": metadata}, output_model_path / "speaker_morph.pt")
    (output_model_path / "voicebox_morph.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    """Create the morphed checkpoint."""

    args = parse_args()
    model_path = resolve_path(args.model_path)
    if not model_path.exists():
        raise SystemExit(f"Model path not found: {model_path}")
    if not args.voice_clone_prompt_path and not args.ref_audio:
        raise SystemExit("--voice-clone-prompt-path or --ref-audio is required.")
    if args.update_in_place:
        output_model_path = model_path
    else:
        if not args.output_model_path:
            raise SystemExit("--output-model-path is required unless --update-in-place is set.")
        output_model_path = resolve_path(args.output_model_path)

    config = load_config(model_path)
    state_dict = load_file(str(model_path / "model.safetensors"))
    if SPEAKER_WEIGHT_KEY not in state_dict:
        raise SystemExit(f"Missing speaker embedding weight: {SPEAKER_WEIGHT_KEY}")

    speaker_weight = state_dict[SPEAKER_WEIGHT_KEY]
    anchor_speaker = resolve_language_anchor_speaker(config, args.language, args.anchor_speaker)
    anchor_id = speaker_id(config, anchor_speaker)
    target_id = next_available_speaker_id(config, int(speaker_weight.shape[0]), args.target_speaker)
    anchor = vectorize(speaker_weight[anchor_id], dim=int(speaker_weight.shape[1]))

    if args.voice_clone_prompt_path:
        prompt_path = resolve_path(args.voice_clone_prompt_path)
        reference = vectorize(load_prompt_embedding(prompt_path), dim=anchor.numel())
        reference_source = str(prompt_path)
    else:
        ref_audio = resolve_path(args.ref_audio)
        reference = vectorize(load_audio_embedding(model_path, ref_audio), dim=anchor.numel())
        reference_source = str(ref_audio)

    morphed = morph_embedding(anchor, reference, args.timbre_strength, args.preserve_norm)
    metadata = {
        "feature": "voicebox_speaker_morph",
        "update_mode": "in_place" if args.update_in_place else "copy",
        "language": args.language,
        "requested_anchor_speaker": args.anchor_speaker,
        "anchor_speaker": anchor_speaker,
        "anchor_speaker_id": anchor_id,
        "target_speaker": args.target_speaker,
        "target_speaker_id": target_id,
        "reference_source": reference_source,
        "timbre_strength": float(max(0.0, min(1.0, args.timbre_strength))),
        "preserve_norm": bool(args.preserve_norm),
        "cosine_to_anchor": float(F.cosine_similarity(morphed.view(1, -1), anchor.view(1, -1)).item()),
        "cosine_to_reference": float(F.cosine_similarity(morphed.view(1, -1), reference.view(1, -1)).item()),
    }

    next_state = {key: value.detach().cpu() for key, value in state_dict.items()}
    next_state[SPEAKER_WEIGHT_KEY][target_id] = morphed.to(next_state[SPEAKER_WEIGHT_KEY].dtype)
    next_config = update_config(config, target_speaker=args.target_speaker, target_id=target_id, metadata=metadata)
    if not args.update_in_place:
        output_model_path.parent.mkdir(parents=True, exist_ok=True)
        if output_model_path.exists():
            shutil.rmtree(output_model_path)
        shutil.copytree(model_path, output_model_path)
    save_checkpoint_files(output_model_path, next_state, next_config, metadata, morphed)
    print(json.dumps({"output_model_path": str(output_model_path), **metadata}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
