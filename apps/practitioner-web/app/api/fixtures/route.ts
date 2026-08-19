import { z } from "zod";
import { FIXTURE_SCENARIOS, isFixtureScenario, submitFixtureCommand } from "../../../src/server/job-runtime.ts";
import { isPrincipal, principalOrError } from "../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

const fixtureRequest = z.object({
  scenario: z.enum(FIXTURE_SCENARIOS),
  idempotency_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u).optional(),
  execute: z.boolean().optional()
});

export async function POST(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  }

  const parsed = fixtureRequest.safeParse(body);
  if (!parsed.success || !isFixtureScenario(parsed.data.scenario)) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  }

  const result = await submitFixtureCommand({
    scenario: parsed.data.scenario,
    idempotencyKey: parsed.data.idempotency_key,
    execute: parsed.data.execute,
    principal
  });
  return Response.json({ accepted: result.accepted.body, snapshot: result.snapshot }, { status: result.accepted.status });
}
