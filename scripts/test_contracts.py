from __future__ import annotations

import json
import re
import subprocess
import sys
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any, NoReturn, cast

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = (
    ROOT / "packages" / "contracts" / "schemas" / "domain-contracts.schema.json"
)
MANIFEST_PATH = ROOT / "packages" / "contracts" / "contract-manifest.json"
POLICY_PATH = ROOT / "packages" / "contracts" / "compatibility-policy.json"
OPENAPI_PATH = ROOT / "packages" / "contracts" / "openapi.json"
API_CONTRACT_PATH = ROOT / "packages" / "contracts" / "api" / "job-execution.json"
POSITIVE_PATH = ROOT / "fixtures" / "contracts" / "positive-entities.json"
NEGATIVE_PATH = ROOT / "fixtures" / "contracts" / "negative-cases.json"
GENERATOR_PATH = ROOT / "scripts" / "generate_models.py"
GENERATED_TS_PATH = ROOT / "packages" / "generated-ts" / "src" / "models" / "domain.ts"
GENERATED_PYTHON_PATH = (
    ROOT
    / "packages"
    / "generated-python"
    / "src"
    / "mef_generated_models"
    / "models.py"
)
GENERATED_PYTHON_ROOT = (
    ROOT / "packages" / "generated-python" / "src" / "mef_generated_models"
)

sys.path.insert(0, str(ROOT / "packages" / "generated-python" / "src"))
from mef_generated_models import (  # noqa: E402
    AgentContextId,
    AuditEventId,
    CommandId,
    JobId,
    JobAttemptId,
    ProgressEventId,
    CanonicalAcquisitionId,
    ConfigurationContractId,
    canonical_json,
    EvidenceManifestId,
    ImportAttemptId,
    InferenceResultId,
    MetricObservationId,
    PractitionerDecisionId,
    ProtocolContractId,
    ReferenceEpochId,
    SessionId,
    SourceArtifactId,
    TrialId,
    parse_entity,
    validate_entity,
)


ENTITY_NAMES = (
    "SourceArtifact",
    "ImportAttempt",
    "CanonicalAcquisition",
    "ConfigurationContract",
    "ProtocolContract",
    "Trial",
    "Session",
    "MetricObservation",
    "ReferenceEpoch",
    "InferenceResult",
    "EvidenceManifest",
    "PractitionerDecision",
    "AgentContext",
    "AuditEvent",
    "Command",
    "Job",
    "JobAttempt",
    "ProgressEvent",
)
FORBIDDEN_FIELD_TOKENS = (
    "readiness",
    "fatigue",
    "recovery",
    "injury",
    "diagnosis",
    "clearance",
    "causal_training_effect",
    "training_prescription",
)
ID_TYPES = {
    "SourceArtifact": ("source_artifact_id", SourceArtifactId),
    "ImportAttempt": ("import_attempt_id", ImportAttemptId),
    "CanonicalAcquisition": ("canonical_acquisition_id", CanonicalAcquisitionId),
    "ConfigurationContract": ("configuration_contract_id", ConfigurationContractId),
    "ProtocolContract": ("protocol_contract_id", ProtocolContractId),
    "Trial": ("trial_id", TrialId),
    "Session": ("session_id", SessionId),
    "MetricObservation": ("metric_observation_id", MetricObservationId),
    "ReferenceEpoch": ("reference_epoch_id", ReferenceEpochId),
    "InferenceResult": ("inference_result_id", InferenceResultId),
    "EvidenceManifest": ("evidence_manifest_id", EvidenceManifestId),
    "PractitionerDecision": ("practitioner_decision_id", PractitionerDecisionId),
    "AgentContext": ("agent_context_id", AgentContextId),
    "AuditEvent": ("audit_event_id", AuditEventId),
    "Command": ("command_id", CommandId),
    "Job": ("job_id", JobId),
    "JobAttempt": ("job_attempt_id", JobAttemptId),
    "ProgressEvent": ("progress_event_id", ProgressEventId),
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(message: str) -> NoReturn:
    raise AssertionError(message)


def assert_equal(actual: Any, expected: Any, message: str) -> None:
    if actual != expected:
        fail(f"{message}: expected {expected!r}, got {actual!r}")


def walk_local_refs(value: Any) -> set[str]:
    references: set[str] = set()
    if isinstance(value, dict):
        reference = value.get("$ref")
        if isinstance(reference, str):
            references.add(reference)
        for child in value.values():
            references.update(walk_local_refs(child))
    elif isinstance(value, list):
        for child in value:
            references.update(walk_local_refs(child))
    return references


def resolve_local_ref(schema: dict[str, Any], value: Any) -> Any:
    if isinstance(value, dict):
        reference = value.get("$ref")
        if isinstance(reference, str) and reference.startswith("#/$defs/"):
            return schema["$defs"][reference.removeprefix("#/$defs/")]
    return value


def property_names(schema: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(schema, dict):
        properties = schema.get("properties")
        if isinstance(properties, dict):
            names.update(str(name) for name in properties)
        for child in schema.values():
            names.update(property_names(child))
    elif isinstance(schema, list):
        for child in schema:
            names.update(property_names(child))
    return names


def path_tokens(path: str) -> list[str | int]:
    tokens: list[str | int] = []
    for token in re.findall(r"[^.\[\]]+|\[\d+\]", path):
        if token.startswith("["):
            tokens.append(int(token[1:-1]))
        else:
            tokens.append(token)
    return tokens


def parent_and_key(document: Any, path: str) -> tuple[Any, str | int]:
    tokens = path_tokens(path)
    if not tokens:
        fail("fixture mutation path cannot be empty")
    current = document
    for token in tokens[:-1]:
        if isinstance(token, int):
            if not isinstance(current, list):
                fail(f"mutation expected a list before {token}: {path}")
            current = current[token]
        else:
            if not isinstance(current, dict):
                fail(f"mutation expected an object before {token}: {path}")
            current = current[token]
    return current, tokens[-1]


def apply_mutation(document: Any, case: dict[str, Any]) -> Any:
    mutated = deepcopy(document)
    operation = case["operation"]
    if operation == "replace_many":
        changes = case.get("changes")
        if not isinstance(changes, list):
            fail("replace_many negative fixture has no changes")
        for change in changes:
            if not isinstance(change, dict) or not isinstance(change.get("path"), str):
                fail("replace_many negative fixture has an invalid change")
            change_parent, change_key = parent_and_key(mutated, change["path"])
            change_parent[change_key] = change.get("value")
        return mutated
    parent, key = parent_and_key(mutated, str(case["path"]))
    if operation == "replace":
        parent[key] = case["value"]
    elif operation == "delete":
        del parent[key]
    elif operation == "add":
        parent[key] = case["value"]
    else:
        fail(f"unsupported negative fixture operation: {operation}")
    return mutated


def run_generator(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GENERATOR_PATH), *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def test_canonical_structure(
    schema: dict[str, Any], manifest: dict[str, Any], policy: dict[str, Any]
) -> None:
    Draft202012Validator.check_schema(schema)
    assert_equal(
        schema["$schema"],
        "https://json-schema.org/draft/2020-12/schema",
        "schema dialect",
    )
    assert_equal(schema["$ref"], "#/$defs/EntityRecord", "schema root")
    assert_equal(manifest["contract_version"], "1.0.0", "manifest contract version")
    assert_equal(policy["policy_version"], "1.0.0", "compatibility policy version")

    entity_refs = schema["$defs"]["EntityRecord"]["oneOf"]
    actual_entities = tuple(ref["$ref"].removeprefix("#/$defs/") for ref in entity_refs)
    assert_equal(actual_entities, ENTITY_NAMES, "canonical entity ordering")
    assert_equal(
        tuple(item["name"] for item in manifest["entities"]),
        ENTITY_NAMES,
        "manifest entity ordering",
    )
    assert_equal(len(set(actual_entities)), 18, "duplicate entity definitions")

    manifest_ids: set[str] = set()
    for entity in manifest["entities"]:
        name = entity["name"]
        if entity["schema_ref"] != f"#/$defs/{name}":
            fail(f"manifest schema reference mismatch for {name}")
        identifier = entity["identifier"]
        if identifier in manifest_ids:
            fail(f"duplicate identifier field in manifest: {identifier}")
        manifest_ids.add(identifier)
        definition = schema["$defs"][name]
        if definition["properties"]["entity_type"].get("const") != name:
            fail(f"entity type const missing for {name}")
        schema_version = resolve_local_ref(
            schema, definition["properties"]["schema_version"]
        )
        if schema_version.get("const") != "1.0.0":
            fail(f"schema version const missing for {name}")
        identifier_schema = resolve_local_ref(
            schema, definition["properties"].get(identifier)
        )
        if (
            not isinstance(identifier_schema, dict)
            or "pattern" not in identifier_schema
        ):
            fail(f"nominal identifier pattern missing for {name}")

    for name, definition in schema["$defs"].items():
        if isinstance(definition, dict) and definition.get("type") == "object":
            if definition.get("additionalProperties") is not False:
                fail(f"object definition is not closed: {name}")

    valid_refs = {f"#/$defs/{name}" for name in schema["$defs"]}
    for reference in walk_local_refs(schema):
        if reference.startswith("#/$defs/") and reference not in valid_refs:
            fail(f"unresolved local schema reference: {reference}")
        if not reference.startswith("#/$defs/") and reference != schema["$id"]:
            fail(f"unexpected external schema reference: {reference}")

    names = {name.lower() for name in property_names(schema)}
    forbidden = {
        token
        for token in FORBIDDEN_FIELD_TOKENS
        if any(token in name for name in names)
    }
    if forbidden:
        fail("forbidden governed field names present: " + ",".join(sorted(forbidden)))


def test_openapi(openapi: dict[str, Any]) -> None:
    assert_equal(openapi["openapi"], "3.1.0", "OpenAPI version")
    expected_paths = {
        "/commands",
        "/jobs/{job_id}",
        "/jobs/{job_id}/progress",
        "/jobs/{job_id}/cancellation",
    }
    assert_equal(set(openapi["paths"]), expected_paths, "ML-97 OpenAPI endpoint inventory")
    components = openapi.get("components", {}).get("schemas", {})
    if any(name not in components for name in ENTITY_NAMES):
        fail("OpenAPI surface is missing one or more canonical entities")
    for name in ENTITY_NAMES:
        reference = components[name].get("$ref")
        if reference != f"./schemas/domain-contracts.schema.json#/$defs/{name}":
            fail(f"OpenAPI schema reference mismatch for {name}")
    for name in ("CommandSubmission", "CommandAccepted", "ProgressEventCollection", "CancellationRequest", "ApiError"):
        if name not in components:
            fail(f"OpenAPI surface is missing API schema {name}")


def test_api_contract_source(api_contract: dict[str, Any]) -> None:
    assert_equal(api_contract.get("api_version"), "1", "ML-97 API contract source version")
    operations = api_contract.get("operations")
    if not isinstance(operations, dict):
        fail("ML-97 API contract source has no operations")
    expected_paths = {"/commands", "/jobs/{job_id}", "/jobs/{job_id}/progress", "/jobs/{job_id}/cancellation"}
    assert_equal(set(operations), expected_paths, "ML-97 API contract source endpoint inventory")
    schemas = api_contract.get("schemas")
    if not isinstance(schemas, dict):
        fail("ML-97 API contract source has no schemas")
    for name in ("CommandSubmission", "CommandAccepted", "ProgressEventCollection", "CancellationRequest", "ApiError", "ApiErrorCode"):
        if name not in schemas:
            fail(f"ML-97 API contract source is missing schema {name}")


def _walk_values(value: Any) -> list[Any]:
    values = [value]
    if isinstance(value, dict):
        for child in value.values():
            values.extend(_walk_values(child))
    elif isinstance(value, list):
        for child in value:
            values.extend(_walk_values(child))
    return values


def test_positive_fixtures(schema: dict[str, Any], positive: dict[str, Any]) -> None:
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    assert_equal(tuple(positive), ENTITY_NAMES, "positive fixture entity ordering")
    serialized = json.dumps(positive, ensure_ascii=False)
    if "UNKNOWN" not in serialized or "UNRESOLVED" not in serialized:
        fail("positive fixtures do not exercise explicit unknown/unresolved states")
    if not any(value == [] for value in _walk_values(positive)):
        fail("positive fixtures do not exercise an empty permitted collection")
    for entity_type in ENTITY_NAMES:
        document = positive[entity_type]
        errors = sorted(
            validator.iter_errors(document), key=lambda error: list(error.path)
        )
        if errors:
            fail(f"JSON Schema rejected positive {entity_type}: {errors[0].message}")
        result = validate_entity(document, entity_type)
        if not result.valid:
            fail(
                f"generated Python runtime rejected positive {entity_type}: {result.errors}"
            )
        parsed = parse_entity(document)
        if canonical_json(parsed) != canonical_json(document):
            fail(f"Python canonical round-trip changed {entity_type}")
        identifier_field, identifier_type = ID_TYPES[entity_type]
        parsed_mapping = cast(Mapping[str, object], parsed)
        if type(parsed_mapping[identifier_field]) is not identifier_type:
            fail(f"Python parser did not preserve nominal ID type for {entity_type}")


def test_negative_fixtures(
    schema: dict[str, Any], positive: dict[str, Any], negative: list[dict[str, Any]]
) -> None:
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    if len(negative) < 16:
        fail("negative fixture corpus is not exhaustive enough")
    for case in negative:
        entity_type = str(case["base_entity"])
        mutated = apply_mutation(positive[entity_type], case)
        schema_errors = list(validator.iter_errors(mutated))
        if not schema_errors and case.get("schema_rejects", True):
            fail(f"JSON Schema accepted negative fixture {case['name']}")
        result = validate_entity(mutated, entity_type)
        if result.valid:
            fail(f"generated Python runtime accepted negative fixture {case['name']}")
        codes = {str(error["code"]) for error in result.errors}
        expected_code = str(case["expected_code"])
        if expected_code not in codes:
            fail(
                f"negative fixture {case['name']} reported {sorted(codes)}, "
                f"expected {expected_code}"
            )


def test_determinism_and_drift() -> None:
    before = {
        path: path.read_bytes() for path in (GENERATED_TS_PATH, GENERATED_PYTHON_PATH)
    }
    generated = run_generator()
    if generated.returncode != 0:
        fail("canonical generation failed: " + generated.stderr)
    after = {path: path.read_bytes() for path in before}
    if before != after:
        fail("canonical generation changed generated output")

    for path in (GENERATED_TS_PATH, GENERATED_PYTHON_PATH):
        original = path.read_bytes()
        try:
            path.write_bytes(original + b"\n// intentional temporary drift\n")
            drift = run_generator("--check")
            if drift.returncode == 0 or "GENERATED_MODEL_DRIFT" not in drift.stdout:
                fail(f"generation drift was not detected for {path}")
        finally:
            path.write_bytes(original)
        restored = run_generator("--check")
        if restored.returncode != 0:
            fail(f"generated output was not restored after drift test: {path}")

    orphan = GENERATED_PYTHON_ROOT / "_intentional_orphan.py"
    try:
        orphan.write_text("# intentional orphan generated artifact\n", encoding="utf-8")
        drift = run_generator("--check")
        if (
            drift.returncode == 0
            or orphan.relative_to(ROOT).as_posix() not in drift.stdout
        ):
            fail("generation drift did not detect an orphan generated artifact")
    finally:
        if orphan.exists():
            orphan.unlink()
    restored = run_generator("--check")
    if restored.returncode != 0:
        fail("generated output was not restored after orphan drift test")


def main() -> int:
    schema = load_json(SCHEMA_PATH)
    manifest = load_json(MANIFEST_PATH)
    policy = load_json(POLICY_PATH)
    openapi = load_json(OPENAPI_PATH)
    api_contract = load_json(API_CONTRACT_PATH)
    positive = load_json(POSITIVE_PATH)
    negative = load_json(NEGATIVE_PATH)

    test_canonical_structure(schema, manifest, policy)
    print("CONTRACT_SCHEMA_STRUCTURE=PASS")
    test_openapi(openapi)
    print("OPENAPI_SCHEMA_SURFACE=PASS")
    test_api_contract_source(api_contract)
    print("API_CONTRACT_SOURCE=PASS")
    test_positive_fixtures(schema, positive)
    print("CONTRACT_POSITIVE_FIXTURES=PASS")
    test_negative_fixtures(schema, positive, negative)
    print("CONTRACT_NEGATIVE_FIXTURES=PASS")
    test_determinism_and_drift()
    print("GENERATION_REPRODUCIBILITY=PASS")
    print("GENERATION_DRIFT_DETECTION=PASS")
    print("JSON_SCHEMA_RUNTIME_VALIDATION=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
