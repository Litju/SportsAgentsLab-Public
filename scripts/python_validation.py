from __future__ import annotations

import compileall
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if sys.platform == "win32":
    os.environ.setdefault("UV_PROJECT_ENVIRONMENT", str(ROOT / ".venv-ml100"))
PYTHON_PATHS = [
    ROOT / "scripts",
    ROOT / "packages" / "generated-python",
    ROOT / "scientific" / "kernel",
    ROOT / "tools" / "evidence-replay",
]


def run(command: list[str]) -> None:
    completed = subprocess.run(command, cwd=ROOT, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


for path in PYTHON_PATHS:
    if path.exists() and not compileall.compile_dir(path, quiet=1, maxlevels=20):
        raise SystemExit(f"Python compilation failed: {path}")

run(["uv", "run", "--locked", "--package", "mef-scientific-kernel", "python", "-m", "mef_scientific_kernel"])
run(
    [
        "uv",
        "run",
        "--locked",
        "--package",
        "mef-evidence-replay",
        "python",
        "-m",
        "mef_evidence_replay",
        "--manifest",
        str(ROOT / "fixtures" / "evidence" / "replay-manifest.json"),
        "--repository-root",
        str(ROOT),
    ]
)

print("PYTHON_VALIDATION=PASS compileall=PASS workspace_smoke=PASS evidence_replay=PASS")
