import {
  assertTenantScope,
  createPostgresSqlPool,
  OperationalStateError,
  type OperationalSecurityContext,
  type SqlPool,
  withTransaction
} from "@mef/operational-state";

export interface WorkspaceMembership extends Record<string, unknown> {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly displayName: string;
  readonly role: "PRACTITIONER" | "SCIENTIFIC_ADMIN";
}

export interface EveSessionScope extends Record<string, unknown> {
  readonly eveSessionId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly betterAuthSessionId?: string;
}

interface TenantDbState {
  pool?: SqlPool;
  memberships: Map<string, WorkspaceMembership[]>;
  eveSessions: Map<string, EveSessionScope>;
}

export class TenantScopeConflictError extends OperationalStateError {
  readonly status = 403 as const;

  constructor() {
    super("INVALID_CONFIGURATION", "principal scope is not permitted");
    this.name = "TenantScopeConflictError";
  }
}

const globalTenantDb = globalThis as typeof globalThis & { __mefTenantDb?: TenantDbState };
const state: TenantDbState = globalTenantDb.__mefTenantDb ??= { memberships: new Map(), eveSessions: new Map() };

function scopeLookupContext(organizationId: string, principalId: string): OperationalSecurityContext {
  return {
    organizationId,
    workspaceId: "scope_lookup",
    principalId,
    principalType: "USER",
    runtimePrincipalType: "HTTP",
    runtimePrincipalId: "authz",
    humanPrincipalId: principalId
  };
}

function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_RUNTIME_URL ?? env.DATABASE_URL;
}

function tenantPool(env: NodeJS.ProcessEnv = process.env): SqlPool | undefined {
  if (!runtimeDatabaseUrl(env)) return undefined;
  return state.pool ??= createPostgresSqlPool({
    connectionString: runtimeDatabaseUrl(env),
    max: 5,
    idleTimeoutMillis: 30_000
  });
}

export function getTenantDatabasePool(env: NodeJS.ProcessEnv = process.env): SqlPool | undefined {
  return tenantPool(env);
}

function membershipKey(organizationId: string, principalId: string): string {
  return `${organizationId}:${principalId}`;
}

export async function listWorkspaceMemberships(organizationId: string, principalId: string): Promise<ReadonlyArray<WorkspaceMembership>> {
  assertTenantScope({ organizationId, workspaceId: "scope_lookup" });
  const pool = tenantPool();
  if (!pool) return state.memberships.get(membershipKey(organizationId, principalId)) ?? [];
  return withTransaction(pool, async (client) => {
    const result = await client.query<WorkspaceMembership>(
      `SELECT member.organization_id AS "organizationId",
              member.workspace_id AS "workspaceId",
              workspace.workspace_slug AS "workspaceSlug",
              workspace.display_name AS "displayName",
              member.role
         FROM mef_workspace_members AS member
         JOIN mef_workspaces AS workspace
           ON workspace.organization_id = member.organization_id
          AND workspace.workspace_id = member.workspace_id
        WHERE member.organization_id = $1
          AND member.principal_id = $2
        ORDER BY member.workspace_id ASC`,
      [organizationId, principalId]
    );
    return result.rows;
  }, scopeLookupContext(organizationId, principalId));
}

export async function createSyntheticWorkspace(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly displayName: string;
  readonly principalId: string;
}): Promise<void> {
  assertTenantScope(input);
  const pool = tenantPool();
  const membership: WorkspaceMembership = {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    workspaceSlug: input.workspaceSlug,
    displayName: input.displayName,
    role: "PRACTITIONER"
  };
  if (!pool) {
    state.memberships.set(membershipKey(input.organizationId, input.principalId), [membership]);
    return;
  }
  const context: OperationalSecurityContext = {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    principalType: "USER",
    humanPrincipalId: input.principalId,
    runtimePrincipalType: "HTTP",
    runtimePrincipalId: "preview-bootstrap",
    bootstrap: true
  };
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, workspace_id) DO UPDATE
         SET workspace_slug = EXCLUDED.workspace_slug, display_name = EXCLUDED.display_name`,
      [input.organizationId, input.workspaceId, input.workspaceSlug, input.displayName, input.principalId]
    );
    await client.query(
      `INSERT INTO mef_workspace_members (organization_id, workspace_id, principal_id, role, created_by)
       VALUES ($1, $2, $3, 'PRACTITIONER', $3)
       ON CONFLICT (organization_id, workspace_id, principal_id) DO UPDATE SET role = EXCLUDED.role`,
      [input.organizationId, input.workspaceId, input.principalId]
    );
  }, context);
}

export async function getEveSessionScope(input: {
  readonly eveSessionId: string;
  readonly organizationId: string;
  readonly principalId: string;
}): Promise<EveSessionScope | undefined> {
  const pool = tenantPool();
  if (!pool) return state.eveSessions.get(input.eveSessionId);
  return withTransaction(pool, async (client) => {
    const result = await client.query<EveSessionScope>(
      `SELECT eve_session_id AS "eveSessionId",
              organization_id AS "organizationId",
              workspace_id AS "workspaceId",
              principal_id AS "principalId",
              better_auth_session_id AS "betterAuthSessionId"
         FROM mef_eve_sessions
        WHERE eve_session_id = $1
          AND organization_id = $2
          AND principal_id = $3`,
      [input.eveSessionId, input.organizationId, input.principalId]
    );
    return result.rows[0];
  }, scopeLookupContext(input.organizationId, input.principalId));
}

export async function bindEveSession(input: EveSessionScope): Promise<void> {
  assertTenantScope(input);
  const pool = tenantPool();
  if (!pool) {
    const existing = state.eveSessions.get(input.eveSessionId);
    if (existing && (existing.organizationId !== input.organizationId || existing.workspaceId !== input.workspaceId || existing.principalId !== input.principalId)) {
      throw new TenantScopeConflictError();
    }
    state.eveSessions.set(input.eveSessionId, input);
    return;
  }
  const context: OperationalSecurityContext = {
    ...input,
    principalType: "USER",
    humanPrincipalId: input.principalId,
    runtimePrincipalType: "EVE",
    runtimePrincipalId: input.eveSessionId,
    sessionId: input.betterAuthSessionId
  };
  await withTransaction(pool, async (client) => {
    const existing = await client.query<EveSessionScope>(
      `SELECT eve_session_id AS "eveSessionId", organization_id AS "organizationId", workspace_id AS "workspaceId", principal_id AS "principalId"
         FROM mef_eve_sessions WHERE eve_session_id = $1 FOR UPDATE`,
      [input.eveSessionId]
    );
    const row = existing.rows[0];
    if (row && (row.organizationId !== input.organizationId || row.workspaceId !== input.workspaceId || row.principalId !== input.principalId)) {
      throw new TenantScopeConflictError();
    }
    try {
      await client.query(
        `INSERT INTO mef_eve_sessions (eve_session_id, organization_id, workspace_id, principal_id, better_auth_session_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (eve_session_id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
        [input.eveSessionId, input.organizationId, input.workspaceId, input.principalId, input.betterAuthSessionId ?? null]
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505") {
        throw new TenantScopeConflictError();
      }
      throw error;
    }
  }, context).catch((error: unknown) => {
    if (error instanceof OperationalStateError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505") {
      throw new TenantScopeConflictError();
    }
    throw error;
  });
}
