import type { AuditEvent, ObjectReference } from "@mef/generated-ts";
import { validateEntity } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";
import { assertCanonicalObjectReference, isCanonicalObjectReference } from "./references.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertAuditEvent(value: unknown): asserts value is AuditEvent {
  const result = validateEntity(value, "AuditEvent");
  if (!result.valid || !isRecord(value)) {
    throw new OperationalStateError("AUDIT_APPEND_FAILED");
  }
  if (!isCanonicalObjectReference(value.object)) {
    throw new OperationalStateError("AUDIT_APPEND_FAILED");
  }
  if (value.prior_reference !== undefined) assertCanonicalObjectReference(value.prior_reference);
  if (value.new_reference !== undefined) assertCanonicalObjectReference(value.new_reference);
}

export interface ReplayedAuditEvent {
  readonly sequence: string;
  readonly event: AuditEvent;
}

export function assertReplayOrder(events: ReadonlyArray<ReplayedAuditEvent>): void {
  let previous: bigint | undefined;
  for (const item of events) {
    if (!/^\d+$/u.test(item.sequence)) throw new OperationalStateError("AUDIT_APPEND_FAILED");
    const sequence = BigInt(item.sequence);
    if (previous !== undefined && sequence <= previous) {
      throw new OperationalStateError("AUDIT_APPEND_FAILED");
    }
    previous = sequence;
    assertAuditEvent(item.event);
  }
}

export function objectReferenceForAudit(event: AuditEvent): ObjectReference {
  assertAuditEvent(event);
  return event.object;
}
