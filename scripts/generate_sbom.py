from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
if os.name == "nt":
    os.environ.setdefault("UV_PROJECT_ENVIRONMENT", str(ROOT / ".venv-ml100"))
OUTPUT = ROOT / "artifacts" / "ci"
OUTPUT.mkdir(parents=True, exist_ok=True)
NODE_OUTPUT = OUTPUT / "node-sbom.cdx.json"
PYTHON_OUTPUT = OUTPUT / "python-sbom.cdx.json"
FINAL_OUTPUT = OUTPUT / "mef-sbom.cdx.json"


def pnpm_command(*arguments: str) -> list[str]:
    node = os.environ.get("MEF_NODE_EXECUTABLE") or shutil.which("node") or "node"
    npm_execpath = os.environ.get("npm_execpath")
    if npm_execpath:
        return [node, npm_execpath, *arguments]
    pnpm = shutil.which("pnpm") or "pnpm"
    return [pnpm, *arguments]


def run(command: list[str]) -> None:
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise SystemExit(
            "SBOM command failed: "
            + " ".join(command[:3])
            + "\n"
            + (completed.stderr or completed.stdout)[-4000:]
        )


def run_json(command: list[str]) -> Any:
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise SystemExit(
            "SBOM graph command failed: "
            + " ".join(command[:3])
            + "\n"
            + (completed.stderr or completed.stdout)[-4000:]
        )

    payload = completed.stdout.lstrip()
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for marker in ("[", "{"):
            start = payload.find(marker)
            if start >= 0:
                try:
                    value, _ = decoder.raw_decode(payload[start:])
                    return value
                except json.JSONDecodeError:
                    continue
        raise SystemExit("SBOM graph command returned invalid JSON")


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_path(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(Path(value).resolve()).casefold()
    except OSError:
        return None


def clean_version(value: Any) -> str | None:
    if value is None:
        return None
    version = str(value)
    if version.startswith("link:"):
        return None
    return version.split("(", 1)[0]


def package_json_identity(path_value: str | None) -> tuple[str, str] | None:
    if not path_value:
        return None
    package_path = Path(path_value) / "package.json"
    if not package_path.is_file():
        return None
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    name = package.get("name")
    version = package.get("version")
    if isinstance(name, str) and isinstance(version, str):
        return name, version
    return None


def workspace_identity(node: dict[str, Any], workspace_by_path: dict[str, tuple[str, str]]) -> tuple[str, str] | None:
    path_identity = workspace_by_path.get(normalize_path(node.get("path")))
    if path_identity:
        return path_identity
    return package_json_identity(node.get("path"))


def npm_purl(name: str, version: str) -> str:
    encoded_version = quote(version, safe="._+-")
    if name.startswith("@") and "/" in name:
        scope, package_name = name[1:].split("/", 1)
        return f"pkg:npm/%40{quote(scope, safe='._+-')}/{quote(package_name, safe='._+-')}@{encoded_version}"
    return f"pkg:npm/{quote(name, safe='._+-')}@{encoded_version}"


def node_component(name: str, version: str) -> dict[str, Any]:
    component: dict[str, Any] = {
        "type": "library",
        "bom-ref": npm_purl(name, version),
        "name": name,
        "version": version,
        "purl": npm_purl(name, version),
    }
    if name.startswith("@") and "/" in name:
        component["group"] = name[1:].split("/", 1)[0]
        component["name"] = name.split("/", 1)[1]
    return component


def dependency_entries(node: dict[str, Any]) -> Iterable[tuple[str, str, dict[str, Any]]]:
    for field in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        value = node.get(field)
        if not isinstance(value, dict):
            continue
        for name, child in value.items():
            if isinstance(child, dict):
                yield field, str(name), child


def build_node_bom() -> dict[str, Any]:
    graph = run_json(
        pnpm_command(
            "list",
            "--json",
            "--recursive",
            "--depth",
            "Infinity",
            "--prod=false",
            "--reporter=silent",
        )
    )
    roots = graph if isinstance(graph, list) else [graph]
    if not all(isinstance(root, dict) for root in roots):
        raise SystemExit("SBOM graph did not contain workspace package objects")

    workspace_by_path: dict[str, tuple[str, str]] = {}
    for root in roots:
        path_identity = normalize_path(root.get("path"))
        name = root.get("name")
        version = root.get("version")
        if path_identity and isinstance(name, str) and isinstance(version, str):
            workspace_by_path[path_identity] = (name, version)

    components: dict[str, dict[str, Any]] = {}
    dependencies: dict[str, set[str]] = {}
    visited: set[str] = set()

    def add_node(parent_ref: str, name: str, node: dict[str, Any], field: str) -> None:
        raw_version = node.get("version")
        identity = workspace_identity(node, workspace_by_path) if isinstance(raw_version, str) and raw_version.startswith("link:") else None
        resolved_name, resolved_version = identity or (name, clean_version(raw_version) or "")
        if not resolved_name or not resolved_version:
            raise SystemExit(f"SBOM dependency has no resolved version: {name}")
        ref = npm_purl(resolved_name, resolved_version)
        components.setdefault(ref, node_component(resolved_name, resolved_version))
        dependencies.setdefault(parent_ref, set()).add(ref)
        if field == "devDependencies":
            components[ref].setdefault("properties", []).append({"name": "mef:dependency-scope", "value": "dev"})
        if ref in visited:
            return
        visited.add(ref)
        for child_field, child_name, child_node in dependency_entries(node):
            add_node(ref, child_name, child_node, child_field)

    for root in roots:
        name = root.get("name")
        version = root.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            raise SystemExit("SBOM workspace root is missing name or version")
        root_ref = npm_purl(name, version)
        components.setdefault(root_ref, node_component(name, version))
        dependencies.setdefault(root_ref, set())
        visited.add(root_ref)
        for field, child_name, child_node in dependency_entries(root):
            add_node(root_ref, child_name, child_node, field)

    metadata_root = next(iter(roots))
    metadata_root_name = metadata_root.get("name")
    metadata_root_version = metadata_root.get("version")
    if not isinstance(metadata_root_name, str) or not isinstance(metadata_root_version, str):
        raise SystemExit("SBOM workspace metadata root is missing name or version")
    metadata_root_ref = npm_purl(metadata_root_name, metadata_root_version)

    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "version": 1,
        "metadata": {
            "component": components[metadata_root_ref]
        },
        "components": sorted(components.values(), key=lambda item: str(item.get("bom-ref"))),
        "dependencies": [
            {"ref": reference, "dependsOn": sorted(depends_on)}
            for reference, depends_on in sorted(dependencies.items())
        ],
    }


def root_component(bom: dict[str, Any]) -> str | None:
    component = bom.get("metadata", {}).get("component")
    if isinstance(component, dict):
        return str(component.get("bom-ref") or component.get("purl"))
    return None


node_bom = build_node_bom()
NODE_OUTPUT.write_text(json.dumps(node_bom, indent=2, sort_keys=True) + "\n", encoding="utf-8")

run(
    [
        "uv",
        "run",
        "--locked",
        "--all-packages",
        "cyclonedx-py",
        "environment",
        "--output-reproducible",
        "--validate",
        "--of",
        "JSON",
        "--output-file",
        str(PYTHON_OUTPUT),
        "--pyproject",
        str(ROOT / "pyproject.toml"),
    ]
)

python_bom = load(PYTHON_OUTPUT)
components: dict[str, dict[str, Any]] = {}
dependencies: dict[str, set[str]] = {}

for bom in (node_bom, python_bom):
    metadata_component = bom.get("metadata", {}).get("component")
    if isinstance(metadata_component, dict):
        reference = str(metadata_component.get("bom-ref") or metadata_component.get("purl"))
        if reference and reference != "None":
            components.setdefault(reference, metadata_component)
    for component in bom.get("components", []):
        reference = str(component.get("bom-ref") or component.get("purl"))
        components.setdefault(reference, component)
    for dependency in bom.get("dependencies", []):
        reference = str(dependency.get("ref"))
        dependencies.setdefault(reference, set()).update(str(item) for item in dependency.get("dependsOn", []))

aggregate_ref = "pkg:generic/sportsagentslab-mef@0.1.0"
aggregate = {
    "type": "application",
    "bom-ref": aggregate_ref,
    "name": "sportsagentslab-mef",
    "version": "0.1.0",
}
components.setdefault(aggregate_ref, aggregate)
dependencies.setdefault(aggregate_ref, set())
for reference in (root_component(node_bom), root_component(python_bom)):
    if reference:
        dependencies[aggregate_ref].add(reference)

component_refs = set(components)
for dependency in dependencies.values():
    unknown = dependency - component_refs
    if unknown:
        raise SystemExit("SBOM dependency references unknown components: " + ", ".join(sorted(unknown)[:5]))

final_bom = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.6",
    "serialNumber": "urn:uuid:00000000-0000-0000-0000-000000000000",
    "version": 1,
    "metadata": {
        "component": aggregate,
        "tools": [
            {"vendor": "pnpm", "name": "pnpm list", "version": "9.15.4"},
            {"vendor": "CycloneDX", "name": "cyclonedx-py", "version": "7.3.1"},
        ],
    },
    "components": sorted(components.values(), key=lambda item: str(item.get("bom-ref"))),
    "dependencies": [
        {"ref": reference, "dependsOn": sorted(depends_on)}
        for reference, depends_on in sorted(dependencies.items())
    ],
}
FINAL_OUTPUT.write_text(json.dumps(final_bom, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print("SBOM_GENERATION=PASS format=CycloneDX_JSON components=" + str(len(final_bom["components"])))
