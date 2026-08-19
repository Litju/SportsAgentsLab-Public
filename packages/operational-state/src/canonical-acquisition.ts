import type {
  CanonicalAcquisition,
  CanonicalAcquisitionId,
  Sha256,
  SourceArtifactId,
  SourceObservationId
} from "@mef/generated-ts";
import { canonicalJson, validateEntity } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

export interface CanonicalAcquisitionRecord {
  readonly canonicalAcquisitionId: CanonicalAcquisitionId;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly importAttemptId: string;
  readonly sourceArtifactId: SourceArtifactId;
  readonly sourceObservationId: SourceObservationId;
  readonly canonicalizerVersion: string;
  readonly mappingManifestSha256: Sha256;
  readonly signalArtifactSha256: Sha256;
  readonly signalArtifactKey: string;
  readonly canonicalIdentitySha256: Sha256;
  readonly acquisition: CanonicalAcquisition;
  readonly createdAt: string;
}

const SHA256 = /^[0-9a-f]{64}$/u;
const SEMVER = /^\d+\.\d+\.\d+$/u;

function rejectRawPayload(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(raw|bytes|samples|records|signal|payload)$/iu.test(key)) throw new OperationalStateError("CONTRACT_INVALID");
    rejectRawPayload(child);
  }
}

export function assertCanonicalAcquisitionRecord(record: CanonicalAcquisitionRecord): void {
  if (!/^acq_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.canonicalAcquisitionId)
    || !record.organizationId
    || !record.workspaceId
    || !/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.importAttemptId)
    || !/^src_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.sourceArtifactId)
    || !/^sob_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.sourceObservationId)
    || !SEMVER.test(record.canonicalizerVersion)
    || !SHA256.test(record.mappingManifestSha256)
    || !SHA256.test(record.signalArtifactSha256)
    || !SHA256.test(record.canonicalIdentitySha256)
    || !record.signalArtifactKey.startsWith("canonical/sha256/")
    || !record.createdAt) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  const validation = validateEntity(record.acquisition, "CanonicalAcquisition");
  if (!validation.valid) throw new OperationalStateError("CONTRACT_INVALID");
  if (record.acquisition.canonical_acquisition_id !== record.canonicalAcquisitionId
    || record.acquisition.source_artifact_id !== record.sourceArtifactId
    || record.acquisition.source_observation_id !== record.sourceObservationId
    || record.acquisition.canonicalizer_version !== record.canonicalizerVersion
    || record.acquisition.mapping_manifest_sha256 !== record.mappingManifestSha256
    || record.acquisition.signal_artifact_sha256 !== record.signalArtifactSha256
    || record.acquisition.canonical_identity_sha256 !== record.canonicalIdentitySha256
    || record.acquisition.signal_artifact.content_hash !== record.signalArtifactSha256
    || record.acquisition.signal_artifact.storage_key !== record.signalArtifactKey) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (canonicalJson(record.acquisition).length > 2_000_000) throw new OperationalStateError("CONTRACT_INVALID");
  rejectRawPayload(record.acquisition);
}

export function sameCanonicalAcquisition(left: CanonicalAcquisitionRecord, right: CanonicalAcquisitionRecord): boolean {
  const comparable = (record: CanonicalAcquisitionRecord) => {
    const { createdAt: _createdAt, acquisition, ...identity } = record;
    const { created_at: _acquisitionCreatedAt, ...canonical } = acquisition;
    return { ...identity, acquisition: canonical };
  };
  return canonicalJson(comparable(left)) === canonicalJson(comparable(right));
}
