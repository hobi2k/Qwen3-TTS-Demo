#!/usr/bin/env python3
"""Install CosyVoice 3 in a dedicated runtime environment.

This installer mirrors ``install_mmaudio_runtime.py`` but reads CosyVoice
dependencies from ``vendor/CosyVoice/requirements.txt`` (the upstream does
not ship a ``pyproject.toml``). Run it inside the target ``.venv-cosyvoice3``
so that ``sys.executable`` is the venv interpreter.

Typical sequence::

    python -m venv .venv-cosyvoice3
    source .venv-cosyvoice3/bin/activate
    python scripts/install_cosyvoice_runtime.py --torch-profile cu121

CosyVoice upstream pins torch==2.3.1 + CUDA 12.1. On macOS we fall back to
the CPU/MPS build (the requirements file already filters tensorrt/deepspeed
to Linux only).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

TORCH_FAMILY = {"torch", "torchaudio", "torchvision"}
DEFAULT_TORCH_VERSION = "2.3.1"


def requirement_name(requirement: str) -> str:
    token = requirement.strip().split(";", 1)[0].split("[", 1)[0]
    for separator in ("==", ">=", "<=", "~=", "!=", ">", "<", "="):
        token = token.split(separator, 1)[0]
    return token.strip().lower().replace("_", "-")


def run(command: List[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def normalize_index_url(raw: str) -> str:
    return raw.split(" #", 1)[0].strip()


def should_use_extra_index(url: str) -> bool:
    normalized = normalize_index_url(url)
    if "aiinfra.pkgs.visualstudio.com" in normalized and sys.platform != "linux":
        return False
    return True


def parse_requirements(requirements_path: Path) -> tuple[List[str], List[str]]:
    """Return (extra_index_urls, requirement_lines) without torch-family pins."""

    extra_index_urls: List[str] = []
    requirements: List[str] = []
    for raw in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--extra-index-url"):
            url = normalize_index_url(line.split(maxsplit=1)[1].strip())
            if should_use_extra_index(url):
                extra_index_urls.append(url)
            continue
        if line.startswith("--"):
            continue
        if requirement_name(line) in TORCH_FAMILY:
            continue
        requirements.append(line)
    return extra_index_urls, requirements


def torch_specs(version: str, profile: str) -> tuple[List[str], str | None]:
    normalized = profile.strip().lower()
    if normalized in {"none", "skip"}:
        return [], None
    if normalized == "current":
        try:
            import importlib.util

            if (
                importlib.util.find_spec("torch") is not None
                and importlib.util.find_spec("torchaudio") is not None
            ):
                return [], None
        except Exception:
            pass
        return [f"torch=={version}", f"torchaudio=={version}"], None
    if normalized == "cpu":
        return (
            [f"torch=={version}+cpu", f"torchaudio=={version}+cpu"],
            "https://download.pytorch.org/whl/cpu",
        )
    if normalized == "mps":
        return [f"torch=={version}", f"torchaudio=={version}"], None
    if normalized.startswith("cu"):
        return (
            [f"torch=={version}+{normalized}", f"torchaudio=={version}+{normalized}"],
            f"https://download.pytorch.org/whl/{normalized}",
        )
    raise SystemExit(
        f"Unsupported COSYVOICE_TORCH_PROFILE={profile!r}. "
        "Use cu121, cu118, cpu, mps, or current."
    )


def install(
    *,
    repo_root: Path,
    torch_version: str,
    torch_profile: str,
    skip_torch: bool,
    extra_pip_args: List[str] | None = None,
) -> None:
    torch_packages, torch_index_url = torch_specs(torch_version, torch_profile)
    if torch_packages and not skip_torch:
        command = [sys.executable, "-m", "pip", "install"]
        if torch_index_url:
            command.extend(["--index-url", torch_index_url])
        command.extend(torch_packages)
        run(command)

    extra_indices, requirements = parse_requirements(repo_root / "requirements.txt")
    if requirements:
        command = [sys.executable, "-m", "pip", "install"]
        for url in extra_indices:
            command.extend(["--extra-index-url", url])
        if extra_pip_args:
            command.extend(extra_pip_args)
        command.extend(requirements)
        run(command)

    # CosyVoice 3 expects Matcha-TTS on sys.path at runtime; ensure it exists.
    matcha = repo_root / "third_party" / "Matcha-TTS"
    if not matcha.exists():
        print(
            f"warn: third_party/Matcha-TTS not found under {repo_root}. "
            "Initialize submodules with `git submodule update --init --recursive` "
            "inside the vendor checkout before running inference.",
            file=sys.stderr,
        )


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(os.getenv("COSYVOICE_REPO_ROOT", "vendor/CosyVoice")),
        help="Path to the CosyVoice checkout (defaults to vendor/CosyVoice).",
    )
    parser.add_argument(
        "--torch-version",
        default=os.getenv("COSYVOICE_TORCH_VERSION", DEFAULT_TORCH_VERSION),
        help="Torch version to install (default: %(default)s).",
    )
    parser.add_argument(
        "--torch-profile",
        default=os.getenv("COSYVOICE_TORCH_PROFILE", "current"),
        help="One of cu121, cu118, cpu, mps, current, none (default: %(default)s).",
    )
    parser.add_argument(
        "--skip-torch",
        action="store_true",
        help="Skip torch install (assume already present).",
    )
    parser.add_argument(
        "--pip-arg",
        action="append",
        default=[],
        help="Additional argument to forward to pip (repeatable).",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    repo_root = args.repo_root.expanduser().resolve()
    if not (repo_root / "requirements.txt").exists():
        raise SystemExit(f"CosyVoice requirements.txt not found at {repo_root}")

    install(
        repo_root=repo_root,
        torch_version=args.torch_version,
        torch_profile=args.torch_profile,
        skip_torch=args.skip_torch,
        extra_pip_args=args.pip_arg,
    )
    print("CosyVoice runtime install complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
