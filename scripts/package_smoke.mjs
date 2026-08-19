import fs from "node:fs";
import path from "node:path";

const packageRoot = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
if (
  !packageJson.name ||
  !Array.isArray(packageJson.mefSmokePaths) ||
  packageJson.mefSmokePaths.length === 0
) {
  throw new Error("package metadata is missing smoke-test identity");
}
for (const relativePath of packageJson.mefSmokePaths) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error("package smoke paths must be relative strings");
  }
  const resolved = path.resolve(packageRoot, relativePath);
  const relativeToRoot = path.relative(packageRoot, resolved);
  if (
    relativeToRoot.startsWith(".." + path.sep) ||
    path.isAbsolute(relativeToRoot) ||
    !fs.existsSync(resolved) ||
    !fs.statSync(resolved).isFile()
  ) {
    throw new Error("missing package smoke path: " + relativePath);
  }
}
console.log("PACKAGE_SMOKE=" + packageJson.name + ":PASS");
