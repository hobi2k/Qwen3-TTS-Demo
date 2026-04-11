# coding=utf-8
# Copyright 2026 The Alibaba Qwen team.
# SPDX-License-Identifier: Apache-2.0

"""CustomVoice-focused 12Hz fine-tuning entrypoint.

This script keeps the Base-model SFT path intact while exposing a separate
entrypoint for the workflow "start from CustomVoice, add a new speaker, and
preserve instruct-capable export format".
"""

from sft_12hz import build_arg_parser, train_with_args


def train_custom_voice():
    """Run fine-tuning starting from a CustomVoice checkpoint."""

    parser = build_arg_parser(default_init_model_path="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
    parser.description = (
        "Fine-tune a 12Hz CustomVoice checkpoint with an auxiliary speaker encoder "
        "so the exported checkpoint remains usable through generate_custom_voice()."
    )
    args = parser.parse_args()
    train_with_args(args)


if __name__ == "__main__":
    train_custom_voice()
