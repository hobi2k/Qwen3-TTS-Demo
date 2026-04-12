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
import json

from qwen_tts import Qwen3TTSTokenizer

DEFAULT_BATCH_INFER_NUM = 32


def validate_12hz_code_shape(code, tokenizer_model_path: str) -> None:
    if code.dim() != 2:
        raise ValueError(
            f"Expected 12Hz audio_codes to be 2D (T, num_quantizers), got shape={tuple(code.shape)} "
            f"from tokenizer_model_path={tokenizer_model_path!r}."
        )
    if code.shape[1] != 16:
        raise ValueError(
            f"Expected 12Hz audio_codes second dimension to be 16, got shape={tuple(code.shape)} "
            f"from tokenizer_model_path={tokenizer_model_path!r}."
        )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", type=str, default="cuda:0")
    parser.add_argument("--tokenizer_model_path", type=str, default="Qwen/Qwen3-TTS-Tokenizer-12Hz")
    parser.add_argument("--input_jsonl", type=str, required=True)
    parser.add_argument("--output_jsonl", type=str, required=True)
    parser.add_argument(
        "--batch_infer_num",
        type=int,
        default=DEFAULT_BATCH_INFER_NUM,
        help="How many audio files to tokenize per batch. Lower this when VRAM is limited.",
    )
    args = parser.parse_args()

    tokenizer_12hz = Qwen3TTSTokenizer.from_pretrained(
        args.tokenizer_model_path,
        device_map=args.device,
    )
    model_type = getattr(getattr(tokenizer_12hz, "model", None), "config", None)
    model_type = getattr(model_type, "model_type", None)
    if model_type != "qwen3_tts_tokenizer_12hz":
        raise ValueError(
            f"prepare_data.py requires the 12Hz tokenizer, got model_type={model_type!r} "
            f"from tokenizer_model_path={args.tokenizer_model_path!r}."
        )

    total_lines = open(args.input_jsonl).readlines()
    total_lines = [json.loads(line.strip()) for line in total_lines]

    final_lines = []
    batch_lines = []
    batch_audios = []
    for line in total_lines:

        batch_lines.append(line)
        batch_audios.append(line['audio'])

        if len(batch_lines) >= args.batch_infer_num:
            enc_res = tokenizer_12hz.encode(batch_audios)
            for code, line in zip(enc_res.audio_codes, batch_lines):
                validate_12hz_code_shape(code, args.tokenizer_model_path)
                line['audio_codes'] = code.cpu().tolist()
                final_lines.append(line)
            batch_lines.clear()
            batch_audios.clear()

    if len(batch_audios) > 0:
        enc_res = tokenizer_12hz.encode(batch_audios)
        for code, line in zip(enc_res.audio_codes, batch_lines):
            validate_12hz_code_shape(code, args.tokenizer_model_path)
            line['audio_codes'] = code.cpu().tolist()
            final_lines.append(line)
        batch_lines.clear()
        batch_audios.clear()

    final_lines = [json.dumps(line, ensure_ascii=False) for line in final_lines]

    with open(args.output_jsonl, 'w') as f:
        for line in final_lines:
            f.writelines(line + '\n')

if __name__ == "__main__":
    main()
