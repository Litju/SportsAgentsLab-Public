import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AuditEvent, Command, ImportAttempt, ObjectReference, SourceArtifact, Timestamp } from "@mef/generated-ts";
import {
  applyMigrations,
  assertProvenanceReference,
  contentAddressedKey,
  loadMigrations,
  migrationFromText,
  OperationalStateError,
  OperationalStateService,
  PostgresJobExecutionPersistence,
  PostgresOperationalStore,
  PostgresSourceImportRepository,
  SUCCESS_WORKER,
  FixedExecutionClock,
  FixtureWorkerRegistry,
  JobExecutionService,
  createPostgresSqlPool,
  migrationStatus,
  sha256Hex,
  type ImmutableObjectStore,
  type ImmutablePutResult,
  type SqlPool,
  type SqlResult,
  type TransactionSecurityContext
} from "../src/index.ts";
import { withTransaction } from "../src/transaction.ts";

const databaseUrl = process.env.MEF_DATABASE_URL;
const timestamp = "2026-08-10T13:00:00.000Z" as Timestamp;
const bytes = new TextEncoder().encode("ML96-real-postgres-synthetic-bytes\n");
const integrationSuffix = randomUUID().replaceAll("-", "");
const scopedFixtureId = (prefix: string): string => `${prefix}_${integrationSuffix}`;

class DatabaseIntegrationObjectStore implements ImmutableObjectStore {
  private readonly objects = new Map<string, Uint8Array>();

  async putImmutable(input: { contentHash: SourceArtifact["content_hash"]; bytes: Uint8Array; mediaType: string }): Promise<ImmutablePutResult> {
    const key = contentAddressedKey(input.contentHash);
    const existing = this.objects.get(input.contentHash);
    if (existing) return { contentHash: input.contentHash, key, byteSize: existing.byteLength, created: false };
    this.objects.set(input.contentHash, new Uint8Array(input.bytes));
    return { contentHash: input.contentHash, key, byteSize: input.bytes.byteLength, created: true };
  }

  async readImmutable(contentHash: SourceArtifact["content_hash"]): Promise<Uint8Array> {
    const value = this.objects.get(contentHash);
    if (!value) throw new OperationalStateError("OBJECT_READ_FAILED");
    return new Uint8Array(value);
  }

  async inspectImmutable(contentHash: SourceArtifact["content_hash"]) {
    const value = this.objects.get(contentHash);
    return { contentHash, key: contentAddressedKey(contentHash), exists: value !== undefined, byteSize: value?.byteLength, metadata: {} };
  }

  async existsImmutable(contentHash: SourceArtifact["content_hash"]): Promise<boolean> {
    return this.objects.has(contentHash);
  }
}

function expectCode(code: OperationalStateError["code"]) {
  return (error: unknown): boolean => error instanceof OperationalStateError && error.code === code;
}

const INTEGRATION_SECURITY_CONTEXT: TransactionSecurityContext = {
  organizationId: scopedFixtureId("org_integration_ml98"),
  workspaceId: scopedFixtureId("ws_integration_ml98"),
  principalId: scopedFixtureId("integration_service"),
  principalType: "SERVICE",
  runtimePrincipalType: "SYSTEM",
  runtimePrincipalId: "postgres-integration-test",
  requestId: "postgres-integration-test"
};
const INTEGRATION_BOOTSTRAP_SECURITY_CONTEXT: TransactionSecurityContext = {
  ...INTEGRATION_SECURITY_CONTEXT,
  bootstrap: true
};

async function scopedQuery<Row extends Record<string, unknown> = Record<string, unknown>>(
  pool: SqlPool,
  text: string,
  values: ReadonlyArray<unknown> = [],
  context: TransactionSecurityContext = INTEGRATION_SECURITY_CONTEXT
): Promise<SqlResult<Row>> {
  return withTransaction(pool, (client) => client.query<Row>(text, values), context);
}

test("ML-102 duplicate finalization accepts PostgreSQL BIGINT values returned as strings", { skip: databaseUrl ? false : "MEF_DATABASE_URL is not configured" }, async () => {
  if (!databaseUrl) return;
  const pool = createPostgresSqlPool({ connectionString: databaseUrl });
  const suffix = randomUUID().replaceAll("-", "");
  const firstAttemptId = `imp_ml102_bigint_first_${suffix}` as ImportAttempt["import_attempt_id"];
  const duplicateAttemptId = `imp_ml102_bigint_duplicate_${suffix}` as ImportAttempt["import_attempt_id"];
  const firstSourceId = `src_ml102_bigint_first_${suffix}` as SourceArtifact["source_artifact_id"];
  const duplicateSourceId = `src_ml102_bigint_duplicate_${suffix}` as SourceArtifact["source_artifact_id"];
  const contentHash = sha256Hex(new TextEncoder().encode(`ML-102 BIGINT regression ${suffix}`)) as SourceArtifact["content_hash"];
  const createdAt = new Date().toISOString() as Timestamp;
  const mediaType = "text/csv";

  const insertSourceArtifact = async (sourceArtifactId: SourceArtifact["source_artifact_id"], filename: string): Promise<void> => {
    const sourceArtifact: SourceArtifact = {
      entity_type: "SourceArtifact",
      schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/source-artifact.schema.json",
      schema_version: "1.0.0",
      source_artifact_id: sourceArtifactId,
      record_version: 1,
      created_at: createdAt,
      lifecycle_state: "VERIFIED",
      content_hash: contentHash,
      byte_size: 3,
      media_type: mediaType,
      original_filename: filename as SourceArtifact["original_filename"],
      ingested_at: createdAt,
      source_declaration: { state: "UNRESOLVED", reason: "ML-102 integration fixture.", evidence_references: [] },
      immutable_source: true
    };
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO mef_source_artifacts
          (source_artifact_id, organization_id, workspace_id, record_version, created_at,
           lifecycle_state, content_hash, byte_size, media_type, original_filename,
           ingested_at, source_declaration, immutable_source, storage_key, record_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15::jsonb)`,
        [
          sourceArtifact.source_artifact_id,
          INTEGRATION_SECURITY_CONTEXT.organizationId,
          INTEGRATION_SECURITY_CONTEXT.workspaceId,
          sourceArtifact.record_version,
          sourceArtifact.created_at,
          sourceArtifact.lifecycle_state,
          sourceArtifact.content_hash,
          sourceArtifact.byte_size,
          sourceArtifact.media_type,
          sourceArtifact.original_filename,
          sourceArtifact.ingested_at,
          JSON.stringify(sourceArtifact.source_declaration),
          sourceArtifact.immutable_source,
          contentAddressedKey(sourceArtifact.content_hash),
          JSON.stringify(sourceArtifact)
        ]
      );
    }, INTEGRATION_BOOTSTRAP_SECURITY_CONTEXT);
  };

  const prepare = async (
    repository: PostgresSourceImportRepository,
    importAttemptId: ImportAttempt["import_attempt_id"],
    sourceArtifactId: SourceArtifact["source_artifact_id"],
    filename: string
  ) => {
    await repository.create({
      importAttemptId,
      organizationId: INTEGRATION_SECURITY_CONTEXT.organizationId,
      workspaceId: INTEGRATION_SECURITY_CONTEXT.workspaceId,
      principalId: INTEGRATION_SECURITY_CONTEXT.principalId,
      originalFilename: filename,
      declaredContentType: mediaType,
      declaredSizeBytes: 3,
      createdAt
    });
    await repository.transition({ importAttemptId, toState: "UPLOAD_AUTHORIZED", eventCode: "UPLOAD_AUTHORIZED", occurredAt: createdAt });
    await repository.transition({ importAttemptId, toState: "UPLOADING", eventCode: "UPLOAD_STARTED", occurredAt: createdAt });
    await repository.transition({ importAttemptId, toState: "UPLOADED", eventCode: "UPLOAD_COMPLETED", occurredAt: createdAt });
    await repository.transition({ importAttemptId, toState: "IDENTIFYING", eventCode: "HASH_STARTED", occurredAt: createdAt });
    return repository.setIdentity({
      importAttemptId,
      actualSizeBytes: 3,
      contentHash,
      storageKey: contentAddressedKey(contentHash),
      sourceArtifactId,
      auditEventId: `aud_${suffix}_${importAttemptId.slice(4)}_source` as AuditEvent["audit_event_id"],
      identityCompletedAt: createdAt,
      occurredAt: createdAt
    });
  };

  try {
    await applyMigrations(pool, await loadMigrations(fileURLToPath(new URL("../migrations/", import.meta.url))));
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (organization_id, workspace_id) DO NOTHING`,
        [INTEGRATION_SECURITY_CONTEXT.organizationId, INTEGRATION_SECURITY_CONTEXT.workspaceId, "integration-workspace", "Integration workspace", INTEGRATION_SECURITY_CONTEXT.principalId]
      );
      await client.query(
        `INSERT INTO mef_workspace_members (organization_id, workspace_id, principal_id, role, created_by)
         VALUES ($1, $2, $3, 'PRACTITIONER', $3) ON CONFLICT (organization_id, workspace_id, principal_id) DO NOTHING`,
        [INTEGRATION_SECURITY_CONTEXT.organizationId, INTEGRATION_SECURITY_CONTEXT.workspaceId, INTEGRATION_SECURITY_CONTEXT.principalId]
      );
    }, INTEGRATION_BOOTSTRAP_SECURITY_CONTEXT);
    await insertSourceArtifact(firstSourceId, "ml102-bigint-first.csv");
    await insertSourceArtifact(duplicateSourceId, "ml102-bigint-duplicate.csv");

    const repository = new PostgresSourceImportRepository(pool, INTEGRATION_SECURITY_CONTEXT);
    const first = await prepare(repository, firstAttemptId, firstSourceId, "ml102-bigint-first.csv");
    const firstStored = await repository.finalize({
      importAttemptId: firstAttemptId,
      toState: "STORED",
      occurredAt: createdAt,
      eventCode: "SOURCE_ARTIFACT_ESTABLISHED",
      metadata: { content_hash: contentHash, byte_size: 3, scientific_eligibility: "INELIGIBLE" }
    });
    assert.equal(firstStored.state, "STORED");

    await prepare(repository, duplicateAttemptId, duplicateSourceId, "ml102-bigint-duplicate.csv");
    const duplicateStored = await repository.finalize({
      importAttemptId: duplicateAttemptId,
      toState: "STORED",
      occurredAt: createdAt,
      eventCode: "SOURCE_ARTIFACT_ESTABLISHED",
      metadata: { content_hash: contentHash, byte_size: 3, scientific_eligibility: "INELIGIBLE" }
    });
    assert.equal(duplicateStored.state, "STORED");
    assert.equal(duplicateStored.duplicateOfImportAttemptId, first.importAttemptId);
  } finally {
    await pool.end();
  }
});

test("real PostgreSQL migration, uniqueness, rollback, append-only audit, and replay qualification", { skip: databaseUrl ? false : "MEF_DATABASE_URL is not configured" }, async () => {
  if (!databaseUrl) return;
  const pool = createPostgresSqlPool({ connectionString: databaseUrl });
  try {
    const firstSourceArtifactId = scopedFixtureId("src_real_postgres_source") as SourceArtifact["source_artifact_id"];
    const distinctSourceArtifactId = scopedFixtureId("src_real_postgres_distinct_source") as SourceArtifact["source_artifact_id"];
    const firstImportAttemptId = scopedFixtureId("imp_real_postgres_first") as ImportAttempt["import_attempt_id"];
    const secondImportAttemptId = scopedFixtureId("imp_real_postgres_second") as ImportAttempt["import_attempt_id"];
    const distinctImportAttemptId = scopedFixtureId("imp_real_postgres_distinct_source") as ImportAttempt["import_attempt_id"];
    const firstAuditEventId = scopedFixtureId("aud_real_postgres_first") as AuditEvent["audit_event_id"];
    const secondAuditEventId = scopedFixtureId("aud_real_postgres_second") as AuditEvent["audit_event_id"];
    const distinctAuditEventId = scopedFixtureId("aud_real_postgres_distinct_source") as AuditEvent["audit_event_id"];
    const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
    const migrations = await loadMigrations(migrationDirectory);
    await applyMigrations(pool, migrations);
    await applyMigrations(pool, migrations);
    const status = await migrationStatus(pool);
    assert.equal(status.length, migrations.length);
    assert.equal(status[0].checksum, migrations[0].checksum);

    const tamperedSql = `${migrations[0].sql}\n-- deterministic drift fixture`;
    const tamperedChecksum = sha256Hex(new TextEncoder().encode(tamperedSql));
    const tampered = [{ ...migrations[0], sql: tamperedSql, checksum: tamperedChecksum, trustedChecksum: tamperedChecksum }];
    await assert.rejects(applyMigrations(pool, tampered), expectCode("MIGRATION_DRIFT_DETECTED"));
    await assert.rejects(
      applyMigrations(pool, [{ ...migrations[0], sql: `${migrations[0].sql}\n-- stale checksum fixture` }]),
      expectCode("MIGRATION_FAILED")
    );
    const pendingMigration = await migrationFromText(
      "002_preflight_probe",
      "002_preflight_probe.sql",
      "CREATE TABLE mef_ml96_preflight_probe (id integer NOT NULL);",
      sha256Hex(new TextEncoder().encode("CREATE TABLE mef_ml96_preflight_probe (id integer NOT NULL);"))
    );
    await scopedQuery(pool,
      "INSERT INTO mef_schema_migrations (version, checksum) VALUES ('999_foreign', $1)",
      [migrations[0].checksum]
    );
    try {
      await assert.rejects(
        applyMigrations(pool, [...migrations, pendingMigration]),
        expectCode("MIGRATION_DRIFT_DETECTED")
      );
    } finally {
      await withTransaction(pool, async (client) => {
        await client.query("ALTER TABLE mef_schema_migrations DISABLE TRIGGER mef_schema_migrations_append_only");
        await client.query("DELETE FROM mef_schema_migrations WHERE version = '999_foreign'");
        await client.query("ALTER TABLE mef_schema_migrations ENABLE TRIGGER mef_schema_migrations_append_only");
      }, INTEGRATION_BOOTSTRAP_SECURITY_CONTEXT);
    }
    const preflightTable = await scopedQuery<{ relation: string | null }>(pool,
      "SELECT to_regclass('public.mef_ml96_preflight_probe') AS relation"
    );
    assert.equal(preflightTable.rows[0].relation, null);
    await assert.rejects(
      scopedQuery(pool,"UPDATE mef_schema_migrations SET checksum = $2 WHERE version = $1", [migrations[0].version, migrations[0].checksum]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"DELETE FROM mef_schema_migrations WHERE version = $1", [migrations[0].version]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );

    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, workspace_id) DO NOTHING`,
        [INTEGRATION_SECURITY_CONTEXT.organizationId, INTEGRATION_SECURITY_CONTEXT.workspaceId, "integration-workspace", "Integration workspace", INTEGRATION_SECURITY_CONTEXT.principalId]
      );
      await client.query(
        `INSERT INTO mef_workspace_members (organization_id, workspace_id, principal_id, role, created_by)
         VALUES ($1, $2, $3, 'PRACTITIONER', $3)
         ON CONFLICT (organization_id, workspace_id, principal_id) DO NOTHING`,
        [INTEGRATION_SECURITY_CONTEXT.organizationId, INTEGRATION_SECURITY_CONTEXT.workspaceId, INTEGRATION_SECURITY_CONTEXT.principalId]
      );
    }, INTEGRATION_BOOTSTRAP_SECURITY_CONTEXT);

    const database = new PostgresOperationalStore(pool, INTEGRATION_SECURITY_CONTEXT);
    const service = new OperationalStateService(new DatabaseIntegrationObjectStore(), database);
    const replayBaseline = (await database.replayAuditChronology()).length;
    const declaration = { state: "UNKNOWN" as const, reason: "Real PostgreSQL synthetic fixture.", evidence_references: [] };
    const actor = { actor_type: "SYSTEM" as const, actor_id: "system_ml96_pg", role: "integration-test" };
    const retention = {
      source_artifact_id: firstSourceArtifactId,
      status: "RETAIN" as const,
      policy_reference: "synthetic-retention-policy",
      hold_state: false,
      assessed_at: "2026-08-10T13:00:00.123456789Z" as Timestamp
    };
    const first = await service.importOriginal({
      bytes,
      mediaType: "application/octet-stream",
      originalFilename: "real-postgres-first.bin",
      sourceArtifactId: firstSourceArtifactId,
      sourceDeclaration: declaration,
      importAttemptId: firstImportAttemptId,
      attemptNumber: 1,
      attemptedAt: timestamp,
      createdAt: timestamp,
      ingestedAt: timestamp,
      auditEventId: firstAuditEventId,
      occurredAt: timestamp,
      actor,
      authorityType: "SYSTEM",
      reason: "Real PostgreSQL synthetic fixture.",
      retention
    });
    const second = await service.importOriginal({
      bytes,
      mediaType: "application/octet-stream",
      originalFilename: "real-postgres-first.bin",
      sourceArtifactId: firstSourceArtifactId,
      sourceDeclaration: declaration,
      importAttemptId: secondImportAttemptId,
      attemptNumber: 2,
      attemptedAt: timestamp,
      createdAt: timestamp,
      ingestedAt: timestamp,
      auditEventId: secondAuditEventId,
      occurredAt: timestamp,
      actor,
      authorityType: "SYSTEM",
      reason: "Real PostgreSQL duplicate-content fixture.",
      retention
    });
    const third = await service.importOriginal({
      bytes,
      mediaType: "application/octet-stream",
      originalFilename: "real-postgres-distinct-source.bin",
      sourceArtifactId: distinctSourceArtifactId,
      sourceDeclaration: declaration,
      importAttemptId: distinctImportAttemptId,
      attemptNumber: 1,
      attemptedAt: timestamp,
      createdAt: timestamp,
      ingestedAt: timestamp,
      auditEventId: distinctAuditEventId,
      occurredAt: timestamp,
      actor,
      authorityType: "SYSTEM",
      reason: "Real PostgreSQL duplicate-content distinct-source fixture.",
      retention: {
        ...retention,
        source_artifact_id: distinctSourceArtifactId
      }
    });
    assert.equal(first.sourceArtifact.source_artifact_id, second.sourceArtifact.source_artifact_id);
    assert.equal(first.sourceArtifact.source_artifact_id, firstSourceArtifactId);
    assert.notEqual(third.sourceArtifact.source_artifact_id, first.sourceArtifact.source_artifact_id);
    assert.equal(first.contentHash, third.contentHash);
    assert.equal(third.contentObjectCreated, false);
    assert.equal((await database.findImportAttempts(first.sourceArtifact.source_artifact_id)).length, 2);
    assert.equal((await database.findImportAttempts(third.sourceArtifact.source_artifact_id)).length, 1);
    const initialRetention = await database.getRetentionAssessment(first.sourceArtifact.source_artifact_id);
    assert.equal(initialRetention?.revision, 1);
    await database.setRetentionAssessment({ ...retention, revision: 1 });
    assert.equal((await database.getRetentionAssessment(first.sourceArtifact.source_artifact_id))?.revision, 2);
    await assert.rejects(
      database.setRetentionAssessment({ ...retention, revision: 1 }),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      service.importOriginal({
        bytes,
        mediaType: "application/octet-stream",
        originalFilename: "real-postgres-conflicting-metadata.bin",
        sourceArtifactId: firstSourceArtifactId,
        sourceDeclaration: declaration,
         importAttemptId: scopedFixtureId("imp_real_postgres_conflicting_metadata") as ImportAttempt["import_attempt_id"],
        attemptNumber: 3,
        attemptedAt: timestamp,
        createdAt: timestamp,
        ingestedAt: timestamp,
        auditEventId: scopedFixtureId("aud_real_postgres_conflicting_metadata") as AuditEvent["audit_event_id"],
        occurredAt: timestamp,
        actor,
        authorityType: "SYSTEM",
        reason: "Real PostgreSQL immutable metadata conflict fixture.",
        retention
      }),
      expectCode("SOURCE_ARTIFACT_IMMUTABLE_CONFLICT")
    );
    assert.equal((await database.findImportAttempts(first.sourceArtifact.source_artifact_id)).length, 2);
    const provenance = await database.listProvenanceReferences({
      entity_type: "ImportAttempt",
      object_id: first.importAttempt.import_attempt_id
    });
    assert.equal(provenance.length, 1);
    assert.equal(provenance[0].to.object_id, first.sourceArtifact.source_artifact_id);

    await assert.rejects(
      scopedQuery(pool,
        `INSERT INTO mef_provenance_references
          (from_entity_type, from_object_id, to_entity_type, to_object_id, relation, created_at, record_json)
         VALUES ('SourceArtifact', 'src_missing_target', 'ImportAttempt', $1, 'DANGLING_REFERENCE', $2, $3::jsonb)`,
        [
          first.importAttempt.import_attempt_id,
          timestamp,
          JSON.stringify({
            from: { entity_type: "SourceArtifact", object_id: "src_missing_target" },
            to: { entity_type: "ImportAttempt", object_id: first.importAttempt.import_attempt_id },
            relation: "DANGLING_REFERENCE",
            created_at: timestamp
          })
        ]
      ),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,
        "INSERT INTO mef_artifact_retention (source_artifact_id, status, policy_reference, hold_state) VALUES ($1, 'ELIGIBLE', 'synthetic-policy', true)",
        [first.sourceArtifact.source_artifact_id]
      ),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );

    const replay = await database.replayAuditChronology();
    assert.equal(replay.length, replayBaseline + 3);
    const replayedImports = replay.slice(-3);
    assert.ok(BigInt(replayedImports[1].sequence) > BigInt(replayedImports[0].sequence));
    assert.equal(replayedImports[0].event.occurred_at, replayedImports[1].event.occurred_at);

    await assert.rejects(
      scopedQuery(pool,"UPDATE mef_audit_events SET reason = 'mutation' WHERE audit_event_id = $1", [first.auditEvents[0].event.audit_event_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"DELETE FROM mef_audit_events WHERE audit_event_id = $1", [first.auditEvents[0].event.audit_event_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"UPDATE mef_source_artifacts SET original_filename = 'mutation.bin' WHERE source_artifact_id = $1", [first.sourceArtifact.source_artifact_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"DELETE FROM mef_source_artifacts WHERE source_artifact_id = $1", [first.sourceArtifact.source_artifact_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"DELETE FROM mef_import_attempts WHERE import_attempt_id = $1", [first.importAttempt.import_attempt_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"UPDATE mef_import_attempts SET attempt_state = 'FAILED' WHERE import_attempt_id = $1", [first.importAttempt.import_attempt_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"UPDATE mef_artifact_retention SET revision = 999 WHERE source_artifact_id = $1", [first.sourceArtifact.source_artifact_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    await assert.rejects(
      scopedQuery(pool,"DELETE FROM mef_artifact_retention WHERE source_artifact_id = $1", [first.sourceArtifact.source_artifact_id]),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );

    const rollbackAttempt: ImportAttempt = {
      entity_type: "ImportAttempt",
      schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/import-attempt.schema.json",
      schema_version: "1.0.0",
      import_attempt_id: "imp_real_postgres_rollback" as ImportAttempt["import_attempt_id"],
      record_version: 1,
      source_artifact_id: first.sourceArtifact.source_artifact_id,
      attempt_number: 99,
      attempted_at: timestamp,
      attempt_state: "RECEIVED",
      errors: []
    };
    await assert.rejects(
      withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO mef_import_attempts
            (import_attempt_id, record_version, source_artifact_id, attempt_number, attempted_at, attempt_state, errors, record_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
          [rollbackAttempt.import_attempt_id, 1, rollbackAttempt.source_artifact_id, 99, timestamp, "RECEIVED", "[]", JSON.stringify(rollbackAttempt)]
        );
        throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
      }, INTEGRATION_SECURITY_CONTEXT),
      expectCode("DATABASE_TRANSACTION_FAILED")
    );
    const rollbackCount = await scopedQuery<{ count: string }>(pool,
      "SELECT count(*)::text AS count FROM mef_import_attempts WHERE import_attempt_id = $1",
      [rollbackAttempt.import_attempt_id]
    );
    assert.equal(rollbackCount.rows[0].count, "0");

    assert.throws(
      () => assertProvenanceReference({
        from: { entity_type: "SourceArtifact", object_id: "imp_wrong_type" },
        to: { entity_type: "ImportAttempt", object_id: firstImportAttemptId },
        relation: "INVALID_FIXTURE",
        created_at: timestamp
      }),
      expectCode("PROVENANCE_INVALID")
    );

    const executionClock = new FixedExecutionClock("2026-08-10T14:00:00.000Z" as Timestamp);
    const executionPersistence = new PostgresJobExecutionPersistence(pool, INTEGRATION_SECURITY_CONTEXT);
    const execution = new JobExecutionService(executionPersistence, new FixtureWorkerRegistry(), {
      clock: executionClock,
      config: { retry_policy: { max_attempts: 3, backoff_milliseconds: 1000, backoff_strategy: "FIXED" } },
      securityContext: INTEGRATION_SECURITY_CONTEXT
    });
    const authority: ObjectReference = { entity_type: "AgentContext", object_id: "ctx_real_pg_ml97" as never };
    const uniqueKey = `pg-ml97-${process.pid}-${Date.now()}`;
    const commandInput = (requestId: string) => ({
      command_type: "FIXTURE_EXECUTION" as const,
      idempotency_key: uniqueKey as never,
      request_payload: {
        payload_kind: "STRUCTURAL" as const,
        input_label: "real-postgres-job",
        input_value: "synthetic",
        fixture_scenario: "SUCCESS" as const
      },
      requested_operation: "EXECUTE" as const,
      authority_context_reference: authority,
      correlation_metadata: { correlation_id: "real-pg-correlation", request_id: requestId }
    });
    const duplicateSubmissions = await Promise.all([
      execution.submit(commandInput("real-pg-request-1")),
      execution.submit(commandInput("real-pg-request-2"))
    ]);
    assert.equal(new Set(duplicateSubmissions.map((item) => item.job.job_id)).size, 1);
    assert.equal(duplicateSubmissions.filter((item) => item.reused === false).length, 1);
    const [firstClaim, secondClaim] = await Promise.all([
      executionPersistence.claimNext(executionClock.now(), "2026-08-10T14:00:30.000Z" as Timestamp, (_command: Command) => SUCCESS_WORKER),
      executionPersistence.claimNext(executionClock.now(), "2026-08-10T14:00:30.000Z" as Timestamp, (_command: Command) => SUCCESS_WORKER)
    ]);
    const claims = [firstClaim, secondClaim].filter((claim) => claim !== undefined);
    assert.equal(claims.length, 1);
    const claim = claims[0];
    assert.ok(claim);
    await executionPersistence.completeAttempt(claim, {
      kind: "SUCCEEDED",
      result: { result_code: "COMPLETED", summary_code: "REAL_PG_FIXTURE" }
    }, executionClock.now());
    assert.equal((await execution.getJob(duplicateSubmissions[0].job.job_id))?.state, "SUCCEEDED");

    executionClock.advance(1000);
    const replayedSubmission = await execution.submit(commandInput("real-pg-request-3"));
    assert.equal(replayedSubmission.reused, true);
    assert.equal(replayedSubmission.job.job_id, duplicateSubmissions[0].job.job_id);

    const fixtureInput = (
      key: string,
      requestId: string,
      scenario: "SUCCESS" | "RETRY_THEN_SUCCESS" | "NON_RETRYABLE_FAILURE" | "CANCELLABLE" | "UNKNOWN_OUTCOME" | "PROGRESS",
      inputValue = `real-pg-${scenario.toLowerCase()}`
    ) => ({
      command_type: "FIXTURE_EXECUTION" as const,
      idempotency_key: key as never,
      request_payload: {
        payload_kind: "STRUCTURAL" as const,
        input_label: "real-postgres-job",
        input_value: inputValue,
        fixture_scenario: scenario
      },
      requested_operation: "EXECUTE" as const,
      authority_context_reference: authority,
      correlation_metadata: { correlation_id: "real-pg-correlation", request_id: requestId }
    });
    const fixtureRegistry = new FixtureWorkerRegistry();
    const resolveFixture = (command: Command) => {
      const worker = fixtureRegistry.resolve(command);
      if (!worker) throw new Error("fixture worker missing");
      return worker;
    };
    const nextKey = (suffix: string) => `${uniqueKey}-${suffix}`;

    const conflictAccepted = await execution.submit(fixtureInput(nextKey("conflict"), "real-pg-conflict-1", "SUCCESS", "first"));
    await assert.rejects(
      execution.submit(fixtureInput(nextKey("conflict"), "real-pg-conflict-2", "SUCCESS", "different")),
      expectCode("IDEMPOTENCY_CONFLICT")
    );
    await execution.requestCancellation(conflictAccepted.job.job_id);

    const retrySubmitted = await execution.submit(fixtureInput(nextKey("retry"), "real-pg-retry", "RETRY_THEN_SUCCESS"));
    const retryFirst = await execution.runNext();
    assert.equal(retryFirst?.job.job_id, retrySubmitted.job.job_id);
    assert.equal(retryFirst?.job.state, "RETRY_WAIT");
    executionClock.advance(1000);
    const retrySecond = await execution.runNext();
    assert.equal(retrySecond?.job.job_id, retrySubmitted.job.job_id);
    assert.equal(retrySecond?.job.state, "SUCCEEDED");
    const retryAttempts = await scopedQuery<{ attempt_number: number; outcome: string; retry_decision: string }>(pool,
      "SELECT attempt_number, outcome, retry_decision FROM mef_job_attempts WHERE job_id = $1 ORDER BY attempt_number",
      [retrySubmitted.job.job_id]
    );
    assert.deepEqual(retryAttempts.rows, [
      { attempt_number: 1, outcome: "FAILED_RETRYABLE", retry_decision: "RETRY_SCHEDULED" },
      { attempt_number: 2, outcome: "SUCCEEDED", retry_decision: "NOT_APPLICABLE" }
    ]);

    const cancellationSubmitted = await execution.submit(fixtureInput(nextKey("cancel"), "real-pg-cancel", "CANCELLABLE"));
    const cancellationClaim = await executionPersistence.claimNext(
      executionClock.now(),
      "2026-08-10T14:00:31.000Z" as Timestamp,
      resolveFixture
    );
    assert.ok(cancellationClaim);
    await execution.requestCancellation(cancellationSubmitted.job.job_id);
    const activeAttemptCount = await scopedQuery<{ count: string }>(pool,
      "SELECT count(*)::text AS count FROM mef_job_attempts WHERE job_id = $1 AND outcome = 'STARTED'",
      [cancellationSubmitted.job.job_id]
    );
    assert.equal(activeAttemptCount.rows[0].count, "1");
    const cancellationCompletion = await executionPersistence.completeAttempt(
      cancellationClaim,
      { kind: "CANCELED" },
      executionClock.now()
    );
    assert.equal(cancellationCompletion.job.state, "CANCELED");
    const cancellationRow = await scopedQuery<{ state: string; acknowledged_at: string | null }>(pool,
      "SELECT state, cancellation->>'acknowledged_at' AS acknowledged_at FROM mef_jobs WHERE job_id = $1",
      [cancellationSubmitted.job.job_id]
    );
    assert.equal(cancellationRow.rows[0].state, "CANCELED");
    assert.ok(cancellationRow.rows[0].acknowledged_at);

    const progressSubmitted = await execution.submit(fixtureInput(nextKey("progress"), "real-pg-progress", "PROGRESS"));
    const progressClaim = await executionPersistence.claimNext(
      executionClock.now(),
      "2026-08-10T14:00:31.000Z" as Timestamp,
      resolveFixture
    );
    assert.ok(progressClaim);
    const firstProgress = await executionPersistence.recordProgress({
      job_id: progressSubmitted.job.job_id,
      attempt_id: progressClaim.attempt.job_attempt_id,
      occurred_at: executionClock.now(),
      phase: "RUNNING",
      message_code: "STEP_COMPLETED",
      progress_value: 0.5
    });
    const secondProgress = await executionPersistence.recordProgress({
      job_id: progressSubmitted.job.job_id,
      attempt_id: progressClaim.attempt.job_attempt_id,
      occurred_at: executionClock.now(),
      phase: "COMPLETED",
      message_code: "ATTEMPT_COMPLETED",
      progress_value: 1
    });
    assert.deepEqual([firstProgress.sequence, secondProgress.sequence], [1, 2]);
    await assert.rejects(executionPersistence.appendProgressEvent(firstProgress), expectCode("PROGRESS_SEQUENCE_CONFLICT"));
    const progressRows = await scopedQuery<{ count: string }>(pool,
      "SELECT count(*)::text AS count FROM mef_progress_events WHERE job_id = $1",
      [progressSubmitted.job.job_id]
    );
    assert.equal(progressRows.rows[0].count, "2");
    await executionPersistence.completeAttempt(progressClaim, {
      kind: "SUCCEEDED",
      result: { result_code: "COMPLETED", summary_code: "REAL_PG_PROGRESS" }
    }, executionClock.now());

    const unknownSubmitted = await execution.submit(fixtureInput(nextKey("unknown"), "real-pg-unknown", "UNKNOWN_OUTCOME"));
    const unknownClaim = await executionPersistence.claimNext(
      executionClock.now(),
      "2026-08-10T14:00:31.000Z" as Timestamp,
      resolveFixture
    );
    assert.ok(unknownClaim);
    const unknownCompletion = await executionPersistence.completeAttempt(unknownClaim, {
      kind: "UNKNOWN_OUTCOME",
      error: { code: "EXECUTION_OUTCOME_UNKNOWN", category: "UNKNOWN_OUTCOME" }
    }, executionClock.now());
    assert.equal(unknownCompletion.job.state, "UNKNOWN_OUTCOME");
    const unknownRows = await scopedQuery<{ job_state: string; reconciliation_state: string; attempt_outcome: string }>(pool,
      `SELECT j.state AS job_state, j.reconciliation_state, a.outcome AS attempt_outcome
       FROM mef_jobs AS j JOIN mef_job_attempts AS a ON a.job_id = j.job_id
       WHERE j.job_id = $1`,
      [unknownSubmitted.job.job_id]
    );
    assert.deepEqual(unknownRows.rows[0], {
      job_state: "UNKNOWN_OUTCOME",
      reconciliation_state: "RECONCILIATION_REQUIRED",
      attempt_outcome: "UNKNOWN_OUTCOME"
    });
    assert.equal((await execution.reconcileUnknownOutcome(unknownSubmitted.job.job_id, false)).state, "FAILED");

    const leaseSubmitted = await execution.submit(fixtureInput(nextKey("lease"), "real-pg-lease", "SUCCESS"));
    const leaseClaim = await executionPersistence.claimNext(
      executionClock.now(),
      "2026-08-10T14:00:02.000Z" as Timestamp,
      resolveFixture
    );
    assert.equal(leaseClaim?.job.job_id, leaseSubmitted.job.job_id);
    executionClock.advance(1001);
    await execution.reconcileExpired();
    const leaseRows = await scopedQuery<{ state: string; outcome: string }>(pool,
      `SELECT j.state, a.outcome FROM mef_jobs AS j
       JOIN mef_job_attempts AS a ON a.job_id = j.job_id
       WHERE j.job_id = $1`,
      [leaseSubmitted.job.job_id]
    );
    assert.deepEqual(leaseRows.rows[0], { state: "UNKNOWN_OUTCOME", outcome: "UNKNOWN_OUTCOME" });

    const raceSubmitted = await execution.submit(fixtureInput(nextKey("cancel-race"), "real-pg-cancel-race", "SUCCESS"));
    const raceClaim = await executionPersistence.claimNext(
      executionClock.now(),
      "2026-08-10T14:00:32.000Z" as Timestamp,
      resolveFixture
    );
    assert.ok(raceClaim);
    await execution.requestCancellation(raceSubmitted.job.job_id);
    const raceCompletion = await executionPersistence.completeAttempt(raceClaim, {
      kind: "SUCCEEDED",
      result: { result_code: "COMPLETED", summary_code: "REAL_PG_CANCEL_RACE" }
    }, executionClock.now());
    assert.equal(raceCompletion.job.state, "SUCCEEDED");

    const illegalSubmitted = await execution.submit(fixtureInput(nextKey("illegal"), "real-pg-illegal", "SUCCESS"));
    await assert.rejects(scopedQuery(pool,
      `UPDATE mef_jobs
       SET record_version = record_version + 1,
           state = 'SUCCEEDED',
           finished_at = $2,
           result = '{"result_code":"COMPLETED","summary_code":"ILLEGAL"}'::jsonb
       WHERE job_id = $1`,
      [illegalSubmitted.job.job_id, executionClock.now()]
    ));
    assert.equal((await execution.getJob(illegalSubmitted.job.job_id))?.state, "QUEUED");
    await execution.requestCancellation(illegalSubmitted.job.job_id);
    await assert.rejects(scopedQuery(pool,
      "UPDATE mef_jobs SET state = 'QUEUED', record_version = record_version + 1 WHERE job_id = $1",
      [duplicateSubmissions[0].job.job_id]
    ));

    const activeAttemptIndex = await scopedQuery<{ indexname: string }>(pool,
      "SELECT indexname FROM pg_indexes WHERE indexname = 'mef_job_attempts_one_active_idx'"
    );
    assert.equal(activeAttemptIndex.rows.length, 1);
    const executionAudit = await scopedQuery<{ audit_action: string }>(pool,
      `SELECT audit_action FROM mef_audit_events
       WHERE object_reference->>'object_id' = $1
          OR prior_reference->>'object_id' = $1
          OR new_reference->>'object_id' = $1
          OR object_reference->>'object_id' IN (SELECT job_attempt_id FROM mef_job_attempts WHERE job_id = $1)
          OR prior_reference->>'object_id' IN (SELECT job_attempt_id FROM mef_job_attempts WHERE job_id = $1)
          OR new_reference->>'object_id' IN (SELECT job_attempt_id FROM mef_job_attempts WHERE job_id = $1)
       ORDER BY audit_sequence`,
      [retrySubmitted.job.job_id]
    );
    const auditActions = new Set(executionAudit.rows.map((row) => row.audit_action));
    assert.equal(auditActions.has("COMMAND_ACCEPTED"), true);
    assert.equal(auditActions.has("JOB_CLAIMED"), true);
    assert.equal(auditActions.has("ATTEMPT_COMPLETED"), true);
    assert.equal(auditActions.has("JOB_SUCCEEDED"), true);
  } finally {
    await pool.end();
  }
});
