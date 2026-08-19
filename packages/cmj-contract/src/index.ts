import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };
export type ContractDocument = { readonly [key: string]: JsonValue };

function readJson(name: string): ContractDocument {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8")) as ContractDocument;
}

export const CMJ_CONTRACT = readJson("contract.json");
export const CONTRACT_SCHEMA = readJson("contract.schema.json");
export const PROTOCOL = readJson("protocol.json");
export const EVENTS = readJson("events.json");
export const METRIC_PACK = readJson("metric-pack.json");
export const EXCLUDED_METRICS = readJson("excluded-metrics.json");
export const QUALITY_TAXONOMY = readJson("quality-taxonomy.json");
export const NUMERICAL_POLICY = readJson("numerical-policy.json");
export const MANIFEST = readJson("manifest.json");

export const CONTRACT_ID = "ML109-CMJ-PROCESSOR-CONTRACT" as const;
export const CONTRACT_VERSION = "1.0.0" as const;
export const PROTOCOL_ID = "CMJ-U-BI-HOH" as const;
export const PROTOCOL_VERSION = "1.0.0" as const;
export const METRIC_PACK_ID = "CMJ_VERTICAL_CORE" as const;
export const METRIC_PACK_VERSION = "1.0.0" as const;
export const NUMERICAL_POLICY_VERSION = "1.0.0" as const;

function canonicalize(value: JsonValue): JsonValue {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("semantic serialization requires finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

export function stableManifestHash(manifest: ContractDocument = MANIFEST): string {
  const { manifest_sha256: _ignored, ...withoutHash } = manifest;
  return createHash("sha256").update(canonicalJson(withoutHash as JsonValue), "utf8").digest("hex");
}

export function semanticResultHashInputNames(): readonly string[] {
  return [
    "canonical_acquisition_hash",
    "configuration_resolution_hash",
    "processor_contract_version",
    "metric_pack_version",
    "numerical_policy_version",
    "events",
    "metric_values_internal_precision",
    "quality_state",
    "quality_findings"
  ];
}

export function sampleRateEligibility(rateHz: number | undefined, uniformTimebase: boolean): "SUPPORTED" | "SAMPLE_RATE_UNSUPPORTED" | "TIMEBASE_INVALID" {
  if (!uniformTimebase) return "TIMEBASE_INVALID";
  const minimum = (NUMERICAL_POLICY.sample_rate_policy as { readonly minimum_supported_rate_hz: number }).minimum_supported_rate_hz;
  return rateHz !== undefined && Number.isFinite(rateHz) && rateHz >= minimum
    ? "SUPPORTED"
    : "SAMPLE_RATE_UNSUPPORTED";
}

export function validateEventOrder(eventIds: readonly string[]): boolean {
  const required = ["MOVEMENT_ONSET", "TAKEOFF", "LANDING"];
  return required.every((eventId, index) => eventIds[index] === eventId);
}

export const PRODUCTION_PROCESSOR_IMPLEMENTED = false as const;
export const ML110_CORPUS_IMPLEMENTED = false as const;
