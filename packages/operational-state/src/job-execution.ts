import {
  canonicalJson,
  validateEntity,
  type AuditAction,
  type AuditEvent,
  type Command,
  type CommandId,
  type CommandPayload,
  type CommandType,
  type ExecutionError,
  type ExecutionErrorCode,
  type FailureCategory,
  type IdempotencyKey,
  type Job,
  type JobAttempt,
  type JobAttemptId,
  type JobAttemptOutcome,
  type JobId,
  type JobResult,
  type JobState,
  type ObjectReference,
  type ProgressCode,
  type ProgressEvent,
  type ProgressEventId,
  type ProgressPhase,
  type ReconciliationState,
  type RetryDecision,
  type RetryPolicy,
  type Timestamp,
  type WorkerType
} from "@mef/generated-ts";
import { OperationalStateError, type OperationalErrorCode } from "./errors.ts";
import { sha256Hex } from "./hash.ts";
import { isCanonicalObjectReference } from "./references.ts";
import { assertTenantScope, scopeKey, type OperationalSecurityContext } from "./security.ts";

const COMMAND_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/command.schema.json" as const;
const JOB_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/job.schema.json" as const;
const ATTEMPT_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/job-attempt.schema.json" as const;
const PROGRESS_SCHEMA_ID = "https://schemas.sportsagentslab.local/mef/1.0.0/progress-event.schema.json" as const;

const SYSTEM_ACTOR = {
  actor_type: "SYSTEM",
  actor_id: "system_ml97_execution",
  role: "job-execution"
} as const;

export interface JobStateRule {
  readonly predecessors: ReadonlyArray<JobState>;
  readonly successors: ReadonlyArray<JobState>;
  readonly terminal: boolean;
  readonly workerMayClaim: boolean;
  readonly cancellationBehavior: "SAFE_BEFORE_CLAIM" | "COOPERATIVE" | "REQUIRES_RECONCILIATION" | "TERMINAL";
  readonly retryBehavior: "NONE" | "BOUNDED" | "MANUAL_RECONCILIATION";
  readonly requiredTimestamps: ReadonlyArray<"created_at" | "queued_at" | "started_at" | "updated_at" | "finished_at" | "next_eligible_attempt_at">;
  readonly resultRequirement: "NONE" | "REQUIRED" | "ERROR_REQUIRED";
}

export const JOB_LIFECYCLE: Readonly<Record<JobState, JobStateRule>> = {
  QUEUED: {
    predecessors: [],
    successors: ["RUNNING", "CANCEL_REQUESTED"],
    terminal: false,
    workerMayClaim: true,
    cancellationBehavior: "SAFE_BEFORE_CLAIM",
    retryBehavior: "NONE",
    requiredTimestamps: ["created_at", "queued_at", "updated_at"],
    resultRequirement: "NONE"
  },
  RUNNING: {
    predecessors: ["QUEUED", "RETRY_WAIT"],
    successors: ["RETRY_WAIT", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "UNKNOWN_OUTCOME"],
    terminal: false,
    workerMayClaim: false,
    cancellationBehavior: "COOPERATIVE",
    retryBehavior: "BOUNDED",
    requiredTimestamps: ["created_at", "queued_at", "started_at", "updated_at"],
    resultRequirement: "NONE"
  },
  RETRY_WAIT: {
    predecessors: ["RUNNING", "UNKNOWN_OUTCOME"],
    successors: ["RUNNING", "CANCEL_REQUESTED"],
    terminal: false,
    workerMayClaim: true,
    cancellationBehavior: "SAFE_BEFORE_CLAIM",
    retryBehavior: "BOUNDED",
    requiredTimestamps: ["created_at", "queued_at", "updated_at", "next_eligible_attempt_at"],
    resultRequirement: "NONE"
  },
  CANCEL_REQUESTED: {
    predecessors: ["QUEUED", "RETRY_WAIT", "RUNNING"],
    successors: ["CANCELED", "SUCCEEDED", "FAILED", "UNKNOWN_OUTCOME"],
    terminal: false,
    workerMayClaim: false,
    cancellationBehavior: "COOPERATIVE",
    retryBehavior: "NONE",
    requiredTimestamps: ["created_at", "queued_at", "updated_at"],
    resultRequirement: "NONE"
  },
  UNKNOWN_OUTCOME: {
    predecessors: ["RUNNING", "CANCEL_REQUESTED"],
    successors: ["RETRY_WAIT", "FAILED"],
    terminal: false,
    workerMayClaim: false,
    cancellationBehavior: "REQUIRES_RECONCILIATION",
    retryBehavior: "MANUAL_RECONCILIATION",
    requiredTimestamps: ["created_at", "queued_at", "updated_at"],
    resultRequirement: "ERROR_REQUIRED"
  },
  SUCCEEDED: {
    predecessors: ["RUNNING", "CANCEL_REQUESTED"],
    successors: [],
    terminal: true,
    workerMayClaim: false,
    cancellationBehavior: "TERMINAL",
    retryBehavior: "NONE",
    requiredTimestamps: ["created_at", "queued_at", "started_at", "updated_at", "finished_at"],
    resultRequirement: "REQUIRED"
  },
  FAILED: {
    predecessors: ["RUNNING", "CANCEL_REQUESTED", "UNKNOWN_OUTCOME"],
    successors: [],
    terminal: true,
    workerMayClaim: false,
    cancellationBehavior: "TERMINAL",
    retryBehavior: "NONE",
    requiredTimestamps: ["created_at", "queued_at", "started_at", "updated_at", "finished_at"],
    resultRequirement: "ERROR_REQUIRED"
  },
  CANCELED: {
    predecessors: ["CANCEL_REQUESTED"],
    successors: [],
    terminal: true,
    workerMayClaim: false,
    cancellationBehavior: "TERMINAL",
    retryBehavior: "NONE",
    requiredTimestamps: ["created_at", "queued_at", "updated_at", "finished_at"],
    resultRequirement: "REQUIRED"
  }
};

export function legalJobTransition(from: JobState, to: JobState): boolean {
  return JOB_LIFECYCLE[from].successors.includes(to);
}

export function assertLegalJobTransition(from: JobState, to: JobState): void {
  if (!legalJobTransition(from, to)) throw new OperationalStateError("INVALID_JOB_TRANSITION");
}

export function isTerminalJobState(state: JobState): boolean {
  return JOB_LIFECYCLE[state].terminal;
}

export interface ExecutionClock {
  now(): Timestamp;
}

export class SystemExecutionClock implements ExecutionClock {
  now(): Timestamp {
    return new Date().toISOString() as Timestamp;
  }
}

export class FixedExecutionClock implements ExecutionClock {
  private currentMilliseconds: number;

  constructor(start: Timestamp) {
    const parsed = Date.parse(start);
    if (!Number.isFinite(parsed)) throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
    this.currentMilliseconds = parsed;
  }

  now(): Timestamp {
    return new Date(this.currentMilliseconds).toISOString() as Timestamp;
  }

  advance(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
    }
    this.currentMilliseconds += milliseconds;
  }
}

export function addMilliseconds(timestamp: Timestamp, milliseconds: number): Timestamp {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  return new Date(parsed + milliseconds).toISOString() as Timestamp;
}

export interface CommandSubmissionInput {
  readonly command_type: CommandType;
  readonly idempotency_key: IdempotencyKey;
  readonly request_payload: CommandPayload;
  readonly requested_operation: "EXECUTE";
  readonly request_reference?: ObjectReference;
  readonly authority_context_reference: ObjectReference;
  readonly correlation_metadata: Command["correlation_metadata"];
}

export interface JobExecutionConfig {
  readonly retry_policy?: RetryPolicy;
  readonly lease_milliseconds?: number;
}

export interface WorkerExecutionContext {
  readonly job_id: JobId;
  readonly attempt_id: JobAttemptId;
  readonly attempt_number: number;
  readonly signal: AbortSignal;
  isCancellationRequested(): Promise<boolean>;
  acknowledgeCancellation(): Promise<void>;
  reportProgress(input: Omit<ProgressInput, "job_id" | "attempt_id" | "occurred_at">): Promise<ProgressEvent>;
}

export type WorkerExecutionResult =
  | { readonly kind: "SUCCEEDED"; readonly result: JobResult }
  | { readonly kind: "RETRYABLE_FAILURE"; readonly error: ExecutionError }
  | { readonly kind: "NON_RETRYABLE_FAILURE"; readonly error: ExecutionError }
  | { readonly kind: "UNKNOWN_OUTCOME"; readonly error: ExecutionError }
  | { readonly kind: "CANCELED" };

export interface ExecutionWorker {
  readonly worker_identity: string;
  readonly worker_type: WorkerType;
  execute(command: Command, context: WorkerExecutionContext): Promise<WorkerExecutionResult>;
}

export interface WorkerRegistry {
  resolve(command: Command): ExecutionWorker | undefined;
}

export interface ProgressInput {
  readonly job_id: JobId;
  readonly attempt_id: JobAttemptId;
  readonly occurred_at: Timestamp;
  readonly phase: ProgressPhase;
  readonly message_code: ProgressCode;
  readonly progress_value?: number;
}

export interface ClaimedExecution {
  readonly command: Command;
  readonly job: Job;
  readonly attempt: JobAttempt;
  readonly worker: ExecutionWorker;
}

export interface ExecutionCompletion {
  readonly job: Job;
  readonly attempt: JobAttempt;
}

export interface JobExecutionPersistence {
  submit(
    command: Command,
    job: Job,
    semanticInputDigest: string,
    at: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<{ readonly command: Command; readonly job: Job; readonly reused: boolean }>;
  getJob(jobId: JobId): Promise<Job | undefined>;
  listProgress(jobId: JobId): Promise<ReadonlyArray<ProgressEvent>>;
  claimNext(
    now: Timestamp,
    leaseExpiresAt: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<ClaimedExecution | undefined>;
  recordProgress(input: ProgressInput): Promise<ProgressEvent>;
  appendProgressEvent(event: ProgressEvent): Promise<ProgressEvent>;
  completeAttempt(claim: ClaimedExecution, result: WorkerExecutionResult, at: Timestamp): Promise<ExecutionCompletion>;
  requestCancellation(jobId: JobId, at: Timestamp): Promise<Job>;
  isCancellationRequested(jobId: JobId): Promise<boolean>;
  reconcileExpired(now: Timestamp): Promise<ReadonlyArray<Job>>;
  reconcileUnknownOutcome(jobId: JobId, safeToRetry: boolean, at: Timestamp): Promise<Job>;
}

function invalid(code: OperationalErrorCode): never {
  throw new OperationalStateError(code);
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function assertCommand(value: unknown): asserts value is Command {
  const result = validateEntity(value, "Command");
  if (!result.valid) invalid("INVALID_COMMAND_PAYLOAD");
}

function assertJob(value: unknown): asserts value is Job {
  const result = validateEntity(value, "Job");
  if (!result.valid) invalid("JOB_PERSISTENCE_FAILED");
}

function assertAttempt(value: unknown): asserts value is JobAttempt {
  const result = validateEntity(value, "JobAttempt");
  if (!result.valid) invalid("JOB_PERSISTENCE_FAILED");
}

function assertProgress(value: unknown): asserts value is ProgressEvent {
  const result = validateEntity(value, "ProgressEvent");
  if (!result.valid) invalid("INVALID_PROGRESS_EVENT");
}

function commandReference(command: Command): ObjectReference {
  return { entity_type: "Command", object_id: command.command_id };
}

function jobReference(job: Job): ObjectReference {
  return { entity_type: "Job", object_id: job.job_id };
}

function attemptReference(attempt: JobAttempt): ObjectReference {
  return { entity_type: "JobAttempt", object_id: attempt.job_attempt_id };
}

function progressReference(event: ProgressEvent): ObjectReference {
  return { entity_type: "ProgressEvent", object_id: event.progress_event_id };
}

export function executionAuditEvent(
  action: AuditAction,
  object: ObjectReference,
  occurredAt: Timestamp,
  reason: string,
  seed: string,
  priorReference?: ObjectReference,
  newReference?: ObjectReference,
  securityContext?: OperationalSecurityContext
): AuditEvent {
  const actor = securityContext?.actor ?? (securityContext === undefined
    ? SYSTEM_ACTOR
    : {
        actor_type: securityContext.principalType === "USER"
          ? "PRACTITIONER"
          : securityContext.principalType === "AGENT"
            ? "AGENT"
            : securityContext.principalType === "SERVICE"
              ? "PROCESSOR"
              : "SYSTEM",
        actor_id: securityContext.humanPrincipalId ?? securityContext.principalId,
        role: securityContext.actor?.role ?? "authenticated-principal"
      });
  return withoutUndefined({
    entity_type: "AuditEvent",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json",
    schema_version: "1.0.0",
    audit_event_id: `aud_${sha256Hex(new TextEncoder().encode(seed)).slice(0, 40)}` as AuditEvent["audit_event_id"],
    record_version: 1,
    occurred_at: occurredAt,
    actor,
    audit_action: action,
    object,
    authority_type: securityContext === undefined
      ? "SYSTEM"
      : securityContext.principalType === "USER"
        ? "HUMAN_PRACTITIONER"
        : securityContext.principalType === "AGENT"
          ? "AGENT_DRAFT"
          : securityContext.principalType === "SERVICE"
            ? "MACHINE"
            : "SYSTEM",
    reason,
    prior_reference: priorReference,
    new_reference: newReference,
    immutable_history: true
  }) as AuditEvent;
}

function error(code: ExecutionErrorCode, category: FailureCategory): ExecutionError {
  return { code, category };
}

function result(summaryCode: string, resultCode: "COMPLETED" | "CANCELED" = "COMPLETED"): JobResult {
  return { result_code: resultCode, summary_code: summaryCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EXECUTION_ERROR_CODES: ReadonlySet<string> = new Set([
  "IDEMPOTENCY_CONFLICT",
  "JOB_NOT_FOUND",
  "JOB_NOT_CLAIMABLE",
  "INVALID_JOB_TRANSITION",
  "JOB_ALREADY_TERMINAL",
  "CANCELLATION_NOT_ALLOWED",
  "ATTEMPT_LIMIT_EXCEEDED",
  "WORKER_FAILURE_RETRYABLE",
  "WORKER_FAILURE_NON_RETRYABLE",
  "EXECUTION_OUTCOME_UNKNOWN",
  "JOB_PERSISTENCE_FAILED",
  "UNKNOWN_COMMAND_TYPE",
  "UNKNOWN_WORKER_TYPE",
  "PROGRESS_SEQUENCE_CONFLICT",
  "RECONCILIATION_REQUIRED",
  "INVALID_COMMAND_PAYLOAD",
  "INVALID_PROGRESS_EVENT"
]);

function isExecutionError(value: unknown): value is ExecutionError {
  if (!isRecord(value) || Object.keys(value).length !== 2) return false;
  return typeof value.code === "string"
    && EXECUTION_ERROR_CODES.has(value.code)
    && (value.category === "RETRYABLE" || value.category === "NON_RETRYABLE" || value.category === "UNKNOWN_OUTCOME");
}

function isJobResult(value: unknown): value is JobResult {
  if (!isRecord(value) || !boundedText(value.summary_code, 512)) return false;
  if (value.result_code !== "COMPLETED" && value.result_code !== "CANCELED") return false;
  return Object.keys(value).every((key) => key === "result_code" || key === "summary_code" || key === "result_reference")
    && (value.result_reference === undefined || isCanonicalObjectReference(value.result_reference));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum;
}

function normalizeWorkerResult(value: unknown): WorkerExecutionResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return { kind: "UNKNOWN_OUTCOME", error: error("EXECUTION_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME") };
  }
  if (value.kind === "SUCCEEDED" && isJobResult(value.result)) {
    return { kind: "SUCCEEDED", result: value.result };
  }
  if ((value.kind === "RETRYABLE_FAILURE" || value.kind === "NON_RETRYABLE_FAILURE" || value.kind === "UNKNOWN_OUTCOME") && isExecutionError(value.error)) {
    return { kind: value.kind, error: value.error };
  }
  if (value.kind === "CANCELED" && Object.keys(value).length === 1) return { kind: "CANCELED" };
  return { kind: "UNKNOWN_OUTCOME", error: error("EXECUTION_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME") };
}

function defaultRetryPolicy(config?: JobExecutionConfig): RetryPolicy {
  return config?.retry_policy ?? {
    max_attempts: 3,
    backoff_milliseconds: 1000,
    backoff_strategy: "FIXED"
  };
}

function semanticInput(input: CommandSubmissionInput): Readonly<Record<string, unknown>> {
  return withoutUndefined({
    command_type: input.command_type,
    requested_operation: input.requested_operation,
    request_payload: input.request_payload,
    request_reference: input.request_reference,
    authority_context_reference: input.authority_context_reference
  });
}

export function semanticInputDigest(input: CommandSubmissionInput): string {
  try {
    return sha256Hex(new TextEncoder().encode(canonicalJson(semanticInput(input))));
  } catch {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
}

function derivedId(prefix: "cmd" | "job", idempotencyKey: string, digest: string): string {
  return `${prefix}_${sha256Hex(new TextEncoder().encode(`${idempotencyKey}:${digest}`)).slice(0, 40)}`;
}

function scopedDerivedId(prefix: "cmd" | "job", idempotencyKey: string, digest: string, scopeSeed?: string): string {
  return scopeSeed === undefined ? derivedId(prefix, idempotencyKey, digest) : `${prefix}_${sha256Hex(new TextEncoder().encode(`${scopeSeed}:${idempotencyKey}:${digest}`)).slice(0, 40)}`;
}

function buildCommand(input: CommandSubmissionInput, at: Timestamp, digest: string, scopeSeed?: string): Command {
  const command: Command = {
    entity_type: "Command",
    schema_id: COMMAND_SCHEMA_ID,
    schema_version: "1.0.0",
    command_id: scopedDerivedId("cmd", input.idempotency_key, digest, scopeSeed) as CommandId,
    record_version: 1,
    command_type: input.command_type,
    idempotency_key: input.idempotency_key,
    semantic_input_digest: digest as Command["semantic_input_digest"],
    submitted_at: at,
    request_payload: input.request_payload,
    requested_operation: input.requested_operation,
    request_reference: input.request_reference,
    authority_context_reference: input.authority_context_reference,
    correlation_metadata: input.correlation_metadata
  };
  const normalized = withoutUndefined(command) as Command;
  assertCommand(normalized);
  return normalized;
}

function buildJob(command: Command, at: Timestamp, config?: JobExecutionConfig, scopeSeed?: string): Job {
  const retryPolicy = defaultRetryPolicy(config);
  const job: Job = {
    entity_type: "Job",
    schema_id: JOB_SCHEMA_ID,
    schema_version: "1.0.0",
    job_id: scopedDerivedId("job", command.idempotency_key, command.semantic_input_digest, scopeSeed) as JobId,
    record_version: 1,
    command_id: command.command_id,
    created_at: at,
    queued_at: at,
    updated_at: at,
    state: "QUEUED",
    retry_policy: retryPolicy,
    current_attempt_number: 0,
    reconciliation_state: "NONE"
  };
  assertJob(job);
  return job;
}

export function progressEventFor(input: ProgressInput, sequence: number): ProgressEvent {
  const event: ProgressEvent = withoutUndefined({
    entity_type: "ProgressEvent",
    schema_id: PROGRESS_SCHEMA_ID,
    schema_version: "1.0.0",
    progress_event_id: `pev_${sha256Hex(new TextEncoder().encode(`${input.job_id}:${input.attempt_id}:${sequence}`)).slice(0, 40)}` as ProgressEventId,
    record_version: 1,
    job_id: input.job_id,
    job_attempt_id: input.attempt_id,
    sequence,
    occurred_at: input.occurred_at,
    phase: input.phase,
    message_code: input.message_code,
    progress_value: input.progress_value
  }) as ProgressEvent;
  assertProgress(event);
  return event;
}

interface CompletionMutation {
  readonly job: Job;
  readonly attempt: JobAttempt;
}

function completeMutation(job: Job, attempt: JobAttempt, workerResult: WorkerExecutionResult, at: Timestamp): CompletionMutation {
  if (job.state !== "RUNNING" && job.state !== "CANCEL_REQUESTED") invalid("INVALID_JOB_TRANSITION");
  if (attempt.outcome !== "STARTED" || attempt.ended_at !== undefined) invalid("INVALID_JOB_TRANSITION");

  const baseAttempt: JobAttempt = {
    ...attempt,
    record_version: attempt.record_version + 1,
    ended_at: at
  };
  let nextState: JobState;
  let nextAttempt: JobAttempt;
  let nextJob: Job;

  if (workerResult.kind === "SUCCEEDED") {
    nextState = "SUCCEEDED";
    nextAttempt = { ...baseAttempt, outcome: "SUCCEEDED", retry_decision: "NOT_APPLICABLE", result: workerResult.result };
    nextJob = {
      ...job,
      record_version: job.record_version + 1,
      state: nextState,
      updated_at: at,
      finished_at: at,
      next_eligible_attempt_at: undefined,
      reconciliation_state: "NONE",
      result: workerResult.result,
      error: undefined
    };
  } else if (workerResult.kind === "CANCELED") {
    if (job.state !== "CANCEL_REQUESTED") invalid("CANCELLATION_NOT_ALLOWED");
    nextState = "CANCELED";
    const cancellation = {
      ...(job.cancellation ?? { requested_at: at, reason_code: "USER_REQUESTED" as const }),
      acknowledged_at: at,
      canceled_at: at,
      reason_code: "SAFE_BOUNDARY" as const
    };
    nextAttempt = {
      ...baseAttempt,
      outcome: "CANCELED",
      retry_decision: "CANCELED",
      cancellation_acknowledged_at: at,
      result: result("CANCELED", "CANCELED")
    };
    nextJob = {
      ...job,
      record_version: job.record_version + 1,
      state: nextState,
      updated_at: at,
      finished_at: at,
      next_eligible_attempt_at: undefined,
      reconciliation_state: "NONE",
      cancellation,
      result: result("CANCELED", "CANCELED"),
      error: undefined
    };
  } else if (workerResult.kind === "UNKNOWN_OUTCOME") {
    nextState = "UNKNOWN_OUTCOME";
    nextAttempt = {
      ...baseAttempt,
      outcome: "UNKNOWN_OUTCOME",
      failure_category: "UNKNOWN_OUTCOME",
      retry_decision: "MANUAL_RECONCILIATION_REQUIRED",
      error: workerResult.error
    };
    nextJob = {
      ...job,
      record_version: job.record_version + 1,
      state: nextState,
      updated_at: at,
      finished_at: undefined,
      next_eligible_attempt_at: undefined,
      reconciliation_state: "RECONCILIATION_REQUIRED",
      result: undefined,
      error: workerResult.error
    };
  } else if (workerResult.kind === "RETRYABLE_FAILURE") {
    const exhausted = attempt.attempt_number >= job.retry_policy.max_attempts;
    nextState = exhausted ? "FAILED" : "RETRY_WAIT";
    nextAttempt = {
      ...baseAttempt,
      outcome: "FAILED_RETRYABLE",
      failure_category: "RETRYABLE",
      retry_decision: exhausted ? "RETRY_EXHAUSTED" : "RETRY_SCHEDULED",
      error: workerResult.error
    };
    nextJob = {
      ...job,
      record_version: job.record_version + 1,
      state: nextState,
      updated_at: at,
      finished_at: exhausted ? at : undefined,
      next_eligible_attempt_at: exhausted ? undefined : addMilliseconds(at, job.retry_policy.backoff_milliseconds),
      reconciliation_state: "NONE",
      result: undefined,
      error: exhausted ? error("ATTEMPT_LIMIT_EXCEEDED", "NON_RETRYABLE") : undefined
    };
  } else {
    nextState = "FAILED";
    nextAttempt = {
      ...baseAttempt,
      outcome: "FAILED_NON_RETRYABLE",
      failure_category: "NON_RETRYABLE",
      retry_decision: "NOT_APPLICABLE",
      error: workerResult.error
    };
    nextJob = {
      ...job,
      record_version: job.record_version + 1,
      state: nextState,
      updated_at: at,
      finished_at: at,
      next_eligible_attempt_at: undefined,
      reconciliation_state: "NONE",
      result: undefined,
      error: workerResult.error
    };
  }

  assertLegalJobTransition(job.state, nextState);
  const normalizedAttempt = withoutUndefined(nextAttempt) as JobAttempt;
  const normalizedJob = withoutUndefined(nextJob) as Job;
  assertAttempt(normalizedAttempt);
  assertJob(normalizedJob);
  return { job: normalizedJob, attempt: normalizedAttempt };
}

export function completionAuditEvents(previousAttempt: JobAttempt, mutation: CompletionMutation, at: Timestamp, securityContext?: OperationalSecurityContext): ReadonlyArray<AuditEvent> {
  const events: AuditEvent[] = [
    executionAuditEvent(
      "ATTEMPT_COMPLETED",
      attemptReference(mutation.attempt),
      at,
      "Execution attempt completed.",
      `${mutation.attempt.job_attempt_id}:completed:${mutation.attempt.record_version}`,
      attemptReference(previousAttempt),
      attemptReference(mutation.attempt),
      securityContext
    )
  ];
  if (mutation.job.state === "RETRY_WAIT") {
    events.push(executionAuditEvent("RETRY_SCHEDULED", jobReference(mutation.job), at, "Bounded retry scheduled.", `${mutation.job.job_id}:retry:${mutation.job.record_version}`, undefined, undefined, securityContext));
  } else if (mutation.job.state === "SUCCEEDED") {
    events.push(executionAuditEvent("JOB_SUCCEEDED", jobReference(mutation.job), at, "Job completed successfully.", `${mutation.job.job_id}:succeeded:${mutation.job.record_version}`, undefined, undefined, securityContext));
  } else if (mutation.job.state === "FAILED") {
    events.push(executionAuditEvent("JOB_FAILED", jobReference(mutation.job), at, "Job failed with a bounded execution error.", `${mutation.job.job_id}:failed:${mutation.job.record_version}`, undefined, undefined, securityContext));
  } else if (mutation.job.state === "CANCELED") {
    events.push(executionAuditEvent("CANCELLATION_ACKNOWLEDGED", attemptReference(mutation.attempt), at, "Worker acknowledged cancellation at a safe boundary.", `${mutation.attempt.job_attempt_id}:cancellation:${mutation.attempt.record_version}`, undefined, undefined, securityContext));
    events.push(executionAuditEvent("JOB_CANCELED", jobReference(mutation.job), at, "Job cancellation took effect.", `${mutation.job.job_id}:canceled:${mutation.job.record_version}`, undefined, undefined, securityContext));
  } else if (mutation.job.state === "UNKNOWN_OUTCOME") {
    events.push(executionAuditEvent("UNKNOWN_OUTCOME", jobReference(mutation.job), at, "Worker execution outcome requires reconciliation.", `${mutation.job.job_id}:unknown:${mutation.job.record_version}`, undefined, undefined, securityContext));
  }
  return events;
}

export class JobExecutionService {
  private readonly clock: ExecutionClock;
  private readonly registry: WorkerRegistry;
  private readonly config: JobExecutionConfig;

  constructor(
    private readonly persistence: JobExecutionPersistence,
    registry: WorkerRegistry,
    options: { readonly clock?: ExecutionClock; readonly config?: JobExecutionConfig; readonly securityContext?: OperationalSecurityContext } = {}
  ) {
    this.registry = registry;
    this.clock = options.clock ?? new SystemExecutionClock();
    this.config = options.config ?? {};
    this.securityContext = options.securityContext;
    if (this.securityContext) assertTenantScope(this.securityContext);
  }

  private readonly securityContext?: OperationalSecurityContext;

  async submit(input: CommandSubmissionInput): Promise<{ readonly command: Command; readonly job: Job; readonly reused: boolean }> {
    const digest = semanticInputDigest(input);
    const scopeSeed = this.securityContext ? scopeKey(this.securityContext) : undefined;
    const command = buildCommand(input, this.clock.now(), digest, scopeSeed);
    const job = buildJob(command, command.submitted_at, this.config, scopeSeed);
    return this.persistence.submit(command, job, digest, command.submitted_at, (candidate) => this.resolveWorker(candidate));
  }

  async getJob(jobId: JobId): Promise<Job | undefined> {
    return this.persistence.getJob(jobId);
  }

  async getProgress(jobId: JobId): Promise<ReadonlyArray<ProgressEvent>> {
    return this.persistence.listProgress(jobId);
  }

  async requestCancellation(jobId: JobId): Promise<Job> {
    return this.persistence.requestCancellation(jobId, this.clock.now());
  }

  async runNext(): Promise<ExecutionCompletion | undefined> {
    const now = this.clock.now();
    const claim = await this.persistence.claimNext(
      now,
      addMilliseconds(now, this.config.lease_milliseconds ?? 30000),
      (command) => this.resolveWorker(command)
    );
    if (!claim) return undefined;
    const controller = new AbortController();
    const context: WorkerExecutionContext = {
      job_id: claim.job.job_id,
      attempt_id: claim.attempt.job_attempt_id,
      attempt_number: claim.attempt.attempt_number,
      signal: controller.signal,
      isCancellationRequested: () => this.persistence.isCancellationRequested(claim.job.job_id),
      acknowledgeCancellation: async () => {
        if (!(await this.persistence.isCancellationRequested(claim.job.job_id))) {
          throw new OperationalStateError("CANCELLATION_NOT_ALLOWED");
        }
      },
      reportProgress: (input) => this.persistence.recordProgress({
        ...input,
        job_id: claim.job.job_id,
        attempt_id: claim.attempt.job_attempt_id,
        occurred_at: this.clock.now()
      })
    };
    let workerResult: WorkerExecutionResult;
    try {
      workerResult = normalizeWorkerResult(await claim.worker.execute(claim.command, context));
    } catch {
      workerResult = {
        kind: "UNKNOWN_OUTCOME",
        error: error("EXECUTION_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME")
      };
    }
    return this.persistence.completeAttempt(claim, workerResult, this.clock.now());
  }

  async reconcileExpired(): Promise<ReadonlyArray<Job>> {
    return this.persistence.reconcileExpired(this.clock.now());
  }

  async reconcileUnknownOutcome(jobId: JobId, safeToRetry: boolean): Promise<Job> {
    return this.persistence.reconcileUnknownOutcome(jobId, safeToRetry, this.clock.now());
  }

  private resolveWorker(command: Command): ExecutionWorker {
    const worker = this.registry.resolve(command);
    if (worker) return worker;
    if (command.command_type !== "FIXTURE_EXECUTION") throw new OperationalStateError("UNKNOWN_COMMAND_TYPE");
    throw new OperationalStateError("UNKNOWN_WORKER_TYPE");
  }
}

export interface InMemoryJobExecutionStorage {
  readonly auditEvents: AuditEvent[];
  readonly commandsByIdentity: Map<string, Command>;
  readonly commandsById: Map<CommandId, Command>;
  readonly jobs: Map<JobId, Job>;
  readonly attempts: Map<JobAttemptId, JobAttempt>;
  readonly progress: Map<JobId, ProgressEvent[]>;
  lock: Promise<void>;
}

export function createInMemoryJobExecutionStorage(): InMemoryJobExecutionStorage {
  return {
    auditEvents: [],
    commandsByIdentity: new Map(),
    commandsById: new Map(),
    jobs: new Map(),
    attempts: new Map(),
    progress: new Map(),
    lock: Promise.resolve()
  };
}

export class InMemoryJobExecutionPersistence implements JobExecutionPersistence {
  readonly auditEvents: AuditEvent[];
  private readonly commandsByIdentity: Map<string, Command>;
  private readonly commandsById: Map<CommandId, Command>;
  private readonly jobs: Map<JobId, Job>;
  private readonly attempts: Map<JobAttemptId, JobAttempt>;
  private readonly progress: Map<JobId, ProgressEvent[]>;

  constructor(
    private readonly securityContext?: OperationalSecurityContext,
    storage: InMemoryJobExecutionStorage = createInMemoryJobExecutionStorage()
  ) {
    if (securityContext) assertTenantScope(securityContext);
    this.auditEvents = storage.auditEvents;
    this.commandsByIdentity = storage.commandsByIdentity;
    this.commandsById = storage.commandsById;
    this.jobs = storage.jobs;
    this.attempts = storage.attempts;
    this.progress = storage.progress;
    this.storage = storage;
  }

  private readonly storage: InMemoryJobExecutionStorage;

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.storage.lock;
    let release!: () => void;
    this.storage.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async submit(
    command: Command,
    job: Job,
    semanticDigest: string,
    at: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<{ readonly command: Command; readonly job: Job; readonly reused: boolean }> {
    return this.withLock(async () => {
      const identity = `${this.securityContext ? scopeKey(this.securityContext) : "unscoped"}:${command.command_type}:${command.idempotency_key}`;
      const existing = this.commandsByIdentity.get(identity);
      if (existing) {
        if (existing.semantic_input_digest !== semanticDigest) throw new OperationalStateError("IDEMPOTENCY_CONFLICT");
        const existingJob = this.jobs.get(this.jobIdForCommand(existing));
        if (!existingJob) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
        this.auditEvents.push(executionAuditEvent("COMMAND_IDEMPOTENT_REUSED", commandReference(existing), at, "Idempotent command reused.", `${existing.command_id}:reuse:${existing.correlation_metadata.request_id}`, undefined, jobReference(existingJob), this.securityContext));
        return { command: existing, job: existingJob, reused: true };
      }
      resolveWorker(command);
      this.commandsByIdentity.set(identity, command);
      this.commandsById.set(command.command_id, command);
      this.jobs.set(job.job_id, job);
      this.auditEvents.push(executionAuditEvent("COMMAND_ACCEPTED", commandReference(command), command.submitted_at, "Command accepted.", `${command.command_id}:accepted`, undefined, jobReference(job), this.securityContext));
      return { command, job, reused: false };
    });
  }

  async getJob(jobId: JobId): Promise<Job | undefined> {
    return this.withLock(async () => this.jobs.get(jobId));
  }

  async listProgress(jobId: JobId): Promise<ReadonlyArray<ProgressEvent>> {
    return this.withLock(async () => [...(this.progress.get(jobId) ?? [])].sort((left, right) => left.sequence - right.sequence));
  }

  async claimNext(
    now: Timestamp,
    leaseExpiresAt: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<ClaimedExecution | undefined> {
    return this.withLock(async () => {
      const candidates = [...this.jobs.values()]
        .filter((candidate) =>
          candidate.state === "QUEUED" ||
          (candidate.state === "RETRY_WAIT" && candidate.next_eligible_attempt_at !== undefined && candidate.next_eligible_attempt_at <= now)
        )
        .sort((left, right) => left.queued_at.localeCompare(right.queued_at) || left.job_id.localeCompare(right.job_id));
      const job = candidates[0];
      if (!job) return undefined;
      const command = this.commandsById.get(job.command_id);
      if (!command) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
      const worker = resolveWorker(command);
      const attemptNumber = job.current_attempt_number + 1;
      if (attemptNumber > job.retry_policy.max_attempts) throw new OperationalStateError("ATTEMPT_LIMIT_EXCEEDED");
      const attempt: JobAttempt = {
        entity_type: "JobAttempt",
        schema_id: ATTEMPT_SCHEMA_ID,
        schema_version: "1.0.0",
        job_attempt_id: `jatt_${sha256Hex(new TextEncoder().encode(`${job.job_id}:${attemptNumber}`)).slice(0, 40)}` as JobAttemptId,
        record_version: 1,
        job_id: job.job_id,
        attempt_number: attemptNumber,
        worker_identity: worker.worker_identity,
        worker_type: worker.worker_type,
        claimed_at: now,
        started_at: now,
        lease_expires_at: leaseExpiresAt,
        outcome: "STARTED",
        retry_decision: "NOT_APPLICABLE"
      };
      const updatedJob: Job = {
        ...job,
        record_version: job.record_version + 1,
        state: "RUNNING",
        started_at: job.started_at ?? now,
        updated_at: now,
        current_attempt_number: attemptNumber,
        last_attempt_id: attempt.job_attempt_id,
        next_eligible_attempt_at: undefined
      };
      assertLegalJobTransition(job.state, updatedJob.state);
      assertAttempt(attempt);
      const normalizedUpdatedJob = withoutUndefined(updatedJob) as Job;
      assertJob(normalizedUpdatedJob);
      this.attempts.set(attempt.job_attempt_id, attempt);
      this.jobs.set(normalizedUpdatedJob.job_id, normalizedUpdatedJob);
      this.auditEvents.push(executionAuditEvent("JOB_CLAIMED", jobReference(normalizedUpdatedJob), now, "Job claimed by a registered worker.", `${normalizedUpdatedJob.job_id}:claimed:${normalizedUpdatedJob.record_version}`, jobReference(job), jobReference(normalizedUpdatedJob), this.securityContext));
      this.auditEvents.push(executionAuditEvent("ATTEMPT_STARTED", attemptReference(attempt), now, "Execution attempt started.", `${attempt.job_attempt_id}:started`, undefined, undefined, this.securityContext));
      return { command, job: normalizedUpdatedJob, attempt, worker };
    });
  }

  async recordProgress(input: ProgressInput): Promise<ProgressEvent> {
    return this.withLock(async () => {
      const events = this.progress.get(input.job_id) ?? [];
      const sequence = (events.at(-1)?.sequence ?? 0) + 1;
      const event = progressEventFor(input, sequence);
      return this.appendProgressInternal(event);
    });
  }

  async appendProgressEvent(event: ProgressEvent): Promise<ProgressEvent> {
    return this.withLock(async () => this.appendProgressInternal(event));
  }

  private appendProgressInternal(event: ProgressEvent): ProgressEvent {
    assertProgress(event);
    if (!this.jobs.has(event.job_id)) throw new OperationalStateError("JOB_NOT_FOUND");
    const events = this.progress.get(event.job_id) ?? [];
    if (events.some((candidate) => candidate.sequence === event.sequence)) throw new OperationalStateError("PROGRESS_SEQUENCE_CONFLICT");
    if (event.job_attempt_id !== undefined && !this.attempts.has(event.job_attempt_id)) throw new OperationalStateError("INVALID_PROGRESS_EVENT");
    const previous = events.at(-1);
    const expectedSequence = (previous?.sequence ?? 0) + 1;
    if (event.sequence !== expectedSequence) throw new OperationalStateError("PROGRESS_SEQUENCE_CONFLICT");
    events.push(event);
    this.progress.set(event.job_id, events);
    this.auditEvents.push(executionAuditEvent("PROGRESS_RECORDED", progressReference(event), event.occurred_at, "Bounded progress event recorded.", `${event.progress_event_id}:recorded`, undefined, undefined, this.securityContext));
    return event;
  }

  async completeAttempt(claim: ClaimedExecution, workerResult: WorkerExecutionResult, at: Timestamp): Promise<ExecutionCompletion> {
    return this.withLock(async () => {
      const currentJob = this.jobs.get(claim.job.job_id);
      const currentAttempt = this.attempts.get(claim.attempt.job_attempt_id);
      if (!currentJob || !currentAttempt) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
      const mutation = completeMutation(currentJob, currentAttempt, workerResult, at);
      this.attempts.set(mutation.attempt.job_attempt_id, mutation.attempt);
      this.jobs.set(mutation.job.job_id, mutation.job);
      this.auditEvents.push(...completionAuditEvents(claim.attempt, mutation, at, this.securityContext));
      return mutation;
    });
  }

  async requestCancellation(jobId: JobId, at: Timestamp): Promise<Job> {
    return this.withLock(async () => {
      const job = this.jobs.get(jobId);
      if (!job) throw new OperationalStateError("JOB_NOT_FOUND");
      if (job.state === "SUCCEEDED" || job.state === "FAILED" || job.state === "CANCELED") throw new OperationalStateError("JOB_ALREADY_TERMINAL");
      if (job.state === "UNKNOWN_OUTCOME") throw new OperationalStateError("CANCELLATION_NOT_ALLOWED");
      if (job.state === "CANCEL_REQUESTED") return job;
      const requested: Job = {
        ...job,
        record_version: job.record_version + 1,
        state: "CANCEL_REQUESTED",
        updated_at: at,
        cancellation: { requested_at: at, reason_code: "USER_REQUESTED" }
      };
      assertLegalJobTransition(job.state, requested.state);
      this.jobs.set(job.job_id, requested);
      this.auditEvents.push(executionAuditEvent("CANCELLATION_REQUESTED", jobReference(requested), at, "Cooperative job cancellation requested.", `${job.job_id}:cancel-requested:${requested.record_version}`, jobReference(job), jobReference(requested), this.securityContext));
      if (job.state === "QUEUED" || job.state === "RETRY_WAIT") {
        const canceled: Job = {
          ...requested,
          record_version: requested.record_version + 1,
          state: "CANCELED",
          updated_at: at,
          finished_at: at,
          cancellation: { ...requested.cancellation!, canceled_at: at },
          result: result("CANCELED", "CANCELED")
        };
        assertLegalJobTransition(requested.state, canceled.state);
        assertJob(canceled);
        this.jobs.set(job.job_id, canceled);
        this.auditEvents.push(executionAuditEvent("JOB_CANCELED", jobReference(canceled), at, "Cancellation took effect before worker claim.", `${job.job_id}:canceled:${canceled.record_version}`, undefined, undefined, this.securityContext));
        return canceled;
      }
      assertJob(requested);
      return requested;
    });
  }

  async isCancellationRequested(jobId: JobId): Promise<boolean> {
    return this.withLock(async () => {
      const job = this.jobs.get(jobId);
      if (!job) throw new OperationalStateError("JOB_NOT_FOUND");
      return job.state === "CANCEL_REQUESTED" || job.state === "CANCELED";
    });
  }

  async reconcileExpired(now: Timestamp): Promise<ReadonlyArray<Job>> {
    return this.withLock(async () => {
      const recovered: Job[] = [];
      for (const attempt of this.attempts.values()) {
        if (attempt.ended_at !== undefined || attempt.lease_expires_at === undefined || attempt.lease_expires_at > now) continue;
        const job = this.jobs.get(attempt.job_id);
        if (!job || (job.state !== "RUNNING" && job.state !== "CANCEL_REQUESTED")) continue;
        const mutation = completeMutation(job, attempt, { kind: "UNKNOWN_OUTCOME", error: error("EXECUTION_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME") }, now);
        this.attempts.set(mutation.attempt.job_attempt_id, mutation.attempt);
        this.jobs.set(mutation.job.job_id, mutation.job);
        this.auditEvents.push(...completionAuditEvents(attempt, mutation, now, this.securityContext));
        recovered.push(mutation.job);
      }
      return recovered;
    });
  }

  async reconcileUnknownOutcome(jobId: JobId, safeToRetry: boolean, at: Timestamp): Promise<Job> {
    return this.withLock(async () => {
      const job = this.jobs.get(jobId);
      if (!job) throw new OperationalStateError("JOB_NOT_FOUND");
      if (job.state !== "UNKNOWN_OUTCOME" || job.reconciliation_state !== "RECONCILIATION_REQUIRED") throw new OperationalStateError("RECONCILIATION_REQUIRED");
      const nextState: JobState = safeToRetry ? "RETRY_WAIT" : "FAILED";
      assertLegalJobTransition(job.state, nextState);
      const updated: Job = {
        ...job,
        record_version: job.record_version + 1,
        state: nextState,
        updated_at: at,
        finished_at: safeToRetry ? undefined : at,
        next_eligible_attempt_at: safeToRetry ? at : undefined,
        reconciliation_state: "RECONCILED",
        error: safeToRetry ? undefined : error("EXECUTION_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME")
      };
      const normalized = withoutUndefined(updated) as Job;
      assertJob(normalized);
      this.jobs.set(jobId, normalized);
      this.auditEvents.push(executionAuditEvent("RECONCILIATION_ACTION", jobReference(normalized), at, safeToRetry ? "Unknown outcome reconciled through a safe retry path." : "Unknown outcome reconciled as failed.", `${job.job_id}:reconciled:${normalized.record_version}`, undefined, undefined, this.securityContext));
      this.auditEvents.push(executionAuditEvent(
        safeToRetry ? "RETRY_SCHEDULED" : "JOB_FAILED",
        jobReference(normalized),
        at,
        safeToRetry ? "Safe retry scheduled after explicit unknown-outcome reconciliation." : "Job failed after explicit unknown-outcome reconciliation.",
        `${job.job_id}:${safeToRetry ? "retry" : "failed"}:${normalized.record_version}`,
        undefined,
        undefined,
        this.securityContext
      ));
      return normalized;
    });
  }

  private jobIdForCommand(command: Command): JobId {
    const jobId = [...this.jobs.values()].find((candidate) => candidate.command_id === command.command_id)?.job_id;
    if (!jobId) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
    return jobId;
  }
}

export function completionForTesting(job: Job, attempt: JobAttempt, resultValue: WorkerExecutionResult, at: Timestamp): ExecutionCompletion {
  return completeMutation(job, attempt, resultValue, at);
}
