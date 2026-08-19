import { handleControlRequest } from "../../../src/server/job-runtime.ts";
import { isPrincipal, principalOrError } from "../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

async function requestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  const response = await handleControlRequest({
    method: "POST",
    path: "/commands",
    body: await requestBody(request),
    principal
  });
  return Response.json(response.body, { status: response.status });
}
