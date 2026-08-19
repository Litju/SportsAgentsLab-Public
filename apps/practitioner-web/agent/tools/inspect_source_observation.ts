import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import { measurementAgentEnvelope, readMeasurementAgentRecords } from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Inspect one persisted SourceObservation and adapter provenance. Unknown metadata remains unknown; raw records and bytes are never returned.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    return {
      ...measurementAgentEnvelope(records),
      tool: "inspect_source_observation",
      status: records.sourceObservation === undefined ? "NOT_FOUND" : "FOUND",
      source_observation: records.sourceObservation?.observation
    };
  }
});
