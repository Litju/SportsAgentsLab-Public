import type { FixtureScenario, JobId } from "@mef/generated-ts";
import {
  ControlApi,
  createControlApi,
  type ControlApiResponse,
  type RequestPrincipal
} from "@mef/control-api";
import {
  createInMemoryJobExecutionStorage,
  FixtureWorkerRegistry,
  InMemoryJobExecutionPersistence,
  JobExecutionService,
  OperationalStateError,
  PostgresJobExecutionPersistence,
  applyMigrations,
  createPostgresSqlPool,
  scopeKey,
  type InMemoryJobExecutionStorage,
  type SqlPool
} from "@mef/operational-state";
import { loadEmbeddedMigrations } from "./embedded-migrations.ts";
import { isBoundedSyntheticPreview } from "./auth.ts";
import { toOperationalSecurityContext } from "./authz.ts";

export const FIXTURE_SCENARIOS = [
  "SUCCESS",
  "RETRY_THEN_SUCCESS",
  "NON_RETRYABLE_FAILURE",
  "CANCELLABLE",
  "UNKNOWN_OUTCOME",
  "PROGRESS"
] as const satisfies ReadonlyArray<FixtureScenario>;

const FIXTURE_SCENARIO_SET = new Set<string>(FIXTURE_SCENARIOS);
const FIXTURE_AUTHORITY_CONTEXT = {
  entity_type: "AgentContext",
  object_id: "ctx_ml99_fixture_qualification"
} as const;

interface JobRuntime {
  readonly execution: JobExecutionService;
  readonly controlApi: ControlApi;
  readonly persistence: "memory" | "postgres";
}

interface RuntimeBase {
  readonly registry: FixtureWorkerRegistry;
  readonly runtimes: Map<string, Promise<JobRuntime>>;
  readonly persistence: "memory" | "postgres";
  readonly memoryStores: Map<string, InMemoryJobExecutionStorage>;
  pool?: ReturnType<typeof createPostgresSqlPool>;
  migrations?: Promise<void>;
  runtimeRoleCheck?: Promise<void>;
}

const runtimeCache = globalThis as typeof globalThis & { __mefRuntimeBase?: RuntimeBase };

function runtimeBase(): RuntimeBase {
  const databaseUrl = process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_URL;
  return runtimeCache.__mefRuntimeBase ??= {
    registry: new FixtureWorkerRegistry(),
    runtimes: new Map(),
    memoryStores: new Map(),
    persistence: databaseUrl ? "postgres" : "memory"
  };
}

async function ensureMigrations(base: RuntimeBase): Promise<void> {
  if (base.persistence === "memory") return;
  base.migrations ??= (async () => {
    const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_URL;
    if (!migrationUrl) throw new Error("database configuration unavailable");
    const migrationPool = createPostgresSqlPool({ connectionString: migrationUrl, max: 2 });
    try {
      await applyMigrations(migrationPool, await loadEmbeddedMigrations());
    } finally {
      await migrationPool.end();
    }
  })();
  await base.migrations;
}

export async function ensureApplicationMigrations(): Promise<void> {
  await ensureMigrations(runtimeBase());
}

export async function verifyRuntimeRole(pool: SqlPool): Promise<void> {
  try {
    const result = await pool.query<{ superuser: boolean; bypassRls: boolean }>(
      "SELECT COALESCE(rolsuper, false) AS \"superuser\", COALESCE(rolbypassrls, false) AS \"bypassRls\" FROM pg_roles WHERE rolname = current_user"
    );
    if (result.rows.length !== 1 || result.rows[0].superuser || result.rows[0].bypassRls) throw new OperationalStateError("INVALID_CONFIGURATION");
  } catch (error) {
    if (error instanceof OperationalStateError) throw error;
    throw new OperationalStateError("INVALID_CONFIGURATION");
  }
}

async function createRuntime(principal: RequestPrincipal): Promise<JobRuntime> {
  const base = runtimeBase();
  const securityContext = toOperationalSecurityContext(principal);
  await ensureMigrations(base);
  if (base.persistence === "memory") {
    const scope = scopeKey(principal);
    const storage = base.memoryStores.get(scope) ?? createInMemoryJobExecutionStorage();
    base.memoryStores.set(scope, storage);
    const execution = new JobExecutionService(new InMemoryJobExecutionPersistence(securityContext, storage), base.registry, { securityContext });
    return { execution, controlApi: createControlApi(execution, principal), persistence: "memory" };
  }
  base.pool ??= createPostgresSqlPool({
    connectionString: process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_URL,
    max: 5
  });
  base.runtimeRoleCheck ??= verifyRuntimeRole(base.pool);
  await base.runtimeRoleCheck;
  const execution = new JobExecutionService(new PostgresJobExecutionPersistence(base.pool, securityContext), base.registry, { securityContext });
  return { execution, controlApi: createControlApi(execution, principal), persistence: "postgres" };
}

export function getJobRuntime(principal: RequestPrincipal): Promise<JobRuntime> {
  const base = runtimeBase();
  const key = JSON.stringify([
    scopeKey(principal),
    principal.principalId,
    principal.sessionId ?? "",
    principal.runtimePrincipalType ?? "HTTP",
    principal.runtimePrincipalId ?? "practitioner-web"
  ]);
  const cached = base.runtimes.get(key);
  if (cached) return cached;
  const created = createRuntime(principal);
  base.runtimes.set(key, created);
  return created;
}

export function isFixtureScenario(value: unknown): value is FixtureScenario {
  return typeof value === "string" && FIXTURE_SCENARIO_SET.has(value);
}

function boundedSeed(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback).replace(/[^A-Za-z0-9._:-]/gu, "-").slice(0, 220);
  return normalized.length > 0 ? normalized : fallback;
}

function fixtureCommandBody(input: {
  readonly scenario: FixtureScenario;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
}) {
  const seed = boundedSeed(input.idempotencyKey, `ml99-${input.scenario.toLowerCase()}`);
  const correlationId = boundedSeed(input.correlationId, `corr-${seed}`);
  const requestId = boundedSeed(input.requestId, `req-${seed}`);
  return {
    command_type: "FIXTURE_EXECUTION" as const,
    idempotency_key: seed,
    request_payload: {
      payload_kind: "STRUCTURAL" as const,
      input_label: "ML-99 synthetic fixture",
      input_value: `Synthetic qualification scenario: ${input.scenario}`,
      fixture_scenario: input.scenario
    },
    requested_operation: "EXECUTE" as const,
    authority_context_reference: FIXTURE_AUTHORITY_CONTEXT,
    correlation_metadata: {
      correlation_id: correlationId,
      request_id: requestId
    }
  };
}

function syntheticFixtureAllowed(): boolean {
  return isBoundedSyntheticPreview()
    || (
      process.env.VERCEL_ENV === undefined
      && process.env.NODE_ENV !== "production"
      && process.env.MEF_LOCAL_DEV_IDENTITY === "true"
    );
}

const unauthenticatedResponse: ControlApiResponse = {
  status: 401,
  body: { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }
};

export async function handleControlRequest(request: {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
  readonly principal?: RequestPrincipal;
}): Promise<ControlApiResponse> {
  if (!request.principal) return unauthenticatedResponse;
  const runtime = await getJobRuntime(request.principal);
  return runtime.controlApi.handle({ ...request, principal: request.principal });
}

export interface FixtureJobSnapshot {
  readonly job: unknown;
  readonly progress: unknown;
  readonly jobStatus: number;
  readonly progressStatus: number;
}

export async function fixtureJobSnapshot(jobId: string, principal: RequestPrincipal): Promise<FixtureJobSnapshot> {
  const safeJobId = jobId as JobId;
  const [jobResponse, progressResponse] = await Promise.all([
    handleControlRequest({ method: "GET", path: `/jobs/${safeJobId}`, principal }),
    handleControlRequest({ method: "GET", path: `/jobs/${safeJobId}/progress`, principal })
  ]);
  return {
    job: jobResponse.body,
    progress: progressResponse.body,
    jobStatus: jobResponse.status,
    progressStatus: progressResponse.status
  };
}

export async function submitFixtureCommand(input: {
  readonly scenario: FixtureScenario;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly execute?: boolean;
  readonly principal: RequestPrincipal;
}) {
  if (!syntheticFixtureAllowed()) return { accepted: { status: 403, body: { error: { code: "FORBIDDEN", message: "Synthetic qualification is not enabled." } } } as ControlApiResponse, snapshot: undefined };
  const accepted = await handleControlRequest({
    method: "POST",
    path: "/commands",
    body: fixtureCommandBody(input),
    principal: input.principal
  });

  if (input.execute !== false && accepted.status === 202 && "job" in accepted.body) {
    await (await getJobRuntime(input.principal)).execution.runNext();
  }

  const snapshot = accepted.status === 202 && "job" in accepted.body
    ? await fixtureJobSnapshot(accepted.body.job.job_id, input.principal)
    : undefined;
  return { accepted, snapshot };
}

export async function runFixtureJob(jobId: string, principal: RequestPrincipal) {
  if (!syntheticFixtureAllowed()) return { job: { error: { code: "FORBIDDEN", message: "Synthetic qualification is not enabled." } }, progress: { error: { code: "FORBIDDEN", message: "Synthetic qualification is not enabled." } }, jobStatus: 403, progressStatus: 403 };
  if (!principal.permissions.includes("jobs:submit")) return { job: { error: { code: "FORBIDDEN", message: "The authenticated principal is not permitted." } }, progress: { error: { code: "FORBIDDEN", message: "The authenticated principal is not permitted." } }, jobStatus: 403, progressStatus: 403 };
  const before = await fixtureJobSnapshot(jobId, principal);
  if (before.jobStatus !== 200 || typeof before.job !== "object" || before.job === null || !("state" in before.job)) {
    return before;
  }
  if (before.job.state !== "QUEUED" && before.job.state !== "RETRY_WAIT" && before.job.state !== "CANCEL_REQUESTED") {
    return before;
  }
  await (await getJobRuntime(principal)).execution.runNext();
  return fixtureJobSnapshot(jobId, principal);
}

export async function cancelFixtureJob(jobId: string, principal: RequestPrincipal) {
  if (!syntheticFixtureAllowed()) return { job: { error: { code: "FORBIDDEN", message: "Synthetic qualification is not enabled." } }, progress: { error: { code: "FORBIDDEN", message: "Synthetic qualification is not enabled." } }, jobStatus: 403, progressStatus: 403 };
  if (!principal.permissions.includes("jobs:cancel")) return { job: { error: { code: "FORBIDDEN", message: "The authenticated principal is not permitted." } }, progress: { error: { code: "FORBIDDEN", message: "The authenticated principal is not permitted." } }, jobStatus: 403, progressStatus: 403 };
  await handleControlRequest({
    method: "POST",
    path: `/jobs/${jobId}/cancellation`,
    body: { reason_code: "USER_REQUESTED" },
    principal
  });
  return fixtureJobSnapshot(jobId, principal);
}
