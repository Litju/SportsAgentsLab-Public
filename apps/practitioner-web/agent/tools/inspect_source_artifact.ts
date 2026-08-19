import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import {
  attemptSummary,
  measurementAgentEnvelope,
  readMeasurementAgentRecords
} from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Inspect one persisted SourceArtifact and its import lineage. Return exact IDs and provenance; never expose original bytes.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    return {
      ...measurementAgentEnvelope(records),
      tool: "inspect_source_artifact",
      status: records.sourceArtifact === undefined ? "NOT_FOUND" : "FOUND",
      import_attempt: attemptSummary(records.attempt),
      source_artifact: records.sourceArtifact
    };
  }
});
