from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from mef_generated_models import canonical_json, validate_entity
from mef_generated_models.schema_data import SCHEMA_DOCUMENT


EXPECTED_MANIFEST_VERSION = "0.1.0"
EXPECTED_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"


def _canonical_digest(value: Any) -> str:
    canonical = canonical_json(value).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _safe_declared_path(
    repository_root: Path,
    declared_path: Any,
    required_prefix: str,
    label: str,
) -> Path:
    if not isinstance(declared_path, str):
        raise ValueError(f"declared {label} path must be a string")
    relative = Path(declared_path)
    if (
        relative.is_absolute()
        or not relative.parts
        or relative.parts[0] != required_prefix
        or ".." in relative.parts
    ):
        raise ValueError(f"declared {label} must be under {required_prefix}")
    resolved = (repository_root / relative).resolve()
    try:
        resolved.relative_to(repository_root)
    except ValueError as error:
        raise ValueError(f"declared {label} escapes repository root") from error
    return resolved


def _validate_contract_artifact(
    artifact: Any, schema: dict[str, Any], entity_type: str
) -> None:
    if schema.get("$schema") != EXPECTED_SCHEMA_DIALECT:
        raise ValueError("declared contract schema dialect is not canonical")
    if schema != SCHEMA_DOCUMENT:
        raise ValueError(
            "declared contract schema differs from generated canonical schema"
        )
    result = validate_entity(artifact, entity_type)
    if not result.valid:
        details = "; ".join(
            f"{error['code']}:{error['path']}" for error in result.errors
        )
        raise ValueError("declared artifact contract is invalid: " + details)


def replay_manifest(manifest_path: Path, repository_root: Path) -> dict[str, str]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repository_root = repository_root.resolve()
    try:
        manifest_path.resolve().relative_to(repository_root)
    except ValueError as error:
        raise ValueError("declared manifest escapes repository root") from error
    required_manifest = {
        "manifest_version",
        "artifact_path",
        "artifact_selector",
        "contract_schema_path",
        "expected_canonical_sha256",
    }
    missing_manifest = sorted(required_manifest.difference(manifest))
    if missing_manifest:
        raise ValueError(
            "replay manifest is missing fields: " + ", ".join(missing_manifest)
        )
    if manifest["manifest_version"] != EXPECTED_MANIFEST_VERSION:
        raise ValueError("replay manifest version is unsupported")
    artifact_path = _safe_declared_path(
        repository_root, manifest["artifact_path"], "fixtures", "artifact"
    )
    schema_ref = manifest["contract_schema_path"]
    schema_path = _safe_declared_path(
        repository_root, schema_ref, "packages", "contract schema"
    )
    if Path(schema_ref).parts[:3] != (
        "packages",
        "contracts",
        "schemas",
    ):
        raise ValueError(
            "declared contract schema must be under packages/contracts/schemas"
        )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    artifact_document = json.loads(artifact_path.read_text(encoding="utf-8"))
    entity_type = manifest["artifact_selector"]
    if not isinstance(entity_type, str):
        raise ValueError("declared artifact selector must be a string")
    if not isinstance(artifact_document, dict) or entity_type not in artifact_document:
        raise ValueError("declared artifact selector was not found")
    artifact = artifact_document[entity_type]
    _validate_contract_artifact(artifact, schema, entity_type)
    actual_digest = _canonical_digest(artifact)
    expected_digest = manifest["expected_canonical_sha256"]
    if actual_digest != expected_digest:
        raise ValueError(
            f"replay digest mismatch: expected {expected_digest}, got {actual_digest}"
        )
    return {
        "artifact": manifest["artifact_path"],
        "canonical_sha256": actual_digest,
        "status": "verified",
    }
