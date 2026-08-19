import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  measurementAgentEnvelope,
  missingMetadataForRecords,
  missingMetadataStatus,
  readMeasurementAgentRecords
} from "../../src/server/measurement-agent.ts";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";

export default defineTool({
  description: "Identify missing, conflicting, unevaluated, or unsupported measurement metadata without guessing a value.",
  inputSchema: z.object({ import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u) }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    const missingMetadata = missingMetadataForRecords(records);
    return {
      ...measurementAgentEnvelope(records),
      tool: "identify_missing_metadata",
      status: missingMetadataStatus(missingMetadata),
      missing_metadata: missingMetadata,
      no_values_inferred: true
    };
  }
});
