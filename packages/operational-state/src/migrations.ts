import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "./hash.ts";
import { isOperationalStateError, mapDatabaseError, OperationalStateError } from "./errors.ts";
import { withTransaction } from "./transaction.ts";
import type { SqlClient, SqlPool } from "./sql.ts";

export interface Migration {
  readonly version: string;
  readonly fileName: string;
  readonly sql: string;
  readonly checksum: string;
  readonly trustedChecksum: string;
}

export interface AppliedMigration {
  readonly version: string;
  readonly checksum: string;
  readonly appliedAt: string;
}

const MIGRATION_HISTORY_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS mef_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);
`;

const MIGRATION_FILE_PATTERN = /^(\d{3}_[a-z0-9][a-z0-9_-]*)\.sql$/u;

function compareVersions(left: string, right: string): number {
  return left.localeCompare(right, "en-US", { numeric: true });
}

function canonicalMigrationSql(sql: string): string {
  return sql.replace(/\r\n?/gu, "\n");
}

export async function migrationFromText(
  version: string,
  fileName: string,
  sql: string,
  trustedChecksum: string
): Promise<Migration> {
  if (!/^\d{3}_[a-z0-9][a-z0-9_-]*$/u.test(version) || fileName !== `${version}.sql`) {
    throw new OperationalStateError("MIGRATION_FAILED");
  }
  const canonicalSql = canonicalMigrationSql(sql);
  const bytes = new TextEncoder().encode(canonicalSql);
  const checksum = sha256Hex(bytes);
  if (!/^[0-9a-f]{64}$/u.test(trustedChecksum)) throw new OperationalStateError("MIGRATION_FAILED");
  return { version, fileName, sql: canonicalSql, checksum, trustedChecksum };
}

export async function loadMigrations(directory: string): Promise<ReadonlyArray<Migration>> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    throw mapDatabaseError(error, "migration");
  }

  const sqlEntries = entries.filter((entry) => entry.toLowerCase().endsWith(".sql"));
  if (sqlEntries.some((entry) => !MIGRATION_FILE_PATTERN.test(entry))) {
    throw new OperationalStateError("MIGRATION_FAILED");
  }
  let manifestEntries: ReadonlyArray<{ readonly version: string; readonly fileName: string; readonly checksum: string }>;
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await readFile(join(directory, "manifest.json")))) as unknown;
    if (typeof manifest !== "object" || manifest === null || !Array.isArray((manifest as { migrations?: unknown }).migrations)) {
      throw new Error("invalid migration manifest");
    }
    manifestEntries = (manifest as { migrations: unknown[] }).migrations.map((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { version?: unknown }).version !== "string" ||
        typeof (entry as { file_name?: unknown }).file_name !== "string" ||
        typeof (entry as { sha256?: unknown }).sha256 !== "string"
      ) throw new Error("invalid migration manifest entry");
      return {
        version: (entry as { version: string }).version,
        fileName: (entry as { file_name: string }).file_name,
        checksum: (entry as { sha256: string }).sha256
      };
    });
  } catch {
    throw new OperationalStateError("MIGRATION_FAILED");
  }
  if (manifestEntries.length !== sqlEntries.length) throw new OperationalStateError("MIGRATION_FAILED");
  const manifestByFile = new Map(manifestEntries.map((entry) => [entry.fileName, entry]));
  if (manifestByFile.size !== manifestEntries.length) throw new OperationalStateError("MIGRATION_FAILED");
  const fileNames = sqlEntries.sort(compareVersions);
  const migrations: Migration[] = [];
  for (const fileName of fileNames) {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match) continue;
    let sqlBytes: Uint8Array;
    try {
      sqlBytes = await readFile(join(directory, fileName));
    } catch {
      throw new OperationalStateError("MIGRATION_FAILED");
    }
    const sql = canonicalMigrationSql(new TextDecoder().decode(sqlBytes));
    const manifestEntry = manifestByFile.get(fileName);
    if (!manifestEntry || manifestEntry.version !== match[1] || !/^[0-9a-f]{64}$/u.test(manifestEntry.checksum)) {
      throw new OperationalStateError("MIGRATION_FAILED");
    }
    const checksum = sha256Hex(new TextEncoder().encode(sql));
    if (checksum !== manifestEntry.checksum) throw new OperationalStateError("MIGRATION_FAILED");
    migrations.push({
      version: match[1],
      fileName,
      sql,
      checksum,
      trustedChecksum: manifestEntry.checksum
    });
  }
  const versions = new Set<string>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new OperationalStateError("MIGRATION_FAILED");
    versions.add(migration.version);
  }
  return migrations;
}

async function ensureMigrationHistory(client: SqlClient): Promise<void> {
  await client.query(MIGRATION_HISTORY_BOOTSTRAP);
}

function validateMigration(migration: Migration): void {
  if (!/^\d{3}_[a-z0-9][a-z0-9_-]*$/u.test(migration.version) || migration.fileName !== `${migration.version}.sql`) {
    throw new OperationalStateError("MIGRATION_FAILED");
  }
  const computedChecksum = sha256Hex(new TextEncoder().encode(migration.sql));
  if (
    !/^[0-9a-f]{64}$/u.test(migration.checksum) ||
    !/^[0-9a-f]{64}$/u.test(migration.trustedChecksum) ||
    computedChecksum !== migration.checksum ||
    migration.trustedChecksum !== migration.checksum
  ) throw new OperationalStateError("MIGRATION_FAILED");
}

async function appliedRows(client: SqlClient): Promise<ReadonlyArray<AppliedMigration>> {
  const result = await client.query<{
    version: string;
    checksum: string;
    applied_at: string | Date;
  }>("SELECT version, checksum, applied_at FROM mef_schema_migrations ORDER BY applied_sequence ASC");
  return result.rows.map((row) => ({
    version: row.version,
    checksum: row.checksum,
    appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at)
  }));
}

export async function applyMigrations(pool: SqlPool, migrations: ReadonlyArray<Migration>): Promise<void> {
  for (const migration of migrations) validateMigration(migration);
  const ordered = [...migrations].sort((left, right) => compareVersions(left.version, right.version));
  const seen = new Set<string>();
  for (const migration of ordered) {
    if (seen.has(migration.version)) throw new OperationalStateError("MIGRATION_FAILED");
    seen.add(migration.version);
  }
  if (ordered.length === 0 || !ordered[0].version.startsWith("001_")) {
    throw new OperationalStateError("MIGRATION_FAILED");
  }
  try {
    await withTransaction(pool, async (client) => {
      // Hold one transaction-scoped lock across the complete migration plan. This prevents
      // two runners with different plans from interleaving or mutating before drift is checked.
      await client.query("SELECT pg_advisory_xact_lock(2147483647)");
      await client.query("SET LOCAL search_path TO public, pg_catalog");
      await ensureMigrationHistory(client);
      const knownVersions = new Set(ordered.map((migration) => migration.version));
      const appliedBefore = await appliedRows(client);
      if (appliedBefore.some((migration) => !knownVersions.has(migration.version))) {
        throw new OperationalStateError("MIGRATION_DRIFT_DETECTED");
      }

      const appliedByVersion = new Map(appliedBefore.map((migration) => [migration.version, migration.checksum]));
      for (const migration of ordered) {
        const appliedChecksum = appliedByVersion.get(migration.version);
        if (appliedChecksum !== undefined && appliedChecksum !== migration.checksum) {
          throw new OperationalStateError("MIGRATION_DRIFT_DETECTED");
        }
      }

      for (const migration of ordered) {
        if (appliedByVersion.has(migration.version)) continue;

        await client.query(migration.sql);
        await client.query(
          "INSERT INTO mef_schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum]
        );
      }

      const appliedAfter = await appliedRows(client);
      if (
        appliedAfter.some((migration) => !knownVersions.has(migration.version)) ||
        appliedAfter.length !== ordered.length
      ) throw new OperationalStateError("MIGRATION_DRIFT_DETECTED");
    });
  } catch (error) {
    if (isOperationalStateError(error) && error.transactionOutcome === "UNKNOWN") {
      throw new OperationalStateError("MIGRATION_FAILED", undefined, {
        retryable: error.retryable,
        transactionOutcome: "UNKNOWN"
      });
    }
    if (isOperationalStateError(error) && (error.code === "MIGRATION_DRIFT_DETECTED" || error.code === "MIGRATION_FAILED")) {
      throw error;
    }
    if (isOperationalStateError(error) && error.code === "DATABASE_UNAVAILABLE") throw error;
    throw new OperationalStateError("MIGRATION_FAILED");
  }
}

export async function migrationStatus(pool: SqlPool): Promise<ReadonlyArray<AppliedMigration>> {
  try {
    return await executeMigrationRead(pool);
  } catch (error) {
    if (isOperationalStateError(error)) throw error;
    throw mapDatabaseError(error, "migration");
  }
}

async function executeMigrationRead(pool: SqlPool): Promise<ReadonlyArray<AppliedMigration>> {
  let client: SqlClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw mapDatabaseError(error, "connect");
  }
  try {
    try {
      return await appliedRows(client);
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as Record<string, unknown>).code === "42P01") {
        return [];
      }
      throw error;
    }
  } finally {
    client.release?.();
  }
}
