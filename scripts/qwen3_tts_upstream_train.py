#!/usr/bin/env python3
"""Demo-side wrappers for pristine upstream Qwen3-TTS fine-tuning entrypoints.

This CLI keeps the upstream ``Qwen3-TTS/`` tree untouched and provides three
commands:

``prepare-data``
    Run the pristine upstream ``prepare_data.py`` against a dataset JSONL.

``train-base``
    Run the pristine upstream ``sft_12hz.py`` against a prepared JSONL.

``train-customvoice``
    Run a demo-side standalone CustomVoice fine-tuning flow while still using
    the pristine upstream package code, dataset loader, tokenizer, and model
    classes.

The wrapper assumes the repository layout used by ``Qwen3-TTS-Demo``:

* project root: ``/home/hosung/pytorch-demo/Qwen3-TTS-Demo``
* upstream repo: ``Qwen3-TTS-Demo/Qwen3-TTS``
* canonical dataset: ``data/datasets/mai_ko_full``
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import torch
from accelerate import Accelerator
from safetensors.torch import load_file, save_file
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import AutoConfig

REPO_ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_ROOT = REPO_ROOT / "Qwen3-TTS"
UPSTREAM_FINETUNING_DIR = UPSTREAM_ROOT / "finetuning"
SAFE_PREPARE_DATA = REPO_ROOT / "scripts" / "qwen3_tts_prepare_data.py"
UPSTREAM_BASE_SFT = UPSTREAM_FINETUNING_DIR / "sft_12hz.py"

# Make the pristine upstream package importable without modifying it.
sys.path.insert(0, str(UPSTREAM_ROOT))
sys.path.insert(0, str(UPSTREAM_FINETUNING_DIR))

from dataset import TTSDataset  # noqa: E402
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSSpeakerEncoder  # noqa: E402
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402

TARGET_SPEAKER_EMBEDDING = None
CHECKPOINT_EPOCH_RE = re.compile(r"checkpoint-epoch-(\d+)$")


def repo_path(value: str) -> Path:
    """Resolve a repo-relative path against the project root.

    Args:
        value: Absolute or repo-relative path string.

    Returns:
        Resolved path under the project root.
    """

    path = Path(value)
    return path if path.is_absolute() else (REPO_ROOT / path)


def ensure_exists(path: Path, label: str) -> None:
    """Fail fast when a required path is missing.

    Args:
        path: Path that must exist.
        label: Human-readable label used in the error message.
    """

    if not path.exists():
        raise SystemExit(f"{label} not found: {path}")


def add_upstream_pythonpath(env: dict[str, str]) -> dict[str, str]:
    """Add the pristine upstream repo to PYTHONPATH for subprocesses."""

    env = dict(env)
    current = env.get("PYTHONPATH", "")
    prefix = str(UPSTREAM_ROOT)
    env["PYTHONPATH"] = prefix if not current else f"{prefix}:{current}"
    return env


def run_command(command: list[str], *, cwd: Path | None = None) -> None:
    """Run a subprocess while keeping stdout/stderr attached to the terminal."""

    print(f"$ {' '.join(command)}", flush=True)
    result = subprocess.run(
        command,
        cwd=str(cwd or REPO_ROOT),
        env=add_upstream_pythonpath(os.environ.copy()),
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def update_dataset_record(dataset_root: Path, **updates: Any) -> None:
    """Patch the canonical dataset.json record in place.

    Args:
        dataset_root: Canonical dataset directory under ``data/datasets``.
        updates: Key/value pairs to merge into ``dataset.json``.
    """

    dataset_record = dataset_root / "dataset.json"
    if not dataset_record.exists():
        return

    payload = json.loads(dataset_record.read_text(encoding="utf-8"))
    payload.update(updates)
    dataset_record.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def resolve_jsonl_audio_path(raw_path: str, jsonl_path: Path) -> str:
    """Resolve a dataset audio path against the JSONL location or repo root."""

    candidate = Path(raw_path)
    if candidate.is_absolute():
        return str(candidate)

    from_jsonl_dir = (jsonl_path.resolve().parent / candidate).resolve()
    if from_jsonl_dir.exists():
        return str(from_jsonl_dir)

    return str((REPO_ROOT / candidate).resolve())


def resolve_attention_implementation() -> str:
    """Choose the best attention backend available on this machine."""

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
    """Resolve dtype, device map, and accelerator settings for training."""

    requested_precision = (os.getenv("QWEN_DEMO_TRAIN_PRECISION") or "").strip().lower()
    if torch.cuda.is_available():
        if requested_precision in {"fp32", "float32", "no"}:
            return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "cuda:0"}
        return {"mixed_precision": "bf16", "dtype": torch.bfloat16, "device_map": "cuda:0"}
    if sys.platform == "darwin" and torch.backends.mps.is_available():
        return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "mps"}
    return {"mixed_precision": "no", "dtype": torch.float32, "device_map": "cpu"}


def load_jsonl_records(path: Path) -> list[dict[str, Any]]:
    """Load a JSONL file into a list of dictionaries."""

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def resolve_speaker_encoder_source(init_model_path: Path, speaker_encoder_model_path: Path | None) -> Path:
    """Pick a checkpoint that can provide speaker-encoder weights."""

    if speaker_encoder_model_path is not None:
        return speaker_encoder_model_path

    guessed = Path(str(init_model_path).replace("CustomVoice", "Base"))
    if guessed != init_model_path and guessed.exists():
        return guessed
    return init_model_path


def load_speaker_encoder(model_path: Path, runtime: dict[str, Any]) -> Qwen3TTSSpeakerEncoder:
    """Load a standalone speaker encoder module from a checkpoint."""

    config = AutoConfig.from_pretrained(str(model_path))
    speaker_encoder = Qwen3TTSSpeakerEncoder(config.speaker_encoder_config)
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


def resolve_output_speaker_id(talker_config: dict[str, Any], speaker_name: str) -> int:
    """Choose a stable speaker slot in the exported checkpoint config."""

    spk_id_map = dict(talker_config.get("spk_id", {}) or {})
    if speaker_name in spk_id_map:
        return int(spk_id_map[speaker_name])
    if not spk_id_map:
        return 3000
    return max(int(value) for value in spk_id_map.values()) + 1


def checkpoint_epoch(path: Path) -> int:
    """체크포인트 디렉터리 이름에서 epoch 번호를 읽는다."""

    match = CHECKPOINT_EPOCH_RE.match(path.name)
    return int(match.group(1)) if match else -1


def finalize_checkpoint_layout(output_model_path: Path) -> Path:
    """학습 결과를 `final/` 하나만 남기는 구조로 정리한다.

    Args:
        output_model_path: 체크포인트들이 쌓이는 run 디렉터리.

    Returns:
        선택용으로 노출할 `final/` 경로.
    """

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


def prepare_data_command(args: argparse.Namespace) -> None:
    """Run the pristine upstream prepare_data.py script."""

    dataset_root = repo_path(args.dataset_root)
    input_jsonl = repo_path(args.input_jsonl or (dataset_root / "raw.jsonl"))
    output_jsonl = repo_path(args.output_jsonl or (dataset_root / "prepared.jsonl"))
    tokenizer_model_path = repo_path(args.tokenizer_model_path)

    ensure_exists(SAFE_PREPARE_DATA, "Demo-side prepare_data wrapper")
    ensure_exists(input_jsonl, "Input JSONL")
    ensure_exists(tokenizer_model_path, "Tokenizer model")

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)

    run_command(
        [
            sys.executable,
            str(SAFE_PREPARE_DATA),
            "--device",
            args.device,
            "--tokenizer_model_path",
            str(tokenizer_model_path),
            "--input_jsonl",
            str(input_jsonl),
            "--output_jsonl",
            str(output_jsonl),
            "--batch_infer_num",
            str(args.batch_infer_num),
        ]
    )
    update_dataset_record(
        dataset_root,
        prepared_jsonl_path=str(output_jsonl.relative_to(REPO_ROOT)),
        prepared_with_simulation=False,
        prepared_tokenizer_model_path=str(tokenizer_model_path.relative_to(REPO_ROOT))
        if tokenizer_model_path.is_relative_to(REPO_ROOT)
        else str(tokenizer_model_path),
        prepared_device=args.device,
    )


def train_base_command(args: argparse.Namespace) -> None:
    """Run the pristine upstream base fine-tuning script."""

    init_model_path = repo_path(args.init_model_path)
    train_jsonl = repo_path(args.train_jsonl)
    output_model_path = repo_path(args.output_model_path)

    ensure_exists(UPSTREAM_BASE_SFT, "Upstream sft_12hz.py")
    ensure_exists(init_model_path, "Base init model")
    ensure_exists(train_jsonl, "Prepared training JSONL")

    # The pristine upstream base trainer hardcodes flash_attention_2.
    # If the v2 module is absent, fail fast with a clear message instead of
    # letting the upstream subprocess die deep in model loading.
    if not importlib.util.find_spec("flash_attn"):
        raise SystemExit(
            "Base fine-tuning on the pristine upstream script requires flash_attn v2. "
            "Install a compatible flash-attn v2 wheel first, or explicitly choose a different environment."
        )

    output_model_path.parent.mkdir(parents=True, exist_ok=True)
    run_command(
        [
            sys.executable,
            str(UPSTREAM_BASE_SFT),
            "--init_model_path",
            str(init_model_path),
            "--output_model_path",
            str(output_model_path),
            "--train_jsonl",
            str(train_jsonl),
            "--batch_size",
            str(args.batch_size),
            "--lr",
            str(args.lr),
            "--num_epochs",
            str(args.num_epochs),
            "--speaker_name",
            args.speaker_name,
        ]
    )
    finalize_checkpoint_layout(output_model_path)


def train_customvoice_command(args: argparse.Namespace) -> None:
    """Run a demo-side standalone CustomVoice fine-tuning flow."""

    global TARGET_SPEAKER_EMBEDDING
    TARGET_SPEAKER_EMBEDDING = None

    init_model_path = repo_path(args.init_model_path)
    speaker_encoder_model_path = repo_path(args.speaker_encoder_model_path) if args.speaker_encoder_model_path else None
    train_jsonl = repo_path(args.train_jsonl)
    output_model_path = repo_path(args.output_model_path)

    ensure_exists(init_model_path, "CustomVoice init model")
    ensure_exists(train_jsonl, "Prepared training JSONL")
    if speaker_encoder_model_path is not None:
        ensure_exists(speaker_encoder_model_path, "Speaker encoder source model")
    output_model_path.parent.mkdir(parents=True, exist_ok=True)

    runtime = resolve_runtime()
    accelerator = Accelerator(
        gradient_accumulation_steps=4,
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

    auxiliary_speaker_encoder = None
    if getattr(qwen3tts.model, "speaker_encoder", None) is None:
        speaker_source = resolve_speaker_encoder_source(init_model_path, speaker_encoder_model_path)
        auxiliary_speaker_encoder = load_speaker_encoder(speaker_source, runtime)

    train_data = load_jsonl_records(train_jsonl)
    for row in train_data:
        row["audio"] = resolve_jsonl_audio_path(str(row["audio"]), train_jsonl)
        row["ref_audio"] = resolve_jsonl_audio_path(str(row["ref_audio"]), train_jsonl)

    dataset = TTSDataset(train_data, qwen3tts.processor, config)
    train_dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=dataset.collate_fn)

    optimizer = AdamW(
        qwen3tts.model.parameters(),
        lr=args.lr,
        weight_decay=0.01,
        foreach=False,
        fused=False,
    )

    model, optimizer, train_dataloader = accelerator.prepare(qwen3tts.model, optimizer, train_dataloader)
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

            if step % 10 == 0:
                accelerator.print(f"Epoch {epoch} | Step {step} | Loss: {loss.item():.4f}")

        if accelerator.is_main_process:
            output_dir = output_model_path / f"checkpoint-epoch-{epoch}"
            shutil.copytree(str(init_model_path), str(output_dir), dirs_exist_ok=True)

            config_dict = json.loads((init_model_path / "config.json").read_text(encoding="utf-8"))
            config_dict["tts_model_type"] = "custom_voice"
            talker_config = dict(config_dict.get("talker_config", {}) or {})
            spk_id_map = dict(talker_config.get("spk_id", {}) or {})
            spk_is_dialect = dict(talker_config.get("spk_is_dialect", {}) or {})
            speaker_id = resolve_output_speaker_id(talker_config, args.speaker_name)
            spk_id_map[args.speaker_name] = speaker_id
            spk_is_dialect[args.speaker_name] = False
            talker_config["spk_id"] = spk_id_map
            talker_config["spk_is_dialect"] = spk_is_dialect
            config_dict["talker_config"] = talker_config
            (output_dir / "config.json").write_text(json.dumps(config_dict, indent=2, ensure_ascii=False), encoding="utf-8")

            unwrapped_model = accelerator.unwrap_model(model)
            state_dict = {key: value.detach().to("cpu") for key, value in unwrapped_model.state_dict().items()}

            # Keep the exported checkpoint aligned with the current stock CustomVoice
            # inference layout while swapping in the new speaker embedding.
            for key in list(state_dict.keys()):
                if key.startswith("speaker_encoder"):
                    del state_dict[key]

            codec_weight = state_dict["talker.model.codec_embedding.weight"]
            state_dict["talker.model.codec_embedding.weight"][speaker_id] = TARGET_SPEAKER_EMBEDDING[0].detach().to(
                codec_weight.device
            ).to(codec_weight.dtype)
            save_file(state_dict, str(output_dir / "model.safetensors"))

    if accelerator.is_main_process:
        finalize_checkpoint_layout(output_model_path)


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI parser for all wrapper commands."""

    parser = argparse.ArgumentParser(description="Demo-side wrappers for pristine upstream Qwen3-TTS fine-tuning.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare-data", help="Run upstream prepare_data.py against a dataset JSONL.")
    prepare.add_argument("--dataset-root", default="data/datasets/mai_ko_full", help="Canonical dataset directory.")
    prepare.add_argument(
        "--input-jsonl",
        default="",
        help="Optional explicit raw JSONL path. Defaults to <dataset-root>/raw.jsonl.",
    )
    prepare.add_argument(
        "--output-jsonl",
        default="",
        help="Optional explicit prepared JSONL path. Defaults to <dataset-root>/prepared.jsonl.",
    )
    prepare.add_argument(
        "--tokenizer-model-path",
        default="data/models/Qwen3-TTS-Tokenizer-12Hz",
        help="Tokenizer checkpoint path used by prepare_data.py.",
    )
    prepare.add_argument("--device", default="cuda:0", help="Device forwarded to upstream prepare_data.py.")
    prepare.add_argument("--batch-infer-num", type=int, default=4, help="Tokenizer encode batch size.")
    prepare.set_defaults(func=prepare_data_command)

    base = subparsers.add_parser("train-base", help="Run pristine upstream sft_12hz.py for Base fine-tuning.")
    base.add_argument(
        "--train-jsonl",
        default="data/datasets/mai_ko_full/prepared.jsonl",
        help="Prepared JSONL path produced by prepare-data.",
    )
    base.add_argument(
        "--init-model-path",
        default="data/models/Qwen3-TTS-12Hz-1.7B-Base",
        help="Local Base checkpoint path.",
    )
    base.add_argument(
        "--output-model-path",
        default="data/finetune-runs/mai_ko_base17b_full",
        help="Directory where fine-tuned checkpoints will be written.",
    )
    base.add_argument("--batch-size", type=int, default=1)
    base.add_argument("--lr", type=float, default=2e-6)
    base.add_argument("--num-epochs", type=int, default=3)
    base.add_argument("--speaker-name", default="mai")
    base.set_defaults(func=train_base_command)

    custom = subparsers.add_parser(
        "train-customvoice",
        help="Run the demo-side standalone CustomVoice fine-tuning flow.",
    )
    custom.add_argument(
        "--train-jsonl",
        default="data/datasets/mai_ko_full/prepared.jsonl",
        help="Prepared JSONL path produced by prepare-data.",
    )
    custom.add_argument(
        "--init-model-path",
        default="data/models/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        help="Local CustomVoice checkpoint path.",
    )
    custom.add_argument(
        "--speaker-encoder-model-path",
        default="data/models/Qwen3-TTS-12Hz-1.7B-Base",
        help="Base checkpoint used only when the CustomVoice checkpoint does not embed a speaker encoder.",
    )
    custom.add_argument(
        "--output-model-path",
        default="data/finetune-runs/mai_ko_customvoice17b_full",
        help="Directory where fine-tuned checkpoints will be written.",
    )
    custom.add_argument("--batch-size", type=int, default=1)
    custom.add_argument("--lr", type=float, default=2e-6)
    custom.add_argument("--num-epochs", type=int, default=3)
    custom.add_argument("--speaker-name", default="mai")
    custom.set_defaults(func=train_customvoice_command)

    return parser


def main() -> None:
    """Dispatch the requested wrapper command."""

    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
