import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedTsRoot = path.resolve(packageRoot, "..", "generated-ts", "src");

function generatedTsEntry(specifier) {
  if (specifier === "@mef/generated-ts") {
    return pathToFileURL(path.join(generatedTsRoot, "index.ts")).href;
  }
  if (specifier.startsWith("@mef/generated-ts/")) {
    return pathToFileURL(path.join(generatedTsRoot, specifier.slice("@mef/generated-ts/"))).href;
  }
  return undefined;
}

function workspaceEntry(specifier) {
  if (specifier === "@mef/operational-state") {
    return pathToFileURL(path.join(packageRoot, "src", "index.ts")).href;
  }
  if (specifier === "@mef/control-api") {
    return pathToFileURL(path.resolve(packageRoot, "..", "..", "apps", "control-api", "src", "index.ts")).href;
  }
  if (specifier === "@mef/ingestion-adk") {
    return pathToFileURL(path.resolve(packageRoot, "..", "ingestion-adk", "src", "index.ts")).href;
  }
  if (specifier === "@mef/canonical-acquisition") {
    return pathToFileURL(path.resolve(packageRoot, "..", "canonical-acquisition", "src", "index.ts")).href;
  }
  if (specifier === "@mef/acquisition-configuration") {
    return pathToFileURL(path.resolve(packageRoot, "..", "acquisition-configuration", "src", "index.ts")).href;
  }
  return undefined;
}

export async function resolve(specifier, context, defaultResolve) {
  const generatedEntry = generatedTsEntry(specifier);
  if (generatedEntry) return { url: generatedEntry, shortCircuit: true };
  const workspaceModule = workspaceEntry(specifier);
  if (workspaceModule) return { url: workspaceModule, shortCircuit: true };

  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (!specifier.endsWith(".js") || !context.parentURL?.startsWith("file:")) throw error;
    const candidate = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    try {
      await fs.access(fileURLToPath(candidate));
      return { url: candidate.href, shortCircuit: true };
    } catch {
      throw error;
    }
  }
}

export async function load(url, context, defaultLoad) {
  if (!url.endsWith(".ts")) return defaultLoad(url, context, defaultLoad);
  const source = await fs.readFile(fileURLToPath(url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      verbatimModuleSyntax: true
    },
    fileName: fileURLToPath(url)
  });
  return { format: "module", source: output.outputText, shortCircuit: true };
}
