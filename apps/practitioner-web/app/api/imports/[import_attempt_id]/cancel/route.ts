import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";
import { cancelSourceImport } from "../../../../../src/server/source-import.ts";
import { sourceImportErrorResponse } from "../../../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ import_attempt_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { import_attempt_id: importAttemptId } = await context.params;
  try {
    return Response.json({ attempt: await cancelSourceImport({ principal, importAttemptId }) });
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
