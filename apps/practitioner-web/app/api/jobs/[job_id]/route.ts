import { handleControlRequest } from "../../../../src/server/job-runtime.ts";
import { isPrincipal, principalOrError } from "../../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { job_id: jobId } = await context.params;
  const response = await handleControlRequest({ method: "GET", path: `/jobs/${jobId}`, principal });
  return Response.json(response.body, { status: response.status });
}

export async function POST(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { job_id: jobId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const response = await handleControlRequest({ method: "POST", path: `/jobs/${jobId}/cancellation`, body, principal });
  return Response.json(response.body, { status: response.status });
}
