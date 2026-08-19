import type { RequestPrincipal, MefPermission } from "@mef/control-api";
import type { Actor } from "@mef/generated-ts";
import { assertTenantScope, type OperationalSecurityContext } from "@mef/operational-state";
import { auth, getBetterAuthSession, isHostedEnvironment } from "./auth.ts";
import { bindEveSession, listWorkspaceMemberships, TenantScopeConflictError } from "./tenant-db.ts";

const PRINCIPAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface SessionAuthContext {
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
  readonly principalType: string;
  readonly subject?: string;
}

export class PrincipalAccessError extends Error {
  readonly status: 401 | 403;
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";

  constructor(status: 401 | 403, code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code === "UNAUTHENTICATED" ? "authentication is required" : "principal scope is not permitted");
    this.name = "PrincipalAccessError";
    this.status = status;
    this.code = code;
  }
}

function cookieValue(request: Request, key: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === key) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function boundedHeader(request: Request, name: string, fallback: string): string {
  const value = request.headers.get(name);
  return value !== null && PRINCIPAL_ID_PATTERN.test(value) ? value : fallback;
}

function permissionsForRole(role: "PRACTITIONER" | "SCIENTIFIC_ADMIN"): ReadonlyArray<MefPermission> {
  return role === "SCIENTIFIC_ADMIN"
    ? ["jobs:read", "jobs:submit", "jobs:cancel", "eve:use"]
    : ["jobs:read", "jobs:submit", "jobs:cancel", "eve:use"];
}

function actorForPrincipal(principalId: string, role: "PRACTITIONER" | "SCIENTIFIC_ADMIN"): Actor {
  return { actor_type: "PRACTITIONER", actor_id: principalId, role };
}

function principal(input: {
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly role: "PRACTITIONER" | "SCIENTIFIC_ADMIN";
  readonly sessionId?: string;
  readonly runtimePrincipalType: "HTTP" | "EVE";
  readonly runtimePrincipalId: string;
  readonly requestId?: string;
}): RequestPrincipal {
  if (!PRINCIPAL_ID_PATTERN.test(input.principalId) || !ORGANIZATION_ID_PATTERN.test(input.organizationId) || !WORKSPACE_ID_PATTERN.test(input.workspaceId)) {
    throw new PrincipalAccessError(403, "FORBIDDEN");
  }
  assertTenantScope(input);
  return {
    principalType: "USER",
    principalId: input.principalId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    roles: [input.role],
    permissions: permissionsForRole(input.role),
    sessionId: input.sessionId,
    humanPrincipalId: input.principalId,
    runtimePrincipalType: input.runtimePrincipalType,
    runtimePrincipalId: input.runtimePrincipalId,
    requestId: input.requestId,
    actor: actorForPrincipal(input.principalId, input.role)
  };
}

function localPrincipal(request: Request, env: NodeJS.ProcessEnv): RequestPrincipal | undefined {
  if (env.MEF_LOCAL_DEV_IDENTITY !== "true" || isHostedEnvironment(env)) return undefined;
  const principalId = env.MEF_LOCAL_PRINCIPAL_ID ?? "local-dev-user";
  const organizationId = env.MEF_LOCAL_ORGANIZATION_ID ?? "org_local_dev";
  const workspaceId = env.MEF_LOCAL_WORKSPACE_ID ?? "ws_local_dev";
  return principal({
    principalId,
    organizationId,
    workspaceId,
    role: "PRACTITIONER",
    runtimePrincipalType: "HTTP",
    runtimePrincipalId: "local-dev",
    requestId: boundedHeader(request, "x-request-id", crypto.randomUUID())
  });
}

function organizationsFromUnknown(value: unknown): ReadonlyArray<{ readonly id: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is { readonly id: string } =>
    typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string" && ORGANIZATION_ID_PATTERN.test((entry as { id: string }).id)
  );
}

export async function getRequestPrincipal(
  request: Request,
  options: { readonly runtimePrincipalType?: "HTTP" | "EVE"; readonly runtimePrincipalId?: string; readonly env?: NodeJS.ProcessEnv } = {}
): Promise<RequestPrincipal | undefined> {
  const env = options.env ?? process.env;
  const local = localPrincipal(request, env);
  if (local) {
    return {
      ...local,
      runtimePrincipalType: options.runtimePrincipalType ?? local.runtimePrincipalType,
      runtimePrincipalId: options.runtimePrincipalId ?? local.runtimePrincipalId
    };
  }
  const session = await getBetterAuthSession(request, env);
  if (!session) return undefined;
  const userId = session.user.id;
  if (!PRINCIPAL_ID_PATTERN.test(userId)) throw new PrincipalAccessError(403, "FORBIDDEN");
  const organizationApi = auth.api as typeof auth.api & { listOrganizations(input: { readonly headers: Headers }): Promise<unknown> };
  const organizations = organizationsFromUnknown(await organizationApi.listOrganizations({ headers: request.headers }));
  if (organizations.length === 0) throw new PrincipalAccessError(403, "FORBIDDEN");
  const cookieOrganizationId = cookieValue(request, "mef_organization_id");
  const activeOrganizationId = typeof (session.session as unknown as { activeOrganizationId?: unknown }).activeOrganizationId === "string"
    ? (session.session as unknown as { activeOrganizationId: string }).activeOrganizationId
    : undefined;
  const selectedOrganizationId = cookieOrganizationId ?? activeOrganizationId ?? (organizations.length === 1 ? organizations[0].id : undefined);
  if (!selectedOrganizationId || !organizations.some((entry) => entry.id === selectedOrganizationId)) {
    throw new PrincipalAccessError(403, "FORBIDDEN");
  }
  const memberships = await listWorkspaceMemberships(selectedOrganizationId, userId);
  if (memberships.length === 0) throw new PrincipalAccessError(403, "FORBIDDEN");
  const cookieWorkspaceId = cookieValue(request, "mef_workspace_id");
  const workspace = cookieWorkspaceId === undefined
    ? memberships.length === 1 ? memberships[0] : undefined
    : memberships.find((entry) => entry.workspaceId === cookieWorkspaceId);
  if (!workspace) throw new PrincipalAccessError(403, "FORBIDDEN");
  return principal({
    principalId: userId,
    organizationId: selectedOrganizationId,
    workspaceId: workspace.workspaceId,
    role: workspace.role,
    sessionId: session.session.id,
    runtimePrincipalType: options.runtimePrincipalType ?? "HTTP",
    runtimePrincipalId: options.runtimePrincipalId ?? "practitioner-web",
    requestId: boundedHeader(request, "x-request-id", crypto.randomUUID())
  });
}

export function toOperationalSecurityContext(principalValue: RequestPrincipal): OperationalSecurityContext {
  return {
    organizationId: principalValue.organizationId,
    workspaceId: principalValue.workspaceId,
    principalId: principalValue.principalId,
    principalType: principalValue.principalType,
    sessionId: principalValue.sessionId,
    humanPrincipalId: principalValue.humanPrincipalId ?? principalValue.principalId,
    runtimePrincipalType: principalValue.runtimePrincipalType ?? "HTTP",
    runtimePrincipalId: principalValue.runtimePrincipalId ?? "practitioner-web",
    requestId: principalValue.requestId,
    actor: principalValue.actor
  };
}

export function principalFromEveAuthContext(context: SessionAuthContext, sessionId: string): RequestPrincipal {
  const attributes = context.attributes;
  const first = (value: string | readonly string[] | undefined): string | undefined => typeof value === "string" ? value : value?.[0];
  const organizationId = first(attributes.organization_id);
  const workspaceId = first(attributes.workspace_id);
  const role = first(attributes.role);
  const betterAuthSessionId = first(attributes.better_auth_session_id);
  if (!organizationId || !workspaceId || (role !== "PRACTITIONER" && role !== "SCIENTIFIC_ADMIN")) {
    throw new PrincipalAccessError(403, "FORBIDDEN");
  }
  return principal({
    principalId: context.principalId,
    organizationId,
    workspaceId,
    role,
    sessionId: betterAuthSessionId ?? sessionId,
    runtimePrincipalType: "EVE",
    runtimePrincipalId: sessionId,
    requestId: first(attributes.request_id)
  });
}

export function principalFromEveSession(session: { readonly id: string; readonly auth: { readonly current: SessionAuthContext | null } }): RequestPrincipal {
  if (!session.auth.current) throw new PrincipalAccessError(401, "UNAUTHENTICATED");
  return principalFromEveAuthContext(session.auth.current, session.id);
}

export async function bindEveSessionForPrincipal(session: { readonly id: string; readonly auth: { readonly current: SessionAuthContext | null } }): Promise<RequestPrincipal> {
  const principalValue = principalFromEveSession(session);
  try {
    await bindEveSession({
      eveSessionId: session.id,
      organizationId: principalValue.organizationId,
      workspaceId: principalValue.workspaceId,
      principalId: principalValue.principalId,
      betterAuthSessionId: principalValue.sessionId
    });
  } catch (error) {
    if (error instanceof TenantScopeConflictError) throw new PrincipalAccessError(403, "FORBIDDEN");
    throw error;
  }
  return principalValue;
}

export function toEveAuthContext(principalValue: RequestPrincipal): SessionAuthContext {
  const role = principalValue.roles[0] ?? "PRACTITIONER";
  return {
    principalType: "user",
    principalId: principalValue.principalId,
    authenticator: "better-auth",
    subject: principalValue.principalId,
    attributes: {
      organization_id: principalValue.organizationId,
      workspace_id: principalValue.workspaceId,
      role,
      human_principal_id: principalValue.humanPrincipalId ?? principalValue.principalId,
      better_auth_session_id: principalValue.sessionId ?? "",
      request_id: principalValue.requestId ?? ""
    }
  };
}
