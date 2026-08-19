import type { SourceArtifactId } from "@mef/generated-ts";
import { canonicalJson } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

export type SourceObservationQualification = "reference" | "unqualified" | "qualified";

export interface SourceObservationRecord {
  readonly sourceObservationId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly sourceArtifactId: SourceArtifactId;
  readonly sourceContentSha256: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly adkApiVersion: string;
  readonly adapterQualification: SourceObservationQualification;
  readonly schemaFingerprint: string;
  readonly observationSha256: string;
  readonly observationDocument: Record<string, unknown>;
  readonly createdAt: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function rejectRawPayload(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(raw|bytes|samples|records|signal|payload)$/i.test(key)) {
      throw new OperationalStateError("CONTRACT_INVALID");
    }
    rejectRawPayload(child);
  }
}

export function assertSourceObservationRecord(record: SourceObservationRecord): void {
  if (!/^sob_[a-z0-9][a-z0-9_-]{0,127}$/.test(record.sourceObservationId)) throw new OperationalStateError("CONTRACT_INVALID");
  if (!record.organizationId || !record.workspaceId || !/^src_[a-z0-9][a-z0-9_-]{0,127}$/.test(record.sourceArtifactId)) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (!SHA256.test(record.sourceContentSha256) || !SHA256.test(record.schemaFingerprint) || !SHA256.test(record.observationSha256)) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (!record.adapterId || !SEMVER.test(record.adapterVersion) || !SEMVER.test(record.adkApiVersion)) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (!record.createdAt || !["reference", "unqualified", "qualified"].includes(record.adapterQualification)) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (!record.observationDocument || typeof record.observationDocument !== "object" || Array.isArray(record.observationDocument)) {
    throw new OperationalStateError("CONTRACT_INVALID");
  }
  if (JSON.stringify(record.observationDocument).length > 1_000_000) throw new OperationalStateError("CONTRACT_INVALID");
  const document = record.observationDocument;
  const execution = document.adapterExecution;
  if (
    document.sourceArtifactId !== record.sourceArtifactId ||
    document.sourceContentSha256 !== record.sourceContentSha256 ||
    document.schemaFingerprint !== record.schemaFingerprint ||
    document.observationSha256 !== record.observationSha256 ||
    !execution || typeof execution !== "object" || Array.isArray(execution) ||
    (execution as Record<string, unknown>).adapterId !== record.adapterId ||
    (execution as Record<string, unknown>).adapterVersion !== record.adapterVersion ||
    (execution as Record<string, unknown>).adkApiVersion !== record.adkApiVersion ||
    (execution as Record<string, unknown>).qualification !== record.adapterQualification
  ) throw new OperationalStateError("CONTRACT_INVALID");
  rejectRawPayload(document);
}

export function sourceObservationComparable(record: SourceObservationRecord): Record<string, unknown> {
  return {
    sourceObservationId: record.sourceObservationId,
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    sourceArtifactId: record.sourceArtifactId,
    sourceContentSha256: record.sourceContentSha256,
    adapterId: record.adapterId,
    adapterVersion: record.adapterVersion,
    adkApiVersion: record.adkApiVersion,
    adapterQualification: record.adapterQualification,
    schemaFingerprint: record.schemaFingerprint,
    observationSha256: record.observationSha256,
    observationDocument: record.observationDocument,
    createdAt: record.createdAt,
  };
}

export function sameSourceObservation(left: SourceObservationRecord, right: SourceObservationRecord): boolean {
  return canonicalJson(sourceObservationComparable(left)) === canonicalJson(sourceObservationComparable(right));
}
