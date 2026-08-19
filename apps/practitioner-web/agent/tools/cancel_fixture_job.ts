import { defineTool } from "eve/tools";
import { z } from "zod";
import { cancelFixtureJob } from "../../src/server/job-runtime.ts";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";

export default defineTool({
  description: "Request cancellation of one bounded synthetic fixture job through the governed ControlApi cancellation path.",
  inputSchema: z.object({
    job_id: z.string().regex(/^job_[a-z0-9][a-z0-9_-]{0,127}$/u)
  }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    return { ...(await cancelFixtureJob(input.job_id, principal)), synthetic_only: true };
  }
});
