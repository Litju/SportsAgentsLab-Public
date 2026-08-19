from __future__ import annotations

import sys
from tempfile import TemporaryDirectory
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
for source in (
    ROOT / "packages" / "generated-python" / "src",
    ROOT / "scientific" / "kernel" / "src",
    ROOT / "tools" / "evidence-replay" / "src",
):
    sys.path.insert(0, str(source))


def main() -> int:
    from mef_evidence_replay import replay_manifest
    from mef_generated_models import canonical_json, validate_entity
    from mef_scientific_kernel import KERNEL_BOUNDARY, KERNEL_PACKAGE

    import json

    schema = json.loads(
        (
            ROOT / "packages" / "contracts" / "schemas" / "domain-contracts.schema.json"
        ).read_text(encoding="utf-8")
    )
    if schema["$schema"] != "https://json-schema.org/draft/2020-12/schema":
        raise AssertionError("contract schema dialect is not canonical")
    if len(schema["$defs"]["EntityRecord"]["oneOf"]) != 18:
        raise AssertionError("canonical entity union does not contain 18 entities")
    positive = json.loads(
        (ROOT / "fixtures" / "contracts" / "positive-entities.json").read_text(
            encoding="utf-8"
        )
    )
    source_artifact = positive["SourceArtifact"]
    if not validate_entity(source_artifact, "SourceArtifact").valid:
        raise AssertionError("generated Python runtime rejected the canonical fixture")
    if canonical_json(source_artifact) != canonical_json(
        json.loads(canonical_json(source_artifact))
    ):
        raise AssertionError("generated Python canonical serialization is unstable")
    if KERNEL_PACKAGE != "mef-scientific-kernel":
        raise AssertionError("scientific package identity mismatch")
    if KERNEL_BOUNDARY != "python-scientific-kernel":
        raise AssertionError("scientific boundary identity mismatch")
    result = replay_manifest(
        ROOT / "fixtures" / "evidence" / "replay-manifest.json",
        ROOT,
    )
    if result["status"] != "verified":
        raise AssertionError("evidence replay did not verify")
    with TemporaryDirectory() as temporary_directory:
        escape_manifest = Path(temporary_directory) / "escape.json"
        escape_manifest.write_text(
            json.dumps(
                {
                    "artifact_path": "../outside.json",
                    "expected_canonical_sha256": "0" * 64,
                }
            ),
            encoding="utf-8",
        )
        try:
            replay_manifest(escape_manifest, ROOT)
        except ValueError as error:
            if "escapes repository root" not in str(error):
                raise
        else:
            raise AssertionError("evidence path traversal was not rejected")
    print("PYTHON_PACKAGE_IMPORT=PASS")
    print("CONTRACT_SCHEMA_LOADING=PASS")
    print("EVIDENCE_REPLAY_SMOKE=PASS")
    print("EVIDENCE_PATH_SAFETY=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
