import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { CommandPayload, ObjectReference, Timestamp } from "@mef/generated-ts";
import {
  assertLegalJobTransition,
  CANCELLABLE_WORKER,
  completionForTesting,
  FixedExecutionClock,
  FixtureWorkerRegistry,
  InMemoryJobExecutionPersistence,
  isTerminalJobState,
  JOB_LIFECYCLE,
  JobExecutionService,
  loadMigrations,
  OperationalStateError,
  PROGRESS_WORKER,
  RETRY_THEN_SUCCESS_WORKER,
  SUCCESS_WORKER,
  UNKNOWN_OUTCOME_WORKER,
  type ExecutionWorker,
  type OperationalSecurityContext,
  type WorkerExecutionResult
} from "../src/index.ts";

const NOW = "2026-08-11T12:00:00.000Z" as Timestamp;
const AUTHORITY: ObjectReference = { entity_type: "AgentContext", object_id: "ctx_ml97_fixture" as never };

function input(
  key: string,
  scenario: CommandPayload["fixture_scenario"] = "SUCCESS",
  label = "synthetic-input"
) {
  return {
    command_type: "FIXTURE_EXECUTION" as const,
    idempotency_key: key as never,
    request_payload: {
      payload_kind: "STRUCTURAL" as const,
      input_label: label,
      input_value: "fixture-value",
      fixture_scenario: scenario
    },
    requested_operation: "EXECUTE" as const,
    authority_context_reference: AUTHORITY,
    correlation_metadata: { correlation_id: `corr-${key}`, request_id: `req-${key}` }
  };
}

function service(
  persistence: InMemoryJobExecutionPersistence,
  registry: FixtureWorkerRegistry = new FixtureWorkerRegistry(),
  clock: FixedExecutionClock = new FixedExecutionClock(NOW),
  maxAttempts = 3
) {
  return new JobExecutionService(persistence, registry, {
    clock,
    config: { retry_policy: { max_attempts: maxAttempts, backoff_milliseconds: 1000, backoff_strategy: "FIXED" } }
  });
}

function expectCode(code: OperationalStateError["code"]) {
  return (error: unknown): boolean => error instanceof OperationalStateError && error.code === code;
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("lifecycle is an explicit finite state machine with terminal protection", () => {
  assert.deepEqual(JOB_LIFECYCLE.QUEUED.successors, ["RUNNING", "CANCEL_REQUESTED"]);
  assert.deepEqual(JOB_LIFECYCLE.UNKNOWN_OUTCOME.successors, ["RETRY_WAIT", "FAILED"]);
  assert.equal(isTerminalJobState("SUCCEEDED"), true);
  assert.equal(isTerminalJobState("CANCELED"), true);
  assert.equal(isTerminalJobState("RUNNING"), false);
  assert.doesNotThrow(() => assertLegalJobTransition("QUEUED", "RUNNING"));
  assert.throws(() => assertLegalJobTransition("SUCCEEDED", "RUNNING"), expectCode("INVALID_JOB_TRANSITION"));
});

test("ML-98 migration is ordered, checksum-protected, and declares tenant security guards", async () => {
  const migrations = await loadMigrations(fileURLToPath(new URL("../migrations/", import.meta.url)));
  assert.deepEqual(migrations.map((migration) => migration.version), ["001_operational_state", "002_job_execution", "003_auth_tenancy_security", "004_ml102_source_import", "005_ml102_identity_constraint_hardening", "006_ml103_source_observation", "007_ml104_canonical_acquisition", "008_ml105_configuration_resolution"]);
  assert.equal(migrations[1].checksum, migrations[1].trustedChecksum);
  assert.match(migrations[1].sql, /UNIQUE \(command_type, idempotency_key\)/u);
  assert.match(migrations[1].sql, /UNIQUE \(job_id, attempt_number\)/u);
  assert.match(migrations[1].sql, /mef_job_attempts_one_active_idx/u);
  assert.equal(migrations[2].checksum, migrations[2].trustedChecksum);
  assert.match(migrations[2].sql, /FORCE ROW LEVEL SECURITY/u);
  assert.match(migrations[2].sql, /mef\.organization_id/u);
  assert.match(migrations[2].sql, /mef_commands_scoped_idempotency_key_unique/u);
  assert.match(migrations[2].sql, /mef_jobs_scoped_command_fkey/u);
  assert.match(migrations[2].sql, /mef_progress_events_scoped_attempt_fkey/u);
  assert.match(migrations[2].sql, /mef_workspace_members AS member/u);
  assert.match(migrations[2].sql, /member\.principal_id = nullif\(current_setting\('mef\.principal_id'/u);
  assert.equal(migrations[5].checksum, migrations[5].trustedChecksum);
  assert.match(migrations[5].sql, /FORCE ROW LEVEL SECURITY/u);
  assert.match(migrations[5].sql, /source observations are append-only/u);
  assert.equal(migrations[7].checksum, migrations[7].trustedChecksum);
  assert.match(migrations[7].sql, /configuration resolutions are append-only/u);
});

test("new command creates one job and canonical duplicate submission reuses it", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const clock = new FixedExecutionClock(NOW);
  const firstService = service(persistence, new FixtureWorkerRegistry(), clock);
  const first = await firstService.submit(input("same-key"));
  const duplicate = await firstService.submit({
    ...input("same-key"),
    correlation_metadata: { request_id: "another-request", correlation_id: "another-correlation" }
  });
  assert.equal(first.reused, false);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.command.command_id, first.command.command_id);
  assert.equal(duplicate.job.job_id, first.job.job_id);
  assert.equal(persistence.auditEvents.filter((event) => event.audit_action === "COMMAND_ACCEPTED").length, 1);
  assert.equal(persistence.auditEvents.filter((event) => event.audit_action === "COMMAND_IDEMPOTENT_REUSED").length, 1);
});

test("tenant scope is part of execution identity and audit authority", async () => {
  const contextA: OperationalSecurityContext = {
    organizationId: "org_scope_a",
    workspaceId: "ws_scope_a",
    principalId: "user_scope_a",
    principalType: "USER",
    humanPrincipalId: "user_scope_a",
    runtimePrincipalType: "HTTP",
    runtimePrincipalId: "test-http",
    actor: { actor_type: "PRACTITIONER", actor_id: "user_scope_a", role: "PRACTITIONER" }
  };
  const contextB: OperationalSecurityContext = {
    ...contextA,
    organizationId: "org_scope_b",
    workspaceId: "ws_scope_b",
    principalId: "user_scope_b",
    humanPrincipalId: "user_scope_b",
    actor: { actor_type: "PRACTITIONER", actor_id: "user_scope_b", role: "PRACTITIONER" }
  };
  const persistenceA = new InMemoryJobExecutionPersistence(contextA);
  const persistenceB = new InMemoryJobExecutionPersistence(contextB);
  const executionA = new JobExecutionService(persistenceA, new FixtureWorkerRegistry(), { securityContext: contextA, clock: new FixedExecutionClock(NOW) });
  const executionB = new JobExecutionService(persistenceB, new FixtureWorkerRegistry(), { securityContext: contextB, clock: new FixedExecutionClock(NOW) });

  const [acceptedA, acceptedB] = await Promise.all([
    executionA.submit(input("same-tenant-key")),
    executionB.submit(input("same-tenant-key"))
  ]);
  assert.notEqual(acceptedA.command.command_id, acceptedB.command.command_id);
  assert.notEqual(acceptedA.job.job_id, acceptedB.job.job_id);
  assert.equal(persistenceA.auditEvents[0]?.authority_type, "HUMAN_PRACTITIONER");
  assert.equal(persistenceA.auditEvents[0]?.actor.actor_id, "user_scope_a");
  assert.equal((await executionA.submit(input("same-tenant-key"))).reused, true);
  assert.equal((await executionB.submit(input("same-tenant-key"))).reused, true);
});

test("concurrent duplicate submissions create one logical job", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence);
  const submissions = await Promise.all(Array.from({ length: 12 }, (_, index) => execution.submit({
    ...input("concurrent-key"),
    correlation_metadata: { correlation_id: `corr-${index}`, request_id: `req-${index}` }
  })));
  assert.equal(new Set(submissions.map((item) => item.job.job_id)).size, 1);
  assert.equal(submissions.filter((item) => item.reused === false).length, 1);
});

test("same idempotency key with different semantic input fails closed", async () => {
  const execution = service(new InMemoryJobExecutionPersistence());
  await execution.submit(input("conflict-key", "SUCCESS", "one"));
  await assert.rejects(execution.submit(input("conflict-key", "SUCCESS", "two")), expectCode("IDEMPOTENCY_CONFLICT"));
});

test("semantic idempotency uses canonical fields rather than object insertion order", async () => {
  const execution = service(new InMemoryJobExecutionPersistence());
  const first = input("canonical-order-key");
  const second = {
    ...first,
    request_payload: {
      fixture_scenario: "SUCCESS" as const,
      input_value: "fixture-value",
      input_label: "synthetic-input",
      payload_kind: "STRUCTURAL" as const
    }
  };
  const accepted = await execution.submit(first);
  const reused = await execution.submit(second);
  assert.equal(reused.reused, true);
  assert.equal(reused.command.command_id, accepted.command.command_id);
});

test("success worker completes one job and preserves audit linkage", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence);
  const submitted = await execution.submit(input("success-key"));
  const completed = await execution.runNext();
  assert.ok(completed);
  assert.equal(completed.job.job_id, submitted.job.job_id);
  assert.equal(completed.job.state, "SUCCEEDED");
  assert.equal(completed.attempt.attempt_number, 1);
  assert.equal(completed.attempt.outcome, "SUCCEEDED");
  assert.equal(persistence.auditEvents.some((event) => event.audit_action === "JOB_CLAIMED" && event.object.entity_type === "Job"), true);
  assert.equal(persistence.auditEvents.some((event) => event.audit_action === "JOB_SUCCEEDED"), true);
});

test("retry keeps one Job identity and appends attempts until success", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const clock = new FixedExecutionClock(NOW);
  const execution = service(persistence, new FixtureWorkerRegistry(), clock);
  const submitted = await execution.submit(input("retry-key", "RETRY_THEN_SUCCESS"));
  const first = await execution.runNext();
  assert.equal(first?.job.state, "RETRY_WAIT");
  assert.equal(first?.attempt.outcome, "FAILED_RETRYABLE");
  clock.advance(1000);
  const second = await execution.runNext();
  assert.equal(second?.job.state, "SUCCEEDED");
  assert.equal(second?.attempt.attempt_number, 2);
  assert.equal(second?.job.job_id, submitted.job.job_id);
  assert.equal(persistence.auditEvents.filter((event) => event.audit_action === "RETRY_SCHEDULED").length, 1);
});

test("retry exhaustion and non-retryable failure are bounded", async () => {
  const alwaysRetry: ExecutionWorker = {
    worker_identity: "fixture.always-retry.v1",
    worker_type: "FIXTURE",
    execute: async (): Promise<WorkerExecutionResult> => ({
      kind: "RETRYABLE_FAILURE",
      error: { code: "WORKER_FAILURE_RETRYABLE", category: "RETRYABLE" }
    })
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const clock = new FixedExecutionClock(NOW);
  const registry = new FixtureWorkerRegistry({ RETRY_THEN_SUCCESS: alwaysRetry });
  const execution = service(persistence, registry, clock, 2);
  await execution.submit(input("exhaust-key", "RETRY_THEN_SUCCESS"));
  assert.equal((await execution.runNext())?.job.state, "RETRY_WAIT");
  clock.advance(1000);
  const exhausted = await execution.runNext();
  assert.equal(exhausted?.job.state, "FAILED");
  assert.equal(exhausted?.job.error?.code, "ATTEMPT_LIMIT_EXCEEDED");

  const nonRetryPersistence = new InMemoryJobExecutionPersistence();
  const nonRetryExecution = service(nonRetryPersistence);
  await nonRetryExecution.submit(input("non-retry-key", "NON_RETRYABLE_FAILURE"));
  const nonRetry = await nonRetryExecution.runNext();
  assert.equal(nonRetry?.job.state, "FAILED");
  assert.equal(nonRetry?.attempt.outcome, "FAILED_NON_RETRYABLE");
});

test("unknown outcome never auto-retries and requires explicit reconciliation", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const clock = new FixedExecutionClock(NOW);
  const execution = service(persistence, new FixtureWorkerRegistry(), clock);
  const submitted = await execution.submit(input("unknown-key", "UNKNOWN_OUTCOME"));
  const unknown = await execution.runNext();
  assert.equal(unknown?.job.state, "UNKNOWN_OUTCOME");
  assert.equal(await execution.runNext(), undefined);
  const retried = await execution.reconcileUnknownOutcome(submitted.job.job_id, true);
  assert.equal(retried.state, "RETRY_WAIT");
  const next = await execution.runNext();
  assert.equal(next?.job.state, "UNKNOWN_OUTCOME");
});

test("cancellation before claim is terminal only after safe boundary", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence);
  const submitted = await execution.submit(input("cancel-before-claim", "SUCCESS"));
  const canceled = await execution.requestCancellation(submitted.job.job_id);
  assert.equal(canceled.state, "CANCELED");
  assert.equal(canceled.cancellation?.canceled_at, NOW);
  await assert.rejects(execution.requestCancellation(submitted.job.job_id), expectCode("JOB_ALREADY_TERMINAL"));
});

test("running cancellation waits for worker acknowledgement", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const cancellable: ExecutionWorker = {
    ...CANCELLABLE_WORKER,
    worker_identity: "fixture.deferred-cancellable.v1",
    execute: async (_command, context) => {
      started.resolve();
      await release.promise;
      if (await context.isCancellationRequested()) {
        await context.acknowledgeCancellation();
        return { kind: "CANCELED" };
      }
      return { kind: "SUCCEEDED", result: { result_code: "COMPLETED", summary_code: "UNEXPECTED" } };
    }
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ CANCELLABLE: cancellable }));
  const submitted = await execution.submit(input("cancel-running", "CANCELLABLE"));
  const runPromise = execution.runNext();
  await started.promise;
  const request = await execution.requestCancellation(submitted.job.job_id);
  assert.equal(request.state, "CANCEL_REQUESTED");
  release.resolve();
  const completed = await runPromise;
  assert.equal(completed?.job.state, "CANCELED");
  assert.equal(completed?.attempt.outcome, "CANCELED");
});

test("success winning after cancellation request remains successful", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const worker: ExecutionWorker = {
    worker_identity: "fixture.success-race.v1",
    worker_type: "FIXTURE",
    execute: async () => {
      started.resolve();
      await release.promise;
      return { kind: "SUCCEEDED", result: { result_code: "COMPLETED", summary_code: "COMPLETED_BEFORE_CANCEL" } };
    }
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ SUCCESS: worker }));
  const submitted = await execution.submit(input("success-race", "SUCCESS"));
  const runPromise = execution.runNext();
  await started.promise;
  assert.equal((await execution.requestCancellation(submitted.job.job_id)).state, "CANCEL_REQUESTED");
  release.resolve();
  assert.equal((await runPromise)?.job.state, "SUCCEEDED");
});

test("progress events are sequence ordered and duplicate sequences are rejected", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ PROGRESS: PROGRESS_WORKER }));
  const submitted = await execution.submit(input("progress-key", "PROGRESS"));
  await execution.runNext();
  const progress = await execution.getProgress(submitted.job.job_id);
  assert.deepEqual(progress.map((event) => event.sequence), [1, 2]);
  await assert.rejects(persistence.appendProgressEvent(progress[0]), expectCode("PROGRESS_SEQUENCE_CONFLICT"));
  assert.equal(progress[0].occurred_at, progress[1].occurred_at);
});

test("worker replacement preserves the command and job contracts", async () => {
  const replacement: ExecutionWorker = {
    worker_identity: "fixture.replacement.v2",
    worker_type: "FIXTURE",
    execute: async () => ({ kind: "SUCCEEDED", result: { result_code: "COMPLETED", summary_code: "REPLACED" } })
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ SUCCESS: replacement }));
  const submitted = await execution.submit(input("replacement-key"));
  const completed = await execution.runNext();
  assert.equal(completed?.job.job_id, submitted.job.job_id);
  assert.equal(completed?.job.state, "SUCCEEDED");
});

test("lease expiry records unknown outcome and safe reconciliation is explicit", async () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const clock = new FixedExecutionClock(NOW);
  const execution = service(persistence, new FixtureWorkerRegistry(), clock);
  const submitted = await execution.submit(input("lease-key"));
  const claim = await persistence.claimNext(NOW, "2026-08-11T12:00:01.000Z" as Timestamp, (command) => {
    if (command.command_type !== "FIXTURE_EXECUTION") throw new Error("unexpected");
    return SUCCESS_WORKER;
  });
  assert.ok(claim);
  clock.advance(1001);
  const recovered = await execution.reconcileExpired();
  assert.equal(recovered[0]?.state, "UNKNOWN_OUTCOME");
  assert.equal(await execution.runNext(), undefined);
  const failed = await execution.reconcileUnknownOutcome(submitted.job.job_id, false);
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.error?.code, "EXECUTION_OUTCOME_UNKNOWN");
});

test("unexpected worker exceptions preserve unknown outcome without leaking details", async () => {
  const throwing: ExecutionWorker = {
    worker_identity: "fixture.throwing.v1",
    worker_type: "FIXTURE",
    execute: async () => { throw new Error("secret runtime detail"); }
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ SUCCESS: throwing }));
  await execution.submit(input("throwing-key"));
  const completed = await execution.runNext();
  assert.equal(completed?.job.state, "UNKNOWN_OUTCOME");
  assert.equal(completed?.job.error?.code, "EXECUTION_OUTCOME_UNKNOWN");
  assert.equal(persistence.auditEvents.some((event) => event.reason.includes("secret")), false);
});

test("malformed worker results and out-of-order progress fail closed", async () => {
  const malformed: ExecutionWorker = {
    worker_identity: "fixture.malformed-result.v1",
    worker_type: "FIXTURE",
    execute: async () => ({ kind: "NOT_A_RESULT" } as never)
  };
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence, new FixtureWorkerRegistry({ SUCCESS: malformed }));
  await execution.submit(input("malformed-result-key"));
  const completed = await execution.runNext();
  assert.equal(completed?.job.state, "UNKNOWN_OUTCOME");
  assert.equal(completed?.job.error?.code, "EXECUTION_OUTCOME_UNKNOWN");

  const progressPersistence = new InMemoryJobExecutionPersistence();
  const progressExecution = service(progressPersistence, new FixtureWorkerRegistry({ PROGRESS: PROGRESS_WORKER }));
  const submitted = await progressExecution.submit(input("out-of-order-progress", "PROGRESS"));
  const claim = await progressPersistence.claimNext(NOW, "2026-08-11T12:00:30.000Z" as Timestamp, () => PROGRESS_WORKER);
  assert.ok(claim);
  const event = {
    entity_type: "ProgressEvent" as const,
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/progress-event.schema.json" as const,
    schema_version: "1.0.0" as const,
    progress_event_id: "pev_out_of_order" as never,
    record_version: 1,
    job_id: submitted.job.job_id,
    job_attempt_id: claim.attempt.job_attempt_id,
    sequence: 2,
    occurred_at: NOW,
    phase: "RUNNING" as const,
    message_code: "STEP_COMPLETED" as const,
    progress_value: 0.5
  };
  await assert.rejects(progressPersistence.appendProgressEvent(event), expectCode("PROGRESS_SEQUENCE_CONFLICT"));
});

test("completion mutation rejects terminal-state mutation", () => {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = service(persistence);
  void execution;
  const job = {
    entity_type: "Job" as const,
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/job.schema.json" as const,
    schema_version: "1.0.0" as const,
    job_id: "job_terminal_fixture" as never,
    record_version: 2,
    command_id: "cmd_terminal_fixture" as never,
    created_at: NOW,
    queued_at: NOW,
    updated_at: NOW,
    finished_at: NOW,
    state: "SUCCEEDED" as const,
    retry_policy: { max_attempts: 1, backoff_milliseconds: 0, backoff_strategy: "FIXED" as const },
    current_attempt_number: 1,
    reconciliation_state: "NONE" as const,
    result: { result_code: "COMPLETED" as const, summary_code: "DONE" }
  };
  const attempt = {
    entity_type: "JobAttempt" as const,
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/job-attempt.schema.json" as const,
    schema_version: "1.0.0" as const,
    job_attempt_id: "jatt_terminal_fixture" as never,
    record_version: 2,
    job_id: job.job_id,
    attempt_number: 1,
    worker_identity: "fixture.success.v1",
    worker_type: "FIXTURE" as const,
    claimed_at: NOW,
    started_at: NOW,
    ended_at: NOW,
    outcome: "SUCCEEDED" as const,
    retry_decision: "NOT_APPLICABLE" as const,
    result: { result_code: "COMPLETED" as const, summary_code: "DONE" }
  };
  assert.throws(() => completionForTesting(job, attempt, { kind: "SUCCEEDED", result: { result_code: "COMPLETED", summary_code: "AGAIN" } }, NOW), expectCode("INVALID_JOB_TRANSITION"));
});
