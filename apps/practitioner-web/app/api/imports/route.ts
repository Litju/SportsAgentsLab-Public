import { z } from "zod";
import { isPrincipal, principalOrError } from "../../../src/server/api-auth.ts";
import {
  createSourceImportAttempt,
  listSourceImports,
  normalizeDeclaredMediaType
} from "../../../src/server/source-import.ts";
import { invalidSourceImportRequest, sourceImportErrorResponse } from "../../../src/server/source-import-http.ts";

export const dynamic = "force-dynamic";

const createImportRequest = z.object({
  original_filename: z.string().min(1).max(512).refine((value) => !/[\u0000\r\n]/u.test(value)),
  declared_content_type: z.string().optional(),
  declared_size_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  athlete_id: z.string().min(1).max(256).nullable().optional(),
  session_id: z.string().min(1).max(256).nullable().optional()
});

export async function GET(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  try {
    return Response.json({ attempts: await listSourceImports(principal) });
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
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
  const parsed = createImportRequest.safeParse(body);
  if (!parsed.success) return invalidSourceImportRequest();
  try {
    const attempt = await createSourceImportAttempt({
      principal,
      originalFilename: parsed.data.original_filename,
      declaredContentType: normalizeDeclaredMediaType(parsed.data.declared_content_type),
      declaredSizeBytes: parsed.data.declared_size_bytes,
      athleteId: parsed.data.athlete_id ?? undefined,
      sessionId: parsed.data.session_id ?? undefined
    });
    return Response.json({
      attempt,
      upload: {
        access: "private",
        pathname: attempt.stagingBlobPath,
        handleUploadUrl: "/api/imports/upload"
      }
    }, { status: 201 });
  } catch (error) {
    return sourceImportErrorResponse(error);
  }
}
