import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL, DATABASE_AUTH_URL, or DATABASE_URL is required");

const here = dirname(fileURLToPath(import.meta.url));
const rawSql = await readFile(resolve(here, "../migrations/001_better_auth.sql"), "utf8");
const sql = rawSql.replaceAll("\r\n", "\n");
const manifest = JSON.parse(await readFile(resolve(here, "../migrations/manifest.json"), "utf8"));
const expected = manifest.migrations?.find((migration) => migration.version === "001_better_auth")?.sha256;
const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
if (typeof expected !== "string" || checksum !== expected) throw new Error("Better Auth migration checksum mismatch");
const pool = new Pool({ connectionString: databaseUrl, options: "-c search_path=public,pg_catalog", max: 2 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* retain the original bounded failure */ }
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
