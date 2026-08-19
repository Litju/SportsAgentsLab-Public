import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";
import { retrieveSourceImportOriginal } from "../../../../../src/server/source-import.ts";
import { sourceImportErrorResponse } from "../../../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ import_attempt_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { import_attempt_id: importAttemptId } = await context.params;
  try {
    const result = await retrieveSourceImportOriginal({ principal, importAttemptId });
    const encodedFilename = encodeURIComponent(result.attempt.originalFilename);
    return new Response(result.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="original.bin"; filename*=UTF-8''${encodedFilename}`,
        "content-length": String(result.bytes.byteLength),
        "content-type": result.attempt.declaredContentType,
        "x-mef-content-sha256": result.attempt.contentHash ?? "",
        "x-mef-scientific-eligibility": result.attempt.scientificEligibility
      }
    });
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
