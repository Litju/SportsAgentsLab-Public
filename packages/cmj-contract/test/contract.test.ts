import test from "node:test";
import assert from "node:assert/strict";
import {
  CMJ_CONTRACT,
  CONTRACT_SCHEMA,
  EVENTS,
  EXCLUDED_METRICS,
  MANIFEST,
  METRIC_PACK,
  NUMERICAL_POLICY,
  PRODUCTION_PROCESSOR_IMPLEMENTED,
  QUALITY_TAXONOMY,
  PROTOCOL,
  canonicalJson,
  sampleRateEligibility,
  stableManifestHash,
  validateEventOrder,
  ML110_CORPUS_IMPLEMENTED,
  type ContractDocument,
  type JsonValue
} from "../src/index.ts";

interface EventDefinition { readonly event_id: string; readonly ordering_invariant: string; }
interface MetricDefinition { readonly metric_id: string; readonly classification: string; readonly unit: string; readonly dependencies: readonly string[]; readonly required_events: readonly string[]; readonly required_phases: readonly string[]; }
interface ContractShape {
  readonly contract_id: string;
  readonly contract_version: string;
  readonly scope: { readonly supported_physical_configurations: readonly string[] };
  readonly events: readonly EventDefinition[];
  readonly phases_included: readonly string[];
  readonly metric_pack: { readonly primary_metric_count: number; readonly metrics: readonly MetricDefinition[] };
  readonly excluded_metrics: readonly { readonly metric_id: string }[];
  readonly quality_taxonomy: { readonly states: readonly { readonly state_id: string }[] };
  readonly failure_codes: readonly { readonly code: string }[];
  readonly result_hash: { readonly included_inputs: readonly string[]; readonly excluded_inputs: readonly string[] };
}
interface ProtocolDocument {
  readonly protocol: { readonly protocol_id: string };
  readonly scope: { readonly supported_physical_configurations: readonly string[] };
}
interface MetricPackDocument { readonly metric_pack: { readonly metric_pack_id: string; readonly primary_metric_count: number; readonly metrics: readonly MetricDefinition[] } }
interface NumericalPolicyDocument {
  readonly sample_rate_policy: { readonly resampling: string; readonly interpolation: string };
  readonly integration: { readonly method: string; readonly numerical_precision: string };
  readonly precision_policy: { readonly intermediate_rounding: string };
  readonly result_hash: { readonly algorithm: string; readonly semantic_hash_only: boolean; readonly included_inputs: readonly string[]; readonly excluded_inputs: readonly string[] };
}

const contract = CMJ_CONTRACT as unknown as ContractShape;
const protocol = PROTOCOL as unknown as ProtocolDocument;
const metricPack = METRIC_PACK as unknown as MetricPackDocument;
const numericalPolicy = NUMERICAL_POLICY as unknown as NumericalPolicyDocument;
const manifest = MANIFEST as unknown as { readonly manifest_sha256: string };
const events = (EVENTS["events"] as unknown as readonly EventDefinition[]);
const metrics = metricPack.metric_pack.metrics;
const excluded = (EXCLUDED_METRICS["excluded_metrics"] as unknown as readonly { readonly metric_id: string }[]);
const qualityStates = (QUALITY_TAXONOMY["quality_taxonomy"] as unknown as ContractShape["quality_taxonomy"]).states;
const failureCodes = QUALITY_TAXONOMY["failure_codes"] as unknown as readonly { readonly code: string }[];

function ids(values: readonly { readonly [key: string]: JsonValue }[], key: string): string[] {
  return values.map((value) => String(value[key]));
}

function assertUnique(values: readonly string[], label: string): void {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

test("contract identity and generated documents are synchronized", () => {
  assert.equal(contract.contract_id, "ML109-CMJ-PROCESSOR-CONTRACT");
  assert.equal(contract.contract_version, "1.0.0");
  assert.equal(protocol.protocol.protocol_id, "CMJ-U-BI-HOH");
  assert.equal(metricPack.metric_pack.metric_pack_id, "CMJ_VERTICAL_CORE");
  assert.deepEqual(protocol.scope.supported_physical_configurations, contract.scope.supported_physical_configurations);
  assert.equal(stableManifestHash(), manifest.manifest_sha256);
  assert.equal(canonicalJson(MANIFEST), canonicalJson(JSON.parse(JSON.stringify(MANIFEST))));
});

test("JSON Schema covers the frozen contract surface", () => {
  const schema = CONTRACT_SCHEMA as unknown as {
    readonly $schema: string;
    readonly required: readonly string[];
    readonly properties: Record<string, unknown>;
  };
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  for (const required of ["contract_id", "protocol", "events", "metric_pack", "excluded_metrics", "quality_taxonomy", "precision_policy", "result_hash"]) {
    assert.ok(schema.required.includes(required), `schema must require ${required}`);
    assert.ok(Object.hasOwn(schema.properties, required), `schema must define ${required}`);
  }
});

test("event and metric identifiers are unique and resolvable", () => {
  const eventIds = events.map((event) => event.event_id);
  const metricIds = metrics.map((metric) => metric.metric_id);
  assertUnique(eventIds, "event IDs");
  assertUnique(metricIds, "metric IDs");
  assert.deepEqual(eventIds, ["MOVEMENT_ONSET", "TAKEOFF", "LANDING"]);
  const eventSet = new Set(eventIds);
  const phaseSet = new Set(contract.phases_included);
  const available = new Set<string>([
    ...metricIds,
    "body_mass_kg",
    "gravity_m_per_s2",
    "net_impulse_onset_to_takeoff_Ns",
    "takeoff_velocity_m_per_s",
    "quiet_standing_window",
    "F_vertical_N",
    "net_force_N",
    "velocity_m_per_s",
    "integration_policy",
    "event timestamps"
  ]);
  for (const metric of metrics) {
    for (const eventId of metric.required_events) assert.ok(eventSet.has(eventId), `${metric.metric_id} requires ${eventId}`);
    for (const phase of metric.required_phases) assert.ok(phaseSet.has(phase), `${metric.metric_id} requires ${phase}`);
    for (const dependency of metric.dependencies) assert.ok(available.has(dependency), `${metric.metric_id} dependency ${dependency} is unresolved`);
  }
});

test("metric pack has exactly one primary and excludes excluded metrics", () => {
  assert.equal(metricPack.metric_pack.primary_metric_count, 1);
  assert.equal(metrics.filter((metric) => metric.classification === "PRIMARY").length, 1);
  const coreIds = new Set(metrics.map((metric) => metric.metric_id));
  for (const metric of excluded) assert.equal(coreIds.has(metric.metric_id), false, `${metric.metric_id} leaked into core`);
});

test("units, quality states, failure codes, and configurations are closed", () => {
  const knownUnits = new Set(["N", "kg", "m", "m/s", "s", "N*s"]);
  for (const metric of metrics) assert.ok(knownUnits.has(metric.unit), `${metric.metric_id} has unknown unit ${metric.unit}`);
  assertUnique(qualityStates.map((state) => state.state_id), "quality state IDs");
  assertUnique(failureCodes.map((failure) => failure.code), "failure codes");
  assert.deepEqual(qualityStates.map((state) => state.state_id), [
    "ACQUISITION_INELIGIBLE", "PROCESSOR_FAILURE", "EVENT_FAILURE", "INTEGRITY_WARNING",
    "METRIC_UNAVAILABLE", "REVIEW_REQUIRED", "EXCLUDED", "VALID_INCLUDED"
  ]);
  assert.deepEqual(contract.scope.supported_physical_configurations, ["single.total_fz", "dual.independent_fz"]);
  for (const required of ["NO_QUALIFIED_QUIET_STANDING", "BODY_WEIGHT_UNAVAILABLE", "INVALID_MASS", "MOVEMENT_ONSET_NOT_FOUND", "TAKEOFF_NOT_FOUND", "LANDING_NOT_FOUND", "EVENT_ORDER_INVALID", "TIMEBASE_INVALID", "SAMPLE_RATE_UNSUPPORTED", "NONFINITE_SIGNAL", "MISSING_SAMPLE", "CONFIGURATION_INELIGIBLE", "INTEGRATION_PRECONDITION_FAILED"]) {
    assert.ok(failureCodes.some((failure) => failure.code === required), `missing failure code ${required}`);
  }
});

test("sample-rate policy fails closed and event order is explicit", () => {
  assert.equal(sampleRateEligibility(undefined, true), "SAMPLE_RATE_UNSUPPORTED");
  assert.equal(sampleRateEligibility(999.999, true), "SAMPLE_RATE_UNSUPPORTED");
  assert.equal(sampleRateEligibility(1000, true), "SUPPORTED");
  assert.equal(sampleRateEligibility(2000, true), "SUPPORTED");
  assert.equal(sampleRateEligibility(2000, false), "TIMEBASE_INVALID");
  assert.equal(validateEventOrder(["MOVEMENT_ONSET", "TAKEOFF", "LANDING"]), true);
  assert.equal(validateEventOrder(["TAKEOFF", "MOVEMENT_ONSET", "LANDING"]), false);
  assert.equal(numericalPolicy.sample_rate_policy.resampling, "NO");
  assert.equal(numericalPolicy.sample_rate_policy.interpolation, "NO");
});

test("numerical policy and semantic hash exclusions are complete", () => {
  assert.equal(numericalPolicy.integration.method, "left-to-right cumulative trapezoidal integration");
  assert.equal(numericalPolicy.integration.numerical_precision, "IEEE-754 binary64");
  assert.equal(numericalPolicy.precision_policy.intermediate_rounding, "NO");
  assert.equal(numericalPolicy.result_hash.algorithm, "SHA-256");
  assert.equal(numericalPolicy.result_hash.semantic_hash_only, true);
  const included = new Set(numericalPolicy.result_hash.included_inputs as string[]);
  for (const excludedName of numericalPolicy.result_hash.excluded_inputs as string[]) assert.equal(included.has(excludedName), false);
  for (const required of ["created_at", "request_id", "hostname", "path", "runtime_timestamp"]) assert.ok((numericalPolicy.result_hash.excluded_inputs as string[]).includes(required));
});

test("analytical sanity examples are formula checks, not processor execution", () => {
  assert.equal(PRODUCTION_PROCESSOR_IMPLEMENTED, false);
  assert.equal(ML110_CORPUS_IMPLEMENTED, false);
  assert.equal(800, 800);
  assert.equal((160 * 0.5) / 80, 1);
  assert.ok(Math.abs((2 * 2) / (2 * 9.80665) - 0.203943726) < 1e-6);
});
