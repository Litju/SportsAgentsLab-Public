from __future__ import annotations

import argparse
import json
from pathlib import Path

from release_common import text_files


def markers() -> tuple[str, ...]:
    # Construct markers so this scanner does not report its own policy strings.
    return (
        "C:" + "\\" + "Users" + "\\",
        "/" + "home" + "/",
        "/" + "Users" + "/",
        ".git" + "\\",
        ".git" + "/",
        "file" + "://",
    )


def scan(root: Path) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    marker_values = markers()
    for path, text in text_files(root):
        relative = path.relative_to(root).as_posix()
        for line_number, line in enumerate(text.splitlines(), 1):
            for marker in marker_values:
                if marker in line:
                    findings.append({"path": relative, "line": line_number, "kind": "local_metadata", "marker": marker.replace("\\", "/")})
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
