from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_ROOT = ROOT / ".github" / "workflows"
ACTION_SHA = re.compile(r"^[0-9a-fA-F]{40}$")


def fail(message: str) -> None:
    raise SystemExit(f"CI_POLICY=FAIL {message}")


workflow_paths = sorted(WORKFLOW_ROOT.glob("*.y*ml"))
if not workflow_paths:
    fail("no workflow files found")

combined = "\n".join(path.read_text(encoding="utf-8") for path in workflow_paths)
if not re.search(r"(?m)^\s*pull_request\s*:", combined):
    fail("pull_request trigger is required")
if not re.search(r"(?m)^\s*push\s*:", combined) or not re.search(r"(?m)^\s*-\s*main\s*$", combined):
    fail("push to main trigger is required")
if re.search(r"(?im)^\s*permissions\s*:\s*write-all\s*$", combined):
    fail("write-all permissions are forbidden")
if "pull_request_target" in combined:
    fail("pull_request_target is forbidden for merge validation")
if re.search(r"(?im)^\s*continue-on-error\s*:\s*true\s*$", combined):
    fail("continue-on-error is forbidden for mandatory gates")
if re.search(r"uses:\s*[^\s#]+@(master|main|latest)\b", combined, re.IGNORECASE):
    fail("floating action reference found")
if "--frozen-lockfile" not in combined or "--locked" not in combined:
    fail("frozen Node and locked Python installation are required")
if "fetch-depth: 0" not in combined:
    fail("full history checkout is required for relevant history scanning")
if not re.search(r"(?m)^\s*permissions:\s*$", combined):
    fail("explicit permissions block is required")
if not re.search(r"(?m)^\s*contents:\s*read\s*$", combined):
    fail("contents: read permission is required")

for line_number, line in enumerate(combined.splitlines(), start=1):
    action_match = re.search(r"^\s*uses:\s*([^\s#]+)", line)
    if action_match:
        reference = action_match.group(1).rsplit("@", 1)[-1]
        if not ACTION_SHA.fullmatch(reference):
            fail(f"action is not pinned to an immutable SHA at line {line_number}")
    if re.search(r"^\s*run:\s*.*\$\{\{\s*github\.", line):
        fail(f"untrusted GitHub metadata is interpolated into a shell command at line {line_number}")

print("CI_POLICY=PASS workflows=" + str(len(workflow_paths)) + " mutable_action_references=0")
