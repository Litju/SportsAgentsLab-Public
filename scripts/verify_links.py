"""Check that local Markdown links point to files in the public tree."""

from pathlib import Path
import re
import sys


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    findings = []
    for path in root.rglob("*.md"):
        for target in re.findall(r"\[[^]]+\]\(([^)#]+)", path.read_text(encoding="utf-8")):
            if "://" in target or target.startswith("#"):
                continue
            if not (path.parent / target).resolve().is_file():
                findings.append(f"{path.relative_to(root)} -> {target}")
    if findings:
        print("\n".join(findings), file=sys.stderr)
        return 1
    print("LOCAL_LINK_CHECK=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
