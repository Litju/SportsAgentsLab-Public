import { handleControlRequest } from "../../../../../src/server/job-runtime.ts";
import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { job_id: jobId } = await context.params;
  const response = await handleControlRequest({ method: "GET", path: `/jobs/${jobId}/progress`, principal });
  return Response.json(response.body, { status: response.status });
}
