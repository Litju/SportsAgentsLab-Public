from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from compare_private_public_tree import compare  # noqa: E402
from release_common import (  # noqa: E402
    STAGE_NAME,
    canonical_json,
    git_value,
    inventory,
    public_path_for,
    redact_config_text,
    redact_archive_bytes,
    repo_path,
    sha256_bytes,
    tree_hash,
)
from verify_public_tree import verify  # noqa: E402


def safe_stage_path(stage: Path) -> Path:
    resolved = stage.resolve()
    if resolved.name != STAGE_NAME:
        raise ValueError(f"stage must be named {STAGE_NAME}: {resolved}")
    if resolved == Path(resolved.anchor):
        raise ValueError("refusing to use a filesystem root as release stage")
    return resolved


def reset_stage(stage: Path) -> None:
    stage = safe_stage_path(stage)
    if stage.exists():
        if not stage.is_dir() or stage.is_symlink():
            raise ValueError(f"release stage is not a directory: {stage}")
        shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=False)


def tracked_blob(repo: Path, relative: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "blob", f"HEAD:{relative}"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def copy_file(
    source: Path,
    destination: Path,
    *,
    data: bytes | None = None,
    transform: str | None = None,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = source.read_bytes() if data is None else data
    if transform == "config":
        try:
            data = redact_config_text(data.decode("utf-8")).encode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"cannot redact non-text config {source}") from exc
    elif transform == "archive":
        data = redact_archive_bytes(data)
    destination.write_bytes(data)


def build(repo: Path, stage: Path) -> dict[str, object]:
    repo = repo.resolve()
    stage = safe_stage_path(stage)
    reset_stage(stage)
    records = inventory(repo)
    counts = Counter(record.classification for record in records)
    if any(record.classification not in {
        "PUBLISH_AS_IS",
        "PUBLISH_REDACTED",
        "PUBLISH_GENERATED_TEMPLATE",
        "EXCLUDE_SECRET",
        "EXCLUDE_PII",
        "EXCLUDE_MACHINE_LOCAL",
        "EXCLUDE_THIRD_PARTY_RIGHTS",
        "EXCLUDE_LIVE_OPERATIONAL_SECRET",
        "EXCLUDE_HELDOUT_EVALUATION",
        "EXCLUDE_LEGAL_PRIVILEGE",
    } for record in records):
        raise ValueError("inventory contains an unclassified path")

    for record in records:
        if record.classification.startswith("EXCLUDE_"):
            continue
        source = repo_path(repo, record.path)
        destination = stage / Path(*record.public_path.split("/"))
        source_bytes = tracked_blob(repo, record.path)
        if record.classification == "PUBLISH_REDACTED":
            copy_file(
                source,
                destination,
                data=source_bytes,
                transform="archive" if source.suffix.lower() == ".zip" else "config",
            )
        elif record.classification == "PUBLISH_GENERATED_TEMPLATE":
            if record.path.startswith("source-release/public/") or record.path.endswith(".env.example"):
                copy_file(
                    source,
                    destination,
                    data=source_bytes,
                    transform="config" if record.path.endswith(".env.example") else None,
                )
            elif record.path in {"README.md", "CONTRIBUTING.md"}:
                # The public governance asset under source-release/public/ is
                # the intentional root replacement for the private document.
                continue
            else:
                raise ValueError(f"generated template has no generator mapping: {record.path}")
        else:
            copy_file(source, destination, data=source_bytes)

    public_metadata = {
        "schema": "sportsagentslab.public-source-release.v1",
        "mission": "SPORTSAGENTSLAB_FULL_PUBLIC_SOURCE_RELEASE_V1",
        "distribution": "full-public-source-available",
        "license": "SportsAgentsLab Proprietary Source-Available License",
        "copyright": "Julio Rodriguez 2026",
        "tracked_source_file_count": sum(
            1 for record in records if not record.classification.startswith("EXCLUDE_")
        ),
        "excluded_file_count": sum(
            1 for record in records if record.classification.startswith("EXCLUDE_")
        ),
        "tree_sha256": tree_hash(stage, exclude={"PUBLIC_SOURCE_RELEASE.json"}),
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    (stage / "PUBLIC_SOURCE_RELEASE.json").write_bytes(canonical_json(public_metadata))
    return {
        "stage": str(stage),
        "tracked_file_count": len(records),
        "classification_counts": dict(sorted(counts.items())),
        "public_tree_sha256": public_metadata["tree_sha256"],
        "public_file_count": sum(1 for path in stage.rglob("*") if path.is_file()),
    }


def run_scans(stage: Path) -> None:
    from scan_heldout import scan as scan_heldout_files
    from scan_local_metadata import scan as scan_local_files
    from scan_pii import scan as scan_pii_files
    from scan_secrets import scan as scan_secret_files
    from scan_third_party import scan as scan_third_party_files

    scanners = (
        ("secrets", scan_secret_files),
        ("pii", scan_pii_files),
        ("local metadata", scan_local_files),
        ("third-party rights", scan_third_party_files),
        ("held" + "-out evaluation", scan_heldout_files),
    )
    findings: dict[str, object] = {}
    for name, scanner in scanners:
        result = scanner(stage)
        findings[name] = result
        if result["findings"]:
            raise ValueError(f"{name} scan failed: {json.dumps(result, ensure_ascii=False)}")
    print(json.dumps(findings, indent=2, ensure_ascii=False))


def run_tests(repo: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "source-release/tests", "-p", "test_*.py"],
        cwd=repo,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.returncode)


def default_stage() -> Path:
    return Path(tempfile.gettempdir()) / STAGE_NAME


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("audit", "build", "scan", "test", "diff", "publish-pr", "release-receipt"), default="audit")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--stage", type=Path, default=None)
    parser.add_argument("--public", type=Path, default=None)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    stage = safe_stage_path((args.stage or default_stage()).resolve())

    if args.mode == "test":
        run_tests(repo)
        return 0
    if args.mode == "publish-pr":
        if not args.publish:
            raise SystemExit("publish-pr requires --publish")
        from publish_public_pr import publish

        publish(repo, args.public, stage, authorized=True)
        return 0
    if args.mode == "release-receipt":
        from emit_release_receipt import emit

        emit(repo, args.public, None)
        return 0

    summary = build(repo, stage)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if args.mode in {"audit", "scan"}:
        verify(stage, private_repo=repo)
        run_scans(stage)
    if args.mode in {"audit", "diff"}:
        if args.public is None:
            if args.mode == "diff":
                raise SystemExit("diff requires --public")
        else:
            compare(repo, args.public.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
