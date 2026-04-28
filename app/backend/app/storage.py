"""Filesystem-backed storage helpers for the Qwen3-TTS demo."""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import unicodedata


def utc_now() -> str:
    """현재 UTC 시각을 ISO 8601 문자열로 반환한다.

    Returns:
        타임존 정보가 포함된 UTC 타임스탬프 문자열.
    """

    return datetime.now(timezone.utc).isoformat()


class Storage:
    """데모 앱이 사용하는 파일 기반 저장소 경로와 입출력을 관리한다.

    Args:
        repo_root: 프로젝트 루트 경로.
    """

    def __init__(self, repo_root: Path):
        """저장소 디렉터리 구조를 초기화하고 필요한 폴더를 생성한다.

        Args:
            repo_root: 프로젝트 루트 경로.
        """

        self.repo_root = repo_root
        self.data_dir = repo_root / "data"
        self.uploads_dir = self.data_dir / "uploads"
        self.generated_dir = self.data_dir / "generated"
        self.clone_prompts_dir = self.data_dir / "clone-prompts"
        self.presets_dir = self.data_dir / "presets"
        self.datasets_dir = self.data_dir / "datasets"
        self.finetune_runs_dir = self.data_dir / "finetune-runs"
        self.audio_tools_dir = self.data_dir / "audio-tools"
        self.s2pro_voices_dir = self.data_dir / "s2-pro-voices"
        self.voice_images_dir = self.data_dir / "voice-images"
        self.ensure_dirs()

    def ensure_dirs(self) -> None:
        """데모에서 참조하는 모든 데이터 디렉터리를 생성한다."""

        for directory in [
            self.data_dir,
            self.uploads_dir,
            self.generated_dir,
            self.clone_prompts_dir,
            self.presets_dir,
            self.datasets_dir,
            self.finetune_runs_dir,
            self.audio_tools_dir,
            self.s2pro_voices_dir,
            self.voice_images_dir,
        ]:
            directory.mkdir(parents=True, exist_ok=True)

    def new_id(self, prefix: str) -> str:
        """레코드 종류를 구분할 수 있는 짧은 식별자를 생성한다.

        Args:
            prefix: ID 용도 구분을 위한 접두사.

        Returns:
            접두사와 랜덤 UUID 일부를 결합한 식별자.
        """

        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    def relpath(self, path: Path) -> str:
        """절대 경로를 저장용 상대 경로 문자열로 변환한다.

        Args:
            path: 프로젝트 내부 파일 경로.

        Returns:
            프로젝트 루트 기준 상대 경로.
        """

        return os.path.relpath(path, self.repo_root)

    def write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        """JSON 레코드를 UTF-8과 들여쓰기로 저장한다.

        Args:
            path: 저장할 JSON 파일 경로.
            payload: 직렬화할 레코드 데이터.
        """

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def read_json(self, path: Path) -> Dict[str, Any]:
        """JSON 파일을 읽어 딕셔너리로 반환한다.

        Args:
            path: 읽을 JSON 파일 경로.

        Returns:
            디코딩된 JSON 데이터.
        """

        return json.loads(path.read_text(encoding="utf-8"))

    def list_json_records(self, directory: Path) -> List[Dict[str, Any]]:
        """디렉터리 아래 JSON 레코드를 생성 시각 역순으로 반환한다.

        Args:
            directory: 조회할 JSON 레코드 디렉터리.

        Returns:
            최신 생성 시각 기준으로 정렬된 레코드 목록.
        """

        items: List[Dict[str, Any]] = []
        if not directory.exists():
            return items

        for path in sorted(directory.rglob("*.json")):
            payload = self.read_json(path)
            if isinstance(payload, dict):
                items.append(payload)

        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return items

    def list_json_record_paths(self, directory: Path) -> List[Path]:
        """디렉터리 아래 JSON 레코드 파일 경로를 생성 시각 역순으로 반환한다.

        Args:
            directory: 조회할 JSON 레코드 디렉터리.

        Returns:
            최신 생성 시각 기준으로 정렬된 JSON 파일 경로 목록.
        """

        paths = []
        for path in sorted(directory.rglob("*.json")):
            if not path.exists():
                continue
            payload = self.read_json(path)
            if isinstance(payload, dict):
                paths.append(path)
        paths.sort(key=lambda path: self.read_json(path).get("created_at", ""), reverse=True)
        return paths

    def record_path(self, directory: Path, record_id: str) -> Path:
        """레코드 ID에 해당하는 JSON 파일 경로를 계산한다.

        Args:
            directory: 레코드가 저장된 디렉터리.
            record_id: 레코드 식별자.

        Returns:
            JSON 파일 전체 경로.
        """

        return directory / f"{record_id}.json"

    def named_record_path(
        self,
        *,
        root: Path,
        category: str,
        label: str,
        record_id: str,
        created_at: Optional[datetime] = None,
    ) -> Path:
        """사람이 읽을 수 있는 JSON 레코드 파일 경로를 만든다.

        Args:
            root: 레코드 루트 디렉터리.
            category: 기능별 하위 카테고리.
            label: 파일명에 반영할 설명문.
            record_id: 내부 식별자.
            created_at: 기준 시각.

        Returns:
            `HHMMSS_slug__record_id.json` 형식의 레코드 경로.
        """

        moment = created_at or datetime.now(timezone.utc)
        directory = self.dated_child_dir(root, category, created_at=moment)
        slug = self.slugify(label, default=category)
        base_name = f"{moment.strftime('%H%M%S')}_{slug}__{record_id}"
        candidate = directory / f"{base_name}.json"
        index = 2
        while candidate.exists():
            candidate = directory / f"{base_name}_{index}.json"
            index += 1
        return candidate

    def slugify(self, value: str, default: str = "item", max_length: int = 48) -> str:
        """사람이 읽을 수 있는 짧은 파일명 slug를 만든다.

        Args:
            value: slug로 바꿀 원본 문자열.
            default: 내용이 비었을 때 사용할 기본값.
            max_length: 잘라낼 최대 길이.

        Returns:
            파일명에 넣기 안전한 짧은 slug.
        """

        normalized = unicodedata.normalize("NFKC", value or "").strip().lower()
        normalized = re.sub(r"[^\w\s-]", " ", normalized, flags=re.UNICODE)
        normalized = re.sub(r"[-\s]+", "-", normalized, flags=re.UNICODE).strip("-_")
        if not normalized:
            normalized = default
        return normalized[:max_length].strip("-_") or default

    def dated_child_dir(self, root: Path, category: str, created_at: Optional[datetime] = None) -> Path:
        """카테고리와 날짜 기준 하위 디렉터리를 만든다.

        Args:
            root: 기준 루트 폴더.
            category: 기능별 하위 카테고리.
            created_at: 사용할 기준 시각.

        Returns:
            `root/category/YYYY-MM-DD` 폴더 경로.
        """

        moment = created_at or datetime.now(timezone.utc)
        directory = root / self.slugify(category, default="misc") / moment.strftime("%Y-%m-%d")
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def named_output_path(
        self,
        *,
        root: Path,
        category: str,
        label: str,
        extension: str,
        created_at: Optional[datetime] = None,
        include_time: bool = True,
    ) -> Path:
        """사람이 읽을 수 있는 카테고리/날짜/slug 기반 출력 파일 경로를 만든다.

        Args:
            root: 생성물 루트 폴더.
            category: 기능별 하위 카테고리.
            label: 파일명에 반영할 설명문.
            extension: 확장자.
            created_at: 기준 시각.
            include_time: 파일명 앞에 생성 시각을 붙일지 여부.

        Returns:
            충돌을 피해 생성된 출력 파일 경로.
        """

        moment = created_at or datetime.now(timezone.utc)
        directory = self.dated_child_dir(root, category, created_at=moment)
        slug = self.slugify(label, default=category)
        ext = extension.lstrip(".") or "wav"
        base_name = f"{moment.strftime('%H%M%S')}_{slug}" if include_time else slug
        candidate = directory / f"{base_name}.{ext}"
        index = 2
        while candidate.exists():
            candidate = directory / f"{base_name}_{index}.{ext}"
            index += 1
        return candidate

    def unique_dataset_id(self, name: str) -> str:
        """데이터셋 이름 기반의 읽기 쉬운 폴더 식별자를 만든다.

        Args:
            name: 사용자가 입력한 데이터셋 이름.

        Returns:
            중복을 피한 dataset id.
        """

        base = self.slugify(name, default="dataset")
        candidate = base
        index = 2
        while self.dataset_dir(candidate).exists():
            candidate = f"{base}-{index}"
            index += 1
        return candidate

    def dataset_dir(self, dataset_id: str) -> Path:
        """데이터셋 전용 루트 디렉터리를 반환한다.

        Args:
            dataset_id: 데이터셋 식별자.

        Returns:
            `data/datasets/<dataset_id>` 경로.
        """

        return self.datasets_dir / dataset_id

    def dataset_record_path(self, dataset_id: str) -> Path:
        """데이터셋 메타데이터 파일 경로를 반환한다.

        Args:
            dataset_id: 데이터셋 식별자.

        Returns:
            데이터셋 폴더 내부의 `dataset.json` 경로.
        """

        return self.dataset_dir(dataset_id) / "dataset.json"

    def dataset_manifest_path(self, dataset_id: str) -> Path:
        """데이터셋 보조 manifest 파일 경로를 반환한다.

        Args:
            dataset_id: 데이터셋 식별자.

        Returns:
            데이터셋 폴더 내부의 `manifest.json` 경로.
        """

        return self.dataset_dir(dataset_id) / "manifest.json"

    def list_dataset_record_paths(self) -> List[Path]:
        """데이터셋 레코드 파일 경로를 모두 반환한다.

        Returns:
            새 구조의 `data/datasets/*/dataset.json`과 기존 최상위 `*.json`
            레거시 레코드를 합친 경로 목록.
        """

        nested_paths = sorted(self.datasets_dir.glob("*/dataset.json"), reverse=True)
        legacy_paths = sorted(self.datasets_dir.glob("*.json"), reverse=True)
        return nested_paths + legacy_paths

    def get_record(self, directory: Path, record_id: str) -> Optional[Dict[str, Any]]:
        """레코드가 있으면 읽고 없으면 `None`을 반환한다.

        Args:
            directory: 레코드가 저장된 디렉터리.
            record_id: 조회할 레코드 식별자.

        Returns:
            조회된 레코드 데이터 또는 `None`.
        """

        path = self.record_path(directory, record_id)
        if not path.exists():
            nested_matches = sorted(directory.rglob(f"*{record_id}.json"))
            if nested_matches:
                payload = self.read_json(nested_matches[0])
                return payload if isinstance(payload, dict) else None

            for candidate in directory.rglob("*.json"):
                payload = self.read_json(candidate)
                if isinstance(payload, dict) and payload.get("id") == record_id:
                    return payload
            return None
        payload = self.read_json(path)
        return payload if isinstance(payload, dict) else None

    def find_record_paths(self, directory: Path, record_id: str) -> List[Path]:
        """레코드 ID와 연결된 JSON 파일 경로를 모두 찾는다.

        Args:
            directory: 레코드가 저장된 루트 디렉터리.
            record_id: 찾을 레코드 식별자.

        Returns:
            주어진 ID와 연결된 JSON 파일 경로 목록.
        """

        matches: List[Path] = []
        direct_path = self.record_path(directory, record_id)
        if direct_path.exists():
            matches.append(direct_path)

        for candidate in sorted(directory.rglob("*.json")):
            if candidate in matches:
                continue
            try:
                payload = self.read_json(candidate)
            except Exception:
                continue
            if isinstance(payload, dict) and payload.get("id") == record_id:
                matches.append(candidate)

        return matches
