import {
  AdapterError,
  type MefSourceAdapter,
  type SourceObservation,
} from "./contracts.js";
import { createDefaultBudget, createMemorySourceReader, validateSourceObservation } from "./runtime.js";

export interface ConformanceFixture {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly expectedProbe: "exact_match" | "structural_match" | "not_recognized";
  readonly expectedInspectError?: AdapterError["code"];
}

export interface ConformanceResult {
  readonly passed: true;
  readonly checks: ReadonlyArray<string>;
}

export async function runAdapterConformance(
  adapter: MefSourceAdapter,
  fixtures: ReadonlyArray<ConformanceFixture>
): Promise<ConformanceResult> {
  const checks: string[] = [];
  if (adapter.descriptor.qualification !== "reference") throw new Error("reference conformance requires a reference-qualified adapter");
  if (adapter.descriptor.adkApiVersion !== "0.1.0") throw new Error("adapter API version is not supported");
  for (const fixture of fixtures) {
    const source = createMemorySourceReader({ sourceArtifactId: `src_${fixture.name.replace(/[^a-z0-9]+/g, "-")}`, bytes: fixture.bytes });
    const probe = await adapter.probe(source, { budget: createDefaultBudget() });
    if (probe.status !== fixture.expectedProbe) throw new Error(`${fixture.name}: unexpected probe status ${probe.status}`);
    checks.push(`${fixture.name}:probe`);
    if (fixture.expectedInspectError) {
      try {
        await adapter.inspect(source, { budget: createDefaultBudget() });
        throw new Error(`${fixture.name}: expected ${fixture.expectedInspectError}`);
      } catch (error) {
        if (!(error instanceof AdapterError) || error.code !== fixture.expectedInspectError) throw error;
      }
      checks.push(`${fixture.name}:inspect-error`);
      continue;
    }
    const first = await adapter.inspect(source, { budget: createDefaultBudget() });
    const second = await adapter.inspect(source, { budget: createDefaultBudget() });
    validateSourceObservation(first);
    validateSourceObservation(second);
    if (first.observationSha256 !== second.observationSha256 || first.schemaFingerprint !== second.schemaFingerprint) {
      throw new Error(`${fixture.name}: observation is not deterministic`);
    }
    let records = 0;
    for await (const batch of adapter.read(source, { budget: createDefaultBudget() })) records += batch.records.length;
    if (records > 1_000_000) throw new Error(`${fixture.name}: read exceeded conformance budget`);
    checks.push(`${fixture.name}:inspect-read`);
  }
  return { passed: true, checks };
}

export function runNegativeConformanceSelfTest(observation: SourceObservation): string {
  const broken = { ...observation, fields: [{ ...observation.fields[0], evidence: [] }] };
  try {
    validateSourceObservation(broken);
  } catch (error) {
    if (error instanceof AdapterError && error.code === "OBSERVATION_VALIDATION_FAILURE") return "missing-field-provenance-rejected";
    throw error;
  }
  throw new Error("negative conformance self-test accepted missing field provenance");
}
