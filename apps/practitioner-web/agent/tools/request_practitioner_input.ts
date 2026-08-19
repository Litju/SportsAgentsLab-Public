import { defineTool } from "eve/tools";
import { z } from "zod";
import { bindEveSessionForPrincipal } from "../../src/server/authz.ts";
import {
  MEASUREMENT_METADATA_FIELDS,
  measurementAgentEnvelope,
  missingMetadataForRecords,
  practitionerQuestion,
  practitionerRequestKey,
  readMeasurementAgentRecords,
  uiRecordPath
} from "../../src/server/measurement-agent.ts";

export default defineTool({
  description: "Request explicit practitioner input for one governed metadata field. Never write or silently mutate source mapping, configuration, qualification, or confirmed metadata.",
  inputSchema: z.object({
    import_attempt_id: z.string().regex(/^imp_[a-z0-9][a-z0-9_-]{0,127}$/u),
    field: z.enum(MEASUREMENT_METADATA_FIELDS),
    prompt: z.string().trim().min(1).max(500).optional()
  }),
  async execute(input, ctx) {
    const principal = await bindEveSessionForPrincipal(ctx.session);
    const records = await readMeasurementAgentRecords({ principal, importAttemptId: input.import_attempt_id });
    const item = missingMetadataForRecords(records).find((candidate) => candidate.field === input.field);
    const envelope = measurementAgentEnvelope(records);
    if (!item) {
      return {
        ...envelope,
        tool: "request_practitioner_input",
        status: "NOT_NEEDED",
        field: input.field,
        mutation: "NONE"
      };
    }
    if (item.status === "UNSUPPORTED") {
      return {
        ...envelope,
        tool: "request_practitioner_input",
        status: "REFUSED",
        field: input.field,
        reason: item.reason,
        mutation: "NONE",
        downstream_processing: "REFUSED"
      };
    }
    return {
      ...envelope,
      tool: "request_practitioner_input",
      status: "REQUESTED",
      field: input.field,
      request_key: practitionerRequestKey(records, input.field, item),
      request_persisted: false,
      practitioner_input: {
        record_id: item.record_id,
        status: item.status,
        question: practitionerQuestion(input.field, item, input.prompt),
        evidence_references: item.evidence_references
      },
      proposal: {
        mutation: "NONE",
        requires_explicit_ui_approval: true,
        ui_path: uiRecordPath({ records, recordType: "import_attempt", recordId: records.attempt.importAttemptId }),
        exact_record_ids: envelope.record_ids
      }
    };
  }
});
