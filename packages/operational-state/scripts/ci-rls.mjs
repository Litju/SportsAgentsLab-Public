import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.MEF_DATABASE_URL;
if (!migrationUrl || !runtimeUrl) {
  throw new Error("DATABASE_MIGRATION_URL and MEF_DATABASE_URL are required for PostgreSQL RLS qualification");
}

const migrationPool = new Pool({ connectionString: migrationUrl, max: 1 });
const runtimePool = new Pool({ connectionString: runtimeUrl, max: 1 });

async function setSecurityContext(client, organizationId, workspaceId, principalId, bootstrap = false) {
  await client.query("SELECT set_config($1, $2, true)", ["mef.organization_id", organizationId]);
  await client.query("SELECT set_config($1, $2, true)", ["mef.workspace_id", workspaceId]);
  await client.query("SELECT set_config($1, $2, true)", ["mef.principal_id", principalId]);
  await client.query("SELECT set_config($1, $2, true)", ["mef.bootstrap", bootstrap ? "true" : "false"]);
}

try {
  const migrationClient = await migrationPool.connect();
  try {
    await migrationClient.query("BEGIN");
    await setSecurityContext(migrationClient, "org_ci_a", "ws_ci_a", "principal_ci_a", true);
    await migrationClient.query(
      "INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by) " +
      "VALUES ('org_ci_a', 'ws_ci_a', 'ci-a', 'Synthetic CI tenant A', 'principal_ci_a') " +
      "ON CONFLICT (organization_id, workspace_id) DO NOTHING"
    );
    await migrationClient.query(
      "INSERT INTO mef_workspace_members (organization_id, workspace_id, principal_id, role, created_by) " +
      "VALUES ('org_ci_a', 'ws_ci_a', 'principal_ci_a', 'PRACTITIONER', 'principal_ci_a') " +
      "ON CONFLICT (organization_id, workspace_id, principal_id) DO NOTHING"
    );
    await setSecurityContext(migrationClient, "org_ci_b", "ws_ci_b", "principal_ci_b", true);
    await migrationClient.query(
      "INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by) " +
      "VALUES ('org_ci_b', 'ws_ci_b', 'ci-b', 'Synthetic CI tenant B', 'principal_ci_b') " +
      "ON CONFLICT (organization_id, workspace_id) DO NOTHING"
    );
    await migrationClient.query(
      "INSERT INTO mef_workspace_members (organization_id, workspace_id, principal_id, role, created_by) " +
      "VALUES ('org_ci_b', 'ws_ci_b', 'principal_ci_b', 'PRACTITIONER', 'principal_ci_b') " +
      "ON CONFLICT (organization_id, workspace_id, principal_id) DO NOTHING"
    );
    await migrationClient.query("COMMIT");
  } catch (error) {
    try { await migrationClient.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    migrationClient.release();
  }

  const runtimeClient = await runtimePool.connect();
  try {
    const roleResult = await runtimeClient.query(
      "SELECT current_user, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls " +
      "FROM pg_roles WHERE rolname = current_user"
    );
    assert.equal(roleResult.rowCount, 1);
    const role = roleResult.rows[0];
    assert.equal(role.current_user, "mef_runtime");
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolbypassrls, false);

    const rlsResult = await runtimeClient.query(
      "SELECT c.relname, c.relforcerowsecurity " +
      "FROM pg_catalog.pg_class AS c " +
      "JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])",
      [["mef_workspaces", "mef_workspace_members", "mef_eve_sessions", "mef_commands"]]
    );
    assert.equal(rlsResult.rowCount, 4);
    for (const row of rlsResult.rows) assert.equal(row.relforcerowsecurity, true, row.relname + " must force RLS");

    await runtimeClient.query("BEGIN");
    try {
      await setSecurityContext(runtimeClient, "org_ci_a", "ws_ci_a", "principal_ci_a");
      const visibleWorkspaces = await runtimeClient.query("SELECT workspace_id FROM mef_workspaces ORDER BY workspace_id");
      assert.deepEqual(visibleWorkspaces.rows.map((row) => row.workspace_id), ["ws_ci_a"]);
      const hiddenTenant = await runtimeClient.query(
        "SELECT workspace_id FROM mef_workspaces WHERE organization_id = $1",
        ["org_ci_b"]
      );
      assert.equal(hiddenTenant.rowCount, 0);
      const visibleMembers = await runtimeClient.query("SELECT principal_id FROM mef_workspace_members ORDER BY principal_id");
      assert.deepEqual(visibleMembers.rows.map((row) => row.principal_id), ["principal_ci_a"]);
      await runtimeClient.query("COMMIT");
    } catch (error) {
      try { await runtimeClient.query("ROLLBACK"); } catch {}
      throw error;
    }

    await runtimeClient.query("BEGIN");
    try {
      await setSecurityContext(runtimeClient, "org_ci_a", "ws_ci_a", "principal_ci_a");
      await assert.rejects(
        runtimeClient.query(
          "INSERT INTO mef_workspaces (organization_id, workspace_id, workspace_slug, display_name, created_by) " +
          "VALUES ('org_ci_b', 'ws_ci_bypass', 'ci-bypass', 'Synthetic cross-tenant write', 'principal_ci_a')"
        )
      );
      await runtimeClient.query("ROLLBACK");
    } catch (error) {
      try { await runtimeClient.query("ROLLBACK"); } catch {}
      throw error;
    }
  } finally {
    runtimeClient.release();
  }
} finally {
  await Promise.all([migrationPool.end(), runtimePool.end()]);
}

console.log("POSTGRES_RLS_CI=PASS cross_tenant=PASS principal_boundary=PASS force_rls=PASS synthetic_only=YES");
