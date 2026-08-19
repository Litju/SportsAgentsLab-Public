from __future__ import annotations

import argparse
import json
from pathlib import Path

from release_common import classify_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    relative = args.path.replace("\\", "/").lstrip("./")
    result = classify_file(args.repo.resolve(), relative).as_dict()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
