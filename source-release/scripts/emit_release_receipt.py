from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from inventory_tracked_files import build_inventory
from release_common import canonical_json, git_value, read_text, sha256_file, tree_hash


def emit(
    private_repo: Path,
    public_root: Path | None,
    output: Path | None,
    *,
    private_pr: str | None = None,
    public_pr: str | None = None,
    public_merge: str | None = None,
    security: dict[str, object] | None = None,
) -> Path:
    private_repo = private_repo.resolve()
    inventory = build_inventory(private_repo)
    receipt: dict[str, object] = {
        "schema": "sportsagentslab.private-release-receipt.v1",
        "mission": "SPORTSAGENTSLAB_FULL_PUBLIC_SOURCE_RELEASE_V1",
        "status": "PASS",
        "private_release_branch": inventory["private_release_branch"],
        "private_head": inventory["private_head"],
        "tracked_file_count": inventory["tracked_file_count"],
        "classification_counts": inventory["classification_counts"],
        "unclassified_count": inventory["unclassified_count"],
        "public_tree_sha256": None,
        "public_license_sha256": None,
        "public_pr": public_pr,
        "public_merge": public_merge,
        "private_pr": private_pr,
        "security_settings": security or {},
        "b02_advanced": False,
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    if public_root is not None:
        public_root = public_root.resolve()
        receipt["public_tree_sha256"] = tree_hash(public_root, exclude={"PUBLIC_SOURCE_RELEASE.json"})
        license_path = public_root / "LICENSE"
        if license_path.is_file():
            receipt["public_license_sha256"] = sha256_file(license_path)
    target = output or (private_repo / "source-release/receipts/PRIVATE_RELEASE_RECEIPT.json")
    target = target if target.is_absolute() else private_repo / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(canonical_json(receipt))
    text_target = target.with_suffix(".txt")
    text_target.write_text(
        "SportsAgentsLab private release receipt\n"
        f"mission={receipt['mission']}\n"
        f"status={receipt['status']}\n"
        f"private_release_branch={receipt['private_release_branch']}\n"
        f"private_head={receipt['private_head']}\n"
        f"tracked_file_count={receipt['tracked_file_count']}\n"
        f"unclassified_count={receipt['unclassified_count']}\n"
        f"public_tree_sha256={receipt['public_tree_sha256']}\n"
        f"public_license_sha256={receipt['public_license_sha256']}\n"
        f"private_pr={receipt['private_pr']}\n"
        f"public_pr={receipt['public_pr']}\n"
        f"public_merge={receipt['public_merge']}\n"
        "b02_advanced=False\n",
        encoding="utf-8",
        newline="",
    )
    print(json.dumps(receipt, indent=2, ensure_ascii=False))
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--public", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--private-pr")
    parser.add_argument("--public-pr")
    parser.add_argument("--public-merge")
    args = parser.parse_args()
    emit(
        args.repo,
        args.public,
        args.output,
        private_pr=args.private_pr,
        public_pr=args.public_pr,
        public_merge=args.public_merge,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
