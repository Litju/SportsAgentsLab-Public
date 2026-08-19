import { eveChannel } from "eve/channels/eve";
import type { AuthFn } from "eve/channels/auth";
import { bindEveSession, getEveSessionScope, TenantScopeConflictError } from "../../src/server/tenant-db.ts";
import { getRequestPrincipal, PrincipalAccessError, principalFromEveAuthContext, toEveAuthContext } from "../../src/server/authz.ts";

export function isSyntheticPreviewEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  return env.VERCEL_ENV === "preview" && env.MEF_SYNTHETIC_ONLY === "true";
}

export function createEveAuth(
  env: Readonly<Record<string, string | undefined>> = process.env
): readonly AuthFn<Request>[] {
  const auth: AuthFn<Request> = async (request) => {
    try {
      const principal = await getRequestPrincipal(request, {
        env: env as NodeJS.ProcessEnv,
        runtimePrincipalType: "EVE",
        runtimePrincipalId: "eve-route"
      });
      return principal === undefined || !principal.permissions.includes("eve:use")
        ? null
        : toEveAuthContext(principal);
    } catch {
      return null;
    }
  };
  return [auth];
}

export default eveChannel({
  auth: createEveAuth(),
  onMessage: async (ctx) => {
    const caller = ctx.eve.caller;
    if (!caller) return { auth: null };
    const sessionId = ctx.eve.sessionId;
    if (sessionId) {
      const principal = principalFromEveAuthContext(caller, sessionId);
      const existing = await getEveSessionScope({
        eveSessionId: sessionId,
        organizationId: principal.organizationId,
        principalId: principal.principalId
      });
      if (existing && (existing.workspaceId !== principal.workspaceId || existing.organizationId !== principal.organizationId || existing.principalId !== principal.principalId)) {
        throw new PrincipalAccessError(403, "FORBIDDEN");
      }
      try {
        await bindEveSession({
          eveSessionId: sessionId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          principalId: principal.principalId,
          betterAuthSessionId: principal.sessionId
        });
      } catch (error) {
        if (error instanceof TenantScopeConflictError) throw new PrincipalAccessError(403, "FORBIDDEN");
        throw error;
      }
    }
    return { auth: caller };
  }
});
