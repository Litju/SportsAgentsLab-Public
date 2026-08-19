import { randomUUID } from "node:crypto";
import type { Timestamp } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";
import { executeRead, withTransaction } from "./transaction.ts";
import type { TransactionSecurityContext } from "./security.ts";
import type { SqlClient, SqlPool } from "./sql.ts";

export const ML102_SOURCE_IMPORT_STATES = [
  "CREATED",
  "UPLOAD_AUTHORIZED",
  "UPLOADING",
  "UPLOADED",
  "IDENTIFYING",
  "IDENTIFIED",
  "STORED",
  "READY_FOR_ADAPTER",
  "UNSUPPORTED",
  "MALFORMED",
  "UPLOAD_FAILED",
  "STORAGE_FAILED",
  "HASH_FAILED",
  "FINALIZATION_FAILED",
  "CANCELLED",
  "BLOCKED"
] as const;

export type SourceImportState = typeof ML102_SOURCE_IMPORT_STATES[number];

export const ML102_SOURCE_IMPORT_FAILURE_CODES = [
  "EMPTY_INPUT",
  "DECLARED_SIZE_MISMATCH",
  "DECLARED_MEDIA_TYPE_MISMATCH",
  "OVERSIZE_INPUT",
  "UNSUPPORTED_MEDIA_TYPE",
  "UPLOAD_TRANSPORT_FAILED",
  "STORAGE_READ_FAILED",
  "STORAGE_WRITE_FAILED",
  "HASH_VERIFICATION_FAILED",
  "DATABASE_FINALIZATION_FAILED",
  "INVALID_UPLOAD_FINALIZATION",
  "ASSOCIATION_UNAVAILABLE",
  "CANCELLED_BY_USER"
] as const;

export type SourceImportFailureCode = typeof ML102_SOURCE_IMPORT_FAILURE_CODES[number];

export const ML102_SOURCE_IMPORT_EVENT_CODES = [
  "ATTEMPT_CREATED",
  "UPLOAD_AUTHORIZED",
  "UPLOAD_STARTED",
  "UPLOAD_COMPLETED",
  "HASH_STARTED",
  "HASH_VERIFIED",
  "DUPLICATE_CONTENT_DETECTED",
  "SOURCE_ARTIFACT_ESTABLISHED",
  "IMPORT_UNSUPPORTED",
  "IMPORT_MALFORMED",
  "IMPORT_FAILED",
  "IMPORT_CANCELLED",
  "ORIGINAL_BYTES_RETRIEVED",
  "FINALIZATION_FAILED",
  "STORAGE_FAILED",
  "HASH_FAILED",
  "ADAPTER_BOUNDARY_RECORDED"
] as const;

export type SourceImportEventCode = typeof ML102_SOURCE_IMPORT_EVENT_CODES[number];

export type ScientificEligibility = "INELIGIBLE";

const SOURCE_IMPORT_ID_PATTERN = /^imp_[a-z0-9][a-z0-9_-]{0,127}$/u;
const SOURCE_ARTIFACT_ID_PATTERN = /^src_[a-z0-9][a-z0-9_-]{0,127}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MEDIA_TYPE_PATTERN = /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/u;
const MAX_FILENAME_LENGTH = 512;
const MAX_FAILURE_DETAIL_LENGTH = 1000;

const ALLOWED_TRANSITIONS: Readonly<Record<SourceImportState, ReadonlyArray<SourceImportState>>> = {
  CREATED: ["UPLOAD_AUTHORIZED", "CANCELLED", "BLOCKED"],
  UPLOAD_AUTHORIZED: ["UPLOADING", "UPLOAD_FAILED", "CANCELLED", "BLOCKED"],
  UPLOADING: ["UPLOADED", "UPLOAD_FAILED", "CANCELLED", "BLOCKED"],
  UPLOADED: ["IDENTIFYING", "UPLOAD_FAILED", "CANCELLED", "BLOCKED"],
  IDENTIFYING: ["IDENTIFIED", "MALFORMED", "STORAGE_FAILED", "HASH_FAILED", "FINALIZATION_FAILED", "CANCELLED", "BLOCKED"],
  IDENTIFIED: ["STORED", "UNSUPPORTED", "MALFORMED", "STORAGE_FAILED", "FINALIZATION_FAILED", "CANCELLED", "BLOCKED"],
  STORED: ["READY_FOR_ADAPTER", "FINALIZATION_FAILED", "CANCELLED"],
  READY_FOR_ADAPTER: [],
  UNSUPPORTED: [],
  MALFORMED: [],
  UPLOAD_FAILED: [],
  STORAGE_FAILED: ["IDENTIFYING", "CANCELLED", "BLOCKED"],
  HASH_FAILED: ["IDENTIFYING", "CANCELLED", "BLOCKED"],
  FINALIZATION_FAILED: ["IDENTIFYING", "CANCELLED", "BLOCKED"],
  CANCELLED: [],
  BLOCKED: []
};

export class SourceImportError extends OperationalStateError {
  readonly sourceImportCode: "NOT_FOUND" | "INVALID_REQUEST" | "INVALID_TRANSITION" | "CONFLICT";
  readonly status: 400 | 404 | 409;

  constructor(
    code: "NOT_FOUND" | "INVALID_REQUEST" | "INVALID_TRANSITION" | "CONFLICT",
    message: string,
    status: 400 | 404 | 409
  ) {
    super("CONTRACT_INVALID", message, { retryable: code === "CONFLICT" });
    this.name = "SourceImportError";
    this.sourceImportCode = code;
    this.status = status;
  }
}

export interface SourceImportAttempt {
  readonly importAttemptId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly recordVersion: number;
  readonly attemptNumber: number;
  readonly sourceArtifactId?: string;
  readonly originalFilename: string;
  readonly declaredContentType: string;
  readonly declaredSizeBytes: number;
  readonly actualSizeBytes?: number;
  readonly contentHash?: string;
  readonly storageKey?: string;
  readonly stagingBlobPath: string;
  readonly state: SourceImportState;
  readonly failureCode?: SourceImportFailureCode;
  readonly safeFailureDetail?: string;
  readonly createdAt: Timestamp;
  readonly uploadStartedAt?: Timestamp;
  readonly uploadCompletedAt?: Timestamp;
  readonly identityCompletedAt?: Timestamp;
  readonly finalizedAt?: Timestamp;
  readonly athleteId?: string;
  readonly sessionId?: string;
  readonly duplicateOfImportAttemptId?: string;
  readonly auditEventId?: string;
  readonly scientificEligibility: ScientificEligibility;
}

export interface SourceImportEvent {
  readonly eventId: string;
  readonly importAttemptId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly fromState?: SourceImportState;
  readonly toState?: SourceImportState;
  readonly eventCode: SourceImportEventCode;
  readonly occurredAt: Timestamp;
  readonly actorId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CreateSourceImportInput {
  readonly importAttemptId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly originalFilename: string;
  readonly declaredContentType: string;
  readonly declaredSizeBytes: number;
  readonly createdAt: Timestamp;
  readonly athleteId?: string;
  readonly sessionId?: string;
}

export interface SourceImportTransitionPatch {
  readonly actualSizeBytes?: number | null;
  readonly contentHash?: string | null;
  readonly storageKey?: string | null;
  readonly sourceArtifactId?: string | null;
  readonly duplicateOfImportAttemptId?: string | null;
  readonly failureCode?: SourceImportFailureCode | null;
  readonly safeFailureDetail?: string | null;
  readonly auditEventId?: string | null;
  readonly uploadStartedAt?: Timestamp | null;
  readonly uploadCompletedAt?: Timestamp | null;
  readonly identityCompletedAt?: Timestamp | null;
  readonly finalizedAt?: Timestamp | null;
}

export interface SourceImportTransitionInput {
  readonly importAttemptId: string;
  readonly toState: SourceImportState;
  readonly eventCode: SourceImportEventCode;
  readonly occurredAt: Timestamp;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  readonly patch?: SourceImportTransitionPatch;
}

export interface SourceImportIdentityInput {
  readonly importAttemptId: string;
  readonly actualSizeBytes: number;
  readonly contentHash: string;
  readonly storageKey: string;
  readonly sourceArtifactId: string;
  readonly auditEventId: string;
  readonly identityCompletedAt: Timestamp;
  readonly occurredAt: Timestamp;
}

export interface SourceImportFinalizationInput {
  readonly importAttemptId: string;
  readonly toState: "STORED" | "READY_FOR_ADAPTER" | "UNSUPPORTED" | "MALFORMED";
  readonly occurredAt: Timestamp;
  readonly eventCode: "SOURCE_ARTIFACT_ESTABLISHED" | "IMPORT_UNSUPPORTED" | "IMPORT_MALFORMED" | "ADAPTER_BOUNDARY_RECORDED";
  readonly failureCode?: SourceImportFailureCode;
  readonly safeFailureDetail?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SourceImportRepository {
  create(input: CreateSourceImportInput): Promise<SourceImportAttempt>;
  get(importAttemptId: string): Promise<SourceImportAttempt | undefined>;
  list(limit?: number): Promise<ReadonlyArray<SourceImportAttempt>>;
  transition(input: SourceImportTransitionInput): Promise<SourceImportAttempt>;
  setIdentity(input: SourceImportIdentityInput): Promise<SourceImportAttempt>;
  finalize(input: SourceImportFinalizationInput): Promise<SourceImportAttempt>;
  recordEvent(input: {
    readonly importAttemptId: string;
    readonly eventCode: SourceImportEventCode;
    readonly occurredAt: Timestamp;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<void>;
  listEvents(importAttemptId: string): Promise<ReadonlyArray<SourceImportEvent>>;
}

export function assertSourceImportId(value: string): void {
  if (!SOURCE_IMPORT_ID_PATTERN.test(value)) {
    throw new SourceImportError("INVALID_REQUEST", "The import attempt identity is invalid.", 400);
  }
}

export function sourceArtifactIdForImportAttempt(importAttemptId: string): string {
  assertSourceImportId(importAttemptId);
  const candidate = `src_${importAttemptId.slice(4)}`;
  if (!SOURCE_ARTIFACT_ID_PATTERN.test(candidate)) {
    throw new SourceImportError("INVALID_REQUEST", "The source artifact identity is invalid.", 400);
  }
  return candidate;
}

export function assertSourceImportTransition(fromState: SourceImportState, toState: SourceImportState): void {
  if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
    throw new SourceImportError("INVALID_TRANSITION", `The import cannot move from ${fromState} to ${toState}.`, 409);
  }
}

export function sourceImportTransitionAllowed(fromState: SourceImportState, toState: SourceImportState): boolean {
  return ALLOWED_TRANSITIONS[fromState].includes(toState);
}

export function sourceImportIsTerminal(state: SourceImportState): boolean {
  return ["READY_FOR_ADAPTER", "UNSUPPORTED", "MALFORMED", "UPLOAD_FAILED", "CANCELLED", "BLOCKED"].includes(state);
}

export function sourceImportFailureIsRetryable(state: SourceImportState): boolean {
  return ["STORAGE_FAILED", "HASH_FAILED", "FINALIZATION_FAILED"].includes(state);
}

export function assertSourceImportCreateInput(input: CreateSourceImportInput): void {
  assertSourceImportId(input.importAttemptId);
  if (input.originalFilename.length === 0 || input.originalFilename.length > MAX_FILENAME_LENGTH || /[\u0000\r\n]/u.test(input.originalFilename)) {
    throw new SourceImportError("INVALID_REQUEST", "The original filename is invalid.", 400);
  }
  if (!MEDIA_TYPE_PATTERN.test(input.declaredContentType)) {
    throw new SourceImportError("INVALID_REQUEST", "The declared media type is invalid.", 400);
  }
  if (!Number.isSafeInteger(input.declaredSizeBytes) || input.declaredSizeBytes < 0) {
    throw new SourceImportError("INVALID_REQUEST", "The declared file size is invalid.", 400);
  }
  if (input.athleteId !== undefined || input.sessionId !== undefined) {
    throw new SourceImportError("INVALID_REQUEST", "An athlete or measurement-session association was supplied, but B01-01 has no authoritative workspace association registry yet.", 400);
  }
}

export function assertSourceImportIdentity(input: SourceImportIdentityInput): void {
  assertSourceImportId(input.importAttemptId);
  if (!Number.isSafeInteger(input.actualSizeBytes) || input.actualSizeBytes < 0) {
    throw new SourceImportError("INVALID_REQUEST", "The verified file size is invalid.", 400);
  }
  if (!SHA256_PATTERN.test(input.contentHash)) {
    throw new SourceImportError("INVALID_REQUEST", "The verified content identity is invalid.", 400);
  }
  if (input.storageKey !== `originals/sha256/${input.contentHash}`) {
    throw new SourceImportError("INVALID_REQUEST", "The content-addressed storage identity is invalid.", 400);
  }
  if (!SOURCE_ARTIFACT_ID_PATTERN.test(input.sourceArtifactId)) {
    throw new SourceImportError("INVALID_REQUEST", "The source artifact identity is invalid.", 400);
  }
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return 100;
  if (!Number.isSafeInteger(limit) || limit < 1) return 1;
  return Math.min(limit, 500);
}

function timestamp(value: unknown): Timestamp | undefined {
  if (value instanceof Date) return value.toISOString() as Timestamp;
  if (typeof value === "string" && value.length > 0) return value as Timestamp;
  return undefined;
}

function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type SourceImportRow = Record<string, unknown> & {
  import_attempt_id: string;
  organization_id: string;
  workspace_id: string;
  principal_id: string;
  record_version: number | string;
  attempt_number: number | string;
  source_artifact_id: string | null;
  original_filename: string;
  declared_content_type: string;
  declared_size_bytes: number | string;
  actual_size_bytes: number | string | null;
  content_hash: string | null;
  storage_key: string | null;
  staging_blob_path: string;
  state: SourceImportState;
  failure_code: SourceImportFailureCode | null;
  safe_failure_detail: string | null;
  created_at: string | Date;
  upload_started_at: string | Date | null;
  upload_completed_at: string | Date | null;
  identity_completed_at: string | Date | null;
  finalized_at: string | Date | null;
  athlete_id: string | null;
  session_id: string | null;
  duplicate_of_import_attempt_id: string | null;
  audit_event_id: string | null;
  scientific_eligibility: ScientificEligibility;
};

type SourceImportEventRow = Record<string, unknown> & {
  event_id: string;
  import_attempt_id: string;
  organization_id: string;
  workspace_id: string;
  from_state: SourceImportState | null;
  to_state: SourceImportState | null;
  event_code: SourceImportEventCode;
  occurred_at: string | Date;
  actor_id: string;
  metadata: unknown;
};

function asMetadata(value: unknown): Readonly<Record<string, string | number | boolean | null>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const bounded: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) bounded[key] = item;
  }
  return bounded;
}

function rowToAttempt(row: SourceImportRow): SourceImportAttempt {
  const createdAt = timestamp(row.created_at);
  if (!createdAt || !ML102_SOURCE_IMPORT_STATES.includes(row.state) || row.scientific_eligibility !== "INELIGIBLE") {
    throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  }
  return {
    importAttemptId: row.import_attempt_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    recordVersion: Number(row.record_version),
    attemptNumber: Number(row.attempt_number),
    sourceArtifactId: nullableString(row.source_artifact_id),
    originalFilename: row.original_filename,
    declaredContentType: row.declared_content_type,
    declaredSizeBytes: Number(row.declared_size_bytes),
    actualSizeBytes: row.actual_size_bytes === null ? undefined : Number(row.actual_size_bytes),
    contentHash: nullableString(row.content_hash),
    storageKey: nullableString(row.storage_key),
    stagingBlobPath: row.staging_blob_path,
    state: row.state,
    failureCode: row.failure_code ?? undefined,
    safeFailureDetail: row.safe_failure_detail ?? undefined,
    createdAt,
    uploadStartedAt: timestamp(row.upload_started_at),
    uploadCompletedAt: timestamp(row.upload_completed_at),
    identityCompletedAt: timestamp(row.identity_completed_at),
    finalizedAt: timestamp(row.finalized_at),
    athleteId: nullableString(row.athlete_id),
    sessionId: nullableString(row.session_id),
    duplicateOfImportAttemptId: nullableString(row.duplicate_of_import_attempt_id),
    auditEventId: nullableString(row.audit_event_id),
    scientificEligibility: "INELIGIBLE"
  };
}

function rowToEvent(row: SourceImportEventRow): SourceImportEvent {
  const occurredAt = timestamp(row.occurred_at);
  if (!occurredAt || !ML102_SOURCE_IMPORT_EVENT_CODES.includes(row.event_code)) {
    throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
  }
  return {
    eventId: row.event_id,
    importAttemptId: row.import_attempt_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    fromState: row.from_state ?? undefined,
    toState: row.to_state ?? undefined,
    eventCode: row.event_code,
    occurredAt,
    actorId: row.actor_id,
    metadata: asMetadata(row.metadata)
  };
}

function eventId(importAttemptId: string): string {
  return `imp_evt_${importAttemptId.slice(4)}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function eventMetadata(input: Readonly<Record<string, string | number | boolean | null>> | undefined): string {
  return JSON.stringify(input ?? {});
}

const SELECT_COLUMNS = `
  SELECT import_attempt_id, organization_id, workspace_id, principal_id,
         record_version, attempt_number, source_artifact_id,
         original_filename, declared_content_type, declared_size_bytes,
         actual_size_bytes, content_hash, storage_key, staging_blob_path,
         state, failure_code, safe_failure_detail, created_at,
         upload_started_at, upload_completed_at, identity_completed_at,
         finalized_at, athlete_id, session_id,
         duplicate_of_import_attempt_id, audit_event_id,
         scientific_eligibility
    FROM mef_ml102_import_attempts`;

export class PostgresSourceImportRepository implements SourceImportRepository {
  private readonly pool: SqlPool;
  private readonly context: TransactionSecurityContext;

  constructor(pool: SqlPool, context: TransactionSecurityContext) {
    this.pool = pool;
    this.context = context;
  }

  async create(input: CreateSourceImportInput): Promise<SourceImportAttempt> {
    assertSourceImportCreateInput(input);
    const stagingBlobPath = `staging/ml102/${input.importAttemptId}`;
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<SourceImportRow>(
        `INSERT INTO mef_ml102_import_attempts
          (import_attempt_id, organization_id, workspace_id, principal_id,
           record_version, attempt_number, original_filename,
           declared_content_type, declared_size_bytes, staging_blob_path,
           state, created_at, scientific_eligibility)
         VALUES ($1, $2, $3, $4, 1, 1, $5, $6, $7, $8, 'CREATED', $9, 'INELIGIBLE')
         RETURNING ${SELECT_COLUMNS.replace(/^\s*SELECT\s+/u, "").replace(/\s+FROM mef_ml102_import_attempts$/u, "")}`,
        [
          input.importAttemptId,
          input.organizationId,
          input.workspaceId,
          input.principalId,
          input.originalFilename,
          input.declaredContentType,
          input.declaredSizeBytes,
          stagingBlobPath,
          input.createdAt
        ]
      );
      if (inserted.rows.length !== 1) throw new OperationalStateError("DATABASE_TRANSACTION_FAILED");
      await this.insertEvent(client, input.importAttemptId, undefined, "CREATED", "ATTEMPT_CREATED", input.createdAt, {});
      return rowToAttempt(inserted.rows[0]);
    }, this.context);
  }

  async get(importAttemptId: string): Promise<SourceImportAttempt | undefined> {
    assertSourceImportId(importAttemptId);
    return executeRead(this.pool, async (client) => {
      const row = await this.select(client, importAttemptId, false);
      return row ? rowToAttempt(row) : undefined;
    }, this.context);
  }

  async list(limit = 100): Promise<ReadonlyArray<SourceImportAttempt>> {
    const bounded = boundedLimit(limit);
    return executeRead(this.pool, async (client) => {
      const result = await client.query<SourceImportRow>(
        `${SELECT_COLUMNS} ORDER BY created_at DESC, import_attempt_id DESC LIMIT $1`,
        [bounded]
      );
      return result.rows.map(rowToAttempt);
    }, this.context);
  }

  async transition(input: SourceImportTransitionInput): Promise<SourceImportAttempt> {
    assertSourceImportId(input.importAttemptId);
    return withTransaction(this.pool, async (client) => {
      const current = await this.select(client, input.importAttemptId, true);
      if (!current) throw new SourceImportError("NOT_FOUND", "The import attempt was not found.", 404);
      if (current.state === input.toState) return rowToAttempt(current);
      assertSourceImportTransition(current.state, input.toState);
      const updated = await this.updateAttempt(client, current, input.toState, input.patch);
      await this.insertEvent(client, input.importAttemptId, current.state, input.toState, input.eventCode, input.occurredAt, input.metadata);
      return rowToAttempt(updated);
    }, this.context);
  }

  async setIdentity(input: SourceImportIdentityInput): Promise<SourceImportAttempt> {
    assertSourceImportIdentity(input);
    return withTransaction(this.pool, async (client) => {
      const current = await this.select(client, input.importAttemptId, true);
      if (!current) throw new SourceImportError("NOT_FOUND", "The import attempt was not found.", 404);
      if (current.state === "IDENTIFIED" || current.state === "STORED" || current.state === "READY_FOR_ADAPTER" || current.state === "UNSUPPORTED" || current.state === "MALFORMED") {
        if (current.content_hash !== input.contentHash || Number(current.actual_size_bytes) !== input.actualSizeBytes || current.source_artifact_id !== input.sourceArtifactId) {
          throw new SourceImportError("CONFLICT", "The verified content identity conflicts with the recorded attempt.", 409);
        }
        return rowToAttempt(current);
      }
      if (current.state !== "IDENTIFYING") {
        assertSourceImportTransition(current.state, "IDENTIFIED");
      }
      const updated = await this.updateAttempt(client, current, "IDENTIFIED", {
        actualSizeBytes: input.actualSizeBytes,
        contentHash: input.contentHash,
        storageKey: input.storageKey,
        sourceArtifactId: input.sourceArtifactId,
        auditEventId: input.auditEventId,
        identityCompletedAt: input.identityCompletedAt,
        failureCode: null,
        safeFailureDetail: null
      });
      await this.insertEvent(client, input.importAttemptId, current.state, "IDENTIFIED", "HASH_VERIFIED", input.occurredAt, {
        byte_size: input.actualSizeBytes,
        hash_algorithm: "SHA-256"
      });
      return rowToAttempt(updated);
    }, this.context);
  }

  async recordEvent(input: {
    readonly importAttemptId: string;
    readonly eventCode: SourceImportEventCode;
    readonly occurredAt: Timestamp;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<void> {
    assertSourceImportId(input.importAttemptId);
    await withTransaction(this.pool, async (client) => {
      const current = await this.select(client, input.importAttemptId, true);
      if (!current) throw new SourceImportError("NOT_FOUND", "The import attempt was not found.", 404);
      await this.insertEvent(client, input.importAttemptId, current.state, current.state, input.eventCode, input.occurredAt, input.metadata);
    }, this.context);
  }

  async finalize(input: SourceImportFinalizationInput): Promise<SourceImportAttempt> {
    assertSourceImportId(input.importAttemptId);
    return withTransaction(this.pool, async (client) => {
      const current = await this.select(client, input.importAttemptId, true);
      if (!current) throw new SourceImportError("NOT_FOUND", "The import attempt was not found.", 404);
      if (
        current.state === input.toState
        || (input.toState === "STORED" && current.state === "READY_FOR_ADAPTER")
        || (input.toState === "READY_FOR_ADAPTER" && current.state === "READY_FOR_ADAPTER")
      ) return rowToAttempt(current);
      if (!current.content_hash || !current.storage_key || !current.source_artifact_id || current.actual_size_bytes === null) {
        throw new SourceImportError("CONFLICT", "The attempt has no verified source identity to finalize.", 409);
      }
      assertSourceImportTransition(current.state, input.toState);

      const identity = await client.query<Record<string, unknown>>(
        `INSERT INTO mef_ml102_content_identities
          (organization_id, workspace_id, content_hash, first_import_attempt_id,
           storage_key, actual_size_bytes, media_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (organization_id, workspace_id, content_hash) DO NOTHING
         RETURNING first_import_attempt_id`,
        [
          this.context.organizationId,
          this.context.workspaceId,
          current.content_hash,
          current.import_attempt_id,
          current.storage_key,
          current.actual_size_bytes,
          current.declared_content_type,
          input.occurredAt
        ]
      );
      const identityRow = identity.rows[0] as { first_import_attempt_id?: unknown } | undefined;
      let firstAttemptId: string;
      if (typeof identityRow?.first_import_attempt_id === "string") {
        firstAttemptId = identityRow.first_import_attempt_id;
      } else {
        const existing = await client.query<Record<string, unknown>>(
          `SELECT first_import_attempt_id, actual_size_bytes, storage_key, media_type
             FROM mef_ml102_content_identities
            WHERE organization_id = $1 AND workspace_id = $2 AND content_hash = $3`,
          [this.context.organizationId, this.context.workspaceId, current.content_hash]
        );
        const row = existing.rows[0] as { first_import_attempt_id?: unknown; actual_size_bytes?: unknown; storage_key?: unknown; media_type?: unknown } | undefined;
        if (
          typeof row?.first_import_attempt_id !== "string" ||
          Number(row.actual_size_bytes) !== Number(current.actual_size_bytes) ||
          row.storage_key !== current.storage_key
        ) throw new SourceImportError("CONFLICT", "The shared content identity is inconsistent.", 409);
        firstAttemptId = row.first_import_attempt_id;
      }

      const duplicateOf = firstAttemptId === current.import_attempt_id ? null : firstAttemptId;
      const updated = await this.updateAttempt(client, current, input.toState, {
        duplicateOfImportAttemptId: duplicateOf,
        finalizedAt: input.occurredAt,
        failureCode: input.failureCode ?? null,
        safeFailureDetail: input.safeFailureDetail === undefined ? null : safeFailureDetail(input.safeFailureDetail)
      });
      if (duplicateOf) {
        await this.insertEvent(client, input.importAttemptId, current.state, input.toState, "DUPLICATE_CONTENT_DETECTED", input.occurredAt, {
          content_hash: current.content_hash,
          duplicate_of_import_attempt_id: duplicateOf
        });
      }
      await this.insertEvent(client, input.importAttemptId, current.state, input.toState, input.eventCode, input.occurredAt, input.metadata);
      return rowToAttempt(updated);
    }, this.context);
  }

  async listEvents(importAttemptId: string): Promise<ReadonlyArray<SourceImportEvent>> {
    assertSourceImportId(importAttemptId);
    return executeRead(this.pool, async (client) => {
      const result = await client.query<SourceImportEventRow>(
        `SELECT event_id, import_attempt_id, organization_id, workspace_id,
                from_state, to_state, event_code, occurred_at, actor_id, metadata
           FROM mef_ml102_import_events
          WHERE import_attempt_id = $1
          ORDER BY event_sequence ASC`,
        [importAttemptId]
      );
      return result.rows.map(rowToEvent);
    }, this.context);
  }

  private async select(client: SqlClient, importAttemptId: string, forUpdate: boolean): Promise<SourceImportRow | undefined> {
    const result = await client.query<SourceImportRow>(`${SELECT_COLUMNS} WHERE import_attempt_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [importAttemptId]);
    return result.rows[0];
  }

  private async updateAttempt(
    client: SqlClient,
    current: SourceImportRow,
    toState: SourceImportState,
    patch: SourceImportTransitionPatch | undefined
  ): Promise<SourceImportRow> {
    const next = <T>(value: T | null | undefined, fallback: T | null): T | null => value === undefined ? fallback : value;
    const values: ReadonlyArray<unknown> = [
      toState,
      Number(current.record_version) + 1,
      next(patch?.actualSizeBytes, current.actual_size_bytes),
      next(patch?.contentHash, current.content_hash),
      next(patch?.storageKey, current.storage_key),
      next(patch?.sourceArtifactId, current.source_artifact_id),
      next(patch?.duplicateOfImportAttemptId, current.duplicate_of_import_attempt_id),
      next(patch?.failureCode, current.failure_code),
      next(patch?.safeFailureDetail, current.safe_failure_detail),
      next(patch?.auditEventId, current.audit_event_id),
      next(patch?.uploadStartedAt, current.upload_started_at),
      next(patch?.uploadCompletedAt, current.upload_completed_at),
      next(patch?.identityCompletedAt, current.identity_completed_at),
      next(patch?.finalizedAt, current.finalized_at),
      current.import_attempt_id,
      Number(current.record_version)
    ];
    const result = await client.query<SourceImportRow>(
      `UPDATE mef_ml102_import_attempts
          SET state = $1,
              record_version = $2,
              actual_size_bytes = $3,
              content_hash = $4,
              storage_key = $5,
              source_artifact_id = $6,
              duplicate_of_import_attempt_id = $7,
              failure_code = $8,
              safe_failure_detail = $9,
              audit_event_id = $10,
              upload_started_at = $11,
              upload_completed_at = $12,
              identity_completed_at = $13,
              finalized_at = $14
        WHERE import_attempt_id = $15
          AND record_version = $16
       RETURNING ${SELECT_COLUMNS.replace(/^\s*SELECT\s+/u, "").replace(/\s+FROM mef_ml102_import_attempts$/u, "")}`,
      values
    );
    if (result.rows.length !== 1) throw new SourceImportError("CONFLICT", "The import attempt changed while it was being finalized.", 409);
    return result.rows[0];
  }

  private async insertEvent(
    client: SqlClient,
    importAttemptId: string,
    fromState: SourceImportState | undefined,
    toState: SourceImportState,
    eventCode: SourceImportEventCode,
    occurredAt: Timestamp,
    metadata: Readonly<Record<string, string | number | boolean | null>> | undefined
  ): Promise<void> {
    await client.query(
      `INSERT INTO mef_ml102_import_events
        (event_id, import_attempt_id, organization_id, workspace_id,
         from_state, to_state, event_code, occurred_at, actor_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        eventId(importAttemptId),
        importAttemptId,
        this.context.organizationId,
        this.context.workspaceId,
        fromState ?? null,
        toState,
        eventCode,
        occurredAt,
        this.context.principalId,
        eventMetadata(metadata)
      ]
    );
  }
}

export function safeFailureDetail(value: string): string {
  const bounded = value.replace(/[\u0000\r\n]+/gu, " ").trim();
  return bounded.slice(0, MAX_FAILURE_DETAIL_LENGTH) || "The import could not be completed.";
}
