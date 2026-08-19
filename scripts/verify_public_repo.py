"""Run structural checks that can execute inside the public repository."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    for script in ("verify_public_source_boundary.py", "verify_asset_manifest.py"):
        result = subprocess.run([sys.executable, str(root / "scripts" / script)], cwd=root, check=False)
        if result.returncode:
            return result.returncode
    readme = (root / "README.md").read_text(encoding="utf-8")
    license_text = (root / "LICENSE").read_text(encoding="utf-8")
    if "source-available" not in readme.lower() or "All Rights Reserved" not in license_text:
        print("proprietary notice is incomplete", file=sys.stderr)
        return 1
    print("PUBLIC_REPO=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
