from __future__ import annotations

import argparse
from pathlib import Path

from release_common import generate_env_example_text, read_text


def generate(source: Path, destination: Path) -> None:
    text = read_text(source)
    if text is None:
        raise ValueError(f"environment example is not UTF-8 text: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(generate_env_example_text(text), encoding="utf-8", newline="")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    generate(args.source, args.destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
