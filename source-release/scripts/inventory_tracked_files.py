from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from release_common import canonical_json, git_value, inventory


def build_inventory(repo: Path) -> dict[str, object]:
    records = [record.as_dict() for record in inventory(repo)]
    counts = Counter(record["classification"] for record in records)
    unclassified = [record for record in records if record["classification"] not in counts]
    result: dict[str, object] = {
        "schema": "sportsagentslab.tracked-file-inventory.v1",
        "mission": "SPORTSAGENTSLAB_FULL_PUBLIC_SOURCE_RELEASE_V1",
        "private_release_branch": git_value(repo, "branch", "--show-current"),
        "private_head": git_value(repo, "rev-parse", "HEAD"),
        "tracked_file_count": len(records),
        "unclassified_count": len(unclassified),
        "classification_counts": dict(sorted(counts.items())),
        "records": records,
    }
    result["inventory_sha256"] = __import__("hashlib").sha256(canonical_json(result)).hexdigest()
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("source-release/receipts/PRIVATE_TRACKED_FILE_INVENTORY.json"),
    )
    args = parser.parse_args()
    repo = args.repo.resolve()
    result = build_inventory(repo)
    output = args.output if args.output.is_absolute() else repo / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(canonical_json(result))
    print(json.dumps({key: result[key] for key in ("tracked_file_count", "unclassified_count", "classification_counts", "private_release_branch", "private_head")}, indent=2))
    return 0 if result["unclassified_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
