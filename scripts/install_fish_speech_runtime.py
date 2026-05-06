#!/usr/bin/env python3
"""Install Fish Speech without downgrading the selected PyTorch runtime.

Fish Speech currently pins torch/torchaudio in its pyproject. That is useful
for upstream reproducibility, but it conflicts with this project using
torch 2.11 + CUDA 13.0 for RTX 50-series/Blackwell machines. This installer
keeps torch ownership in the outer demo project:

1. install the requested torch/torchaudio build first;
2. install Fish Speech dependencies except torch-family packages;
3. install Fish Speech itself with --no-deps.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path
from typing import Iterable


TORCH_FAMILY = {"torch", "torchaudio", "torchvision"}


def requirement_name(requirement: str) -> str:
    """Extract a package name from a PEP 508-ish requirement string."""

    token = requirement.strip().split(";", 1)[0].split("[", 1)[0]
    for separator in ("==", ">=", "<=", "~=", "!=", ">", "<", "="):
        token = token.split(separator, 1)[0]
    return token.strip().lower().replace("_", "-")


def run(command: list[str]) -> None:
    """Run one installer command and stream output."""

    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def has_portaudio() -> bool:
    if shutil.which("pkg-config"):
        probe = subprocess.run(
            ["pkg-config", "--exists", "portaudio-2.0"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if probe.returncode == 0:
            return True

    header_candidates = [
        Path("/opt/homebrew/include/portaudio.h"),
        Path("/usr/local/include/portaudio.h"),
        Path("/usr/include/portaudio.h"),
    ]
    return any(path.exists() for path in header_candidates)


def fish_speech_dependencies(repo_root: Path) -> list[str]:
    """Return Fish Speech dependencies excluding torch-family pins."""

    pyproject_path = repo_root / "pyproject.toml"
    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)
    dependencies = pyproject.get("project", {}).get("dependencies", [])
    skip_runtime_deps = set()
    if platform.system() == "Darwin" and not has_portaudio():
        # `pyaudio` is only needed for the interactive api_client path and
        # fails on macOS unless PortAudio headers are installed.
        # Keep it on Linux/Windows so upstream behavior stays intact there.
        skip_runtime_deps.add("pyaudio")
    return [
        item
        for item in dependencies
        if requirement_name(item) not in TORCH_FAMILY
        and requirement_name(item) not in skip_runtime_deps
    ]


def torch_specs(version: str, profile: str) -> tuple[list[str], str | None]:
    """Return torch package specs and the matching PyTorch wheel index."""

    normalized = profile.strip().lower()
    if normalized in {"none", "skip"}:
        return [], None
    if normalized == "current":
        if importlib.util.find_spec("torch") is not None and importlib.util.find_spec("torchaudio") is not None:
            return [], None
        return [f"torch=={version}", f"torchaudio=={version}"], None
    if normalized == "cpu":
        return [f"torch=={version}+cpu", f"torchaudio=={version}+cpu"], "https://download.pytorch.org/whl/cpu"
    if normalized.startswith("cu"):
        return [f"torch=={version}+{normalized}", f"torchaudio=={version}+{normalized}"], f"https://download.pytorch.org/whl/{normalized}"
    raise SystemExit(f"Unsupported FISH_SPEECH_TORCH_PROFILE={profile!r}. Use cu130, cu129, cu128, cpu, or current.")


def install_requirements(*, repo_root: Path, torch_version: str, torch_profile: str) -> None:
    """Install torch, third-party dependencies, then Fish Speech editable."""

    torch_packages, torch_index_url = torch_specs(torch_version, torch_profile)
    if torch_packages:
        command = ["uv", "pip", "install"]
        if torch_index_url:
            command.extend(["--index-url", torch_index_url])
        command.extend(torch_packages)
        run(command)

    dependencies = fish_speech_dependencies(repo_root)
    if "torchcodec" not in {requirement_name(item) for item in dependencies}:
        dependencies.append("torchcodec")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
        overrides_path = Path(handle.name)
        if torch_packages:
            for package in torch_packages:
                handle.write(package + "\n")
        handle.write("protobuf>=3.20.0,<6.0.0\n")

    try:
        if dependencies:
            run(["uv", "pip", "install", "--overrides", str(overrides_path), *dependencies])
        run(["uv", "pip", "install", "--no-deps", "-e", str(repo_root)])
    finally:
        overrides_path.unlink(missing_ok=True)


def verify_runtime(expected_version: str, expected_profile: str) -> None:
    """Fail fast if the active interpreter does not have the requested torch."""

    import torch

    expected_cuda = None if expected_profile in {"cpu", "current", "none", "skip"} else expected_profile.removeprefix("cu")
    print(f"Fish Speech torch: {torch.__version__} CUDA={torch.version.cuda} available={torch.cuda.is_available()}")
    if expected_profile not in {"current", "none", "skip"} and not torch.__version__.startswith(expected_version):
        raise SystemExit(f"Expected torch {expected_version} but found {torch.__version__}")
    if expected_cuda and torch.version.cuda and torch.version.cuda.replace(".", "") != expected_cuda:
        raise SystemExit(f"Expected CUDA {expected_cuda} wheels but torch reports CUDA {torch.version.cuda}")


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(os.environ.get("FISH_SPEECH_REPO_ROOT", "vendor/fish-speech")))
    parser.add_argument("--torch-version", default=os.environ.get("FISH_SPEECH_TORCH_VERSION", "2.11.0"))
    parser.add_argument("--torch-profile", default=os.environ.get("FISH_SPEECH_TORCH_PROFILE", "cu130"))
    args = parser.parse_args(list(argv) if argv is not None else None)

    install_requirements(
        repo_root=args.repo_root.resolve(),
        torch_version=args.torch_version,
        torch_profile=args.torch_profile,
    )
    verify_runtime(args.torch_version, args.torch_profile.strip().lower())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
