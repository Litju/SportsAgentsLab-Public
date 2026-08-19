import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  AdapterError,
  AdapterRegistry,
  REFERENCE_ADAPTER,
  createDefaultBudget,
  createMemorySourceReader,
  runAdapterConformance,
  runNegativeConformanceSelfTest,
} from "../src/index.js";

const fixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../fixtures/${name}.mef`, import.meta.url)));

const hexFixture = async (name: string): Promise<Uint8Array> =>
  Uint8Array.from(Buffer.from(await readFile(new URL(`../fixtures/${name}.hex`, import.meta.url), "utf8"), "hex"));

test("reference adapter passes positive and negative conformance checks", async () => {
  const valid = await fixture("valid-current");
  const result = await runAdapterConformance(REFERENCE_ADAPTER, [
    { name: "valid-current", bytes: valid, expectedProbe: "exact_match" },
    { name: "missing-required-field", bytes: await fixture("missing-required-field"), expectedProbe: "exact_match", expectedInspectError: "MALFORMED_SOURCE" },
    { name: "unsupported-version", bytes: await fixture("unsupported-version"), expectedProbe: "structural_match", expectedInspectError: "UNSUPPORTED_SCHEMA" },
  ]);
  assert.equal(result.passed, true);
  const observation = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_reference-test", bytes: valid }),
    { budget: createDefaultBudget() }
  );
  assert.equal(runNegativeConformanceSelfTest(observation), "missing-field-provenance-rejected");
  assert.equal(observation.fields.find((field) => field.sourceName === "user_note")?.classification.status, "known");
});

test("registry fails closed and read preserves source order without exposing raw rows in observations", async () => {
  const registry = new AdapterRegistry([REFERENCE_ADAPTER]);
  const source = createMemorySourceReader({ sourceArtifactId: "src_registry-test", bytes: await fixture("large-streaming") });
  const resolution = await registry.probe(source, { budget: createDefaultBudget() });
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.adapter?.descriptor.qualification, "reference");
  const observation = await REFERENCE_ADAPTER.inspect(source, { budget: createDefaultBudget() });
  assert.equal(JSON.stringify(observation).includes("0.000"), false);
  const rows: string[] = [];
  for await (const batch of REFERENCE_ADAPTER.read(source, { budget: createDefaultBudget() })) {
    rows.push(...batch.records.map((record) => record.values.time));
  }
  assert.deepEqual(rows.slice(0, 3), ["0.000", "0.010", "0.020"]);
  assert.equal(rows.length, 10);
});

test("fixture corpus preserves unknown, conflicting, reordered, and unsupported classifications", async () => {
  const copy = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_copy", bytes: await fixture("valid-copy") }),
    { budget: createDefaultBudget() }
  );
  const diff = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_diff", bytes: await fixture("valid-diff-values") }),
    { budget: createDefaultBudget() }
  );
  assert.equal(copy.schemaFingerprint, diff.schemaFingerprint);
  const reordered = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_reordered", bytes: await fixture("reordered-columns") }),
    { budget: createDefaultBudget() }
  );
  assert.notEqual(copy.schemaFingerprint, reordered.schemaFingerprint);
  const unknown = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_unknown", bytes: await fixture("extra-unknown") }),
    { budget: createDefaultBudget() }
  );
  assert.equal(unknown.fields.find((field) => field.sourceName === "operator_note")?.unit.status, "unknown");
  const conflicting = await REFERENCE_ADAPTER.inspect(
    createMemorySourceReader({ sourceArtifactId: "src_conflicting", bytes: await fixture("conflicting-declaration") }),
    { budget: createDefaultBudget() }
  );
  assert.equal(conflicting.fields.find((field) => field.sourceName === "force_z")?.unit.status, "conflicting");
  const registry = new AdapterRegistry([
    REFERENCE_ADAPTER,
    { ...REFERENCE_ADAPTER, descriptor: { ...REFERENCE_ADAPTER.descriptor, adapterId: "mef.reference.source-v1-copy" } }
  ]);
  const ambiguous = await registry.probe(
    createMemorySourceReader({ sourceArtifactId: "src_ambiguous", bytes: await fixture("valid-copy") }),
    { budget: createDefaultBudget() }
  );
  assert.equal(ambiguous.status, "ambiguous");
});

test("invalid encoding, truncation, cancellation, and read budgets fail typed", async () => {
  const invalid = createMemorySourceReader({ sourceArtifactId: "src_invalid-encoding", bytes: await hexFixture("invalid-encoding") });
  await assert.rejects(
    REFERENCE_ADAPTER.inspect(invalid, { budget: createDefaultBudget() }),
    (error: unknown) => error instanceof AdapterError && error.code === "UNSUPPORTED_ENCODING"
  );
  const valid = await fixture("valid-current");
  const truncated = createMemorySourceReader({ sourceArtifactId: "src_truncated", bytes: valid });
  await assert.rejects(
    REFERENCE_ADAPTER.inspect(truncated, { budget: createDefaultBudget({ maxProbeBytes: 64 }) }),
    (error: unknown) => error instanceof AdapterError && error.code === "RESOURCE_LIMIT_EXCEEDED"
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    REFERENCE_ADAPTER.probe(createMemorySourceReader({ sourceArtifactId: "src_cancelled", bytes: valid }), { budget: createDefaultBudget({ signal: controller.signal }) }),
    (error: unknown) => error instanceof AdapterError && error.code === "CANCELLED"
  );
  const truncatedRow = createMemorySourceReader({ sourceArtifactId: "src_truncated-row", bytes: await fixture("truncated") });
  await REFERENCE_ADAPTER.inspect(truncatedRow, { budget: createDefaultBudget() });
  await assert.rejects(
    (async () => { for await (const _batch of REFERENCE_ADAPTER.read(truncatedRow, { budget: createDefaultBudget() })) { /* consume */ } })(),
    (error: unknown) => error instanceof AdapterError && error.code === "MALFORMED_SOURCE"
  );
});

test("negative fixture corpus fails closed with the declared error", async () => {
  const cases: ReadonlyArray<readonly [string, AdapterError["code"]]> = [
    ["missing-required-field", "MALFORMED_SOURCE"],
    ["duplicate-header", "MALFORMED_SOURCE"],
    ["wrong-delimiter", "MALFORMED_SOURCE"],
    ["malformed-metadata", "MALFORMED_SOURCE"],
    ["unsupported-version", "UNSUPPORTED_SCHEMA"]
  ];
  for (const [name, code] of cases) {
    const source = createMemorySourceReader({ sourceArtifactId: `src_${name}`, bytes: await fixture(name) });
    await assert.rejects(
      REFERENCE_ADAPTER.inspect(source, { budget: createDefaultBudget() }),
      (error: unknown) => error instanceof AdapterError && error.code === code
    );
  }
  const unknown = createMemorySourceReader({ sourceArtifactId: "src_unknown-format", bytes: new TextEncoder().encode("not-a-reference-source\n") });
  const probe = await REFERENCE_ADAPTER.probe(unknown, { budget: createDefaultBudget() });
  assert.equal(probe.status, "not_recognized");
  await assert.rejects(
    REFERENCE_ADAPTER.inspect(unknown, { budget: createDefaultBudget() }),
    (error: unknown) => error instanceof AdapterError && error.code === "NOT_RECOGNIZED"
  );
});
