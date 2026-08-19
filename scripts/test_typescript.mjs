import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const positivePath = path.join(root, "fixtures", "contracts", "positive-entities.json");
const negativePath = path.join(root, "fixtures", "contracts", "negative-cases.json");
const positive = JSON.parse(fs.readFileSync(positivePath, "utf8"));
const negative = JSON.parse(fs.readFileSync(negativePath, "utf8"));
const domainSource = fs.readFileSync(
  path.join(root, "packages", "generated-ts", "src", "models", "domain.ts"),
  "utf8",
);
const runtimeSource = fs.readFileSync(
  path.join(root, "packages", "generated-ts", "src", "runtime.ts"),
  "utf8",
);
if (!domainSource.includes('__brand: "SourceArtifactId"')) {
  throw new Error("generated TypeScript nominal identifier brand is missing");
}
if (/:\s*any\b|\bas\s+any\b|<any>/.test(domainSource + runtimeSource)) {
  throw new Error("generated TypeScript contains an implicit any escape hatch");
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mef-ts-contracts-"));
const modelsDirectory = path.join(temporaryDirectory, "models");
fs.mkdirSync(modelsDirectory, { recursive: true });
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  verbatimModuleSyntax: true,
};
const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions,
  fileName,
  reportDiagnostics: true,
}).outputText;
fs.writeFileSync(path.join(modelsDirectory, "domain.js"), transpile(domainSource, "domain.ts"));
fs.writeFileSync(path.join(temporaryDirectory, "runtime.js"), transpile(runtimeSource, "runtime.ts"));

const runtime = await import(pathToFileURL(path.join(temporaryDirectory, "runtime.js")).href);
for (const [entityType, document] of Object.entries(positive)) {
  const result = runtime.validateEntity(document, entityType);
  if (!result.valid) {
    throw new Error(`${entityType} rejected by TypeScript runtime: ${JSON.stringify(result.errors)}`);
  }
  const parsed = runtime.parseEntity(document);
  if (runtime.canonicalJson(parsed) !== runtime.canonicalJson(document)) {
    throw new Error(`${entityType} TypeScript canonical round-trip changed semantics`);
  }
}

const pythonCanonicalScript = `
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "packages" / "generated-python" / "src"))
from mef_generated_models import canonical_json
document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(json.dumps({name: canonical_json(value) for name, value in document.items()}, sort_keys=True))
`;
const pythonCanonical = JSON.parse(
  execFileSync("python", ["-c", pythonCanonicalScript, positivePath], {
    cwd: root,
    encoding: "utf8",
  }),
);
const typescriptCanonical = Object.fromEntries(
  Object.entries(positive).map(([name, document]) => [name, runtime.canonicalJson(document)]),
);
for (const name of Object.keys(positive).sort()) {
  if (typescriptCanonical[name] !== pythonCanonical[name]) {
    throw new Error(`TypeScript/Python canonical serialization changed ${name}`);
  }
}

const pathTokens = (value) => value.match(/[^.\[\]]+|\[\d+\]/g) ?? [];
const applyMutation = (document, testCase) => {
  const mutated = structuredClone(document);
  const applyChange = (change) => {
    const tokens = pathTokens(change.path).map((token) =>
      token.startsWith("[") ? Number(token.slice(1, -1)) : token,
    );
    const key = tokens.pop();
    let parent = mutated;
    for (const token of tokens) parent = parent[token];
    parent[key] = change.value;
  };
  if (testCase.operation === "replace_many") {
    for (const change of testCase.changes ?? []) {
      applyChange(change);
    }
  } else if (testCase.operation === "replace" || testCase.operation === "add") {
    applyChange(testCase);
  } else if (testCase.operation === "delete") {
    const tokens = pathTokens(testCase.path).map((token) =>
      token.startsWith("[") ? Number(token.slice(1, -1)) : token,
    );
    const key = tokens.pop();
    let parent = mutated;
    for (const token of tokens) parent = parent[token];
    delete parent[key];
  } else {
    throw new Error(`unsupported mutation operation: ${testCase.operation}`);
  }
  return mutated;
};
for (const testCase of negative) {
  const entityType = testCase.base_entity;
  const mutated = applyMutation(positive[entityType], testCase);
  const result = runtime.validateEntity(mutated, entityType);
  if (result.valid) {
    throw new Error(`TypeScript runtime accepted negative fixture: ${testCase.name}`);
  }
  const codes = result.errors.map((error) => error.code);
  if (!codes.includes(testCase.expected_code)) {
    throw new Error(
      `TypeScript negative fixture ${testCase.name} reported ${JSON.stringify(codes)}`,
    );
  }
}

const unknownState = structuredClone(positive.CanonicalAcquisition);
unknownState.preprocessing = {
  state: "UNKNOWN",
  reason: "Fixture unknown state",
  evidence_references: [],
};
if (!runtime.validateEntity(unknownState, "CanonicalAcquisition").valid) {
  throw new Error("TypeScript runtime rejected an explicit UNKNOWN semantic state");
}
console.log("TYPESCRIPT_RUNTIME_VALIDATION=PASS");
console.log("TYPESCRIPT_ROUNDTRIP=PASS");
console.log("TYPESCRIPT_NEGATIVE_FIXTURES=PASS");
console.log("CROSS_LANGUAGE_SEMANTICS=PASS");
console.log("TYPESCRIPT_UNKNOWN_STATE=PASS");
