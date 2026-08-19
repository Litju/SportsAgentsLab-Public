import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateEntity } from "@mef/generated-ts";
import {
  REFERENCE_ADAPTER,
  createDefaultBudget,
  createMemorySourceReader,
  type ObservedRecordBatch,
  type SourceObservation,
  type SourceReader
} from "@mef/ingestion-adk";
import {
  REFERENCE_MAPPING_MANIFEST,
  canonicalJson,
  canonicalize
} from "../src/index.js";
import type { CanonicalMappingChannel, CanonicalMappingManifest } from "../src/index.js";

const fixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../../ingestion-adk/fixtures/${name}.mef`, import.meta.url)));

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function inputFor(
  bytes: Uint8Array,
  sourceArtifactId = "src_canonical-test",
  mappingManifest: CanonicalMappingManifest = REFERENCE_MAPPING_MANIFEST,
  recordsFor?: (source: SourceReader, observation: SourceObservation) => AsyncIterable<ObservedRecordBatch>
) {
  const sourceArtifactSha256 = hash(bytes);
  const source = createMemorySourceReader({ sourceArtifactId, bytes, contentSha256: sourceArtifactSha256 });
  const observation = await REFERENCE_ADAPTER.inspect(source, { budget: createDefaultBudget() });
  const result = await canonicalize({
    sourceArtifactId,
    sourceArtifactSha256,
    sourceObservationId: "sob_canonical-test",
    sourceObservationSha256: observation.observationSha256,
    observation,
    records: recordsFor ? recordsFor(source, observation) : REFERENCE_ADAPTER.read(source, { budget: createDefaultBudget() }),
    mappingManifest,
    createdAt: "2026-08-16T12:00:00Z"
  });
  return { result, observation };
}

function mappingWith(
  channelId: string,
  changes: Partial<CanonicalMappingChannel>,
  manifestChanges: Partial<CanonicalMappingManifest> = {}
): CanonicalMappingManifest {
  return {
    ...REFERENCE_MAPPING_MANIFEST,
    ...manifestChanges,
    channels: REFERENCE_MAPPING_MANIFEST.channels.map((channel) =>
      channel.channel_id === channelId ? { ...channel, ...changes } : channel
    )
  };
}

test("canonicalization is deterministic, explicit, and does not invent a sample rate", async () => {
  const bytes = await fixture("valid-current");
  const first = await inputFor(bytes);
  const second = await inputFor(bytes);
  assert.equal(first.result.status, "COMPLETE");
  assert.equal(first.result.acquisition.quality_state, "QUALIFIED");
  assert.equal(first.result.acquisition.integrity_report.status, "QUALIFIED");
  assert.equal(first.result.acquisition.timebase.sample_rate_hz, undefined);
  assert.equal(first.result.canonicalIdentityHash, second.result.canonicalIdentityHash);
  assert.equal(first.result.signalHash, second.result.signalHash);
  assert.equal(canonicalJson(first.result.acquisition), canonicalJson(second.result.acquisition));
  assert.equal(validateEntity(first.result.acquisition, "CanonicalAcquisition").valid, true);
  assert.equal(first.result.report.checks.every((check) => check.status === "PASS" || check.status === "NOT_EVALUATED"), true);
  assert.match(new TextDecoder().decode(first.result.signalBytes), /"channel_force_z":100/);
});

test("irregular intervals are reported and never repaired", async () => {
  const result = await inputFor(await fixture("canonical-irregular-interval"), "src_canonical-irregular");
  assert.equal(result.result.acquisition.quality_state, "REVIEW_REQUIRED");
  assert.equal(result.result.report.findings.some((finding) => finding.code === "IRREGULAR_INTERVAL"), true);
  assert.equal(result.result.report.checks.find((check) => check.check_id === "INTERVAL_REGULARITY")?.status, "FAIL");
  assert.equal(result.result.acquisition.timebase.state, "UNRESOLVED");
});

test("unresolved source declarations fail closed without synthesizing a channel", async () => {
  const source = new TextDecoder().decode(await fixture("valid-current")).replace("field.force_z.unit=N", "field.force_z.unit=unknown");
  const result = await inputFor(new TextEncoder().encode(source), "src_canonical-unknown-unit");
  assert.equal(result.result.acquisition.quality_state, "REVIEW_REQUIRED");
  assert.equal(result.result.acquisition.channels.some((channel) => channel.channel_id === "channel_force_z"), false);
  assert.equal(result.result.acquisition.source_mappings.find((mapping) => mapping.channel_id === "channel_force_z")?.mapping_state, "UNRESOLVED");
  assert.equal(result.result.report.findings.some((finding) => finding.code === "INCOMPATIBLE_UNIT"), true);
});

test("missing, extra, and non-finite controls remain explicit", async () => {
  const missingManifest = {
    ...REFERENCE_MAPPING_MANIFEST,
    channels: [...REFERENCE_MAPPING_MANIFEST.channels, {
      source_field: "missing_channel",
      channel_id: "channel_missing_channel",
      source_quantity: "force",
      canonical_quantity: "force",
      source_unit: "N",
      canonical_unit: "N",
      source_axis: "z",
      canonical_axis: "vertical",
      sign: 1 as const,
      scale: 1,
      offset: 0,
      transformation_kind: "IDENTITY" as const
    }]
  };
  const missing = await inputFor(await fixture("valid-current"), "src_canonical-missing", missingManifest);
  const extra = await inputFor(await fixture("canonical-extra-unknown"), "src_canonical-extra");
  const nonfinite = await inputFor(await fixture("canonical-nonfinite"), "src_canonical-nonfinite");
  assert.equal(missing.result.report.findings.some((finding) => finding.code === "MISSING_MAPPED_CHANNEL"), true);
  assert.equal(extra.result.report.findings.some((finding) => finding.code === "EXTRA_UNKNOWN_CHANNEL"), true);
  assert.equal(nonfinite.result.report.findings.some((finding) => finding.code === "NONFINITE_VALUE"), true);
  assert.equal(nonfinite.result.acquisition.integrity_report.status, "REVIEW_REQUIRED");
});

test("unit conversion and sign mappings use only explicit registry transformations", async () => {
  const milliseconds = await inputFor(
    await fixture("canonical-ms-time"),
    "src_canonical-ms",
    mappingWith("channel_time", { source_unit: "ms", scale: 0.001, transformation_kind: "UNIT_CONVERSION" })
  );
  const kilonewtons = await inputFor(
    await fixture("canonical-kn-force"),
    "src_canonical-kn",
    mappingWith("channel_force_z", { source_unit: "kN", scale: 1000, transformation_kind: "UNIT_CONVERSION" })
  );
  const inverted = await inputFor(
    await fixture("valid-current"),
    "src_canonical-sign",
    mappingWith("channel_force_z", { sign: -1, transformation_kind: "SIGN_FLIP" })
  );
  assert.match(new TextDecoder().decode(milliseconds.result.signalBytes), /"channel_time":0\.01/);
  assert.match(new TextDecoder().decode(kilonewtons.result.signalBytes), /"channel_force_z":100/);
  assert.match(new TextDecoder().decode(inverted.result.signalBytes), /"channel_force_z":-100/);
  assert.equal(inverted.result.acquisition.source_mappings.find((mapping) => mapping.channel_id === "channel_force_z")?.transformation.kind, "SIGN_FLIP");
});

test("timestamp, declaration, range, count, and index integrity findings fail closed", async () => {
  const duplicate = await inputFor(await fixture("canonical-duplicate-time"), "src_canonical-duplicate");
  const nonmonotonic = await inputFor(await fixture("canonical-nonmonotonic-time"), "src_canonical-nonmonotonic");
  const unresolvedUnit = await inputFor(await fixture("canonical-unresolved-unit"), "src_canonical-unresolved-unit");
  const conflictingUnit = await inputFor(await fixture("canonical-conflicting-unit"), "src_canonical-conflicting-unit");
  const unknownAxis = await inputFor(await fixture("canonical-unknown-axis"), "src_canonical-unknown-axis");
  const conflictingAxis = await inputFor(await fixture("canonical-conflicting-axis"), "src_canonical-conflicting-axis");
  const missingValue = await inputFor(await fixture("canonical-missing-value"), "src_canonical-missing-value");
  const infinity = await inputFor(await fixture("canonical-infinity"), "src_canonical-infinity");
  const range = await inputFor(
    await fixture("valid-current"),
    "src_canonical-range",
    mappingWith("channel_force_z", { range_min: 0, range_max: 101 })
  );
  const count = await inputFor(
    await fixture("valid-current"),
    "src_canonical-count",
    mappingWith("channel_time", {}, { expected_record_count: 3 })
  );
  assert.equal(duplicate.result.report.findings.some((finding) => finding.code === "DUPLICATE_TIMESTAMP"), true);
  assert.equal(nonmonotonic.result.report.findings.some((finding) => finding.code === "NONMONOTONIC_TIMESTAMP"), true);
  assert.equal(unresolvedUnit.result.report.findings.some((finding) => finding.code === "UNRESOLVED_UNIT"), true);
  assert.equal(conflictingUnit.result.report.findings.some((finding) => finding.code === "CONFLICTING_UNIT"), true);
  assert.equal(unknownAxis.result.report.findings.some((finding) => finding.code === "UNRESOLVED_AXIS"), true);
  assert.equal(conflictingAxis.result.report.findings.some((finding) => finding.code === "CONFLICTING_AXIS"), true);
  assert.equal(missingValue.result.report.findings.some((finding) => finding.code === "MISSING_VALUE"), true);
  assert.equal(infinity.result.report.findings.some((finding) => finding.code === "NONFINITE_VALUE"), true);
  assert.equal(range.result.report.findings.some((finding) => finding.code === "RANGE_VIOLATION"), true);
  assert.equal(count.result.report.findings.some((finding) => finding.code === "COUNT_MISMATCH"), true);

  const missingIndex = await inputFor(await fixture("valid-current"), "src_canonical-missing-index", REFERENCE_MAPPING_MANIFEST, (source, observation) => (async function* () {
    for await (const batch of REFERENCE_ADAPTER.read(source, { budget: createDefaultBudget() })) {
      yield {
        ...batch,
        startRecordIndex: 0n,
        records: batch.records.map((record, index) => ({ ...record, sourceRecordIndex: BigInt(index * 2) }))
      };
    }
  })());
  assert.equal(missingIndex.result.report.findings.some((finding) => finding.code === "MISSING_INDEXED_SAMPLE"), true);
});

test("large input remains streaming and preserves deterministic output", async () => {
  const base = await fixture("valid-current");
  const result = await inputFor(base, "src_canonical-large", REFERENCE_MAPPING_MANIFEST, (source, observation) => (async function* () {
    const rows = Array.from({ length: 256 }, (_, index) => ({
      sourceRecordIndex: BigInt(index),
      values: { time: (index / 100).toFixed(2), force_z: String(100 + index) }
    }));
    yield { schemaFingerprint: observation.schemaFingerprint, startRecordIndex: 0n, records: rows.slice(0, 128) };
    yield { schemaFingerprint: observation.schemaFingerprint, startRecordIndex: 128n, records: rows.slice(128) };
    void source;
  })());
  assert.equal(result.result.report.record_count, 256);
  assert.equal(result.result.report.findings.some((finding) => finding.severity === "ERROR"), false);
  assert.equal(result.result.acquisition.quality_state, "QUALIFIED");
});
