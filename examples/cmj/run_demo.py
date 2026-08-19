"""Run the public synthetic CMJ example offline."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "public-science" / "src"))

from cmj_illustrative import canonical_json, content_hash, generate_synthetic_trace, summarize_trace


def main() -> None:
    trace = generate_synthetic_trace()
    print(json.dumps({"summary": summarize_trace(trace).__dict__, "content_hash": content_hash(trace)}, indent=2, sort_keys=True))
    output = Path(__file__).with_name("synthetic_trace.json")
    output.write_text(canonical_json(trace) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
