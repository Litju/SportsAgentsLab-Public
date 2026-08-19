import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isPrincipal, principalOrError } from "../../../../src/server/api-auth.ts";
import { authorizeSourceImportUpload } from "../../../../src/server/source-import.ts";
import { invalidSourceImportRequest, parseClientPayload, sourceImportErrorResponse } from "../../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

type GenerateClientTokenBody = Extract<HandleUploadBody, { type: "blob.generate-client-token" }>;

function isGenerateClientTokenBody(value: unknown): value is GenerateClientTokenBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  if (candidate.type !== "blob.generate-client-token" || typeof candidate.payload !== "object" || candidate.payload === null || Array.isArray(candidate.payload)) return false;
  const payload = candidate.payload as { pathname?: unknown; clientPayload?: unknown; multipart?: unknown };
  return typeof payload.pathname === "string"
    && (typeof payload.clientPayload === "string" || payload.clientPayload === null)
    && typeof payload.multipart === "boolean";
}

export async function POST(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidSourceImportRequest();
  }
  if (!isGenerateClientTokenBody(body)) return invalidSourceImportRequest("Only authenticated upload-token requests are accepted.");
  const clientPayload = parseClientPayload(body.payload.clientPayload);
  if (!clientPayload) return invalidSourceImportRequest("The upload authorization payload is invalid.");

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, payload) => {
        const parsedPayload = parseClientPayload(payload);
        if (!parsedPayload || parsedPayload.importAttemptId !== clientPayload.importAttemptId) {
          throw new Error("upload authorization payload mismatch");
        }
        const authorized = await authorizeSourceImportUpload({
          principal,
          importAttemptId: parsedPayload.importAttemptId,
          pathname
        });
        return {
          allowedContentTypes: [authorized.attempt.declaredContentType],
          maximumSizeInBytes: authorized.maximumSizeBytes,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ importAttemptId: parsedPayload.importAttemptId })
        };
      }
    });
    return Response.json(result);
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
