# coding=utf-8
"""Fine-tune a CustomVoice checkpoint without modifying upstream scripts.

This script mirrors the upstream Base fine-tuning flow but starts from a
CustomVoice checkpoint. When the CustomVoice checkpoint does not expose a
speaker encoder, a Base checkpoint can be passed through
``--speaker_encoder_model_path`` so the training run can still compute the
reference speaker embedding for the new voice.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any

import torch
from accelerate import Accelerator
from dataset import TTSDataset
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel
from safetensors.torch import save_file
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import AutoConfig


target_speaker_embedding = None


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for CustomVoice fine-tuning.

    Returns:
        Parsed CLI namespace.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--init_model_path", type=str, default="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
    parser.add_argument("--speaker_encoder_model_path", type=str, default="")
    parser.add_argument("--output_model_path", type=str, default="output")
    parser.add_argument("--train_jsonl", type=str, required=True)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--speaker_name", type=str, default="speaker_test")
    return parser.parse_args()


def resolve_attention_implementation() -> str:
    """Resolve the attention implementation for this runtime.

    Returns:
        Attention implementation name accepted by Transformers.
    """

    forced = os.getenv("QWEN_DEMO_ATTN_IMPL")
    if forced:
        return forced
    if torch.cuda.is_available():
        return "flash_attention_2"
    return "sdpa"


def load_training_rows(train_jsonl: str) -> list[dict[str, Any]]:
    """Load JSONL rows for training.

    Args:
        train_jsonl: Path to the prepared training JSONL.

    Returns:
        Parsed list of JSON objects.
    """

    with open(train_jsonl, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def resolve_speaker_encoder(model: Any, fallback_model_path: str) -> Any:
    """Resolve a speaker encoder for reference mel embedding extraction.

    Args:
        model: Loaded `Qwen3TTSModel` instance.
        fallback_model_path: Optional Base checkpoint path.

    Returns:
        Speaker encoder module.
    """

    speaker_encoder = getattr(model.model, "speaker_encoder", None)
    if speaker_encoder is not None:
        return speaker_encoder

    if not fallback_model_path:
        raise ValueError(
            "CustomVoice checkpoint does not expose speaker_encoder; "
            "pass --speaker_encoder_model_path with a compatible Base checkpoint."
        )

    fallback = Qwen3TTSModel.from_pretrained(
        fallback_model_path,
        torch_dtype=torch.bfloat16,
        attn_implementation=resolve_attention_implementation(),
    )
    fallback.model.eval()
    speaker_encoder = getattr(fallback.model, "speaker_encoder", None)
    if speaker_encoder is None:
        raise ValueError("Fallback model does not expose speaker_encoder.")
    return speaker_encoder


def next_speaker_id(config_dict: dict[str, Any], embedding_size: int) -> int:
    """Choose a new speaker ID while preserving existing CustomVoice speakers.

    Args:
        config_dict: Mutable checkpoint config dictionary.
        embedding_size: Size of `codec_embedding.weight`.

    Returns:
        Speaker ID slot to populate.
    """

    talker_config = config_dict.setdefault("talker_config", {})
    spk_id = talker_config.setdefault("spk_id", {})
    existing = [int(value) for value in spk_id.values()]
    candidate = max(existing, default=2999) + 1
    if candidate >= embedding_size:
        raise ValueError(
            f"speaker_id {candidate} exceeds codec_embedding size {embedding_size}. "
            "Use a checkpoint with a larger speaker table."
        )
    return candidate


def train() -> None:
    """Run CustomVoice fine-tuning and export checkpoints."""

    global target_speaker_embedding

    args = parse_args()
    accelerator = Accelerator(gradient_accumulation_steps=4, mixed_precision="bf16", log_with="tensorboard")

    model_path = args.init_model_path
    qwen3tts = Qwen3TTSModel.from_pretrained(
        model_path,
        torch_dtype=torch.bfloat16,
        attn_implementation=resolve_attention_implementation(),
    )
    config = AutoConfig.from_pretrained(model_path)

    train_data = load_training_rows(args.train_jsonl)
    dataset = TTSDataset(train_data, qwen3tts.processor, config)
    train_dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=dataset.collate_fn)

    speaker_encoder = resolve_speaker_encoder(qwen3tts, args.speaker_encoder_model_path)
    optimizer = AdamW(qwen3tts.model.parameters(), lr=args.lr, weight_decay=0.01, foreach=False, fused=False)

    model, optimizer, train_dataloader = accelerator.prepare(qwen3tts.model, optimizer, train_dataloader)
    speaker_encoder = accelerator.prepare_model(speaker_encoder, evaluation_mode=True)

    model.train()

    for epoch in range(args.num_epochs):
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

                speaker_embedding = speaker_encoder(ref_mels.to(model.device).to(model.dtype)).detach()
                if target_speaker_embedding is None:
                    target_speaker_embedding = speaker_embedding

                input_text_ids = input_ids[:, :, 0]
                input_codec_ids = input_ids[:, :, 1]

                input_text_embedding = model.talker.model.text_embedding(input_text_ids) * text_embedding_mask
                input_codec_embedding = model.talker.model.codec_embedding(input_codec_ids) * codec_embedding_mask
                input_codec_embedding[:, 6, :] = speaker_embedding

                input_embeddings = input_text_embedding + input_codec_embedding

                for code_index in range(1, 16):
                    codec_i_embedding = model.talker.code_predictor.get_input_embeddings()[code_index - 1](
                        codec_ids[:, :, code_index]
                    )
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

            if step % 10 == 0:
                accelerator.print(f"Epoch {epoch} | Step {step} | Loss: {loss.item():.4f}")

        if accelerator.is_main_process:
            export_checkpoint(
                accelerator=accelerator,
                model=model,
                base_model_path=model_path,
                output_model_path=args.output_model_path,
                epoch=epoch,
                speaker_name=args.speaker_name,
            )


def export_checkpoint(
    *,
    accelerator: Accelerator,
    model: Any,
    base_model_path: str,
    output_model_path: str,
    epoch: int,
    speaker_name: str,
) -> None:
    """Export a fine-tuned CustomVoice checkpoint.

    Args:
        accelerator: Active accelerator instance.
        model: Prepared model.
        base_model_path: Source checkpoint directory.
        output_model_path: Run output root.
        epoch: Epoch index used for checkpoint naming.
        speaker_name: New speaker alias to register.
    """

    global target_speaker_embedding

    output_dir = Path(output_model_path) / f"checkpoint-epoch-{epoch}"
    shutil.copytree(base_model_path, output_dir, dirs_exist_ok=True)

    config_path = Path(base_model_path) / "config.json"
    with config_path.open("r", encoding="utf-8") as handle:
        config_dict = json.load(handle)
    config_dict["tts_model_type"] = "custom_voice"

    unwrapped_model = accelerator.unwrap_model(model)
    state_dict = {key: value.detach().to("cpu") for key, value in unwrapped_model.state_dict().items()}

    weight = state_dict["talker.model.codec_embedding.weight"]
    speaker_id = next_speaker_id(config_dict, int(weight.shape[0]))

    talker_config = config_dict.setdefault("talker_config", {})
    spk_id = talker_config.setdefault("spk_id", {})
    spk_is_dialect = talker_config.setdefault("spk_is_dialect", {})
    spk_id[speaker_name] = speaker_id
    spk_is_dialect[speaker_name] = False

    with (output_dir / "config.json").open("w", encoding="utf-8") as handle:
        json.dump(config_dict, handle, indent=2, ensure_ascii=False)

    # The current export stays compatible with stock CustomVoice checkpoints.
    # We keep the new speaker embedding but do not yet serialize a standalone
    # speaker encoder into the output model. That larger follow-up is tracked in TODO.md.
    for key in [item for item in state_dict.keys() if item.startswith("speaker_encoder")]:
        del state_dict[key]

    if target_speaker_embedding is None:
        raise RuntimeError("speaker embedding was never initialized during training")

    state_dict["talker.model.codec_embedding.weight"][speaker_id] = target_speaker_embedding[0].detach().to(
        weight.device
    ).to(weight.dtype)
    save_file(state_dict, str(output_dir / "model.safetensors"))


if __name__ == "__main__":
    train()
