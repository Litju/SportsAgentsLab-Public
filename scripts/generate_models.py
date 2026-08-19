from __future__ import annotations

import argparse
import json
import pprint
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_ROOT = ROOT / "packages" / "contracts"
SCHEMA_PATH = CONTRACT_ROOT / "schemas" / "domain-contracts.schema.json"
MANIFEST_PATH = CONTRACT_ROOT / "contract-manifest.json"
POLICY_PATH = CONTRACT_ROOT / "compatibility-policy.json"
OPENAPI_PATH = CONTRACT_ROOT / "openapi.json"
API_CONTRACT_PATH = CONTRACT_ROOT / "api" / "job-execution.json"
TS_ROOT = ROOT / "packages" / "generated-ts" / "src"
PY_ROOT = ROOT / "packages" / "generated-python" / "src" / "mef_generated_models"


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def ref_name(definition: dict[str, Any]) -> str | None:
    reference = definition.get("$ref")
    if not isinstance(reference, str):
        return None
    if not reference.startswith("#/$defs/"):
        raise ValueError(f"external reference is not allowed: {reference}")
    return reference.rsplit("/", 1)[1]


def load_sources() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    schema = read_json(SCHEMA_PATH)
    manifest = read_json(MANIFEST_PATH)
    policy = read_json(POLICY_PATH)
    api_contract = read_json(API_CONTRACT_PATH)
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        raise ValueError("canonical schema dialect is not Draft 2020-12")
    definitions = schema.get("$defs")
    if not isinstance(definitions, dict):
        raise ValueError("canonical schema has no definitions")
    entities = manifest.get("entities")
    if not isinstance(entities, list) or len(entities) != 18:
        raise ValueError("contract manifest must contain exactly 18 entities")
    names: list[str] = []
    identifiers: list[str] = []
    for entity in entities:
        if not isinstance(entity, dict):
            raise ValueError("contract manifest entity is not an object")
        name = entity.get("name")
        schema_ref = entity.get("schema_ref")
        identifier = entity.get("identifier")
        if (
            not isinstance(name, str)
            or not isinstance(schema_ref, str)
            or not isinstance(identifier, str)
        ):
            raise ValueError("contract manifest entity metadata is incomplete")
        if name in names or name not in definitions:
            raise ValueError(f"duplicate or missing entity definition: {name}")
        if schema_ref != f"#/$defs/{name}":
            raise ValueError(f"entity schema reference mismatch: {name}")
        if identifier in identifiers:
            raise ValueError(f"duplicate entity identifier field: {identifier}")
        names.append(name)
        identifiers.append(identifier)
        definition = definitions[name]
        if not isinstance(definition, dict):
            raise ValueError(f"entity definition is not an object: {name}")
        properties = definition.get("properties")
        if not isinstance(properties, dict) or identifier not in properties:
            raise ValueError(f"entity identifier is not defined: {name}.{identifier}")

    entity_record = definitions.get("EntityRecord")
    if not isinstance(entity_record, dict) or not isinstance(
        entity_record.get("oneOf"), list
    ):
        raise ValueError("EntityRecord must be a closed oneOf union")
    record_names = [
        ref_name(item) for item in entity_record["oneOf"] if isinstance(item, dict)
    ]
    if record_names != names:
        raise ValueError("EntityRecord ordering or membership differs from manifest")

    forbidden = manifest.get("forbidden_field_tokens")
    if not isinstance(forbidden, list) or not all(
        isinstance(item, str) for item in forbidden
    ):
        raise ValueError("forbidden field token catalog is invalid")
    field_names: set[str] = set()
    for definition in definitions.values():
        if not isinstance(definition, dict):
            continue
        properties = definition.get("properties")
        if isinstance(properties, dict):
            field_names.update(str(name).lower() for name in properties)
    for token in forbidden:
        if any(token.lower() in field_name for field_name in field_names):
            raise ValueError(
                f"forbidden field token appears in a governed field: {token}"
            )
    if policy.get("schema_version") != manifest.get("contract_version"):
        raise ValueError("compatibility policy and contract manifest versions differ")
    if api_contract.get("api_version") != "1" or not isinstance(api_contract.get("schemas"), dict) or not isinstance(api_contract.get("operations"), dict):
        raise ValueError("ML-97 API contract source is invalid")
    return schema, manifest, policy, api_contract


def literal(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def ts_type(definition: dict[str, Any]) -> str:
    name = ref_name(definition)
    if name:
        return name
    if "const" in definition:
        return literal(definition["const"])
    enum = definition.get("enum")
    if isinstance(enum, list):
        return " | ".join(literal(item) for item in enum)
    schema_type = definition.get("type")
    if schema_type == "string":
        return "string"
    if schema_type in {"number", "integer"}:
        return "number"
    if schema_type == "boolean":
        return "boolean"
    if schema_type == "array":
        items = definition.get("items")
        if not isinstance(items, dict):
            raise ValueError("array definition has no item schema")
        return f"ReadonlyArray<{ts_type(items)}>"
    if schema_type == "object":
        properties = definition.get("properties")
        if isinstance(properties, dict) and properties:
            required = set(definition.get("required", []))
            fields: list[str] = []
            for field_name, field_definition in properties.items():
                if not isinstance(field_definition, dict):
                    raise ValueError(f"field definition is not an object: {field_name}")
                optional = "" if field_name in required else "?"
                fields.append(
                    f"readonly {field_name}{optional}: {ts_type(field_definition)}"
                )
            return "{ " + "; ".join(fields) + " }"
        return "Readonly<Record<string, unknown>>"
    one_of = definition.get("oneOf")
    if isinstance(one_of, list):
        return " | ".join(ts_type(item) for item in one_of if isinstance(item, dict))
    raise ValueError(f"unsupported TypeScript schema definition: {definition}")


def py_type(definition: dict[str, Any]) -> str:
    name = ref_name(definition)
    if name:
        return name
    if "const" in definition:
        return f"Literal[{definition['const']!r}]"
    enum = definition.get("enum")
    if isinstance(enum, list):
        return "Literal[" + ", ".join(repr(item) for item in enum) + "]"
    schema_type = definition.get("type")
    if schema_type == "string":
        return "str"
    if schema_type == "number":
        return "float"
    if schema_type == "integer":
        return "int"
    if schema_type == "boolean":
        return "bool"
    if schema_type == "array":
        items = definition.get("items")
        if not isinstance(items, dict):
            raise ValueError("array definition has no item schema")
        return f"list[{py_type(items)}]"
    if schema_type == "object":
        return "dict[str, object]"
    one_of = definition.get("oneOf")
    if isinstance(one_of, list):
        return " | ".join(py_type(item) for item in one_of if isinstance(item, dict))
    raise ValueError(f"unsupported Python schema definition: {definition}")


def render_ts_definition(name: str, definition: dict[str, Any]) -> str:
    if definition.get("x-nominal-id") is True:
        return f'export type {name} = string & {{ readonly __brand: "{name}" }};'
    enum = definition.get("enum")
    if isinstance(enum, list):
        return (
            f"export type {name} = " + " | ".join(literal(item) for item in enum) + ";"
        )
    if "const" in definition:
        return f"export type {name} = {literal(definition['const'])};"
    one_of = definition.get("oneOf")
    if isinstance(one_of, list):
        return (
            f"export type {name} = "
            + " | ".join(ts_type(item) for item in one_of if isinstance(item, dict))
            + ";"
        )
    if definition.get("type") != "object":
        return f"export type {name} = {ts_type(definition)};"
    properties = definition.get("properties")
    if not isinstance(properties, dict):
        return f"export type {name} = Readonly<Record<string, unknown>>;"
    required = set(definition.get("required", []))
    lines = [f"export interface {name} {{"]
    for field_name, field_definition in properties.items():
        if not isinstance(field_definition, dict):
            raise ValueError(f"field definition is not an object: {name}.{field_name}")
        optional = "" if field_name in required else "?"
        lines.append(f"  readonly {field_name}{optional}: {ts_type(field_definition)};")
    lines.append("}")
    return "\n".join(lines)


def enum_member(value: str) -> str:
    member = re.sub(r"[^A-Za-z0-9_]", "_", value).upper()
    if not member or member[0].isdigit():
        member = "VALUE_" + member
    return member


def render_py_definition(name: str, definition: dict[str, Any]) -> str:
    if definition.get("x-nominal-id") is True:
        pattern = definition.get("pattern")
        if not isinstance(pattern, str):
            raise ValueError(f"nominal identifier has no pattern: {name}")
        return "\n".join(
            [
                f"class {name}(str):",
                f"    _pattern = re.compile({pattern!r})",
                "",
                "    def __new__(cls, value: str) -> " + name + ":",
                "        if not isinstance(value, str) or cls._pattern.fullmatch(value) is None:",
                f"            raise ValueError({name!r} + ' has an invalid value')",
                "        return str.__new__(cls, value)",
            ]
        )
    enum = definition.get("enum")
    if isinstance(enum, list):
        lines = [f"class {name}(str, Enum):"]
        for value in enum:
            if not isinstance(value, str):
                raise ValueError(f"only string enums are supported: {name}")
            lines.append(f"    {enum_member(value)} = {value!r}")
        return "\n".join(lines)
    if "const" in definition:
        return f"{name}: TypeAlias = Literal[{definition['const']!r}]"
    if name == "ObjectReference":
        one_of = definition.get("oneOf")
        if not isinstance(one_of, list):
            raise ValueError("ObjectReference must be a closed oneOf union")
        variants: list[str] = []
        blocks: list[str] = []
        for branch in one_of:
            if not isinstance(branch, dict):
                raise ValueError("ObjectReference branch is not an object")
            properties = branch.get("properties")
            if not isinstance(properties, dict):
                raise ValueError("ObjectReference branch has no properties")
            entity_definition = properties.get("entity_type")
            object_definition = properties.get("object_id")
            if not isinstance(entity_definition, dict) or not isinstance(
                object_definition, dict
            ):
                raise ValueError("ObjectReference branch is incomplete")
            entity_value = entity_definition.get("const")
            object_name = ref_name(object_definition)
            if not isinstance(entity_value, str) or object_name is None:
                raise ValueError("ObjectReference branch has no nominal identity")
            variant_name = f"{entity_value}ObjectReference"
            variants.append(variant_name)
            blocks.append(
                "\n".join(
                    [
                        f"class {variant_name}(TypedDict):",
                        f"    entity_type: Literal[{entity_value!r}]",
                        f"    object_id: {object_name}",
                    ]
                )
            )
        blocks.append(f"{name}: TypeAlias = " + " | ".join(variants))
        return "\n\n".join(blocks)
    one_of = definition.get("oneOf")
    if isinstance(one_of, list):
        return f"{name}: TypeAlias = " + " | ".join(
            py_type(item) for item in one_of if isinstance(item, dict)
        )
    if definition.get("type") != "object":
        return f"{name}: TypeAlias = {py_type(definition)}"
    properties = definition.get("properties")
    if not isinstance(properties, dict):
        return f"{name}: TypeAlias = dict[str, object]"
    required = set(definition.get("required", []))
    lines = [f"class {name}(TypedDict):"]
    for field_name, field_definition in properties.items():
        if not isinstance(field_definition, dict):
            raise ValueError(f"field definition is not an object: {name}.{field_name}")
        annotation = py_type(field_definition)
        if field_name not in required:
            annotation = f"NotRequired[{annotation}]"
        lines.append(f"    {field_name}: {annotation}")
    if len(lines) == 1:
        lines.append("    pass")
    return "\n".join(lines)


def render_ts_domain(schema: dict[str, Any]) -> str:
    definitions = schema["$defs"]
    blocks = [
        "/* Generated by scripts/generate_models.py. Do not edit manually. */",
        "",
    ]
    for name, definition in definitions.items():
        if not isinstance(definition, dict):
            raise ValueError(f"definition is not an object: {name}")
        blocks.append(render_ts_definition(name, definition))
        blocks.append("")
    return "\n".join(blocks)


def render_py_models(schema: dict[str, Any]) -> str:
    definitions = schema["$defs"]
    blocks = [
        '"""Generated by scripts/generate_models.py. Do not edit manually."""',
        "",
        "# fmt: off",
        "",
        "from __future__ import annotations",
        "",
        "import re",
        "from enum import Enum",
        "from typing import Literal, NotRequired, TypeAlias, TypedDict",
        "",
    ]
    for name, definition in definitions.items():
        if not isinstance(definition, dict):
            raise ValueError(f"definition is not an object: {name}")
        blocks.append(render_py_definition(name, definition))
        blocks.append("")
    return "\n".join(blocks)


def render_api_fragment(value: Any) -> Any:
    if isinstance(value, list):
        return [render_api_fragment(item) for item in value]
    if not isinstance(value, dict):
        return value
    if set(value) == {"$ref"}:
        reference = value.get("$ref")
        if not isinstance(reference, str) or not reference:
            raise ValueError("ML-97 API contract reference is invalid")
        return {"$ref": f"#/components/schemas/{reference}"}
    return {key: render_api_fragment(item) for key, item in value.items()}


def render_openapi(schema: dict[str, Any], manifest: dict[str, Any], api_contract: dict[str, Any]) -> str:
    components: dict[str, Any] = {}
    for name in schema["$defs"]:
        components[name] = {
            "$ref": f"./schemas/domain-contracts.schema.json#/$defs/{name}"
        }
    api_schemas = api_contract.get("schemas")
    if not isinstance(api_schemas, dict):
        raise ValueError("ML-97 API contract schemas are invalid")
    for name, definition in api_schemas.items():
        if not isinstance(name, str) or not isinstance(definition, dict):
            raise ValueError("ML-97 API contract schema entry is invalid")
        components[name] = render_api_fragment(definition)
    job_parameter = {
        "name": "job_id",
        "in": "path",
        "required": True,
        "schema": {"$ref": "#/components/schemas/JobId"},
    }
    json_body = lambda schema_name: {
        "required": True,
        "content": {
            "application/json": {"schema": {"$ref": f"#/components/schemas/{schema_name}"}}
        },
    }
    response = lambda schema_name: {
        "description": "Typed response",
        "content": {
            "application/json": {"schema": {"$ref": f"#/components/schemas/{schema_name}"}}
        },
    }
    error_response = lambda description: {
        "description": description,
        "content": {
            "application/json": {"schema": {"$ref": "#/components/schemas/ApiError"}}
        },
    }
    operations = api_contract.get("operations")
    if not isinstance(operations, dict):
        raise ValueError("ML-97 API contract operations are invalid")
    paths: dict[str, Any] = {}
    for path, methods in operations.items():
        if not isinstance(path, str) or not isinstance(methods, dict):
            raise ValueError("ML-97 API contract operation entry is invalid")
        paths[path] = {}
        for method, specification in methods.items():
            if not isinstance(method, str) or not isinstance(specification, dict):
                raise ValueError("ML-97 API contract operation is invalid")
            success = specification.get("success")
            errors = specification.get("errors")
            if (
                not isinstance(specification.get("operationId"), str)
                or not isinstance(success, dict)
                or not isinstance(success.get("status"), str)
                or not isinstance(success.get("schema"), str)
                or not isinstance(errors, list)
            ):
                raise ValueError("ML-97 API contract response specification is invalid")
            operation: dict[str, Any] = {
                "operationId": specification["operationId"],
                "responses": {
                    success["status"]: response(success["schema"]),
                    **{
                        str(error["status"]): error_response(str(error["description"]))
                        for error in errors
                        if isinstance(error, dict) and isinstance(error.get("status"), str) and isinstance(error.get("description"), str)
                    },
                },
            }
            if "{job_id}" in path:
                operation["parameters"] = [job_parameter]
            request_body = specification.get("requestBody")
            if request_body is not None:
                if not isinstance(request_body, str):
                    raise ValueError("ML-97 API request body specification is invalid")
                operation["requestBody"] = json_body(request_body)
            paths[path][method] = operation
    document = {
        "openapi": "3.1.0",
        "info": {
            "title": "Measurement Evidence Factory domain contracts",
            "version": manifest["contract_version"],
            "description": "ML-97 typed command/job execution API and canonical domain contracts.",
        },
        "paths": paths,
        "components": {"schemas": components},
    }
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def render_ts_runtime(schema: dict[str, Any], manifest: dict[str, Any]) -> str:
    document = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
    entity_names = [entity["name"] for entity in manifest["entities"]]
    entity_literal = ", ".join(literal(name) for name in entity_names)
    forbidden_literal = ", ".join(
        literal(token) for token in manifest["forbidden_field_tokens"]
    )
    return f"""/* Generated by scripts/generate_models.py. Do not edit manually. */
import type {{ ContractError, EntityRecord, EntityType, ErrorCode }} from "./models/domain.js";

const SCHEMA_DOCUMENT: unknown = {document};
const ENTITY_TYPES = [{entity_literal}] as const;
const FORBIDDEN_FIELD_TOKENS = [{forbidden_literal}] as const;
const DEFS = (SCHEMA_DOCUMENT as Record<string, unknown>)["$defs"] as Record<string, unknown>;

export interface ValidationResult {{
  readonly valid: boolean;
  readonly errors: ReadonlyArray<ContractError>;
}}

function isRecord(value: unknown): value is Record<string, unknown> {{
  return typeof value === "object" && value !== null && !Array.isArray(value);
}}

function encodeCanonical(value: unknown): string {{
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {{
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON cannot encode a non-finite number");
    if (Object.is(value, -0) || value === 0) return "0";
    return value.toString();
  }}
  if (Array.isArray(value)) return "[" + value.map(encodeCanonical).join(",") + "]";
  if (isRecord(value)) return "{{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + encodeCanonical(value[key])).join(",") + "}}";
  throw new TypeError("canonical JSON cannot encode this value");
}}

export function canonicalJson(value: unknown): string {{
  return encodeCanonical(value);
}}

function isCanonicalTimestamp(value: string): boolean {{
  const match = /^([0-9]{{4}})-([0-9]{{2}})-([0-9]{{2}})T([0-9]{{2}}):([0-9]{{2}}):([0-9]{{2}})(?:\\.([0-9]{{1,9}}))?Z$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}}

function errorCode(path: string, keyword: string): ErrorCode {{
  if (keyword === "required") return "MISSING_REQUIRED_FIELD";
  if (keyword === "additionalProperties") {{
    if (FORBIDDEN_FIELD_TOKENS.some((token) => path.toLowerCase().includes(token))) return "FORBIDDEN_FIELD";
    return "UNKNOWN_GOVERNED_FIELD";
  }}
  if (keyword === "enum" || keyword === "const") {{
    if (path.endsWith("schema_version")) return "UNSUPPORTED_SCHEMA_VERSION";
    if (path.endsWith("schema_id")) return "INCOMPATIBLE_CONTRACT_VERSION";
    if (path.endsWith("authority_type") || path.endsWith("actor.actor_type")) return "FORBIDDEN_AUTHORITY_COMBINATION";
    return "UNKNOWN_ENUM_VALUE";
  }}
  if (keyword === "pattern") {{
    if (path.includes("evidence")) return "INVALID_EVIDENCE_REFERENCE";
    if (path.endsWith("_id") || path.endsWith("object_id")) return "INVALID_IDENTIFIER";
    if (path.includes("hash") || path.endsWith("digest")) return "INVALID_HASH";
    if (path.includes("timestamp") || path.endsWith("_at")) return "INVALID_TIMESTAMP";
    if (path.includes("unit")) return "INVALID_UNIT";
  }}
  if (keyword === "format" && (path.includes("timestamp") || path.endsWith("_at"))) return "INVALID_TIMESTAMP";
  if (keyword === "type") return "INVALID_TYPE";
  return "VALIDATION_ERROR";
}}

function makeError(code: ErrorCode, message: string, path: string): ContractError {{
  return {{ taxonomy_version: "1.0.0", code, message, path }};
}}

function resolveSchema(schema: Record<string, unknown>): Record<string, unknown> {{
  const reference = schema["$ref"];
  if (typeof reference !== "string" || !reference.startsWith("#/$defs/")) return schema;
  const resolved = DEFS[reference.slice("#/$defs/".length)];
  return isRecord(resolved) ? resolved : schema;
}}

function validateAgainstSchema(value: unknown, rawSchema: Record<string, unknown>, path: string, errors: ContractError[]): void {{
  const schema = resolveSchema(rawSchema);
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) for (const candidate of allOf) if (isRecord(candidate)) validateAgainstSchema(value, candidate, path, errors);
  const ifSchema = schema["if"];
  if (isRecord(ifSchema)) {{
    const conditionErrors: ContractError[] = [];
    validateAgainstSchema(value, ifSchema, path, conditionErrors);
    const thenSchema = schema["then"];
    if (conditionErrors.length === 0 && isRecord(thenSchema)) validateAgainstSchema(value, thenSchema, path, errors);
  }}
  const notSchema = schema["not"];
  if (isRecord(notSchema)) {{
    const forbiddenErrors: ContractError[] = [];
    validateAgainstSchema(value, notSchema, path, forbiddenErrors);
    if (forbiddenErrors.length === 0) errors.push(makeError("VALIDATION_ERROR", "value matched a forbidden schema", path));
  }}
  const anyOf = schema["anyOf"];
  if (Array.isArray(anyOf)) {{
    let successes = 0;
    for (const candidate of anyOf) {{
      if (!isRecord(candidate)) continue;
      const candidateErrors: ContractError[] = [];
      validateAgainstSchema(value, candidate, path, candidateErrors);
      if (candidateErrors.length === 0) successes += 1;
    }}
    if (successes === 0) errors.push(makeError("VALIDATION_ERROR", "value did not match any governed schema", path));
  }}
  const oneOf = schema["oneOf"];
  if (Array.isArray(oneOf)) {{
    let successes = 0;
    for (const candidate of oneOf) {{
      if (!isRecord(candidate)) continue;
      const candidateErrors: ContractError[] = [];
      validateAgainstSchema(value, candidate, path, candidateErrors);
      if (candidateErrors.length === 0) successes += 1;
    }}
    if (successes !== 1) errors.push(makeError(path.endsWith(".target") || path.endsWith(".object") ? "UNRESOLVED_REFERENCE" : "VALIDATION_ERROR", "value did not match exactly one governed schema", path));
  }}
  const expectedType = schema["type"];
  const appliesObjectKeywords = expectedType === "object" || (expectedType === undefined && isRecord(value));
  if (appliesObjectKeywords) {{
    if (!isRecord(value)) {{ errors.push(makeError(errorCode(path, "type"), "expected object", path)); return; }}
    const required = schema["required"];
    if (Array.isArray(required)) for (const field of required) if (typeof field === "string" && !(field in value)) errors.push(makeError(errorCode(path + "." + field, "required"), "missing required field", path + "." + field));
    const properties = isRecord(schema["properties"]) ? schema["properties"] : {{}};
    if (schema["additionalProperties"] === false) for (const field of Object.keys(value)) if (!(field in properties)) errors.push(makeError(errorCode(path + "." + field, "additionalProperties"), "unknown governed field", path + "." + field));
    for (const [field, definition] of Object.entries(properties)) if (field in value && isRecord(definition)) validateAgainstSchema(value[field], definition, path + "." + field, errors);
  }} else if (expectedType === "array" || (expectedType === undefined && Array.isArray(value))) {{
    if (!Array.isArray(value)) {{ errors.push(makeError(errorCode(path, "type"), "expected array", path)); return; }}
    const minItems = schema["minItems"];
    if (typeof minItems === "number" && value.length < minItems) errors.push(makeError("VALIDATION_ERROR", "array has too few items", path));
    const items = schema["items"];
    if (isRecord(items)) value.forEach((item, index) => validateAgainstSchema(item, items, path + "[" + index + "]", errors));
    const contains = schema["contains"];
    if (isRecord(contains)) {{
      const matches = value.some((item) => {{
        const candidateErrors: ContractError[] = [];
        validateAgainstSchema(item, contains, path, candidateErrors);
        return candidateErrors.length === 0;
      }});
      if (!matches) errors.push(makeError("VALIDATION_ERROR", "array contains no governed match", path));
    }}
    if (schema["uniqueItems"] === true) {{ const seen = new Set<string>(); for (const item of value) {{ const key = canonicalJson(item); if (seen.has(key)) errors.push(makeError("VALIDATION_ERROR", "array items must be unique", path)); seen.add(key); }} }}
  }} else if (expectedType === "string") {{
    if (typeof value !== "string") {{ errors.push(makeError(errorCode(path, "type"), "expected string", path)); return; }}
    const minLength = schema["minLength"]; if (typeof minLength === "number" && value.length < minLength) errors.push(makeError("VALIDATION_ERROR", "string is too short", path));
    const maxLength = schema["maxLength"]; if (typeof maxLength === "number" && value.length > maxLength) errors.push(makeError("VALIDATION_ERROR", "string is too long", path));
    const pattern = schema["pattern"]; if (typeof pattern === "string" && new RegExp(pattern, "u").test(value) === false) errors.push(makeError(errorCode(path, "pattern"), "string does not match governed pattern", path));
    if (schema["format"] === "date-time" && !isCanonicalTimestamp(value)) errors.push(makeError(errorCode(path, "format"), "timestamp is not canonical UTC", path));
  }} else if (expectedType === "integer") {{
    if (typeof value !== "number" || !Number.isInteger(value)) {{ errors.push(makeError(errorCode(path, "type"), "expected integer", path)); return; }}
    const minimum = schema["minimum"]; if (typeof minimum === "number" && value < minimum) errors.push(makeError("VALIDATION_ERROR", "number is below minimum", path));
    const maximum = schema["maximum"]; if (typeof maximum === "number" && value > maximum) errors.push(makeError("VALIDATION_ERROR", "number is above maximum", path));
  }} else if (expectedType === "number") {{
    if (typeof value !== "number" || !Number.isFinite(value)) {{ errors.push(makeError(errorCode(path, "type"), "expected finite number", path)); return; }}
    const minimum = schema["minimum"]; if (typeof minimum === "number" && value < minimum) errors.push(makeError("VALIDATION_ERROR", "number is below minimum", path));
    const maximum = schema["maximum"]; if (typeof maximum === "number" && value > maximum) errors.push(makeError("VALIDATION_ERROR", "number is above maximum", path));
  }} else if (expectedType === "boolean" && typeof value !== "boolean") {{
    errors.push(makeError(errorCode(path, "type"), "expected boolean", path));
  }}
  const enumValues = schema["enum"]; if (Array.isArray(enumValues) && !enumValues.some((candidate) => typeof candidate === typeof value && candidate === value)) errors.push(makeError(errorCode(path, "enum"), "unknown governed enum value", path));
  if ("const" in schema && value !== schema["const"]) errors.push(makeError(errorCode(path, "const"), "value does not match governed constant", path));
}}

export function isEntityType(value: unknown): value is EntityType {{
  return typeof value === "string" && (ENTITY_TYPES as readonly string[]).includes(value);
}}

export function validateEntity(value: unknown, entityType?: EntityType): ValidationResult {{
  if (!isRecord(value)) return {{ valid: false, errors: [makeError("INVALID_TYPE", "entity must be an object", "$")] }};
  const actual = value["entity_type"];
  if (!isEntityType(actual)) return {{ valid: false, errors: [makeError("UNKNOWN_ENTITY_TYPE", "unknown entity type", "$.entity_type")] }};
  if (entityType !== undefined && actual !== entityType) return {{ valid: false, errors: [makeError("VALIDATION_ERROR", "entity type does not match requested validator", "$.entity_type")] }};
  const errors: ContractError[] = [];
  validateAgainstSchema(value, {{ "$ref": "#/$defs/" + actual }}, "$", errors);
  return {{ valid: errors.length === 0, errors }};
}}

export function parseEntity(value: unknown): EntityRecord {{
  const result = validateEntity(value);
  if (!result.valid) throw new ContractValidationError(result.errors);
  return value as EntityRecord;
}}

export class ContractValidationError extends Error {{
  readonly errors: ReadonlyArray<ContractError>;
  constructor(errors: ReadonlyArray<ContractError>) {{
    super(errors.map((error) => error.code + ":" + error.path).join(";"));
    this.name = "ContractValidationError";
    this.errors = errors;
  }}
}}
"""


def render_py_schema_data(schema: dict[str, Any]) -> str:
    literal_schema = pprint.pformat(schema, sort_dicts=True, width=120)
    return (
        '"""Generated by scripts/generate_models.py. Do not edit manually."""\n\n'
        "# fmt: off\n"
        "from typing import Any\n\n"
        f"SCHEMA_DOCUMENT: dict[str, Any] = {literal_schema}\n"
    )


def render_py_runtime(schema: dict[str, Any], manifest: dict[str, Any]) -> str:
    entity_names = [entity["name"] for entity in manifest["entities"]]
    entity_map = ",\n    ".join(
        f'"{name}": SCHEMA_DOCUMENT["$defs"]["{name}"]' for name in entity_names
    )
    id_defs = [
        name
        for name, definition in schema["$defs"].items()
        if isinstance(definition, dict) and definition.get("x-nominal-id") is True
    ]
    enum_defs = [
        name
        for name, definition in schema["$defs"].items()
        if isinstance(definition, dict) and isinstance(definition.get("enum"), list)
    ]
    model_imports = ", ".join(
        entity_names + id_defs + enum_defs + ["ContractError", "EntityRecord"]
    )
    id_map = ", ".join(f'"{name}": {name}' for name in id_defs)
    enum_map = ", ".join(f'"{name}": {name}' for name in enum_defs)
    parse_functions = "\n\n".join(
        f"def parse_{entity['model_file']}(value: object) -> {entity['name']}:\n"
        f'    return cast({entity["name"]}, _parse(value, "{entity["name"]}"))'
        for entity in manifest["entities"]
    )
    entity_literal = ", ".join(repr(name) for name in entity_names)
    forbidden_literal = ", ".join(
        repr(token) for token in manifest["forbidden_field_tokens"]
    )
    return f'''"""Generated by scripts/generate_models.py. Do not edit manually."""

# fmt: off
# ruff: noqa: E701,E702

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import cast

from .models import {model_imports}
from .schema_data import SCHEMA_DOCUMENT

ENTITY_TYPES = frozenset(({entity_literal}))
FORBIDDEN_FIELD_TOKENS = ({forbidden_literal})
ENTITY_SCHEMAS: dict[str, dict[str, object]] = {{
    {entity_map}
}}
ID_CLASSES: dict[str, type[str]] = {{{id_map}}}
ENUM_CLASSES: dict[str, type[Enum]] = {{{enum_map}}}


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: tuple[ContractError, ...]


class ContractValidationError(ValueError):
    def __init__(self, errors: tuple[ContractError, ...]) -> None:
        self.errors = errors
        super().__init__("; ".join(f"{{error['code']}}:{{error['path']}}" for error in errors))


def canonical_json(value: object) -> str:
    return _encode_canonical(value)


def _format_number(value: int | float) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if not math.isfinite(float(value)):
        raise ValueError("canonical JSON cannot encode a non-finite number")
    if value == 0:
        return "0"
    text = repr(float(value)).lower()
    if "e" not in text:
        return text[:-2] if text.endswith(".0") else text
    mantissa, exponent_text = text.split("e", 1)
    exponent = int(exponent_text)
    magnitude = abs(float(value))
    if 1e-6 <= magnitude < 1e21:
        fixed = format(Decimal(text), "f")
        if "." in fixed:
            fixed = fixed.rstrip("0").rstrip(".")
        return fixed
    mantissa = mantissa.rstrip("0").rstrip(".")
    return f"{{mantissa}}e{{exponent:+d}}"


def _encode_canonical(value: object) -> str:
    if isinstance(value, Enum):
        return _encode_canonical(value.value)
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _format_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, Mapping):
        entries = ",".join(
            json.dumps(str(key), ensure_ascii=False) + ":" + _encode_canonical(item)
            for key, item in sorted(value.items(), key=lambda item: str(item[0]))
        )
        return "{{" + entries + "}}"
    if isinstance(value, list):
        return "[" + ",".join(_encode_canonical(item) for item in value) + "]"
    if isinstance(value, tuple):
        return "[" + ",".join(_encode_canonical(item) for item in value) + "]"
    raise TypeError("canonical JSON cannot encode this value")


def _error(code: str, message: str, path: str) -> ContractError:
    return cast(ContractError, {{"taxonomy_version": "1.0.0", "code": code, "message": message, "path": path}})


def _error_code(path: str, keyword: str) -> str:
    if keyword == "required": return "MISSING_REQUIRED_FIELD"
    if keyword == "additionalProperties":
        if any(token in path.lower() for token in FORBIDDEN_FIELD_TOKENS): return "FORBIDDEN_FIELD"
        return "UNKNOWN_GOVERNED_FIELD"
    if keyword in {{"enum", "const"}}:
        if path.endswith("schema_version"): return "UNSUPPORTED_SCHEMA_VERSION"
        if path.endswith("schema_id"): return "INCOMPATIBLE_CONTRACT_VERSION"
        if path.endswith("authority_type") or path.endswith("actor.actor_type"): return "FORBIDDEN_AUTHORITY_COMBINATION"
        return "UNKNOWN_ENUM_VALUE"
    if keyword == "pattern":
        if "evidence" in path: return "INVALID_EVIDENCE_REFERENCE"
        if path.endswith("_id") or path.endswith("object_id"): return "INVALID_IDENTIFIER"
        if "hash" in path or path.endswith("digest"): return "INVALID_HASH"
        if "timestamp" in path or path.endswith("_at"): return "INVALID_TIMESTAMP"
        if "unit" in path: return "INVALID_UNIT"
    if keyword == "format" and ("timestamp" in path or path.endswith("_at")): return "INVALID_TIMESTAMP"
    if keyword == "type": return "INVALID_TYPE"
    return "VALIDATION_ERROR"


def _resolve(schema: Mapping[str, object]) -> Mapping[str, object]:
    reference = schema.get("$ref")
    if isinstance(reference, str) and reference.startswith("#/$defs/"):
        resolved = SCHEMA_DOCUMENT["$defs"][reference[len("#/$defs/"):]]
        if isinstance(resolved, Mapping): return resolved
    return schema


def _validate(value: object, raw_schema: Mapping[str, object], path: str, errors: list[ContractError]) -> None:
    schema = _resolve(raw_schema)
    all_of = schema.get("allOf")
    if isinstance(all_of, list):
        for candidate in all_of:
            if isinstance(candidate, Mapping):
                _validate(value, cast(Mapping[str, object], candidate), path, errors)
    if_schema = schema.get("if")
    if isinstance(if_schema, Mapping):
        condition_errors: list[ContractError] = []
        _validate(value, cast(Mapping[str, object], if_schema), path, condition_errors)
        then_schema = schema.get("then")
        if not condition_errors and isinstance(then_schema, Mapping):
            _validate(value, cast(Mapping[str, object], then_schema), path, errors)
    not_schema = schema.get("not")
    if isinstance(not_schema, Mapping):
        forbidden_errors: list[ContractError] = []
        _validate(value, cast(Mapping[str, object], not_schema), path, forbidden_errors)
        if not forbidden_errors:
            errors.append(_error("VALIDATION_ERROR", "value matched a forbidden schema", path))
    any_of = schema.get("anyOf")
    if isinstance(any_of, list):
        successes = 0
        for candidate in any_of:
            if not isinstance(candidate, Mapping):
                continue
            any_candidate_errors: list[ContractError] = []
            _validate(value, cast(Mapping[str, object], candidate), path, any_candidate_errors)
            if not any_candidate_errors:
                successes += 1
        if successes == 0:
            errors.append(_error("VALIDATION_ERROR", "value did not match any governed schema", path))
    one_of = schema.get("oneOf")
    if isinstance(one_of, list):
        successes = 0
        for candidate in one_of:
            if not isinstance(candidate, Mapping): continue
            one_candidate_errors: list[ContractError] = []
            _validate(value, candidate, path, one_candidate_errors)
            if not one_candidate_errors: successes += 1
        if successes != 1:
            code = "UNRESOLVED_REFERENCE" if path.endswith(".target") or path.endswith(".object") else "VALIDATION_ERROR"
            errors.append(_error(code, "value did not match exactly one governed schema", path))
    expected_type = schema.get("type")
    applies_object_keywords = expected_type == "object" or (
        expected_type is None and isinstance(value, Mapping)
    )
    if applies_object_keywords:
        if not isinstance(value, Mapping): errors.append(_error(_error_code(path, "type"), "expected object", path)); return
        required = schema.get("required")
        if isinstance(required, list):
            for field in required:
                if isinstance(field, str) and field not in value: errors.append(_error(_error_code(path + "." + field, "required"), "missing required field", path + "." + field))
        properties = schema.get("properties")
        property_map = properties if isinstance(properties, Mapping) else {{}}
        if schema.get("additionalProperties") is False:
            for field in value:
                if field not in property_map: errors.append(_error(_error_code(path + "." + str(field), "additionalProperties"), "unknown governed field", path + "." + str(field)))
        for field, definition in property_map.items():
            if field in value and isinstance(definition, Mapping): _validate(value[field], definition, path + "." + str(field), errors)
    elif expected_type == "array" or (
        expected_type is None and isinstance(value, list)
    ):
        if not isinstance(value, list): errors.append(_error(_error_code(path, "type"), "expected array", path)); return
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(value) < min_items: errors.append(_error("VALIDATION_ERROR", "array has too few items", path))
        items = schema.get("items")
        if isinstance(items, Mapping):
            for index, item in enumerate(value): _validate(item, items, f"{{path}}[{{index}}]", errors)
        contains = schema.get("contains")
        if isinstance(contains, Mapping):
            matches = False
            for item in value:
                contains_candidate_errors: list[ContractError] = []
                _validate(item, cast(Mapping[str, object], contains), path, contains_candidate_errors)
                if not contains_candidate_errors:
                    matches = True
                    break
            if not matches:
                errors.append(_error("VALIDATION_ERROR", "array contains no governed match", path))
        if schema.get("uniqueItems") is True:
            seen: set[str] = set()
            for item in value:
                digest = canonical_json(item)
                if digest in seen: errors.append(_error("VALIDATION_ERROR", "array items must be unique", path))
                seen.add(digest)
    elif expected_type == "string":
        if not isinstance(value, str): errors.append(_error(_error_code(path, "type"), "expected string", path)); return
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(value) < min_length: errors.append(_error("VALIDATION_ERROR", "string is too short", path))
        max_length = schema.get("maxLength")
        if isinstance(max_length, int) and len(value) > max_length: errors.append(_error("VALIDATION_ERROR", "string is too long", path))
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.fullmatch(pattern, value) is None: errors.append(_error(_error_code(path, "pattern"), "string does not match governed pattern", path))
        if schema.get("format") == "date-time":
            try: datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError: errors.append(_error(_error_code(path, "format"), "timestamp is not canonical UTC", path))
    elif expected_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int): errors.append(_error(_error_code(path, "type"), "expected integer", path)); return
        minimum = schema.get("minimum")
        if isinstance(minimum, (int, float)) and value < minimum: errors.append(_error("VALIDATION_ERROR", "number is below minimum", path))
        maximum = schema.get("maximum")
        if isinstance(maximum, (int, float)) and value > maximum: errors.append(_error("VALIDATION_ERROR", "number is above maximum", path))
    elif expected_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)): errors.append(_error(_error_code(path, "type"), "expected finite number", path)); return
        minimum = schema.get("minimum")
        if isinstance(minimum, (int, float)) and value < minimum: errors.append(_error("VALIDATION_ERROR", "number is below minimum", path))
        maximum = schema.get("maximum")
        if isinstance(maximum, (int, float)) and value > maximum: errors.append(_error("VALIDATION_ERROR", "number is above maximum", path))
    elif expected_type == "boolean" and not isinstance(value, bool):
        errors.append(_error(_error_code(path, "type"), "expected boolean", path))
    enum = schema.get("enum")
    if isinstance(enum, list) and not any(type(value) is type(candidate) and value == candidate for candidate in enum):
        errors.append(_error(_error_code(path, "enum"), "unknown governed enum value", path))
    if "const" in schema:
        expected = schema["const"]
        if type(value) is not type(expected) or value != expected:
            errors.append(_error(_error_code(path, "const"), "value does not match governed constant", path))


def validate_entity(value: object, entity_type: str | None = None) -> ValidationResult:
    if not isinstance(value, Mapping): return ValidationResult(False, (_error("INVALID_TYPE", "entity must be an object", "$"),))
    actual = value.get("entity_type")
    if not isinstance(actual, str) or actual not in ENTITY_TYPES: return ValidationResult(False, (_error("UNKNOWN_ENTITY_TYPE", "unknown entity type", "$.entity_type"),))
    if entity_type is not None and actual != entity_type: return ValidationResult(False, (_error("VALIDATION_ERROR", "entity type does not match requested validator", "$.entity_type"),))
    errors: list[ContractError] = []
    _validate(value, {{"$ref": f"#/$defs/{{actual}}"}}, "$", errors)
    return ValidationResult(not errors, tuple(errors))


def _coerce(value: object, raw_schema: Mapping[str, object]) -> object:
    schema = _resolve(raw_schema)
    reference = raw_schema.get("$ref")
    if isinstance(reference, str) and reference.startswith("#/$defs/"):
        name = reference[len("#/$defs/"):]
        if name in ID_CLASSES and isinstance(value, str): return ID_CLASSES[name](value)
        if name in ENUM_CLASSES and isinstance(value, str): return ENUM_CLASSES[name](value)
    items = schema.get("items")
    if isinstance(value, list) and schema.get("type") == "array" and isinstance(items, Mapping):
        item_schema = cast(Mapping[str, object], items)
        return [_coerce(item, item_schema) for item in value]
    properties = schema.get("properties")
    if isinstance(value, Mapping) and schema.get("type") == "object" and isinstance(properties, Mapping):
        property_map = cast(Mapping[str, object], properties)
        output: dict[str, object] = {{}}
        for key, item in value.items():
            field = str(key)
            definition = property_map.get(field)
            if isinstance(definition, Mapping):
                output[field] = _coerce(item, cast(Mapping[str, object], definition))
            else:
                output[field] = item
        return output
    return value


def _parse(value: object, entity_type: str) -> object:
    result = validate_entity(value, entity_type)
    if not result.valid: raise ContractValidationError(result.errors)
    return _coerce(value, {{"$ref": f"#/$defs/{{entity_type}}"}})


def parse_entity(value: object) -> EntityRecord:
    if not isinstance(value, Mapping):
        raise ContractValidationError((_error("INVALID_TYPE", "entity must be an object", "$"),))
    entity_type = value.get("entity_type")
    if not isinstance(entity_type, str):
        raise ContractValidationError((_error("UNKNOWN_ENTITY_TYPE", "unknown entity type", "$.entity_type"),))
    return cast(EntityRecord, _parse(value, entity_type))


{parse_functions}
'''


def render_py_entity_module(entity_name: str) -> str:
    return (
        '"""Generated re-export. Do not edit manually."""\n\n'
        f"from .models import {entity_name}\n\n"
        f'__all__ = ["{entity_name}"]\n'
    )


def render_ts_entity_module(entity_name: str) -> str:
    return (
        "/* Generated re-export. Do not edit manually. */\n"
        f'export type {{ {entity_name} }} from "./domain.js";\n'
    )


def render_ts_index() -> str:
    return (
        "/* Generated by scripts/generate_models.py. Do not edit manually. */\n"
        'export * from "./models/domain.js";\n'
        'export * from "./runtime.js";\n'
    )


def render_py_init(schema: dict[str, Any], manifest: dict[str, Any]) -> str:
    names = list(schema["$defs"])
    imports = ",\n    ".join(names)
    parse_names = [f"parse_{entity['model_file']}" for entity in manifest["entities"]]
    runtime_names = [
        "ValidationResult",
        "ContractValidationError",
        "canonical_json",
        "validate_entity",
        "parse_entity",
        *parse_names,
    ]
    exports = ",\n    ".join(repr(name) for name in names + runtime_names)
    parse_imports = ",\n    ".join(parse_names)
    return f'''"""Generated package exports. Do not edit manually."""

# fmt: off

from .models import (
    {imports},
)
from .runtime import (
    ContractValidationError,
    ValidationResult,
    canonical_json,
    parse_entity,
    {parse_imports},
    validate_entity,
)

__all__ = [
    {exports}
]
'''


def expected_outputs(
    schema: dict[str, Any], manifest: dict[str, Any], api_contract: dict[str, Any]
) -> dict[Path, str]:
    outputs: dict[Path, str] = {
        OPENAPI_PATH: render_openapi(schema, manifest, api_contract),
        TS_ROOT / "models" / "domain.ts": render_ts_domain(schema),
        TS_ROOT / "runtime.ts": render_ts_runtime(schema, manifest),
        TS_ROOT / "index.ts": render_ts_index(),
        PY_ROOT / "models.py": render_py_models(schema),
        PY_ROOT / "schema_data.py": render_py_schema_data(schema),
        PY_ROOT / "runtime.py": render_py_runtime(schema, manifest),
        PY_ROOT / "__init__.py": render_py_init(schema, manifest),
    }
    for entity in manifest["entities"]:
        name = entity["name"]
        model_file = entity["model_file"]
        outputs[TS_ROOT / "models" / f"{model_file.replace('_', '-')}.ts"] = (
            render_ts_entity_module(name)
        )
        outputs[PY_ROOT / f"{model_file}.py"] = render_py_entity_module(name)
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate MEF TypeScript and Python projections"
    )
    parser.add_argument(
        "--check", action="store_true", help="fail when generated files are not in sync"
    )
    args = parser.parse_args()
    schema, manifest, _policy, api_contract = load_sources()
    outputs = expected_outputs(schema, manifest, api_contract)
    expected_paths = set(outputs)
    drift: list[str] = []
    for path, content in outputs.items():
        actual = path.read_text(encoding="utf-8") if path.exists() else None
        if actual != content:
            drift.append(path.relative_to(ROOT).as_posix())
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8", newline="\n")
    for generated_root in (TS_ROOT, PY_ROOT):
        if not generated_root.exists():
            continue
        for path in generated_root.rglob("*"):
            if (
                path.is_file()
                and path.suffix in {".py", ".ts"}
                and path not in expected_paths
            ):
                drift.append(path.relative_to(ROOT).as_posix())
    if drift and args.check:
        print("GENERATED_MODEL_DRIFT=" + ",".join(drift))
        return 1
    if any(path not in expected_paths for path in [ROOT / item for item in drift]):
        print("GENERATED_MODEL_ORPHAN=" + ",".join(drift))
        return 1
    print("GENERATED_MODELS=IN_SYNC")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
