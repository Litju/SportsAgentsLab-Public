from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from release_common import HELDOUT_PATH_MARKERS, text_files


CONTENT = re.compile(r"\b(?:held[-_ ]out|answer[-_ ]key|oracle[-_ ]answer|blind[-_ ]evaluation)\b", re.IGNORECASE)


def scan(root: Path) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    for path, text in text_files(root):
        relative = path.relative_to(root).as_posix()
        lower = relative.lower()
        if any(marker in lower for marker in HELDOUT_PATH_MARKERS):
            findings.append({"path": relative, "kind": "heldout_path"})
            continue
        if path.suffix.lower() in {".md", ".rst", ".yaml", ".yml"}:
            continue
        for line_number, line in enumerate(text.splitlines(), 1):
            if CONTENT.search(line):
                findings.append({"path": relative, "line": line_number, "kind": "heldout_content"})
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
