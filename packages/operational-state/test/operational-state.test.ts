import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, validateEntity } from "@mef/generated-ts";
import type {
  Actor,
  AuditEvent,
  ImportAttempt,
  ImportAttemptId,
  SemanticDeclaration,
  SourceArtifact,
  SourceArtifactId,
  Timestamp
} from "@mef/generated-ts";
import {
  assertAuditEvent,
  assertProvenanceReference,
  assertReplayOrder,
  assertRetentionAssessment,
  applyMigrations,
  contentAddressedKey,
  migrationFromText,
  OperationalStateError,
  OperationalStateService,
  requireResolvedRetention,
  sha256Hex,
  type ImmutableObjectInspection,
  type ImmutableObjectStore,
  type ImmutablePutResult,
  type OperationalDatabase,
  type OperationalRegistrationResult,
  type ProvenanceReference,
  type ReplayedAuditEvent,
  type RegisterOperationalRecords,
  type RetentionAssessment,
  type SourceObservationRecord,
  type SqlPool,
  withTransaction
} from "../src/index.ts";

const FIXTURE_BYTES = new TextEncoder().encode("MEF-ML96-synthetic-original-v1\n\0");
const FIXTURE_HASH = "a1e854a4fd5a69a933dfbbccc6208d1fbd59fd1bf8d78b7302988993c2d72062";
const FIXTURE_TIMESTAMP = "2026-08-10T12:00:00.000Z" as Timestamp;

const declaration: SemanticDeclaration = {
  state: "UNKNOWN",
  reason: "Synthetic fixture does not declare upstream semantics.",
  evidence_references: []
};

const actor: Actor = {
  actor_type: "SYSTEM",
  actor_id: "system_ml96",
  role: "operational-import"
};

function importInput(
  suffix: string,
  attemptNumber: number,
  bytes: Uint8Array = FIXTURE_BYTES,
  sourceArtifactId: SourceArtifactId = "src_fixture_source" as SourceArtifactId
) {
  return {
    bytes,
    mediaType: "application/octet-stream",
    originalFilename: `fixture-${suffix}.bin`,
    sourceArtifactId,
    sourceDeclaration: declaration,
    importAttemptId: `imp_${suffix}` as ImportAttemptId,
    attemptNumber,
    attemptedAt: FIXTURE_TIMESTAMP,
    createdAt: FIXTURE_TIMESTAMP,
    ingestedAt: FIXTURE_TIMESTAMP,
    auditEventId: `aud_${suffix}` as AuditEvent["audit_event_id"],
    occurredAt: FIXTURE_TIMESTAMP,
    actor,
    authorityType: "SYSTEM" as const,
    reason: "Synthetic ML-96 fixture import."
  };
}

class UnitObjectStore implements ImmutableObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  failNextWrite = false;
  rawWriteFailure?: Error;
  spoofNextResult = false;

  async putImmutable(input: { contentHash: SourceArtifact["content_hash"]; bytes: Uint8Array; mediaType: string }): Promise<ImmutablePutResult> {
    if (this.rawWriteFailure) {
      const error = this.rawWriteFailure;
      this.rawWriteFailure = undefined;
      throw error;
    }
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new OperationalStateError("OBJECT_WRITE_FAILED");
    }
    const key = contentAddressedKey(input.contentHash);
    const existing = this.objects.get(input.contentHash);
    if (existing) return { contentHash: input.contentHash, key, byteSize: existing.byteLength, created: false };
    assert.equal(sha256Hex(input.bytes), input.contentHash);
    this.objects.set(input.contentHash, new Uint8Array(input.bytes));
    if (this.spoofNextResult) {
      this.spoofNextResult = false;
      return { contentHash: input.contentHash, key, byteSize: input.bytes.byteLength + 1, created: true };
    }
    return { contentHash: input.contentHash, key, byteSize: input.bytes.byteLength, created: true };
  }

  async readImmutable(contentHash: SourceArtifact["content_hash"]): Promise<Uint8Array> {
    const bytes = this.objects.get(contentHash);
    if (!bytes) throw new OperationalStateError("OBJECT_READ_FAILED");
    return new Uint8Array(bytes);
  }

  async inspectImmutable(contentHash: SourceArtifact["content_hash"]): Promise<ImmutableObjectInspection> {
    const bytes = this.objects.get(contentHash);
    return {
      contentHash,
      key: contentAddressedKey(contentHash),
      exists: bytes !== undefined,
      byteSize: bytes?.byteLength,
      mediaType: "application/octet-stream",
      metadata: { sha256: contentHash }
    };
  }

  async existsImmutable(contentHash: SourceArtifact["content_hash"]): Promise<boolean> {
    return this.objects.has(contentHash);
  }
}

class UnitDatabase implements OperationalDatabase {
  readonly artifacts = new Map<string, SourceArtifact>();
  readonly attempts = new Map<string, ImportAttempt>();
  readonly events: ReplayedAuditEvent[] = [];
  readonly provenance: ProvenanceReference[] = [];
  readonly retention = new Map<string, RetentionAssessment>();
  readonly observations = new Map<string, SourceObservationRecord>();
  failNextRegister?: OperationalStateError;

  async registerRecords(input: RegisterOperationalRecords): Promise<OperationalRegistrationResult> {
    if (this.failNextRegister) {
      const error = this.failNextRegister;
      this.failNextRegister = undefined;
      throw error;
    }
    const existingSource = this.artifacts.get(input.sourceArtifact.source_artifact_id);
    if (existingSource && canonicalJson(existingSource) !== canonicalJson(input.sourceArtifact)) {
      throw new OperationalStateError("SOURCE_ARTIFACT_IMMUTABLE_CONFLICT");
    }
    const source = existingSource ?? input.sourceArtifact;
    this.artifacts.set(source.source_artifact_id, source);
    this.attempts.set(input.importAttempt.import_attempt_id, input.importAttempt);
    const auditEvents: ReplayedAuditEvent[] = [];
    for (const event of input.auditEvents) auditEvents.push(await this.appendAuditEvent(event));
    for (const reference of input.provenanceReferences) {
      assertProvenanceReference(reference);
      if (!this.provenance.some((item) =>
        item.from.entity_type === reference.from.entity_type &&
        item.from.object_id === reference.from.object_id &&
        item.to.entity_type === reference.to.entity_type &&
        item.to.object_id === reference.to.object_id &&
        item.relation === reference.relation
      )) this.provenance.push(reference);
    }
    this.retention.set(input.sourceArtifact.source_artifact_id, input.retention ?? {
      source_artifact_id: input.sourceArtifact.source_artifact_id,
      status: "UNRESOLVED",
      hold_state: false,
      revision: 1
    });
    return { sourceArtifact: source, importAttempt: input.importAttempt, auditEvents };
  }

  async appendAuditEvent(event: AuditEvent): Promise<ReplayedAuditEvent> {
    assertAuditEvent(event);
    const existing = this.events.find((item) => item.event.audit_event_id === event.audit_event_id);
    if (existing) return existing;
    const stored = { sequence: String(this.events.length + 1), event };
    this.events.push(stored);
    return stored;
  }

  async replayAuditChronology(): Promise<ReadonlyArray<ReplayedAuditEvent>> {
    return [...this.events];
  }

  async listProvenanceReferences(reference?: { entity_type: string; object_id: string }): Promise<ReadonlyArray<ProvenanceReference>> {
    if (!reference) return [...this.provenance];
    return this.provenance.filter((item) =>
      (item.from.entity_type === reference.entity_type && item.from.object_id === reference.object_id) ||
      (item.to.entity_type === reference.entity_type && item.to.object_id === reference.object_id)
    );
  }

  async findSourceArtifact(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<SourceArtifact | undefined> {
    return this.artifacts.get(sourceArtifactId);
  }

  async insertOrGetSourceObservation(record: SourceObservationRecord): Promise<SourceObservationRecord> {
    const existing = this.observations.get(record.sourceObservationId);
    if (existing && canonicalJson(existing) !== canonicalJson(record)) throw new OperationalStateError("CONTRACT_INVALID");
    this.observations.set(record.sourceObservationId, existing ?? record);
    return existing ?? record;
  }

  async findSourceObservation(sourceObservationId: string): Promise<SourceObservationRecord | undefined> {
    return this.observations.get(sourceObservationId);
  }

  async findImportAttempts(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<ReadonlyArray<ImportAttempt>> {
    return [...this.attempts.values()].filter((attempt) => attempt.source_artifact_id === sourceArtifactId);
  }

  async getRetentionAssessment(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<RetentionAssessment | undefined> {
    return this.retention.get(sourceArtifactId);
  }

  async setRetentionAssessment(assessment: RetentionAssessment): Promise<void> {
    assertRetentionAssessment(assessment);
    if (!this.artifacts.has(assessment.source_artifact_id)) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    const existing = this.retention.get(assessment.source_artifact_id);
    if (assessment.revision === undefined || existing?.revision !== assessment.revision) {
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }
    this.retention.set(assessment.source_artifact_id, { ...assessment, revision: assessment.revision + 1 });
  }
}

function expectOperationalCode(code: OperationalStateError["code"]) {
  return (error: unknown): boolean => error instanceof OperationalStateError && error.code === code;
}

test("hashing is fixed, content-addressed, and byte-preserving", () => {
  assert.equal(sha256Hex(FIXTURE_BYTES), FIXTURE_HASH);
  const contentHash = sha256Hex(FIXTURE_BYTES);
  assert.equal(contentHash, FIXTURE_HASH);
  assert.equal(contentAddressedKey(contentHash), `originals/sha256/${FIXTURE_HASH}`);
});
test("ImportAttempt states are immutable classifications and expose no Job lifecycle surface", () => {
  const states: ReadonlyArray<ImportAttempt["attempt_state"]> = [
    "RECEIVED",
    "VALIDATING",
    "ACCEPTED",
    "REJECTED",
    "UNSUPPORTED",
    "FAILED"
  ];
  const baseAttempt: ImportAttempt = {
    entity_type: "ImportAttempt",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/import-attempt.schema.json",
    schema_version: "1.0.0",
    import_attempt_id: "imp_immutable_state_fixture" as ImportAttemptId,
    record_version: 1,
    source_artifact_id: "src_fixture_source" as SourceArtifactId,
    attempt_number: 1,
    attempted_at: FIXTURE_TIMESTAMP,
    attempt_state: "RECEIVED",
    errors: []
  };
  for (const attemptState of states) {
    const validation = validateEntity({ ...baseAttempt, attempt_state: attemptState }, "ImportAttempt");
    assert.equal(validation.valid, true, attemptState);
  }

  const database = new UnitDatabase();
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(database));
  assert.equal(surface.includes("findImportAttempts"), true);
  assert.equal(surface.includes("updateImportAttempt"), false);
  assert.equal(surface.includes("transitionImportAttempt"), false);
  assert.equal(surface.includes("createJob"), false);
  assert.equal(surface.includes("updateJob"), false);
});

test("duplicate bytes share one content identity but preserve distinct import attempts", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  const firstInput = importInput("first", 1);
  const first = await service.importOriginal(firstInput);
  const second = await service.importOriginal({ ...importInput("second", 2), originalFilename: firstInput.originalFilename });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.sourceArtifact.source_artifact_id, "src_fixture_source");
  assert.notEqual(first.sourceArtifact.source_artifact_id, `src_${FIXTURE_HASH}`);
  assert.equal(first.sourceArtifact.source_artifact_id, second.sourceArtifact.source_artifact_id);
  assert.equal(first.contentObjectCreated, true);
  assert.equal(second.contentObjectCreated, false);
  assert.equal(database.artifacts.size, 1);
  assert.equal(database.attempts.size, 2);
  assert.deepEqual(await service.readOriginal(first.sourceArtifact.source_artifact_id), FIXTURE_BYTES);
});

test("contract-invalid metadata is rejected before immutable object persistence", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  await assert.rejects(
    service.importOriginal({ ...importInput("invalid", 1), originalFilename: "" }),
    expectOperationalCode("CONTRACT_INVALID")
  );
  assert.equal(objectStore.objects.size, 0);
  assert.equal(database.artifacts.size, 0);
});

test("same source identity cannot silently change immutable metadata", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  await service.importOriginal(importInput("immutable-first", 1));
  await assert.rejects(
    service.importOriginal({ ...importInput("immutable-second", 2), originalFilename: "changed-bytes-metadata.bin" }),
    expectOperationalCode("SOURCE_ARTIFACT_IMMUTABLE_CONFLICT")
  );
  assert.equal(database.attempts.size, 1);
});

test("duplicate bytes may use a new source identity while sharing one immutable object", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  const first = await service.importOriginal(importInput("source-one", 1, FIXTURE_BYTES, "src_source_one" as SourceArtifactId));
  const second = await service.importOriginal(importInput("source-two", 1, FIXTURE_BYTES, "src_source_two" as SourceArtifactId));
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.contentObjectCreated, true);
  assert.equal(second.contentObjectCreated, false);
  assert.equal(database.artifacts.size, 2);
  assert.equal(database.attempts.size, 2);
});

test("different bytes receive different immutable content identities", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  const first = await service.importOriginal(importInput("alpha", 1));
  const second = await service.importOriginal(importInput("beta", 1, new TextEncoder().encode("different synthetic bytes"), "src_beta" as SourceArtifactId));
  assert.notEqual(first.contentHash, second.contentHash);
  assert.equal(database.artifacts.size, 2);
  assert.equal(database.attempts.size, 2);
});

test("content hash mismatch is rejected before object or database persistence", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  await assert.rejects(
    service.importOriginal({ ...importInput("mismatch", 1), expectedContentHash: "0000000000000000000000000000000000000000000000000000000000000000" }),
    expectOperationalCode("CONTENT_HASH_MISMATCH")
  );
  assert.equal(objectStore.objects.size, 0);
  assert.equal(database.artifacts.size, 0);
});

test("object-store write failure creates no accepted database record", async () => {
  const objectStore = new UnitObjectStore();
  objectStore.failNextWrite = true;
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  await assert.rejects(service.importOriginal(importInput("write-failure", 1)), expectOperationalCode("OBJECT_WRITE_FAILED"));
  assert.equal(database.artifacts.size, 0);
});

test("raw object-store failures are mapped and spoofed put results fail closed", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  const service = new OperationalStateService(objectStore, database);
  objectStore.rawWriteFailure = new Error("synthetic transport detail");
  await assert.rejects(service.importOriginal(importInput("raw-write-failure", 1)), expectOperationalCode("OBJECT_WRITE_FAILED"));
  objectStore.spoofNextResult = true;
  await assert.rejects(service.importOriginal(importInput("spoofed-result", 1)), expectOperationalCode("OBJECT_INTEGRITY_MISMATCH"));
  assert.equal(database.artifacts.size, 0);
});

test("database failure after object write leaves a safe retry/reconciliation hint", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  database.failNextRegister = new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  const service = new OperationalStateService(objectStore, database);
  await assert.rejects(
    service.importOriginal(importInput("database-failure", 1)),
    (error: unknown) => {
      assert.ok(error instanceof OperationalStateError);
      assert.equal(error.code, "DATABASE_TRANSACTION_FAILED");
      assert.equal(error.reconciliationHint?.databaseRecordCommitted, false);
      assert.equal(error.reconciliationHint?.objectKey, `originals/sha256/${FIXTURE_HASH}`);
      return true;
    }
  );
  assert.equal(objectStore.objects.size, 1);
  assert.equal(database.artifacts.size, 0);
});

test("lost COMMIT acknowledgement is reported as unknown, never as rollback", async () => {
  const commands: string[] = [];
  const pool: SqlPool = {
    async connect() {
      return {
        async query(text: string) {
          commands.push(text);
          if (text === "COMMIT") throw new Error("synthetic connection reset after commit");
          return { rows: [], rowCount: 0 };
        },
        release() {}
      };
    },
    async query() {
      return { rows: [], rowCount: 0 };
    }
  };
  await assert.rejects(
    withTransaction(pool, async () => "registered"),
    (error: unknown) => {
      assert.ok(error instanceof OperationalStateError);
      assert.equal(error.code, "DATABASE_TRANSACTION_FAILED");
      assert.equal(error.transactionOutcome, "UNKNOWN");
      assert.equal(error.toJSON().transaction_outcome, "UNKNOWN");
      return true;
    }
  );
  assert.deepEqual(commands, ["BEGIN", "COMMIT"]);
});

test("migration commit ambiguity preserves unknown transaction outcome", async () => {
  const migrationSql = "CREATE TABLE mef_ml96_commit_probe (id integer NOT NULL);";
  const migration = await migrationFromText(
    "001_commit_probe",
    "001_commit_probe.sql",
    migrationSql,
    sha256Hex(new TextEncoder().encode(migrationSql))
  );
  let appliedRowsRead = 0;
  let releasedAsDestroyed = false;
  const pool: SqlPool = {
    async connect() {
      return {
        async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string) {
          if (text === "COMMIT") throw new Error("synthetic lost migration commit acknowledgement");
          if (text.includes("SELECT version, checksum, applied_at FROM mef_schema_migrations")) {
            appliedRowsRead += 1;
            return appliedRowsRead === 1
              ? { rows: [], rowCount: 0 }
              : { rows: [{ version: migration.version, checksum: migration.checksum, applied_at: FIXTURE_TIMESTAMP } as unknown as Row], rowCount: 1 };
          }
          return { rows: [] as Row[], rowCount: 0 };
        },
        release(destroy = false) {
          releasedAsDestroyed = destroy;
        }
      };
    },
    async query() {
      return { rows: [], rowCount: 0 };
    }
  };
  await assert.rejects(
    applyMigrations(pool, [migration]),
    (error: unknown) => {
      assert.ok(error instanceof OperationalStateError);
      assert.equal(error.code, "MIGRATION_FAILED");
      assert.equal(error.transactionOutcome, "UNKNOWN");
      return true;
    }
  );
  assert.equal(releasedAsDestroyed, true);
});

test("retry after a partial database failure reuses the immutable object and commits one attempt", async () => {
  const objectStore = new UnitObjectStore();
  const database = new UnitDatabase();
  database.failNextRegister = new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  const service = new OperationalStateService(objectStore, database);
  const input = importInput("retry", 1);
  await assert.rejects(service.importOriginal(input), expectOperationalCode("DATABASE_TRANSACTION_FAILED"));
  const result = await service.importOriginal(input);
  assert.equal(result.contentObjectCreated, false);
  assert.equal(database.artifacts.size, 1);
  assert.equal(database.attempts.size, 1);
});

test("audit chronology remains replayable when timestamps are equal", async () => {
  const database = new UnitDatabase();
  const objectReference = { entity_type: "SourceArtifact" as const, object_id: "src_audit_fixture" as SourceArtifact["source_artifact_id"] };
  const event = (id: string, action: AuditEvent["audit_action"]): AuditEvent => ({
    entity_type: "AuditEvent",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json",
    schema_version: "1.0.0",
    audit_event_id: id as AuditEvent["audit_event_id"],
    record_version: 1,
    occurred_at: FIXTURE_TIMESTAMP,
    actor,
    audit_action: action,
    object: objectReference,
    authority_type: "SYSTEM",
    reason: "Synthetic equal-timestamp chronology fixture.",
    immutable_history: true
  });
  await database.appendAuditEvent(event("aud_equal_first", "CREATED"));
  await database.appendAuditEvent(event("aud_equal_second", "VALIDATED"));
  const replay = await database.replayAuditChronology();
  assertReplayOrder(replay);
  assert.deepEqual(replay.map((item) => item.event.audit_event_id), ["aud_equal_first", "aud_equal_second"]);
  assert.equal(replay[0].event.occurred_at, replay[1].event.occurred_at);
});

test("malformed provenance and unresolved retention fail closed", () => {
  assert.throws(
    () => assertProvenanceReference({
      from: { entity_type: "SourceArtifact", object_id: "imp_wrong_type" },
      to: { entity_type: "ImportAttempt", object_id: "imp_valid" },
      relation: "IMPORT_ATTEMPT_CONTENT",
      created_at: FIXTURE_TIMESTAMP
    }),
    expectOperationalCode("PROVENANCE_INVALID")
  );
  assert.throws(
    () => assertProvenanceReference({
      from: { entity_type: "SourceArtifact", object_id: "src_valid" },
      to: { entity_type: "ImportAttempt", object_id: "imp_valid" },
      relation: "EXTRA_FIELD_FIXTURE",
      created_at: FIXTURE_TIMESTAMP,
      unexpected: true
    } as never),
    expectOperationalCode("PROVENANCE_INVALID")
  );
  const unresolved: RetentionAssessment = {
    source_artifact_id: "src_retention_fixture" as SourceArtifact["source_artifact_id"],
    status: "UNRESOLVED",
    hold_state: false
  };
  assert.doesNotThrow(() => assertRetentionAssessment(unresolved));
  assert.throws(() => requireResolvedRetention(unresolved), expectOperationalCode("RETENTION_POLICY_UNRESOLVED"));
  assert.throws(
    () => assertRetentionAssessment({ ...unresolved, status: "HOLD", hold_state: false, policy_reference: "policy" }),
    expectOperationalCode("RETENTION_POLICY_UNRESOLVED")
  );
  assert.throws(
    () => assertRetentionAssessment({ ...unresolved, status: "ELIGIBLE", hold_state: true, policy_reference: "policy" }),
    expectOperationalCode("RETENTION_POLICY_UNRESOLVED")
  );
  assert.throws(
    () => assertRetentionAssessment({ ...unresolved, status: "BOGUS" as RetentionAssessment["status"], hold_state: false }),
    expectOperationalCode("RETENTION_POLICY_UNRESOLVED")
  );
  assert.throws(
    () => assertRetentionAssessment({ ...unresolved, revision: 0 }),
    expectOperationalCode("RETENTION_POLICY_UNRESOLVED")
  );
  assert.throws(
    () => assertRetentionAssessment({ ...unresolved, status: "RETAIN", hold_state: false, policy_reference: { length: 1 } } as never),
    expectOperationalCode("RETENTION_POLICY_UNRESOLVED")
  );
});
