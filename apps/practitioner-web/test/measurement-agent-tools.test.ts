import test from "node:test";
import assert from "node:assert/strict";
import type { CanonicalAcquisition, SourceArtifact } from "@mef/generated-ts";
import type { SourceObservation } from "@mef/ingestion-adk";
import { resolveAcquisitionConfiguration } from "@mef/acquisition-configuration";
import {
  downstreamProcessingForRecords,
  measurementAgentEnvelope,
  missingMetadataForRecords,
  recordIds,
  type MeasurementAgentRecords,
  uiRecordPath
} from "../src/server/measurement-agent.ts";

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
    source_observation_sha256: hash("1"),
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
    manifest: { source_observation_id: "sob_fixture_configuration" as CanonicalAcquisition["source_observation_id"], source_observation_sha256: hash("1"), source_artifact_sha256: hash("a"), canonicalizer_version: "0.1.0", mapping_manifest_id: "map_fixture_configuration" as CanonicalAcquisition["manifest"]["mapping_manifest_id"], mapping_manifest_sha256: hash("2"), adapter_id: "fixture", evidence_references: [{ evidence_manifest_id: "evm_fixture" as CanonicalAcquisition["manifest"]["evidence_references"][number]["evidence_manifest_id"], component: "fixture", locator: "fixture" }] },
    signal_artifact: { content_hash: hash("3"), storage_key: `canonical/sha256/${hash("3")}`, byte_size: 1, media_type: "application/x-ndjson", encoding: "MEF_CANONICAL_SIGNAL_NDJSON_V0_1", channel_order: [channel.channel_id] },
    integrity_report: { status: "QUALIFIED", record_count: 2, channel_count: 1, finite_value_count: 2, finding_count: 0, findings: [], checks: [{ check_id: "RECORD_COUNT", status: "PASS", finding_ids: [], evidence_references: [] }] },
    quality_state: "QUALIFIED",
    blocking_reasons: [],
    ...overrides
  };
}

function records(acquisition: CanonicalAcquisition, result: ReturnType<typeof resolveAcquisitionConfiguration>): MeasurementAgentRecords {
  const attempt = {
    importAttemptId: "imp_fixture_configuration",
    sourceArtifactId: acquisition.source_artifact_id,
    state: "READY_FOR_ADAPTER",
    scientificEligibility: "INELIGIBLE"
  } as unknown as MeasurementAgentRecords["attempt"];
  const observation = {
    sourceObservationVersion: "0.1.0",
    sourceArtifactId: acquisition.source_artifact_id,
    sourceContentSha256: acquisition.source_observation_sha256,
    adapterExecution: { adapterId: "fixture", adapterVersion: "0.1.0", adkApiVersion: "0.1.0", qualification: "reference", executedAt: "2026-08-17T00:00:00Z" },
    schema: { schemaVersion: "1", containerType: "delimited", encoding: "utf-8", headerRowCount: 1, orderedColumns: [], metadataKeys: [] },
    schemaFingerprint: hash("6"),
    fields: [],
    metadata: [],
    warnings: [],
    provenance: { sourceArtifactId: acquisition.source_artifact_id, sourceContentSha256: acquisition.source_observation_sha256, locators: [] },
    observationSha256: hash("7")
  } as unknown as SourceObservation;
  return {
    attempt,
    sourceArtifact: { source_artifact_id: acquisition.source_artifact_id, content_hash: hash("8") } as unknown as SourceArtifact,
    sourceObservation: { status: "OBSERVATION_REUSED", attempt, sourceObservationId: acquisition.source_observation_id, observation, resolution: {} } as unknown as NonNullable<MeasurementAgentRecords["sourceObservation"]>,
    canonicalAcquisition: { status: "CANONICAL_ACQUISITION_REUSED", attempt, sourceObservationId: acquisition.source_observation_id, acquisition },
    configurationResolution: { status: "CONFIGURATION_RESOLUTION_REUSED", attempt, sourceObservationId: acquisition.source_observation_id, resolution: result.resolution, contract: result.contract }
  };
}

test("measurement-agent evaluation keeps missing sample rate and axis UNKNOWN", () => {
  const base = canonical();
  const acquisition = canonical({
    channels: [{ ...base.channels[0], axis: { state: "UNKNOWN", reason: "missing", evidence_references: [] } }],
    timebase: { state: "UNKNOWN", reason: "missing", evidence_references: [] },
    acquisition_state: "UNQUALIFIED",
    quality_state: "REVIEW_REQUIRED",
    blocking_reasons: [{ code: "timebase_unknown", description: "Timebase is unknown.", evidence_references: [] }]
  });
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: acquisition });
  const missing = missingMetadataForRecords(records(acquisition, result));
  assert.equal(result.resolution.sample_rate.state, "UNKNOWN");
  assert.equal(result.resolution.axis_sign.state, "UNKNOWN");
  assert.equal(missing.find((item) => item.field === "sample_rate")?.status, "UNKNOWN");
  assert.equal(missing.some((item) => item.field === "axis" && item.status === "UNKNOWN"), true);
  assert.equal(result.resolution.sample_rate.sample_rate_hz, undefined);
  assert.equal(result.resolution.axis_sign.axis, undefined);
});

test("measurement-agent evaluation makes no synchronization claim from equal counts", () => {
  const base = canonical();
  const second = { ...base.channels[0], channel_id: "channel_force_right" as typeof base.channels[0]["channel_id"] };
  const acquisition = canonical({
    channels: [base.channels[0], second],
    source_mappings: [base.source_mappings[0], { ...base.source_mappings[0], channel_id: second.channel_id, source_label: "force_right" }]
  });
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: acquisition });
  const missing = missingMetadataForRecords(records(acquisition, result));
  assert.equal(result.resolution.synchronization.state, "UNKNOWN");
  assert.equal(missing.find((item) => item.field === "synchronization")?.status, "UNKNOWN");
});

test("measurement-agent evaluation does not qualify from a 3D label", () => {
  const acquisition = canonical({
    channels: [{ ...canonical().channels[0], physical_quantity: { state: "UNKNOWN", reason: "3D label is not a force declaration.", evidence_references: [] } }],
    acquisition_state: "UNQUALIFIED",
    quality_state: "REVIEW_REQUIRED",
    blocking_reasons: [{ code: "physical_quantity_unknown", description: "Physical quantity is unknown.", evidence_references: [] }]
  });
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: acquisition, metadata: [{ key: "dimension", status: "known", value: "3D" }] });
  assert.equal(result.resolution.configuration_state, "UNRESOLVED");
  assert.notEqual(result.resolution.configuration_state, "RESOLVED_QUALIFIED");
  assert.equal(result.contract.configuration_name.state, "UNRESOLVED");
});

test("measurement-agent evaluation surfaces missing calibration", () => {
  const acquisition = canonical();
  const result = resolveAcquisitionConfiguration({ canonicalAcquisition: acquisition });
  const missing = missingMetadataForRecords(records(acquisition, result));
  assert.equal(result.resolution.calibration.state, "UNKNOWN");
  assert.equal(missing.find((item) => item.field === "calibration")?.status, "UNKNOWN");
});

test("measurement-agent evaluation surfaces conflicting metadata", () => {
  const acquisition = canonical();
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: acquisition,
    metadata: [
      { key: "sample_rate_hz_left", status: "known", value: "100" },
      { key: "sample_rate_hz_right", status: "known", value: "200" }
    ]
  });
  const missing = missingMetadataForRecords(records(acquisition, result));
  assert.equal(result.resolution.configuration_state, "CONFLICTING_METADATA");
  assert.equal(missing.find((item) => item.field === "sample_rate")?.status, "CONFLICTING");
  assert.equal(missing.find((item) => item.field === "configuration")?.status, "CONFLICTING");
});

test("measurement-agent evaluation refuses unsupported unsynchronized acquisition", () => {
  const base = canonical();
  const second = { ...base.channels[0], channel_id: "channel_force_right" as typeof base.channels[0]["channel_id"] };
  const acquisition = canonical({
    channels: [base.channels[0], second],
    source_mappings: [base.source_mappings[0], { ...base.source_mappings[0], channel_id: second.channel_id, source_label: "force_right" }]
  });
  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: acquisition,
    metadata: [{ key: "synchronization", status: "known", value: "unsynchronized" }],
    plateIdentityByChannel: {
      [base.channels[0].channel_id]: { key: "plate_left", status: "known", value: "left" },
      [second.channel_id]: { key: "plate_right", status: "known", value: "right" }
    }
  });
  const evaluated = records(acquisition, result);
  assert.equal(result.resolution.physical_contract.state, "UNSUPPORTED");
  assert.equal(downstreamProcessingForRecords(evaluated), "REFUSED");
  assert.equal(missingMetadataForRecords(evaluated).some((item) => item.status === "UNSUPPORTED"), true);
});

test("measurement-agent evaluation returns exact IDs and prevents direct qualification mutation", () => {
  const acquisition = canonical();
  const evaluated = records(acquisition, resolveAcquisitionConfiguration({ canonicalAcquisition: acquisition }));
  const ids = recordIds(evaluated);
  const envelope = measurementAgentEnvelope(evaluated);
  assert.equal(ids.import_attempt_id, "imp_fixture_configuration");
  assert.equal(ids.source_artifact_id, acquisition.source_artifact_id);
  assert.equal(ids.source_observation_id, acquisition.source_observation_id);
  assert.equal(ids.canonical_acquisition_id, acquisition.canonical_acquisition_id);
  assert.equal(envelope.provenance.configuration_resolution?.record_id, ids.configuration_resolution_id);
  assert.equal(envelope.human_authority.qualification_mutation, "NOT_PERFORMED");
  assert.equal(envelope.llm_boundary.raw_source_bytes_exposed, false);
  assert.equal(envelope.llm_boundary.raw_signal_exposed, false);
  assert.equal(uiRecordPath({ records: evaluated, recordType: "configuration_contract", recordId: ids.configuration_contract_id as string }), "/imports/imp_fixture_configuration#configuration");
  assert.throws(() => uiRecordPath({ records: evaluated, recordType: "configuration_contract", recordId: "cfg_wrong" }), /exact ID/u);
});
