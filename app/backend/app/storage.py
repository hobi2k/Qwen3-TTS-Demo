import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Storage:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.data_dir = repo_root / "data"
        self.uploads_dir = self.data_dir / "uploads"
        self.generated_dir = self.data_dir / "generated"
        self.clone_prompts_dir = self.data_dir / "clone-prompts"
        self.presets_dir = self.data_dir / "presets"
        self.datasets_dir = self.data_dir / "datasets"
        self.finetune_runs_dir = self.data_dir / "finetune-runs"
        self.ensure_dirs()

    def ensure_dirs(self) -> None:
        for directory in [
            self.data_dir,
            self.uploads_dir,
            self.generated_dir,
            self.clone_prompts_dir,
            self.presets_dir,
            self.datasets_dir,
            self.finetune_runs_dir,
        ]:
            directory.mkdir(parents=True, exist_ok=True)

    def new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    def relpath(self, path: Path) -> str:
        return os.path.relpath(path, self.repo_root)

    def write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def read_json(self, path: Path) -> Dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    def list_json_records(self, directory: Path) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        if not directory.exists():
            return items

        for path in sorted(directory.glob("*.json")):
            items.append(self.read_json(path))

        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return items

    def record_path(self, directory: Path, record_id: str) -> Path:
        return directory / f"{record_id}.json"

    def get_record(self, directory: Path, record_id: str) -> Optional[Dict[str, Any]]:
        path = self.record_path(directory, record_id)
        if not path.exists():
            return None
        return self.read_json(path)

