export const ADK_API_VERSION = "0.1.0" as const;

export type AdapterQualification = "reference" | "unqualified" | "qualified";
export type ProbeStatus = "exact_match" | "structural_match" | "not_recognized";
export type DeclarationStatus = "known" | "unknown" | "conflicting";
export type ObservationClassification =
  | "raw_sensor"
  | "producer_derived"
  | "user_entered"
  | "metadata"
  | "unknown";

export interface AdapterCapabilities {
  readonly probe: true;
  readonly inspect: true;
  readonly read: true;
  readonly streaming: true;
  readonly boundedReads: true;
}

export interface AdapterDescriptor {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly adkApiVersion: typeof ADK_API_VERSION;
  readonly sourceProducer: string;
  readonly sourceFormat: string;
  readonly qualification: AdapterQualification;
  readonly capabilities: AdapterCapabilities;
}

export interface AdapterExecutionBudget {
  readonly maxProbeBytes: number;
  readonly maxBytesRead: number;
  readonly maxRecords: number;
  readonly maxMetadataEntries: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface ProbeContext {
  readonly budget: AdapterExecutionBudget;
}

export interface InspectContext {
  readonly budget: AdapterExecutionBudget;
}

export interface ReadContext {
  readonly budget: AdapterExecutionBudget;
}

export interface SourceReader {
  readonly sourceArtifactId: string;
  readonly byteLength: bigint;
  readonly contentSha256: string;
  stream(): ReadableStream<Uint8Array>;
  readRange(offset: bigint, length: number): Promise<Uint8Array>;
}

export interface SourceEvidence {
  readonly locator: SourceLocator;
  readonly statement: string;
}

export interface DelimitedColumnLocator {
  readonly kind: "delimited_column";
  readonly version: "1";
  readonly headerRow: number;
  readonly columnIndex: number;
  readonly columnName: string;
}

export interface MetadataEntryLocator {
  readonly kind: "metadata_entry";
  readonly version: "1";
  readonly line: number;
  readonly key: string;
  readonly occurrence: number;
}

export interface JsonPointerLocator {
  readonly kind: "json_pointer";
  readonly version: "1";
  readonly pointer: string;
}

export interface SpreadsheetCellLocator {
  readonly kind: "spreadsheet_cell";
  readonly version: "1";
  readonly sheet: string;
  readonly cell: string;
}

export interface BinaryFieldLocator {
  readonly kind: "binary_field";
  readonly version: "1";
  readonly field: string;
  readonly offset: number;
  readonly length: number;
}

export type SourceLocator =
  | DelimitedColumnLocator
  | MetadataEntryLocator
  | JsonPointerLocator
  | SpreadsheetCellLocator
  | BinaryFieldLocator;

export interface DeclaredValue {
  readonly status: DeclarationStatus;
  readonly value?: string;
  readonly values?: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<SourceEvidence>;
}

export interface ObservedField {
  readonly sourceName: string;
  readonly locator: SourceLocator;
  readonly classification: DeclaredValue;
  readonly quantity: DeclaredValue;
  readonly unit: DeclaredValue;
  readonly axis: DeclaredValue;
  readonly plate: DeclaredValue;
  readonly evidence: ReadonlyArray<SourceEvidence>;
}

export interface ObservedMetadata {
  readonly key: string;
  readonly declaration: DeclaredValue;
}

export interface ObservedSchema {
  readonly schemaVersion: string;
  readonly containerType: "delimited" | "json" | "spreadsheet" | "binary" | "unknown";
  readonly encoding: string;
  readonly delimiter?: string;
  readonly headerRowCount: number;
  readonly orderedColumns: ReadonlyArray<string>;
  readonly metadataKeys: ReadonlyArray<string>;
}

export interface ProbeResult {
  readonly status: ProbeStatus;
  readonly adapterId: string;
  readonly confidence: "high" | "medium" | "low";
  readonly evidence: ReadonlyArray<SourceEvidence>;
  readonly reason: string;
}

export interface SourceObservation {
  readonly sourceObservationVersion: typeof ADK_API_VERSION;
  readonly sourceArtifactId: string;
  readonly sourceContentSha256: string;
  readonly adapterExecution: {
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly adkApiVersion: typeof ADK_API_VERSION;
    readonly qualification: AdapterQualification;
    readonly executedAt: string;
  };
  readonly schema: ObservedSchema;
  readonly schemaFingerprint: string;
  readonly fields: ReadonlyArray<ObservedField>;
  readonly metadata: ReadonlyArray<ObservedMetadata>;
  readonly warnings: ReadonlyArray<string>;
  readonly provenance: {
    readonly sourceArtifactId: string;
    readonly sourceContentSha256: string;
    readonly locators: ReadonlyArray<SourceLocator>;
  };
  readonly observationSha256: string;
}

export interface ObservedRecord {
  readonly sourceRecordIndex: bigint;
  readonly values: Readonly<Record<string, string>>;
}

export interface ObservedRecordBatch {
  readonly schemaFingerprint: string;
  readonly startRecordIndex: bigint;
  readonly records: ReadonlyArray<ObservedRecord>;
}

export type AdapterErrorCode =
  | "NOT_RECOGNIZED"
  | "AMBIGUOUS_ADAPTER"
  | "MALFORMED_SOURCE"
  | "UNSUPPORTED_SCHEMA"
  | "UNSUPPORTED_ENCODING"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "TIMEOUT"
  | "CANCELLED"
  | "SOURCE_READ_FAILURE"
  | "OBSERVATION_VALIDATION_FAILURE";

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(
    code: AdapterErrorCode,
    message: string,
    details: Readonly<Record<string, string | number | boolean>> = {}
  ) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.details = details;
  }
}

export function isAdapterError(error: unknown): error is AdapterError {
  return error instanceof AdapterError;
}

export interface MefSourceAdapter {
  readonly descriptor: AdapterDescriptor;
  probe(source: SourceReader, context: ProbeContext): Promise<ProbeResult>;
  inspect(source: SourceReader, context: InspectContext): Promise<SourceObservation>;
  read(source: SourceReader, context: ReadContext): AsyncIterable<ObservedRecordBatch>;
}

export interface AdapterResolution {
  readonly status: "resolved" | "not_recognized" | "ambiguous";
  readonly adapter?: MefSourceAdapter;
  readonly probeResults: ReadonlyArray<ProbeResult>;
}
