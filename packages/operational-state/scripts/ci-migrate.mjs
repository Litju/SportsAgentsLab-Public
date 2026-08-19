import { fileURLToPath } from "node:url";
import { createPostgresSqlPool, loadMigrations, applyMigrations } from "../src/index.ts";

const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.MEF_DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL or MEF_DATABASE_URL is required");

const pool = createPostgresSqlPool({ connectionString: databaseUrl });
try {
  const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const migrations = await loadMigrations(migrationDirectory);
  const requiredVersions = ["001_operational_state", "002_job_execution", "003_auth_tenancy_security", "004_ml102_source_import", "005_ml102_identity_constraint_hardening", "006_ml103_source_observation", "007_ml104_canonical_acquisition", "008_ml105_configuration_resolution"];
  if (migrations.map((migration) => migration.version).join(",") !== requiredVersions.join(",")) {
    throw new Error("unexpected operational migration set");
  }
  await applyMigrations(pool, migrations);
  console.log("CI_OPERATIONAL_MIGRATIONS=PASS versions=" + requiredVersions.join(","));
} finally {
  await pool.end();
}
