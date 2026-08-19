import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";
import { resolveSourceImportConfiguration } from "../../../../../src/server/configuration-resolution.ts";
import { sourceImportErrorResponse } from "../../../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ import_attempt_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { import_attempt_id: importAttemptId } = await context.params;
  try {
    const result = await resolveSourceImportConfiguration({ principal, importAttemptId });
    return Response.json(result, { status: result.status === "CONFIGURATION_RESOLUTION_RECORDED" ? 201 : 200 });
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
