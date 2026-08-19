import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = root + "/artifacts/ci";
mkdirSync(output, { recursive: true });
const commandEnvironment = {
  ...process.env,
  ...(process.platform === "win32" && !process.env.UV_PROJECT_ENVIRONMENT
    ? { UV_PROJECT_ENVIRONMENT: root + "/.venv-ml100" }
    : {})
};

function commandParts(tool) {
  if (process.env.npm_execpath) return [process.execPath, process.env.npm_execpath, tool];
  if (process.platform === "win32") {
    return [process.execPath, (process.env.APPDATA ?? "") + "/npm/node_modules/pnpm/bin/pnpm.cjs", tool];
  }
  return ["pnpm", tool];
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(label + " did not return JSON");
  }
}

const nodeCommand = commandParts("audit");
const nodeAudit = spawnSync(
  nodeCommand[0],
  nodeCommand.slice(1).concat(["--json", "--audit-level=high"]),
  { cwd: root, encoding: "utf8", windowsHide: true, env: commandEnvironment }
);
const nodeAuditText = nodeAudit.stdout || nodeAudit.stderr || "";
writeFileSync(output + "/node-audit.json", nodeAuditText, "utf8");
let nodePayload;
try {
  nodePayload = parseJson(nodeAudit.stdout || "{}", "pnpm audit");
} catch (error) {
  throw new Error("Node vulnerability scan failed: " + error.message);
}
const nodeCounts = nodePayload.metadata?.vulnerabilities ?? {};
const nodeHighOrCritical = Number(nodeCounts.high ?? 0) + Number(nodeCounts.critical ?? 0);
if (nodeAudit.status !== 0 && nodeHighOrCritical === 0) {
  throw new Error("pnpm audit exited non-zero without a high or critical advisory count");
}

const pythonOutput = output + "/python-audit.json";
const pythonRequirements = output + "/python-requirements-audit.txt";
const pythonExport = spawnSync(
  "uv",
  [
    "export",
    "--locked",
    "--all-packages",
    "--format",
    "requirements.txt",
    "--no-emit-project",
    "--no-emit-local",
    "--output-file",
    pythonRequirements
  ],
  { cwd: root, encoding: "utf8", windowsHide: true, env: commandEnvironment }
);
if (pythonExport.status !== 0) {
  throw new Error("uv lock export failed before pip-audit");
}
const pythonCommand = [
  "run",
  "--locked",
  "--all-packages",
  "pip-audit",
  "--strict",
  "--format",
  "json",
  "--output",
  pythonOutput,
  "--requirement",
  pythonRequirements
];
const pythonAudit = spawnSync(
  "uv",
  pythonCommand,
  { cwd: root, encoding: "utf8", windowsHide: true, env: commandEnvironment }
);
if (!existsSync(pythonOutput)) writeFileSync(pythonOutput, "[]\n", "utf8");
let pythonPayload;
try {
  pythonPayload = parseJson(readFileSync(pythonOutput, "utf8"), "pip-audit");
} catch (error) {
  throw new Error("Python vulnerability scan failed: " + error.message);
}
const pythonVulnerabilities = Array.isArray(pythonPayload)
  ? pythonPayload.reduce((total, item) => total + (item.vulns?.length ?? 0), 0)
  : (pythonPayload.dependencies ?? []).reduce((total, item) => total + (item.vulns?.length ?? 0), 0);
if (pythonAudit.status !== 0 && pythonVulnerabilities === 0) {
  throw new Error("pip-audit exited non-zero without a vulnerability result");
}
if (nodeHighOrCritical > 0 || pythonVulnerabilities > 0) {
  throw new Error("VULNERABILITY_SCAN=FAIL unresolved high/critical or Python vulnerabilities found");
}

const summary = {
  scanner_policy: {
    node: "pnpm audit --audit-level=high; unresolved high and critical fail",
    python: "pip-audit lock-aware scan; any known vulnerability fails because pip-audit does not emit a portable severity field",
    paid_saas_required: false
  },
  node: { high: Number(nodeCounts.high ?? 0), critical: Number(nodeCounts.critical ?? 0), exit_code: nodeAudit.status },
  python: { vulnerability_count: pythonVulnerabilities, exit_code: pythonAudit.status },
};
writeFileSync(output + "/vulnerability-scan-summary.json", JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log("VULNERABILITY_SCAN=PASS node_high=0 node_critical=0 python_vulnerabilities=0");
