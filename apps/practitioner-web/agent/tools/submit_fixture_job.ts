import { defineTool } from "eve/tools";
import { z } from "zod";
import { FIXTURE_SCENARIOS, submitFixtureCommand } from "../../src/server/job-runtime.ts";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";

export default defineTool({
  description: "Submit and optionally execute one bounded ML-99 synthetic fixture through the governed ControlApi command and job path.",
  inputSchema: z.object({
    scenario: z.enum(FIXTURE_SCENARIOS),
    idempotency_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u).optional(),
    execute: z.boolean().optional()
  }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const result = await submitFixtureCommand({
      scenario: input.scenario,
      idempotencyKey: input.idempotency_key,
      correlationId: `eve:${ctx.callId}`,
      requestId: `eve:${ctx.callId}`,
      execute: input.execute,
      principal
    });
    return {
      accepted: result.accepted.body,
      snapshot: result.snapshot,
      synthetic_only: true
    };
  }
});
