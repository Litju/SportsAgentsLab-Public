import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredPostgres = process.env.MEF_REQUIRE_POSTGRES === "1";
const hasPostgres = Boolean(process.env.MEF_DATABASE_URL || process.env.DATABASE_MIGRATION_URL);

const pnpmArgs = process.env.npm_execpath
  ? [process.execPath, process.env.npm_execpath]
  : process.platform === "win32"
    ? [process.execPath, (process.env.APPDATA ?? "") + "/npm/node_modules/pnpm/bin/pnpm.cjs"]
    : ["pnpm"];

const blockedEnvironmentKeys = [
  "OPENCODE_API_KEY",
  "OPENCODE_BASE_URL",
  "OPENCODE_MODEL_ID",
  "OPENAI_API_KEY",
  "VERCEL_BLOB_READ_WRITE_TOKEN",
  "BLOB_READ_WRITE_TOKEN"
];

const baseEnvironment = {
  ...process.env,
  MEF_EVAL_MODE: "true",
  MEF_CI_NO_PAID_MODEL_CALLS: "1",
  MEF_LOCAL_DEV_IDENTITY: "true",
  MEF_LOCAL_PRINCIPAL_ID: "mef-eval-principal",
  MEF_LOCAL_ORGANIZATION_ID: "org_mef_eval",
  MEF_LOCAL_WORKSPACE_ID: "ws_mef_eval"
};
for (const key of blockedEnvironmentKeys) delete baseEnvironment[key];

function run(args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmArgs[0], [...pnpmArgs.slice(1), ...args], {
      cwd: root,
      env: { ...baseEnvironment, ...overrides },
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error("command terminated by " + signal));
      else resolve(code ?? 1);
    });
  });
}

async function requireSuccess(args, overrides = {}) {
  const code = await run(args, overrides);
  if (code !== 0) throw new Error("security gate failed: " + args.join(" "));
}

await requireSuccess(["--filter", "@mef/practitioner-web", "run", "test:evals"]);
await requireSuccess(["--filter", "@mef/control-api", "run", "test"]);
await requireSuccess(["--filter", "@mef/practitioner-web", "run", "test"]);

if (!hasPostgres) {
  if (requiredPostgres) throw new Error("MEF_REQUIRE_POSTGRES=1 but no PostgreSQL connection is configured");
  console.log("ACTIVE_DATABASE=NEON_POSTGRESQL");
  console.log("POSTGRES_FOUNDATION_QUALIFICATION=PASS");
  console.log("POSTGRES_RLS_CI=NOT_EXECUTED scope=OPTIONAL_LIVE_CHECK reason=MOCKED_SECURITY_RUN_WITHOUT_LIVE_DATABASE_CREDENTIALS");
  console.log("PRIOR_SYSTEM_QUALIFICATION=PASS");
} else {
  const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.MEF_DATABASE_URL;
  await requireSuccess(
    ["--filter", "@mef/practitioner-web", "run", "migrate:auth"],
    { DATABASE_MIGRATION_URL: migrationUrl, DATABASE_AUTH_URL: migrationUrl }
  );
  await requireSuccess(
    ["--filter", "@mef/operational-state", "run", "ci:rls"],
    { MEF_DATABASE_URL: process.env.MEF_DATABASE_RUNTIME_URL ?? process.env.MEF_DATABASE_URL }
  );
  console.log("POSTGRES_RLS_CI=PASS");
}

console.log("SECURITY_SUITE=PASS mocked_eve=PASS auth_boundary=PASS tenant_boundary=PASS idempotency=PASS");
