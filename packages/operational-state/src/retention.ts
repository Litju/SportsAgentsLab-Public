import type { SourceArtifactId, Timestamp } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";
import { isCanonicalObjectReference, isCanonicalTimestamp } from "./references.ts";

export type RetentionStatus = "UNRESOLVED" | "RETAIN" | "HOLD" | "ELIGIBLE";
const RETENTION_STATUSES = new Set<RetentionStatus>(["UNRESOLVED", "RETAIN", "HOLD", "ELIGIBLE"]);

export interface RetentionAssessment {
  readonly source_artifact_id: SourceArtifactId;
  readonly status: RetentionStatus;
  readonly policy_reference?: string;
  readonly hold_state: boolean;
  readonly assessed_at?: Timestamp;
  /** Storage concurrency token; not part of the ML-95 domain contract. */
  readonly revision?: number;
}

export interface RetentionPolicyHook {
  assess(sourceArtifactId: SourceArtifactId): Promise<RetentionAssessment>;
}

export interface ReconciliationHook {
  inspectUnreferencedContent(contentHash: string, objectKey: string): Promise<RetentionAssessment>;
}

export function assertRetentionAssessment(value: RetentionAssessment): void {
  if (
    typeof value !== "object" ||
    value === null ||
    !isCanonicalObjectReference({ entity_type: "SourceArtifact", object_id: value.source_artifact_id }) ||
    !RETENTION_STATUSES.has(value.status) ||
    typeof value.hold_state !== "boolean" ||
    (value.policy_reference !== undefined && (typeof value.policy_reference !== "string" || value.policy_reference.length < 1 || value.policy_reference.length > 512)) ||
    (value.assessed_at !== undefined && !isCanonicalTimestamp(value.assessed_at)) ||
    (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 1))
  ) {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
  if (value.status === "HOLD" && !value.hold_state) {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
  if (value.status !== "HOLD" && value.hold_state) {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
  if (value.status !== "UNRESOLVED" && (value.policy_reference === undefined || value.policy_reference.length === 0)) {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
  if (value.status === "UNRESOLVED" && value.hold_state) {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
}

export function requireResolvedRetention(value: RetentionAssessment): asserts value is RetentionAssessment & {
  readonly status: Exclude<RetentionStatus, "UNRESOLVED">;
} {
  assertRetentionAssessment(value);
  if (value.status === "UNRESOLVED") {
    throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
  }
}
