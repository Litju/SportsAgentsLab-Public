import pg from "pg";

const { Pool } = pg;
const adminUrl = process.env.MEF_DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error("MEF_DATABASE_ADMIN_URL is required for CI database setup");

const migrationRole = "mef_migration";
const runtimeRole = "mef_runtime";
const migrationPassword = process.env.MEF_MIGRATION_PASSWORD ?? "mef_ci_migration_password";
const runtimePassword = process.env.MEF_RUNTIME_PASSWORD ?? "mef_ci_runtime_password";

function quoteIdentifier(value) {
  return "\"" + String(value).replaceAll("\"", "\"\"") + "\"";
}

async function quotedLiteral(client, value) {
  const result = await client.query("SELECT quote_literal($1) AS literal", [value]);
  return result.rows[0].literal;
}

const pool = new Pool({ connectionString: adminUrl, max: 1 });
try {
  const client = await pool.connect();
  try {
    const databaseResult = await client.query("SELECT current_database() AS name");
    const databaseName = databaseResult.rows[0].name;
    const migrationPasswordLiteral = await quotedLiteral(client, migrationPassword);
    const runtimePasswordLiteral = await quotedLiteral(client, runtimePassword);

    for (const [role, passwordLiteral] of [[migrationRole, migrationPasswordLiteral], [runtimeRole, runtimePasswordLiteral]]) {
      const roleResult = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (roleResult.rowCount === 0) {
        await client.query(
          "CREATE ROLE " + quoteIdentifier(role) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD " + passwordLiteral
        );
      } else {
        await client.query(
          "ALTER ROLE " + quoteIdentifier(role) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD " + passwordLiteral
        );
      }
    }

    await client.query("ALTER DATABASE " + quoteIdentifier(databaseName) + " OWNER TO " + quoteIdentifier(migrationRole));
    await client.query("GRANT CONNECT ON DATABASE " + quoteIdentifier(databaseName) + " TO " + quoteIdentifier(migrationRole));
    await client.query("GRANT CONNECT ON DATABASE " + quoteIdentifier(databaseName) + " TO " + quoteIdentifier(runtimeRole));
    await client.query("GRANT USAGE, CREATE ON SCHEMA public TO " + quoteIdentifier(migrationRole));
    await client.query("REVOKE ALL ON SCHEMA public FROM " + quoteIdentifier(runtimeRole));
    await client.query("REVOKE ALL ON SCHEMA mef_auth FROM " + quoteIdentifier(runtimeRole)).catch(() => undefined);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

console.log("CI_DATABASE_PREPARE=PASS migration_role=mef_migration runtime_role=mef_runtime");
