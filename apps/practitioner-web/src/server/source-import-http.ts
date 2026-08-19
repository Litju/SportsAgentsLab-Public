import { isOperationalStateError, SourceImportError } from "@mef/operational-state";
import { isAdapterError } from "@mef/ingestion-adk";
import { isCanonicalizationError } from "@mef/canonical-acquisition";
import { ConfigurationResolutionError } from "@mef/acquisition-configuration";

export function sourceImportErrorResponse(error: unknown): Response {
  if (isCanonicalizationError(error)) {
    const status = error.code === "CANONICAL_LINEAGE_INVALID" ? 409
      : error.code === "CANONICAL_RECORD_INVALID" ? 422
      : 500;
    const message = status === 500 ? "The canonical acquisition mapping is unavailable." : error.message;
    return Response.json({ error: { code: `CANONICAL_${error.code.replace("CANONICAL_", "")}`, message } }, { status });
  }
  if (error instanceof ConfigurationResolutionError) {
    const status = error.code === "CANONICAL_LINEAGE_INVALID" ? 409
      : error.code === "METADATA_INVALID" ? 500
      : 422;
    return Response.json({ error: { code: `CONFIGURATION_${error.code}`, message: status === 500 ? "The configuration resolution could not be validated." : error.message } }, { status });
  }
  if (isAdapterError(error)) {
    const status = error.code === "AMBIGUOUS_ADAPTER" ? 409
      : error.code === "RESOURCE_LIMIT_EXCEEDED" ? 413
      : error.code === "TIMEOUT" || error.code === "CANCELLED" ? 408
      : error.code === "SOURCE_READ_FAILURE" ? 503
      : error.code === "OBSERVATION_VALIDATION_FAILURE" ? 500
      : 422;
    return Response.json({ error: { code: `ADK_${error.code}`, message: error.message } }, { status });
  }
  if (error instanceof SourceImportError) {
    return Response.json({ error: { code: error.sourceImportCode, message: error.message } }, { status: error.status });
  }
  if (isOperationalStateError(error)) {
    if (error.transactionOutcome === "UNKNOWN") {
      return Response.json({ error: { code: "IMPORT_RECONCILIATION_REQUIRED", message: "The finalization outcome is uncertain; refresh the attempt before retrying." } }, { status: 503 });
    }
    if (error.retryable) {
      return Response.json({ error: { code: "IMPORT_RETRYABLE", message: "The import could not be finalized yet; the original remains retryable." } }, { status: 503 });
    }
    if (error.code === "CONTRACT_INVALID") {
      return Response.json({ error: { code: "INVALID_REQUEST", message: error.message } }, { status: 400 });
    }
    if (error.code === "DATABASE_UNAVAILABLE" || error.code === "INVALID_CONFIGURATION") {
      return Response.json({ error: { code: "IMPORT_SERVICE_UNAVAILABLE", message: "The import service is temporarily unavailable." } }, { status: 503 });
    }
  }
  return Response.json({ error: { code: "IMPORT_SERVICE_UNAVAILABLE", message: "The import service is temporarily unavailable." } }, { status: 500 });
}

export function invalidSourceImportRequest(message = "The import request is invalid."): Response {
  return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
}

export function parseClientPayload(clientPayload: string | null): { readonly importAttemptId: string } | undefined {
  if (clientPayload === null || clientPayload.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(clientPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const importAttemptId = (parsed as { importAttemptId?: unknown }).importAttemptId;
    return typeof importAttemptId === "string" ? { importAttemptId } : undefined;
  } catch {
    return undefined;
  }
}
