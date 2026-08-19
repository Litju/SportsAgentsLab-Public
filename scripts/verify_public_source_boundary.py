"""Verify the structural boundary of the public snapshot."""

from __future__ import annotations

from pathlib import Path
import sys


ALLOWED_TOP_LEVEL = {".github", "apps", "assets", "docs", "examples", "packages", "scripts", "tests"}
FORBIDDEN_SUFFIXES = {".env", ".pem", ".key", ".p12", ".sqlite", ".db", ".pyc", ".map"}


def verify(root: Path) -> list[str]:
    findings: list[str] = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if path.is_symlink():
            findings.append(f"symlink: {relative}")
        if path.is_file() and path.suffix.lower() in FORBIDDEN_SUFFIXES:
            findings.append(f"forbidden extension: {relative}")
        if relative.parts and relative.parts[0] not in ALLOWED_TOP_LEVEL and len(relative.parts) > 1:
            findings.append(f"unexpected top-level path: {relative}")
        if path.is_file() and path.suffix.lower() in {".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".html", ".css", ".json", ".yaml", ".yml", ".svg"}:
            text = path.read_text(encoding="utf-8")
            source_map_marker = "source" + "MappingURL"
            windows_path_marker = "C:" + "\\" + "Users" + "\\"
            unix_home_marker = "/" + "home/"
            unix_users_marker = "/" + "Users/"
            if source_map_marker in text or windows_path_marker in text or unix_home_marker in text or unix_users_marker in text:
                findings.append(f"path or source-map reference: {relative}")
    required = ("README.md", "LICENSE", "NOTICE", "SECURITY.md", "CONTRIBUTING.md", "TRADEMARKS.md", "assets/manifest.json")
    for item in required:
        if not (root / item).is_file():
            findings.append(f"missing required file: {item}")
    return findings


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    findings = verify(root)
    if findings:
        print("\n".join(findings), file=sys.stderr)
        return 1
    print("PUBLIC_SOURCE_BOUNDARY=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
