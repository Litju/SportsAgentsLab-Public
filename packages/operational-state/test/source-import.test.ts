import { test } from "node:test";
import assert from "node:assert/strict";
import type { Timestamp } from "@mef/generated-ts";
import {
  assertSourceImportCreateInput,
  assertSourceImportIdentity,
  assertSourceImportTransition,
  sourceArtifactIdForImportAttempt,
  sourceImportFailureIsRetryable,
  sourceImportIsTerminal,
  sourceImportTransitionAllowed,
  SourceImportError,
  type CreateSourceImportInput,
  type SourceImportIdentityInput
} from "../src/index.ts";

const timestamp = "2026-08-14T23:00:00.000Z" as Timestamp;

function createInput(overrides: Partial<CreateSourceImportInput> = {}): CreateSourceImportInput {
  return {
    importAttemptId: "imp_source_import_test",
    organizationId: "org_test",
    workspaceId: "ws_test",
    principalId: "user_test",
    originalFilename: "jump.csv",
    declaredContentType: "text/csv",
    declaredSizeBytes: 12,
    createdAt: timestamp,
    ...overrides
  };
}

test("ML-102 lifecycle allows upload, retry, terminal, and adapter-boundary paths only", () => {
  assert.equal(sourceImportTransitionAllowed("CREATED", "UPLOAD_AUTHORIZED"), true);
  assert.equal(sourceImportTransitionAllowed("UPLOADED", "IDENTIFYING"), true);
  assert.equal(sourceImportTransitionAllowed("FINALIZATION_FAILED", "IDENTIFYING"), true);
  assert.equal(sourceImportTransitionAllowed("READY_FOR_ADAPTER", "IDENTIFYING"), false);
  assert.equal(sourceImportIsTerminal("READY_FOR_ADAPTER"), true);
  assert.equal(sourceImportIsTerminal("IDENTIFYING"), false);
  assert.equal(sourceImportFailureIsRetryable("FINALIZATION_FAILED"), true);
  assert.equal(sourceImportFailureIsRetryable("MALFORMED"), false);
  assert.throws(
    () => assertSourceImportTransition("CREATED", "STORED"),
    (error: unknown) => error instanceof SourceImportError && error.sourceImportCode === "INVALID_TRANSITION" && error.status === 409
  );
});

test("source identity and upload metadata are bounded and content-addressed", () => {
  assert.equal(sourceArtifactIdForImportAttempt("imp_source_import_test"), "src_source_import_test");
  assert.doesNotThrow(() => assertSourceImportCreateInput(createInput()));
  assert.throws(() => assertSourceImportCreateInput(createInput({ originalFilename: "bad\nname.csv" })), SourceImportError);
  assert.throws(() => assertSourceImportCreateInput(createInput({ athleteId: "athlete_1" })), SourceImportError);

  const identity: SourceImportIdentityInput = {
    importAttemptId: "imp_source_import_test",
    actualSizeBytes: 12,
    contentHash: "a".repeat(64),
    storageKey: `originals/sha256/${"a".repeat(64)}`,
    sourceArtifactId: "src_source_import_test",
    auditEventId: "aud_source_import_test_source",
    identityCompletedAt: timestamp,
    occurredAt: timestamp
  };
  assert.doesNotThrow(() => assertSourceImportIdentity(identity));
  assert.throws(() => assertSourceImportIdentity({ ...identity, storageKey: "staging/not-content-addressed" }), SourceImportError);
});
