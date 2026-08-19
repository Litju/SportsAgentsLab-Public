from __future__ import annotations

import argparse
from pathlib import Path

from release_common import redact_config_text, read_text


def redact(source: Path, destination: Path) -> None:
    text = read_text(source)
    if text is None:
        raise ValueError(f"configuration is not UTF-8 text: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(redact_config_text(text), encoding="utf-8", newline="")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination")
    args = parser.parse_args()
    redact(args.source, Path(args.destination))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
