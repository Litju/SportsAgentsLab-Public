import pg from "pg";

const { Pool } = pg;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL is required for CI runtime grants");

const pool = new Pool({ connectionString: migrationUrl, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query("REVOKE ALL ON SCHEMA public FROM mef_runtime");
    await client.query("GRANT USAGE ON SCHEMA public TO mef_runtime");
    await client.query(
      "DO $grant$\n" +
      "DECLARE table_name text;\n" +
      "BEGIN\n" +
      "  FOR table_name IN\n" +
      "    SELECT tablename FROM pg_catalog.pg_tables\n" +
      "    WHERE schemaname = 'public' AND tablename <> 'mef_schema_migrations'\n" +
      "  LOOP\n" +
      "    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO mef_runtime', table_name);\n" +
      "  END LOOP;\n" +
      "END\n" +
      "$grant$;"
    );
    await client.query("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mef_runtime");
    await client.query("REVOKE ALL ON TABLE mef_schema_migrations FROM mef_runtime");
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE mef_migration IN SCHEMA public " +
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mef_runtime"
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE mef_migration IN SCHEMA public " +
      "GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mef_runtime"
    );
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

console.log("CI_RUNTIME_GRANTS=PASS role=mef_runtime migration_history=DENIED");
