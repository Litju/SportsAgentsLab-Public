import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { REFERENCE_ADAPTER, createDefaultBudget, createMemorySourceReader } from "@mef/ingestion-adk";
import { REFERENCE_MAPPING_MANIFEST, canonicalize } from "@mef/canonical-acquisition";
import { resolveAcquisitionConfiguration } from "@mef/acquisition-configuration";

const fixturePath = "packages/ingestion-adk/fixtures/valid-current.mef";
const createdAt = "2026-08-18T12:00:00Z";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function replay() {
  const bytes = new Uint8Array(await readFile(fixturePath));
  const sourceArtifactSha256 = sha256(bytes);
  const source = createMemorySourceReader({
    sourceArtifactId: "src_ml108_reference",
    bytes,
    contentSha256: sourceArtifactSha256
  });
  const budget = createDefaultBudget();
  const probe = await REFERENCE_ADAPTER.probe(source, { budget });
  const observation = await REFERENCE_ADAPTER.inspect(source, { budget: createDefaultBudget() });
  const canonical = await canonicalize({
    sourceArtifactId: "src_ml108_reference",
    sourceArtifactSha256,
    sourceObservationId: "sob_ml108_reference",
    sourceObservationSha256: observation.observationSha256,
    observation,
    records: REFERENCE_ADAPTER.read(source, { budget: createDefaultBudget() }),
    mappingManifest: REFERENCE_MAPPING_MANIFEST,
    createdAt
  });
  const configuration = resolveAcquisitionConfiguration({ canonicalAcquisition: canonical.acquisition });
  return {
    sourceArtifactSha256,
    sourceObservationSha256: observation.observationSha256,
    schemaFingerprint: observation.schemaFingerprint,
    probeStatus: probe.status,
    probeBytes: bytes.byteLength,
    recordsProcessed: canonical.report.record_count,
    canonicalArtifactSha256: canonical.signalHash,
    canonicalIdentitySha256: canonical.canonicalIdentityHash,
    canonicalBytes: canonical.signalBytes.byteLength,
    configurationResolutionSha256: configuration.resolution.resolution_sha256,
    configurationState: configuration.resolution.configuration_state,
    physicalContract: configuration.resolution.physical_contract.contract
  };
}

const first = await replay();
const second = await replay();
assert.deepEqual(second, first);
assert.equal(first.probeStatus, "exact_match");
assert.equal(first.configurationState, "RESOLVED_QUALIFIED");
assert.equal(first.physicalContract, "single.total_fz");
console.log(JSON.stringify({ ...first, deterministic: true }, null, 2));
