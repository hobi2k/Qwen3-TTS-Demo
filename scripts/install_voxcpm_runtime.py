#!/usr/bin/env python3
"""Install VoxCPM2 in a dedicated runtime environment.

Mirrors :mod:`install_mmaudio_runtime` and :mod:`install_cosyvoice_runtime`.
Run this script inside the target ``.venv-voxcpm2`` so that
``sys.executable`` is the venv interpreter.

Typical sequence::

    python3.11 -m venv .venv-voxcpm2
    source .venv-voxcpm2/bin/activate
    python scripts/install_voxcpm_runtime.py --torch-profile cu121

VoxCPM upstream pins ``torch>=2.5``. On macOS we install the default wheel
(MPS/CPU). On Linux/CUDA pass ``--torch-profile cu121/cu118/cu124`` to pick
the matching wheel index.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Iterable, List


TORCH_FAMILY = {"torch", "torchaudio", "torchvision"}
DEFAULT_TORCH_VERSION = "2.5.1"


def requirement_name(requirement: str) -> str:
    token = requirement.strip().split(";", 1)[0].split("[", 1)[0]
    for separator in ("==", ">=", "<=", "~=", "!=", ">", "<", "="):
        token = token.split(separator, 1)[0]
    return token.strip().lower().replace("_", "-")


def run(command: List[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def voxcpm_dependencies(repo_root: Path) -> List[str]:
    pyproject_path = repo_root / "pyproject.toml"
    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)
    dependencies = pyproject.get("project", {}).get("dependencies", [])
    return [item for item in dependencies if requirement_name(item) not in TORCH_FAMILY]


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
        f"Unsupported VOXCPM_TORCH_PROFILE={profile!r}. "
        "Use cu121, cu124, cu118, cpu, mps, or current."
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

    dependencies = voxcpm_dependencies(repo_root)
    if dependencies:
        command = [sys.executable, "-m", "pip", "install"]
        if extra_pip_args:
            command.extend(extra_pip_args)
        command.extend(dependencies)
        run(command)

    # Install the vendored voxcpm package itself (editable, --no-deps to keep our pins).
    run([sys.executable, "-m", "pip", "install", "--no-deps", "-e", str(repo_root)])


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(os.getenv("VOXCPM_REPO_ROOT", "vendor/VoxCPM")),
        help="Path to the VoxCPM checkout (defaults to vendor/VoxCPM).",
    )
    parser.add_argument(
        "--torch-version",
        default=os.getenv("VOXCPM_TORCH_VERSION", DEFAULT_TORCH_VERSION),
        help="Torch version to install (default: %(default)s).",
    )
    parser.add_argument(
        "--torch-profile",
        default=os.getenv("VOXCPM_TORCH_PROFILE", "current"),
        help="One of cu121, cu124, cu118, cpu, mps, current, none (default: %(default)s).",
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
    if not (repo_root / "pyproject.toml").exists():
        raise SystemExit(f"VoxCPM pyproject.toml not found at {repo_root}")

    install(
        repo_root=repo_root,
        torch_version=args.torch_version,
        torch_profile=args.torch_profile,
        skip_torch=args.skip_torch,
        extra_pip_args=args.pip_arg,
    )
    print("VoxCPM runtime install complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
