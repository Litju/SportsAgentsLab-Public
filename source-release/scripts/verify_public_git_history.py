from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.strip()


def verify(root: Path) -> dict[str, object]:
    root = root.resolve()
    remotes = git(root, "remote", "-v")
    commits = [line for line in git(root, "rev-list", "--all").splitlines() if line]
    roots = [line for line in git(root, "rev-list", "--max-parents=0", "--all").splitlines() if line]
    result = {
        "root": str(root),
        "remote_contains_private_repo": "sportsagentslab-mef" in remotes.lower(),
        "commit_count": len(commits),
        "root_commit_count": len(roots),
        "remotes": remotes,
    }
    if result["remote_contains_private_repo"]:
        raise ValueError(json.dumps(result, indent=2))
    if result["root_commit_count"] != 1:
        raise ValueError(json.dumps(result, indent=2))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-root", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.public_root)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
