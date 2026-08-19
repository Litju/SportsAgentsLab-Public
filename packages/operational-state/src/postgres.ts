import { Pool, type PoolClient, type PoolConfig } from "pg";
import type {
  AuditEvent,
  ImportAttempt,
  ObjectReference,
  SourceArtifact,
  SourceArtifactId,
  Sha256
} from "@mef/generated-ts";
import { canonicalJson, validateEntity } from "@mef/generated-ts";
import { assertAuditEvent, assertReplayOrder, type ReplayedAuditEvent } from "./audit.ts";
import {
  assertCanonicalAcquisitionRecord,
  sameCanonicalAcquisition,
  type CanonicalAcquisitionRecord
} from "./canonical-acquisition.ts";
import {
  assertConfigurationResolutionRecord,
  sameConfigurationResolution,
  type ConfigurationResolutionRecord
} from "./configuration-resolution.ts";
import {
  isOperationalStateError,
  mapDatabaseError,
  OperationalStateError,
  type ReconciliationHint
} from "./errors.ts";
import { assertSha256Hex, contentAddressedKey } from "./hash.ts";
import { assertProvenanceReference, type ProvenanceReference } from "./references.ts";
import { assertRetentionAssessment, type RetentionAssessment } from "./retention.ts";
import {
  assertSourceObservationRecord,
  sameSourceObservation,
  type SourceObservationRecord
} from "./source-observation.ts";
import type { TransactionSecurityContext } from "./security.ts";
import { executeRead, withTransaction } from "./transaction.ts";
import type { SqlClient, SqlPool, SqlResult } from "./sql.ts";

export interface PostgresEnvironment {
  readonly MEF_DATABASE_URL?: string;
}

export class PostgresSqlPool implements SqlPool {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async connect(): Promise<SqlClient> {
    try {
      return new PostgresSqlClient(await this.pool.connect());
    } catch (error) {
      throw mapDatabaseError(error, "connect");
    }
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: ReadonlyArray<unknown> = []
  ): Promise<SqlResult<Row>> {
    try {
      const result = await this.pool.query(text, [...values]);
      return { rows: result.rows as Row[], rowCount: result.rowCount };
    } catch (error) {
      throw mapDatabaseError(error, "transaction");
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

class PostgresSqlClient implements SqlClient {
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: ReadonlyArray<unknown> = []
  ): Promise<SqlResult<Row>> {
    const result = await this.client.query(text, [...values]);
    return { rows: result.rows as Row[], rowCount: result.rowCount };
  }

  release(destroy = false): void {
    this.client.release(destroy ? new Error("discarding transaction connection") : undefined);
  }
}

export function createPostgresSqlPool(config: PoolConfig): PostgresSqlPool {
  if (!config.connectionString && (!config.host || !config.database || !config.user)) {
    throw new OperationalStateError("INVALID_CONFIGURATION");
  }
  return new PostgresSqlPool(new Pool(config));
}

export function createPostgresSqlPoolFromEnvironment(
  environment: PostgresEnvironment = { MEF_DATABASE_URL: process.env.MEF_DATABASE_URL }
): PostgresSqlPool {
  const connectionString = environment.MEF_DATABASE_URL;
  if (!connectionString) throw new OperationalStateError("INVALID_CONFIGURATION");
  return createPostgresSqlPool({ connectionString });
}

export interface RegisterOperationalRecords {
  readonly sourceArtifact: SourceArtifact;
  readonly importAttempt: ImportAttempt;
  readonly auditEvents: ReadonlyArray<AuditEvent>;
  readonly provenanceReferences: ReadonlyArray<ProvenanceReference>;
  readonly retention?: RetentionAssessment;
  readonly contentObjectKey?: string;
}

export interface OperationalRegistrationResult {
  readonly sourceArtifact: SourceArtifact;
  readonly importAttempt: ImportAttempt;
  readonly auditEvents: ReadonlyArray<ReplayedAuditEvent>;
}

/**
 * ML-96 exposes ImportAttempt identity/history as append-only domain data.
 * Its attempt_state is an immutable admission/outcome classification; no
 * update or transition method is exposed. Mutable execution and retry
 * lifecycle belongs to the downstream Job model.
 */
export interface OperationalDatabase {
  registerRecords(input: RegisterOperationalRecords): Promise<OperationalRegistrationResult>;
  appendAuditEvent(event: AuditEvent): Promise<ReplayedAuditEvent>;
  replayAuditChronology(): Promise<ReadonlyArray<ReplayedAuditEvent>>;
  listProvenanceReferences(reference?: ObjectReference): Promise<ReadonlyArray<ProvenanceReference>>;
  findSourceArtifact(sourceArtifactId: SourceArtifactId): Promise<SourceArtifact | undefined>;
  insertOrGetSourceObservation(record: SourceObservationRecord): Promise<SourceObservationRecord>;
  findSourceObservation(sourceObservationId: string): Promise<SourceObservationRecord | undefined>;
  findImportAttempts(sourceArtifactId: SourceArtifactId): Promise<ReadonlyArray<ImportAttempt>>;
  getRetentionAssessment(sourceArtifactId: SourceArtifactId): Promise<RetentionAssessment | undefined>;
  setRetentionAssessment(assessment: RetentionAssessment): Promise<void>;
}

function recordObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Bounded error below avoids leaking parser/driver details.
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
}

function validateContract(value: unknown, entityType: "SourceArtifact" | "ImportAttempt"): void {
  const result = validateEntity(value, entityType);
  if (!result.valid) throw new OperationalStateError("CONTRACT_INVALID");
}

function assertSourceArtifact(value: SourceArtifact): void {
  validateContract(value, "SourceArtifact");
  assertSha256Hex(value.content_hash);
}

function assertImportAttempt(value: ImportAttempt, sourceArtifactId: SourceArtifactId): void {
  validateContract(value, "ImportAttempt");
  if (value.source_artifact_id !== sourceArtifactId) throw new OperationalStateError("CONTRACT_INVALID");
}

function assertStoredSourceArtifact(value: unknown): SourceArtifact {
  const record = recordObject(value);
  const source = record as unknown as SourceArtifact;
  assertSourceArtifact(source);
  return source;
}

function assertStoredSourceArtifactRow(row: {
  readonly source_artifact_id: string;
  readonly content_hash: string;
  readonly storage_key: string;
  readonly byte_size: number | string;
  readonly record_json: unknown;
}): SourceArtifact {
  const source = assertStoredSourceArtifact(row.record_json);
  if (
    source.source_artifact_id !== row.source_artifact_id ||
    source.content_hash !== row.content_hash ||
    source.byte_size !== Number(row.byte_size) ||
    row.storage_key !== contentAddressedKey(source.content_hash)
  ) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  return source;
}

function assertStoredImportAttempt(value: unknown): ImportAttempt {
  const record = recordObject(value);
  validateContract(record, "ImportAttempt");
  return record as unknown as ImportAttempt;
}

function assertStoredImportAttemptRow(row: {
  readonly import_attempt_id: string;
  readonly source_artifact_id: string;
  readonly attempt_number: number | string;
  readonly record_json: unknown;
}): ImportAttempt {
  const attempt = assertStoredImportAttempt(row.record_json);
  if (
    attempt.import_attempt_id !== row.import_attempt_id ||
    attempt.source_artifact_id !== row.source_artifact_id ||
    attempt.attempt_number !== Number(row.attempt_number)
  ) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  return attempt;
}

function assertSameSourceArtifact(existing: SourceArtifact, requested: SourceArtifact): void {
  if (
    existing.immutable_source !== true ||
    requested.immutable_source !== true ||
    canonicalJson(existing) !== canonicalJson(requested)
  ) {
    throw new OperationalStateError("SOURCE_ARTIFACT_IMMUTABLE_CONFLICT");
  }
}

function databaseErrorWithHint(error: unknown, hint: ReconciliationHint): OperationalStateError {
  const mapped = isOperationalStateError(error) ? error : mapDatabaseError(error, "transaction");
  const databaseRecordCommitted = mapped.transactionOutcome === "UNKNOWN"
    ? "UNKNOWN"
    : hint.databaseRecordCommitted;
  return new OperationalStateError(mapped.code, mapped.message, {
    retryable: mapped.retryable,
    transactionOutcome: mapped.transactionOutcome,
    reconciliationHint: { ...hint, databaseRecordCommitted }
  });
}

export class PostgresOperationalStore implements OperationalDatabase {
  private readonly pool: SqlPool;
  private readonly securityContext?: TransactionSecurityContext;

  constructor(pool: SqlPool, securityContext?: TransactionSecurityContext) {
    this.pool = pool;
    this.securityContext = securityContext;
  }

  async registerRecords(input: RegisterOperationalRecords): Promise<OperationalRegistrationResult> {
    assertSourceArtifact(input.sourceArtifact);
    assertImportAttempt(input.importAttempt, input.sourceArtifact.source_artifact_id);
    for (const event of input.auditEvents) assertAuditEvent(event);
    for (const reference of input.provenanceReferences) assertProvenanceReference(reference);
    if (input.retention) {
      assertRetentionAssessment(input.retention);
      if (input.retention.source_artifact_id !== input.sourceArtifact.source_artifact_id) {
        throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
      }
    }

    try {
      return await withTransaction(this.pool, async (client) => {
        const sourceArtifact = await this.insertOrGetSourceArtifact(
          client,
          input.sourceArtifact,
          input.contentObjectKey ?? contentAddressedKey(input.sourceArtifact.content_hash)
        );
        const importAttempt = await this.insertOrGetImportAttempt(client, input.importAttempt);
        const auditEvents: ReplayedAuditEvent[] = [];
        for (const event of input.auditEvents) auditEvents.push(await this.insertOrGetAuditEvent(client, event));
        for (const reference of input.provenanceReferences) await this.insertOrGetProvenance(client, reference);
        await this.insertOrGetRetention(client, input.retention ?? {
          source_artifact_id: input.sourceArtifact.source_artifact_id,
          status: "UNRESOLVED",
          hold_state: false
        }, input.retention !== undefined);
        return { sourceArtifact, importAttempt, auditEvents };
      }, this.securityContext);
    } catch (error) {
      throw databaseErrorWithHint(error, {
        contentHash: input.sourceArtifact.content_hash,
        objectKey: input.contentObjectKey ?? contentAddressedKey(input.sourceArtifact.content_hash),
        databaseRecordCommitted: false
      });
    }
  }

  async appendAuditEvent(event: AuditEvent): Promise<ReplayedAuditEvent> {
    assertAuditEvent(event);
    try {
      return await withTransaction(this.pool, (client) => this.insertOrGetAuditEvent(client, event), this.securityContext);
    } catch (error) {
      if (isOperationalStateError(error) && error.code === "DATABASE_UNAVAILABLE") throw error;
      if (isOperationalStateError(error) && error.transactionOutcome === "UNKNOWN") {
        throw new OperationalStateError("AUDIT_APPEND_FAILED", undefined, { transactionOutcome: "UNKNOWN" });
      }
      if (isOperationalStateError(error) && error.code === "AUDIT_APPEND_FAILED") throw error;
      throw new OperationalStateError("AUDIT_APPEND_FAILED");
    }
  }

  /**
   * Append an audit event on a caller-owned transaction so job state and its
   * audit linkage commit or roll back together. The audit table remains the
   * single append-only history owned by ML-96.
   */
  async appendAuditEventInTransaction(client: SqlClient, event: AuditEvent): Promise<ReplayedAuditEvent> {
    assertAuditEvent(event);
    return this.insertOrGetAuditEvent(client, event);
  }

  async replayAuditChronology(): Promise<ReadonlyArray<ReplayedAuditEvent>> {
    const events = await executeRead(this.pool, async (client) => {
      const result = await client.query<{ audit_sequence: string; audit_event_id: string; record_json: unknown }>(
        "SELECT audit_sequence, audit_event_id, record_json FROM mef_audit_events ORDER BY audit_sequence ASC"
      );
      return result.rows.map((row) => {
        const record = recordObject(row.record_json);
        assertAuditEvent(record);
        if (record.audit_event_id !== row.audit_event_id) throw new OperationalStateError("AUDIT_APPEND_FAILED");
        return { sequence: String(row.audit_sequence), event: record as unknown as AuditEvent };
      });
    }, this.securityContext);
    assertReplayOrder(events);
    return events;
  }

  async listProvenanceReferences(reference?: ObjectReference): Promise<ReadonlyArray<ProvenanceReference>> {
    return executeRead(this.pool, async (client) => {
      const values: unknown[] = [];
      let filter = "";
      if (reference) {
        values.push(reference.entity_type, reference.object_id, reference.entity_type, reference.object_id);
        filter = "WHERE (from_entity_type = $1 AND from_object_id = $2) OR (to_entity_type = $3 AND to_object_id = $4)";
      }
      const result = await client.query<{
        from_entity_type: string;
        from_object_id: string;
        to_entity_type: string;
        to_object_id: string;
        relation: string;
        record_json: unknown;
      }>(
        `SELECT from_entity_type, from_object_id, to_entity_type, to_object_id, relation, record_json
           FROM mef_provenance_references ${filter} ORDER BY provenance_sequence ASC`,
        values
      );
      return result.rows.map((row) => {
        const stored = assertStoredProvenance(row.record_json);
        if (
          stored.from.entity_type !== row.from_entity_type ||
          stored.from.object_id !== row.from_object_id ||
          stored.to.entity_type !== row.to_entity_type ||
          stored.to.object_id !== row.to_object_id ||
          stored.relation !== row.relation
        ) throw new OperationalStateError("PROVENANCE_INVALID");
        return stored;
      });
    }, this.securityContext);
  }

  async findSourceArtifact(sourceArtifactId: SourceArtifactId): Promise<SourceArtifact | undefined> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<{
        source_artifact_id: string;
        content_hash: string;
        storage_key: string;
        byte_size: number | string;
        record_json: unknown;
      }>(
        "SELECT source_artifact_id, content_hash, storage_key, byte_size, record_json FROM mef_source_artifacts WHERE source_artifact_id = $1",
        [sourceArtifactId]
      );
      if (result.rows.length === 0) return undefined;
      return assertStoredSourceArtifactRow(result.rows[0]);
    }, this.securityContext);
  }

  async insertOrGetSourceObservation(record: SourceObservationRecord): Promise<SourceObservationRecord> {
    assertSourceObservationRecord(record);
    try {
      return await withTransaction(
        this.pool,
        (client) => this.insertOrGetSourceObservationRecord(client, record),
        this.securityContext
      );
    } catch (error) {
      if (isOperationalStateError(error)) throw error;
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }
  }

  async findSourceObservation(sourceObservationId: string): Promise<SourceObservationRecord | undefined> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<SourceObservationRow>(
        `SELECT source_observation_id, organization_id, workspace_id, source_artifact_id,
                source_content_sha256, adapter_id, adapter_version, adk_api_version,
                adapter_qualification, schema_fingerprint, observation_sha256,
                observation_document, created_at
           FROM mef_source_observations
          WHERE source_observation_id = $1`,
        [sourceObservationId]
      );
      if (result.rows.length === 0) return undefined;
      return assertStoredSourceObservationRow(result.rows[0]);
    }, this.securityContext);
  }

  async findCanonicalAcquisition(input: {
    readonly sourceArtifactId: SourceArtifactId;
    readonly sourceObservationId: string;
    readonly canonicalizerVersion: string;
    readonly mappingManifestSha256: Sha256;
  }): Promise<CanonicalAcquisitionRecord | undefined> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<CanonicalAcquisitionRow>(
        `SELECT canonical_acquisition_id, organization_id, workspace_id, import_attempt_id,
                source_artifact_id, source_observation_id, canonicalizer_version,
                mapping_manifest_sha256, signal_artifact_sha256, signal_artifact_key,
                canonical_identity_sha256, acquisition_document, created_at
           FROM mef_ml104_canonical_acquisitions
          WHERE source_artifact_id = $1
            AND source_observation_id = $2
            AND canonicalizer_version = $3
            AND mapping_manifest_sha256 = $4`,
        [input.sourceArtifactId, input.sourceObservationId, input.canonicalizerVersion, input.mappingManifestSha256]
      );
      if (result.rows.length === 0) return undefined;
      return assertStoredCanonicalAcquisitionRow(result.rows[0]);
    }, this.securityContext);
  }

  async insertOrGetCanonicalAcquisition(record: CanonicalAcquisitionRecord): Promise<CanonicalAcquisitionRecord> {
    assertCanonicalAcquisitionRecord(record);
    try {
      return await withTransaction(
        this.pool,
        (client) => this.insertOrGetCanonicalAcquisitionRecord(client, record),
        this.securityContext
      );
    } catch (error) {
      if (isOperationalStateError(error)) throw error;
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }
  }

  async findConfigurationResolution(input: {
    readonly canonicalIdentitySha256: Sha256;
    readonly resolverVersion: string;
    readonly authorityVersion: string;
  }): Promise<ConfigurationResolutionRecord | undefined> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<ConfigurationResolutionRow>(
        `SELECT resolution_sha256, organization_id, workspace_id, import_attempt_id,
                source_artifact_id, source_observation_id, canonical_acquisition_id,
                canonical_identity_sha256, resolver_version, authority_version,
                configuration_state, physical_contract, resolution_document, created_at
           FROM mef_ml105_configuration_resolutions
          WHERE canonical_identity_sha256 = $1
            AND resolver_version = $2
            AND authority_version = $3`,
        [input.canonicalIdentitySha256, input.resolverVersion, input.authorityVersion]
      );
      if (result.rows.length === 0) return undefined;
      return assertStoredConfigurationResolutionRow(result.rows[0]);
    }, this.securityContext);
  }

  async insertOrGetConfigurationResolution(record: ConfigurationResolutionRecord): Promise<ConfigurationResolutionRecord> {
    assertConfigurationResolutionRecord(record);
    try {
      return await withTransaction(
        this.pool,
        (client) => this.insertOrGetConfigurationResolutionRecord(client, record),
        this.securityContext
      );
    } catch (error) {
      if (isOperationalStateError(error)) throw error;
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }
  }

  async findImportAttempts(sourceArtifactId: SourceArtifactId): Promise<ReadonlyArray<ImportAttempt>> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<{
        import_attempt_id: string;
        source_artifact_id: string;
        attempt_number: number | string;
        record_json: unknown;
      }>(
        "SELECT import_attempt_id, source_artifact_id, attempt_number, record_json FROM mef_import_attempts WHERE source_artifact_id = $1 ORDER BY attempt_number ASC, import_attempt_id ASC",
        [sourceArtifactId]
      );
      return result.rows.map((row) => assertStoredImportAttemptRow(row));
    }, this.securityContext);
  }

  async getRetentionAssessment(sourceArtifactId: SourceArtifactId): Promise<RetentionAssessment | undefined> {
    return executeRead(this.pool, async (client) => {
      const result = await client.query<{
        source_artifact_id: SourceArtifactId;
        status: RetentionAssessment["status"];
        policy_reference: string | null;
        hold_state: boolean;
        assessed_at: string | Date | null;
        revision: number | string;
      }>(
        "SELECT source_artifact_id, status, policy_reference, hold_state, assessed_at, revision FROM mef_artifact_retention WHERE source_artifact_id = $1",
        [sourceArtifactId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const assessment: RetentionAssessment = {
        source_artifact_id: row.source_artifact_id,
        status: row.status,
        policy_reference: row.policy_reference ?? undefined,
        hold_state: row.hold_state,
        assessed_at: row.assessed_at instanceof Date ? row.assessed_at.toISOString() : row.assessed_at ?? undefined,
        revision: Number(row.revision)
      };
      assertRetentionAssessment(assessment);
      return assessment;
    }, this.securityContext);
  }

  async setRetentionAssessment(assessment: RetentionAssessment): Promise<void> {
    assertRetentionAssessment(assessment);
    if (assessment.revision === undefined || !Number.isSafeInteger(assessment.revision) || assessment.revision < 1) {
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }
    await withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE mef_artifact_retention
            SET status = $2, policy_reference = $3, hold_state = $4, assessed_at = $5, revision = revision + 1
          WHERE source_artifact_id = $1 AND revision = $6`,
        [
          assessment.source_artifact_id,
          assessment.status,
          assessment.policy_reference ?? null,
          assessment.hold_state,
          assessment.assessed_at ?? null,
          assessment.revision
        ]
      );
      if (result.rowCount !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    }, this.securityContext);
  }

  private async insertOrGetSourceArtifact(client: SqlClient, source: SourceArtifact, contentObjectKey: string): Promise<SourceArtifact> {
    if (contentObjectKey !== contentAddressedKey(source.content_hash)) {
      throw new OperationalStateError("CONTENT_HASH_MISMATCH");
    }
    const inserted = await client.query<{ record_json: unknown }>(
      `INSERT INTO mef_source_artifacts
        (source_artifact_id, record_version, created_at, lifecycle_state, content_hash, byte_size,
         media_type, original_filename, ingested_at, source_declaration, immutable_source, storage_key, record_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb)
       ON CONFLICT (source_artifact_id) DO NOTHING
       RETURNING record_json`,
      [
        source.source_artifact_id,
        source.record_version,
        source.created_at,
        source.lifecycle_state,
        source.content_hash,
        source.byte_size,
        source.media_type,
        source.original_filename,
        source.ingested_at,
        JSON.stringify(source.source_declaration),
        source.immutable_source,
        contentObjectKey,
        JSON.stringify(source)
      ]
    );
    if (inserted.rows.length > 0) return assertStoredSourceArtifact(inserted.rows[0].record_json);

    const existing = await client.query<{
      source_artifact_id: string;
      content_hash: string;
      storage_key: string;
      byte_size: number | string;
      record_json: unknown;
    }>(
      "SELECT source_artifact_id, content_hash, storage_key, byte_size, record_json FROM mef_source_artifacts WHERE source_artifact_id = $1",
      [source.source_artifact_id]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    const record = assertStoredSourceArtifactRow(existing.rows[0]);
    assertSameSourceArtifact(record, source);
    return record;
  }

  private async insertOrGetImportAttempt(client: SqlClient, attempt: ImportAttempt): Promise<ImportAttempt> {
    const inserted = await client.query<{ record_json: unknown }>(
      `INSERT INTO mef_import_attempts
        (import_attempt_id, record_version, source_artifact_id, attempt_number, attempted_at, attempt_state, errors, record_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT (import_attempt_id) DO NOTHING
       RETURNING record_json`,
      [
        attempt.import_attempt_id,
        attempt.record_version,
        attempt.source_artifact_id,
        attempt.attempt_number,
        attempt.attempted_at,
        attempt.attempt_state,
        JSON.stringify(attempt.errors),
        JSON.stringify(attempt)
      ]
    );
    if (inserted.rows.length > 0) return assertStoredImportAttempt(inserted.rows[0].record_json);

    const existing = await client.query<{ record_json: unknown }>(
      "SELECT record_json FROM mef_import_attempts WHERE import_attempt_id = $1",
      [attempt.import_attempt_id]
    );
    if (existing.rows.length === 1) {
      const record = assertStoredImportAttempt(existing.rows[0].record_json);
      if (canonicalJson(record) !== canonicalJson(attempt)) {
        throw new OperationalStateError("DATABASE_TRANSACTION_FAILED", undefined, { retryable: false });
      }
      return record;
    }
    const numberConflict = await client.query<{ import_attempt_id: string }>(
      "SELECT import_attempt_id FROM mef_import_attempts WHERE source_artifact_id = $1 AND attempt_number = $2",
      [attempt.source_artifact_id, attempt.attempt_number]
    );
    if (numberConflict.rows.length > 0) {
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED", undefined, { retryable: false });
    }
    throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  }

  private async insertOrGetAuditEvent(client: SqlClient, event: AuditEvent): Promise<ReplayedAuditEvent> {
    const inserted = await client.query<{ audit_sequence: string; record_json: unknown }>(
      `INSERT INTO mef_audit_events
        (audit_event_id, record_version, occurred_at, actor, audit_action, object_reference,
         authority_type, reason, prior_reference, new_reference, immutable_history, record_json)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb)
       ON CONFLICT (audit_event_id) DO NOTHING
       RETURNING audit_sequence, record_json`,
      [
        event.audit_event_id,
        event.record_version,
        event.occurred_at,
        JSON.stringify(event.actor),
        event.audit_action,
        JSON.stringify(event.object),
        event.authority_type,
        event.reason,
        event.prior_reference ? JSON.stringify(event.prior_reference) : null,
        event.new_reference ? JSON.stringify(event.new_reference) : null,
        event.immutable_history,
        JSON.stringify(event)
      ]
    );
    if (inserted.rows.length > 0) {
      return { sequence: String(inserted.rows[0].audit_sequence), event: assertStoredAudit(inserted.rows[0].record_json) };
    }

    const existing = await client.query<{ audit_sequence: string; record_json: unknown }>(
      "SELECT audit_sequence, record_json FROM mef_audit_events WHERE audit_event_id = $1",
      [event.audit_event_id]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("AUDIT_APPEND_FAILED");
    const record = assertStoredAudit(existing.rows[0].record_json);
    if (canonicalJson(record) !== canonicalJson(event)) {
      throw new OperationalStateError("AUDIT_APPEND_FAILED", undefined, { retryable: false });
    }
    return { sequence: String(existing.rows[0].audit_sequence), event: record };
  }

  private async insertOrGetProvenance(client: SqlClient, reference: ProvenanceReference): Promise<ProvenanceReference> {
    const inserted = await client.query<{ record_json: unknown }>(
      `INSERT INTO mef_provenance_references
        (from_entity_type, from_object_id, to_entity_type, to_object_id, relation, created_at, record_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (from_entity_type, from_object_id, to_entity_type, to_object_id, relation) DO NOTHING
       RETURNING record_json`,
      [
        reference.from.entity_type,
        reference.from.object_id,
        reference.to.entity_type,
        reference.to.object_id,
        reference.relation,
        reference.created_at,
        JSON.stringify(reference)
      ]
    );
    if (inserted.rows.length > 0) return assertStoredProvenance(inserted.rows[0].record_json);

    const existing = await client.query<{ record_json: unknown }>(
      `SELECT record_json
         FROM mef_provenance_references
        WHERE from_entity_type = $1 AND from_object_id = $2
          AND to_entity_type = $3 AND to_object_id = $4 AND relation = $5`,
      [
        reference.from.entity_type,
        reference.from.object_id,
        reference.to.entity_type,
        reference.to.object_id,
        reference.relation
      ]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("PROVENANCE_INVALID");
    const stored = assertStoredProvenance(existing.rows[0].record_json);
    if (canonicalJson(stored) !== canonicalJson(reference)) throw new OperationalStateError("PROVENANCE_INVALID");
    return stored;
  }

  private async insertOrGetSourceObservationRecord(client: SqlClient, record: SourceObservationRecord): Promise<SourceObservationRecord> {
    const inserted = await client.query<SourceObservationRow>(
      `INSERT INTO mef_source_observations
        (source_observation_id, organization_id, workspace_id, source_artifact_id,
         source_content_sha256, adapter_id, adapter_version, adk_api_version,
         adapter_qualification, schema_fingerprint, observation_sha256,
         observation_document, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       ON CONFLICT (organization_id, workspace_id, source_artifact_id, adapter_id, adapter_version, adk_api_version)
       DO NOTHING
       RETURNING source_observation_id, organization_id, workspace_id, source_artifact_id,
                 source_content_sha256, adapter_id, adapter_version, adk_api_version,
                 adapter_qualification, schema_fingerprint, observation_sha256,
                 observation_document, created_at`,
      [
        record.sourceObservationId,
        record.organizationId,
        record.workspaceId,
        record.sourceArtifactId,
        record.sourceContentSha256,
        record.adapterId,
        record.adapterVersion,
        record.adkApiVersion,
        record.adapterQualification,
        record.schemaFingerprint,
        record.observationSha256,
        JSON.stringify(record.observationDocument),
        record.createdAt
      ]
    );
    if (inserted.rows.length > 0) return assertStoredSourceObservationRow(inserted.rows[0]);

    const existing = await client.query<SourceObservationRow>(
      `SELECT source_observation_id, organization_id, workspace_id, source_artifact_id,
              source_content_sha256, adapter_id, adapter_version, adk_api_version,
              adapter_qualification, schema_fingerprint, observation_sha256,
              observation_document, created_at
         FROM mef_source_observations
        WHERE organization_id = $1 AND workspace_id = $2 AND source_artifact_id = $3
          AND adapter_id = $4 AND adapter_version = $5 AND adk_api_version = $6`,
      [record.organizationId, record.workspaceId, record.sourceArtifactId, record.adapterId, record.adapterVersion, record.adkApiVersion]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    const stored = assertStoredSourceObservationRow(existing.rows[0]);
    if (!sameSourceObservation(stored, record)) throw new OperationalStateError("CONTRACT_INVALID");
    return stored;
  }

  private async insertOrGetCanonicalAcquisitionRecord(client: SqlClient, record: CanonicalAcquisitionRecord): Promise<CanonicalAcquisitionRecord> {
    const inserted = await client.query<CanonicalAcquisitionRow>(
      `INSERT INTO mef_ml104_canonical_acquisitions
        (canonical_acquisition_id, organization_id, workspace_id, import_attempt_id,
         source_artifact_id, source_observation_id, canonicalizer_version,
         mapping_manifest_sha256, signal_artifact_sha256, signal_artifact_key,
         canonical_identity_sha256, acquisition_document, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       ON CONFLICT (organization_id, workspace_id, source_artifact_id, source_observation_id, canonicalizer_version, mapping_manifest_sha256)
       DO NOTHING
       RETURNING canonical_acquisition_id, organization_id, workspace_id, import_attempt_id,
                 source_artifact_id, source_observation_id, canonicalizer_version,
                 mapping_manifest_sha256, signal_artifact_sha256, signal_artifact_key,
                 canonical_identity_sha256, acquisition_document, created_at`,
      [
        record.canonicalAcquisitionId,
        record.organizationId,
        record.workspaceId,
        record.importAttemptId,
        record.sourceArtifactId,
        record.sourceObservationId,
        record.canonicalizerVersion,
        record.mappingManifestSha256,
        record.signalArtifactSha256,
        record.signalArtifactKey,
        record.canonicalIdentitySha256,
        JSON.stringify(record.acquisition),
        record.createdAt
      ]
    );
    if (inserted.rows.length > 0) return assertStoredCanonicalAcquisitionRow(inserted.rows[0]);

    const existing = await client.query<CanonicalAcquisitionRow>(
      `SELECT canonical_acquisition_id, organization_id, workspace_id, import_attempt_id,
              source_artifact_id, source_observation_id, canonicalizer_version,
              mapping_manifest_sha256, signal_artifact_sha256, signal_artifact_key,
              canonical_identity_sha256, acquisition_document, created_at
         FROM mef_ml104_canonical_acquisitions
        WHERE organization_id = $1 AND workspace_id = $2 AND source_artifact_id = $3
          AND source_observation_id = $4 AND canonicalizer_version = $5
          AND mapping_manifest_sha256 = $6`,
      [record.organizationId, record.workspaceId, record.sourceArtifactId, record.sourceObservationId, record.canonicalizerVersion, record.mappingManifestSha256]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    const stored = assertStoredCanonicalAcquisitionRow(existing.rows[0]);
    if (!sameCanonicalAcquisition(stored, record)) throw new OperationalStateError("CONTRACT_INVALID");
    return stored;
  }

  private async insertOrGetConfigurationResolutionRecord(client: SqlClient, record: ConfigurationResolutionRecord): Promise<ConfigurationResolutionRecord> {
    const inserted = await client.query<ConfigurationResolutionRow>(
      `INSERT INTO mef_ml105_configuration_resolutions
        (resolution_sha256, organization_id, workspace_id, import_attempt_id,
         source_artifact_id, source_observation_id, canonical_acquisition_id,
         canonical_identity_sha256, resolver_version, authority_version,
         configuration_state, physical_contract, resolution_document, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
       ON CONFLICT (organization_id, workspace_id, canonical_identity_sha256, resolver_version, authority_version)
       DO NOTHING
       RETURNING resolution_sha256, organization_id, workspace_id, import_attempt_id,
                 source_artifact_id, source_observation_id, canonical_acquisition_id,
                 canonical_identity_sha256, resolver_version, authority_version,
                 configuration_state, physical_contract, resolution_document, created_at`,
      [
        record.resolutionSha256,
        record.organizationId,
        record.workspaceId,
        record.importAttemptId,
        record.sourceArtifactId,
        record.sourceObservationId,
        record.canonicalAcquisitionId,
        record.canonicalIdentitySha256,
        record.resolverVersion,
        record.authorityVersion,
        record.configurationState,
        record.physicalContract,
        JSON.stringify(record.resolutionDocument),
        record.createdAt
      ]
    );
    if (inserted.rows.length > 0) return assertStoredConfigurationResolutionRow(inserted.rows[0]);

    const existing = await client.query<ConfigurationResolutionRow>(
      `SELECT resolution_sha256, organization_id, workspace_id, import_attempt_id,
              source_artifact_id, source_observation_id, canonical_acquisition_id,
              canonical_identity_sha256, resolver_version, authority_version,
              configuration_state, physical_contract, resolution_document, created_at
         FROM mef_ml105_configuration_resolutions
        WHERE organization_id = $1 AND workspace_id = $2
          AND canonical_identity_sha256 = $3 AND resolver_version = $4
          AND authority_version = $5`,
      [record.organizationId, record.workspaceId, record.canonicalIdentitySha256, record.resolverVersion, record.authorityVersion]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
    const stored = assertStoredConfigurationResolutionRow(existing.rows[0]);
    if (!sameConfigurationResolution(stored, record)) throw new OperationalStateError("CONTRACT_INVALID");
    return stored;
  }

  private async insertOrGetRetention(client: SqlClient, assessment: RetentionAssessment, explicit: boolean): Promise<void> {
    const inserted = await client.query(
      `INSERT INTO mef_artifact_retention
        (source_artifact_id, status, policy_reference, hold_state, assessed_at, revision)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (source_artifact_id) DO NOTHING
       RETURNING source_artifact_id`,
      [
        assessment.source_artifact_id,
        assessment.status,
        assessment.policy_reference ?? null,
        assessment.hold_state,
        assessment.assessed_at ?? null
      ]
    );
    if (!explicit || inserted.rows.length > 0) return;
    const existing = await client.query<{
      source_artifact_id: string;
      status: RetentionAssessment["status"];
      policy_reference: string | null;
      hold_state: boolean;
      assessed_at: string | Date | null;
      revision: number | string;
    }>(
      `SELECT source_artifact_id, status, policy_reference, hold_state, assessed_at, revision
         FROM mef_artifact_retention WHERE source_artifact_id = $1`,
      [assessment.source_artifact_id]
    );
    if (existing.rows.length !== 1) throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
    const row = existing.rows[0];
    const stored: RetentionAssessment = {
      source_artifact_id: row.source_artifact_id as RetentionAssessment["source_artifact_id"],
      status: row.status,
      policy_reference: row.policy_reference ?? undefined,
      hold_state: row.hold_state,
      assessed_at: row.assessed_at instanceof Date ? row.assessed_at.toISOString() : row.assessed_at ?? undefined,
      revision: Number(row.revision)
    };
    assertRetentionAssessment(stored);
    if (canonicalJson(retentionComparable(stored)) !== canonicalJson(retentionComparable(assessment))) {
      throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
    }
  }
}

interface SourceObservationRow extends Record<string, unknown> {
  readonly source_observation_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly source_artifact_id: string;
  readonly source_content_sha256: string;
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly adk_api_version: string;
  readonly adapter_qualification: SourceObservationRecord["adapterQualification"];
  readonly schema_fingerprint: string;
  readonly observation_sha256: string;
  readonly observation_document: unknown;
  readonly created_at: string | Date;
}

interface CanonicalAcquisitionRow extends Record<string, unknown> {
  readonly canonical_acquisition_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly import_attempt_id: string;
  readonly source_artifact_id: string;
  readonly source_observation_id: string;
  readonly canonicalizer_version: string;
  readonly mapping_manifest_sha256: string;
  readonly signal_artifact_sha256: string;
  readonly signal_artifact_key: string;
  readonly canonical_identity_sha256: string;
  readonly acquisition_document: unknown;
  readonly created_at: string | Date;
}

interface ConfigurationResolutionRow extends Record<string, unknown> {
  readonly resolution_sha256: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly import_attempt_id: string;
  readonly source_artifact_id: string;
  readonly source_observation_id: string;
  readonly canonical_acquisition_id: string;
  readonly canonical_identity_sha256: string;
  readonly resolver_version: string;
  readonly authority_version: string;
  readonly configuration_state: ConfigurationResolutionRecord["configurationState"];
  readonly physical_contract: ConfigurationResolutionRecord["physicalContract"];
  readonly resolution_document: unknown;
  readonly created_at: string | Date;
}

function assertStoredSourceObservationRow(row: SourceObservationRow): SourceObservationRecord {
  const document = recordObject(row.observation_document);
  const record: SourceObservationRecord = {
    sourceObservationId: row.source_observation_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    sourceArtifactId: row.source_artifact_id as SourceArtifactId,
    sourceContentSha256: row.source_content_sha256,
    adapterId: row.adapter_id,
    adapterVersion: row.adapter_version,
    adkApiVersion: row.adk_api_version,
    adapterQualification: row.adapter_qualification,
    schemaFingerprint: row.schema_fingerprint,
    observationSha256: row.observation_sha256,
    observationDocument: document,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
  assertSourceObservationRecord(record);
  return record;
}

function assertStoredCanonicalAcquisitionRow(row: CanonicalAcquisitionRow): CanonicalAcquisitionRecord {
  const acquisition = recordObject(row.acquisition_document);
  const record: CanonicalAcquisitionRecord = {
    canonicalAcquisitionId: row.canonical_acquisition_id as CanonicalAcquisitionRecord["canonicalAcquisitionId"],
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    importAttemptId: row.import_attempt_id,
    sourceArtifactId: row.source_artifact_id as SourceArtifactId,
    sourceObservationId: row.source_observation_id as CanonicalAcquisitionRecord["sourceObservationId"],
    canonicalizerVersion: row.canonicalizer_version,
    mappingManifestSha256: row.mapping_manifest_sha256 as Sha256,
    signalArtifactSha256: row.signal_artifact_sha256 as Sha256,
    signalArtifactKey: row.signal_artifact_key,
    canonicalIdentitySha256: row.canonical_identity_sha256 as Sha256,
    acquisition: acquisition as unknown as CanonicalAcquisitionRecord["acquisition"],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
  assertCanonicalAcquisitionRecord(record);
  return record;
}

function assertStoredConfigurationResolutionRow(row: ConfigurationResolutionRow): ConfigurationResolutionRecord {
  const resolutionDocument = recordObject(row.resolution_document) as unknown as ConfigurationResolutionRecord["resolutionDocument"];
  const record: ConfigurationResolutionRecord = {
    resolutionSha256: row.resolution_sha256 as ConfigurationResolutionRecord["resolutionSha256"],
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    importAttemptId: row.import_attempt_id,
    sourceArtifactId: row.source_artifact_id as SourceArtifactId,
    sourceObservationId: row.source_observation_id as ConfigurationResolutionRecord["sourceObservationId"],
    canonicalAcquisitionId: row.canonical_acquisition_id as ConfigurationResolutionRecord["canonicalAcquisitionId"],
    canonicalIdentitySha256: row.canonical_identity_sha256 as Sha256,
    resolverVersion: row.resolver_version,
    authorityVersion: row.authority_version,
    configurationState: row.configuration_state,
    physicalContract: row.physical_contract,
    resolutionDocument,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
  assertConfigurationResolutionRecord(record);
  return record;
}

function assertStoredAudit(value: unknown): AuditEvent {
  const record = recordObject(value);
  assertAuditEvent(record);
  return record as unknown as AuditEvent;
}

function assertStoredProvenance(value: unknown): ProvenanceReference {
  const record = recordObject(value);
  assertProvenanceReference(record);
  return record as unknown as ProvenanceReference;
}

function retentionComparable(value: RetentionAssessment): Record<string, unknown> {
  const comparable: Record<string, unknown> = {
    source_artifact_id: value.source_artifact_id,
    status: value.status,
    hold_state: value.hold_state
  };
  if (value.policy_reference !== undefined) comparable.policy_reference = value.policy_reference;
  if (value.assessed_at !== undefined) comparable.assessed_at = value.assessed_at;
  return comparable;
}
