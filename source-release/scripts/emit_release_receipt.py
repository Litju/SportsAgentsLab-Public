from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from inventory_tracked_files import build_inventory
from release_common import canonical_json, git_value, read_text, sha256_file, tree_hash


def parse_json_object(value: str | None) -> dict[str, object]:
    if not value:
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("receipt metadata must be a JSON object")
    return parsed


def emit(
    private_repo: Path,
    public_root: Path | None,
    output: Path | None,
    *,
    status: str = "PASS",
    private_pr: str | None = None,
    private_pr_state: str = "OPEN",
    private_base_head: str | None = None,
    public_repo: str = "Litju/SportsAgentsLab-Public",
    public_release_branch: str = "release/initial-public-source-v1",
    public_pr: str | None = None,
    public_followup_pr: str | None = None,
    public_merge: str | None = None,
    public_ci: dict[str, object] | None = None,
    security: dict[str, object] | None = None,
) -> Path:
    private_repo = private_repo.resolve()
    inventory = build_inventory(private_repo)
    records = inventory["records"]
    if not isinstance(records, list):
        raise ValueError("tracked-file inventory records are missing")
    excluded = [record for record in records if record["classification"].startswith("EXCLUDE_")]
    redacted = [record for record in records if record["classification"] == "PUBLISH_REDACTED"]
    generated = [record for record in records if record["classification"] == "PUBLISH_GENERATED_TEMPLATE"]
    excluded_count = len(excluded)
    publishable_count = int(inventory["tracked_file_count"]) - excluded_count
    published_count = sum(
        int(inventory["classification_counts"].get(classification, 0))
        for classification in ("PUBLISH_AS_IS", "PUBLISH_REDACTED", "PUBLISH_GENERATED_TEMPLATE")
    )
    base_head = private_base_head or git_value(private_repo, "merge-base", "main", "HEAD")
    security = security or {}
    public_ci = public_ci or {}
    public_metadata: dict[str, object] = {}
    receipt: dict[str, object] = {
        "schema": "sportsagentslab.private-release-receipt.v1",
        "mission": "SPORTSAGENTSLAB_FULL_PUBLIC_SOURCE_RELEASE_V1",
        "status": status,
        "private_base_head": base_head,
        "private_release_branch": inventory["private_release_branch"],
        "private_head": inventory["private_head"],
        "private_pr": private_pr,
        "private_pr_state": private_pr_state,
        "tracked_file_count": inventory["tracked_file_count"],
        "classification_counts": inventory["classification_counts"],
        "unclassified_count": inventory["unclassified_count"],
        "excluded_paths": excluded,
        "redacted_paths": redacted,
        "generated_template_paths": generated,
        "publication_coverage_percent": round(100 * published_count / max(1, publishable_count), 2),
        "audits": security.get("audits", {}),
        "public_repository": public_repo,
        "public_visibility": "PUBLIC",
        "public_default_branch": "main",
        "public_release_branch": public_release_branch,
        "public_tree_sha256": None,
        "public_license_sha256": None,
        "public_pr": public_pr,
        "public_followup_pr": public_followup_pr,
        "public_merge": public_merge,
        "public_merge_commit": public_merge,
        "public_ci_outcomes": public_ci,
        "ruleset_state": security.get("ruleset_state", "NOT_RECORDED"),
        "security_settings": security,
        "b02_advanced": False,
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    if public_root is not None:
        public_root = public_root.resolve()
        receipt["public_tree_sha256"] = tree_hash(public_root, exclude={"PUBLIC_SOURCE_RELEASE.json"})
        license_path = public_root / "LICENSE"
        if license_path.is_file():
            receipt["public_license_sha256"] = sha256_file(license_path)
        metadata_path = public_root / "PUBLIC_SOURCE_RELEASE.json"
        metadata_text = read_text(metadata_path)
        if metadata_text:
            public_metadata = json.loads(metadata_text)
            receipt["public_source_metadata"] = public_metadata
    target = output or (private_repo / "source-release/receipts/PRIVATE_RELEASE_RECEIPT.json")
    target = target if target.is_absolute() else private_repo / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(canonical_json(receipt))
    text_target = target.with_suffix(".txt")
    text_target.write_text(
        "SportsAgentsLab private release receipt\n"
        f"mission={receipt['mission']}\n"
        f"status={receipt['status']}\n"
        f"private_base_head={receipt['private_base_head']}\n"
        f"private_release_branch={receipt['private_release_branch']}\n"
        f"private_head={receipt['private_head']}\n"
        f"private_pr={receipt['private_pr']}\n"
        f"private_pr_state={receipt['private_pr_state']}\n"
        f"tracked_file_count={receipt['tracked_file_count']}\n"
        f"classification_counts={json.dumps(receipt['classification_counts'], sort_keys=True)}\n"
        f"unclassified_count={receipt['unclassified_count']}\n"
        f"excluded_paths={json.dumps(receipt['excluded_paths'], ensure_ascii=False, sort_keys=True)}\n"
        f"redacted_paths={json.dumps(receipt['redacted_paths'], ensure_ascii=False, sort_keys=True)}\n"
        f"publication_coverage_percent={receipt['publication_coverage_percent']}\n"
        f"public_repository={receipt['public_repository']}\n"
        f"public_release_branch={receipt['public_release_branch']}\n"
        f"public_tree_sha256={receipt['public_tree_sha256']}\n"
        f"public_license_sha256={receipt['public_license_sha256']}\n"
        f"public_pr={receipt['public_pr']}\n"
        f"public_followup_pr={receipt['public_followup_pr']}\n"
        f"public_merge={receipt['public_merge']}\n"
        f"public_ci_outcomes={json.dumps(receipt['public_ci_outcomes'], sort_keys=True)}\n"
        f"ruleset_state={receipt['ruleset_state']}\n"
        "b02_advanced=False\n",
        encoding="utf-8",
        newline="",
    )
    print(json.dumps(receipt, indent=2, ensure_ascii=False))
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--public", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--status", default="PASS")
    parser.add_argument("--private-pr")
    parser.add_argument("--private-pr-state", default="OPEN")
    parser.add_argument("--private-base-head")
    parser.add_argument("--public-repo", default="Litju/SportsAgentsLab-Public")
    parser.add_argument("--public-release-branch", default="release/initial-public-source-v1")
    parser.add_argument("--public-pr")
    parser.add_argument("--public-followup-pr")
    parser.add_argument("--public-merge")
    parser.add_argument("--public-ci-json")
    parser.add_argument("--security-json")
    args = parser.parse_args()
    emit(
        args.repo,
        args.public,
        args.output,
        status=args.status,
        private_pr=args.private_pr,
        private_pr_state=args.private_pr_state,
        private_base_head=args.private_base_head,
        public_repo=args.public_repo,
        public_release_branch=args.public_release_branch,
        public_pr=args.public_pr,
        public_followup_pr=args.public_followup_pr,
        public_merge=args.public_merge,
        public_ci=parse_json_object(args.public_ci_json),
        security=parse_json_object(args.security_json),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
