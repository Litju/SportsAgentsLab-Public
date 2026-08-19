import type {
  Actor,
  Command,
  CommandPayload,
  CommandType,
  CorrelationMetadata,
  Job,
  JobId,
  ObjectReference,
  ProgressEvent
} from "@mef/generated-ts";
import {
  isCanonicalObjectReference,
  isOperationalStateError,
  JobExecutionService,
  OperationalStateError,
  type CommandSubmissionInput,
  type OperationalErrorCode
} from "@mef/operational-state";

export const JOB_EXECUTION_ENDPOINTS = [
  "POST /commands",
  "GET /jobs/{job_id}",
  "GET /jobs/{job_id}/progress",
  "POST /jobs/{job_id}/cancellation"
] as const;

export interface ControlApiRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
  readonly principal?: RequestPrincipal;
}

export type MefPermission = "jobs:read" | "jobs:submit" | "jobs:cancel" | "eve:use";

export interface RequestPrincipal {
  readonly principalType: "USER" | "SERVICE";
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly roles: ReadonlyArray<"PRACTITIONER" | "SCIENTIFIC_ADMIN">;
  readonly permissions: ReadonlyArray<MefPermission>;
  readonly sessionId?: string;
  readonly humanPrincipalId?: string;
  readonly runtimePrincipalType?: "HTTP" | "EVE" | "JOB_WORKER" | "SYSTEM";
  readonly runtimePrincipalId?: string;
  readonly requestId?: string;
  readonly actor?: Actor;
}

export interface CommandAcceptedResponse {
  readonly command: Command;
  readonly job: Job;
  readonly reused: boolean;
}

export interface ProgressEventCollectionResponse {
  readonly events: ReadonlyArray<ProgressEvent>;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: OperationalErrorCode | "INVALID_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN";
    readonly message: string;
  };
}

export type ControlApiResponseBody = CommandAcceptedResponse | Job | ProgressEventCollectionResponse | ApiErrorResponse;

export interface ControlApiResponse {
  readonly status: 200 | 202 | 400 | 401 | 403 | 404 | 405 | 409 | 500;
  readonly body: ControlApiResponseBody;
}

const COMMAND_TYPES: ReadonlySet<CommandType> = new Set([
  "FIXTURE_EXECUTION",
  "IMPORT",
  "SCIENTIFIC_PROCESSING",
  "INFERENCE",
  "EVIDENCE_ASSEMBLY",
  "AUTHORIZED_ACTION"
]);
const FIXTURE_SCENARIOS = new Set(["SUCCESS", "RETRY_THEN_SUCCESS", "NON_RETRYABLE_FAILURE", "CANCELLABLE", "UNKNOWN_OUTCOME", "PROGRESS"]);
const POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && !Object.keys(value).some((key) => POLLUTION_KEYS.has(key));
}

function hasExactKeys(value: Record<string, unknown>, required: ReadonlyArray<string>, optional: ReadonlyArray<string> = []): boolean {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => allowed.has(key));
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum;
}

function safeStructuralString(value: unknown, maximum: number): value is string {
  return boundedString(value, maximum) && !/(?:password|secret|access[_-]?token|api[_-]?key|authorization)/iu.test(value);
}

function parseReference(value: unknown): ObjectReference {
  if (!isCanonicalObjectReference(value)) throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  return value;
}

function parsePayload(value: unknown): CommandPayload {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["payload_kind", "input_label", "input_value"], ["fixture_scenario"])) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (value.payload_kind !== "STRUCTURAL" || !safeStructuralString(value.input_label, 512) || !safeStructuralString(value.input_value, 2000)) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (value.fixture_scenario !== undefined && (typeof value.fixture_scenario !== "string" || !FIXTURE_SCENARIOS.has(value.fixture_scenario))) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  return value as unknown as CommandPayload;
}

function parseCorrelation(value: unknown): CorrelationMetadata {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["correlation_id", "request_id"], ["causation_id"])) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (!boundedString(value.correlation_id, 512) || !boundedString(value.request_id, 512)) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (value.causation_id !== undefined && !boundedString(value.causation_id, 512)) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  return value as unknown as CorrelationMetadata;
}

function parseCommandSubmission(value: unknown): CommandSubmissionInput {
  if (!isPlainRecord(value) || !hasExactKeys(
    value,
    ["command_type", "idempotency_key", "request_payload", "requested_operation", "authority_context_reference", "correlation_metadata"],
    ["request_reference"]
  )) throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  if (typeof value.command_type !== "string" || !COMMAND_TYPES.has(value.command_type as CommandType)) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(String(value.idempotency_key))) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  if (value.requested_operation !== "EXECUTE") throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  const payload = parsePayload(value.request_payload);
  if (value.command_type === "FIXTURE_EXECUTION" && payload.fixture_scenario === undefined) {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
  const requestReference = value.request_reference === undefined ? undefined : parseReference(value.request_reference);
  const input: CommandSubmissionInput = {
    command_type: value.command_type as CommandType,
    idempotency_key: String(value.idempotency_key) as CommandSubmissionInput["idempotency_key"],
    request_payload: payload,
    requested_operation: "EXECUTE",
    authority_context_reference: parseReference(value.authority_context_reference),
    correlation_metadata: parseCorrelation(value.correlation_metadata)
  };
  return requestReference === undefined ? input : { ...input, request_reference: requestReference };
}

function parseJobId(path: string, pattern: RegExp): JobId {
  const match = pattern.exec(path);
  if (!match || !/^job_[a-z0-9][a-z0-9_-]{0,127}$/u.test(match[1])) throw new OperationalStateError("JOB_NOT_FOUND");
  return match[1] as JobId;
}

function parseCancellation(value: unknown): void {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["reason_code"]) || value.reason_code !== "USER_REQUESTED") {
    throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
  }
}

function errorResponse(error: unknown): ControlApiResponse {
  if (isOperationalStateError(error)) {
    const status: ControlApiResponse["status"] = error.code === "JOB_NOT_FOUND"
      ? 404
      : error.code === "IDEMPOTENCY_CONFLICT"
        || error.code === "JOB_ALREADY_TERMINAL"
        || error.code === "CANCELLATION_NOT_ALLOWED"
        || error.code === "PROGRESS_SEQUENCE_CONFLICT"
        ? 409
        : error.code === "JOB_PERSISTENCE_FAILED" || error.code === "DATABASE_TRANSACTION_FAILED" || error.code === "DATABASE_UNAVAILABLE"
          ? 500
          : 400;
    const safeCode = error.code === "DATABASE_TRANSACTION_FAILED" || error.code === "DATABASE_UNAVAILABLE"
      ? "JOB_PERSISTENCE_FAILED"
      : error.code;
    return { status, body: { error: { code: safeCode, message: safeMessage(safeCode) } } };
  }
  return { status: 500, body: { error: { code: "JOB_PERSISTENCE_FAILED", message: safeMessage("JOB_PERSISTENCE_FAILED") } } };
}

function safeMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    INVALID_REQUEST: "The request is invalid.",
    UNAUTHENTICATED: "Authentication is required.",
    FORBIDDEN: "The authenticated principal is not permitted to perform this action.",
    JOB_NOT_FOUND: "The requested job was not found.",
    IDEMPOTENCY_CONFLICT: "The idempotency key is already bound to different command input.",
    JOB_ALREADY_TERMINAL: "The job has already reached a terminal state.",
    CANCELLATION_NOT_ALLOWED: "The job cannot be canceled in its current state.",
    PROGRESS_SEQUENCE_CONFLICT: "The progress event sequence is invalid.",
    JOB_PERSISTENCE_FAILED: "The job execution record could not be persisted."
  };
  return messages[code] ?? "The request could not be processed.";
}

export class ControlApi {
  constructor(private readonly execution: JobExecutionService, private readonly principal?: RequestPrincipal) {}

  private authorization(request: ControlApiRequest, permission: MefPermission): ControlApiResponse | undefined {
    const principal = request.principal ?? this.principal;
    if (!principal) return { status: 401, body: { error: { code: "UNAUTHENTICATED", message: safeMessage("UNAUTHENTICATED") } } };
    if (!principal.permissions.includes(permission)) {
      return { status: 403, body: { error: { code: "FORBIDDEN", message: safeMessage("FORBIDDEN") } } };
    }
    return undefined;
  }

  async handle(request: ControlApiRequest): Promise<ControlApiResponse> {
    try {
      if (request.path.length === 0 || request.path.length > 512) throw new OperationalStateError("INVALID_COMMAND_PAYLOAD");
      if (request.method === "POST" && request.path === "/commands") {
        const denied = this.authorization(request, "jobs:submit");
        if (denied) return denied;
        const input = parseCommandSubmission(request.body);
        const accepted = await this.execution.submit(input);
        return { status: 202, body: accepted };
      }
      if (request.method === "GET" && /^\/jobs\/job_[a-z0-9][a-z0-9_-]{0,127}$/u.test(request.path)) {
        const denied = this.authorization(request, "jobs:read");
        if (denied) return denied;
        const job = await this.execution.getJob(parseJobId(request.path, /^\/jobs\/(job_[a-z0-9][a-z0-9_-]{0,127})$/u));
        if (!job) throw new OperationalStateError("JOB_NOT_FOUND");
        return { status: 200, body: job };
      }
      if (request.method === "GET" && /^\/jobs\/job_[a-z0-9][a-z0-9_-]{0,127}\/progress$/u.test(request.path)) {
        const denied = this.authorization(request, "jobs:read");
        const jobId = parseJobId(request.path, /^\/jobs\/(job_[a-z0-9][a-z0-9_-]{0,127})\/progress$/u);
        if (denied) return denied;
        return { status: 200, body: { events: await this.execution.getProgress(jobId) } };
      }
      if (request.method === "POST" && /^\/jobs\/job_[a-z0-9][a-z0-9_-]{0,127}\/cancellation$/u.test(request.path)) {
        const denied = this.authorization(request, "jobs:cancel");
        if (denied) return denied;
        parseCancellation(request.body);
        const jobId = parseJobId(request.path, /^\/jobs\/(job_[a-z0-9][a-z0-9_-]{0,127})\/cancellation$/u);
        return { status: 202, body: await this.execution.requestCancellation(jobId) };
      }
      return { status: 405, body: { error: { code: "INVALID_REQUEST", message: safeMessage("INVALID_REQUEST") } } };
    } catch (error) {
      return errorResponse(error);
    }
  }
}

export function createControlApi(execution: JobExecutionService, principal?: RequestPrincipal): ControlApi {
  return new ControlApi(execution, principal);
}
