from __future__ import annotations

import argparse
import json
from pathlib import Path

from release_common import iter_files


REVIEW_SEGMENTS = {"vendor", "third_party", "third-party", "nonredistributable"}
REVIEW_EXTENSIONS = {".jar", ".whl", ".tgz", ".gem", ".nupkg"}


def scan(root: Path) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    for path in iter_files(root):
        relative = path.relative_to(root).as_posix()
        parts = {part.lower() for part in path.relative_to(root).parts}
        if parts.intersection(REVIEW_SEGMENTS) or path.suffix.lower() in REVIEW_EXTENSIONS:
            findings.append({"path": relative, "kind": "redistribution_rights_review"})
    return {"root": str(root), "findings": findings, "finding_count": len(findings)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    result = scan(args.root.resolve())
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if result["findings"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
