import type { Command, FixtureScenario } from "@mef/generated-ts";
import {
  type ExecutionWorker,
  type WorkerExecutionContext,
  type WorkerExecutionResult,
  type WorkerRegistry
} from "./job-execution.ts";

function successResult(summaryCode: string): WorkerExecutionResult {
  return { kind: "SUCCEEDED", result: { result_code: "COMPLETED", summary_code: summaryCode } };
}

function retryableFailure(): WorkerExecutionResult {
  return { kind: "RETRYABLE_FAILURE", error: { code: "WORKER_FAILURE_RETRYABLE", category: "RETRYABLE" } };
}

function nonRetryableFailure(): WorkerExecutionResult {
  return { kind: "NON_RETRYABLE_FAILURE", error: { code: "WORKER_FAILURE_NON_RETRYABLE", category: "NON_RETRYABLE" } };
}

function unknownOutcome(): WorkerExecutionResult {
  return { kind: "UNKNOWN_OUTCOME", error: { code: "EXECUTION_OUTCOME_UNKNOWN", category: "UNKNOWN_OUTCOME" } };
}

async function cancellationResult(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
  if (await context.isCancellationRequested()) {
    await context.acknowledgeCancellation();
    return { kind: "CANCELED" };
  }
  return successResult("FIXTURE_CANCELLABLE_COMPLETED");
}

async function progressResult(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
  await context.reportProgress({ phase: "RUNNING", message_code: "STEP_COMPLETED", progress_value: 0.5 });
  await context.reportProgress({ phase: "COMPLETED", message_code: "ATTEMPT_COMPLETED", progress_value: 1 });
  return successResult("FIXTURE_PROGRESS_COMPLETED");
}

export const SUCCESS_WORKER: ExecutionWorker = {
  worker_identity: "fixture.success.v1",
  worker_type: "FIXTURE",
  execute: async () => successResult("FIXTURE_SUCCESS")
};

export const RETRY_THEN_SUCCESS_WORKER: ExecutionWorker = {
  worker_identity: "fixture.retry-then-success.v1",
  worker_type: "FIXTURE",
  execute: async (_command, context) => context.attempt_number === 1 ? retryableFailure() : successResult("FIXTURE_RETRY_SUCCESS")
};

export const NON_RETRYABLE_FAILURE_WORKER: ExecutionWorker = {
  worker_identity: "fixture.non-retryable-failure.v1",
  worker_type: "FIXTURE",
  execute: async () => nonRetryableFailure()
};

export const CANCELLABLE_WORKER: ExecutionWorker = {
  worker_identity: "fixture.cancellable.v1",
  worker_type: "FIXTURE",
  execute: async (_command, context) => cancellationResult(context)
};

export const UNKNOWN_OUTCOME_WORKER: ExecutionWorker = {
  worker_identity: "fixture.unknown-outcome.v1",
  worker_type: "FIXTURE",
  execute: async () => unknownOutcome()
};

export const PROGRESS_WORKER: ExecutionWorker = {
  worker_identity: "fixture.progress.v1",
  worker_type: "FIXTURE",
  execute: async (_command, context) => progressResult(context)
};

const DEFAULT_WORKERS: Readonly<Record<FixtureScenario, ExecutionWorker>> = {
  SUCCESS: SUCCESS_WORKER,
  RETRY_THEN_SUCCESS: RETRY_THEN_SUCCESS_WORKER,
  NON_RETRYABLE_FAILURE: NON_RETRYABLE_FAILURE_WORKER,
  CANCELLABLE: CANCELLABLE_WORKER,
  UNKNOWN_OUTCOME: UNKNOWN_OUTCOME_WORKER,
  PROGRESS: PROGRESS_WORKER
};

export class FixtureWorkerRegistry implements WorkerRegistry {
  private readonly workers: Readonly<Record<FixtureScenario, ExecutionWorker>>;

  constructor(overrides: Partial<Record<FixtureScenario, ExecutionWorker>> = {}) {
    this.workers = { ...DEFAULT_WORKERS, ...overrides };
  }

  resolve(command: Command): ExecutionWorker | undefined {
    if (command.command_type !== "FIXTURE_EXECUTION") return undefined;
    const scenario = command.request_payload.fixture_scenario;
    return scenario === undefined ? undefined : this.workers[scenario];
  }
}
