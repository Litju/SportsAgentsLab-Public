export type OperationalErrorCode =
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_TRANSACTION_FAILED"
  | "MIGRATION_FAILED"
  | "MIGRATION_DRIFT_DETECTED"
  | "OBJECT_STORE_UNAVAILABLE"
  | "OBJECT_WRITE_FAILED"
  | "OBJECT_ALREADY_EXISTS_MISMATCH"
  | "OBJECT_INTEGRITY_MISMATCH"
  | "OBJECT_READ_FAILED"
  | "CONTENT_HASH_MISMATCH"
  | "SOURCE_ARTIFACT_IMMUTABLE_CONFLICT"
  | "PROVENANCE_INVALID"
  | "AUDIT_APPEND_FAILED"
  | "RETENTION_POLICY_UNRESOLVED"
  | "CONTRACT_INVALID"
  | "INVALID_CONFIGURATION"
  | "IDEMPOTENCY_CONFLICT"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_CLAIMABLE"
  | "INVALID_JOB_TRANSITION"
  | "JOB_ALREADY_TERMINAL"
  | "CANCELLATION_NOT_ALLOWED"
  | "ATTEMPT_LIMIT_EXCEEDED"
  | "WORKER_FAILURE_RETRYABLE"
  | "WORKER_FAILURE_NON_RETRYABLE"
  | "EXECUTION_OUTCOME_UNKNOWN"
  | "JOB_PERSISTENCE_FAILED"
  | "UNKNOWN_COMMAND_TYPE"
  | "UNKNOWN_WORKER_TYPE"
  | "PROGRESS_SEQUENCE_CONFLICT"
  | "RECONCILIATION_REQUIRED"
  | "INVALID_COMMAND_PAYLOAD"
  | "INVALID_PROGRESS_EVENT";

const DEFAULT_MESSAGES: Readonly<Record<OperationalErrorCode, string>> = {
  DATABASE_UNAVAILABLE: "The operational database is unavailable.",
  DATABASE_TRANSACTION_FAILED: "The operational database transaction failed.",
  MIGRATION_FAILED: "The operational database migration failed.",
  MIGRATION_DRIFT_DETECTED: "Applied migration contents do not match the expected checksum.",
  OBJECT_STORE_UNAVAILABLE: "The immutable object store is unavailable.",
  OBJECT_WRITE_FAILED: "The immutable object could not be stored.",
  OBJECT_ALREADY_EXISTS_MISMATCH: "The immutable content identity already refers to different content.",
  OBJECT_INTEGRITY_MISMATCH: "The immutable object failed integrity verification.",
  OBJECT_READ_FAILED: "The immutable object could not be read.",
  CONTENT_HASH_MISMATCH: "The supplied content hash does not match the original bytes.",
  SOURCE_ARTIFACT_IMMUTABLE_CONFLICT: "The immutable source artifact metadata conflicts with the stored record.",
  PROVENANCE_INVALID: "The provenance reference is invalid.",
  AUDIT_APPEND_FAILED: "The audit event could not be appended.",
  RETENTION_POLICY_UNRESOLVED: "The retention policy is unresolved.",
  CONTRACT_INVALID: "The supplied record does not satisfy the accepted contract.",
  INVALID_CONFIGURATION: "The operational-state configuration is invalid.",
  IDEMPOTENCY_CONFLICT: "The idempotency key is already bound to different command input.",
  JOB_NOT_FOUND: "The requested job was not found.",
  JOB_NOT_CLAIMABLE: "The job is not eligible for worker claim.",
  INVALID_JOB_TRANSITION: "The requested job state transition is not allowed.",
  JOB_ALREADY_TERMINAL: "The job has already reached a terminal state.",
  CANCELLATION_NOT_ALLOWED: "The job cannot be canceled in its current state.",
  ATTEMPT_LIMIT_EXCEEDED: "The job attempt limit has been exhausted.",
  WORKER_FAILURE_RETRYABLE: "The worker reported a bounded retryable failure.",
  WORKER_FAILURE_NON_RETRYABLE: "The worker reported a non-retryable failure.",
  EXECUTION_OUTCOME_UNKNOWN: "The worker outcome is unknown and requires reconciliation.",
  JOB_PERSISTENCE_FAILED: "The job execution record could not be persisted.",
  UNKNOWN_COMMAND_TYPE: "The command type is not registered for execution.",
  UNKNOWN_WORKER_TYPE: "The worker is not registered for this command.",
  PROGRESS_SEQUENCE_CONFLICT: "The progress sequence is already recorded.",
  RECONCILIATION_REQUIRED: "The job requires explicit outcome reconciliation.",
  INVALID_COMMAND_PAYLOAD: "The command payload is invalid.",
  INVALID_PROGRESS_EVENT: "The progress event is invalid."
};

const RETRYABLE_CODES: ReadonlySet<OperationalErrorCode> = new Set([
  "DATABASE_UNAVAILABLE",
  "DATABASE_TRANSACTION_FAILED",
  "MIGRATION_FAILED",
  "OBJECT_STORE_UNAVAILABLE",
  "OBJECT_WRITE_FAILED",
  "OBJECT_READ_FAILED",
  "AUDIT_APPEND_FAILED",
  "JOB_PERSISTENCE_FAILED"
]);

export interface ReconciliationHint {
  readonly contentHash: string;
  readonly objectKey: string;
  readonly databaseRecordCommitted: boolean | "UNKNOWN";
}

export interface OperationalErrorOptions {
  readonly retryable?: boolean;
  readonly reconciliationHint?: ReconciliationHint;
  readonly transactionOutcome?: "UNKNOWN";
}

export class OperationalStateError extends Error {
  readonly code: OperationalErrorCode;
  readonly retryable: boolean;
  readonly reconciliationHint?: ReconciliationHint;
  readonly transactionOutcome?: "UNKNOWN";

  constructor(code: OperationalErrorCode, message?: string, options: OperationalErrorOptions = {}) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "OperationalStateError";
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.reconciliationHint = options.reconciliationHint;
    this.transactionOutcome = options.transactionOutcome;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      transaction_outcome: this.transactionOutcome,
      reconciliation_hint: this.reconciliationHint
    };
  }
}

export function isOperationalStateError(error: unknown): error is OperationalStateError {
  return error instanceof OperationalStateError;
}

function errorProperty(error: unknown, property: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[property];
}

function isConnectionFailure(error: unknown): boolean {
  const code = errorProperty(error, "code");
  const name = errorProperty(error, "name");
  return (
    (typeof code === "string" &&
      (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT" || code.startsWith("08"))) ||
    name === "ConnectionError" ||
    name === "TimeoutError" ||
    name === "NetworkingError"
  );
}

export function mapDatabaseError(error: unknown, phase: "connect" | "transaction" | "migration"): OperationalStateError {
  if (isOperationalStateError(error)) return error;
  if (phase === "connect" || isConnectionFailure(error)) {
    return new OperationalStateError("DATABASE_UNAVAILABLE");
  }
  return new OperationalStateError(phase === "migration" ? "MIGRATION_FAILED" : "DATABASE_TRANSACTION_FAILED");
}

export function mapObjectStoreError(error: unknown, phase: "write" | "read" | "inspect"): OperationalStateError {
  if (isOperationalStateError(error)) return error;
  if (isConnectionFailure(error)) return new OperationalStateError("OBJECT_STORE_UNAVAILABLE");
  if (phase === "write") return new OperationalStateError("OBJECT_WRITE_FAILED");
  if (phase === "read") return new OperationalStateError("OBJECT_READ_FAILED");
  return new OperationalStateError("OBJECT_STORE_UNAVAILABLE");
}

export function defaultMessage(code: OperationalErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
