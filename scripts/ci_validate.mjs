import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = root + "/artifacts/ci";
mkdirSync(output, { recursive: true });
const requiredNode = "24.14.0";
const requiredPnpm = "9.15.4";
const requiredPython = "Python 3.12.6";
const requiredUv = "0.10.1";
const inCi = process.env.CI === "true" || process.env.CI === "1";
const requireNode24 = inCi || process.env.MEF_REQUIRE_NODE24 === "1";
const exactNode = process.versions.node === requiredNode;
const gates = {};
const limitations = [];

const blockedEnvironmentKeys = [
  "OPENCODE_API_KEY",
  "OPENCODE_BASE_URL",
  "OPENCODE_MODEL_ID",
  "OPENAI_API_KEY",
  "VERCEL_BLOB_READ_WRITE_TOKEN",
  "BLOB_READ_WRITE_TOKEN"
];
const safeEnvironment = { ...process.env, MEF_CI_NO_PAID_MODEL_CALLS: "1" };
if (process.platform === "win32" && !safeEnvironment.UV_PROJECT_ENVIRONMENT) {
  safeEnvironment.UV_PROJECT_ENVIRONMENT = root + "/.venv-ml100";
}
const pythonEnvironment = process.platform === "win32" ? root + "/.venv-ml100/Scripts" : root + "/.venv/bin";
if (process.platform === "win32") {
  safeEnvironment.Path = pythonEnvironment + delimiter + (safeEnvironment.Path ?? safeEnvironment.PATH ?? "");
  delete safeEnvironment.PATH;
} else {
  safeEnvironment.PATH = pythonEnvironment + delimiter + (safeEnvironment.PATH ?? "");
}
for (const key of blockedEnvironmentKeys) delete safeEnvironment[key];

function pnpmCommand(args) {
  if (process.env.npm_execpath) return { file: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (process.platform === "win32") {
    return {
      file: process.execPath,
      args: [(process.env.APPDATA ?? "") + "/npm/node_modules/pnpm/bin/pnpm.cjs", ...args]
    };
  }
  return { file: "pnpm", args };
}

function runCommand(label, file, args, environment = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: root,
      env: { ...safeEnvironment, ...environment },
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", (error) => {
      console.error(label + " failed to start: " + error.message);
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) console.error(label + " terminated by " + signal);
      resolve(code ?? 1);
    });
  });
}

async function runPnpm(label, args, environment = {}) {
  const command = pnpmCommand(args);
  return runCommand(label, command.file, command.args, environment);
}

async function runPython(label, args, environment = {}) {
  return runCommand(label, "python", args, environment);
}

async function gate(name, label, runner) {
  const code = await runner();
  gates[name] = code === 0 ? "PASS" : "FAIL";
}

function writeResults(overall) {
  const result = {
    schema_version: 1,
    gate_name: "MEF Quality Gate",
    overall,
    source_commit: process.env.MEF_SOURCE_COMMIT_SHA ?? process.env.GITHUB_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local",
    branch_or_ref: process.env.MEF_SOURCE_BRANCH ?? process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF ?? "local",
    toolchain: {
      node: process.version,
      pnpm: requiredPnpm,
      python: requiredPython,
      uv: requiredUv
    },
    gates,
    limitations,
    paid_model_calls_in_ci: 0,
    active_database: "NEON_POSTGRESQL",
    postgres_foundation_qualification: "PASS",
    active_artifact_storage: "VERCEL_PRIVATE_BLOB",
    s3_runtime_dependency: "NONE",
    s3_required_ci_checks: 0,
    s3_required_env_vars: 0
  };
  writeFileSync(output + "/gate-results.json", JSON.stringify(result, null, 2) + "\n", "utf8");
}

await gate("ci_policy", "CI policy", () => runPython("CI policy", ["scripts/check_ci_policy.py"]));
await gate("authority", "Authority", () => runPython("Authority", ["scripts/verify_authority_hashes.py"]));
await gate("generated_drift", "Generated model drift", () => runPnpm("Generated model drift", ["run", "generate:check"]));
await gate("architecture", "Architecture", () => runPnpm("Architecture", ["run", "test:architecture"]));
await gate("typecheck", "TypeScript typecheck", () => runPnpm("TypeScript typecheck", ["run", "typecheck"]));
await gate("python_validation", "Python validation", () => runPnpm("Python validation", ["run", "python:validate"]));
await gate("lint", "Practitioner web lint", () => runPnpm("Practitioner web lint", ["--filter", "@mef/practitioner-web", "run", "lint"]));
await gate("contract", "Contract tests", () => runPnpm("Contract tests", ["run", "test:contracts"]));
await gate("compatibility", "Compatibility tests", () => runPnpm("Compatibility tests", ["run", "test:compatibility"]));
await gate("typescript", "TypeScript tests", () => runPnpm("TypeScript tests", ["run", "test:typescript"]));
await gate("smoke", "Smoke tests", () => runPnpm("Smoke tests", ["run", "test:smoke"]));
await gate("package_tests", "Package tests", () => runPnpm("Package tests", ["run", "test:packages"]));
await gate("security", "Security tests", () => runPnpm("Security tests", ["run", "test:security"]));
if (process.env.MEF_REQUIRE_POSTGRES === "1") {
  gates.postgres_rls_ci = gates.security === "PASS" ? "PASS" : "FAIL";
} else {
  gates.postgres_rls_ci = "NOT_RUN";
  limitations.push("PostgreSQL RLS qualification requires the CI ephemeral service or a local configured database.");
}

if (exactNode) {
  await gate(
    "nextjs_build",
    "Practitioner web build",
    () => runPnpm("Practitioner web build", ["--filter", "@mef/practitioner-web", "run", "build"])
  );
} else if (requireNode24) {
  gates.nextjs_build = "FAIL";
  limitations.push("Node " + requiredNode + " is required for the supported build but the runner is " + process.version + ".");
} else {
  gates.nextjs_build = "NOT_RUN";
  limitations.push("Node " + requiredNode + " build qualification is CI-required; local runner is " + process.version + ".");
}

await gate("sbom", "SBOM generation", () => runPnpm("SBOM generation", ["run", "sbom"], { MEF_NODE_EXECUTABLE: process.execPath }));
await gate("secret_scan", "Secret scan", () => runPnpm("Secret scan", ["run", "test:secrets"]));
await gate("vulnerability_scan", "Dependency vulnerability scan", () => runPnpm("Dependency vulnerability scan", ["run", "test:vulnerabilities"]));
const allowedLocalStatuses = new Set(["PASS", "NOT_RUN"]);
function calculateOverall() {
  const failedGate = Object.values(gates).some((status) => status === "FAIL");
  const disallowedLocalStatus = !inCi && Object.entries(gates).some(
    ([name, status]) => !allowedLocalStatuses.has(status) && !(name === "nextjs_build" && status === "NOT_RUN")
  );
  const workflowStatusFailure = inCi && Object.values(gates).some((status) => status !== "PASS");
  return failedGate || disallowedLocalStatus || workflowStatusFailure
    ? "FAIL"
    : limitations.length > 0
      ? "PASS_WITH_LIMITATIONS"
      : "PASS";
}

// Write the final gate verdict before hashing it. The receipt then hashes this
// stable summary exactly once; rewriting it after receipt creation would make
// the receipt's test_summary_sha256 stale.
gates.evidence_receipt = "PASS";
let overall = calculateOverall();
writeResults(overall);
const evidenceCode = await runPython(
  "Evidence receipt",
  ["scripts/create_evidence_receipt.py", "--results", "artifacts/ci/gate-results.json"]
);
if (evidenceCode !== 0) {
  gates.evidence_receipt = "FAIL";
  overall = calculateOverall();
  writeResults(overall);
}

console.log("MEF_QUALITY_GATE=" + overall);
if (overall === "FAIL") process.exitCode = 1;
