# coding=utf-8
# Copyright 2026 The Alibaba Qwen team.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import argparse
import importlib.util
import json
import os
import shutil
import sys

import torch
from accelerate import Accelerator
from dataset import TTSDataset
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSSpeakerEncoder
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel
from safetensors.torch import load_file, save_file
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import AutoConfig

target_speaker_embedding = None


def resolve_attn_implementation():
    configured = os.getenv("QWEN_DEMO_ATTN_IMPL")
    if configured:
        return configured
    if sys.platform == "darwin":
        return "sdpa"
    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn_3"):
        return "flash_attention_3"
    if torch.cuda.is_available() and importlib.util.find_spec("flash_attn"):
        return "flash_attention_2"
    return "sdpa"


def resolve_training_runtime():
    """Resolve dtype and mixed-precision settings for the current runtime."""

    requested_precision = (os.getenv("QWEN_DEMO_TRAIN_PRECISION") or "").strip().lower()
    if torch.cuda.is_available():
        if requested_precision in {"fp32", "float32", "no"}:
            return {
                "mixed_precision": "no",
                "dtype": torch.float32,
                "device_map": "cuda:0",
            }
        return {
            "mixed_precision": "bf16",
            "dtype": torch.bfloat16,
            "device_map": "cuda:0",
        }
    if sys.platform == "darwin" and torch.backends.mps.is_available():
        return {
            "mixed_precision": "no",
            "dtype": torch.float32,
            "device_map": "mps",
        }
    return {
        "mixed_precision": "no",
        "dtype": torch.float32,
        "device_map": "cpu",
    }


def resolve_output_speaker_id(talker_config, speaker_name):
    """Choose a speaker id for the exported fine-tuned checkpoint.

    Args:
        talker_config: Existing talker configuration from config.json.
        speaker_name: Speaker label requested for this run.

    Returns:
        Speaker id slot to write into the exported checkpoint.
    """

    spk_id_map = talker_config.get("spk_id", {})
    if speaker_name in spk_id_map:
        return spk_id_map[speaker_name]

    if not spk_id_map:
        return 3000

    return max(spk_id_map.values()) + 1


def resolve_speaker_encoder_source(init_model_path, speaker_encoder_model_path):
    """Resolve which checkpoint should provide speaker encoder weights.

    Args:
        init_model_path: Main fine-tuning init checkpoint.
        speaker_encoder_model_path: Optional explicit override.

    Returns:
        Checkpoint path that contains speaker encoder weights.
    """

    if speaker_encoder_model_path:
        return speaker_encoder_model_path

    guessed_path = init_model_path.replace("CustomVoice", "Base")
    if guessed_path != init_model_path and os.path.exists(guessed_path):
        return guessed_path
    return init_model_path


def load_speaker_encoder(model_path, runtime):
    """Load only the speaker encoder weights from a checkpoint.

    Args:
        model_path: Checkpoint directory that contains `speaker_encoder.*` weights.
        runtime: Runtime dictionary from `resolve_training_runtime()`.

    Returns:
        Loaded speaker encoder module ready for inference.
    """

    config = AutoConfig.from_pretrained(model_path)
    speaker_encoder = Qwen3TTSSpeakerEncoder(config.speaker_encoder_config)
    model_file = os.path.join(model_path, "model.safetensors")
    state_dict = load_file(model_file)
    speaker_state = {
        key.removeprefix("speaker_encoder."): value
        for key, value in state_dict.items()
        if key.startswith("speaker_encoder.")
    }
    if not speaker_state:
        raise ValueError(f"No speaker_encoder weights found in {model_path}")
    speaker_encoder.load_state_dict(speaker_state)
    speaker_encoder = speaker_encoder.to(device=runtime["device_map"], dtype=runtime["dtype"])
    speaker_encoder.eval()
    return speaker_encoder


def build_arg_parser(default_init_model_path):
    """Build a reusable CLI parser for 12Hz fine-tuning scripts.

    Args:
        default_init_model_path: Default checkpoint to start training from.

    Returns:
        Configured argument parser.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--init_model_path", type=str, default=default_init_model_path)
    parser.add_argument("--output_model_path", type=str, default="output")
    parser.add_argument("--train_jsonl", type=str, required=True)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--speaker_name", type=str, default="speaker_test")
    parser.add_argument("--speaker_encoder_model_path", type=str, default=None)
    return parser


def train_with_args(args):
    """Run 12Hz fine-tuning with parsed CLI arguments.

    Args:
        args: Parsed command-line namespace.
    """

    global target_speaker_embedding
    target_speaker_embedding = None

    runtime = resolve_training_runtime()
    accelerator = Accelerator(
        gradient_accumulation_steps=4,
        mixed_precision=runtime["mixed_precision"],
        log_with="tensorboard",
    )

    MODEL_PATH = args.init_model_path

    qwen3tts = Qwen3TTSModel.from_pretrained(
        MODEL_PATH,
        torch_dtype=runtime["dtype"],
        device_map=runtime["device_map"],
        attn_implementation=resolve_attn_implementation(),
    )
    config = AutoConfig.from_pretrained(MODEL_PATH)
    auxiliary_speaker_encoder = None
    if getattr(qwen3tts.model, "speaker_encoder", None) is None:
        speaker_encoder_source = resolve_speaker_encoder_source(
            init_model_path=MODEL_PATH,
            speaker_encoder_model_path=args.speaker_encoder_model_path,
        )
        auxiliary_speaker_encoder = load_speaker_encoder(
            model_path=speaker_encoder_source,
            runtime=runtime,
        )

    train_data = open(args.train_jsonl).readlines()
    train_data = [json.loads(line) for line in train_data]
    dataset = TTSDataset(train_data, qwen3tts.processor, config)
    train_dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=dataset.collate_fn)

    # WSL + recent CUDA drivers can be flaky with AdamW foreach kernels during
    # long TTS fine-tuning jobs. Use the conservative path so full runs finish
    # reliably instead of crashing after the first optimizer step.
    optimizer = AdamW(
        qwen3tts.model.parameters(),
        lr=args.lr,
        weight_decay=0.01,
        foreach=False,
        fused=False,
    )

    model, optimizer, train_dataloader = accelerator.prepare(
        qwen3tts.model, optimizer, train_dataloader
    )

    num_epochs = args.num_epochs
    model.train()

    for epoch in range(num_epochs):
        for step, batch in enumerate(train_dataloader):
            with accelerator.accumulate(model):

                input_ids = batch['input_ids']
                codec_ids = batch['codec_ids']
                ref_mels = batch['ref_mels']
                text_embedding_mask = batch['text_embedding_mask']
                codec_embedding_mask = batch['codec_embedding_mask']
                attention_mask = batch['attention_mask']
                codec_0_labels = batch['codec_0_labels']
                codec_mask = batch['codec_mask']

                speaker_encoder = model.speaker_encoder if model.speaker_encoder is not None else auxiliary_speaker_encoder
                speaker_embedding = speaker_encoder(ref_mels.to(model.device).to(model.dtype)).detach()
                if target_speaker_embedding is None:
                    target_speaker_embedding = speaker_embedding

                input_text_ids = input_ids[:, :, 0]
                input_codec_ids = input_ids[:, :, 1]

                input_text_embedding = model.talker.text_projection(
                    model.talker.model.text_embedding(input_text_ids)
                ) * text_embedding_mask
                input_codec_embedding = model.talker.model.codec_embedding(input_codec_ids) * codec_embedding_mask
                input_codec_embedding[:, 6, :] = speaker_embedding

                input_embeddings = input_text_embedding + input_codec_embedding

                for i in range(1, 16):
                    codec_i_embedding = model.talker.code_predictor.get_input_embeddings()[i - 1](codec_ids[:, :, i])
                    codec_i_embedding = codec_i_embedding * codec_mask.unsqueeze(-1)
                    input_embeddings = input_embeddings + codec_i_embedding

                outputs = model.talker(
                    inputs_embeds=input_embeddings[:, :-1, :],
                    attention_mask=attention_mask[:, :-1],
                    labels=codec_0_labels[:, 1:],
                    output_hidden_states=True
                )

                hidden_states = outputs.hidden_states[0][-1]
                talker_hidden_states = hidden_states[codec_mask[:, :-1]]
                talker_codec_ids = codec_ids[codec_mask]

                sub_talker_logits, sub_talker_loss = model.talker.forward_sub_talker_finetune(talker_codec_ids, talker_hidden_states)

                loss = outputs.loss + 0.3 * sub_talker_loss

                accelerator.backward(loss)

                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(model.parameters(), 1.0)

                optimizer.step()
                optimizer.zero_grad()

            if step % 10 == 0:
                accelerator.print(f"Epoch {epoch} | Step {step} | Loss: {loss.item():.4f}")

        if accelerator.is_main_process:
            output_dir = os.path.join(args.output_model_path, f"checkpoint-epoch-{epoch}")
            shutil.copytree(MODEL_PATH, output_dir, dirs_exist_ok=True)

            input_config_file = os.path.join(MODEL_PATH, "config.json")
            output_config_file = os.path.join(output_dir, "config.json")
            with open(input_config_file, 'r', encoding='utf-8') as f:
                config_dict = json.load(f)
            config_dict["tts_model_type"] = "custom_voice"
            talker_config = config_dict.get("talker_config", {})
            speaker_id = resolve_output_speaker_id(talker_config, args.speaker_name)

            # Preserve bundled CustomVoice speakers when the init checkpoint already
            # has them, then append or update the requested fine-tuned speaker.
            spk_id_map = dict(talker_config.get("spk_id", {}))
            spk_is_dialect = dict(talker_config.get("spk_is_dialect", {}))
            spk_id_map[args.speaker_name] = speaker_id
            spk_is_dialect[args.speaker_name] = False
            talker_config["spk_id"] = spk_id_map
            talker_config["spk_is_dialect"] = spk_is_dialect
            config_dict["talker_config"] = talker_config

            with open(output_config_file, 'w', encoding='utf-8') as f:
                json.dump(config_dict, f, indent=2, ensure_ascii=False)

            unwrapped_model = accelerator.unwrap_model(model)
            state_dict = {k: v.detach().to("cpu") for k, v in unwrapped_model.state_dict().items()}

            drop_prefix = "speaker_encoder"
            keys_to_drop = [k for k in state_dict.keys() if k.startswith(drop_prefix)]
            for k in keys_to_drop:
                del state_dict[k]

            weight = state_dict['talker.model.codec_embedding.weight']
            state_dict['talker.model.codec_embedding.weight'][speaker_id] = target_speaker_embedding[0].detach().to(weight.device).to(weight.dtype)
            save_path = os.path.join(output_dir, "model.safetensors")
            save_file(state_dict, save_path)


def train():
    """Run the default Base-model fine-tuning entrypoint."""

    parser = build_arg_parser(default_init_model_path="Qwen/Qwen3-TTS-12Hz-1.7B-Base")
    args = parser.parse_args()
    train_with_args(args)

if __name__ == "__main__":
    train()
