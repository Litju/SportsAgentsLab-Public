from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from build_public_tree import build
from release_common import STAGE_NAME


PUBLIC_OWNER = "Litju"
PUBLIC_REPOSITORY = "SportsAgentsLab-Public"
PUBLIC_BRANCH = "release/initial-public-source-v1"
PUBLIC_PR_TITLE = "Publish initial SportsAgentsLab public source release"


def run(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=root,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def clear_worktree(public_repo: Path) -> None:
    public_repo = public_repo.resolve()
    if not (public_repo / ".git").exists():
        raise ValueError(f"not a Git repository: {public_repo}")
    for child in public_repo.iterdir():
        if child.name == ".git":
            continue
        if child.is_symlink() or child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)


def sync_public_branch(private_repo: Path, public_repo: Path, stage: Path, *, branch: str = PUBLIC_BRANCH) -> bool:
    private_repo = private_repo.resolve()
    public_repo = public_repo.resolve()
    if private_repo == public_repo:
        raise ValueError("private and public repositories must be different")
    build(private_repo, stage)
    run(public_repo, "git", "fetch", "origin", "main")
    status = run(public_repo, "git", "status", "--short").stdout.strip()
    if status:
        raise ValueError(f"public repository is dirty:\n{status}")
    run(public_repo, "git", "switch", branch)
    clear_worktree(public_repo)
    shutil.copytree(stage, public_repo, dirs_exist_ok=True)
    run(public_repo, "git", "add", "--all")
    staged = run(public_repo, "git", "diff", "--cached", "--name-only").stdout.strip()
    if not staged:
        return False
    run(public_repo, "git", "commit", "-m", "docs: update SportsAgentsLab public source release")
    run(public_repo, "git", "push", "origin", branch)
    return True


def publish(private_repo: Path, public_repo: Path | None, stage: Path, *, authorized: bool) -> str:
    if not authorized:
        raise ValueError("public publication requires explicit authorization")
    if public_repo is None:
        raise ValueError("--public-repo is required for publication")
    private_repo = private_repo.resolve()
    public_repo = public_repo.resolve()
    if private_repo == public_repo:
        raise ValueError("private and public repositories must be different")
    build(private_repo, stage)
    run(public_repo, "git", "fetch", "origin", "main")
    status = run(public_repo, "git", "status", "--short").stdout.strip()
    if status:
        raise ValueError(f"public repository is dirty:\n{status}")
    run(public_repo, "git", "switch", "--detach", "origin/main")
    run(public_repo, "git", "switch", "-C", PUBLIC_BRANCH, "origin/main")
    clear_worktree(public_repo)
    shutil.copytree(stage, public_repo, dirs_exist_ok=True)
    run(public_repo, "git", "add", "--all")
    staged = run(public_repo, "git", "diff", "--cached", "--name-only").stdout.strip()
    if not staged:
        raise ValueError("public release produced no changes")
    run(public_repo, "git", "commit", "-m", "docs: publish initial SportsAgentsLab public source release")
    run(public_repo, "git", "push", "--set-upstream", "origin", PUBLIC_BRANCH)
    body = (
        "This pull request publishes the complete SportsAgentsLab source-available distribution.\n\n"
        "Included are the actual application, backend, agent runtime, prompts, tools, domain and scientific packages, schemas, migrations, tests, public evaluation code, CI, build configuration, and project documentation.\n\n"
        "Release gates run source-tree integrity, secret/PII/local-metadata/third-party/held" + "-out scans, public license policy, dependency/security checks, typecheck, lint, tests, and build validation.\n\n"
        "The distribution is proprietary source-available and is not open source."
    )
    pr = subprocess.run(
        [
            "gh",
            "pr",
            "create",
            "--repo",
            f"{PUBLIC_OWNER}/{PUBLIC_REPOSITORY}",
            "--base",
            "main",
            "--head",
            PUBLIC_BRANCH,
            "--title",
            PUBLIC_PR_TITLE,
            "--body",
            body,
        ],
        cwd=public_repo,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    print(pr.stdout.strip())
    return pr.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--public-repo", type=Path, required=True)
    parser.add_argument("--stage", type=Path, default=None)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--update-existing", action="store_true")
    args = parser.parse_args()
    if not args.publish:
        raise SystemExit("publish_public_pr.py requires --publish")
    stage = args.stage or (Path(__import__("tempfile").gettempdir()) / STAGE_NAME)
    if args.update_existing:
        changed = sync_public_branch(args.repo, args.public_repo, stage)
        print("PUBLIC_BRANCH_UPDATED=" + str(changed).lower())
        return 0
    publish(args.repo, args.public_repo, stage, authorized=args.publish)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
