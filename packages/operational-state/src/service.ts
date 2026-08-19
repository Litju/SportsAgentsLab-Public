import type {
  Actor,
  AuditEvent,
  AuditEventId,
  ImportAttempt,
  ImportAttemptId,
  ReasonText,
  SchemaVersion,
  SemanticDeclaration,
  Sha256,
  SourceArtifactId,
  SourceArtifact,
  Timestamp
} from "@mef/generated-ts";
import { validateEntity } from "@mef/generated-ts";
import { assertAuditEvent, type ReplayedAuditEvent } from "./audit.ts";
import {
  isOperationalStateError,
  mapDatabaseError,
  mapObjectStoreError,
  OperationalStateError,
  type ReconciliationHint
} from "./errors.ts";
import { assertSha256Hex, cloneBytes, contentAddressedKey, sha256Hex, type ContentAddressedObjectKey, verifyContentHash } from "./hash.ts";
import type { ImmutableObjectInspection, ImmutableObjectStore } from "./object-store.ts";
import { assertProvenanceReference, type ProvenanceReference } from "./references.ts";
import { assertRetentionAssessment, type RetentionAssessment } from "./retention.ts";
import type { OperationalDatabase, OperationalRegistrationResult, RegisterOperationalRecords } from "./postgres.ts";

const SOURCE_ARTIFACT_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/source-artifact.schema.json" as const;
const IMPORT_ATTEMPT_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/import-attempt.schema.json" as const;
const AUDIT_EVENT_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json" as const;
const CONTRACT_VERSION = "1.0.0" as SchemaVersion;

export interface ImportOriginalInput {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly originalFilename: string;
  readonly sourceArtifactId: SourceArtifactId;
  readonly sourceDeclaration: SemanticDeclaration;
  readonly importAttemptId: ImportAttemptId;
  readonly attemptNumber: number;
  readonly attemptedAt: Timestamp;
  readonly createdAt: Timestamp;
  readonly ingestedAt: Timestamp;
  readonly auditEventId: AuditEventId;
  readonly occurredAt: Timestamp;
  readonly actor: Actor;
  readonly authorityType: AuditEvent["authority_type"];
  readonly reason: ReasonText;
  readonly expectedContentHash?: Sha256;
  readonly retention?: RetentionAssessment;
}

export interface ImportOriginalResult {
  readonly sourceArtifact: SourceArtifact;
  readonly importAttempt: ImportAttempt;
  readonly auditEvents: ReadonlyArray<ReplayedAuditEvent>;
  readonly provenanceReferences: ReadonlyArray<ProvenanceReference>;
  readonly contentHash: Sha256;
  readonly contentObjectKey: ContentAddressedObjectKey;
  readonly contentObjectCreated: boolean;
}

export interface OriginalArtifactInspection {
  readonly sourceArtifact: SourceArtifact;
  readonly object: ImmutableObjectInspection;
}

export interface OperationalStatePort {
  importOriginal(input: ImportOriginalInput): Promise<ImportOriginalResult>;
  readOriginal(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<Uint8Array>;
  inspectOriginal(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<OriginalArtifactInspection>;
}

function validateRecord(value: unknown, entityType: "SourceArtifact" | "ImportAttempt" | "AuditEvent"): void {
  if (!validateEntity(value, entityType).valid) throw new OperationalStateError("CONTRACT_INVALID");
}

function reconciliationHint(
  contentHash: Sha256,
  objectKey: ContentAddressedObjectKey,
  databaseRecordCommitted: ReconciliationHint["databaseRecordCommitted"] = false
): ReconciliationHint {
  return { contentHash, objectKey, databaseRecordCommitted };
}

function withReconciliationHint(
  error: unknown,
  contentHash: Sha256,
  objectKey: ContentAddressedObjectKey,
  defaultCode: OperationalStateError["code"]
): OperationalStateError {
  const mapped = isOperationalStateError(error) ? error : new OperationalStateError(defaultCode);
  return new OperationalStateError(mapped.code, mapped.message, {
    retryable: mapped.retryable,
    transactionOutcome: mapped.transactionOutcome,
    reconciliationHint: mapped.reconciliationHint ?? reconciliationHint(contentHash, objectKey)
  });
}

export class OperationalStateService implements OperationalStatePort {
  private readonly objectStore: ImmutableObjectStore;
  private readonly database: OperationalDatabase;

  constructor(objectStore: ImmutableObjectStore, database: OperationalDatabase) {
    this.objectStore = objectStore;
    this.database = database;
  }

  async importOriginal(input: ImportOriginalInput): Promise<ImportOriginalResult> {
    const bytes = cloneBytes(input.bytes);
    const contentHash = sha256Hex(bytes);
    if (input.expectedContentHash !== undefined) {
      assertSha256Hex(input.expectedContentHash);
      if (input.expectedContentHash !== contentHash) throw new OperationalStateError("CONTENT_HASH_MISMATCH");
    }

    const contentObjectKey = contentAddressedKey(contentHash);

    const sourceArtifact: SourceArtifact = {
      entity_type: "SourceArtifact",
      schema_id: SOURCE_ARTIFACT_SCHEMA_ID,
      schema_version: CONTRACT_VERSION,
      source_artifact_id: input.sourceArtifactId,
      record_version: 1,
      created_at: input.createdAt,
      lifecycle_state: "VERIFIED",
      content_hash: contentHash,
      byte_size: bytes.byteLength,
      media_type: input.mediaType,
      original_filename: input.originalFilename,
      ingested_at: input.ingestedAt,
      source_declaration: input.sourceDeclaration,
      immutable_source: true
    };
    const importAttempt: ImportAttempt = {
      entity_type: "ImportAttempt",
      schema_id: IMPORT_ATTEMPT_SCHEMA_ID,
      schema_version: CONTRACT_VERSION,
      import_attempt_id: input.importAttemptId,
      record_version: 1,
      source_artifact_id: sourceArtifact.source_artifact_id,
      attempt_number: input.attemptNumber,
      attempted_at: input.attemptedAt,
      attempt_state: "ACCEPTED",
      errors: []
    };
    const auditEvent: AuditEvent = {
      entity_type: "AuditEvent",
      schema_id: AUDIT_EVENT_SCHEMA_ID,
      schema_version: CONTRACT_VERSION,
      audit_event_id: input.auditEventId,
      record_version: 1,
      occurred_at: input.occurredAt,
      actor: input.actor,
      audit_action: "CREATED",
      object: { entity_type: "SourceArtifact", object_id: sourceArtifact.source_artifact_id },
      authority_type: input.authorityType,
      reason: input.reason,
      immutable_history: true
    };
    const provenanceReferences: ReadonlyArray<ProvenanceReference> = [
      {
        from: { entity_type: "ImportAttempt", object_id: importAttempt.import_attempt_id },
        to: { entity_type: "SourceArtifact", object_id: sourceArtifact.source_artifact_id },
        relation: "IMPORT_ATTEMPT_CONTENT",
        created_at: input.attemptedAt
      }
    ];
    validateRecord(sourceArtifact, "SourceArtifact");
    validateRecord(importAttempt, "ImportAttempt");
    assertAuditEvent(auditEvent);
    for (const reference of provenanceReferences) assertProvenanceReference(reference);
    if (input.retention) {
      assertRetentionAssessment(input.retention);
      if (input.retention.source_artifact_id !== sourceArtifact.source_artifact_id) {
        throw new OperationalStateError("RETENTION_POLICY_UNRESOLVED");
      }
    }

    let objectResult;
    try {
      objectResult = await this.objectStore.putImmutable({
        contentHash,
        bytes,
        mediaType: input.mediaType
      });
    } catch (error) {
      throw withReconciliationHint(error, contentHash, contentObjectKey, "OBJECT_WRITE_FAILED");
    }
    if (
      objectResult.contentHash !== contentHash ||
      objectResult.key !== contentObjectKey ||
      objectResult.byteSize !== bytes.byteLength
    ) {
      throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH", undefined, {
        reconciliationHint: reconciliationHint(contentHash, contentObjectKey)
      });
    }

    const registration: RegisterOperationalRecords = {
      sourceArtifact,
      importAttempt,
      auditEvents: [auditEvent],
      provenanceReferences,
      retention: input.retention,
      contentObjectKey
    };
    let stored: OperationalRegistrationResult;
    try {
      stored = await this.database.registerRecords(registration);
    } catch (error) {
      const mapped = isOperationalStateError(error) ? error : mapDatabaseError(error, "transaction");
      throw new OperationalStateError(mapped.code, mapped.message, {
        retryable: mapped.retryable,
        transactionOutcome: mapped.transactionOutcome,
        reconciliationHint: mapped.reconciliationHint ?? reconciliationHint(
          contentHash,
          contentObjectKey,
          mapped.transactionOutcome === "UNKNOWN" ? "UNKNOWN" : false
        )
      });
    }

    return {
      sourceArtifact: stored.sourceArtifact,
      importAttempt: stored.importAttempt,
      auditEvents: stored.auditEvents,
      provenanceReferences,
      contentHash,
      contentObjectKey,
      contentObjectCreated: objectResult.created
    };
  }

  async readOriginal(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<Uint8Array> {
    const sourceArtifact = await this.database.findSourceArtifact(sourceArtifactId);
    if (!sourceArtifact) throw new OperationalStateError("OBJECT_READ_FAILED");
    try {
      const bytes = await this.objectStore.readImmutable(sourceArtifact.content_hash);
      verifyContentHash(bytes, sourceArtifact.content_hash);
      return cloneBytes(bytes);
    } catch (error) {
      throw isOperationalStateError(error) ? error : mapObjectStoreError(error, "read");
    }
  }

  async inspectOriginal(sourceArtifactId: SourceArtifact["source_artifact_id"]): Promise<OriginalArtifactInspection> {
    const sourceArtifact = await this.database.findSourceArtifact(sourceArtifactId);
    if (!sourceArtifact) throw new OperationalStateError("OBJECT_READ_FAILED");
    let object: ImmutableObjectInspection;
    try {
      object = await this.objectStore.inspectImmutable(sourceArtifact.content_hash);
    } catch (error) {
      throw isOperationalStateError(error) ? error : mapObjectStoreError(error, "inspect");
    }
    if (
      object.contentHash !== sourceArtifact.content_hash ||
      object.key !== contentAddressedKey(sourceArtifact.content_hash) ||
      (object.exists && object.byteSize !== sourceArtifact.byte_size) ||
      (object.exists && object.mediaType !== undefined && object.mediaType !== sourceArtifact.media_type)
    ) {
      throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
    }
    return {
      sourceArtifact,
      object
    };
  }
}
