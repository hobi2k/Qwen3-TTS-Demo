#!/usr/bin/env python3
"""Compatibility wrapper for VoiceBox bootstrap training."""

from __future__ import annotations

from sft_voicebox_bootstrap_12hz import main as run_bootstrap_main


def main() -> None:
    """Run the canonical local VoiceBox bootstrap implementation."""

    run_bootstrap_main()


if __name__ == "__main__":
    main()
