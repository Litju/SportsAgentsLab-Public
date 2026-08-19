import {
  canonicalJson,
  validateEntity,
  type AuditEvent,
  type Command,
  type Job,
  type JobAttempt,
  type JobAttemptId,
  type JobId,
  type ProgressEvent,
  type Timestamp
} from "@mef/generated-ts";
import { assertAuditEvent } from "./audit.ts";
import {
  isOperationalStateError,
  OperationalStateError
} from "./errors.ts";
import { sha256Hex } from "./hash.ts";
import {
  completionAuditEvents,
  completionForTesting,
  type ClaimedExecution,
  type ExecutionCompletion,
  type ExecutionWorker,
  type JobExecutionPersistence,
  type ProgressInput,
  progressEventFor,
  type WorkerExecutionResult
} from "./job-execution.ts";
import { PostgresOperationalStore } from "./postgres.ts";
import { assertTenantScope, type OperationalSecurityContext } from "./security.ts";
import { executeRead, withTransaction } from "./transaction.ts";
import type { SqlClient, SqlPool } from "./sql.ts";

interface RecordRow extends Record<string, unknown> {
  readonly record_json: unknown;
}

interface ClaimRow extends Record<string, unknown> {
  readonly command_record: unknown;
  readonly job_record: unknown;
}

interface AttemptAndJobRow extends Record<string, unknown> {
  readonly attempt_record: unknown;
  readonly job_record: unknown;
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
  }
}

function storedEntity<T>(value: unknown, entityType: "Command" | "Job" | "JobAttempt" | "ProgressEvent"): T {
  const candidate = parseJson(value);
  const validation = validateEntity(candidate, entityType);
  if (!validation.valid) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
  return candidate as T;
}

function textJson(value: unknown): string {
  return canonicalJson(value);
}

function timestampOrNull(value: Timestamp | undefined): Timestamp | null {
  return value ?? null;
}

function resultOrNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function attemptIdFor(job: Job, attemptNumber: number): JobAttemptId {
  return `jatt_${sha256Hex(new TextEncoder().encode(`${job.job_id}:${attemptNumber}`)).slice(0, 40)}` as JobAttemptId;
}

function buildAttempt(job: Job, worker: ExecutionWorker, now: Timestamp, leaseExpiresAt: Timestamp): JobAttempt {
  const attempt: JobAttempt = {
    entity_type: "JobAttempt",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/job-attempt.schema.json",
    schema_version: "1.0.0",
    job_attempt_id: attemptIdFor(job, job.current_attempt_number + 1),
    record_version: 1,
    job_id: job.job_id,
    attempt_number: job.current_attempt_number + 1,
    worker_identity: worker.worker_identity,
    worker_type: worker.worker_type,
    claimed_at: now,
    started_at: now,
    lease_expires_at: leaseExpiresAt,
    outcome: "STARTED",
    retry_decision: "NOT_APPLICABLE"
  };
  const validation = validateEntity(attempt, "JobAttempt");
  if (!validation.valid) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
  return attempt;
}

function persistenceError(error: unknown): OperationalStateError {
  if (isOperationalStateError(error)) {
    if (error.code === "DATABASE_TRANSACTION_FAILED" || error.code === "DATABASE_UNAVAILABLE" || error.code === "AUDIT_APPEND_FAILED") {
      return new OperationalStateError("JOB_PERSISTENCE_FAILED", undefined, {
        retryable: error.retryable,
        transactionOutcome: error.transactionOutcome
      });
    }
    return error;
  }
  return new OperationalStateError("JOB_PERSISTENCE_FAILED");
}

function rethrowPersistence(error: unknown): never {
  throw persistenceError(error);
}

export class PostgresJobExecutionPersistence implements JobExecutionPersistence {
  private readonly auditStore: PostgresOperationalStore;

  constructor(private readonly pool: SqlPool, private readonly securityContext?: OperationalSecurityContext, auditStore?: PostgresOperationalStore) {
    if (securityContext) assertTenantScope(securityContext);
    this.auditStore = auditStore ?? new PostgresOperationalStore(pool, securityContext);
  }

  async submit(
    command: Command,
    job: Job,
    semanticInputDigest: string,
    _at: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<{ readonly command: Command; readonly job: Job; readonly reused: boolean }> {
    try {
      const commandValidation = validateEntity(command, "Command");
      const jobValidation = validateEntity(job, "Job");
      if (!commandValidation.valid || !jobValidation.valid || job.command_id !== command.command_id) {
        throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
      }
      return await withTransaction(this.pool, async (client) => {
        if (command.semantic_input_digest !== semanticInputDigest) {
          throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
        }
        const inserted = await client.query<{ readonly command_id: string }>(
          `INSERT INTO mef_commands (
             command_id, record_version, command_type, idempotency_key,
             semantic_input_digest, submitted_at, request_payload,
             requested_operation, request_reference, authority_context_reference,
             correlation_metadata, record_json
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb)
           ON CONFLICT (organization_id, workspace_id, command_type, idempotency_key) DO NOTHING
           RETURNING command_id`,
          [
            command.command_id,
            command.record_version,
            command.command_type,
            command.idempotency_key,
            command.semantic_input_digest,
            command.submitted_at,
            textJson(command.request_payload),
            command.requested_operation,
            command.request_reference === undefined ? null : textJson(command.request_reference),
            textJson(command.authority_context_reference),
            textJson(command.correlation_metadata),
            textJson(command)
          ]
        );

        if (inserted.rows.length === 0) {
          const existingResult = await client.query<RecordRow>(
            `SELECT record_json FROM mef_commands
             WHERE organization_id = nullif(current_setting('mef.organization_id', true), '')
               AND workspace_id = nullif(current_setting('mef.workspace_id', true), '')
               AND command_type = $1 AND idempotency_key = $2
             FOR UPDATE`,
            [command.command_type, command.idempotency_key]
          );
          const existingCommand = existingResult.rows[0]
            ? storedEntity<Command>(existingResult.rows[0].record_json, "Command")
            : undefined;
          if (!existingCommand) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
          if (existingCommand.semantic_input_digest !== semanticInputDigest) {
            throw new OperationalStateError("IDEMPOTENCY_CONFLICT");
          }
          const existingJobResult = await client.query<RecordRow>(
            "SELECT record_json FROM mef_jobs WHERE command_id = $1 FOR UPDATE",
            [existingCommand.command_id]
          );
          const existingJob = existingJobResult.rows[0]
            ? storedEntity<Job>(existingJobResult.rows[0].record_json, "Job")
            : undefined;
          if (!existingJob) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
          const reuseAudit = this.auditEvent(
            "COMMAND_IDEMPOTENT_REUSED",
            { entity_type: "Command", object_id: existingCommand.command_id },
            existingCommand.submitted_at,
            "Idempotent command reused.",
            `${existingCommand.command_id}:reuse:${existingCommand.correlation_metadata.request_id}`,
            undefined,
            { entity_type: "Job", object_id: existingJob.job_id }
          );
          await this.auditStore.appendAuditEventInTransaction(client, reuseAudit);
          return { command: existingCommand, job: existingJob, reused: true };
        }

        resolveWorker(command);
        await client.query(
          `INSERT INTO mef_jobs (
             job_id, record_version, command_id, created_at, queued_at,
             started_at, updated_at, finished_at, state, max_attempts,
             backoff_milliseconds, backoff_strategy, retry_policy,
             current_attempt_number, next_eligible_attempt_at, last_attempt_id,
             cancellation, reconciliation_state, result, error, record_json
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
                     $14, $15, $16, $17::jsonb, $18, $19::jsonb, $20::jsonb, $21::jsonb)`,
          this.jobValues(job)
        );
        const acceptedAudit = this.auditEvent(
          "COMMAND_ACCEPTED",
          { entity_type: "Command", object_id: command.command_id },
          command.submitted_at,
          "Command accepted.",
          `${command.command_id}:accepted`,
          undefined,
          { entity_type: "Job", object_id: job.job_id }
        );
        await this.auditStore.appendAuditEventInTransaction(client, acceptedAudit);
        return { command, job, reused: false };
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async getJob(jobId: JobId): Promise<Job | undefined> {
    try {
      return await executeRead(this.pool, async (client) => {
        const result = await client.query<RecordRow>("SELECT record_json FROM mef_jobs WHERE job_id = $1", [jobId]);
        return result.rows[0] ? storedEntity<Job>(result.rows[0].record_json, "Job") : undefined;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async listProgress(jobId: JobId): Promise<ReadonlyArray<ProgressEvent>> {
    try {
      return await executeRead(this.pool, async (client) => {
        const job = await client.query<RecordRow>("SELECT record_json FROM mef_jobs WHERE job_id = $1", [jobId]);
        if (job.rows.length === 0) throw new OperationalStateError("JOB_NOT_FOUND");
        const events = await client.query<RecordRow>(
          "SELECT record_json FROM mef_progress_events WHERE job_id = $1 ORDER BY sequence ASC",
          [jobId]
        );
        return events.rows.map((row) => storedEntity<ProgressEvent>(row.record_json, "ProgressEvent"));
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async claimNext(
    now: Timestamp,
    leaseExpiresAt: Timestamp,
    resolveWorker: (command: Command) => ExecutionWorker
  ): Promise<ClaimedExecution | undefined> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<ClaimRow>(
          `SELECT c.record_json AS command_record, j.record_json AS job_record
           FROM mef_jobs AS j
           JOIN mef_commands AS c ON c.command_id = j.command_id
           WHERE j.state IN ('QUEUED', 'RETRY_WAIT')
             AND (j.state = 'QUEUED' OR j.next_eligible_attempt_at <= $1)
           ORDER BY j.queued_at ASC, j.job_id ASC
           FOR UPDATE OF j SKIP LOCKED
           LIMIT 1`,
          [now]
        );
        if (result.rows.length === 0) return undefined;
        const command = storedEntity<Command>(result.rows[0].command_record, "Command");
        const job = storedEntity<Job>(result.rows[0].job_record, "Job");
        if (job.current_attempt_number >= job.retry_policy.max_attempts) {
          throw new OperationalStateError("ATTEMPT_LIMIT_EXCEEDED");
        }
        const worker = resolveWorker(command);
        const attempt = buildAttempt(job, worker, now, leaseExpiresAt);
        const updatedJob = stripUndefined({
          ...job,
          record_version: job.record_version + 1,
          state: "RUNNING" as const,
          started_at: job.started_at ?? now,
          updated_at: now,
          current_attempt_number: attempt.attempt_number,
          last_attempt_id: attempt.job_attempt_id,
          next_eligible_attempt_at: undefined
        });
        await this.updateJob(client, job, updatedJob);
        await this.insertAttempt(client, attempt);
        await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
          "JOB_CLAIMED",
          { entity_type: "Job", object_id: updatedJob.job_id },
          now,
          "Job claimed by a registered worker.",
          `${updatedJob.job_id}:claimed:${updatedJob.record_version}`,
          { entity_type: "Job", object_id: job.job_id },
          { entity_type: "Job", object_id: updatedJob.job_id }
        ));
        await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
          "ATTEMPT_STARTED",
          { entity_type: "JobAttempt", object_id: attempt.job_attempt_id },
          now,
          "Execution attempt started.",
          `${attempt.job_attempt_id}:started`
        ));
        return { command, job: updatedJob, attempt, worker };
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async recordProgress(input: ProgressInput): Promise<ProgressEvent> {
    try {
      return await withTransaction(this.pool, async (client) => {
        await this.lockRunnableJob(client, input.job_id);
        const sequenceResult = await client.query<{ readonly sequence: number | string }>(
          "SELECT COALESCE(MAX(sequence), 0) AS sequence FROM mef_progress_events WHERE job_id = $1",
          [input.job_id]
        );
        const sequence = Number(sequenceResult.rows[0]?.sequence ?? 0) + 1;
        const event = progressEventFor(input, sequence);
        await this.insertProgress(client, event);
        return event;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async appendProgressEvent(event: ProgressEvent): Promise<ProgressEvent> {
    try {
      return await withTransaction(this.pool, async (client) => {
        await this.lockRunnableJob(client, event.job_id);
        const sequenceResult = await client.query<{ readonly sequence: number | string }>(
          "SELECT COALESCE(MAX(sequence), 0) AS sequence FROM mef_progress_events WHERE job_id = $1",
          [event.job_id]
        );
        const expected = Number(sequenceResult.rows[0]?.sequence ?? 0) + 1;
        if (event.sequence !== expected) throw new OperationalStateError("PROGRESS_SEQUENCE_CONFLICT");
        await this.insertProgress(client, event);
        return event;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async completeAttempt(claim: ClaimedExecution, workerResult: WorkerExecutionResult, at: Timestamp): Promise<ExecutionCompletion> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const rows = await client.query<AttemptAndJobRow>(
          `SELECT a.record_json AS attempt_record, j.record_json AS job_record
           FROM mef_job_attempts AS a
           JOIN mef_jobs AS j ON j.job_id = a.job_id
           WHERE a.job_attempt_id = $1 AND j.job_id = $2
           FOR UPDATE OF a, j`,
          [claim.attempt.job_attempt_id, claim.job.job_id]
        );
        if (rows.rows.length === 0) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
        const currentAttempt = storedEntity<JobAttempt>(rows.rows[0].attempt_record, "JobAttempt");
        const currentJob = storedEntity<Job>(rows.rows[0].job_record, "Job");
        const mutation = completionForTesting(currentJob, currentAttempt, workerResult, at);
        await this.updateAttempt(client, currentAttempt, mutation.attempt);
        await this.updateJob(client, currentJob, mutation.job);
        for (const audit of completionAuditEvents(currentAttempt, mutation, at, this.securityContext)) {
          await this.auditStore.appendAuditEventInTransaction(client, audit);
        }
        return mutation;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async requestCancellation(jobId: JobId, at: Timestamp): Promise<Job> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<RecordRow>(
          "SELECT record_json FROM mef_jobs WHERE job_id = $1 FOR UPDATE",
          [jobId]
        );
        if (result.rows.length === 0) throw new OperationalStateError("JOB_NOT_FOUND");
        const job = storedEntity<Job>(result.rows[0].record_json, "Job");
        if (job.state === "SUCCEEDED" || job.state === "FAILED" || job.state === "CANCELED") {
          throw new OperationalStateError("JOB_ALREADY_TERMINAL");
        }
        if (job.state === "UNKNOWN_OUTCOME") throw new OperationalStateError("CANCELLATION_NOT_ALLOWED");
        if (job.state === "CANCEL_REQUESTED") return job;
        const requested = stripUndefined({
          ...job,
          record_version: job.record_version + 1,
          state: "CANCEL_REQUESTED" as const,
          updated_at: at,
          next_eligible_attempt_at: undefined,
          cancellation: { requested_at: at, reason_code: "USER_REQUESTED" as const },
          error: undefined
        });
        await this.updateJob(client, job, requested);
        await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
          "CANCELLATION_REQUESTED",
          { entity_type: "Job", object_id: requested.job_id },
          at,
          "Cooperative job cancellation requested.",
          `${job.job_id}:cancel-requested:${requested.record_version}`,
          { entity_type: "Job", object_id: job.job_id },
          { entity_type: "Job", object_id: requested.job_id }
        ));
        if (job.state === "QUEUED" || job.state === "RETRY_WAIT") {
          const canceled = stripUndefined({
            ...requested,
            record_version: requested.record_version + 1,
            state: "CANCELED" as const,
            updated_at: at,
            finished_at: at,
            cancellation: { requested_at: at, canceled_at: at, reason_code: "USER_REQUESTED" as const },
            result: { result_code: "CANCELED" as const, summary_code: "CANCELED_BEFORE_CLAIM" },
            error: undefined
          });
          await this.updateJob(client, requested, canceled);
          await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
            "JOB_CANCELED",
            { entity_type: "Job", object_id: canceled.job_id },
            at,
            "Cancellation took effect before worker claim.",
            `${job.job_id}:canceled:${canceled.record_version}`
          ));
          return canceled;
        }
        return requested;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async isCancellationRequested(jobId: JobId): Promise<boolean> {
    try {
      return await executeRead(this.pool, async (client) => {
        const result = await client.query<{ readonly state: Job["state"] }>(
          "SELECT state FROM mef_jobs WHERE job_id = $1",
          [jobId]
        );
        if (result.rows.length === 0) throw new OperationalStateError("JOB_NOT_FOUND");
        return result.rows[0].state === "CANCEL_REQUESTED" || result.rows[0].state === "CANCELED";
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async reconcileExpired(now: Timestamp): Promise<ReadonlyArray<Job>> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<AttemptAndJobRow>(
          `SELECT a.record_json AS attempt_record, j.record_json AS job_record
           FROM mef_job_attempts AS a
           JOIN mef_jobs AS j ON j.job_id = a.job_id
           WHERE a.outcome = 'STARTED'
             AND a.lease_expires_at IS NOT NULL
             AND a.lease_expires_at <= $1
             AND j.state IN ('RUNNING', 'CANCEL_REQUESTED')
           ORDER BY a.job_id, a.attempt_number
           FOR UPDATE OF a, j`,
          [now]
        );
        const recovered: Job[] = [];
        for (const row of result.rows) {
          const attempt = storedEntity<JobAttempt>(row.attempt_record, "JobAttempt");
          const job = storedEntity<Job>(row.job_record, "Job");
          const mutation = completionForTesting(
            job,
            attempt,
            { kind: "UNKNOWN_OUTCOME", error: { code: "EXECUTION_OUTCOME_UNKNOWN", category: "UNKNOWN_OUTCOME" } },
            now
          );
          await this.updateAttempt(client, attempt, mutation.attempt);
          await this.updateJob(client, job, mutation.job);
          for (const audit of completionAuditEvents(attempt, mutation, now, this.securityContext)) {
            await this.auditStore.appendAuditEventInTransaction(client, audit);
          }
          recovered.push(mutation.job);
        }
        return recovered;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  async reconcileUnknownOutcome(jobId: JobId, safeToRetry: boolean, at: Timestamp): Promise<Job> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<RecordRow>(
          "SELECT record_json FROM mef_jobs WHERE job_id = $1 FOR UPDATE",
          [jobId]
        );
        if (result.rows.length === 0) throw new OperationalStateError("JOB_NOT_FOUND");
        const job = storedEntity<Job>(result.rows[0].record_json, "Job");
        if (job.state !== "UNKNOWN_OUTCOME" || job.reconciliation_state !== "RECONCILIATION_REQUIRED") {
          throw new OperationalStateError("RECONCILIATION_REQUIRED");
        }
        const nextState = safeToRetry ? ("RETRY_WAIT" as const) : ("FAILED" as const);
        const updated = stripUndefined({
          ...job,
          record_version: job.record_version + 1,
          state: nextState,
          updated_at: at,
          finished_at: safeToRetry ? undefined : at,
          next_eligible_attempt_at: safeToRetry ? at : undefined,
          reconciliation_state: "RECONCILED" as const,
          error: safeToRetry ? undefined : { code: "EXECUTION_OUTCOME_UNKNOWN" as const, category: "UNKNOWN_OUTCOME" as const }
        });
        await this.updateJob(client, job, updated);
        await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
          "RECONCILIATION_ACTION",
          { entity_type: "Job", object_id: updated.job_id },
          at,
          safeToRetry ? "Unknown outcome reconciled through a safe retry path." : "Unknown outcome reconciled as failed.",
          `${job.job_id}:reconciled:${updated.record_version}`
        ));
        await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
          safeToRetry ? "RETRY_SCHEDULED" : "JOB_FAILED",
          { entity_type: "Job", object_id: updated.job_id },
          at,
          safeToRetry ? "Safe retry scheduled after explicit unknown-outcome reconciliation." : "Job failed after explicit unknown-outcome reconciliation.",
          `${job.job_id}:${safeToRetry ? "retry" : "failed"}:${updated.record_version}`
        ));
        return updated;
      }, this.securityContext);
    } catch (error) {
      rethrowPersistence(error);
    }
  }

  private async lockRunnableJob(client: SqlClient, jobId: JobId): Promise<Job> {
    const result = await client.query<RecordRow>(
      "SELECT record_json FROM mef_jobs WHERE job_id = $1 FOR UPDATE",
      [jobId]
    );
    if (result.rows.length === 0) throw new OperationalStateError("JOB_NOT_FOUND");
    const job = storedEntity<Job>(result.rows[0].record_json, "Job");
    if (job.state !== "RUNNING" && job.state !== "CANCEL_REQUESTED") {
      if (job.state === "SUCCEEDED" || job.state === "FAILED" || job.state === "CANCELED") {
        throw new OperationalStateError("JOB_ALREADY_TERMINAL");
      }
      throw new OperationalStateError("JOB_NOT_CLAIMABLE");
    }
    return job;
  }

  private async insertProgress(client: SqlClient, event: ProgressEvent): Promise<void> {
    const validation = validateEntity(event, "ProgressEvent");
    if (!validation.valid) throw new OperationalStateError("INVALID_PROGRESS_EVENT");
    if (event.job_attempt_id !== undefined) {
      const attempt = await client.query<{ readonly job_id: JobId }>(
        "SELECT job_id FROM mef_job_attempts WHERE job_attempt_id = $1",
        [event.job_attempt_id]
      );
      if (attempt.rows.length === 0 || attempt.rows[0].job_id !== event.job_id) {
        throw new OperationalStateError("INVALID_PROGRESS_EVENT");
      }
    }
    await client.query(
      `INSERT INTO mef_progress_events (
         progress_event_id, record_version, job_id, job_attempt_id, sequence,
         occurred_at, phase, message_code, progress_value, record_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        event.progress_event_id,
        event.record_version,
        event.job_id,
        event.job_attempt_id ?? null,
        event.sequence,
        event.occurred_at,
        event.phase,
        event.message_code,
        event.progress_value ?? null,
        textJson(event)
      ]
    );
    await this.auditStore.appendAuditEventInTransaction(client, this.auditEvent(
      "PROGRESS_RECORDED",
      { entity_type: "ProgressEvent", object_id: event.progress_event_id },
      event.occurred_at,
      "Bounded progress event recorded.",
      `${event.progress_event_id}:recorded`
    ));
  }

  private async insertAttempt(client: SqlClient, attempt: JobAttempt): Promise<void> {
    await client.query(
      `INSERT INTO mef_job_attempts (
         job_attempt_id, record_version, job_id, attempt_number, worker_identity,
         worker_type, claimed_at, started_at, ended_at, lease_expires_at,
         outcome, failure_category, retry_decision, cancellation_acknowledged_at,
         result, error, record_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb)`,
      [
        attempt.job_attempt_id,
        attempt.record_version,
        attempt.job_id,
        attempt.attempt_number,
        attempt.worker_identity,
        attempt.worker_type,
        attempt.claimed_at,
        timestampOrNull(attempt.started_at),
        timestampOrNull(attempt.ended_at),
        timestampOrNull(attempt.lease_expires_at),
        attempt.outcome,
        attempt.failure_category ?? null,
        attempt.retry_decision,
        timestampOrNull(attempt.cancellation_acknowledged_at),
        resultOrNull(attempt.result) === null ? null : textJson(attempt.result),
        resultOrNull(attempt.error) === null ? null : textJson(attempt.error),
        textJson(attempt)
      ]
    );
  }

  private async updateAttempt(client: SqlClient, previous: JobAttempt, next: JobAttempt): Promise<void> {
    const validation = validateEntity(next, "JobAttempt");
    if (!validation.valid || next.job_attempt_id !== previous.job_attempt_id || next.job_id !== previous.job_id) {
      throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
    }
    const updated = await client.query(
      `UPDATE mef_job_attempts SET
         record_version = $1, started_at = $2, ended_at = $3,
         lease_expires_at = $4, outcome = $5, failure_category = $6,
         retry_decision = $7, cancellation_acknowledged_at = $8,
         result = $9::jsonb, error = $10::jsonb, record_json = $11::jsonb
       WHERE job_attempt_id = $12 AND record_version = $13`,
      [
        next.record_version,
        timestampOrNull(next.started_at),
        timestampOrNull(next.ended_at),
        timestampOrNull(next.lease_expires_at),
        next.outcome,
        next.failure_category ?? null,
        next.retry_decision,
        timestampOrNull(next.cancellation_acknowledged_at),
        resultOrNull(next.result) === null ? null : textJson(next.result),
        resultOrNull(next.error) === null ? null : textJson(next.error),
        textJson(next),
        next.job_attempt_id,
        previous.record_version
      ]
    );
    if (updated.rowCount !== 1) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
  }

  private jobValues(job: Job): ReadonlyArray<unknown> {
    return [
      job.job_id,
      job.record_version,
      job.command_id,
      job.created_at,
      job.queued_at,
      timestampOrNull(job.started_at),
      job.updated_at,
      timestampOrNull(job.finished_at),
      job.state,
      job.retry_policy.max_attempts,
      job.retry_policy.backoff_milliseconds,
      job.retry_policy.backoff_strategy,
      textJson(job.retry_policy),
      job.current_attempt_number,
      timestampOrNull(job.next_eligible_attempt_at),
      job.last_attempt_id ?? null,
      job.cancellation === undefined ? null : textJson(job.cancellation),
      job.reconciliation_state,
      job.result === undefined ? null : textJson(job.result),
      job.error === undefined ? null : textJson(job.error),
      textJson(job)
    ];
  }

  private async updateJob(client: SqlClient, previous: Job, next: Job): Promise<void> {
    const validation = validateEntity(next, "Job");
    if (!validation.valid || next.job_id !== previous.job_id || next.command_id !== previous.command_id) {
      throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
    }
    const values = this.jobValues(next);
    const updated = await client.query(
      `UPDATE mef_jobs SET
         record_version = $1, started_at = $2, updated_at = $3,
         finished_at = $4, state = $5, max_attempts = $6,
         backoff_milliseconds = $7, backoff_strategy = $8,
         retry_policy = $9::jsonb, current_attempt_number = $10,
         next_eligible_attempt_at = $11, last_attempt_id = $12,
         cancellation = $13::jsonb, reconciliation_state = $14,
         result = $15::jsonb, error = $16::jsonb, record_json = $17::jsonb
       WHERE job_id = $18 AND record_version = $19`,
      [
        values[1],
        values[5],
        values[6],
        values[7],
        values[8],
        values[9],
        values[10],
        values[11],
        values[12],
        values[13],
        values[14],
        values[15],
        values[16],
        values[17],
        values[18],
        values[19],
        values[20],
        values[0],
        previous.record_version
      ]
    );
    if (updated.rowCount !== 1) throw new OperationalStateError("JOB_PERSISTENCE_FAILED");
  }

  private auditEvent(
    action: AuditEvent["audit_action"],
    object: AuditEvent["object"],
    occurredAt: Timestamp,
    reason: string,
    seed: string,
    priorReference?: AuditEvent["prior_reference"],
    newReference?: AuditEvent["new_reference"]
  ): AuditEvent {
    const event: AuditEvent = stripUndefined({
      entity_type: "AuditEvent",
      schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json",
      schema_version: "1.0.0",
      audit_event_id: `aud_${sha256Hex(new TextEncoder().encode(seed)).slice(0, 40)}` as AuditEvent["audit_event_id"],
      record_version: 1,
      occurred_at: occurredAt,
      actor: this.securityContext?.actor ?? { actor_type: "SYSTEM", actor_id: "system_ml97_execution", role: "job-execution" },
      audit_action: action,
      object,
      authority_type: this.securityContext === undefined
        ? "SYSTEM"
        : this.securityContext.principalType === "USER"
          ? "HUMAN_PRACTITIONER"
          : this.securityContext.principalType === "AGENT"
            ? "AGENT_DRAFT"
            : this.securityContext.principalType === "SERVICE"
              ? "MACHINE"
              : "SYSTEM",
      reason,
      prior_reference: priorReference,
      new_reference: newReference,
      immutable_history: true
    });
    assertAuditEvent(event);
    return event;
  }
}
