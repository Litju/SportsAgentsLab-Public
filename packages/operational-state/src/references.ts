import type { EntityType, ObjectReference, Timestamp } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

const ENTITY_ID_PATTERNS: Readonly<Record<EntityType, RegExp>> = {
  SourceArtifact: /^src_[a-z0-9][a-z0-9_-]{0,127}$/u,
  ImportAttempt: /^imp_[a-z0-9][a-z0-9_-]{0,127}$/u,
  CanonicalAcquisition: /^acq_[a-z0-9][a-z0-9_-]{0,127}$/u,
  ConfigurationContract: /^cfg_[a-z0-9][a-z0-9_-]{0,127}$/u,
  ProtocolContract: /^pro_[a-z0-9][a-z0-9_-]{0,127}$/u,
  Trial: /^trl_[a-z0-9][a-z0-9_-]{0,127}$/u,
  Session: /^ses_[a-z0-9][a-z0-9_-]{0,127}$/u,
  MetricObservation: /^met_[a-z0-9][a-z0-9_-]{0,127}$/u,
  ReferenceEpoch: /^epoch_[a-z0-9][a-z0-9_-]{0,127}$/u,
  InferenceResult: /^inf_[a-z0-9][a-z0-9_-]{0,127}$/u,
  EvidenceManifest: /^evm_[a-z0-9][a-z0-9_-]{0,127}$/u,
  PractitionerDecision: /^dec_[a-z0-9][a-z0-9_-]{0,127}$/u,
  AgentContext: /^ctx_[a-z0-9][a-z0-9_-]{0,127}$/u,
  AuditEvent: /^aud_[a-z0-9][a-z0-9_-]{0,127}$/u,
  Command: /^cmd_[a-z0-9][a-z0-9_-]{0,127}$/u,
  Job: /^job_[a-z0-9][a-z0-9_-]{0,127}$/u,
  JobAttempt: /^jatt_[a-z0-9][a-z0-9_-]{0,127}$/u,
  ProgressEvent: /^pev_[a-z0-9][a-z0-9_-]{0,127}$/u
};

const ENTITY_TYPES = new Set(Object.keys(ENTITY_ID_PATTERNS));
const TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  return actual.length === expected.size && actual.every((key) => expected.has(key));
}

export function isCanonicalEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && ENTITY_TYPES.has(value);
}

export function isCanonicalObjectReference(value: unknown): value is ObjectReference {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["entity_type", "object_id"]) ||
    !isCanonicalEntityType(value.entity_type) ||
    typeof value.object_id !== "string"
  ) {
    return false;
  }
  return ENTITY_ID_PATTERNS[value.entity_type].test(value.object_id);
}

export function assertCanonicalObjectReference(value: unknown): asserts value is ObjectReference {
  if (!isCanonicalObjectReference(value)) {
    throw new OperationalStateError("PROVENANCE_INVALID");
  }
}

export interface ProvenanceReference {
  readonly from: ObjectReference;
  readonly to: ObjectReference;
  readonly relation: string;
  readonly created_at: Timestamp;
}

export function isCanonicalTimestamp(value: unknown): value is Timestamp {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const [yearText, monthText, dayText, hourText, minuteText, secondText] = [
    value.slice(0, 4),
    value.slice(5, 7),
    value.slice(8, 10),
    value.slice(11, 13),
    value.slice(14, 16),
    value.slice(17, 19)
  ];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return year >= 1
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

export function assertProvenanceReference(value: unknown): asserts value is ProvenanceReference {
  if (!isRecord(value) || !hasExactKeys(value, ["from", "to", "relation", "created_at"])) {
    throw new OperationalStateError("PROVENANCE_INVALID");
  }
  assertCanonicalObjectReference(value.from);
  assertCanonicalObjectReference(value.to);
  if (
    typeof value.relation !== "string" ||
    !/^[A-Z][A-Z0-9_:-]{1,127}$/u.test(value.relation) ||
    !isCanonicalTimestamp(value.created_at)
  ) {
    throw new OperationalStateError("PROVENANCE_INVALID");
  }
}

export function entityIdPattern(entityType: EntityType): RegExp {
  return ENTITY_ID_PATTERNS[entityType];
}

export function canonicalEntityTypes(): ReadonlyArray<EntityType> {
  return Object.keys(ENTITY_ID_PATTERNS) as EntityType[];
}
