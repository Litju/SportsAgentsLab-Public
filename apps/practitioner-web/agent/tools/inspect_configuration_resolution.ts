import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import { measurementAgentEnvelope, readMeasurementAgentRecords } from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Inspect one deterministic ConfigurationResolution and contract. It is evidence only; it cannot mutate qualification or practitioner metadata.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    return {
      ...measurementAgentEnvelope(records),
      tool: "inspect_configuration_resolution",
      status: records.configurationResolution === undefined ? "NOT_FOUND" : "FOUND",
      resolution: records.configurationResolution?.resolution,
      contract: records.configurationResolution?.contract,
      qualification_mutation: "NOT_PERFORMED"
    };
  }
});
