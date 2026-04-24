#!/usr/bin/env python3
"""Compatibility wrapper for stage-1 plain CustomVoice fine-tuning."""

from __future__ import annotations

from sft_plain_custom_voice_12hz import main as run_stage1_main


def main() -> None:
    """Run the canonical local stage-1 implementation."""

    run_stage1_main()


if __name__ == "__main__":
    main()
