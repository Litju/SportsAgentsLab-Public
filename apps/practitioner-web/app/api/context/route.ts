import { z } from "zod";
import { isPrincipal, principalOrError } from "../../../src/server/api-auth.ts";
import { listWorkspaceMemberships } from "../../../src/server/tenant-db.ts";

export const dynamic = "force-dynamic";

const switchBody = z.object({ workspace_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u) });

function workspaceCookie(workspaceId: string): string {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV !== undefined;
  return `mef_workspace_id=${encodeURIComponent(workspaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? "; Secure" : ""}`;
}

export async function GET(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  return Response.json({
    principal_id: principal.principalId,
    organization_id: principal.organizationId,
    workspace_id: principal.workspaceId,
    roles: principal.roles,
    permissions: principal.permissions
  });
}

export async function POST(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  }
  const parsed = switchBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  const memberships = await listWorkspaceMemberships(principal.organizationId, principal.principalId);
  const membership = memberships.find((entry) => entry.workspaceId === parsed.data.workspace_id);
  if (!membership) return Response.json({ error: { code: "FORBIDDEN", message: "The authenticated principal is not permitted." } }, { status: 403 });
  const response = Response.json({ workspace_id: membership.workspaceId, role: membership.role });
  response.headers.append("Set-Cookie", workspaceCookie(membership.workspaceId));
  return response;
}
