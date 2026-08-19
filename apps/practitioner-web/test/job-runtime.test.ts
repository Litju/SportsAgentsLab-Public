import { test } from "node:test";
import assert from "node:assert/strict";
import type { RequestPrincipal } from "@mef/control-api";
import {
  cancelFixtureJob,
  runFixtureJob,
  submitFixtureCommand
} from "../src/server/job-runtime.ts";

const TEST_PRINCIPAL: RequestPrincipal = {
  principalType: "USER",
  principalId: "test-user",
  organizationId: "org_test",
  workspaceId: "ws_test",
  roles: ["PRACTITIONER"],
  permissions: ["jobs:read", "jobs:submit", "jobs:cancel", "eve:use"],
  runtimePrincipalType: "HTTP",
  runtimePrincipalId: "test"
};
const READ_ONLY_PRINCIPAL: RequestPrincipal = {
  ...TEST_PRINCIPAL,
  principalId: "read-only-user",
  permissions: ["jobs:read"]
};

function acceptedJobId(result: Awaited<ReturnType<typeof submitFixtureCommand>>): string {
  assert.equal(result.accepted.status, 202);
  if (result.accepted.status !== 202 || !("job" in result.accepted.body)) {
    throw new Error("expected a queued fixture job");
  }
  return result.accepted.body.job.job_id;
}

function snapshotState(snapshot: Awaited<ReturnType<typeof runFixtureJob>>): string {
  assert.equal(snapshot.jobStatus, 200);
  if (snapshot.jobStatus !== 200 || typeof snapshot.job !== "object" || snapshot.job === null || !("state" in snapshot.job)) {
    throw new Error("expected a readable fixture job snapshot");
  }
  return String(snapshot.job.state);
}

test("practitioner runtime preserves governed fixture outcomes", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalLocalIdentity = process.env.MEF_LOCAL_DEV_IDENTITY;
  delete process.env.DATABASE_URL;
  process.env.MEF_LOCAL_DEV_IDENTITY = "true";

  try {
    const success = await submitFixtureCommand({
      scenario: "SUCCESS",
      idempotencyKey: "app-test-success",
      execute: false,
      principal: TEST_PRINCIPAL
    });
    const successJobId = acceptedJobId(success);
    assert.equal(snapshotState(await runFixtureJob(successJobId, TEST_PRINCIPAL)), "SUCCEEDED");

    const unknown = await submitFixtureCommand({
      scenario: "UNKNOWN_OUTCOME",
      idempotencyKey: "app-test-unknown",
      principal: TEST_PRINCIPAL
    });
    assert.equal(unknown.snapshot?.jobStatus, 200);
    assert.equal(snapshotState(unknown.snapshot as Awaited<ReturnType<typeof runFixtureJob>>), "UNKNOWN_OUTCOME");

    const canceled = await submitFixtureCommand({
      scenario: "CANCELLABLE",
      idempotencyKey: "app-test-cancel",
      execute: false,
      principal: TEST_PRINCIPAL
    });
    const canceledJobId = acceptedJobId(canceled);
    const canceledSnapshot = await cancelFixtureJob(canceledJobId, TEST_PRINCIPAL);
    assert.equal(snapshotState(canceledSnapshot), "CANCELED");
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalLocalIdentity === undefined) delete process.env.MEF_LOCAL_DEV_IDENTITY;
    else process.env.MEF_LOCAL_DEV_IDENTITY = originalLocalIdentity;
  }
});

test("runtime execution endpoint rejects a read-only principal", async () => {
  const originalLocalIdentity = process.env.MEF_LOCAL_DEV_IDENTITY;
  process.env.MEF_LOCAL_DEV_IDENTITY = "true";
  try {
    const result = await runFixtureJob("job_read_only", READ_ONLY_PRINCIPAL);
    assert.equal(result.jobStatus, 403);
    assert.equal(result.progressStatus, 403);
    const cancellation = await cancelFixtureJob("job_read_only", READ_ONLY_PRINCIPAL);
    assert.equal(cancellation.jobStatus, 403);
    assert.equal(cancellation.progressStatus, 403);
  } finally {
    if (originalLocalIdentity === undefined) delete process.env.MEF_LOCAL_DEV_IDENTITY;
    else process.env.MEF_LOCAL_DEV_IDENTITY = originalLocalIdentity;
  }
});

test("local synthetic execution remains disabled in production mode", async () => {
  const environment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = environment.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalLocalIdentity = process.env.MEF_LOCAL_DEV_IDENTITY;
  environment.NODE_ENV = "production";
  delete process.env.VERCEL_ENV;
  process.env.MEF_LOCAL_DEV_IDENTITY = "true";
  try {
    const result = await runFixtureJob("job_production_local-identity", TEST_PRINCIPAL);
    assert.equal(result.jobStatus, 403);
    assert.equal(result.progressStatus, 403);
  } finally {
    if (originalNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnv;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalLocalIdentity === undefined) delete process.env.MEF_LOCAL_DEV_IDENTITY;
    else process.env.MEF_LOCAL_DEV_IDENTITY = originalLocalIdentity;
  }
});

test("same-workspace principals share tenant idempotency across runtime contexts", async () => {
  const originalLocalIdentity = process.env.MEF_LOCAL_DEV_IDENTITY;
  process.env.MEF_LOCAL_DEV_IDENTITY = "true";
  const otherPrincipal: RequestPrincipal = {
    ...TEST_PRINCIPAL,
    principalId: "other-workspace-user",
    runtimePrincipalId: "other-test"
  };
  try {
    const first = await submitFixtureCommand({
      scenario: "SUCCESS",
      idempotencyKey: "same-workspace-principal-key",
      execute: false,
      principal: TEST_PRINCIPAL
    });
    const second = await submitFixtureCommand({
      scenario: "SUCCESS",
      idempotencyKey: "same-workspace-principal-key",
      execute: false,
      principal: otherPrincipal
    });
    assert.equal(first.accepted.status, 202);
    assert.equal(second.accepted.status, 202);
    if (first.accepted.status !== 202 || second.accepted.status !== 202 || !("job" in first.accepted.body) || !("job" in second.accepted.body)) return;
    assert.equal(second.accepted.body.reused, true);
    assert.equal(first.accepted.body.job.job_id, second.accepted.body.job.job_id);
  } finally {
    if (originalLocalIdentity === undefined) delete process.env.MEF_LOCAL_DEV_IDENTITY;
    else process.env.MEF_LOCAL_DEV_IDENTITY = originalLocalIdentity;
  }
});
