import { randomUUID } from "node:crypto";
import {
  CANONICALIZER_VERSION,
  REFERENCE_MAPPING_MANIFEST,
  canonicalize,
  mappingManifestSha256,
  type CanonicalizationResult
} from "@mef/canonical-acquisition";
import {
  AdapterRegistry,
  REFERENCE_ADAPTER,
  createDefaultBudget,
  createMemorySourceReader,
  sourceObservationIdFor,
  validateSourceObservation,
  type AdapterResolution,
  type SourceObservation
} from "@mef/ingestion-adk";
import type {
  AuditEvent,
  ContractError,
  ImportAttempt,
  ImportAttemptId,
  NonEmptyString,
  SemanticDeclaration,
  Sha256,
  SourceArtifact,
  SourceArtifactId,
  Timestamp
} from "@mef/generated-ts";
import {
  OperationalStateError,
  PostgresOperationalStore,
  PostgresSourceImportRepository,
  type CanonicalAcquisitionRecord,
  type SourceImportAttempt,
  type SourceImportFinalizationInput,
  type SourceImportRepository,
  type SourceImportState,
  type SourceImportTransitionInput,
  type SourceObservationRecord,
  safeFailureDetail,
  sourceArtifactIdForImportAttempt
} from "@mef/operational-state";
import type { RequestPrincipal } from "@mef/control-api";
import { isOperationalStateError } from "@mef/operational-state";
import { getConfiguredVercelBlobStore } from "./artifact-store.ts";
import { toOperationalSecurityContext } from "./authz.ts";
import { ensureApplicationMigrations, verifyRuntimeRole } from "./job-runtime.ts";
import { getTenantDatabasePool } from "./tenant-db.ts";

export const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const ACCEPTED_GENERIC_EXTENSIONS = /\.(csv|tsv|txt|json|dat)$/iu;
const DEFAULT_MEDIA_TYPE = "application/octet-stream";
const runtimeRoleChecks = new WeakMap<object, Promise<void>>();
const sourceAdapterRegistry = new AdapterRegistry([REFERENCE_ADAPTER]);

interface SourceImportRuntime {
  readonly repository: SourceImportRepository;
  readonly pool: NonNullable<ReturnType<typeof getTenantDatabasePool>>;
  readonly securityContext: ReturnType<typeof toOperationalSecurityContext>;
}

export interface SourceImportEnvelopeDecision {
  readonly outcome: "STORED" | "UNSUPPORTED" | "MALFORMED";
  readonly failureCode?: "EMPTY_INPUT" | "DECLARED_SIZE_MISMATCH" | "UNSUPPORTED_MEDIA_TYPE";
  readonly safeDetail?: string;
}

export interface FinalizedSourceImport {
  readonly attempt: SourceImportAttempt;
  readonly sourceArtifact?: SourceArtifact;
  readonly importAttempt?: ImportAttempt;
}

export type SourceInspectionResult =
  | {
      readonly status: "OBSERVATION_RECORDED" | "OBSERVATION_REUSED";
      readonly attempt: SourceImportAttempt;
      readonly sourceObservationId: string;
      readonly observation: SourceObservation;
      readonly resolution: AdapterResolution;
    }
  | {
      readonly status: "NOT_RECOGNIZED" | "AMBIGUOUS";
      readonly attempt: SourceImportAttempt;
      readonly resolution: AdapterResolution;
    };

export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.MEF_MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 5 * 1024 * 1024 * 1024) : DEFAULT_MAX_UPLOAD_BYTES;
}

export function normalizeDeclaredMediaType(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u.test(normalized) ? normalized : DEFAULT_MEDIA_TYPE;
}

export function decideSourceImportEnvelope(input: {
  readonly originalFilename: string;
  readonly declaredSizeBytes: number;
  readonly actualSizeBytes: number;
}): SourceImportEnvelopeDecision {
  if (input.actualSizeBytes === 0) {
    return { outcome: "MALFORMED", failureCode: "EMPTY_INPUT", safeDetail: "The uploaded file is empty." };
  }
  if (input.actualSizeBytes !== input.declaredSizeBytes) {
    return { outcome: "MALFORMED", failureCode: "DECLARED_SIZE_MISMATCH", safeDetail: "The uploaded size did not match the declared size." };
  }
  if (!ACCEPTED_GENERIC_EXTENSIONS.test(input.originalFilename)) {
    return { outcome: "UNSUPPORTED", failureCode: "UNSUPPORTED_MEDIA_TYPE", safeDetail: "This generic file envelope is awaiting a qualified adapter." };
  }
  return { outcome: "STORED" };
}

function now(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

function importAttemptId(): string {
  return `imp_${randomUUID().replaceAll("-", "")}`;
}

function sourceArtifactId(value: string): SourceArtifactId {
  return sourceArtifactIdForImportAttempt(value) as SourceArtifactId;
}

function errorCode(error: unknown): string {
  return isOperationalStateError(error) ? error.code : "IMPORT_FINALIZATION_FAILED";
}

async function runtime(principal: RequestPrincipal): Promise<SourceImportRuntime> {
  await ensureApplicationMigrations();
  const pool = getTenantDatabasePool();
  if (!pool) throw new OperationalStateError("DATABASE_UNAVAILABLE");
  const roleCheck = runtimeRoleChecks.get(pool) ?? verifyRuntimeRole(pool);
  runtimeRoleChecks.set(pool, roleCheck);
  await roleCheck;
  const securityContext = toOperationalSecurityContext(principal);
  return {
    repository: new PostgresSourceImportRepository(pool, securityContext),
    pool,
    securityContext
  };
}

export async function createSourceImportAttempt(input: {
  readonly principal: RequestPrincipal;
  readonly originalFilename: string;
  readonly declaredContentType: string;
  readonly declaredSizeBytes: number;
  readonly athleteId?: string;
  readonly sessionId?: string;
}): Promise<SourceImportAttempt> {
  const currentTime = now();
  const context = toOperationalSecurityContext(input.principal);
  const sourceImportRuntime = await runtime(input.principal);
  if (input.declaredSizeBytes > maxUploadBytes()) {
    throw new OperationalStateError("CONTRACT_INVALID", "The configured upload size policy rejected this file.");
  }
  return sourceImportRuntime.repository.create({
    importAttemptId: importAttemptId(),
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    principalId: context.principalId,
    originalFilename: input.originalFilename,
    declaredContentType: normalizeDeclaredMediaType(input.declaredContentType),
    declaredSizeBytes: input.declaredSizeBytes,
    athleteId: input.athleteId,
    sessionId: input.sessionId,
    createdAt: currentTime
  });
}

export async function authorizeSourceImportUpload(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
  readonly pathname: string;
}): Promise<{ readonly attempt: SourceImportAttempt; readonly maximumSizeBytes: number }> {
  const sourceImportRuntime = await runtime(input.principal);
  let attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) throw new OperationalStateError("CONTRACT_INVALID", "The import attempt was not found.");
  if (attempt.stagingBlobPath !== input.pathname) throw new OperationalStateError("CONTRACT_INVALID", "The upload destination is not authorized.");
  if (attempt.state === "CREATED") {
    const transition: SourceImportTransitionInput = {
      importAttemptId: attempt.importAttemptId,
      toState: "UPLOAD_AUTHORIZED",
      eventCode: "UPLOAD_AUTHORIZED",
      occurredAt: now(),
      metadata: { storage: "VERCEL_PRIVATE_BLOB", access: "private" }
    };
    attempt = await sourceImportRuntime.repository.transition(transition);
  } else if (attempt.state !== "UPLOAD_AUTHORIZED" && attempt.state !== "UPLOADING") {
    throw new OperationalStateError("CONTRACT_INVALID", "The import attempt is no longer uploadable.");
  }
  return { attempt, maximumSizeBytes: maxUploadBytes() };
}

export async function markSourceImportUploadFailed(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<SourceImportAttempt> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) throw new OperationalStateError("CONTRACT_INVALID", "The import attempt was not found.");
  if (attempt.state === "UPLOAD_FAILED") return attempt;
  if (attempt.state !== "UPLOAD_AUTHORIZED" && attempt.state !== "UPLOADING") {
    throw new OperationalStateError("CONTRACT_INVALID", "The import attempt cannot be marked as upload-failed.");
  }
  return sourceImportRuntime.repository.transition({
    importAttemptId: attempt.importAttemptId,
    toState: "UPLOAD_FAILED",
    eventCode: "IMPORT_FAILED",
    occurredAt: now(),
    metadata: { failure_code: "UPLOAD_TRANSPORT_FAILED" },
    patch: {
      failureCode: "UPLOAD_TRANSPORT_FAILED",
      safeFailureDetail: "The browser upload did not complete. Start a new upload attempt."
    }
  });
}

export async function cancelSourceImport(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<SourceImportAttempt> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) throw new OperationalStateError("CONTRACT_INVALID", "The import attempt was not found.");
  if (["READY_FOR_ADAPTER", "UNSUPPORTED", "MALFORMED", "UPLOAD_FAILED", "CANCELLED", "BLOCKED"].includes(attempt.state)) return attempt;
  return sourceImportRuntime.repository.transition({
    importAttemptId: attempt.importAttemptId,
    toState: "CANCELLED",
    eventCode: "IMPORT_CANCELLED",
    occurredAt: now(),
    metadata: { failure_code: "CANCELLED_BY_USER" },
    patch: {
      failureCode: "CANCELLED_BY_USER",
      safeFailureDetail: "The upload attempt was cancelled by the practitioner."
    }
  });
}

async function advanceToIdentifying(repository: SourceImportRepository, attempt: SourceImportAttempt): Promise<SourceImportAttempt> {
  let current = attempt;
  if (current.state === "UPLOAD_AUTHORIZED") {
    current = await repository.transition({
      importAttemptId: current.importAttemptId,
      toState: "UPLOADING",
      eventCode: "UPLOAD_STARTED",
      occurredAt: now(),
      patch: { uploadStartedAt: now() }
    });
  }
  if (current.state === "UPLOADING") {
    current = await repository.transition({
      importAttemptId: current.importAttemptId,
      toState: "UPLOADED",
      eventCode: "UPLOAD_COMPLETED",
      occurredAt: now(),
      patch: { uploadCompletedAt: now() }
    });
  }
  if (current.state === "UPLOADED" || current.state === "STORAGE_FAILED" || current.state === "HASH_FAILED" || current.state === "FINALIZATION_FAILED") {
    current = await repository.transition({
      importAttemptId: current.importAttemptId,
      toState: "IDENTIFYING",
      eventCode: "HASH_STARTED",
      occurredAt: now(),
      patch: { failureCode: null, safeFailureDetail: null }
    });
  }
  return current;
}

function canonicalError(code: ContractError["code"], message: string, path: string): ContractError {
  return {
    taxonomy_version: "1.0.0",
    code,
    message: message as NonEmptyString,
    path
  };
}

function sourceDeclaration(outcome: SourceImportEnvelopeDecision["outcome"]): SemanticDeclaration {
  if (outcome === "UNSUPPORTED") {
    return {
      state: "UNSUPPORTED",
      reason: "ML-102 stores original bytes but does not claim this generic envelope without a qualified adapter.",
      evidence_references: []
    };
  }
  if (outcome === "MALFORMED") {
    return {
      state: "UNRESOLVED",
      reason: "ML-102 found a generic upload envelope problem; no scientific interpretation was attempted.",
      evidence_references: []
    };
  }
  return {
    state: "UNRESOLVED",
    reason: "ML-102 preserves original bytes and identity; vendor and measurement semantics await a qualified adapter.",
    evidence_references: []
  };
}

function canonicalRegistration(input: {
  readonly attempt: SourceImportAttempt;
  readonly decision: SourceImportEnvelopeDecision;
  readonly contentHash: string;
  readonly actualSizeBytes: number;
  readonly sourceArtifactId: SourceArtifactId;
  readonly actor: NonNullable<ReturnType<typeof toOperationalSecurityContext>["actor"]>;
}): {
  readonly sourceArtifact: SourceArtifact;
  readonly importAttempt: ImportAttempt;
  readonly auditEvents: ReadonlyArray<AuditEvent>;
  readonly provenanceReferences: ReadonlyArray<{
    readonly from: { readonly entity_type: "ImportAttempt"; readonly object_id: ImportAttemptId };
    readonly to: { readonly entity_type: "SourceArtifact"; readonly object_id: SourceArtifactId };
    readonly relation: string;
    readonly created_at: Timestamp;
  }>;
  readonly contentObjectKey: string;
} {
  const importId = input.attempt.importAttemptId as ImportAttemptId;
  const hash = input.contentHash as Sha256;
  const source: SourceArtifact = {
    entity_type: "SourceArtifact",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/source-artifact.schema.json",
    schema_version: "1.0.0",
    source_artifact_id: input.sourceArtifactId,
    record_version: 1,
    created_at: input.attempt.createdAt,
    lifecycle_state: input.decision.outcome === "STORED" ? "VERIFIED" : "INVALID",
    content_hash: hash,
    byte_size: input.actualSizeBytes,
    media_type: input.attempt.declaredContentType,
    original_filename: input.attempt.originalFilename as NonEmptyString,
    ingested_at: input.attempt.createdAt,
    source_declaration: sourceDeclaration(input.decision.outcome),
    immutable_source: true
  };
  const errors = input.decision.outcome === "STORED"
    ? []
    : [canonicalError(
      input.decision.outcome === "UNSUPPORTED" ? "UNSUPPORTED_CONFIGURATION" : "VALIDATION_ERROR",
      input.decision.safeDetail ?? "The generic upload envelope is not eligible for scientific processing.",
      input.decision.outcome === "UNSUPPORTED" ? "/declared_content_type" : "/declared_size_bytes"
    )];
  const attempt: ImportAttempt = {
    entity_type: "ImportAttempt",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/import-attempt.schema.json",
    schema_version: "1.0.0",
    import_attempt_id: importId,
    record_version: 1,
    source_artifact_id: input.sourceArtifactId,
    attempt_number: input.attempt.attemptNumber,
    attempted_at: input.attempt.createdAt,
    attempt_state: input.decision.outcome === "STORED" ? "ACCEPTED" : input.decision.outcome === "UNSUPPORTED" ? "UNSUPPORTED" : "REJECTED",
    errors
  };
  const createdAuditId = `aud_${input.attempt.importAttemptId.slice(4)}_created` as AuditEvent["audit_event_id"];
  const sourceAuditId = `aud_${input.attempt.importAttemptId.slice(4)}_source` as AuditEvent["audit_event_id"];
  const auditEvents: AuditEvent[] = [
    {
      entity_type: "AuditEvent",
      schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json",
      schema_version: "1.0.0",
      audit_event_id: createdAuditId,
      record_version: 1,
      occurred_at: input.attempt.createdAt,
      actor: input.actor,
      audit_action: "CREATED",
      object: { entity_type: "ImportAttempt", object_id: importId },
      authority_type: "HUMAN_PRACTITIONER",
      reason: "ML-102 recorded one authenticated upload action.",
      immutable_history: true
    },
    {
      entity_type: "AuditEvent",
      schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json",
      schema_version: "1.0.0",
      audit_event_id: sourceAuditId,
      record_version: 1,
      occurred_at: input.attempt.createdAt,
      actor: input.actor,
      audit_action: input.decision.outcome === "STORED" ? "VALIDATED" : "REJECTED",
      object: { entity_type: "SourceArtifact", object_id: input.sourceArtifactId },
      authority_type: "SYSTEM",
      reason: input.decision.outcome === "STORED"
        ? "The server verified exact original bytes and private content identity."
        : "The original bytes were retained but the generic envelope is not scientifically eligible.",
      immutable_history: true
    }
  ];
  return {
    sourceArtifact: source,
    importAttempt: attempt,
    auditEvents,
    provenanceReferences: [{
      from: { entity_type: "ImportAttempt", object_id: importId },
      to: { entity_type: "SourceArtifact", object_id: input.sourceArtifactId },
      relation: "SOURCE_ARTIFACT_ESTABLISHED",
      created_at: input.attempt.createdAt
    }],
    contentObjectKey: `originals/sha256/${hash}`
  };
}

async function recordRetryableFailure(
  repository: SourceImportRepository,
  attempt: SourceImportAttempt,
  state: "STORAGE_FAILED" | "HASH_FAILED" | "FINALIZATION_FAILED",
  failureCode: "STORAGE_READ_FAILED" | "STORAGE_WRITE_FAILED" | "HASH_VERIFICATION_FAILED" | "DATABASE_FINALIZATION_FAILED" | "INVALID_UPLOAD_FINALIZATION",
  detail: string,
  cause?: unknown
): Promise<never> {
  if (cause && isOperationalStateError(cause) && cause.transactionOutcome === "UNKNOWN") throw cause;
  await repository.transition({
    importAttemptId: attempt.importAttemptId,
    toState: state,
    eventCode: state === "STORAGE_FAILED" ? "STORAGE_FAILED" : state === "HASH_FAILED" ? "HASH_FAILED" : "FINALIZATION_FAILED",
    occurredAt: now(),
    metadata: { failure_code: failureCode, retryable: true },
    patch: { failureCode, safeFailureDetail: safeFailureDetail(detail) }
  });
  throw new OperationalStateError("DATABASE_TRANSACTION_FAILED", "The import is retryable and remains in a safe non-scientific state.", { retryable: true });
}

export async function finalizeSourceImport(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<FinalizedSourceImport> {
  const sourceImportRuntime = await runtime(input.principal);
  const initial = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!initial) throw new OperationalStateError("CONTRACT_INVALID", "The import attempt was not found.");
  if (initial.state === "READY_FOR_ADAPTER" || initial.state === "UNSUPPORTED" || initial.state === "MALFORMED") {
    return { attempt: initial };
  }
  let attempt = await advanceToIdentifying(sourceImportRuntime.repository, initial);
  const blobStore = getConfiguredVercelBlobStore();
  if (!blobStore) throw new OperationalStateError("INVALID_CONFIGURATION", "Private artifact storage is not configured.");

  let materialized: Awaited<ReturnType<typeof blobStore.materializeUploadedObject>>;
  try {
    materialized = await blobStore.materializeUploadedObject({
      sourcePath: attempt.stagingBlobPath,
      declaredMediaType: attempt.declaredContentType,
      maximumSizeBytes: maxUploadBytes()
    });
  } catch (error) {
    const code = errorCode(error);
    const isHashFailure = code === "OBJECT_INTEGRITY_MISMATCH" || code === "CONTENT_HASH_MISMATCH";
    return recordRetryableFailure(
      sourceImportRuntime.repository,
      attempt,
      isHashFailure ? "HASH_FAILED" : "STORAGE_FAILED",
      isHashFailure ? "HASH_VERIFICATION_FAILED" : code === "OBJECT_WRITE_FAILED" ? "STORAGE_WRITE_FAILED" : "STORAGE_READ_FAILED",
      isHashFailure ? "The server could not verify the original byte identity." : "The private original could not be materialized safely."
    );
  }

  const decision = decideSourceImportEnvelope({
    originalFilename: attempt.originalFilename,
    declaredSizeBytes: attempt.declaredSizeBytes,
    actualSizeBytes: materialized.byteSize
  });
  const actor = sourceImportRuntime.securityContext.actor;
  if (!actor) throw new OperationalStateError("INVALID_CONFIGURATION");
  const canonicalSourceArtifactId = sourceArtifactId(attempt.importAttemptId);
  try {
    // Register the canonical B00 records before writing their foreign keys into
    // the ML-102 workflow ledger. The two stores have separate transactions;
    // this ordering keeps the immediate cross-table FK valid and is idempotent
    // when a prior attempt committed before the browser or database response
    // was lost.
    const registration = canonicalRegistration({
      attempt,
      decision,
      contentHash: materialized.contentHash,
      actualSizeBytes: materialized.byteSize,
      sourceArtifactId: canonicalSourceArtifactId,
      actor
    });
    const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
    await database.registerRecords(registration);
    attempt = await sourceImportRuntime.repository.setIdentity({
      importAttemptId: attempt.importAttemptId,
      actualSizeBytes: materialized.byteSize,
      contentHash: materialized.contentHash,
      storageKey: materialized.storageKey,
      sourceArtifactId: canonicalSourceArtifactId,
      auditEventId: `aud_${attempt.importAttemptId.slice(4)}_source`,
      identityCompletedAt: now(),
      occurredAt: now()
    });

    const target: SourceImportFinalizationInput["toState"] = decision.outcome === "STORED" ? "STORED" : decision.outcome;
    let finalized = await sourceImportRuntime.repository.finalize({
      importAttemptId: attempt.importAttemptId,
      toState: target,
      occurredAt: now(),
      eventCode: decision.outcome === "STORED" ? "SOURCE_ARTIFACT_ESTABLISHED" : decision.outcome === "UNSUPPORTED" ? "IMPORT_UNSUPPORTED" : "IMPORT_MALFORMED",
      failureCode: decision.failureCode,
      safeFailureDetail: decision.safeDetail,
      metadata: {
        content_hash: materialized.contentHash,
        byte_size: materialized.byteSize,
        scientific_eligibility: "INELIGIBLE"
      }
    });
    if (decision.outcome === "STORED") {
      finalized = await sourceImportRuntime.repository.transition({
        importAttemptId: finalized.importAttemptId,
        toState: "READY_FOR_ADAPTER",
        eventCode: "ADAPTER_BOUNDARY_RECORDED",
        occurredAt: now(),
        metadata: { science: "blocked_until_qualified_adapter" }
      });
    }
    return {
      attempt: finalized,
      sourceArtifact: registration.sourceArtifact,
      importAttempt: registration.importAttempt
    };
  } catch (error) {
    if (isOperationalStateError(error) && !error.retryable && error.code === "CONTRACT_INVALID") throw error;
    return recordRetryableFailure(
      sourceImportRuntime.repository,
      attempt,
      "FINALIZATION_FAILED",
      "DATABASE_FINALIZATION_FAILED",
      "The private original is preserved; database finalization can be retried safely.",
      error
    );
  }
}

export async function getSourceImport(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<{ readonly attempt: SourceImportAttempt; readonly events: ReadonlyArray<import("@mef/operational-state").SourceImportEvent> } | undefined> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) return undefined;
  return { attempt, events: await sourceImportRuntime.repository.listEvents(input.importAttemptId) };
}

export async function getSourceArtifact(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<{ readonly attempt: SourceImportAttempt; readonly sourceArtifact?: SourceArtifact } | undefined> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) return undefined;
  if (!attempt.sourceArtifactId) return { attempt };
  const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
  return { attempt, sourceArtifact: await database.findSourceArtifact(attempt.sourceArtifactId as SourceArtifactId) };
}

export async function inspectSourceImport(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<SourceInspectionResult> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt) throw new OperationalStateError("CONTRACT_INVALID", "The import attempt was not found.");
  if (!attempt.contentHash || !attempt.sourceArtifactId || attempt.state !== "READY_FOR_ADAPTER") {
    throw new OperationalStateError("CONTRACT_INVALID", "The import is not ready for adapter inspection.");
  }

  const adapter = REFERENCE_ADAPTER;
  const sourceObservationId = sourceObservationIdFor({
    sourceArtifactId: attempt.sourceArtifactId,
    adapterId: adapter.descriptor.adapterId,
    adapterVersion: adapter.descriptor.adapterVersion,
    adkApiVersion: adapter.descriptor.adkApiVersion
  });
  const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
  const existing = await database.findSourceObservation(sourceObservationId);
  if (existing) {
    const observation = existing.observationDocument as unknown as SourceObservation;
    validateSourceObservation(observation);
    const resolution: AdapterResolution = { status: "resolved", adapter, probeResults: [] };
    return { status: "OBSERVATION_REUSED", attempt, sourceObservationId, observation, resolution };
  }

  const blobStore = getConfiguredVercelBlobStore();
  if (!blobStore) throw new OperationalStateError("INVALID_CONFIGURATION", "Private artifact storage is not configured.");
  const bytes = await blobStore.readImmutable(attempt.contentHash as Sha256);
  const source = createMemorySourceReader({
    sourceArtifactId: attempt.sourceArtifactId,
    bytes,
    contentSha256: attempt.contentHash
  });
  const budget = createDefaultBudget({
    maxProbeBytes: 64 * 1024,
    maxBytesRead: Math.min(maxUploadBytes(), 16 * 1024 * 1024),
    maxRecords: 1_000_000,
    maxMetadataEntries: 256,
    timeoutMs: 10_000
  });
  const resolution = await sourceAdapterRegistry.probe(source, { budget });
  if (resolution.status !== "resolved" || !resolution.adapter) {
    return { status: resolution.status === "ambiguous" ? "AMBIGUOUS" : "NOT_RECOGNIZED", attempt, resolution };
  }
  const observation = await resolution.adapter.inspect(source, { budget });
  validateSourceObservation(observation);
  const record: SourceObservationRecord = {
    sourceObservationId,
    organizationId: sourceImportRuntime.securityContext.organizationId,
    workspaceId: sourceImportRuntime.securityContext.workspaceId,
    sourceArtifactId: attempt.sourceArtifactId as SourceArtifactId,
    sourceContentSha256: observation.sourceContentSha256,
    adapterId: observation.adapterExecution.adapterId,
    adapterVersion: observation.adapterExecution.adapterVersion,
    adkApiVersion: observation.adapterExecution.adkApiVersion,
    adapterQualification: observation.adapterExecution.qualification,
    schemaFingerprint: observation.schemaFingerprint,
    observationSha256: observation.observationSha256,
    observationDocument: observation as unknown as Record<string, unknown>,
    createdAt: now()
  };
  const stored = await database.insertOrGetSourceObservation(record);
  const storedObservation = stored.observationDocument as unknown as SourceObservation;
  validateSourceObservation(storedObservation);
  return {
    status: "OBSERVATION_RECORDED",
    attempt,
    sourceObservationId: stored.sourceObservationId,
    observation: storedObservation,
    resolution
  };
}

export async function getSourceObservation(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<{ readonly attempt: SourceImportAttempt; readonly sourceObservationId: string; readonly observation: SourceObservation } | undefined> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt || !attempt.sourceArtifactId) return undefined;
  const sourceObservationId = sourceObservationIdFor({
    sourceArtifactId: attempt.sourceArtifactId,
    adapterId: REFERENCE_ADAPTER.descriptor.adapterId,
    adapterVersion: REFERENCE_ADAPTER.descriptor.adapterVersion,
    adkApiVersion: REFERENCE_ADAPTER.descriptor.adkApiVersion
  });
  const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
  const stored = await database.findSourceObservation(sourceObservationId);
  if (!stored) return undefined;
  const observation = stored.observationDocument as unknown as SourceObservation;
  validateSourceObservation(observation);
  return { attempt, sourceObservationId, observation };
}

export type CanonicalAcquisitionInspectionResult = {
  readonly status: "CANONICAL_ACQUISITION_RECORDED" | "CANONICAL_ACQUISITION_REUSED";
  readonly attempt: SourceImportAttempt;
  readonly sourceObservationId: string;
  readonly acquisition: CanonicalAcquisitionRecord["acquisition"];
};

function canonicalizationBudget() {
  return createDefaultBudget({
    maxProbeBytes: 64 * 1024,
    maxBytesRead: Math.min(maxUploadBytes(), 16 * 1024 * 1024),
    maxRecords: 1_000_000,
    maxMetadataEntries: 256,
    timeoutMs: 30_000
  });
}

export async function canonicalizeSourceImport(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<CanonicalAcquisitionInspectionResult> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt || !attempt.contentHash || !attempt.sourceArtifactId || attempt.state !== "READY_FOR_ADAPTER") {
    throw new OperationalStateError("CONTRACT_INVALID", "The import is not ready for canonical acquisition.");
  }
  const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
  const sourceObservationId = sourceObservationIdFor({
    sourceArtifactId: attempt.sourceArtifactId,
    adapterId: REFERENCE_ADAPTER.descriptor.adapterId,
    adapterVersion: REFERENCE_ADAPTER.descriptor.adapterVersion,
    adkApiVersion: REFERENCE_ADAPTER.descriptor.adkApiVersion
  });
  const observationRecord = await database.findSourceObservation(sourceObservationId);
  if (!observationRecord) throw new OperationalStateError("CONTRACT_INVALID", "Run adapter inspection before canonical acquisition.");
  const observation = observationRecord.observationDocument as unknown as SourceObservation;
  validateSourceObservation(observation);
  const existing = await database.findCanonicalAcquisition({
    sourceArtifactId: attempt.sourceArtifactId as SourceArtifactId,
    sourceObservationId,
    canonicalizerVersion: CANONICALIZER_VERSION,
    mappingManifestSha256: mappingManifestSha256(REFERENCE_MAPPING_MANIFEST)
  });
  if (existing) return { status: "CANONICAL_ACQUISITION_REUSED", attempt, sourceObservationId, acquisition: existing.acquisition };

  const blobStore = getConfiguredVercelBlobStore();
  if (!blobStore) throw new OperationalStateError("INVALID_CONFIGURATION", "Private artifact storage is not configured.");
  const source = await blobStore.openImmutableSourceReader(attempt.sourceArtifactId, attempt.contentHash as Sha256);
  const adapter = REFERENCE_ADAPTER;
  const canonicalization: CanonicalizationResult = await canonicalize({
    sourceArtifactId: attempt.sourceArtifactId,
    sourceArtifactSha256: attempt.contentHash,
    sourceObservationId,
    sourceObservationSha256: observation.observationSha256,
    observation,
    records: adapter.read(source, { budget: canonicalizationBudget() }),
    mappingManifest: REFERENCE_MAPPING_MANIFEST,
    canonicalizerVersion: CANONICALIZER_VERSION,
    createdAt: now()
  });
  const artifact = await blobStore.putImmutable({
    contentHash: canonicalization.signalHash,
    bytes: canonicalization.signalBytes,
    mediaType: "application/x-ndjson",
    keyPrefix: "canonical/sha256"
  });
  const acquisition = {
    ...canonicalization.acquisition,
    signal_artifact: { ...canonicalization.acquisition.signal_artifact, storage_key: artifact.key }
  };
  const record: CanonicalAcquisitionRecord = {
    canonicalAcquisitionId: acquisition.canonical_acquisition_id,
    organizationId: sourceImportRuntime.securityContext.organizationId,
    workspaceId: sourceImportRuntime.securityContext.workspaceId,
    importAttemptId: attempt.importAttemptId,
    sourceArtifactId: acquisition.source_artifact_id,
    sourceObservationId: acquisition.source_observation_id,
    canonicalizerVersion: acquisition.canonicalizer_version,
    mappingManifestSha256: acquisition.mapping_manifest_sha256,
    signalArtifactSha256: acquisition.signal_artifact_sha256,
    signalArtifactKey: artifact.key,
    canonicalIdentitySha256: acquisition.canonical_identity_sha256,
    acquisition,
    createdAt: acquisition.created_at
  };
  const stored = await database.insertOrGetCanonicalAcquisition(record);
  return { status: "CANONICAL_ACQUISITION_RECORDED", attempt, sourceObservationId, acquisition: stored.acquisition };
}

export async function getCanonicalAcquisition(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<CanonicalAcquisitionInspectionResult | undefined> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt || !attempt.sourceArtifactId) return undefined;
  const sourceObservationId = sourceObservationIdFor({
    sourceArtifactId: attempt.sourceArtifactId,
    adapterId: REFERENCE_ADAPTER.descriptor.adapterId,
    adapterVersion: REFERENCE_ADAPTER.descriptor.adapterVersion,
    adkApiVersion: REFERENCE_ADAPTER.descriptor.adkApiVersion
  });
  const database = new PostgresOperationalStore(sourceImportRuntime.pool, sourceImportRuntime.securityContext);
  const existing = await database.findCanonicalAcquisition({
    sourceArtifactId: attempt.sourceArtifactId as SourceArtifactId,
    sourceObservationId,
    canonicalizerVersion: CANONICALIZER_VERSION,
    mappingManifestSha256: mappingManifestSha256(REFERENCE_MAPPING_MANIFEST)
  });
  if (!existing) return undefined;
  return { status: "CANONICAL_ACQUISITION_REUSED", attempt, sourceObservationId, acquisition: existing.acquisition };
}

export async function listSourceImports(principal: RequestPrincipal): Promise<ReadonlyArray<SourceImportAttempt>> {
  const sourceImportRuntime = await runtime(principal);
  return sourceImportRuntime.repository.list(100);
}

export async function retrieveSourceImportOriginal(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}): Promise<{ readonly attempt: SourceImportAttempt; readonly bytes: Uint8Array }> {
  const sourceImportRuntime = await runtime(input.principal);
  const attempt = await sourceImportRuntime.repository.get(input.importAttemptId);
  if (!attempt || !attempt.contentHash || attempt.state === "UPLOAD_FAILED") {
    throw new OperationalStateError("CONTRACT_INVALID", "The original bytes are not available for this attempt.");
  }
  const blobStore = getConfiguredVercelBlobStore();
  if (!blobStore) throw new OperationalStateError("INVALID_CONFIGURATION", "Private artifact storage is not configured.");
  const bytes = await blobStore.readImmutable(attempt.contentHash as Sha256);
  await sourceImportRuntime.repository.recordEvent({
    importAttemptId: attempt.importAttemptId,
    eventCode: "ORIGINAL_BYTES_RETRIEVED",
    occurredAt: now(),
    metadata: { byte_size: bytes.byteLength, content_hash: attempt.contentHash }
  }).catch(() => undefined);
  return { attempt, bytes };
}
