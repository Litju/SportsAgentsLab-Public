from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from release_common import iter_files, read_text, tree_hash


REQUIRED_FILES = {
    "LICENSE",
    "NOTICE",
    "COPYRIGHT",
    "TRADEMARKS.md",
    "SECURITY.md",
    "PUBLIC_SOURCE_RELEASE.json",
    ".github/workflows/public-source-integrity.yml",
    ".github/workflows/public-build.yml",
    ".github/workflows/public-security.yml",
    ".github/workflows/codeql.yml",
    ".github/dependabot.yml",
}


def _paths(root: Path) -> set[str]:
    return {path.relative_to(root).as_posix() for path in iter_files(root)}


def verify(root: Path, *, private_repo: Path | None = None) -> dict[str, object]:
    root = root.resolve()
    paths = _paths(root)
    missing = sorted(path for path in REQUIRED_FILES | {"README.md"} if path not in paths)
    forbidden: list[str] = []
    for path in sorted(paths):
        lower = path.lower()
        if "/receipts/" in f"/{lower}/" or lower.startswith("source-release/receipts/"):
            forbidden.append(path)
        if Path(path).name.lower() in {".env", ".env.local", ".env.preview", ".env.production", ".env.development"}:
            forbidden.append(path)
        if any(part in {"node_modules", ".next", ".eve", ".output", ".vercel", ".venv", "__pycache__"} for part in Path(path).parts):
            forbidden.append(path)

    readme = read_text(root / "README.md") or ""
    license_text = read_text(root / "LICENSE") or ""
    metadata_text = read_text(root / "PUBLIC_SOURCE_RELEASE.json") or "{}"
    try:
        metadata = json.loads(metadata_text)
    except json.JSONDecodeError:
        metadata = {}
    license_errors = []
    if "SportsAgentsLab Proprietary Source-Available License" not in license_text:
        license_errors.append("license title missing")
    if "Copyright Julio Rodriguez 2026" not in license_text:
        license_errors.append("copyright missing")
    if "GitHub Terms" not in license_text:
        license_errors.append("GitHub Terms carve-out missing")
    if re.search(r"(?im)^\s*(?:MIT|Apache|BSD|GPL|AGPL) License", license_text):
        license_errors.append("permissive/open-source license marker present")
    readme_errors = []
    for phrase in ("complete publishable", "not a\ndemo-only", "actual tracked", "not open source"):
        if phrase.lower() not in readme.lower():
            readme_errors.append(f"README missing: {phrase}")
    workflows = [path for path in paths if path.startswith(".github/workflows/")]
    workflow_errors = []
    for workflow in workflows:
        text = read_text(root / Path(*workflow.split("/"))) or ""
        if "pull_request_target" in text:
            workflow_errors.append(f"pull_request_target: {workflow}")

    actual_source = {
        "frontend": len(list((root / "apps/practitioner-web").rglob("*.tsx"))) > 0,
        "backend": (root / "apps/practitioner-web/src/server").is_dir() or (root / "apps/control-api").is_dir(),
        "agents": any((root / "apps/practitioner-web").rglob("*agent*")),
        "prompts": any((root / "apps/practitioner-web").rglob("*prompt*"))
        or any((root / "apps/practitioner-web").rglob("*instruction*")),
        "tools": any((root / "apps/practitioner-web").rglob("*tool*")),
        "schemas": any(root.glob("packages/*/src")),
        "migrations": any(root.rglob("*.sql")),
        "scientific": (root / "packages/scientific-boundary").is_dir() or any(root.rglob("*scientific*")),
        "tests": any(root.rglob("*.test.ts")) or any(root.rglob("test_*.py")),
        "evaluations": any(root.rglob("*eval*")),
        "ci": len(workflows) >= 3,
    }
    missing_source = sorted(name for name, present in actual_source.items() if not present)
    result: dict[str, object] = {
        "root": str(root),
        "public_file_count": len(paths),
        "missing_required_files": missing,
        "forbidden_paths": sorted(set(forbidden)),
        "license_errors": license_errors,
        "readme_errors": readme_errors,
        "workflow_errors": workflow_errors,
        "missing_source_categories": missing_source,
        "metadata": metadata,
        "tree_sha256": tree_hash(root, exclude={"PUBLIC_SOURCE_RELEASE.json"}),
    }
    if private_repo is not None:
        result["private_repo_checked"] = str(private_repo.resolve())
    errors = missing + sorted(set(forbidden)) + license_errors + readme_errors + workflow_errors + missing_source
    if errors:
        raise ValueError(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-root", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.public_root)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
