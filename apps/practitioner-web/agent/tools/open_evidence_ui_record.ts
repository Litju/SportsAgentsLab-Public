import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import {
  measurementAgentEnvelope,
  readMeasurementAgentRecords,
  uiRecordPath
} from "../../src/server/measurement-agent.ts";

const recordTypes = [
  "import_attempt",
  "source_artifact",
  "source_observation",
  "canonical_acquisition",
  "configuration_resolution",
  "configuration_contract",
  "evidence_manifest",
  "provenance"
] as const;

export default defineTool({
  description: "Open an exact persisted evidence or UI record by verified record ID. Unknown IDs are rejected; this tool is read-only.",
  inputSchema: z.object({
    import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u),
    record_type: z.enum(recordTypes),
    record_id: z.string().min(1).max(256)
  }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    const uiPath = uiRecordPath({ records, recordType: input.record_type, recordId: input.record_id });
    return {
      ...measurementAgentEnvelope(records),
      tool: "open_evidence_ui_record",
      status: "OPENABLE",
      record_type: input.record_type,
      record_id: input.record_id,
      ui_path: uiPath,
      exact_record_id: true,
      mutation: "NONE"
    };
  }
});
