import test from "node:test";
import assert from "node:assert/strict";
import type { CanonicalAcquisition } from "@mef/generated-ts";
import { resolveAcquisitionConfiguration } from "../src/index.ts";

const hash = (digit: string) => digit.repeat(64);

function canonical(overrides: Partial<CanonicalAcquisition> = {}): CanonicalAcquisition {
  const channel = {
    channel_id: "channel_force_total" as CanonicalAcquisition["channels"][number]["channel_id"],
    physical_quantity: { state: "KNOWN" as const, value: "force", evidence_references: [] },
    unit: { state: "KNOWN" as const, unit: { system: "SI" as const, symbol: "N" }, evidence_references: [] },
    axis: { state: "KNOWN" as const, value: "vertical", evidence_references: [] },
    sign_convention: { state: "KNOWN" as const, value: "positive", evidence_references: [] },
    sample_time: { state: "KNOWN" as const, value: "source_field=time", evidence_references: [] },
    quality_state: "QUALIFIED" as const,
    sample_count: 2,
    transformation: { kind: "IDENTITY" as const, scale: 1, offset: 0 },
    evidence_references: []
  };
  return {
    entity_type: "CanonicalAcquisition",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/canonical-acquisition.schema.json",
    schema_version: "1.0.0",
    canonical_acquisition_id: "acq_fixture_configuration" as CanonicalAcquisition["canonical_acquisition_id"],
    record_version: 1,
    created_at: "2026-08-17T00:00:00Z",
    source_artifact_id: "src_fixture_configuration" as CanonicalAcquisition["source_artifact_id"],
    source_observation_id: "sob_fixture_configuration" as CanonicalAcquisition["source_observation_id"],
    source_observation_sha256: hash("1") as CanonicalAcquisition["source_observation_sha256"],
    canonicalizer_version: "0.1.0",
    mapping_manifest_sha256: hash("2"),
    signal_artifact_sha256: hash("3"),
    integrity_report_sha256: hash("4"),
    canonical_identity_sha256: hash("5"),
    acquisition_state: "QUALIFIED",
    modality: { state: "KNOWN", value: "force_plate", evidence_references: [] },
    channels: [channel],
    source_mappings: [{ channel_id: channel.channel_id, source_label: "force_total", mapping_state: "KNOWN", evidence_references: [], transformation: { kind: "IDENTITY", scale: 1, offset: 0 } }],
    sample_semantics: { state: "KNOWN", value: "source_record_indices_preserved", evidence_references: [] },
    timebase: { state: "KNOWN", timestamp_channel_id: "channel_time" as CanonicalAcquisition["timebase"]["timestamp_channel_id"], timestamp_unit: { system: "SI", symbol: "s" }, sample_interval_seconds: 0.01, uniformity: "UNIFORM", evidence_references: [] },
    synchronization: { state: "KNOWN", value: "single_stream", evidence_references: [] },
    calibration: { state: "KNOWN", value: "source_declared", evidence_references: [] },
    preprocessing: { state: "KNOWN", value: "raw_as_received", evidence_references: [] },
    missingness_quality: { state: "KNOWN", value: "explicit integrity findings", evidence_references: [] },
    configuration_resolution: "NOT_EVALUATED",
    manifest: { source_observation_id: "sob_fixture_configuration" as CanonicalAcquisition["source_observation_id"], source_observation_sha256: hash("1"), source_artifact_sha256: hash("a"), canonicalizer_version: "0.1.0", mapping_manifest_id: "map_fixture_configuration" as CanonicalAcquisition["manifest"]["mapping_manifest_id"], mapping_manifest_sha256: hash("2"), adapter_id: "fixture", evidence_references: [] },
    signal_artifact: { content_hash: hash("3"), storage_key: `canonical/sha256/${hash("3")}`, byte_size: 1, media_type: "application/x-ndjson", encoding: "MEF_CANONICAL_SIGNAL_NDJSON_V0_1", channel_order: [channel.channel_id] },
    integrity_report: { status: "QUALIFIED", record_count: 2, channel_count: 1, finite_value_count: 2, finding_count: 0, findings: [], checks: [{ check_id: "RECORD_COUNT", status: "PASS", finding_ids: [], evidence_references: [] }] },
    quality_state: "QUALIFIED",
    blocking_reasons: [],
    ...overrides
  };
}

test("resolves single.total_fz from canonical channel and exact interval", () => {
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: canonical() });
  assert.equal(result.resolution.configuration_state, "RESOLVED_QUALIFIED");
  assert.equal(result.resolution.physical_contract.contract, "single.total_fz");
  assert.equal(result.resolution.sample_rate.state, "RESOLVED");
  assert.equal(result.resolution.sample_rate.sample_rate_hz, 100);
  assert.equal(result.resolution.preprocessing.state, "UNKNOWN");
  assert.equal(result.resolution.calibration.state, "UNKNOWN");
  assert.equal(result.resolution.zeroing.state, "UNKNOWN");
  assert.match(result.resolution.resolution_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.resolution.resolution_sha256, resolveAcquisitionConfiguration({ canonicalAcquisition: canonical() }).resolution.resolution_sha256);
});

test("does not default unknown rate or axis", () => {
  const base = canonical();
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: {
    ...base,
    channels: [{ ...base.channels[0], axis: { state: "UNKNOWN", reason: "missing", evidence_references: [] } }],
    timebase: { state: "UNKNOWN", reason: "missing", evidence_references: [] },
    acquisition_state: "UNQUALIFIED",
    quality_state: "REVIEW_REQUIRED",
    blocking_reasons: [{ code: "timebase_unknown", description: "Timebase is unknown.", evidence_references: [] }]
  } });
  assert.equal(result.resolution.configuration_state, "PARTIALLY_RESOLVED");
  assert.equal(result.resolution.sample_rate.state, "UNKNOWN");
  assert.equal(result.resolution.axis_sign.state, "UNKNOWN");
});

test("does not infer synchronization from equal sample counts", () => {
  const base = canonical();
  const second = { ...base.channels[0], channel_id: "channel_force_right" as typeof base.channels[0]["channel_id"] };
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: {
    ...base,
    channels: [base.channels[0], second],
    source_mappings: [base.source_mappings[0], { ...base.source_mappings[0], channel_id: second.channel_id, source_label: "force_right" }]
  } });
  assert.equal(result.resolution.synchronization.state, "UNKNOWN");
  assert.equal(result.resolution.configuration_state, "PARTIALLY_RESOLVED");
  assert.ok(result.resolution.findings.some((finding) => finding.code === "synchronization_unknown"));
});

test("fails closed on conflicting explicit sample rates", () => {
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: canonical(),
    metadata: [
      { key: "sample_rate_hz_left", status: "known", value: "100" },
      { key: "sample_rate_hz_right", status: "known", value: "200" }
    ]
  });
  assert.equal(result.resolution.sample_rate.state, "CONFLICTING");
  assert.equal(result.resolution.configuration_state, "CONFLICTING_METADATA");
});

test("resolves dual.independent_fz only with explicit sync and plate identities", () => {
  const base = canonical();
  const second = { ...base.channels[0], channel_id: "channel_force_right" as typeof base.channels[0]["channel_id"] };
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: {
      ...base,
      channels: [base.channels[0], second],
      source_mappings: [base.source_mappings[0], { ...base.source_mappings[0], channel_id: second.channel_id, source_label: "force_right" }]
    },
    metadata: [{ key: "synchronization", status: "known", value: "synchronized" }],
    plateIdentityByChannel: {
      [base.channels[0].channel_id]: { key: "plate_left", status: "known", value: "left" },
      [second.channel_id]: { key: "plate_right", status: "known", value: "right" }
    }
  });
  assert.equal(result.resolution.physical_contract.contract, "dual.independent_fz");
  assert.equal(result.resolution.physical_contract.state, "RESOLVED");
  assert.equal(result.resolution.synchronization.state, "SYNCHRONIZED");
  assert.equal(result.resolution.configuration_state, "RESOLVED_QUALIFIED");
});

test("does not treat a marketing label as a force quantity", () => {
  const base = canonical();
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: {
    ...base,
    channels: [{
      ...base.channels[0],
      physical_quantity: { state: "UNKNOWN", reason: "Only a producer label was supplied.", evidence_references: [] }
    }],
    acquisition_state: "UNQUALIFIED",
    quality_state: "REVIEW_REQUIRED",
    blocking_reasons: [{ code: "physical_quantity_unknown", description: "Physical quantity is unknown.", evidence_references: [] }]
  } });
  assert.equal(result.resolution.configuration_state, "UNRESOLVED");
  assert.equal(result.resolution.physical_contract.contract, "UNKNOWN");
});

test("preserves unresolved protocol authority without inventing eligibility", () => {
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: canonical(),
    protocolAuthority: { version: "protocol-authority-0.1", state: "UNRESOLVED" }
  });
  assert.equal(result.resolution.protocol_eligibility.state, "UNRESOLVED");
  assert.ok(result.resolution.findings.some((finding) => finding.code === "protocol_authority_unresolved"));
});

test("fails closed on conflicting axis declarations", () => {
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: canonical(),
    metadata: [
      { key: "axis_left", status: "known", value: "vertical" },
      { key: "axis_right", status: "known", value: "horizontal" }
    ]
  });
  assert.equal(result.resolution.axis_sign.state, "CONFLICTING");
  assert.equal(result.resolution.configuration_state, "CONFLICTING_METADATA");
});

test("keeps explicit unsynchronization unsupported for a dual contract", () => {
  const base = canonical();
  const second = { ...base.channels[0], channel_id: "channel_force_right" as typeof base.channels[0]["channel_id"] };
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: {
      ...base,
      channels: [base.channels[0], second],
      source_mappings: [base.source_mappings[0], { ...base.source_mappings[0], channel_id: second.channel_id, source_label: "force_right" }]
    },
    metadata: [{ key: "synchronization", status: "known", value: "unsynchronized" }],
    plateIdentityByChannel: {
      [base.channels[0].channel_id]: { key: "plate_left", status: "known", value: "left" },
      [second.channel_id]: { key: "plate_right", status: "known", value: "right" }
    }
  });
  assert.equal(result.resolution.synchronization.state, "UNSYNCHRONIZED");
  assert.equal(result.resolution.physical_contract.state, "UNSUPPORTED");
  assert.equal(result.resolution.configuration_state, "RESOLVED_UNQUALIFIED");
});

test("preserves declared preprocessing and ignores dimension labels", () => {
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: canonical(),
    metadata: [
      { key: "dimension", status: "known", value: "3D" },
      { key: "preprocessing", status: "known", value: "declared_filter" }
    ]
  });
  assert.equal(result.resolution.preprocessing.state, "DECLARED");
  assert.equal(result.resolution.configuration_state, "RESOLVED_QUALIFIED");
});
