from __future__ import annotations

import argparse
import json
from pathlib import Path

from .replay import replay_manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--repository-root")
    args = parser.parse_args()
    manifest_path = Path(args.manifest).resolve()
    repository_root = (
        Path(args.repository_root).resolve()
        if args.repository_root
        else manifest_path.parents[2]
    )
    result = replay_manifest(manifest_path, repository_root)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
