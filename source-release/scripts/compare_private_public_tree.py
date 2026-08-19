from __future__ import annotations

import argparse
import json
from pathlib import Path

from release_common import canonical_tree_bytes, inventory, repo_path, sha256_bytes


def compare(private_repo: Path, public_root: Path) -> dict[str, object]:
    private_repo = private_repo.resolve()
    public_root = public_root.resolve()
    records = inventory(private_repo)
    mismatches: list[dict[str, str]] = []
    exact_count = 0
    transformed_count = 0
    excluded_count = 0
    for record in records:
        destination = public_root / Path(*record.public_path.split("/"))
        if record.classification.startswith("EXCLUDE_"):
            excluded_count += 1
            if destination.exists():
                mismatches.append({"path": record.path, "kind": "excluded_path_present"})
            continue
        if record.path in {"README.md", "CONTRIBUTING.md"}:
            # Replaced by source-release/public governance assets.
            transformed_count += 1
            continue
        if not destination.is_file():
            mismatches.append({"path": record.path, "kind": "missing_public_path"})
            continue
        if record.classification == "PUBLISH_AS_IS":
            expected = sha256_bytes(canonical_tree_bytes(repo_path(private_repo, record.path)))
            actual = sha256_bytes(canonical_tree_bytes(destination))
            if expected != actual:
                mismatches.append({"path": record.path, "kind": "byte_hash_mismatch"})
            else:
                exact_count += 1
        else:
            transformed_count += 1
    result = {
        "private_tracked_file_count": len(records),
        "exact_match_count": exact_count,
        "transformed_match_count": transformed_count,
        "excluded_count": excluded_count,
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if mismatches:
        raise ValueError(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--public", type=Path, required=True)
    args = parser.parse_args()
    compare(args.private, args.public)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
