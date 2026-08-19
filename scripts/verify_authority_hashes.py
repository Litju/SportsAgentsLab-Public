from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ACCEPTED_ML93_SHA = "59b41c91b57011165eb7487f55648625f35edca2"
EXPECTED_ADOPTION_COMMIT = "f65b9e34b79cb76b7b263f8a439b24150eaf4784"
EXPECTED_AMENDMENT_SOURCE_SHA256 = (
    "d0916ea63cd738480424b1203e06a2378243130edaca47c1b67b02cad9a15826"
)

RELOCK_RELATIVE = "MEF_AUTHORITY_RELOCK_PLATFORM_AGENT_V01.yaml"
RELOCK_SHA256SUMS_RELATIVE = "MEF_AUTHORITY_RELOCK_PLATFORM_AGENT_V01_SHA256SUMS"
EXPECTED_RELOCK_SHA256 = "fc8a377b7b5715aad5a90573c7165b65c1e7bf2c86777f1572043c9246f6f3fc"
EXPECTED_RELOCK_SHA256SUMS_SHA256 = "ec7dc7894419d09d1a99367826a7511c856e8aa0dbf1e4a89f747ab2f8c1458a"

# These anchors are copied from the accepted ML-93 Git blobs and source-bundle
# manifests. They remain historical evidence; the two program-register entries
# are checked here only at the accepted ML-93 commit, not against current files.
HISTORICAL_ANCHOR_HASHES = {
    "ML93_SHA256SUMS": "540a9c62fc02daf06205df96045a1f86d6a34bf8ec8ee12055e0f1989467dcb2",
    "SHA256SUMS": "0f5524a9e527652111174f8c9fef9b992a52fe9fa114a110724dead168f61147",
    "MEF_BLOCK_DEPENDENCY_LOCK.yaml": "c947ab886043f3dc93ba23bc7498e708eebd280f1623e3b511352c54cf0e2b88",
    "MEF_CHANGE_CONTROL.md": "ee737d8d24024e3cc559e6de7ad9739979f4c1df83171f3613fdc7874d8f47ad",
    "MEF_FORBIDDEN_CLAIMS_LOCK.md": "89e2b0e202c2b1cf6ace0a4647aeca57e790656d3203ea1619f5bf86ae0d8bea",
    "MEF_PROGRAM_AUTHORITY_REGISTER.md": "1b4c67c507fba204eda07fde2ac0e2a559ac5dec47b75d3c213d9ef2d93d9eb7",
    "MEF_PROGRAM_AUTHORITY_REGISTER.yaml": "6cb43dd2fb6aeb1caae4ba7257811bb33e89489e68cac61246aad2f9e2949d91",
    "MEF_TERMINOLOGY_AND_SCOPE_LOCK.md": "41f297300d795ec76e577d7baf5d81befde8c989dcd72dd67b92769c8b34df8f",
    "ML93_CLOSURE_PACKET.md": "a801fad1778a2d551deb501396f8e22070de42a53cc69d4f53ce398313e05401",
    "ML93_CONFLICT_REGISTER.md": "831f54aae92f370f7e00089098b012942e2ee778b4c9053a948bbbc0668c023d",
    "SAL-MEF-Architecture-Diagrams.zip": "1a046c587f7413fc4e2cd4c75d20dd57efa5559eec4ea6a5d814c8a48d94c46f",
    "SAL-MEF-UX-UI-FREEZE-v0.3.zip": "a5eb02c1aeb271e763211e733fdfb761df9a7663d0ce00acc8e5122ce4c941f5",
    "SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip": "e3fa4e306e14d440d95933a084dc2623724117af5a00d5a164cd401f4ce8d9f0",
}

# These are the historical files that must still be byte-identical in the
# current worktree. The adopted register itself is intentionally excluded and
# is validated against the explicit current relock below.
HISTORICAL_WORKTREE_HASHES = {
    relative_path: expected
    for relative_path, expected in HISTORICAL_ANCHOR_HASHES.items()
    if relative_path
    not in {
        "MEF_PROGRAM_AUTHORITY_REGISTER.md",
        "MEF_PROGRAM_AUTHORITY_REGISTER.yaml",
    }
}

CURRENT_AUTHORITY_ALLOWED_FILES = {
    "MEF_PROGRAM_AUTHORITY_REGISTER.md",
    "MEF_PROGRAM_AUTHORITY_REGISTER.yaml",
    "MEF_PLATFORM_AGENT_AMENDMENT_ADOPTION.md",
    "SAL-MEF-Platform-Agent-Amendment-v0.1.zip",
    RELOCK_RELATIVE,
    RELOCK_SHA256SUMS_RELATIVE,
    "MEF_BLOCK_DEPENDENCY_LOCK_B01.yaml",
    "MEF_B01_ML102_AUTHORITY_ACTIVATION.yaml",
    "MEF_BLOCK_DEPENDENCY_LOCK_B01_ML103.yaml",
    "MEF_B01_ML103_AUTHORITY_ACTIVATION.yaml",
    "MEF_BLOCK_DEPENDENCY_LOCK_B01_ML104.yaml",
    "MEF_B01_ML104_AUTHORITY_ACTIVATION.yaml",
    "MEF_BLOCK_DEPENDENCY_LOCK_B01_ML105.yaml",
    "MEF_B01_ML105_AUTHORITY_ACTIVATION.yaml",
    "MEF_B01_ML108_FINAL_RELOCK_CANDIDATE.yaml",
    "MEF_BLOCK_DEPENDENCY_LOCK_B02_ML109.yaml",
    "MEF_B02_ML109_AUTHORITY_ACTIVATION.yaml",
    "MEF_B02_ML110_AUTHORITY_ACTIVATION.yaml",
}
CURRENT_AUTHORITY_ALLOWED_PREFIXES = (
    "amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/",
)
TEXT_SUFFIXES = {".md", ".yaml", ".yml", ".json", ".txt", ".dot", ".svg", ".py"}
TEXT_FILENAMES = {"ML93_SHA256SUMS", "SHA256SUMS"}


def authority_path(relative_path: str) -> Path:
    return ROOT / "authority" / Path(*relative_path.replace("\\", "/").split("/"))


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_file(path: Path) -> str:
    data = path.read_bytes()
    if (
        path.suffix.lower() in TEXT_SUFFIXES
        or path.name in TEXT_FILENAMES
        or path.name.endswith("SHA256SUMS")
    ):
        data = data.replace(b"\r\n", b"\n")
    return hash_bytes(data)


def git_blob(commit: str, relative_path: str) -> bytes:
    object_name = f"{commit}:authority/{relative_path}"
    completed = subprocess.run(
        ["git", "cat-file", "blob", object_name],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return completed.stdout


def parse_sha256_manifest(data: bytes, label: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    for line_number, line in enumerate(data.decode("utf-8-sig").splitlines(), 1):
        stripped = line.strip()
        if not stripped:
            continue
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+(.+)", stripped)
        if not match:
            raise ValueError(f"{label}: malformed line {line_number}")
        digest, relative_path = match.groups()
        relative_path = relative_path.replace("\\", "/")
        if relative_path in entries:
            raise ValueError(f"{label}: duplicate path {relative_path}")
        entries[relative_path] = digest.lower()
    return entries


def parse_flat_yaml(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0].isspace():
            raise ValueError(f"{path.name}: nested YAML is not permitted at line {line_number}")
        if ":" not in line:
            raise ValueError(f"{path.name}: malformed line {line_number}")
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[a-z0-9_]+", key):
            raise ValueError(f"{path.name}: invalid key {key}")
        if key in values:
            raise ValueError(f"{path.name}: duplicate key {key}")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def parse_top_level_yaml(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or line[0].isspace():
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def parse_key_value_document(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(r"([A-Z0-9_]+)=(.*)", line.strip())
        if match:
            key, value = match.groups()
            values[key] = value
    return values


def safe_repository_path(relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = Path(normalized)
    if path.is_absolute() or ".." in path.parts or not normalized.startswith("authority/"):
        raise ValueError(f"unsafe repository path: {relative_path}")
    return ROOT / Path(*path.parts)


def accepted_sha_is_ancestor() -> bool:
    completed = subprocess.run(
        ["git", "merge-base", "--is-ancestor", ACCEPTED_ML93_SHA, "HEAD"],
        cwd=ROOT,
        capture_output=True,
    )
    if completed.returncode:
        print("AUTHORITY_ANCESTRY_ERROR=accepted ML-93 SHA is not in HEAD ancestry")
        return False
    return True


def authority_worktree_has_no_unexpected_changes() -> bool:
    completed = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all", "--", "authority"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    unexpected = False
    for line in completed.stdout.splitlines():
        repository_path = line[3:].replace("\\", "/")
        if not repository_path.startswith("authority/"):
            print(f"AUTHORITY_WORKTREE_ERROR={line}")
            unexpected = True
            continue
        relative_path = repository_path[len("authority/") :]
        if relative_path in CURRENT_AUTHORITY_ALLOWED_FILES or any(
            relative_path.startswith(prefix) for prefix in CURRENT_AUTHORITY_ALLOWED_PREFIXES
        ):
            continue
        print(f"AUTHORITY_WORKTREE_ERROR={line}")
        unexpected = True
    return not unexpected


def verify_historical_baseline() -> list[str]:
    failures: list[str] = []
    for relative_path, expected in HISTORICAL_ANCHOR_HASHES.items():
        accepted_digest = hash_bytes(git_blob(ACCEPTED_ML93_SHA, relative_path))
        if accepted_digest != expected:
            failures.append(
                f"historical accepted blob {relative_path}: expected {expected}, found {accepted_digest}"
            )

    for relative_path, expected in HISTORICAL_WORKTREE_HASHES.items():
        path = authority_path(relative_path)
        if not path.is_file():
            failures.append(f"historical worktree file missing: {relative_path}")
            continue
        actual = hash_file(path)
        if actual != expected:
            failures.append(
                f"historical worktree file {relative_path}: expected {expected}, found {actual}"
            )

    historical_manifest = parse_sha256_manifest(
        git_blob(ACCEPTED_ML93_SHA, "ML93_SHA256SUMS"),
        "accepted ML93_SHA256SUMS",
    )
    for relative_path, expected in historical_manifest.items():
        actual = hash_bytes(git_blob(ACCEPTED_ML93_SHA, relative_path))
        if actual != expected:
            failures.append(
                f"accepted ML93 checksum entry {relative_path}: expected {expected}, found {actual}"
            )

    source_manifest = parse_sha256_manifest(
        authority_path("SHA256SUMS").read_bytes(),
        "authority/SHA256SUMS",
    )
    for relative_path, expected in source_manifest.items():
        path = authority_path(relative_path)
        if not path.is_file():
            failures.append(f"historical source bundle missing: {relative_path}")
            continue
        actual = hash_file(path)
        if actual != expected:
            failures.append(
                f"historical source bundle {relative_path}: expected {expected}, found {actual}"
            )
    return failures


def verify_relock() -> tuple[dict[str, str], list[str]]:
    relock_path = authority_path(RELOCK_RELATIVE)
    sums_path = authority_path(RELOCK_SHA256SUMS_RELATIVE)
    failures: list[str] = []
    values: dict[str, str] = {}

    if not relock_path.is_file():
        return {}, [f"current relock missing: {RELOCK_RELATIVE}"]
    if not sums_path.is_file():
        return {}, [f"current relock checksum missing: {RELOCK_SHA256SUMS_RELATIVE}"]

    relock_digest = hash_file(relock_path)
    if relock_digest != EXPECTED_RELOCK_SHA256:
        failures.append(
            f"current relock hash: expected {EXPECTED_RELOCK_SHA256}, found {relock_digest}"
        )
    sums_digest = hash_file(sums_path)
    if sums_digest != EXPECTED_RELOCK_SHA256SUMS_SHA256:
        failures.append(
            f"current relock checksum hash: expected {EXPECTED_RELOCK_SHA256SUMS_SHA256}, found {sums_digest}"
        )

    try:
        sums = parse_sha256_manifest(sums_path.read_bytes(), str(sums_path))
        expected_sums = {RELOCK_RELATIVE: relock_digest}
        if sums != expected_sums:
            failures.append("current relock checksum does not match the relock YAML")
        values = parse_flat_yaml(relock_path)
    except (OSError, UnicodeError, ValueError) as exc:
        failures.append(f"current relock parse error: {exc}")
        return values, failures

    expected_values = {
        "relock_id": "MEF-AUTHORITY-RELOCK-PLATFORM-AGENT-V01",
        "status": "NORMATIVE",
        "predecessor": "ML93",
        "amendment": "SAL-MEF-Platform-Agent-Amendment-v0.1",
        "amendment_source_sha256": EXPECTED_AMENDMENT_SOURCE_SHA256,
        "adoption_commit": EXPECTED_ADOPTION_COMMIT,
        "baseline_replaced": "false",
        "baseline_amended": "true",
        "effective_authority": "HISTORICAL_ML93_BASELINE + ADOPTED_PLATFORM_AGENT_AMENDMENT_V01",
        "repository": "<LOCAL_PATH_REDACTED>",
        "relock_sha256sums_path": "authority/MEF_AUTHORITY_RELOCK_PLATFORM_AGENT_V01_SHA256SUMS",
        "source_bundle_sha256": EXPECTED_AMENDMENT_SOURCE_SHA256,
        "materialized_root": "authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1",
    }
    for key, expected in expected_values.items():
        if values.get(key) != expected:
            failures.append(f"current relock field {key}: expected {expected!r}, found {values.get(key)!r}")

    file_pairs = (
        ("current_register_md_path", "current_register_md_sha256"),
        ("current_register_yaml_path", "current_register_yaml_sha256"),
        ("adoption_record_path", "adoption_record_sha256"),
        ("source_bundle_path", "source_bundle_sha256"),
        ("materialized_sha256sums_path", "materialized_sha256sums_sha256"),
        ("materialized_authority_yaml_path", "materialized_authority_yaml_sha256"),
        ("materialized_bundle_manifest_path", "materialized_bundle_manifest_sha256"),
    )
    for path_key, hash_key in file_pairs:
        relative_path = values.get(path_key, "")
        expected = values.get(hash_key, "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            failures.append(f"current relock field {hash_key} is not a lowercase SHA-256")
            continue
        try:
            path = safe_repository_path(relative_path)
            actual = hash_file(path)
        except (OSError, ValueError) as exc:
            failures.append(f"current relock path {path_key}: {exc}")
            continue
        if actual != expected:
            failures.append(f"current relock hash {relative_path}: expected {expected}, found {actual}")
    return values, failures


def verify_adoption_record(values: dict[str, str]) -> list[str]:
    failures: list[str] = []
    path = safe_repository_path(values["adoption_record_path"])
    record = parse_key_value_document(path)
    expected = {
        "AMENDMENT": "SAL-MEF-Platform-Agent-Amendment-v0.1",
        "SOURCE_SHA256": EXPECTED_AMENDMENT_SOURCE_SHA256,
        "FOUNDER_DECISION": "ADOPTED",
        "EFFECTIVE_STATUS": "NORMATIVE_PLATFORM_AGENT_AMENDMENT",
        "BASELINE_REPLACED": "NO",
        "BASELINE_AMENDED": "YES",
        "EFFECTIVE_AUTHORITY_RELATIONSHIP": "BASELINE + AMENDMENT = CURRENT EFFECTIVE AUTHORITY",
    }
    for key, expected_value in expected.items():
        if record.get(key) != expected_value:
            failures.append(f"adoption record field {key}: expected {expected_value!r}, found {record.get(key)!r}")
    text = path.read_text(encoding="utf-8-sig")
    if "ADR_044_DISPOSITION=AUTHORITY_PRESERVATION_CLARIFICATION_NO_SUPERSESSION_ROW_REQUIRED" not in text:
        failures.append("adoption record ADR-044 disposition is missing")
    if "EVE_APPROVAL_MECHANISM != PRACTITIONER_AUTHORITY" not in text:
        failures.append("adoption record Eve/practitioner boundary is missing")
    return failures


def verify_b01_activation() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B01.yaml")
    transition_path = authority_path("MEF_B01_ML102_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("B01 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B01/ML-102 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 1.1.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK.yaml",
        "current_block: B01",
        "current_issue: ML-102",
        "    status: CLOSED",
        "    status: ACTIVE",
        "    authorized_issue: ML-102",
        "  - id: B02",
        "    status: DEFERRED",
        "    implementation_allowed: false",
        "Only ML-102 is authorized under active B01",
        "ACTIVE_DATABASE=NEON_POSTGRESQL",
        "ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB",
        "S3_RUNTIME_DEPENDENCY=NONE",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"B01 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"B01 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B00_TO_B01_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "owner_approval": "YES",
        "previous_current_block": "B00",
        "new_current_block": "B01",
        "b00_status": "CLOSED",
        "b01_status": "ACTIVE",
        "ml102_status": "AUTHORIZED",
        "ml102_implementation_allowed": "true",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "qualified_b00_commit": "6dab9454d2479737f01f120453a72736746597ba",
        "accepted_main_after_b00": "e43d9e1af7e302523119510330c1fef2aac7a3f8",
        "date": "2026-08-14",
        "historical_b00_evidence_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "BYTES_IDENTITY_IMMUTABLE_STORAGE_PROVENANCE_ONLY",
    }
    for key, expected in expected_transition.items():
        if transition.get(key) != expected:
            failures.append(
                f"B01 transition field {key}: expected {expected!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_ml103_activation() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B01_ML103.yaml")
    transition_path = authority_path("MEF_B01_ML103_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("ML-103 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B01/ML-103 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 1.2.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK_B01.yaml",
        "current_block: B01",
        "current_issue: ML-103",
        "ml102_status: ACCEPTED",
        "ml102_implementation_allowed: false",
        "current_gate: ML-103",
        "ml103_status: AUTHORIZED",
        "ml103_implementation_allowed: true",
        "real_vendor_adapter_implementation_allowed: false",
        "ml103_scope: INGESTION_ADK_V0_1_PLUS_SYNTHETIC_REFERENCE_CONFORMANCE",
        "real_vendor_support_requires_source_evidence: true",
        "ml104_status: DEPENDENCY_BLOCKED",
        "ml108_status: DEPENDENCY_BLOCKED",
        "    authorized_issue: ML-103",
        "  - id: B02",
        "    status: DEFERRED",
        "    implementation_allowed: false",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"ML-103 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"ML-103 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B01_GATE_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "founder_decision": "ADOPTED",
        "previous_current_block": "B01",
        "new_current_block": "B01",
        "previous_gate": "ML-102",
        "new_gate": "ML-103",
        "ml102_status": "ACCEPTED",
        "ml102_implementation_allowed": "false",
        "ml103_status": "AUTHORIZED",
        "ml103_implementation_allowed": "true",
        "real_vendor_adapter_implementation_allowed": "false",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "ml103_scope": "INGESTION_ADK_V0_1_PLUS_SYNTHETIC_REFERENCE_CONFORMANCE",
        "real_vendor_support_requires_source_evidence": "true",
        "ml102_accepted_main_head": "db6aed6162eb5ef5437b1ba8351f7d8ba59e59db",
        "ml102_evidence_commit": "115e27bc42bec34ad92e79c68208d60ff3b96f2f",
        "date": "2026-08-16",
        "historical_ml102_evidence_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "BYTES_IDENTITY_IMMUTABLE_STORAGE_PROVENANCE_ONLY",
    }
    for key, expected in expected_transition.items():
        if transition.get(key) != expected:
            failures.append(
                f"ML-103 transition field {key}: expected {expected!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_ml104_activation() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B01_ML104.yaml")
    transition_path = authority_path("MEF_B01_ML104_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("ML-104 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B01/ML-104 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 1.3.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK_B01_ML103.yaml",
        "current_block: B01",
        "current_issue: ML-104",
        "ml103_status: ACCEPTED",
        "ml103_implementation_allowed: false",
        "current_gate: ML-104",
        "ml104_status: AUTHORIZED",
        "ml104_implementation_allowed: true",
        "ml104_scope: CANONICAL_ACQUISITION_V0_1_PLUS_SYNTHETIC_INTEGRITY_CONFORMANCE",
        "real_vendor_adapter_implementation_allowed: false",
        "real_vendor_support_requires_source_evidence: true",
        "ml105_status: DEPENDENCY_BLOCKED",
        "    authorized_issue: ML-104",
        "  - id: B02",
        "    status: DEFERRED",
        "    implementation_allowed: false",
        "ACTIVE_DATABASE=NEON_POSTGRESQL",
        "ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB",
        "S3_RUNTIME_DEPENDENCY=NONE",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"ML-104 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"ML-104 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B01_GATE_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "founder_decision": "ADOPTED",
        "previous_current_block": "B01",
        "new_current_block": "B01",
        "previous_gate": "ML-103",
        "new_gate": "ML-104",
        "ml103_status": "ACCEPTED",
        "ml103_implementation_allowed": "false",
        "ml104_status": "AUTHORIZED",
        "ml104_implementation_allowed": "true",
        "real_vendor_adapter_implementation_allowed": "false",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "ml104_scope": "CANONICAL_ACQUISITION_V0_1_PLUS_SYNTHETIC_INTEGRITY_CONFORMANCE",
        "real_vendor_support_requires_source_evidence": "true",
        "ml103_accepted_head": "a3f364c63db9bec302011424c04a10097313fb3c",
        "ml103_accepted_main_head": "a9c581d6d1722205c5126bafbd0908f828f29a24",
        "date": "2026-08-16",
        "historical_ml103_evidence_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "CANONICAL_MEASUREMENT_REPRESENTATION_INTEGRITY_NO_BIOMECHANICS",
    }
    for key, expected in expected_transition.items():
        if transition.get(key) != expected:
            failures.append(
                f"ML-104 transition field {key}: expected {expected!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_ml105_activation() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B01_ML105.yaml")
    transition_path = authority_path("MEF_B01_ML105_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("ML-105 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B01/ML-105 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 1.4.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK_B01_ML104.yaml",
        "current_block: B01",
        "current_issue: ML-105",
        "ml104_status: ACCEPTED",
        "ml104_implementation_allowed: false",
        "current_gate: ML-105",
        "ml105_status: AUTHORIZED",
        "ml105_implementation_allowed: true",
        "ml105_scope: FORCE_PLATE_CONFIGURATION_AND_SAMPLE_RATE_RESOLVER_V0_1_PLUS_SYNTHETIC_CONFORMANCE",
        "real_vendor_adapter_implementation_allowed: false",
        "real_vendor_support_requires_source_evidence: true",
        "ml106_status: DEPENDENCY_BLOCKED",
        "    authorized_issue: ML-105",
        "  - id: B02",
        "    status: DEFERRED",
        "    implementation_allowed: false",
        "ACTIVE_DATABASE=NEON_POSTGRESQL",
        "ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB",
        "S3_RUNTIME_DEPENDENCY=NONE",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"ML-105 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"ML-105 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B01_GATE_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "founder_decision": "ADOPTED",
        "previous_current_block": "B01",
        "new_current_block": "B01",
        "previous_gate": "ML-104",
        "new_gate": "ML-105",
        "ml102_status": "ACCEPTED",
        "ml102_implementation_allowed": "false",
        "ml103_status": "ACCEPTED",
        "ml103_implementation_allowed": "false",
        "ml104_status": "ACCEPTED",
        "ml104_implementation_allowed": "false",
        "ml105_status": "AUTHORIZED",
        "ml105_implementation_allowed": "true",
        "real_vendor_adapter_implementation_allowed": "false",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "ml105_scope": "FORCE_PLATE_CONFIGURATION_AND_SAMPLE_RATE_RESOLVER_V0_1_PLUS_SYNTHETIC_CONFORMANCE",
        "ml104_accepted_main_head": "0b4127104c0643397c4c0ceb9f021dd9e6d423fd",
        "ui_stack_accepted_main_head": "e671e3a0837ceb1d5544b024fd3f5c4ec8b53d2c",
        "accepted_main_head": "e671e3a0837ceb1d5544b024fd3f5c4ec8b53d2c",
        "date": "2026-08-17",
        "historical_ml104_evidence_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "PHYSICAL_ACQUISITION_CONFIGURATION_RESOLUTION_NO_BIOMECHANICS",
    }
    for key, expected in expected_transition.items():
        if transition.get(key) != expected:
            failures.append(
                f"ML-105 transition field {key}: expected {expected!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_ml108_activation() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B01_ML108.yaml")
    transition_path = authority_path("MEF_B01_ML108_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("ML-108 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B01/ML-108 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 1.7.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK_B01_ML107.yaml",
        "current_block: B01",
        "current_issue: ML-108",
        "ml107_status: ACCEPTED",
        "ml107_implementation_allowed: false",
        "current_gate: ML-108",
        "ml108_status: AUTHORIZED",
        "ml108_implementation_allowed: true",
        "ml108_scope: FINAL_CONFORMANCE_REPLAY_AND_B01_RELOCK_V1",
        "real_vendor_adapter_implementation_allowed: false",
        "real_vendor_support_requires_source_evidence: true",
        "ml109_status: DEPENDENCY_BLOCKED",
        "    authorized_issue: ML-108",
        "    status: DEFERRED",
        "    implementation_allowed: false",
        "ACTIVE_DATABASE=NEON_POSTGRESQL",
        "ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB",
        "S3_RUNTIME_DEPENDENCY=NONE",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"ML-108 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"ML-108 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B01_GATE_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "founder_decision": "ADOPTED",
        "previous_current_block": "B01",
        "new_current_block": "B01",
        "previous_gate": "ML-107",
        "new_gate": "ML-108",
        "ml102_status": "ACCEPTED",
        "ml102_implementation_allowed": "false",
        "ml103_status": "ACCEPTED",
        "ml103_implementation_allowed": "false",
        "ml104_status": "ACCEPTED",
        "ml104_implementation_allowed": "false",
        "ml105_status": "ACCEPTED",
        "ml105_implementation_allowed": "false",
        "ml106_status": "ACCEPTED",
        "ml106_implementation_allowed": "false",
        "ml107_status": "ACCEPTED",
        "ml107_implementation_allowed": "false",
        "ml108_status": "AUTHORIZED",
        "ml108_implementation_allowed": "true",
        "ml109_status": "DEPENDENCY_BLOCKED",
        "ml109_implementation_allowed": "false",
        "real_vendor_adapter_implementation_allowed": "false",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "ml108_scope": "FINAL_CONFORMANCE_REPLAY_AND_B01_RELOCK_V1",
        "ml107_accepted_main_head": "9b818a414f4430ce8b829ef0db924c088a8ee5e8",
        "accepted_main_head": "9b818a414f4430ce8b829ef0db924c088a8ee5e8",
        "date": "2026-08-18",
        "historical_ml107_evidence_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "BOUNDED_MEASUREMENT_AGENT_ORCHESTRATION_NO_BIOMECHANICS",
    }
    for key, expected in expected_transition.items():
        if transition.get(key) != expected:
            failures.append(
                f"ML-108 transition field {key}: expected {expected!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_ml108_relock_candidate() -> list[str]:
    failures: list[str] = []
    candidate_path = authority_path("MEF_B01_ML108_FINAL_RELOCK_CANDIDATE.yaml")
    if not candidate_path.is_file():
        return ["B01/ML-108 final relock candidate is missing"]
    try:
        values = parse_flat_yaml(candidate_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return [f"B01/ML-108 final relock candidate parse error: {exc}"]
    expected = {
        "status": "CLOSURE_CANDIDATE",
        "acceptance": "AWAITING_OWNER_ACCEPTANCE",
        "current_block": "B01",
        "b00_status": "CLOSED",
        "b01_status": "CLOSURE_CANDIDATE",
        "ml102_status": "ACCEPTED",
        "ml103_status": "ACCEPTED",
        "ml104_status": "ACCEPTED",
        "ml105_status": "ACCEPTED",
        "ml106_status": "ACCEPTED",
        "ml107_status": "ACCEPTED",
        "ml108_status": "AWAITING_OWNER_ACCEPTANCE",
        "ml108_implementation_allowed": "false",
        "b02_status": "DEFERRED",
        "b02_implementation_allowed": "false",
        "ml109_implementation_allowed": "false",
        "b01_replay": "PASS",
        "b01_conformance": "PASS",
        "b01_scope_recorded": "YES",
        "b01_limitations_recorded": "YES",
        "owner_acceptance_required_to_unlock_b02": "true",
        "historical_authority_artifacts_mutated": "NO",
        "accepted_main_head": "9b818a414f4430ce8b829ef0db924c088a8ee5e8",
        "neon_real_integration": "NOT_AVAILABLE_CREDENTIALS",
        "postgres_rls_ci": "PASS_LOCAL_POSTGRES",
        "hosted_reference_flow": "NOT_REQUALIFIED_AUTHENTICATION_UNAVAILABLE",
        "scientific_boundary": "BOUNDED_MEASUREMENT_AGENT_ORCHESTRATION_NO_BIOMECHANICS",
    }
    for key, expected_value in expected.items():
        if values.get(key) != expected_value:
            failures.append(
                f"ML-108 relock candidate field {key}: expected {expected_value!r}, found {values.get(key)!r}"
            )
    return failures


def verify_b02_ml109_authorization() -> list[str]:
    failures: list[str] = []
    lock_path = authority_path("MEF_BLOCK_DEPENDENCY_LOCK_B02_ML109.yaml")
    transition_path = authority_path("MEF_B02_ML109_AUTHORITY_ACTIVATION.yaml")
    if not lock_path.is_file():
        failures.append("B02/ML-109 successor lock is missing")
        return failures
    if not transition_path.is_file():
        failures.append("B02/ML-109 transition record is missing")
        return failures

    lock_text = lock_path.read_text(encoding="utf-8-sig")
    required_lock_fragments = (
        "version: 2.0.0",
        "acceptance: FOUNDER_APPROVED",
        "supersedes: authority/MEF_BLOCK_DEPENDENCY_LOCK_B01_ML108.yaml",
        "current_block: B02",
        "current_issue: ML-109",
        "b00_status: CLOSED",
        "b01_status: CLOSED",
        "ml108_status: ACCEPTED",
        "b01_replay: PASS",
        "b01_conformance: PASS",
        "b01_supported_scope_recorded: YES",
        "b01_limitations_recorded: YES",
        "current_gate: ML-109",
        "ml109_status: AUTHORIZED",
        "ml109_implementation_allowed: true",
        "ml109_scope: B02-01_FREEZE_CMJ_PROCESSOR_PROTOCOL_EVENT_METRIC_PACK_CONTRACT_V1",
        "production_processor_implementation_allowed: false",
        "ml110_status: DEPENDENCY_BLOCKED",
        "ml110_implementation_allowed: false",
        "b03_status: DEFERRED",
        "real_vendor_adapter_count: 0",
        "real_vendor_support_claims: 0",
        "source_adapter_support: SYNTHETIC_REFERENCE_ADAPTER_ONLY",
        "    authorized_issue: ML-109",
        "    status: ACTIVE",
        "    implementation_allowed: true",
        "ACTIVE_DATABASE=NEON_POSTGRESQL",
        "ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB",
        "S3_RUNTIME_DEPENDENCY=NONE",
    )
    for fragment in required_lock_fragments:
        if fragment not in lock_text:
            failures.append(f"B02/ML-109 successor lock missing: {fragment}")

    try:
        transition = parse_flat_yaml(transition_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return failures + [f"B02/ML-109 transition parse error: {exc}"]
    expected_transition = {
        "decision": "B01_CLOSURE_AND_B02_GATE_TRANSITION",
        "acceptance": "FOUNDER_APPROVED",
        "founder_decision": "ADOPTED",
        "previous_current_block": "B01",
        "new_current_block": "B02",
        "previous_gate": "ML-108",
        "new_gate": "ML-109",
        "b00_status": "CLOSED",
        "b01_status": "CLOSED",
        "ml102_status": "ACCEPTED",
        "ml103_status": "ACCEPTED",
        "ml104_status": "ACCEPTED",
        "ml105_status": "ACCEPTED",
        "ml106_status": "ACCEPTED",
        "ml107_status": "ACCEPTED",
        "ml108_status": "ACCEPTED",
        "ml109_status": "AUTHORIZED",
        "ml109_implementation_allowed": "true",
        "ml110_status": "DEPENDENCY_BLOCKED",
        "ml110_implementation_allowed": "false",
        "b03_status": "DEFERRED",
        "b01_replay": "PASS",
        "b01_conformance": "PASS",
        "b01_supported_scope_recorded": "YES",
        "b01_limitations_recorded": "YES",
        "ml108_qualified_head": "f5c342b761b0fb08447d38c6a44d6bcd13f09965",
        "ml108_merge_commit": "7c5c39e21cdef14147ab86e829a0d4fd942ec6a3",
        "accepted_main_head": "7c5c39e21cdef14147ab86e829a0d4fd942ec6a3",
        "source_adapter_support": "SYNTHETIC_REFERENCE_ADAPTER_ONLY",
        "real_vendor_adapter_count": "0",
        "real_vendor_support_claims": "0",
        "ml109_scope": "B02-01_FREEZE_CMJ_PROCESSOR_PROTOCOL_EVENT_METRIC_PACK_CONTRACT_V1",
        "production_processor_implemented": "NO",
        "ml110_corpus_implemented": "NO",
        "b03_implemented": "NO",
        "historical_authority_artifacts_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "DETERMINISTIC_CMJ_CONTRACT_FREEZE_NO_PRODUCTION_PROCESSOR",
    }
    for key, expected_value in expected_transition.items():
        if transition.get(key) != expected_value:
            failures.append(
                f"B02/ML-109 transition field {key}: expected {expected_value!r}, found {transition.get(key)!r}"
            )
    return failures


def verify_b02_ml110_authorization() -> list[str]:
    failures: list[str] = []
    path = authority_path("MEF_B02_ML110_AUTHORITY_ACTIVATION.yaml")
    if not path.is_file():
        return ["B02/ML-110 successor authority is missing"]
    try:
        values = parse_flat_yaml(path)
    except (OSError, UnicodeError, ValueError) as exc:
        return [f"B02/ML-110 successor authority parse error: {exc}"]

    expected = {
        "authority_change_id": "MEF-B02-ML110-AUTHORITY-ACTIVATION",
        "version": "1.0.0",
        "status": "NORMATIVE",
        "acceptance": "FOUNDER_APPROVED",
        "decision": "ML109_ACCEPTANCE_AND_ML110_GATE_TRANSITION",
        "owner_approval": "YES",
        "founder_decision": "ADOPTED",
        "predecessor_authority": "authority/MEF_B02_ML109_AUTHORITY_ACTIVATION.yaml",
        "successor_authority": "authority/MEF_B02_ML110_AUTHORITY_ACTIVATION.yaml",
        "previous_current_block": "B02",
        "new_current_block": "B02",
        "previous_gate": "ML-109",
        "new_gate": "ML-110",
        "b00_status": "CLOSED",
        "b01_status": "CLOSED",
        "b02_status": "ACTIVE",
        "ml109_status": "ACCEPTED",
        "ml109_implementation_allowed": "false",
        "ml110_status": "AUTHORIZED",
        "ml110_implementation_allowed": "true",
        "ml111_status": "DEPENDENCY_BLOCKED",
        "ml111_implementation_allowed": "false",
        "b03_status": "DEFERRED",
        "b03_implementation_allowed": "false",
        "production_processor_implementation_allowed": "false",
        "production_processor_implemented": "NO",
        "ml111_implemented": "NO",
        "ml109_qualified_head": "a950aa9a077ebb6c8a74340629cc467f4f3b9ae8",
        "ml109_merge_commit": "0fc87aee8d27de342ca562a1b33bc4ab2866543f",
        "accepted_main_head": "0fc87aee8d27de342ca562a1b33bc4ab2866543f",
        "ml109_contract_scope": "B02-01_FREEZE_CMJ_PROCESSOR_PROTOCOL_EVENT_METRIC_PACK_CONTRACT_V1",
        "corpus_scope": "CMJ_REFERENCE_V1_REFERENCE_CORPUS_AND_ORACLES_ONLY",
        "historical_authority_artifacts_mutated": "NO",
        "active_database": "NEON_POSTGRESQL",
        "active_artifact_storage": "VERCEL_PRIVATE_BLOB",
        "s3_runtime_dependency": "NONE",
        "scientific_boundary": "ML110_REFERENCE_CORPUS_ORACLE_INFRASTRUCTURE_NO_PRODUCTION_PROCESSOR",
        "change_control_record": "authority/MEF_CHANGE_CONTROL.md",
    }
    for key, expected_value in expected.items():
        if values.get(key) != expected_value:
            failures.append(
                f"ML-110 successor authority field {key}: expected {expected_value!r}, found {values.get(key)!r}"
            )
    return failures


def verify_current_register(values: dict[str, str]) -> list[str]:
    failures: list[str] = []
    md = safe_repository_path(values["current_register_md_path"]).read_text(encoding="utf-8-sig")
    yaml = safe_repository_path(values["current_register_yaml_path"]).read_text(encoding="utf-8-sig")
    required_md = (
        "## Adopted authority layers",
        "| MEF-PLATFORM-AGENT-AMENDMENT-V0-1 | 0.1.0 | ADOPTED |",
        "NORMATIVE_PLATFORM_AGENT_AMENDMENT",
        "AUTHORITY_PRESERVATION_CLARIFICATION_NO_SUPERSESSION_ROW_REQUIRED",
    )
    required_yaml = (
        "candidate_authority_layers:",
        'id: "MEF-PLATFORM-AGENT-AMENDMENT-V0-1"',
        'status: "ADOPTED"',
        'effective_status: "NORMATIVE_PLATFORM_AGENT_AMENDMENT"',
        'source_sha256: "' + EXPECTED_AMENDMENT_SOURCE_SHA256 + '"',
        'materialized_repository_path: "authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1"',
        'implementation_authority: false',
        'adoption_record: "authority/MEF_PLATFORM_AGENT_AMENDMENT_ADOPTION.md"',
        'adr_044_disposition: "AUTHORITY_PRESERVATION_CLARIFICATION_NO_SUPERSESSION_ROW_REQUIRED"',
        "founder_acceptance: ADOPTED",
    )
    for fragment in required_md:
        if fragment not in md:
            failures.append(f"current register Markdown missing: {fragment}")
    for fragment in required_yaml:
        if fragment not in yaml:
            failures.append(f"current register YAML missing: {fragment}")
    return failures


def verify_materialized_amendment(values: dict[str, str]) -> list[str]:
    failures: list[str] = []
    root = safe_repository_path(values["materialized_root"])
    sums_path = safe_repository_path(values["materialized_sha256sums_path"])
    authority_yaml_path = safe_repository_path(values["materialized_authority_yaml_path"])
    manifest_path = safe_repository_path(values["materialized_bundle_manifest_path"])
    try:
        entries = parse_sha256_manifest(sums_path.read_bytes(), str(sums_path))
    except (OSError, UnicodeError, ValueError) as exc:
        return [f"materialized amendment checksum error: {exc}"]

    root_resolved = root.resolve()
    for relative_path, expected in entries.items():
        candidate = (root / Path(*relative_path.split("/"))).resolve()
        if not candidate.is_relative_to(root_resolved):
            failures.append(f"materialized checksum path escapes root: {relative_path}")
            continue
        if not candidate.is_file():
            failures.append(f"materialized checksum member missing: {relative_path}")
            continue
        actual = hash_file(candidate)
        if actual != expected:
            failures.append(f"materialized checksum mismatch {relative_path}: expected {expected}, found {actual}")

    physical_files = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    }
    expected_files = set(entries) | {"SHA256SUMS"}
    if physical_files != expected_files:
        failures.append("materialized amendment physical file set differs from SHA256SUMS")

    authority_values = parse_top_level_yaml(authority_yaml_path)
    if authority_values.get("status") != "ADOPTED":
        failures.append("materialized amendment status is not ADOPTED")
    if authority_values.get("effective_status") != "NORMATIVE_PLATFORM_AGENT_AMENDMENT":
        failures.append("materialized amendment effective status is not normative")
    if authority_values.get("implementation_authority") != "false":
        failures.append("materialized amendment implementation authority is not false")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        failures.append(f"materialized bundle manifest parse error: {exc}")
        manifest = {}
    if manifest.get("status") != "ADOPTED":
        failures.append("materialized bundle manifest status is not ADOPTED")

    adr_paths = sorted(
        path
        for path in (root / "03_ADR").glob("ADR-*.md")
        if re.fullmatch(r"ADR-\d{3}-.*\.md", path.name)
    )
    if len(adr_paths) != 14:
        failures.append(f"materialized ADR count is {len(adr_paths)}, expected 14")
    status_paths = [
        root / "README.md",
        root / "01_SDD" / "SAL-MEF-SDD-0.1-PLATFORM-AGENT-AMENDMENT-v0.1.md",
        root / "02_TDD" / "SAL-MEF-TDD-0.1-PLATFORM-AGENT-AMENDMENT-v0.1.md",
        *adr_paths,
    ]
    for path in status_paths:
        if "ADOPTED" not in path.read_text(encoding="utf-8-sig"):
            failures.append(f"materialized status missing ADOPTED: {path.relative_to(ROOT)}")
    return failures


def main() -> int:
    failures: list[str] = []
    try:
        if not accepted_sha_is_ancestor():
            failures.append("accepted ML-93 ancestry check failed")
        if not authority_worktree_has_no_unexpected_changes():
            failures.append("unexpected authority worktree change")
        failures.extend(verify_historical_baseline())
        relock_values, relock_failures = verify_relock()
        failures.extend(relock_failures)
        if relock_values:
            failures.extend(verify_adoption_record(relock_values))
            failures.extend(verify_current_register(relock_values))
            failures.extend(verify_materialized_amendment(relock_values))
        failures.extend(verify_b01_activation())
        failures.extend(verify_ml103_activation())
        failures.extend(verify_ml104_activation())
        failures.extend(verify_ml105_activation())
        failures.extend(verify_ml108_activation())
        failures.extend(verify_ml108_relock_candidate())
        failures.extend(verify_b02_ml109_authorization())
        failures.extend(verify_b02_ml110_authorization())
    except (OSError, UnicodeError, KeyError, ValueError, subprocess.CalledProcessError) as exc:
        failures.append(f"authority validation exception: {exc}")

    if failures:
        for failure in dict.fromkeys(failures):
            print(f"AUTHORITY_HASH_ERROR={failure}")
        print("AUTHORITY_VERIFIER=FAIL")
        return 1

    print(f"HISTORICAL_ML93_BASELINE=PASS files={len(HISTORICAL_ANCHOR_HASHES)}")
    print("PLATFORM_AMENDMENT_SOURCE=PASS")
    print("PLATFORM_AMENDMENT_ADOPTION=PASS")
    print("MATERIALIZED_AMENDMENT=PASS")
    print("CURRENT_AUTHORITY_RELOCK=PASS")
    print("CURRENT_EFFECTIVE_AUTHORITY=PASS")
    print("B01_ML102_AUTHORITY_ACTIVATION=PASS")
    print("B01_ML103_AUTHORITY_ACTIVATION=PASS")
    print("B01_ML104_AUTHORITY_ACTIVATION=PASS")
    print("B01_ML105_AUTHORITY_ACTIVATION=PASS")
    print("B01_ML108_AUTHORITY_ACTIVATION=PASS")
    print("B01_ML108_FINAL_RELOCK_CANDIDATE=PASS")
    print("B02_ML109_AUTHORITY_ACTIVATION=PASS")
    print("B02_ML110_AUTHORITY_ACTIVATION=PASS")
    print("AUTHORITY_VERIFIER=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
