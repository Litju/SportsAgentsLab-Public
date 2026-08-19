import { createHash } from "node:crypto";
import {
  ADK_API_VERSION,
  AdapterError,
  type AdapterDescriptor,
  type AdapterExecutionBudget,
  type AdapterResolution,
  type MefSourceAdapter,
  type ProbeContext,
  type ProbeResult,
  type SourceObservation,
  type SourceReader,
  type SourceLocator,
} from "./contracts.js";

const SHA256 = /^[0-9a-f]{64}$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "canonical values must be finite integers");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "canonical values cannot be undefined or functions");
}

export function canonicalJson(value: unknown): string {
  return canonical(value);
}

export function createDefaultBudget(overrides: Partial<AdapterExecutionBudget> = {}): AdapterExecutionBudget {
  return {
    maxProbeBytes: 64 * 1024,
    maxBytesRead: 16 * 1024 * 1024,
    maxRecords: 1_000_000,
    maxMetadataEntries: 256,
    timeoutMs: 10_000,
    ...overrides,
  };
}

export function checkBudget(
  budget: AdapterExecutionBudget,
  bytesRead: number,
  recordsRead = 0,
  metadataEntries = 0,
  startedAt = Date.now()
): void {
  if (budget.signal?.aborted) throw new AdapterError("CANCELLED", "adapter execution was cancelled");
  if (Date.now() - startedAt > budget.timeoutMs) throw new AdapterError("TIMEOUT", "adapter execution timed out");
  if (bytesRead > budget.maxBytesRead || recordsRead > budget.maxRecords || metadataEntries > budget.maxMetadataEntries) {
    throw new AdapterError("RESOURCE_LIMIT_EXCEEDED", "adapter execution budget was exceeded", {
      bytesRead,
      recordsRead,
      metadataEntries,
    });
  }
}

export async function boundedRead(
  source: SourceReader,
  offset: bigint,
  length: number,
  budget: AdapterExecutionBudget,
  startedAt = Date.now()
): Promise<Uint8Array> {
  checkBudget(budget, length, 0, 0, startedAt);
  const boundedLength = Math.min(length, budget.maxBytesRead);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([
      source.readRange(offset, boundedLength),
      new Promise<Uint8Array>((_, reject) => {
        timer = setTimeout(() => reject(new AdapterError("TIMEOUT", "source read timed out")), Math.max(1, budget.timeoutMs));
        (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
      }),
    ]);
    checkBudget(budget, bytes.byteLength, 0, 0, startedAt);
    return bytes;
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    throw new AdapterError("SOURCE_READ_FAILURE", "source range could not be read");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createMemorySourceReader(input: {
  sourceArtifactId: string;
  bytes: Uint8Array;
  contentSha256?: string;
}): SourceReader {
  const bytes = Uint8Array.from(input.bytes);
  const contentSha256 = input.contentSha256 ?? sha256Hex(bytes);
  if (!SHA256.test(contentSha256) || sha256Hex(bytes) !== contentSha256) {
    throw new AdapterError("SOURCE_READ_FAILURE", "memory source content hash does not match bytes");
  }
  return {
    sourceArtifactId: input.sourceArtifactId,
    byteLength: BigInt(bytes.byteLength),
    contentSha256,
    stream() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice());
          controller.close();
        },
      });
    },
    async readRange(offset, length) {
      if (offset < 0n || length < 0 || offset > BigInt(bytes.byteLength)) {
        throw new RangeError("source range is outside the source");
      }
      const start = Number(offset);
      const end = Math.min(bytes.byteLength, start + length);
      return bytes.slice(start, end);
    },
  };
}

export function schemaFingerprint(schema: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(schema)));
}

export function computeObservationHash(observation: SourceObservation): string {
  const { observationSha256: _ignored, adapterExecution, ...unsigned } = observation;
  return sha256Hex(
    new TextEncoder().encode(
      canonicalJson({
        ...unsigned,
        adapterExecution: { ...adapterExecution, executedAt: "" },
      })
    )
  );
}

function validateLocator(locator: SourceLocator): void {
  if (!locator || typeof locator !== "object" || typeof locator.kind !== "string" || locator.version !== "1") {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation locator is invalid");
  }
}

function rejectRawPayloadKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(raw|bytes|samples|records|signal|payload)$/i.test(key)) {
      throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observations cannot contain raw source payloads", { key });
    }
    rejectRawPayloadKeys(child);
  }
}

export function validateSourceObservation(observation: SourceObservation): void {
  if (!observation || typeof observation !== "object") {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation must be an object");
  }
  if (observation.sourceObservationVersion !== ADK_API_VERSION) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "unsupported observation contract version");
  }
  if (!/^src_[a-z0-9][a-z0-9_-]{0,127}$/.test(observation.sourceArtifactId)) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation source artifact id is invalid");
  }
  if (!SHA256.test(observation.sourceContentSha256) || !SHA256.test(observation.schemaFingerprint)) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation hashes are invalid");
  }
  if (!observation.provenance || !observation.schema || !Array.isArray(observation.fields) ||
    (
    observation.provenance.sourceArtifactId !== observation.sourceArtifactId ||
    observation.provenance.sourceContentSha256 !== observation.sourceContentSha256 ||
    !Array.isArray(observation.provenance.locators) || observation.provenance.locators.length === 0
    )) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation provenance is incomplete");
  }
  if (observation.fields.length === 0 || new Set(observation.fields.map((field) => field.sourceName)).size !== observation.fields.length) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation fields must be unique and non-empty");
  }
  for (const field of observation.fields) {
    validateLocator(field.locator);
    if (field.evidence.length === 0) throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "field provenance is missing");
    for (const evidence of field.evidence) validateLocator(evidence.locator);
  }
  if (observation.schemaFingerprint !== schemaFingerprint(observation.schema)) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "schema fingerprint is not deterministic");
  }
  rejectRawPayloadKeys(observation);
  if (computeObservationHash(observation) !== observation.observationSha256) {
    throw new AdapterError("OBSERVATION_VALIDATION_FAILURE", "observation hash is not deterministic");
  }
}

export function sourceObservationIdFor(input: {
  sourceArtifactId: string;
  adapterId: string;
  adapterVersion: string;
  adkApiVersion?: string;
}): string {
  const identity = `${input.sourceArtifactId}\n${input.adapterId}\n${input.adapterVersion}\n${input.adkApiVersion ?? ADK_API_VERSION}`;
  return `sob_${sha256Hex(new TextEncoder().encode(identity)).slice(0, 48)}`;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, MefSourceAdapter>();

  constructor(adapters: ReadonlyArray<MefSourceAdapter> = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: MefSourceAdapter): void {
    const descriptor: AdapterDescriptor = adapter.descriptor;
    if (
      !descriptor.adapterId ||
      !descriptor.adapterVersion ||
      descriptor.adkApiVersion !== ADK_API_VERSION ||
      !descriptor.capabilities.probe ||
      !descriptor.capabilities.inspect ||
      !descriptor.capabilities.read ||
      !descriptor.capabilities.streaming ||
      !descriptor.capabilities.boundedReads ||
      this.adapters.has(descriptor.adapterId)
    ) {
      throw new AdapterError("AMBIGUOUS_ADAPTER", "adapter registration failed closed");
    }
    this.adapters.set(descriptor.adapterId, adapter);
  }

  async probe(source: SourceReader, context: ProbeContext): Promise<AdapterResolution> {
    const results: ProbeResult[] = [];
    for (const adapter of this.adapters.values()) {
      const result = await adapter.probe(source, context);
      results.push(result);
    }
    const exact = results.filter((result) => result.status === "exact_match");
    const structural = results.filter((result) => result.status === "structural_match");
    if (exact.length === 1) return { status: "resolved", adapter: this.adapters.get(exact[0].adapterId), probeResults: results };
    if (exact.length > 1 || structural.length > 1) return { status: "ambiguous", probeResults: results };
    if (structural.length === 1) return { status: "resolved", adapter: this.adapters.get(structural[0].adapterId), probeResults: results };
    return { status: "not_recognized", probeResults: results };
  }
}
