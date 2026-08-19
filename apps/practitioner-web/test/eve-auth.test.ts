import { test } from "node:test";
import assert from "node:assert/strict";
import { routeAuth } from "eve/channels/auth";
import { createEveAuth } from "../agent/channels/eve.ts";

const request = new Request("https://preview.example/eve/v1/session", { method: "POST" });

test("synthetic Preview Eve access rejects an anonymous browser session", async () => {
  const result = await routeAuth(request, createEveAuth({
    VERCEL_ENV: "preview",
    MEF_SYNTHETIC_ONLY: "true"
  }));

  assert.equal(result instanceof Response, true);
  if (!(result instanceof Response)) return;
  assert.equal(result.status, 401);
});

test("local development identity is explicit and never selected on Preview", async () => {
  const result = await routeAuth(request, createEveAuth({
    MEF_LOCAL_DEV_IDENTITY: "true",
    MEF_LOCAL_PRINCIPAL_ID: "local-test-user"
  }));

  assert.equal(result instanceof Response, false);
  if (result instanceof Response) return;
  assert.equal(result.principalType, "user");
  assert.equal(result.principalId, "local-test-user");
});

test("non-synthetic deployments keep Eve route authentication fail-closed", async () => {
  const result = await routeAuth(request, createEveAuth({
    VERCEL_ENV: "production",
    MEF_SYNTHETIC_ONLY: "true"
  }));

  assert.equal(result instanceof Response, true);
  if (!(result instanceof Response)) return;
  assert.equal(result.status, 401);
});
