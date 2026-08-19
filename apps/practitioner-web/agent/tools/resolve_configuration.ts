import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import { resolveMeasurementConfiguration } from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Invoke deterministic configuration resolution for one import. Unknown or conflicting metadata stays explicit; this tool performs no human qualification mutation.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    return resolveMeasurementConfiguration({ principal, importAttemptId: input.import_attempt_id });
  }
});
