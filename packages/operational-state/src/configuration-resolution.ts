import type {
  AcquisitionConfigurationResolution,
  CanonicalAcquisitionId,
  ConfigurationContract,
  Sha256,
  SourceArtifactId,
  SourceObservationId
} from "@mef/generated-ts";
import { canonicalJson, validateEntity } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

export interface ConfigurationResolutionDocument {
  readonly resolution: AcquisitionConfigurationResolution;
  readonly contract: ConfigurationContract;
}

export interface ConfigurationResolutionRecord {
  readonly resolutionSha256: Sha256;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly importAttemptId: string;
  readonly sourceArtifactId: SourceArtifactId;
  readonly sourceObservationId: SourceObservationId;
  readonly canonicalAcquisitionId: CanonicalAcquisitionId;
  readonly canonicalIdentitySha256: Sha256;
  readonly resolverVersion: string;
  readonly authorityVersion: string;
  readonly configurationState: AcquisitionConfigurationResolution["configuration_state"];
  readonly physicalContract: AcquisitionConfigurationResolution["physical_contract"]["contract"];
  readonly resolutionDocument: ConfigurationResolutionDocument;
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

export function assertConfigurationResolutionRecord(record: ConfigurationResolutionRecord): void {
  if (
    !SHA256.test(record.resolutionSha256)
    || !record.organizationId
    || !record.workspaceId
    || !/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.importAttemptId)
    || !/^src_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.sourceArtifactId)
    || !/^sob_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.sourceObservationId)
    || !/^acq_[a-z0-9][a-z0-9_-]{0,127}$/u.test(record.canonicalAcquisitionId)
    || !SHA256.test(record.canonicalIdentitySha256)
    || !SEMVER.test(record.resolverVersion)
    || !record.authorityVersion
    || !record.createdAt
  ) throw new OperationalStateError("CONTRACT_INVALID");

  const document = record.resolutionDocument;
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new OperationalStateError("CONTRACT_INVALID");
  if (
    !document.resolution
    || typeof document.resolution !== "object"
    || Array.isArray(document.resolution)
    || !document.contract
    || typeof document.contract !== "object"
    || Array.isArray(document.contract)
  ) throw new OperationalStateError("CONTRACT_INVALID");
  const resolution = document.resolution;
  if (
    resolution.resolution_sha256 !== record.resolutionSha256
    || resolution.source_artifact_id !== record.sourceArtifactId
    || resolution.source_observation_id !== record.sourceObservationId
    || resolution.canonical_acquisition_id !== record.canonicalAcquisitionId
    || resolution.canonical_identity_sha256 !== record.canonicalIdentitySha256
    || resolution.resolver_version !== record.resolverVersion
    || resolution.authority_version !== record.authorityVersion
    || resolution.configuration_state !== record.configurationState
    || resolution.physical_contract.contract !== record.physicalContract
    || document.contract.canonical_acquisition_id !== record.canonicalAcquisitionId
    || document.contract.configuration_state !== record.configurationState
    || document.contract.resolution === undefined
    || canonicalJson(document.contract.resolution) !== canonicalJson(resolution)
  ) throw new OperationalStateError("CONTRACT_INVALID");

  const contractValidation = validateEntity(document.contract, "ConfigurationContract");
  if (!contractValidation.valid) throw new OperationalStateError("CONTRACT_INVALID");
  if (JSON.stringify(document).length > 2_000_000) throw new OperationalStateError("CONTRACT_INVALID");
  rejectRawPayload(document);
}

export function sameConfigurationResolution(
  left: ConfigurationResolutionRecord,
  right: ConfigurationResolutionRecord
): boolean {
  const comparable = (record: ConfigurationResolutionRecord) => ({
    ...record,
    createdAt: undefined,
    resolutionDocument: {
      resolution: record.resolutionDocument.resolution,
      contract: { ...record.resolutionDocument.contract, created_at: undefined }
    }
  });
  return canonicalJson(comparable(left)) === canonicalJson(comparable(right));
}
