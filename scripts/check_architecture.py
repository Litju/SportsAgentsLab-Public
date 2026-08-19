from __future__ import annotations

import ast
import json
import re
import tomllib
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TOPOLOGY_PATH = ROOT / "architecture" / "topology.json"
TS_IMPORT_PATTERNS = (
    re.compile(
        r"(?ms)^\s*(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s*[\"']([^\"']+)[\"']"
    ),
    re.compile(r"(?:import|require)\s*\(\s*[\"']([^\"']+)[\"']\s*\)"),
    re.compile(r"(?:import|export)\s*[\"']([^\"']+)[\"']"),
)


def safe_repository_path(relative_path: str | Path) -> Path | None:
    try:
        resolved = (ROOT / relative_path).resolve()
        resolved.relative_to(ROOT.resolve())
    except (TypeError, ValueError):
        return None
    return resolved


def _is_path_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def load_topology() -> dict[str, Any]:
    topology = json.loads(TOPOLOGY_PATH.read_text(encoding="utf-8"))
    nodes = topology.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("topology must define a non-empty nodes list")
    ids = [node.get("id") for node in nodes]
    if any(not node_id for node_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("topology node IDs must be unique and non-empty")
    return topology


def node_map(topology: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {node["id"]: node for node in topology["nodes"]}


def package_map(topology: dict[str, Any]) -> dict[str, str]:
    result = {}
    for node in topology["nodes"]:
        package_name = node.get("package_name")
        if package_name:
            if package_name in result:
                raise ValueError(f"duplicate package name: {package_name}")
            result[package_name] = node["id"]
    return result


def manifest_dependencies(manifest: Path) -> list[str]:
    if manifest.suffix == ".json":
        data = json.loads(manifest.read_text(encoding="utf-8"))
        names = []
        for section in (
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ):
            names.extend(data.get(section, {}).keys())
        return names
    data = tomllib.loads(manifest.read_text(encoding="utf-8"))
    project = data.get("project", {})
    names = list(project.get("dependencies", []))
    for optional_dependencies in project.get("optional-dependencies", {}).values():
        names.extend(optional_dependencies)
    return names


def validate_topology_files(topology: dict[str, Any]) -> list[str]:
    errors = []
    for node in topology["nodes"]:
        manifest_name = node.get("manifest")
        if manifest_name:
            manifest = safe_repository_path(manifest_name)
            if manifest is None:
                errors.append(f"{node['id']}: manifest escapes repository root")
            elif not manifest.is_file():
                errors.append(f"{node['id']}: missing manifest {manifest_name}")
            elif node.get("package_name"):
                if manifest.suffix == ".json":
                    actual_name = json.loads(manifest.read_text(encoding="utf-8")).get(
                        "name"
                    )
                else:
                    actual_name = (
                        tomllib.loads(manifest.read_text(encoding="utf-8"))
                        .get("project", {})
                        .get("name")
                    )
                if actual_name != node["package_name"]:
                    errors.append(
                        f"{node['id']}: package name {actual_name!r} "
                        f"does not match {node['package_name']!r}"
                    )
        for source_root in node.get("source_roots", []):
            source_path = safe_repository_path(source_root)
            if source_path is None:
                errors.append(f"{node['id']}: source root escapes repository root")
            elif not source_path.is_dir():
                errors.append(f"{node['id']}: missing source root {source_root}")
            else:
                node_root = safe_repository_path(node["id"])
                if node_root is not None:
                    try:
                        source_path.relative_to(node_root)
                    except ValueError:
                        errors.append(
                            f"{node['id']}: source root is outside its boundary: "
                            f"{source_root}"
                        )

        node_root = safe_repository_path(node["id"])
        declared_source_roots: list[Path] = []
        for source_root in node.get("source_roots", []):
            source_path = safe_repository_path(source_root)
            if source_path is not None and source_path.is_dir():
                declared_source_roots.append(source_path)
        if node_root is not None and node_root.is_dir():
            for candidate in node_root.rglob("*"):
                if any(
                    ignored in candidate.parts
                    for ignored in {
                        "node_modules",
                        ".venv",
                        "__pycache__",
                        ".next",
                        ".eve",
                        ".output",
                    }
                ):
                    continue
                if not candidate.is_file() or candidate.suffix not in {
                    ".ts",
                    ".tsx",
                    ".js",
                    ".mjs",
                    ".py",
                }:
                    continue
                resolved_candidate = candidate.resolve()
                try:
                    resolved_candidate.relative_to(ROOT.resolve())
                except ValueError:
                    errors.append(
                        f"{node['id']}: source file escapes repository root: "
                        f"{candidate}"
                    )
                    continue
                if not any(
                    _is_path_under(resolved_candidate, source_path)
                    for source_path in declared_source_roots
                ):
                    errors.append(
                        f"{node['id']}: source file is outside declared roots: "
                        f"{candidate.relative_to(ROOT).as_posix()}"
                    )
    return errors


def validate_edges(topology: dict[str, Any], edges: list[tuple[str, str]]) -> list[str]:
    nodes = node_map(topology)
    errors = []
    for source, target in edges:
        if source not in nodes or target not in nodes:
            errors.append(f"unknown dependency edge {source} -> {target}")
            continue
        source_node = nodes[source]
        if target in source_node.get("forbidden_dependencies", []):
            errors.append(f"forbidden dependency path {source} -> {target}")
        elif target not in source_node.get("allowed_dependencies", []):
            errors.append(f"undeclared dependency path {source} -> {target}")
    return errors


def declared_edges(topology: dict[str, Any]) -> list[tuple[str, str]]:
    packages = package_map(topology)
    edges = []
    errors = []
    for node in topology["nodes"]:
        manifest_name = node.get("manifest")
        if not manifest_name:
            continue
        manifest = safe_repository_path(manifest_name)
        if manifest is None:
            errors.append(f"{node['id']}: manifest escapes repository root")
            continue
        if not manifest.is_file():
            continue
        for dependency in manifest_dependencies(manifest):
            target = packages.get(dependency)
            if target:
                edges.append((node["id"], target))
            elif dependency.startswith("@mef/") or dependency.startswith("mef-"):
                errors.append(f"{node['id']}: unknown internal dependency {dependency}")
    if errors:
        raise ValueError("\n".join(errors))
    return edges


def relative_manifest_path(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def workspace_manifest_paths() -> set[str]:
    paths: set[str] = set()
    pnpm_workspace = ROOT / "pnpm-workspace.yaml"
    if pnpm_workspace.is_file():
        in_packages_section = False
        for raw_line in pnpm_workspace.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line == "packages:":
                in_packages_section = True
                continue
            if not in_packages_section or not line.startswith("-"):
                continue
            pattern = line[1:].strip().strip("\"'")
            for directory in ROOT.glob(pattern):
                manifest = safe_repository_path(directory / "package.json")
                if manifest is not None and manifest.is_file():
                    paths.add(relative_manifest_path(manifest))

    root_pyproject = ROOT / "pyproject.toml"
    if root_pyproject.is_file():
        data = tomllib.loads(root_pyproject.read_text(encoding="utf-8"))
        members = (
            data.get("tool", {}).get("uv", {}).get("workspace", {}).get("members", [])
        )
        for member in members:
            manifest = safe_repository_path(Path(member) / "pyproject.toml")
            if manifest is not None and manifest.is_file():
                paths.add(relative_manifest_path(manifest))
    return paths


def validate_workspace_members(topology: dict[str, Any]) -> list[str]:
    errors = []
    workspace_path = ROOT / "pnpm-workspace.yaml"
    if not workspace_path.is_file():
        errors.append("missing pnpm-workspace.yaml")
    root_pyproject = ROOT / "pyproject.toml"
    if not root_pyproject.is_file():
        errors.append("missing root pyproject.toml")

    workspace_manifests = workspace_manifest_paths()
    topology_manifests = {
        relative_manifest_path(ROOT / node["manifest"])
        for node in topology["nodes"]
        if node.get("manifest")
    }
    for manifest in sorted(workspace_manifests - topology_manifests):
        errors.append(f"workspace manifest is missing from topology: {manifest}")
    for manifest in sorted(topology_manifests - workspace_manifests):
        errors.append(f"topology manifest is not in a declared workspace: {manifest}")
    return errors


def cycles(nodes: list[str], edges: list[tuple[str, str]]) -> list[list[str]]:
    graph: dict[str, list[str]] = defaultdict(list)
    for source, target in edges:
        graph[source].append(target)
    state: dict[str, int] = {}
    stack: list[str] = []
    found: list[list[str]] = []

    def visit(node: str) -> None:
        state[node] = 1
        stack.append(node)
        for target in graph[node]:
            if state.get(target) == 1:
                start = stack.index(target)
                found.append(stack[start:] + [target])
            elif state.get(target, 0) == 0:
                visit(target)
        stack.pop()
        state[node] = 2

    for node in nodes:
        if state.get(node, 0) == 0:
            visit(node)
    return found


def import_specifiers(path: Path, text: str) -> list[str]:
    if path.suffix == ".py":
        tree = ast.parse(text, filename=str(path))
        specifiers: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                specifiers.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                prefix = "." * node.level
                specifiers.append(prefix + (node.module or ""))
        return specifiers

    specifiers = []
    for pattern in TS_IMPORT_PATTERNS:
        specifiers.extend(pattern.findall(text))
    return specifiers


def import_matches_token(specifier: str, token: str) -> bool:
    normalized_specifier = specifier.replace("\\", "/")
    normalized_token = token.replace("\\", "/")
    dotted_specifier = normalized_specifier.replace("/", ".")
    return any(
        candidate == normalized_token or normalized_token in candidate
        for candidate in (normalized_specifier, dotted_specifier)
    )


def add_module_mapping(mapping: dict[str, str], module: str, node_id: str) -> None:
    if not module:
        return
    if module in mapping and mapping[module] != node_id:
        raise ValueError(
            f"ambiguous internal module {module}: {mapping[module]} and {node_id}"
        )
    mapping[module] = node_id


def internal_module_map(topology: dict[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for node in topology["nodes"]:
        node_id = node["id"]
        package_name = node.get("package_name")
        if package_name:
            add_module_mapping(mapping, package_name, node_id)
            add_module_mapping(mapping, package_name.replace("-", "_"), node_id)
        add_module_mapping(mapping, node_id, node_id)
        add_module_mapping(mapping, node_id.replace("/", "."), node_id)
        add_module_mapping(
            mapping, node_id.replace("/", ".").replace("-", "_"), node_id
        )
        for source_root in node.get("source_roots", []):
            root = safe_repository_path(source_root)
            if root is None or not root.is_dir():
                continue
            for init_path in root.rglob("__init__.py"):
                if not _is_path_under(init_path, root):
                    raise ValueError(f"source path escapes declared root: {init_path}")
                relative_package = init_path.parent.relative_to(root)
                add_module_mapping(mapping, ".".join(relative_package.parts), node_id)
            for module_path in root.rglob("*.py"):
                if not _is_path_under(module_path, root):
                    raise ValueError(
                        f"source path escapes declared root: {module_path}"
                    )
                relative_module = module_path.relative_to(root).with_suffix("")
                add_module_mapping(mapping, ".".join(relative_module.parts), node_id)
    return mapping


def resolve_import_target(
    topology: dict[str, Any],
    module_map: dict[str, str],
    path: Path,
    specifier: str,
) -> str | None:
    if specifier.startswith(".") and path.suffix != ".py":
        resolved_path = (path.parent / specifier).resolve()
        for node in topology["nodes"]:
            boundary_root = (ROOT / node["id"]).resolve()
            try:
                resolved_path.relative_to(boundary_root)
            except ValueError:
                continue
            return node["id"]

    module = specifier.lstrip(".")
    for module_candidate in (
        module,
        module.replace("/", "."),
        module.replace("-", "_"),
    ):
        if module_candidate in module_map:
            return module_map[module_candidate]
        for known_module, node_id in sorted(
            module_map.items(), key=lambda item: len(item[0]), reverse=True
        ):
            if module_candidate.startswith(
                known_module + "."
            ) or module_candidate.startswith(known_module + "/"):
                return node_id
    return None


def is_internal_import(specifier: str, module_map: dict[str, str]) -> bool:
    module = specifier.lstrip(".")
    if module.startswith("@mef/") or module.startswith("mef_"):
        return True
    normalized = module.replace("/", ".").replace("-", "_")
    if normalized in module_map:
        return True
    return normalized.startswith(("apps.", "packages.", "scientific.", "tools."))


def source_import_errors_for_text(
    topology: dict[str, Any],
    node: dict[str, Any],
    path: Path,
    text: str,
    declared: set[tuple[str, str]],
    module_map: dict[str, str],
) -> list[str]:
    errors = []
    try:
        specifiers = import_specifiers(path, text)
    except SyntaxError as error:
        return [f"{node['id']}: invalid Python syntax in {path}: {error}"]
    for token in node.get("forbidden_import_tokens", []):
        if any(import_matches_token(specifier, token) for specifier in specifiers):
            errors.append(
                f"{node['id']}: forbidden import token {token!r} in {path.as_posix()}"
            )
    if path.suffix != ".py":
        for specifier in specifiers:
            if specifier.startswith("."):
                candidate = (path.parent / specifier).resolve()
                if not _is_path_under(candidate, ROOT):
                    errors.append(
                        f"{node['id']}: relative import escapes repository root "
                        f"in {path.as_posix()}"
                    )
    else:
        node_root = safe_repository_path(node["id"])
        if node_root is not None:
            for specifier in specifiers:
                if not specifier.startswith("."):
                    continue
                base = path.parent
                for _ in range(max(specifier.count(".") - 1, 0)):
                    base = base.parent
                relative_module = specifier.lstrip(".")
                candidate = (
                    base.joinpath(*relative_module.split("."))
                    if relative_module
                    else base
                )
                if not _is_path_under(candidate, node_root):
                    errors.append(
                        f"{node['id']}: relative Python import leaves boundary "
                        f"in {path.as_posix()}"
                    )
    for specifier in specifiers:
        target = resolve_import_target(topology, module_map, path, specifier)
        if target is None:
            if is_internal_import(specifier, module_map):
                errors.append(
                    f"{node['id']}: unresolved internal import {specifier!r} "
                    f"in {path.as_posix()}"
                )
            continue
        if target == node["id"]:
            continue
        edge = (node["id"], target)
        if target in node.get("forbidden_dependencies", []):
            errors.append(f"forbidden dependency path {node['id']} -> {target}")
        elif target not in node.get("allowed_dependencies", []):
            errors.append(f"undeclared dependency path {node['id']} -> {target}")
        elif node.get("manifest") and edge not in declared:
            errors.append(
                f"{node['id']}: source import {target} is missing a manifest dependency"
            )
    return errors


def source_import_errors(
    topology: dict[str, Any], edges: list[tuple[str, str]]
) -> list[str]:
    errors = []
    declared = set(edges)
    module_map = internal_module_map(topology)
    source_extensions = {".ts", ".tsx", ".js", ".mjs", ".py"}
    for node in topology["nodes"]:
        for source_root in node.get("source_roots", []):
            root = safe_repository_path(source_root)
            if root is None or not root.is_dir():
                continue
            for path in root.rglob("*"):
                if any(
                    ignored in path.parts
                    for ignored in {
                        "node_modules",
                        ".venv",
                        "__pycache__",
                        ".next",
                        ".eve",
                        ".output",
                    }
                ):
                    continue
                if not path.is_file() or path.suffix not in source_extensions:
                    continue
                if not _is_path_under(path, root) or not _is_path_under(path, ROOT):
                    errors.append(
                        f"{node['id']}: source file escapes declared root: {path}"
                    )
                    continue
                errors.extend(
                    source_import_errors_for_text(
                        topology,
                        node,
                        path,
                        path.read_text(encoding="utf-8"),
                        declared,
                        module_map,
                    )
                )
    return errors


def run_negative_mutation_tests(
    topology: dict[str, Any], edges: list[tuple[str, str]]
) -> None:
    forbidden_mutations = [
        ("apps/practitioner-web", "scientific/kernel"),
        ("apps/control-api", "scientific/kernel"),
        ("scientific/kernel", "apps/practitioner-web"),
        ("fixtures", "apps/practitioner-web"),
        ("tools/evidence-replay", "apps/practitioner-web"),
        ("infra", "scientific/kernel"),
        ("packages/contracts", "apps/control-api"),
        ("apps/practitioner-web", "packages/agent-boundary"),
    ]
    for source, target in forbidden_mutations:
        errors = validate_edges(topology, edges + [(source, target)])
        if not any(
            "forbidden dependency path" in error
            or "undeclared dependency path" in error
            for error in errors
        ):
            raise AssertionError(
                f"negative forbidden-edge mutation was not rejected: {source} -> {target}"
            )
    cycle = cycles(
        [node["id"] for node in topology["nodes"]],
        edges + [("packages/contracts", "packages/generated-ts")],
    )
    if not cycle:
        raise AssertionError("negative cycle mutation was not rejected")
    print("NEGATIVE_MUTATION_TESTS=PASS")

    declared = set(edges)
    module_map = internal_module_map(topology)
    import_mutations = [
        (
            "apps/practitioner-web",
            Path("mutated.ts"),
            'import type { ScientificComputationPort } from "@mef/scientific-boundary";',
        ),
        (
            "apps/control-api",
            ROOT / "apps" / "control-api" / "src" / "mutated.ts",
            'import kernel from "../../scientific/kernel/src/mef_scientific_kernel";',
        ),
        (
            "scientific/kernel",
            Path("mutated.py"),
            "from apps.practitioner_web import index",
        ),
        (
            "fixtures",
            Path("mutated.ts"),
            'import web from "@mef/practitioner-web";',
        ),
        (
            "tools/evidence-replay",
            Path("mutated.py"),
            "from mef_scientific_kernel import calculate",
        ),
        (
            "infra",
            Path("mutated.ts"),
            'import contracts from "@mef/contracts";',
        ),
        (
            "packages/contracts",
            Path("mutated.ts"),
            'import api from "@mef/control-api";',
        ),
        (
            "packages/generated-ts",
            Path("mutated.ts"),
            'import agent from "@mef/agent-boundary";',
        ),
        (
            "packages/agent-boundary",
            ROOT / "packages" / "agent-boundary" / "src" / "mutated.ts",
            'import api from "../../../apps/control-api/src/index";',
        ),
        (
            "apps/practitioner-web",
            Path("mutated.ts"),
            'import {\n  ScientificComputationPort\n} from "@mef/scientific-boundary";',
        ),
        (
            "scientific/kernel",
            ROOT / "scientific" / "kernel" / "src" / "mutated.py",
            "from ...apps.practitioner_web import index",
        ),
    ]
    for source, path, text in import_mutations:
        errors = source_import_errors_for_text(
            topology,
            node_map(topology)[source],
            path,
            text,
            declared,
            module_map,
        )
        if not errors:
            raise AssertionError(
                f"negative forbidden-import mutation was not rejected: {source}"
            )
    print("NEGATIVE_IMPORT_MUTATION_TESTS=PASS")

    outside_root_mutation = json.loads(json.dumps(topology))
    outside_root_mutation["nodes"][0]["source_roots"] = ["../outside-root"]
    if not any(
        "source root escapes repository root" in error
        for error in validate_topology_files(outside_root_mutation)
    ):
        raise AssertionError("outside-root source mutation was not rejected")

    file_source_mutation = json.loads(json.dumps(topology))
    file_source_mutation["nodes"][0]["source_roots"] = ["README.md"]
    if not any(
        "missing source root" in error
        for error in validate_topology_files(file_source_mutation)
    ):
        raise AssertionError("file-as-source-root mutation was not rejected")

    missing_workspace_mutation = json.loads(json.dumps(topology))
    missing_workspace_mutation["nodes"] = missing_workspace_mutation["nodes"][1:]
    if not any(
        "workspace manifest is missing from topology" in error
        for error in validate_workspace_members(missing_workspace_mutation)
    ):
        raise AssertionError("workspace/topology drift mutation was not rejected")
    print("NEGATIVE_WORKSPACE_MUTATION_TESTS=PASS")


def main() -> int:
    try:
        topology = load_topology()
        errors = validate_topology_files(topology)
        errors.extend(validate_workspace_members(topology))
        edges = declared_edges(topology)
        errors.extend(validate_edges(topology, edges))
        errors.extend(source_import_errors(topology, edges))
        graph_cycles = cycles([node["id"] for node in topology["nodes"]], edges)
        if graph_cycles:
            errors.extend("cycle: " + " -> ".join(path) for path in graph_cycles)
        if errors:
            for error in errors:
                print("ARCHITECTURE_ERROR=" + error)
            return 1
        run_negative_mutation_tests(topology, edges)
        print("WORKSPACE_TOPOLOGY=PASS")
        print("DEPENDENCY_GRAPH_CYCLES=0")
        print("FORBIDDEN_DEPENDENCY_PATHS=0")
        print("ARCHITECTURE_FITNESS_TESTS=PASS")
        return 0
    except (
        OSError,
        ValueError,
        json.JSONDecodeError,
        tomllib.TOMLDecodeError,
    ) as error:
        print("ARCHITECTURE_CHECK_ERROR=" + str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
