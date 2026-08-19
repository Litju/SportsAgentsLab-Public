"""Verify public asset hashes and metadata-free image files."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ALLOWED_PNG_CHUNKS = {b"IHDR", b"IDAT", b"IEND", b"PLTE", b"tRNS"}


def png_chunks(path: Path):
    raw = path.read_bytes()
    if not raw.startswith(PNG_SIGNATURE):
        raise ValueError(f"invalid PNG: {path}")
    offset = len(PNG_SIGNATURE)
    while offset < len(raw):
        length = struct.unpack(">I", raw[offset : offset + 4])[0]
        kind = raw[offset + 4 : offset + 8]
        end = offset + length + 12
        yield kind
        offset = end
        if kind == b"IEND":
            break


def verify(root: Path) -> list[str]:
    manifest_path = root / "assets" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = {item["path"]: item["sha256"] for item in manifest["assets"]}
    actual = {}
    findings: list[str] = []
    for path in (root / "assets").rglob("*"):
        if not path.is_file() or path.name == "manifest.json":
            continue
        relative = path.relative_to(root).as_posix()
        actual[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.suffix.lower() == ".svg":
            parsed = ET.parse(path)
            if any(element.tag.lower().endswith("metadata") for element in parsed.iter()):
                findings.append(f"SVG metadata: {relative}")
        if path.suffix.lower() == ".png":
            findings.extend(f"PNG metadata chunk {kind!r}: {relative}" for kind in png_chunks(path) if kind not in ALLOWED_PNG_CHUNKS)
    if expected != actual:
        findings.append("asset hash manifest mismatch")
    return findings


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    findings = verify(root)
    if findings:
        print("\n".join(findings), file=sys.stderr)
        return 1
    print("ASSET_MANIFEST=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
