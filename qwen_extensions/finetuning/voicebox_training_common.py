#!/usr/bin/env python3
"""Shared CustomVoice/VoiceBox training helpers.

This module is the canonical local training implementation for the demo's
CustomVoice and VoiceBox stages. It lives in ``qwen_extensions`` so the demo's
custom training code is kept separate from the upstream ``vendor/Qwen3-TTS`` checkout
while still importing upstream dataset/model modules directly from that tree.

The three intended stages are:

1. plain CustomVoice fine-tuning with an external Base speaker encoder
2. plain CustomVoice -> VoiceBox checkpoint conversion
3. VoiceBox -> VoiceBox retraining with embedded speaker encoder reuse
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import importlib.util
import torch
from accelerate import Accelerator
from safetensors import safe_open
from safetensors.torch import load_file, save_file
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import Adafactor, AutoConfig


REPO_ROOT = Path(__file__).resolve().parents[2]
UPSTREAM_ROOT = REPO_ROOT / "vendor" / "Qwen3-TTS"
UPSTREAM_FINETUNING_DIR = UPSTREAM_ROOT / "finetuning"
VOICEBOX_FAMILY = "voicebox"
CHECKPOINT_EPOCH_RE = re.compile(r"checkpoint-epoch-(\d+)$")

# Import upstream modules without modifying the upstream tree.
sys.path.insert(0, str(UPSTREAM_ROOT))
sys.path.insert(0, str(UPSTREAM_FINETUNING_DIR))

from dataset import TTSDataset  # noqa: E402
from qwen_tts.core.models.configuration_qwen3_tts import Qwen3TTSConfig  # noqa: E402
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSSpeakerEncoder  # noqa: E402
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402


TARGET_SPEAKER_EMBEDDING = None


def repo_path(value: str) -> Path:
    """Resolve repo-relative paths against the project root."""

    path = Path(value)
    return path if path.is_absolute() else (REPO_ROOT / path)


def ensure_exists(path: Path, label: str) -> None:
    """Fail fast with a readable message when a required path is missing."""

    if not path.exists():
        raise SystemExit(f"{label} not found: {path}")


def resolve_attention_implementation() -> str:
    """Choose the best attention backend available in this environment."""

    configured = (os.getenv("QWEN_DEMO_ATTN_IMPL") or "").strip()
    if configured:
        return configured
    if sys.platform == "darwin":
        return "sdpa"
    if torch.cuda.is_available():
        if importlib.util.find_spec("flash_attn"):
            return "flash_attention_2"
    return "sdpa"


def resolve_runtime() -> dict[str, Any]:
    """Choose dtype, device map, and accelerate precision for training."""

    requested_precision = (os.getenv("QWEN_DEMO_TRAIN_PRECISION") or "").strip().lower()
    if torch.cuda.is_available():
        if requested_precision in {"fp32", "float32", "no"}:
            return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "cuda:0"}
        return {"mixed_precision": "bf16", "dtype": torch.bfloat16, "device_map": "cuda:0"}
    if sys.platform == "darwin" and torch.backends.mps.is_available():
        return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "mps"}
    return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "cpu"}


def load_jsonl_records(path: Path) -> list[dict[str, Any]]:
    """Load a prepared JSONL file into a list of dictionaries."""

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def resolve_jsonl_audio_path(raw_path: str, jsonl_path: Path) -> str:
    """Resolve audio paths stored inside dataset JSONL rows."""

    candidate = Path(raw_path)
    if candidate.is_absolute():
        return str(candidate)

    from_jsonl_dir = (jsonl_path.resolve().parent / candidate).resolve()
    if from_jsonl_dir.exists():
        return str(from_jsonl_dir)

    return str((REPO_ROOT / candidate).resolve())


def sanitize_speaker_encoder_config(config_dict: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip config keys that the speaker encoder config class does not accept."""

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


def checkpoint_has_speaker_encoder(model_path: Path) -> bool:
    """Return whether a checkpoint already embeds ``speaker_encoder.*`` tensors."""

    weights_path = model_path / "model.safetensors"
    if not weights_path.exists():
        return False
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        return any(key.startswith("speaker_encoder.") for key in handle.keys())


def load_speaker_encoder(model_path: Path, runtime: dict[str, Any]) -> Qwen3TTSSpeakerEncoder:
    """Load a standalone speaker encoder from a checkpoint directory."""

    config = Qwen3TTSConfig.from_pretrained(str(model_path))
    speaker_encoder_config = config.speaker_encoder_config
    if speaker_encoder_config is None:
        config_path = model_path / "config.json"
        raw_config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
        source_model_path = raw_config.get("speaker_encoder_source_model_path")
        if source_model_path:
            source_config = Qwen3TTSConfig.from_pretrained(str(Path(source_model_path)))
            speaker_encoder_config = source_config.speaker_encoder_config
    if speaker_encoder_config is None:
        raise SystemExit(
            "Checkpoint contains speaker_encoder weights but no speaker_encoder_config. "
            f"Cannot build a standalone encoder from {model_path}."
        )

    speaker_encoder = Qwen3TTSSpeakerEncoder(speaker_encoder_config)
    state_dict = load_file(str(model_path / "model.safetensors"))
    speaker_state = {
        key.removeprefix("speaker_encoder."): value
        for key, value in state_dict.items()
        if key.startswith("speaker_encoder.")
    }
    if not speaker_state:
        raise SystemExit(f"No speaker_encoder weights were found in {model_path}")

    speaker_encoder.load_state_dict(speaker_state)
    speaker_encoder = speaker_encoder.to(device=runtime["device_map"], dtype=runtime["dtype"])
    speaker_encoder.eval()
    return speaker_encoder


def resolve_speaker_encoder_source(init_model_path: Path, speaker_encoder_model_path: Path | None) -> Path:
    """Pick a checkpoint path that can provide speaker encoder weights."""

    if speaker_encoder_model_path is not None:
        return speaker_encoder_model_path

    guessed = Path(str(init_model_path).replace("CustomVoice", "Base"))
    if guessed != init_model_path and guessed.exists():
        return guessed
    return init_model_path


def resolve_voicebox_speaker_encoder(
    qwen3tts: Qwen3TTSModel,
    init_model_path: Path,
    runtime: dict[str, Any],
    speaker_encoder_model_path: Path | None,
) -> Qwen3TTSSpeakerEncoder:
    """Resolve the speaker encoder needed for CustomVoice/VoiceBox training."""

    embedded = getattr(qwen3tts.model, "speaker_encoder", None)
    if embedded is not None:
        embedded = embedded.to(device=runtime["device_map"], dtype=runtime["dtype"])
        embedded.eval()
        return embedded

    if checkpoint_has_speaker_encoder(init_model_path):
        return load_speaker_encoder(init_model_path, runtime)

    speaker_source = resolve_speaker_encoder_source(init_model_path, speaker_encoder_model_path)
    return load_speaker_encoder(speaker_source, runtime)


def voicebox_metadata(
    *,
    source_checkpoint: Path,
    speaker_encoder_included: bool,
    speaker_encoder_source_path: str | None,
) -> dict[str, Any]:
    """Build metadata stored inside exported VoiceBox checkpoints."""

    speaker_encoder_config = None
    if speaker_encoder_source_path:
        source_config = Qwen3TTSConfig.from_pretrained(str(Path(speaker_encoder_source_path)))
        speaker_encoder_config = source_config.speaker_encoder_config
        if speaker_encoder_config is not None and hasattr(speaker_encoder_config, "to_dict"):
            speaker_encoder_config = speaker_encoder_config.to_dict()
        speaker_encoder_config = sanitize_speaker_encoder_config(speaker_encoder_config)

    return {
        "demo_model_family": VOICEBOX_FAMILY,
        "speaker_encoder_included": bool(speaker_encoder_included),
        "speaker_encoder_source_model_path": speaker_encoder_source_path,
        "speaker_encoder_config": speaker_encoder_config,
        "voicebox_source_checkpoint": str(source_checkpoint),
    }


def resolve_output_speaker_id(talker_config: dict[str, Any], speaker_name: str) -> int:
    """Choose a stable speaker slot in the exported checkpoint config."""

    spk_id_map = dict(talker_config.get("spk_id", {}) or {})
    if speaker_name in spk_id_map:
        return int(spk_id_map[speaker_name])
    if not spk_id_map:
        return 3000
    return max(int(value) for value in spk_id_map.values()) + 1


def checkpoint_epoch(path: Path) -> int:
    """Read the epoch number from a checkpoint directory name."""

    match = CHECKPOINT_EPOCH_RE.match(path.name)
    return int(match.group(1)) if match else -1


def finalize_checkpoint_layout(output_model_path: Path) -> Path:
    """Keep only the latest checkpoint under ``final/`` for selection UX."""

    checkpoints = [path for path in output_model_path.glob("checkpoint-epoch-*") if path.is_dir()]
    if not checkpoints:
        final_dir = output_model_path / "final"
        return final_dir if final_dir.exists() else output_model_path

    latest = max(checkpoints, key=checkpoint_epoch)
    final_dir = output_model_path / "final"
    if final_dir.exists():
        shutil.rmtree(final_dir)
    shutil.copytree(latest, final_dir)
    for checkpoint in checkpoints:
        shutil.rmtree(checkpoint)
    return final_dir


def run_customvoice_training(
    *,
    train_jsonl: Path,
    init_model_path: Path,
    output_model_path: Path,
    speaker_name: str,
    batch_size: int,
    lr: float,
    num_epochs: int,
    speaker_encoder_model_path: Path | None,
    embed_speaker_encoder: bool,
) -> Path:
    """Run plain CustomVoice or VoiceBox-style training.

    Args:
        train_jsonl: Prepared dataset JSONL.
        init_model_path: Initial model checkpoint.
        output_model_path: Run output directory.
        speaker_name: New or continued speaker alias.
        batch_size: Training batch size.
        lr: Learning rate.
        num_epochs: Number of epochs.
        speaker_encoder_model_path: Optional external speaker encoder source.
        embed_speaker_encoder: Whether exported checkpoints keep the encoder.

    Returns:
        Finalized checkpoint directory path.
    """

    global TARGET_SPEAKER_EMBEDDING
    TARGET_SPEAKER_EMBEDDING = None

    ensure_exists(init_model_path, "Init model")
    ensure_exists(train_jsonl, "Prepared training JSONL")
    if speaker_encoder_model_path is not None:
        ensure_exists(speaker_encoder_model_path, "Speaker encoder source model")
    output_model_path.parent.mkdir(parents=True, exist_ok=True)

    runtime = resolve_runtime()
    gradient_accumulation_steps = int(os.getenv("QWEN_DEMO_GRAD_ACCUM_STEPS", "1"))
    accelerator = Accelerator(
        gradient_accumulation_steps=gradient_accumulation_steps,
        mixed_precision=runtime["mixed_precision"],
        log_with="tensorboard",
    )

    qwen3tts = Qwen3TTSModel.from_pretrained(
        str(init_model_path),
        torch_dtype=runtime["dtype"],
        device_map=runtime["device_map"],
        attn_implementation=resolve_attention_implementation(),
    )
    config = AutoConfig.from_pretrained(str(init_model_path))

    checkpoint_embeds_encoder = checkpoint_has_speaker_encoder(init_model_path)
    speaker_source = resolve_speaker_encoder_source(init_model_path, speaker_encoder_model_path)
    auxiliary_speaker_encoder = resolve_voicebox_speaker_encoder(
        qwen3tts=qwen3tts,
        init_model_path=init_model_path,
        runtime=runtime,
        speaker_encoder_model_path=speaker_encoder_model_path,
    )

    train_data = load_jsonl_records(train_jsonl)
    for row in train_data:
        row["audio"] = resolve_jsonl_audio_path(str(row["audio"]), train_jsonl)
        row["ref_audio"] = resolve_jsonl_audio_path(str(row["ref_audio"]), train_jsonl)

    # Curriculum ordering keeps long codec sequences from causing early CUDA
    # memory spikes before the optimizer has settled its state tensors.
    train_data.sort(key=lambda row: len(row.get("audio_codes", [])))
    dataset = TTSDataset(train_data, qwen3tts.processor, config)
    train_dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=False, collate_fn=dataset.collate_fn)

    optimizer_name = os.getenv("QWEN_DEMO_OPTIMIZER", "adamw").strip().lower()
    if optimizer_name == "adafactor":
        optimizer = Adafactor(
            qwen3tts.model.parameters(),
            lr=lr,
            weight_decay=0.01,
            scale_parameter=False,
            relative_step=False,
            warmup_init=False,
        )
    else:
        optimizer_kwargs = {"lr": lr, "weight_decay": 0.01}
        if torch.cuda.is_available():
            optimizer_kwargs["fused"] = True
        optimizer = AdamW(qwen3tts.model.parameters(), **optimizer_kwargs)

    model, optimizer, train_dataloader = accelerator.prepare(qwen3tts.model, optimizer, train_dataloader)
    model.train()

    log_every = max(1, int(os.getenv("QWEN_DEMO_LOG_EVERY", "10")))
    for epoch in range(num_epochs):
        for step, batch in enumerate(train_dataloader):
            with accelerator.accumulate(model):
                input_ids = batch["input_ids"]
                codec_ids = batch["codec_ids"]
                ref_mels = batch["ref_mels"]
                text_embedding_mask = batch["text_embedding_mask"]
                codec_embedding_mask = batch["codec_embedding_mask"]
                attention_mask = batch["attention_mask"]
                codec_0_labels = batch["codec_0_labels"]
                codec_mask = batch["codec_mask"]

                speaker_encoder = getattr(model, "speaker_encoder", None) or auxiliary_speaker_encoder
                if speaker_encoder is None:
                    raise RuntimeError("CustomVoice training needs a speaker encoder source.")

                speaker_embedding = speaker_encoder(ref_mels.to(model.device).to(model.dtype)).detach()
                if TARGET_SPEAKER_EMBEDDING is None:
                    TARGET_SPEAKER_EMBEDDING = speaker_embedding

                input_text_ids = input_ids[:, :, 0]
                input_codec_ids = input_ids[:, :, 1]
                input_text_embedding = model.talker.model.text_embedding(input_text_ids) * text_embedding_mask
                input_codec_embedding = model.talker.model.codec_embedding(input_codec_ids) * codec_embedding_mask
                input_codec_embedding[:, 6, :] = speaker_embedding
                input_embeddings = input_text_embedding + input_codec_embedding

                for index in range(1, 16):
                    codec_i_embedding = model.talker.code_predictor.get_input_embeddings()[index - 1](codec_ids[:, :, index])
                    codec_i_embedding = codec_i_embedding * codec_mask.unsqueeze(-1)
                    input_embeddings = input_embeddings + codec_i_embedding

                outputs = model.talker(
                    inputs_embeds=input_embeddings[:, :-1, :],
                    attention_mask=attention_mask[:, :-1],
                    labels=codec_0_labels[:, 1:],
                    output_hidden_states=True,
                )

                hidden_states = outputs.hidden_states[0][-1]
                talker_hidden_states = hidden_states[codec_mask[:, :-1]]
                talker_codec_ids = codec_ids[codec_mask]
                _, sub_talker_loss = model.talker.forward_sub_talker_finetune(talker_codec_ids, talker_hidden_states)
                loss = outputs.loss + 0.3 * sub_talker_loss

                accelerator.backward(loss)
                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(model.parameters(), 1.0)

                optimizer.step()
                optimizer.zero_grad()

            if step % log_every == 0:
                accelerator.print(f"Epoch {epoch} | Step {step} | Loss: {loss.item():.4f}")

        if accelerator.is_main_process:
            export_customvoice_checkpoint(
                accelerator=accelerator,
                model=model,
                init_model_path=init_model_path,
                output_model_path=output_model_path,
                epoch=epoch,
                speaker_name=speaker_name,
                auxiliary_speaker_encoder=auxiliary_speaker_encoder,
                speaker_encoder_source_path=str(init_model_path if checkpoint_embeds_encoder else speaker_source),
                embed_speaker_encoder=embed_speaker_encoder,
            )

    if accelerator.is_main_process:
        return finalize_checkpoint_layout(output_model_path)
    return output_model_path / "final"


def export_customvoice_checkpoint(
    *,
    accelerator: Accelerator,
    model: Any,
    init_model_path: Path,
    output_model_path: Path,
    epoch: int,
    speaker_name: str,
    auxiliary_speaker_encoder: Qwen3TTSSpeakerEncoder,
    speaker_encoder_source_path: str,
    embed_speaker_encoder: bool,
) -> None:
    """Export one epoch checkpoint as plain CustomVoice or VoiceBox."""

    global TARGET_SPEAKER_EMBEDDING

    output_dir = output_model_path / f"checkpoint-epoch-{epoch}"
    shutil.copytree(str(init_model_path), str(output_dir), dirs_exist_ok=True)

    config_dict = json.loads((init_model_path / "config.json").read_text(encoding="utf-8"))
    config_dict["tts_model_type"] = "custom_voice"
    if embed_speaker_encoder:
        config_dict.update(
            voicebox_metadata(
                source_checkpoint=init_model_path,
                speaker_encoder_included=True,
                speaker_encoder_source_path=speaker_encoder_source_path,
            )
        )
    else:
        config_dict.pop("demo_model_family", None)
        config_dict.pop("speaker_encoder_included", None)
        config_dict.pop("speaker_encoder_source_model_path", None)
        config_dict.pop("speaker_encoder_config", None)
        config_dict.pop("voicebox_source_checkpoint", None)

    talker_config = dict(config_dict.get("talker_config", {}) or {})
    spk_id_map = dict(talker_config.get("spk_id", {}) or {})
    spk_is_dialect = dict(talker_config.get("spk_is_dialect", {}) or {})
    speaker_id = resolve_output_speaker_id(talker_config, speaker_name)
    spk_id_map[speaker_name] = speaker_id
    spk_is_dialect[speaker_name] = False
    talker_config["spk_id"] = spk_id_map
    talker_config["spk_is_dialect"] = spk_is_dialect
    config_dict["talker_config"] = talker_config
    (output_dir / "config.json").write_text(json.dumps(config_dict, indent=2, ensure_ascii=False), encoding="utf-8")

    unwrapped_model = accelerator.unwrap_model(model)
    state_dict = {key: value.detach().to("cpu") for key, value in unwrapped_model.state_dict().items()}

    if embed_speaker_encoder:
        speaker_encoder_state = {
            f"speaker_encoder.{key}": value.detach().to("cpu")
            for key, value in auxiliary_speaker_encoder.state_dict().items()
        }
        state_dict.update(speaker_encoder_state)
    else:
        state_dict = {key: value for key, value in state_dict.items() if not key.startswith("speaker_encoder.")}

    codec_weight = state_dict["talker.model.codec_embedding.weight"]
    state_dict["talker.model.codec_embedding.weight"][speaker_id] = TARGET_SPEAKER_EMBEDDING[0].detach().to(
        codec_weight.device
    ).to(codec_weight.dtype)
    save_file(state_dict, str(output_dir / "model.safetensors"))
