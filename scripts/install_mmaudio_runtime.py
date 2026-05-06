#!/usr/bin/env python3
"""Install MMAudio in a platform-aware runtime environment.

MMAudio upstream documents Ubuntu first, but its inference entrypoint already
supports CUDA, MPS, and CPU device selection. This installer keeps the runtime
explicit and reproducible for both macOS and Linux:

1. install the requested torch family first;
2. install MMAudio third-party dependencies except torch-family packages;
3. install the vendored MMAudio source editable with --no-deps.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Iterable


TORCH_FAMILY = {"torch", "torchaudio", "torchvision"}


def requirement_name(requirement: str) -> str:
    token = requirement.strip().split(";", 1)[0].split("[", 1)[0]
    for separator in ("==", ">=", "<=", "~=", "!=", ">", "<", "="):
        token = token.split(separator, 1)[0]
    return token.strip().lower().replace("_", "-")


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def mmaudio_dependencies(repo_root: Path) -> list[str]:
    pyproject_path = repo_root / "pyproject.toml"
    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)
    dependencies = pyproject.get("project", {}).get("dependencies", [])
    return [item for item in dependencies if requirement_name(item) not in TORCH_FAMILY]


def torch_specs(version: str, profile: str) -> tuple[list[str], str | None]:
    normalized = profile.strip().lower()
    if normalized in {"none", "skip"}:
        return [], None
    if normalized == "current":
        if importlib.util.find_spec("torch") is not None and importlib.util.find_spec("torchaudio") is not None:
            return [], None
        return [f"torch=={version}", f"torchaudio=={version}", f"torchvision=={version}"], None
    if normalized == "cpu":
        return [
            f"torch=={version}+cpu",
            f"torchaudio=={version}+cpu",
            f"torchvision=={version}+cpu",
        ], "https://download.pytorch.org/whl/cpu"
    if normalized.startswith("cu"):
        return [
            f"torch=={version}+{normalized}",
            f"torchaudio=={version}+{normalized}",
            f"torchvision=={version}+{normalized}",
        ], f"https://download.pytorch.org/whl/{normalized}"
    raise SystemExit(
        f"Unsupported MMAUDIO_TORCH_PROFILE={profile!r}. Use cu130, cu129, cu128, cpu, or current."
    )


def install_requirements(*, repo_root: Path, torch_version: str, torch_profile: str) -> None:
    torch_packages, torch_index_url = torch_specs(torch_version, torch_profile)
    if torch_packages:
        command = [sys.executable, "-m", "pip", "install"]
        if torch_index_url:
            command.extend(["--index-url", torch_index_url])
        command.extend(torch_packages)
        run(command)

    dependencies = mmaudio_dependencies(repo_root)
    if dependencies:
        run([sys.executable, "-m", "pip", "install", *dependencies])
    run([sys.executable, "-m", "pip", "install", "--no-deps", "-e", str(repo_root)])


def verify_runtime(expected_version: str, expected_profile: str) -> None:
    import torch

    normalized = expected_profile.strip().lower()
    print(f"MMAudio torch: {torch.__version__} CUDA={torch.version.cuda} available={torch.cuda.is_available()}")
    if normalized not in {"current", "none", "skip"} and not torch.__version__.startswith(expected_version):
        raise SystemExit(f"Expected torch {expected_version} but found {torch.__version__}")
    if normalized.startswith("cu") and torch.version.cuda and torch.version.cuda.replace(".", "") != normalized.removeprefix("cu"):
        raise SystemExit(f"Expected CUDA {normalized} wheels but torch reports CUDA {torch.version.cuda}")


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(os.environ.get("MMAUDIO_REPO_ROOT", "vendor/MMAudio")))
    parser.add_argument("--torch-version", default=os.environ.get("MMAUDIO_TORCH_VERSION", "2.11.0"))
    parser.add_argument("--torch-profile", default=os.environ.get("MMAUDIO_TORCH_PROFILE", "current"))
    args = parser.parse_args(list(argv) if argv is not None else None)

    install_requirements(
        repo_root=args.repo_root.resolve(),
        torch_version=args.torch_version,
        torch_profile=args.torch_profile,
    )
    verify_runtime(args.torch_version, args.torch_profile)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
