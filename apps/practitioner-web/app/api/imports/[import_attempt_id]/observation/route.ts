import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";
import { getSourceObservation } from "../../../../../src/server/source-import.ts";
import { sourceImportErrorResponse } from "../../../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ import_attempt_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { import_attempt_id: importAttemptId } = await context.params;
  try {
    const result = await getSourceObservation({ principal, importAttemptId });
    if (!result) return Response.json({ error: { code: "NOT_FOUND", message: "The source observation was not found." } }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
