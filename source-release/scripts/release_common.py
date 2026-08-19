"""Shared, dependency-free helpers for the SportsAgentsLab source release.

The release is deliberately a tracked-tree transformation: publishable files
are copied byte-for-byte unless a policy explicitly requires a narrow template
or redaction transformation.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


ALLOWED_CLASSIFICATIONS = {
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
}

STAGE_NAME = "sportsagentslab-full-public-source-v1"
GENERATED_PREFIX = "source-release/public/"
GENERATED_ROOT_FILES = {"README.md", "CONTRIBUTING.md"}
CONFIG_SUFFIXES = {".env", ".ini", ".json", ".properties", ".toml", ".cfg", ".yaml", ".yml"}
SECRET_NAME_PARTS = ("SECRET", "TOKEN", "PASSWORD", "API_KEY", "PRIVATE_KEY", "ACCESS_KEY")
HELDOUT_PATH_MARKERS = (
    "held" + "-out",
    "held" + "_out",
    "answer" + "-key",
    "answer" + "_key",
    "oracle" + "-answer",
    "oracle" + "_answer",
    "blind" + "-eval",
    "blind" + "_eval",
)


@dataclass(frozen=True)
class FileClassification:
    path: str
    classification: str
    reason_code: str
    public_path: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def repo_path(repo: Path, relative: str) -> Path:
    return repo / Path(*relative.split("/"))


def tracked_paths(repo: Path) -> list[str]:
    """Return tracked paths without losing non-ASCII names on Windows."""

    result = subprocess.run(
        ["git", "-C", str(repo), "ls-files", "-z"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return [part.decode("utf-8", "surrogateescape") for part in result.stdout.split(b"\0") if part]


def git_value(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.strip()


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_tree_bytes(path: Path) -> bytes:
    """Hash text as Git stores it, regardless of Windows checkout mode."""

    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    if "\x00" in text:
        return data
    return text.replace("\r\n", "\n").encode("utf-8")


def public_path_for(relative: str) -> str:
    if relative.startswith(GENERATED_PREFIX):
        return relative[len(GENERATED_PREFIX) :]
    return relative


def _path_parts(relative: str) -> tuple[str, ...]:
    return tuple(part.lower() for part in relative.replace("\\", "/").split("/") if part)


def _looks_like_config(relative: str) -> bool:
    return Path(relative).suffix.lower() in CONFIG_SUFFIXES or Path(relative).name.startswith(".env")


def _contains_credentialed_url(text: str) -> bool:
    return bool(re.search(r"\b(?:postgres(?:ql)?|mysql|redis)://[^\s:/]+:[^\s@]+@", text, re.IGNORECASE))


def contains_local_metadata(text: str) -> bool:
    markers = (
        "C:" + "\\" + "Users" + "\\",
        "C:" + "/" + "Users" + "/",
        "/" + "home" + "/",
        "/" + "Users" + "/",
        ".git" + "\\",
        ".git" + "/",
        "file" + "://",
    )
    return any(marker in text for marker in markers)


def archive_has_local_metadata(data: bytes) -> bool:
    try:
        with ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                try:
                    text = archive.read(info).decode("utf-8")
                except (UnicodeDecodeError, OSError):
                    continue
                if contains_local_metadata(text):
                    return True
    except (OSError, ValueError):
        return False
    return False


def classify_path(relative: str) -> tuple[str, str]:
    """Apply deterministic path policy before content-sensitive checks."""

    normalized = relative.replace("\\", "/")
    lower = normalized.lower()
    name = Path(normalized).name.lower()
    parts = _path_parts(normalized)

    if normalized.startswith("source-release/receipts/"):
        return "EXCLUDE_MACHINE_LOCAL", "PRIVATE_RECEIPT_PRIVATE_ONLY"
    if normalized.startswith(GENERATED_PREFIX):
        return "PUBLISH_GENERATED_TEMPLATE", "PUBLIC_ROOT_GOVERNANCE_ASSET"
    if normalized in GENERATED_ROOT_FILES:
        return "PUBLISH_GENERATED_TEMPLATE", "PUBLIC_ROOT_GOVERNANCE_OVERRIDE"
    if name == ".env.example":
        return "PUBLISH_GENERATED_TEMPLATE", "CONFIG_TEMPLATE_REDACTION"
    if name in {".env", ".env.local", ".env.preview", ".env.production", ".env.development"}:
        return "EXCLUDE_SECRET", "ENVIRONMENT_SECRET_FILE"
    if name.endswith((".pem", ".p12", ".pfx", ".jks", ".key")):
        return "EXCLUDE_LIVE_OPERATIONAL_SECRET", "PRIVATE_KEY_OR_CERTIFICATE_FILE"
    if any(marker in lower for marker in ("credentials", "deploy-secrets", "live-secrets")):
        return "EXCLUDE_LIVE_OPERATIONAL_SECRET", "LIVE_SECRET_PATH"
    if any(marker in parts for marker in ("node_modules", ".next", ".eve", ".output", ".vercel", ".venv", "__pycache__")):
        return "EXCLUDE_MACHINE_LOCAL", "GENERATED_MACHINE_DIRECTORY"
    if name.endswith((".pyc", ".tsbuildinfo", ".log", ".tmp", ".swp")):
        return "EXCLUDE_MACHINE_LOCAL", "GENERATED_MACHINE_FILE"
    if any(marker in parts for marker in ("vendor", "third_party", "third-party", "nonredistributable")):
        return "EXCLUDE_THIRD_PARTY_RIGHTS", "THIRD_PARTY_RIGHTS_REVIEW"
    if any(marker in lower for marker in HELDOUT_PATH_MARKERS):
        return "EXCLUDE_HELDOUT_EVALUATION", "HELDOUT_EVALUATION_ARTIFACT"
    if any(marker in parts for marker in ("legal", "counsel", "privileged", "attorney")):
        return "EXCLUDE_LEGAL_PRIVILEGE", "LEGAL_PRIVILEGE_ARTIFACT"
    if any(marker in parts for marker in ("customer-data", "customer_data", "production-data", "production_data", "pii")):
        return "EXCLUDE_PII", "CUSTOMER_OR_PII_DATA_PATH"
    if normalized == ".github/workflows/quality.yml":
        return "PUBLISH_REDACTED", "CI_TEST_CREDENTIAL_REDACTION"
    return "PUBLISH_AS_IS", "TRACKED_SOURCE_OR_PROJECT_ARTIFACT"


def classify_file(repo: Path, relative: str) -> FileClassification:
    category, reason = classify_path(relative)
    source = repo_path(repo, relative)
    text = read_text(source) if source.exists() else None
    if category == "PUBLISH_AS_IS" and text is not None and _looks_like_config(relative) and _contains_credentialed_url(text):
        category, reason = "PUBLISH_REDACTED", "CONFIG_CREDENTIAL_REDACTION"
    if category == "PUBLISH_AS_IS" and text is not None and contains_local_metadata(text):
        category, reason = "PUBLISH_REDACTED", "LOCAL_METADATA_REDACTION"
    if category == "PUBLISH_AS_IS" and source.suffix.lower() == ".zip" and archive_has_local_metadata(source.read_bytes()):
        category, reason = "PUBLISH_REDACTED", "ARCHIVE_LOCAL_METADATA_REDACTION"
    if category not in ALLOWED_CLASSIFICATIONS:
        raise ValueError(f"unsupported classification for {relative}: {category}")
    return FileClassification(relative, category, reason, public_path_for(relative))


def inventory(repo: Path) -> list[FileClassification]:
    return [classify_file(repo, relative) for relative in tracked_paths(repo)]


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def tree_hash(root: Path, *, exclude: Iterable[str] = ()) -> str:
    excluded = {item.replace("\\", "/") for item in exclude}
    entries: list[dict[str, str]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root).as_posix()
        if relative in excluded:
            continue
        entries.append({"path": relative, "sha256": sha256_bytes(canonical_tree_bytes(path))})
    return sha256_bytes(canonical_json(entries))


def is_placeholder(value: str) -> bool:
    normalized = value.strip().strip("'\"").strip().lower()
    if not normalized:
        return True
    return any(
        marker in normalized
        for marker in (
            "change_me",
            "changeme",
            "redacted",
            "placeholder",
            "your_",
            "your-",
            "example",
            "dummy",
            "test",
            "local",
            "postgres",
            "process.env",
            "os.environ",
            "${",
            "{{",
            "<",
        )
    )


def redact_config_text(text: str) -> str:
    """Redact only credential values while preserving config structure."""

    redacted = re.sub(
        r"(\b(?:postgres(?:ql)?|mysql|redis)://[^\s:/]+:)([^\s@]+)(@)",
        r"\1CHANGE_ME\3",
        text,
        flags=re.IGNORECASE,
    )

    secret_key = r"(?:[A-Z][A-Z0-9_]*_)?(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*"
    assignment = re.compile(
        rf"(?m)^([ \t]*(?:export[ \t]+)?{secret_key}[ \t]*[:=])(?![ \t]*\$\{{\{{)(?![ \t]*\$\()(?![ \t]*(?:CHANGE_ME|REDACTED))([ \t]*)([^\r\n#]+)"
    )
    redacted = assignment.sub(lambda match: f"{match.group(1)}{match.group(2)}CHANGE_ME", redacted)
    redacted = re.sub(
        r"(-----BEGIN [A-Z ]*PRIVATE KEY-----)(.*?)(-----END [A-Z ]*PRIVATE KEY-----)",
        r"\1\nREDACTED\n\3",
        redacted,
        flags=re.DOTALL,
    )
    local_path = re.compile(
        r"(?i)(?:[A-Z]:[/\\]" + "Users" + r"[/\\][^\s`'\"<>)]*|/" + "Users" + r"/[^\s`'\"<>)]*|/" + "home" + r"/[^\s`'\"<>)]*)"
    )
    redacted = local_path.sub("<LOCAL_PATH_REDACTED>", redacted)
    redacted = redacted.replace("file" + "://", "file" + "://" + "<LOCAL_PATH_REDACTED>")
    return redacted


def redact_archive_bytes(data: bytes) -> bytes:
    """Repack a source-owned archive while redacting text members narrowly."""

    source = io.BytesIO(data)
    output = io.BytesIO()
    with ZipFile(source) as archive, ZipFile(output, "w", ZIP_DEFLATED) as rebuilt:
        for info in archive.infolist():
            member = archive.read(info) if not info.is_dir() else b""
            try:
                text = member.decode("utf-8")
            except UnicodeDecodeError:
                transformed = member
            else:
                transformed = redact_config_text(text).encode("utf-8")
            clone = ZipInfo(info.filename, date_time=info.date_time)
            clone.compress_type = ZIP_DEFLATED
            clone.comment = info.comment
            clone.create_system = info.create_system
            clone.external_attr = info.external_attr
            if info.is_dir():
                rebuilt.writestr(clone, b"")
            else:
                rebuilt.writestr(clone, transformed)
    return output.getvalue()


def generate_env_example_text(text: str) -> str:
    return redact_config_text(text)


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative_parts = {part.lower() for part in path.relative_to(root).parts}
        if relative_parts.intersection({".git", "node_modules", ".next", ".eve", ".output", ".vercel", ".venv", "__pycache__"}):
            continue
        yield path


def text_files(root: Path) -> Iterable[tuple[Path, str]]:
    for path in iter_files(root):
        text = read_text(path)
        if text is not None:
            yield path, text
            continue
        if path.suffix.lower() != ".zip":
            continue
        try:
            with ZipFile(path) as archive:
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    try:
                        member_text = archive.read(info).decode("utf-8")
                    except (UnicodeDecodeError, OSError):
                        continue
                    yield path.parent / f"{path.name}!{info.filename}", member_text
        except (OSError, ValueError):
            continue
