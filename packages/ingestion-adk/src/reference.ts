import {
  ADK_API_VERSION,
  AdapterError,
  type AdapterExecutionBudget,
  type DeclaredValue,
  type MefSourceAdapter,
  type ObservedField,
  type ObservedMetadata,
  type ObservedRecord,
  type ObservedRecordBatch,
  type ObservedSchema,
  type ProbeResult,
  type SourceEvidence,
  type SourceReader,
} from "./contracts.js";
import {
  boundedRead,
  checkBudget,
  computeObservationHash,
  schemaFingerprint,
  validateSourceObservation,
} from "./runtime.js";

const MARKER = "MEF_REFERENCE_SOURCE_V1";
const PRODUCER = "SportsAgentsLab.synthetic";
const FORMAT = "MEF_REFERENCE_SOURCE_V1";
const REQUIRED_COLUMNS = new Set(["time", "force_z"]);
const DECLARATION_NAMES = new Set(["classification", "quantity", "unit", "axis", "plate"]);

interface MetadataLine {
  readonly key: string;
  readonly value: string;
  readonly line: number;
  readonly occurrence: number;
}

interface ParsedHeader {
  readonly schemaVersion: string;
  readonly producer: string;
  readonly format: string;
  readonly encoding: string;
  readonly delimiter: string;
  readonly metadata: ReadonlyArray<MetadataLine>;
  readonly columns: ReadonlyArray<string>;
  readonly headerRow: number;
  readonly dataLine: number;
}

function utf8(bytes: Uint8Array, fatal: boolean): string {
  try {
    return new TextDecoder("utf-8", { fatal }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new AdapterError("UNSUPPORTED_ENCODING", "reference source is not valid UTF-8");
  }
}

function metadataMap(lines: ReadonlyArray<MetadataLine>): Map<string, MetadataLine[]> {
  const map = new Map<string, MetadataLine[]>();
  for (const line of lines) map.set(line.key, [...(map.get(line.key) ?? []), line]);
  return map;
}

function valueFor(map: Map<string, MetadataLine[]>, key: string): string | undefined {
  return map.get(key)?.[0]?.value;
}

function splitRow(row: string, delimiter: string): string[] {
  return row.split(delimiter);
}

function parseHeader(text: string, maxMetadataEntries: number): ParsedHeader {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== MARKER) throw new AdapterError("NOT_RECOGNIZED", "reference marker was not found");
  const metadata: MetadataLine[] = [];
  let columnsLine = -1;
  let occurrence = new Map<string, number>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "columns:") {
      columnsLine = index;
      break;
    }
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new AdapterError("MALFORMED_SOURCE", `malformed metadata at line ${index + 1}`);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const nextOccurrence = (occurrence.get(key) ?? 0) + 1;
    occurrence.set(key, nextOccurrence);
    metadata.push({ key, value, line: index + 1, occurrence: nextOccurrence });
    if (metadata.length > maxMetadataEntries) {
      throw new AdapterError("RESOURCE_LIMIT_EXCEEDED", "reference metadata budget was exceeded");
    }
  }
  if (columnsLine < 0 || columnsLine + 1 >= lines.length) throw new AdapterError("MALFORMED_SOURCE", "reference columns are missing");
  const metadataByKey = metadataMap(metadata);
  const schemaVersion = valueFor(metadataByKey, "schema_version");
  const producer = valueFor(metadataByKey, "producer");
  const format = valueFor(metadataByKey, "format");
  const encoding = valueFor(metadataByKey, "encoding");
  const delimiter = valueFor(metadataByKey, "delimiter");
  if (!schemaVersion || !producer || !format || !encoding || !delimiter) {
    throw new AdapterError("MALFORMED_SOURCE", "reference metadata is incomplete");
  }
  if (schemaVersion !== "1" || producer !== PRODUCER || format !== "delimited") {
    throw new AdapterError("UNSUPPORTED_SCHEMA", "reference schema or producer is unsupported");
  }
  if (encoding.toLowerCase() !== "utf-8") throw new AdapterError("UNSUPPORTED_ENCODING", "reference encoding is unsupported");
  if (![",", ";", "\t"].includes(delimiter)) throw new AdapterError("UNSUPPORTED_SCHEMA", "reference delimiter is unsupported");
  const columns = splitRow(lines[columnsLine + 1], delimiter).map((column) => column.trim());
  if (columns.length === 0 || columns.some((column) => !column)) throw new AdapterError("MALFORMED_SOURCE", "reference columns are empty");
  if (new Set(columns).size !== columns.length) throw new AdapterError("MALFORMED_SOURCE", "reference columns are duplicated");
  const dataLine = lines.findIndex((line, index) => index > columnsLine + 1 && line === "data:");
  if (dataLine < 0) throw new AdapterError("MALFORMED_SOURCE", "reference data section is missing");
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) throw new AdapterError("MALFORMED_SOURCE", `required reference column is missing: ${required}`);
  }
  return {
    schemaVersion,
    producer,
    format,
    encoding: "utf-8",
    delimiter,
    metadata,
    columns,
    headerRow: columnsLine + 2,
    dataLine: dataLine + 1,
  };
}

function evidenceFor(line: MetadataLine, statement: string): SourceEvidence {
  return {
    locator: { kind: "metadata_entry", version: "1", line: line.line, key: line.key, occurrence: line.occurrence },
    statement,
  };
}

function declaration(values: ReadonlyArray<MetadataLine>, fallback: SourceEvidence): DeclaredValue {
  if (values.length === 0) return { status: "unknown", evidence: [fallback] };
  const distinct = [...new Set(values.map((value) => value.value))];
  const evidence = values.map((value) => evidenceFor(value, `${value.key}=${value.value}`));
  if (distinct.length > 1) return { status: "conflicting", values: distinct, evidence };
  return { status: "known", value: distinct[0], evidence };
}

function inspectObservation(source: SourceReader, header: ParsedHeader): ReturnType<typeof makeObservation> {
  const byKey = metadataMap(header.metadata);
  const schema: ObservedSchema = {
    schemaVersion: header.schemaVersion,
    containerType: "delimited",
    encoding: header.encoding,
    delimiter: header.delimiter,
    headerRowCount: 1,
    orderedColumns: header.columns,
    metadataKeys: [...new Set(header.metadata.map((entry) => entry.key))],
  };
  const fallbackEvidence = (column: string, index: number): SourceEvidence => ({
    locator: { kind: "delimited_column", version: "1", headerRow: header.headerRow, columnIndex: index, columnName: column },
    statement: `column ${column} is present in the declared header`,
  });
  const fields: ObservedField[] = header.columns.map((column, index) => {
    const fallback = fallbackEvidence(column, index);
    const declarations = (attribute: string): MetadataLine[] => byKey.get(`field.${column}.${attribute}`) ?? [];
    const evidence = [
      fallback,
      ...[...DECLARATION_NAMES].flatMap((attribute) => declarations(attribute).map((line) => evidenceFor(line, `${line.key}=${line.value}`))),
    ];
    return {
      sourceName: column,
      locator: fallback.locator,
      classification: declaration(declarations("classification"), fallback),
      quantity: declaration(declarations("quantity"), fallback),
      unit: declaration(declarations("unit"), fallback),
      axis: declaration(declarations("axis"), fallback),
      plate: declaration(declarations("plate"), fallback),
      evidence,
    };
  });
  const metadata: ObservedMetadata[] = header.metadata
    .filter((entry) => !entry.key.startsWith("field."))
    .map((entry) => ({
      key: entry.key,
      declaration: declaration(byKey.get(entry.key) ?? [], evidenceFor(entry, `${entry.key} is declared`)),
    }))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.key === entry.key) === index);
  return makeObservation(source, header, schema, fields, metadata);
}

function makeObservation(
  source: SourceReader,
  header: ParsedHeader,
  schema: ObservedSchema,
  fields: ReadonlyArray<ObservedField>,
  metadata: ReadonlyArray<ObservedMetadata>
) {
  const observation = {
    sourceObservationVersion: ADK_API_VERSION,
    sourceArtifactId: source.sourceArtifactId,
    sourceContentSha256: source.contentSha256,
    adapterExecution: {
      adapterId: REFERENCE_ADAPTER.descriptor.adapterId,
      adapterVersion: REFERENCE_ADAPTER.descriptor.adapterVersion,
      adkApiVersion: ADK_API_VERSION,
      qualification: "reference" as const,
      executedAt: new Date().toISOString(),
    },
    schema,
    schemaFingerprint: schemaFingerprint(schema),
    fields,
    metadata,
    warnings: [],
    provenance: {
      sourceArtifactId: source.sourceArtifactId,
      sourceContentSha256: source.contentSha256,
      locators: fields.flatMap((field) => field.evidence.map((evidence) => evidence.locator)),
    },
    observationSha256: "",
  };
  const complete = { ...observation, observationSha256: "" };
  const hashed = { ...complete, observationSha256: computeObservationHash(complete) };
  validateSourceObservation(hashed);
  return hashed;
}

async function prefixText(source: SourceReader, maxBytes: number, budget: { maxBytesRead: number; timeoutMs: number; signal?: AbortSignal }, fatal = false): Promise<string> {
  const length = Math.min(Number(source.byteLength), maxBytes, budget.maxBytesRead);
  const bytes = await boundedRead(source, 0n, length, {
    maxProbeBytes: maxBytes,
    maxBytesRead: budget.maxBytesRead,
    maxRecords: Number.MAX_SAFE_INTEGER,
    maxMetadataEntries: Number.MAX_SAFE_INTEGER,
    timeoutMs: budget.timeoutMs,
    signal: budget.signal,
  });
  return utf8(bytes, fatal);
}

async function inspect(source: SourceReader, maxProbeBytes: number, budget: AdapterExecutionBudget) {
  const text = await prefixText(source, maxProbeBytes, budget, true);
  if (source.byteLength > BigInt(new TextEncoder().encode(text).byteLength) && !text.includes("data:")) {
    throw new AdapterError("RESOURCE_LIMIT_EXCEEDED", "reference header exceeds inspection budget");
  }
  const header = parseHeader(text, budget.maxMetadataEntries);
  return inspectObservation(source, header);
}

async function* read(source: SourceReader, context: { budget: AdapterExecutionBudget }): AsyncIterable<ObservedRecordBatch> {
  const reader = source.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const startedAt = Date.now();
  let pending = "";
  let bytesRead = 0;
  let recordsRead = 0;
  let lineNumber = 0;
  const headerLines: string[] = [];
  let header: ParsedHeader | undefined;
  let inData = false;
  let schemaHash = "";
  let batch: ObservedRecord[] = [];
  const consume = (line: string): ObservedRecordBatch | undefined => {
    lineNumber += 1;
    if (!inData) {
      headerLines.push(line);
      if (line !== "data:") return undefined;
      header = parseHeader(headerLines.join("\n"), context.budget.maxMetadataEntries);
      schemaHash = schemaFingerprint({
        schemaVersion: header.schemaVersion,
        containerType: "delimited",
        encoding: header.encoding,
        delimiter: header.delimiter,
        headerRowCount: 1,
        orderedColumns: header.columns,
        metadataKeys: [...new Set(header.metadata.map((entry) => entry.key))],
      });
      inData = true;
      return undefined;
    }
    if (!line.trim()) return undefined;
    if (!header) throw new AdapterError("MALFORMED_SOURCE", "reference header is incomplete");
    const values = splitRow(line, header.delimiter);
    if (values.length !== header.columns.length) throw new AdapterError("MALFORMED_SOURCE", `row ${lineNumber} has the wrong number of columns`);
    const record: ObservedRecord = {
      sourceRecordIndex: BigInt(recordsRead),
      values: Object.fromEntries(header.columns.map((column, index) => [column, values[index]])),
    };
    recordsRead += 1;
    checkBudget(context.budget, bytesRead, recordsRead, header.metadata.length, startedAt);
    batch.push(record);
    if (batch.length >= 128) {
      const output = { schemaFingerprint: schemaHash, startRecordIndex: batch[0].sourceRecordIndex, records: batch };
      batch = [];
      return output;
    }
    return undefined;
  };
  while (true) {
    const chunk = await reader.read().catch(() => { throw new AdapterError("SOURCE_READ_FAILURE", "reference source stream failed"); });
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    checkBudget(context.budget, bytesRead, recordsRead, 0, startedAt);
    try {
      pending += decoder.decode(chunk.value, { stream: true });
    } catch {
      throw new AdapterError("UNSUPPORTED_ENCODING", "reference source is not valid UTF-8");
    }
    while (true) {
      const newline = pending.indexOf("\n");
      if (newline < 0) break;
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      const output = consume(line);
      if (output) yield output;
    }
  }
  try {
    pending += decoder.decode();
  } catch {
    throw new AdapterError("UNSUPPORTED_ENCODING", "reference source is not valid UTF-8");
  }
  if (pending) {
    const output = consume(pending.replace(/\r$/, ""));
    if (output) yield output;
  }
  if (!header || !inData) throw new AdapterError("MALFORMED_SOURCE", "reference source has no readable data section");
  if (batch.length > 0) yield { schemaFingerprint: schemaHash, startRecordIndex: batch[0].sourceRecordIndex, records: batch };
}

export const REFERENCE_ADAPTER: MefSourceAdapter = {
  descriptor: {
    adapterId: "mef.reference.source-v1",
    adapterVersion: "0.1.0",
    adkApiVersion: ADK_API_VERSION,
    sourceProducer: PRODUCER,
    sourceFormat: FORMAT,
    qualification: "reference",
    capabilities: { probe: true, inspect: true, read: true, streaming: true, boundedReads: true },
  },
  async probe(source, context): Promise<ProbeResult> {
    const text = await prefixText(source, context.budget.maxProbeBytes, context.budget);
    if (!text.startsWith(`${MARKER}\n`) && !text.startsWith(`${MARKER}\r\n`)) {
      return { status: "not_recognized", adapterId: this.descriptor.adapterId, confidence: "low", evidence: [], reason: "reference marker is absent" };
    }
    const evidence: SourceEvidence = {
      locator: { kind: "metadata_entry", version: "1", line: 1, key: "marker", occurrence: 1 },
      statement: MARKER,
    };
    if (!text.includes("producer=")) return { status: "structural_match", adapterId: this.descriptor.adapterId, confidence: "low", evidence: [evidence], reason: "reference producer is absent" };
    if (!text.includes(`producer=${PRODUCER}`) || !text.includes("schema_version=1")) {
      return { status: "structural_match", adapterId: this.descriptor.adapterId, confidence: "medium", evidence: [evidence], reason: "reference version or producer is unsupported" };
    }
    return { status: "exact_match", adapterId: this.descriptor.adapterId, confidence: "high", evidence: [evidence], reason: "synthetic reference marker, producer, and version match" };
  },
  async inspect(source, context) {
    return inspect(source, context.budget.maxProbeBytes, context.budget);
  },
  read(source, context) {
    return read(source, context);
  },
};
