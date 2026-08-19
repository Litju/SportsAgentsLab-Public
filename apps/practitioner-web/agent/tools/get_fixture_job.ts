import { defineTool } from "eve/tools";
import { z } from "zod";
import { fixtureJobSnapshot } from "../../src/server/job-runtime.ts";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";

export default defineTool({
  description: "Read one bounded synthetic fixture job and its governed progress events without inventing a result.",
  inputSchema: z.object({
    job_id: z.string().regex(/^job_[a-z0-9][a-z0-9_-]{0,127}$/u)
  }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    return { ...(await fixtureJobSnapshot(input.job_id, principal)), synthetic_only: true };
  }
});
