from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = (
    ROOT / "packages" / "contracts" / "schemas" / "domain-contracts.schema.json"
)
POLICY_PATH = ROOT / "packages" / "contracts" / "compatibility-policy.json"
VERSION_PATTERN = re.compile(r"/mef/(?P<version>[^/]+)/")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def schema_version(schema: dict[str, Any]) -> str | None:
    schema_id = schema.get("$id")
    if not isinstance(schema_id, str):
        return None
    match = VERSION_PATTERN.search(schema_id)
    return match.group("version") if match else None


def governed_projection(value: Any) -> Any:
    """Keep compatibility-significant schema keywords, excluding prose metadata."""
    if isinstance(value, dict):
        ignored = {"description", "title", "examples", "$comment"}
        return {
            key: governed_projection(child)
            for key, child in value.items()
            if key not in ignored
        }
    if isinstance(value, list):
        return [governed_projection(child) for child in value]
    return value


def compatibility_verdict(
    old_schema: dict[str, Any],
    new_schema: dict[str, Any],
    policy: dict[str, Any],
) -> tuple[bool, str]:
    expected_version = policy["schema_version"]
    old_version = schema_version(old_schema)
    new_version = schema_version(new_schema)
    if old_version != expected_version or new_version != expected_version:
        return False, "UNKNOWN_SCHEMA_VERSION"
    if old_schema.get("$id") != new_schema.get("$id"):
        return False, "INCOMPATIBLE_CONTRACT_VERSION"

    old_defs = old_schema.get("$defs", {})
    new_defs = new_schema.get("$defs", {})
    if not isinstance(old_defs, dict) or not isinstance(new_defs, dict):
        return False, "VALIDATION_ERROR"
    for name, old_definition in old_defs.items():
        if name not in new_defs:
            return False, f"removed_definition:{name}"
        new_definition = new_defs[name]
        if not isinstance(old_definition, dict) or not isinstance(new_definition, dict):
            return False, f"changed_definition:{name}"
        if old_definition.get("type") != "object":
            if governed_projection(old_definition) != governed_projection(
                new_definition
            ):
                return False, f"changed_governed_definition:{name}"
            continue

        if old_definition.get("additionalProperties") != new_definition.get(
            "additionalProperties"
        ):
            return False, f"changed_object_closure:{name}"

        old_properties = old_definition.get("properties", {})
        new_properties = new_definition.get("properties", {})
        old_required = set(old_definition.get("required", []))
        new_required = set(new_definition.get("required", []))
        if not isinstance(old_properties, dict) or not isinstance(new_properties, dict):
            return False, f"invalid_properties:{name}"

        removed = set(old_properties).difference(new_properties)
        if removed:
            return False, f"removed_property:{name}.{sorted(removed)[0]}"
        added_required = new_required.difference(old_required)
        if added_required:
            return False, f"added_required_property:{name}.{sorted(added_required)[0]}"
        if old_required != new_required:
            return False, f"changed_required_set:{name}"
        for field in set(old_properties).intersection(new_properties):
            if governed_projection(old_properties[field]) != governed_projection(
                new_properties[field]
            ):
                return False, f"changed_property:{name}.{field}"

    return True, "allowed"


def assert_verdict(
    label: str,
    old_schema: dict[str, Any],
    new_schema: dict[str, Any],
    policy: dict[str, Any],
    expected_valid: bool,
) -> None:
    actual_valid, reason = compatibility_verdict(old_schema, new_schema, policy)
    if actual_valid != expected_valid:
        raise AssertionError(
            f"compatibility case {label} expected {expected_valid}, "
            f"got {actual_valid} ({reason})"
        )


def main() -> int:
    schema = load_json(SCHEMA_PATH)
    policy = load_json(POLICY_PATH)

    assert_verdict("same-version", schema, copy.deepcopy(schema), policy, True)

    optional_addition = copy.deepcopy(schema)
    optional_addition["$defs"]["SourceArtifact"]["properties"]["contract_note"] = {
        "type": "string",
        "minLength": 1,
    }
    assert_verdict("allowed-optional-addition", schema, optional_addition, policy, True)

    removed_required = copy.deepcopy(schema)
    del removed_required["$defs"]["SourceArtifact"]["properties"]["original_filename"]
    assert_verdict("removed-required-field", schema, removed_required, policy, False)

    changed_type = copy.deepcopy(schema)
    changed_type["$defs"]["SourceArtifact"]["properties"]["byte_size"] = {
        "type": "string"
    }
    assert_verdict("changed-field-type", schema, changed_type, policy, False)

    changed_enum = copy.deepcopy(schema)
    changed_enum["$defs"]["SourceArtifactLifecycleState"]["enum"].append("REVIEW")
    assert_verdict("changed-governed-enum", schema, changed_enum, policy, False)

    renamed_field = copy.deepcopy(schema)
    source = renamed_field["$defs"]["SourceArtifact"]["properties"]
    source["original_name"] = source.pop("original_filename")
    assert_verdict("renamed-governed-field", schema, renamed_field, policy, False)

    opened_object = copy.deepcopy(schema)
    opened_object["$defs"]["SourceArtifact"]["additionalProperties"] = True
    assert_verdict("opened-object-closure", schema, opened_object, policy, False)

    unknown_version = copy.deepcopy(schema)
    unknown_version["$id"] = unknown_version["$id"].replace("/1.0.0/", "/9.9.9/")
    assert_verdict("unknown-schema-version", schema, unknown_version, policy, False)

    print("COMPATIBILITY_SAME_VERSION=PASS")
    print("COMPATIBILITY_ALLOWED_OPTIONAL_ADDITION=PASS")
    print("COMPATIBILITY_BREAKING_CHANGES=PASS")
    print("COMPATIBILITY_UNKNOWN_SCHEMA_VERSION=PASS")
    print("COMPATIBILITY_POLICY=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
