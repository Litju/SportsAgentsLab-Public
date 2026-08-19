from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "packages" / "cmj-contract" / "schemas"
SOURCE_PATH = SCHEMA_DIR / "contract.source.json"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def generated_documents(source: dict[str, Any]) -> dict[str, Any]:
    version = source["contract_version"]
    generated_from = "contract.source.json"
    return {
        "contract.json": source,
        "protocol.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "protocol": source["protocol"],
            "eligible_input": source["eligible_input"],
            "scope": source["scope"],
        },
        "events.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "events": source["events"],
            "phases_included": source["phases_included"],
        },
        "metric-pack.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "metric_pack": source["metric_pack"],
        },
        "excluded-metrics.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "excluded_metrics": source["excluded_metrics"],
        },
        "quality-taxonomy.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "quality_taxonomy": source["quality_taxonomy"],
            "failure_codes": source["failure_codes"],
        },
        "numerical-policy.json": {
            "$generated_from": generated_from,
            "contract_version": version,
            "sample_rate_policy": source["sample_rate_policy"],
            "quiet_standing": source["quiet_standing"],
            "body_system_weight": source["body_system_weight"],
            "gravity": source["gravity"],
            "equations": source["equations"],
            "integration": source["integration"],
            "impulse": source["impulse"],
            "precision_policy": source["precision_policy"],
            "determinism": source["determinism"],
            "calculation_trace": source["calculation_trace"],
            "result_hash": source["result_hash"],
            "analytical_sanity_examples": source["analytical_sanity_examples"],
        },
    }


def manifest(source: dict[str, Any], documents: dict[str, Any]) -> dict[str, Any]:
    result = {
        "$generated_from": "contract.source.json",
        "contract_id": source["contract_id"],
        "contract_version": source["contract_version"],
        "protocol_id": source["protocol"]["protocol_id"],
        "protocol_version": source["protocol_version"],
        "metric_pack_id": source["metric_pack"]["metric_pack_id"],
        "metric_pack_version": source["metric_pack_version"],
        "numerical_policy_version": source["numerical_policy_version"],
        "generated_files": sorted([*documents.keys(), "manifest.json"]),
        "primary_metric_ids": [
            metric["metric_id"]
            for metric in source["metric_pack"]["metrics"]
            if metric["classification"] == "PRIMARY"
        ],
        "event_ids": [event["event_id"] for event in source["events"]],
        "supported_physical_configurations": source["scope"]["supported_physical_configurations"],
    }
    result["manifest_sha256"] = hashlib.sha256(canonical_json(result).encode("utf-8")).hexdigest()
    return result


def serialized(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def expected_files() -> dict[Path, str]:
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    documents = generated_documents(source)
    documents["manifest.json"] = manifest(source, documents)
    return {SCHEMA_DIR / name: serialized(document) for name, document in documents.items()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not SOURCE_PATH.is_file():
        raise SystemExit(f"missing source contract: {SOURCE_PATH}")
    expected = expected_files()
    mismatches = [path for path, content in expected.items() if not path.is_file() or path.read_text(encoding="utf-8") != content]
    if args.check:
        if mismatches:
            for path in mismatches:
                print(f"CMJ_CONTRACT_GENERATION_MISMATCH={path.relative_to(ROOT).as_posix()}")
            print("CMJ_CONTRACT_GENERATION=FAIL")
            return 1
        print("CMJ_CONTRACT_GENERATION=PASS")
        return 0
    for path, content in expected.items():
        path.write_text(content, encoding="utf-8", newline="\n")
    print(f"CMJ_CONTRACT_GENERATION=PASS files={len(expected)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
