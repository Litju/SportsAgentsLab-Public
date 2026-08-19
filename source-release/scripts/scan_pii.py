from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from release_common import text_files


EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[ .-])(?:\(?\d{2,4}\)?[ .-])?\d{3,4}[ .-]\d{3,4}(?!\w)")
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
SAFE_EMAIL_DOMAINS = {"example.com", "example.org", "example.net", "localhost"}


def scan(root: Path) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    for path, text in text_files(root):
        relative = path.relative_to(root).as_posix()
        for line_number, line in enumerate(text.splitlines(), 1):
            for match in EMAIL.finditer(line):
                domain = match.group(0).rsplit("@", 1)[1].lower()
                if domain not in SAFE_EMAIL_DOMAINS:
                    findings.append({"path": relative, "line": line_number, "kind": "email", "value": "<redacted-email>"})
            for kind, pattern in (("phone", PHONE), ("ssn", SSN)):
                if pattern.search(line):
                    findings.append({"path": relative, "line": line_number, "kind": kind, "value": "<redacted>"})
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
