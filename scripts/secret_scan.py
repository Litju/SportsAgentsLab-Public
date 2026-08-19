from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if os.name == "nt":
    os.environ.setdefault("UV_PROJECT_ENVIRONMENT", str(ROOT / ".venv-ml100"))
OUTPUT = ROOT / "artifacts" / "ci"
OUTPUT.mkdir(parents=True, exist_ok=True)
SUMMARY_PATH = OUTPUT / "secret-scan-summary.json"
BASE_SHA = os.environ.get("MEF_SECRET_SCAN_BASE_SHA", "b03926e9539151e21930b043fc4b600b3dbf86dc")
HIGH_CONFIDENCE_PLUGINS = {
    "AWSKeyDetector",
    "BasicAuthDetector",
    "CloudantDetector",
    "GitHubTokenDetector",
    "IbmCloudIamDetector",
    "JwtTokenDetector",
    "MailchimpDetector",
    "PrivateKeyDetector",
    "SlackDetector",
    "StripeDetector",
}
SKIP_SUFFIXES = {
    ".7z",
    ".bmp",
    ".db",
    ".dll",
    ".docx",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lockb",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".pyc",
    ".sqlite",
    ".svg",
    ".ttf",
    ".woff",
    ".woff2",
    ".zip",
}


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)


def repository_files() -> list[str]:
    result = run_capture(["git", "ls-files", "-co", "--exclude-standard", "-z"])
    if result.returncode != 0:
        raise SystemExit("secret scan could not enumerate repository files")
    files = []
    for raw in result.stdout.split("\0"):
        if not raw:
            continue
        path = Path(raw)
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue
        if any(part in {".git", "node_modules", ".next", ".eve", "dist"} for part in path.parts):
            continue
        if raw.startswith("authority/") and path.suffix.lower() in {".gz", ".zip"}:
            continue
        files.append(raw)
    return files


def scan_paths(paths: list[str], label: str) -> list[dict[str, object]]:
    if not paths:
        return []
    findings: list[dict[str, object]] = []
    for start in range(0, len(paths), 120):
        chunk = paths[start : start + 120]
        result = run_capture(
            ["uv", "run", "--locked", "--all-packages", "detect-secrets", "scan", "--no-verify", *chunk]
        )
        if result.returncode != 0:
            raise SystemExit(f"detect-secrets failed while scanning {label}")
        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError as error:
            raise SystemExit(f"detect-secrets returned invalid JSON for {label}") from error
        for path, values in payload.get("results", {}).items():
            for finding in values:
                findings.append(
                    {
                        "scope": label,
                        "path": path,
                        "line_number": finding.get("line_number"),
                        "type": finding.get("type"),
                        "is_verified": finding.get("is_verified", False),
                    }
                )
    return findings


def high_confidence(findings: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        finding
        for finding in findings
        if finding.get("is_verified") is True or finding.get("type") in HIGH_CONFIDENCE_PLUGINS
    ]


all_findings = scan_paths(repository_files(), "repository-source")

with tempfile.NamedTemporaryFile(prefix="mef-secret-diff-", suffix=".patch", delete=False) as handle:
    diff_path = Path(handle.name)
try:
    diff_output = diff_path.open("w", encoding="utf-8")
    diff_base = BASE_SHA
    if run_capture(["git", "cat-file", "-e", diff_base + "^{commit}"]).returncode != 0:
        diff_base = "HEAD^" if run_capture(["git", "rev-parse", "--verify", "HEAD^"]).returncode == 0 else ""
    diff_command = ["git", "diff", "--binary"]
    if diff_base:
        diff_command.append(diff_base)
    diff_command.append("--")
    diff_result = subprocess.run(
        diff_command,
        cwd=ROOT,
        text=True,
        stdout=diff_output,
        stderr=subprocess.PIPE,
        check=False,
    )
    diff_output.close()
    if diff_result.returncode != 0:
        raise SystemExit("secret scan could not read the relevant history range")
    all_findings.extend(scan_paths([str(diff_path)], "relevant-diff"))
finally:
    diff_path.unlink(missing_ok=True)

generated_paths: list[str] = []
for generated_root in [OUTPUT, ROOT / "apps" / "practitioner-web" / ".next"]:
    if not generated_root.exists():
        continue
    for path in generated_root.rglob("*"):
        if (
            path.is_file()
            and path.suffix.lower() in {".cjs", ".css", ".html", ".js", ".json", ".mjs", ".txt"}
            and path.stat().st_size <= 5_000_000
        ):
            generated_paths.append(str(path.relative_to(ROOT)))
all_findings.extend(scan_paths(generated_paths, "generated-artifacts"))

high_confidence_findings = high_confidence(all_findings)
summary = {
    "scanner": "detect-secrets",
    "policy": {
        "verified_or_high_confidence_findings_fail": True,
        "unverified_high_entropy_findings_are_reported_only": True,
        "suppression": "none",
    },
    "scopes": ["tracked-source", "relevant-diff", "generated-artifacts"],
    "finding_count": len(all_findings),
    "high_confidence_finding_count": len(high_confidence_findings),
    "findings": all_findings,
}
SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

if high_confidence_findings:
    raise SystemExit("SECRET_SCAN=FAIL high-confidence findings are recorded without secret values")
print("SECRET_SCAN=PASS scanner=detect-secrets high_confidence_findings=0")
