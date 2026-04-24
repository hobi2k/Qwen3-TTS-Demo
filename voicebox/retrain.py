#!/usr/bin/env python3
"""Compatibility wrapper for VoiceBox-only retraining."""

from __future__ import annotations

from sft_voicebox_12hz import main as run_retrain_main


def main() -> None:
    """Run the canonical local VoiceBox retraining implementation."""

    run_retrain_main()


if __name__ == "__main__":
    main()
