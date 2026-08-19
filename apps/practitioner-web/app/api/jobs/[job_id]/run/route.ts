import { runFixtureJob } from "../../../../../src/server/job-runtime.ts";
import { isPrincipal, principalOrError } from "../../../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const { job_id: jobId } = await context.params;
  const snapshot = await runFixtureJob(jobId, principal);
  return Response.json(snapshot, { status: snapshot.jobStatus });
}
