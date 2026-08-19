import { z } from "zod";
import { auth, isSyntheticBootstrapRequest } from "../../../../src/server/auth.ts";
import { createSyntheticWorkspace } from "../../../../src/server/tenant-db.ts";

export const dynamic = "force-dynamic";

const bootstrapBody = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(128),
  organization_name: z.string().min(1).max(200),
  organization_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,127}$/u),
  workspace_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  workspace_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,127}$/u),
  workspace_name: z.string().min(1).max(200)
});

function cookie(name: string, value: string): string {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV !== undefined;
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? "; Secure" : ""}`;
}

function appendSetCookieHeaders(response: Response, headers: Headers): void {
  const cookieHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof cookieHeaders.getSetCookie === "function"
    ? cookieHeaders.getSetCookie()
    : [headers.get("set-cookie")].filter((value): value is string => value !== null);
  for (const value of values) response.headers.append("Set-Cookie", value);
}

export async function POST(request: Request) {
  if (!isSyntheticBootstrapRequest(request)) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Synthetic bootstrap is disabled." } }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  }
  const parsed = bootstrapBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST", message: "The request is invalid." } }, { status: 400 });
  try {
    const signup = await auth.api.signUpEmail({
      body: { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name },
      returnHeaders: true
    });
    const user = signup.response.user;
    const organizationResult = await auth.api.createOrganization({
      body: {
        name: parsed.data.organization_name,
        slug: parsed.data.organization_slug,
        userId: user.id
      }
    });
    await createSyntheticWorkspace({
      organizationId: organizationResult.id,
      workspaceId: parsed.data.workspace_id,
      workspaceSlug: parsed.data.workspace_slug,
      displayName: parsed.data.workspace_name,
      principalId: user.id
    });
    const response = Response.json({ created: true, organization_id: organizationResult.id, workspace_id: parsed.data.workspace_id }, { status: 201 });
    appendSetCookieHeaders(response, signup.headers);
    response.headers.append("Set-Cookie", cookie("mef_organization_id", organizationResult.id));
    response.headers.append("Set-Cookie", cookie("mef_workspace_id", parsed.data.workspace_id));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json({ error: { code: "BOOTSTRAP_FAILED", message: "Synthetic bootstrap could not be completed." } }, { status: 400 });
  }
}
