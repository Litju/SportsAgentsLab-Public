from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "ci"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tool_command(tool: str, *arguments: str) -> list[str]:
    if tool == "pnpm":
        node = os.environ.get("MEF_NODE_EXECUTABLE") or shutil.which("node") or "node"
        npm_execpath = os.environ.get("npm_execpath")
        if npm_execpath:
            return [node, npm_execpath, *arguments]
        if os.name == "nt":
            appdata = os.environ.get("APPDATA")
            if appdata:
                pnpm_cjs = Path(appdata) / "npm" / "node_modules" / "pnpm" / "bin" / "pnpm.cjs"
                if pnpm_cjs.exists():
                    return [node, str(pnpm_cjs), *arguments]
        executable = shutil.which("pnpm") or shutil.which("pnpm.cmd") or "pnpm"
        return [executable, *arguments]
    executable = shutil.which(tool) or tool
    return [executable, *arguments]


def command_output(command: list[str]) -> str:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return "unavailable"
    return (result.stdout or result.stderr).strip()


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


parser = argparse.ArgumentParser()
parser.add_argument("--results", default=str(OUTPUT / "gate-results.json"))
args = parser.parse_args()
results_path = Path(args.results)
if not results_path.is_absolute():
    results_path = ROOT / results_path
if not results_path.exists():
    raise SystemExit("gate results are missing")

sbom_path = OUTPUT / "mef-sbom.cdx.json"
if not sbom_path.exists():
    raise SystemExit("SBOM is missing; evidence cannot claim a complete candidate")

results = json.loads(results_path.read_text(encoding="utf-8"))
gates = results.get("gates", {})
commit = (
    os.environ.get("MEF_SOURCE_COMMIT_SHA")
    or os.environ.get("GITHUB_HEAD_SHA")
    or os.environ.get("GITHUB_SHA")
    or command_output(["git", "rev-parse", "HEAD"])
)
branch = (
    os.environ.get("MEF_SOURCE_BRANCH")
    or os.environ.get("GITHUB_HEAD_REF")
    or os.environ.get("GITHUB_REF_NAME")
    or command_output(["git", "symbolic-ref", "--short", "HEAD"])
)
ref = os.environ.get("MEF_SOURCE_BRANCH") or os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME") or branch
workflow_ref = os.environ.get("GITHUB_REF")
lockfiles = {}
for name in ("pnpm-lock.yaml", "uv.lock"):
    path = ROOT / name
    if not path.exists():
        raise SystemExit("required lockfile is missing: " + name)
    lockfiles[name] = sha256(path)

toolchain = {
    "node": command_output(tool_command("node", "--version")),
    "pnpm": command_output(tool_command("pnpm", "--version")),
    "python": command_output(tool_command("python", "--version")),
    "uv": command_output(tool_command("uv", "--version")),
}
lockfile_hash = ";".join(name + ":" + value for name, value in sorted(lockfiles.items()))
test_gate_names = [
    "contract",
    "compatibility",
    "typecheck",
    "typescript",
    "smoke",
    "package_tests",
    "security",
    "python_validation",
]
test_verdict = "PASS" if all(gates.get(name) == "PASS" for name in test_gate_names) else "FAIL"
build_verdict = "PASS" if gates.get("nextjs_build") == "PASS" else "FAIL"

supporting_files = [
    sbom_path,
    results_path,
    OUTPUT / "node-audit.json",
    OUTPUT / "python-audit.json",
    OUTPUT / "secret-scan-summary.json",
    OUTPUT / "vulnerability-scan-summary.json",
]
artifact_hashes = {
    path.name: sha256(path)
    for path in supporting_files
    if path.exists()
}

provenance = {
    "schema_version": 1,
    "statement_type": "bounded-build-provenance",
    "source": {"commit_sha": commit, "branch": branch, "ref": ref, "workflow_ref": workflow_ref},
    "dependencies": {"lockfiles": lockfiles, "lockfile_hash": lockfile_hash},
    "toolchain": toolchain,
    "validation": {
        "overall": results.get("overall"),
        "authority": gates.get("authority"),
        "architecture": gates.get("architecture"),
        "generated_drift": gates.get("generated_drift"),
        "tests": test_verdict,
        "build": build_verdict,
    },
    "artifact_hashes": artifact_hashes,
}
provenance_path = OUTPUT / "build-provenance.json"
write_json(provenance_path, provenance)
provenance_hash = sha256(provenance_path)

receipt = {
    "schema_version": 1,
    "receipt_type": "MEF CI evidence receipt",
    "source_commit_sha": commit,
    "branch": branch,
    "ref": ref,
    "workflow_ref": workflow_ref,
    "node_version": toolchain["node"],
    "pnpm_version": toolchain["pnpm"],
    "python_version": toolchain["python"],
    "uv_version": toolchain["uv"],
    "lockfile_hash": lockfile_hash,
    "lockfiles": lockfiles,
    "authority_status": gates.get("authority"),
    "architecture_status": gates.get("architecture"),
    "generated_drift_status": gates.get("generated_drift"),
    "test_verdict": test_verdict,
    "build_verdict": build_verdict,
    "sbom_format": "CycloneDX JSON",
    "sbom_sha256": sha256(sbom_path),
    "test_summary_sha256": sha256(results_path),
    "build_provenance_sha256": provenance_hash,
    "artifact_hashes": {**artifact_hashes, provenance_path.name: provenance_hash},
    "no_secret_values_included": True,
}
receipt_path = OUTPUT / "evidence-receipt.json"
write_json(receipt_path, receipt)

sum_paths = [
    sbom_path,
    results_path,
    provenance_path,
    receipt_path,
    OUTPUT / "node-audit.json",
    OUTPUT / "python-audit.json",
    OUTPUT / "secret-scan-summary.json",
    OUTPUT / "vulnerability-scan-summary.json",
]
checksum_lines = [
    sha256(path) + "  " + path.relative_to(ROOT).as_posix()
    for path in sorted({path for path in sum_paths if path.exists()}, key=lambda item: item.relative_to(ROOT).as_posix())
]
(OUTPUT / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
print("EVIDENCE_RECEIPT=PASS sbom_sha256=" + sha256(sbom_path) + " receipt_sha256=" + sha256(receipt_path))
