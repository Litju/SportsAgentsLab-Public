import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import { measurementAgentEnvelope, readMeasurementAgentRecords } from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Inspect one persisted CanonicalAcquisition, mappings, timebase, quality, and provenance. Never infer units, axes, signs, synchronization, or eligibility.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    return {
      ...measurementAgentEnvelope(records),
      tool: "inspect_canonical_acquisition",
      status: records.canonicalAcquisition === undefined ? "NOT_FOUND" : "FOUND",
      canonical_acquisition: records.canonicalAcquisition?.acquisition
    };
  }
});
