#!/usr/bin/env python3
"""Inspect what Applio-related assets are actually present in the project.

This script exists to answer a practical question for operators:
``download_models.sh`` clones the Applio repository, but does it also fetch a
usable RVC model and index pair?
"""

from __future__ import annotations

import json
import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VENDOR_APPLIO = REPO_ROOT / "vendor" / "Applio"
RVC_MODELS_DIR = REPO_ROOT / "data" / "rvc-models"


def repo_path_from_env(name: str, default: Path) -> Path:
    """Resolve an environment override or fall back to a project path."""

    value = (os.getenv(name) or "").strip()
    if not value:
        return default
    path = Path(value).expanduser()
    return path if path.is_absolute() else (REPO_ROOT / path).resolve()


def main() -> None:
    """Print a JSON report describing Applio repository and RVC asset presence."""

    applio_root = repo_path_from_env("APPLIO_REPO_ROOT", VENDOR_APPLIO)
    rvc_root = repo_path_from_env("APPLIO_MODEL_DIR", RVC_MODELS_DIR)
    model_files = sorted(str(path.resolve()) for path in rvc_root.rglob("*.pth")) if rvc_root.exists() else []
    index_files = sorted(str(path.resolve()) for path in rvc_root.rglob("*.index")) if rvc_root.exists() else []

    report = {
        "applio_repo_root": str(applio_root),
        "applio_repo_present": (applio_root / "core.py").exists(),
        "rvc_model_root": str(rvc_root),
        "rvc_model_count": len(model_files),
        "rvc_index_count": len(index_files),
        "rvc_models": model_files,
        "rvc_indexes": index_files,
        "download_env": {
            "APPLIO_RVC_MODEL_URL": bool((os.getenv("APPLIO_RVC_MODEL_URL") or "").strip()),
            "APPLIO_RVC_INDEX_URL": bool((os.getenv("APPLIO_RVC_INDEX_URL") or "").strip()),
        },
        "summary": (
            "Applio repository is present, but no usable voice-conversion model pair was found."
            if not model_files or not index_files
            else "Applio repository and at least one .pth/.index pair are present."
        ),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
