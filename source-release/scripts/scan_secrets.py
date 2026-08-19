from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from release_common import is_placeholder, text_files


TOKEN_PATTERNS = (
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._-]{24,}\b"),
)
ASSIGNMENT = re.compile(
    r"(?m)^\s*(?:export\s+)?((?:[A-Z][A-Z0-9_]*_)?(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*[:=]\s*['\"]?([^'\"\r\n#]+)"
)
DSN = re.compile(r"\b(?:postgres(?:ql)?|mysql|redis)://[^\s:/]+:([^\s@]+)@", re.IGNORECASE)
PEM = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
CONFIG_SUFFIXES = {".env", ".ini", ".json", ".properties", ".toml", ".cfg", ".yaml", ".yml"}


def scan(root: Path) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    for path, text in text_files(root):
        relative = path.relative_to(root).as_posix()
        for line_number, line in enumerate(text.splitlines(), 1):
            if PEM.search(line):
                findings.append({"path": relative, "line": line_number, "kind": "private_key"})
            for pattern in TOKEN_PATTERNS:
                if pattern.search(line):
                    findings.append({"path": relative, "line": line_number, "kind": "token_pattern"})
            if path.suffix.lower() in CONFIG_SUFFIXES or path.name.startswith(".env"):
                for match in ASSIGNMENT.finditer(line):
                    name = match.group(1)
                    value = match.group(2).strip()
                    if name.startswith("EXCLUDE_") or name.startswith("FORBIDDEN_"):
                        continue
                    if not is_placeholder(value):
                        findings.append({"path": relative, "line": line_number, "kind": "secret_assignment", "name": name})
            for match in DSN.finditer(line):
                if not is_placeholder(match.group(1)):
                    findings.append({"path": relative, "line": line_number, "kind": "credentialed_connection_string"})
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
