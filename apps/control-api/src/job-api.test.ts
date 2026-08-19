import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectReference, Timestamp } from "@mef/generated-ts";
import { ControlApi, type ApiErrorResponse, type ControlApiResponse, type RequestPrincipal } from "./index.ts";
import {
  FixedExecutionClock,
  FixtureWorkerRegistry,
  InMemoryJobExecutionPersistence,
  JobExecutionService
} from "@mef/operational-state";

const NOW = "2026-08-11T12:00:00.000Z" as Timestamp;
const AUTHORITY: ObjectReference = { entity_type: "AgentContext", object_id: "ctx_api_fixture" as never };
const PRINCIPAL: RequestPrincipal = {
  principalType: "USER",
  principalId: "api-test-user",
  organizationId: "org_api_test",
  workspaceId: "ws_api_test",
  roles: ["PRACTITIONER"],
  permissions: ["jobs:read", "jobs:submit", "jobs:cancel", "eve:use"]
};

function body(key: string, label = "api-input") {
  return {
    command_type: "FIXTURE_EXECUTION",
    idempotency_key: key,
    request_payload: {
      payload_kind: "STRUCTURAL",
      input_label: label,
      input_value: "synthetic-api-value",
      fixture_scenario: "SUCCESS"
    },
    requested_operation: "EXECUTE",
    authority_context_reference: AUTHORITY,
    correlation_metadata: { correlation_id: `corr-${key}`, request_id: `req-${key}` }
  };
}

function api() {
  const persistence = new InMemoryJobExecutionPersistence();
  const execution = new JobExecutionService(persistence, new FixtureWorkerRegistry(), { clock: new FixedExecutionClock(NOW) });
  return { api: new ControlApi(execution, PRINCIPAL), execution };
}

function apiError(response: ControlApiResponse): ApiErrorResponse {
  assert.equal("error" in response.body, true);
  if (!("error" in response.body) || response.body.error === undefined || !("message" in response.body.error)) {
    throw new Error("expected bounded API error");
  }
  return response.body as ApiErrorResponse;
}

test("typed command API accepts, reuses, reads, and cancels jobs", async () => {
  const { api: control } = api();
  const accepted = await control.handle({ method: "POST", path: "/commands", body: body("api-key") });
  assert.equal(accepted.status, 202);
  assert.equal("job" in accepted.body, true);
  if (!("job" in accepted.body)) return;
  const duplicate = await control.handle({
    method: "POST",
    path: "/commands",
    body: { ...body("api-key"), correlation_metadata: { correlation_id: "different-correlation", request_id: "different-request" } }
  });
  assert.equal(duplicate.status, 202);
  assert.equal("reused" in duplicate.body && duplicate.body.reused, true);

  const jobPath = `/jobs/${accepted.body.job.job_id}`;
  const fetched = await control.handle({ method: "GET", path: jobPath });
  assert.equal(fetched.status, 200);
  const progress = await control.handle({ method: "GET", path: `${jobPath}/progress` });
  assert.equal(progress.status, 200);
  const canceled = await control.handle({
    method: "POST",
    path: `${jobPath}/cancellation`,
    body: { reason_code: "USER_REQUESTED" }
  });
  assert.equal(canceled.status, 202);
  assert.equal("state" in canceled.body && canceled.body.state, "CANCELED");
});

test("API rejects malformed and prototype-polluting payloads", async () => {
  const { api: control } = api();
  const malformed = await control.handle({ method: "POST", path: "/commands", body: { ...body("bad"), unexpected: true } });
  assert.equal(malformed.status, 400);
  assert.equal(apiError(malformed).error.code, "INVALID_COMMAND_PAYLOAD");
  assert.equal(apiError(malformed).error.message.includes("unexpected"), false);

  const polluted = JSON.parse('{"command_type":"FIXTURE_EXECUTION","idempotency_key":"polluted","request_payload":{"payload_kind":"STRUCTURAL","input_label":"x","input_value":"y","fixture_scenario":"SUCCESS"},"requested_operation":"EXECUTE","authority_context_reference":{"entity_type":"AgentContext","object_id":"ctx_api_fixture"},"correlation_metadata":{"correlation_id":"c","request_id":"r"},"__proto__":{}}') as unknown;
  const rejected = await control.handle({ method: "POST", path: "/commands", body: polluted });
  assert.equal(rejected.status, 400);
});

test("API maps idempotency conflicts and unknown workers to bounded errors", async () => {
  const { api: control } = api();
  await control.handle({ method: "POST", path: "/commands", body: body("conflict", "one") });
  const conflict = await control.handle({ method: "POST", path: "/commands", body: body("conflict", "two") });
  assert.equal(conflict.status, 409);
  assert.equal(apiError(conflict).error.code, "IDEMPOTENCY_CONFLICT");

  const unknownWorker = await control.handle({
    method: "POST",
    path: "/commands",
    body: { ...body("future-worker"), command_type: "IMPORT", request_payload: { payload_kind: "STRUCTURAL", input_label: "x", input_value: "y" } }
  });
  assert.equal(unknownWorker.status, 400);
  assert.equal(apiError(unknownWorker).error.code, "UNKNOWN_COMMAND_TYPE");
});

test("API does not expose raw runtime paths or unsupported endpoints", async () => {
  const { api: control } = api();
  const missing = await control.handle({ method: "GET", path: "/jobs/job_missing" });
  assert.equal(missing.status, 404);
  assert.equal(apiError(missing).error.message.includes("job-api.test"), false);
  const unsupported = await control.handle({ method: "POST", path: "/jobs/job_missing/retry", body: {} });
  assert.equal(unsupported.status, 405);
});

test("API fails closed before parsing for missing or insufficient principals", async () => {
  const { execution } = api();
  const unauthenticated = new ControlApi(execution);
  const missing = await unauthenticated.handle({ method: "POST", path: "/commands", body: body("unauthenticated") });
  assert.equal(missing.status, 401);
  assert.equal(apiError(missing).error.code, "UNAUTHENTICATED");

  const readOnly: RequestPrincipal = {
    ...PRINCIPAL,
    principalId: "api-read-only-user",
    permissions: ["jobs:read"]
  };
  const restricted = new ControlApi(execution, readOnly);
  const denied = await restricted.handle({ method: "POST", path: "/commands", body: body("forbidden") });
  assert.equal(denied.status, 403);
  assert.equal(apiError(denied).error.code, "FORBIDDEN");
});

