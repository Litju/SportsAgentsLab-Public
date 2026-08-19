import { createHash } from "node:crypto";
import type {
  CanonicalAcquisition,
  CanonicalAcquisitionId,
  CanonicalIntegrityCheck,
  CanonicalIntegrityFinding,
  CanonicalIntegrityFindingId,
  CanonicalIntegrityReport,
  CanonicalMappingManifestId,
  CanonicalSourceMapping,
  CanonicalTransformation,
  EvidenceManifestId,
  EvidenceReference,
  NonEmptyString,
  QualityState,
  SemanticDeclaration,
  Sha256,
  SourceArtifactId,
  SourceObservationId,
  Unit,
  UnitDeclaration
} from "@mef/generated-ts";
import type {
  DeclaredValue,
  ObservedField,
  ObservedRecord,
  ObservedRecordBatch,
  SourceObservation
} from "@mef/ingestion-adk";
import referenceMapping from "../../ingestion-adk/fixtures/canonical-reference-mapping.json" with { type: "json" };

export const CANONICALIZER_VERSION = "0.1.0" as const;
export const CANONICAL_SIGNAL_MEDIA_TYPE = "application/x-ndjson" as const;
export const CANONICAL_SIGNAL_ENCODING = "MEF_CANONICAL_SIGNAL_NDJSON_V0_1" as const;
export const CANONICAL_SIGNAL_KEY_PREFIX = "canonical/sha256" as const;

export type CanonicalTransformationKind = "IDENTITY" | "UNIT_CONVERSION" | "SIGN_FLIP" | "LINEAR_SCALE";

export interface CanonicalMappingChannel {
  readonly source_field: string;
  readonly channel_id: string;
  readonly source_quantity: string;
  readonly canonical_quantity: string;
  readonly source_unit: string;
  readonly canonical_unit: string;
  readonly source_axis: string | null;
  readonly canonical_axis: string | null;
  readonly sign: 1 | -1;
  readonly scale: number;
  readonly offset: number;
  readonly transformation_kind: CanonicalTransformationKind;
  readonly range_min?: number;
  readonly range_max?: number;
}

export interface CanonicalMappingManifest {
  readonly manifest_id: string;
  readonly version: string;
  readonly source_adapter_id: string;
  readonly evidence_manifest_id: string;
  readonly canonical_modality: string;
  readonly ignored_source_fields: ReadonlyArray<string>;
  readonly channels: ReadonlyArray<CanonicalMappingChannel>;
  readonly expected_record_count?: number;
  readonly timebase: {
    readonly source_field: string;
    readonly canonical_unit: string;
    readonly expected_interval_seconds?: number;
    readonly interval_tolerance_seconds?: number;
  };
}

export interface CanonicalizationInput {
  readonly sourceArtifactId: string;
  readonly sourceArtifactSha256: string;
  readonly sourceObservationId: string;
  readonly sourceObservationSha256: string;
  readonly observation: SourceObservation;
  readonly records: AsyncIterable<ObservedRecordBatch>;
  readonly mappingManifest?: CanonicalMappingManifest;
  readonly canonicalizerVersion?: string;
  readonly createdAt: string;
}

export interface CanonicalizationResult {
  readonly status: "COMPLETE" | "PARTIAL" | "BLOCKED" | "FAILED";
  readonly acquisition: CanonicalAcquisition;
  readonly signal_artifact: CanonicalAcquisition["signal_artifact"];
  readonly integrity_report: CanonicalIntegrityReport;
  readonly mapping_manifest_sha256: Sha256;
  readonly canonical_identity_sha256: Sha256;
  readonly signalBytes: Uint8Array;
  readonly signalHash: Sha256;
  readonly mappingManifestHash: Sha256;
  readonly integrityReportHash: Sha256;
  readonly canonicalIdentityHash: Sha256;
  readonly report: CanonicalIntegrityReport;
}

export type CanonicalizationErrorCode =
  | "CANONICAL_MAPPING_INVALID"
  | "CANONICAL_LINEAGE_INVALID"
  | "CANONICAL_RECORD_INVALID";

export class CanonicalizationError extends Error {
  readonly code: CanonicalizationErrorCode;

  constructor(code: CanonicalizationErrorCode, message: string) {
    super(message);
    this.name = "CanonicalizationError";
    this.code = code;
  }
}

export function isCanonicalizationError(error: unknown): error is CanonicalizationError {
  return error instanceof CanonicalizationError;
}

export const REFERENCE_MAPPING_MANIFEST = referenceMapping as CanonicalMappingManifest;

export const EXPLICIT_UNIT_REGISTRY = Object.freeze({
  s: { dimension: "time", factor: 1 },
  ms: { dimension: "time", factor: 0.001 },
  N: { dimension: "force", factor: 1 },
  kN: { dimension: "force", factor: 1000 }
} as const);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256Text(value: string): Sha256 {
  return createHash("sha256").update(value, "utf8").digest("hex") as Sha256;
}

function sha256Bytes(value: Uint8Array): Sha256 {
  return createHash("sha256").update(value).digest("hex") as Sha256;
}

export function mappingManifestSha256(manifest: CanonicalMappingManifest = REFERENCE_MAPPING_MANIFEST): Sha256 {
  return sha256Text(canonicalJson(manifest));
}

function evidence(
  manifest: CanonicalMappingManifest,
  sourceArtifactSha256: string,
  field?: ObservedField
): EvidenceReference {
  const locator = field
    ? `${field.locator.kind}:${canonicalJson(field.locator)}`
    : "mapping-manifest";
  return {
    evidence_manifest_id: manifest.evidence_manifest_id as unknown as EvidenceManifestId,
    component: "ml104.canonical-acquisition",
    locator,
    content_hash: sourceArtifactSha256 as Sha256
  };
}

function known(value: string, references: ReadonlyArray<EvidenceReference>): SemanticDeclaration {
  return { state: "KNOWN", value: value as NonEmptyString, evidence_references: references };
}

function unresolved(reason: string, references: ReadonlyArray<EvidenceReference>): SemanticDeclaration {
  return { state: "UNRESOLVED", reason, evidence_references: references };
}

function notApplicable(reason: string, references: ReadonlyArray<EvidenceReference>): SemanticDeclaration {
  return { state: "NOT_APPLICABLE", reason, evidence_references: references };
}

function unit(symbol: string): Unit {
  return { system: "SI", symbol };
}

function knownUnit(symbol: string, references: ReadonlyArray<EvidenceReference>): UnitDeclaration {
  return { state: "KNOWN", unit: unit(symbol), evidence_references: references };
}

function unresolvedUnit(reason: string, references: ReadonlyArray<EvidenceReference>): UnitDeclaration {
  return { state: "UNRESOLVED", reason, evidence_references: references };
}

function declaration(field: ObservedField, key: "quantity" | "unit" | "axis"): DeclaredValue {
  return field[key];
}

function transformation(mapping: CanonicalMappingChannel): CanonicalTransformation {
  return {
    kind: mapping.transformation_kind,
    scale: mapping.scale,
    offset: mapping.offset,
    source_unit: unit(mapping.source_unit),
    target_unit: unit(mapping.canonical_unit),
    ...(mapping.source_axis === null ? {} : { source_axis: mapping.source_axis as NonEmptyString }),
    ...(mapping.canonical_axis === null ? {} : { target_axis: mapping.canonical_axis as NonEmptyString })
  };
}

function assertManifest(manifest: CanonicalMappingManifest, canonicalizerVersion: string): void {
  if (!/^map_[a-z0-9][a-z0-9_-]{0,127}$/u.test(manifest.manifest_id)) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping manifest identifier is invalid.");
  }
  if (!/^evm_[a-z0-9][a-z0-9_-]{0,127}$/u.test(manifest.evidence_manifest_id)) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping evidence identifier is invalid.");
  }
  if (!/^\d+\.\d+\.\d+$/u.test(manifest.version) || !/^\d+\.\d+\.\d+$/u.test(canonicalizerVersion)) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping and canonicalizer versions must be semantic versions.");
  }
  if (manifest.channels.length === 0 || new Set(manifest.channels.map((channel) => channel.channel_id)).size !== manifest.channels.length) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping manifest must contain unique channels.");
  }
  for (const channel of manifest.channels) {
    if (!/^channel_[a-z0-9][a-z0-9_-]{0,127}$/u.test(channel.channel_id)
      || channel.sign !== 1 && channel.sign !== -1
      || !Number.isFinite(channel.scale) || channel.scale <= 0
      || !Number.isFinite(channel.offset)
      || channel.range_min !== undefined && !Number.isFinite(channel.range_min)
      || channel.range_max !== undefined && !Number.isFinite(channel.range_max)
      || channel.range_min !== undefined && channel.range_max !== undefined && channel.range_min > channel.range_max) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping manifest contains an invalid channel transformation.");
    }
    const sourceUnit = EXPLICIT_UNIT_REGISTRY[channel.source_unit as keyof typeof EXPLICIT_UNIT_REGISTRY];
    const targetUnit = EXPLICIT_UNIT_REGISTRY[channel.canonical_unit as keyof typeof EXPLICIT_UNIT_REGISTRY];
    if (!sourceUnit || !targetUnit || sourceUnit.dimension !== targetUnit.dimension) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping manifest uses an unsupported or incompatible unit.");
    }
    const expectedScale = sourceUnit.factor / targetUnit.factor;
    if (channel.source_unit !== channel.canonical_unit && channel.transformation_kind !== "UNIT_CONVERSION") {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "A unit change requires an explicit unit-conversion transformation.");
    }
    if (channel.source_unit === channel.canonical_unit && channel.transformation_kind === "UNIT_CONVERSION") {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "A unit conversion cannot be declared when source and canonical units are equal.");
    }
    if (channel.transformation_kind === "UNIT_CONVERSION" && Math.abs(channel.scale - expectedScale) > 1e-12) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The declared unit-conversion scale does not match the explicit unit registry.");
    }
    if (channel.transformation_kind === "UNIT_CONVERSION" && (channel.sign !== 1 || channel.offset !== 0)) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "Unit conversion cannot hide a sign flip or offset.");
    }
    if (channel.transformation_kind === "IDENTITY" && (channel.sign !== 1 || channel.scale !== 1 || channel.offset !== 0)) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "Identity transformations must preserve sign, scale, and offset.");
    }
    if (channel.transformation_kind === "SIGN_FLIP" && (channel.source_unit !== channel.canonical_unit || channel.sign !== -1 || channel.scale !== 1 || channel.offset !== 0)) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "Sign-flip transformations must be explicit and unit-preserving.");
    }
    if (channel.transformation_kind === "LINEAR_SCALE" && channel.sign !== 1) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "Linear scaling cannot hide a sign flip.");
    }
    if (channel.source_unit === channel.canonical_unit && channel.transformation_kind !== "LINEAR_SCALE" && Math.abs(channel.scale - 1) > 1e-12) {
      throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "Identity and sign transformations must use scale one.");
    }
  }
  if (manifest.expected_record_count !== undefined && (!Number.isSafeInteger(manifest.expected_record_count) || manifest.expected_record_count < 0)) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The expected record count is invalid.");
  }
  if (!/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
    throw new CanonicalizationError("CANONICAL_MAPPING_INVALID", "The mapping manifest version is invalid.");
  }
}

function addFinding(
  findings: CanonicalIntegrityFinding[],
  manifest: CanonicalMappingManifest,
  sourceArtifactSha256: string,
  sequence: { value: number },
  code: string,
  severity: "INFO" | "WARNING" | "ERROR",
  message: string,
  options: { recordIndex?: number; channelId?: string } = {}
): void {
  const item: CanonicalIntegrityFinding = {
    finding_id: `cif_${String(sequence.value++).padStart(6, "0")}` as CanonicalIntegrityFindingId,
    code,
    severity,
    message,
    ...(options.recordIndex === undefined ? {} : { record_index: options.recordIndex }),
    ...(options.channelId === undefined ? {} : { channel_id: options.channelId as unknown as `channel_${string}` }),
    evidence_references: [evidence(manifest, sourceArtifactSha256)]
  };
  findings.push(item);
}

function declarationMismatch(
  field: ObservedField | undefined,
  key: "quantity" | "unit" | "axis",
  expected: string
): string | undefined {
  if (!field) return "source field is absent";
  const declared = declaration(field, key);
  if (declared.status !== "known") return `source ${key} declaration is ${declared.status}`;
  if (declared.value !== expected) return `source ${key} declaration does not match the mapping manifest`;
  return undefined;
}

function declarationMismatchCode(
  field: ObservedField,
  key: "quantity" | "unit" | "axis"
): string {
  const declared = declaration(field, key);
  if (declared.status === "unknown") return key === "unit" ? "UNRESOLVED_UNIT" : key === "axis" ? "UNRESOLVED_AXIS" : "UNRESOLVED_QUANTITY";
  if (declared.status === "conflicting") return key === "unit" ? "CONFLICTING_UNIT" : key === "axis" ? "CONFLICTING_AXIS" : "CONFLICTING_QUANTITY";
  return key === "unit" ? "INCOMPATIBLE_UNIT" : key === "axis" ? "INCOMPATIBLE_AXIS" : `INCOMPATIBLE_${key.toUpperCase()}`;
}

function parsedNumber(raw: string): number | undefined {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function canonicalize(input: CanonicalizationInput): Promise<CanonicalizationResult> {
  const manifest = input.mappingManifest ?? REFERENCE_MAPPING_MANIFEST;
  const canonicalizerVersion = input.canonicalizerVersion ?? CANONICALIZER_VERSION;
  assertManifest(manifest, canonicalizerVersion);
  if (input.observation.sourceArtifactId !== input.sourceArtifactId
    || input.observation.sourceContentSha256 !== input.sourceArtifactSha256
    || input.observation.observationSha256 !== input.sourceObservationSha256
    || input.observation.adapterExecution.adapterId !== manifest.source_adapter_id) {
    throw new CanonicalizationError("CANONICAL_LINEAGE_INVALID", "The source observation lineage does not match the canonicalization request.");
  }

  const mappingManifestHash = mappingManifestSha256(manifest);
  const fieldByName = new Map<string, ObservedField>();
  for (const field of input.observation.fields) {
    if (fieldByName.has(field.sourceName)) {
      throw new CanonicalizationError("CANONICAL_LINEAGE_INVALID", "The source observation contains duplicate field names.");
    }
    fieldByName.set(field.sourceName, field);
  }

  const findings: CanonicalIntegrityFinding[] = [];
  const findingSequence = { value: 1 };
  const validMappings = new Map<string, CanonicalMappingChannel>();
  const mappingStates = new Map<string, "KNOWN" | "UNRESOLVED" | "ABSENT">();
  const mappingEvidence = new Map<string, EvidenceReference[]>();
  const channelErrors = new Set<string>();
  const baseEvidence = (field?: ObservedField) => [evidence(manifest, input.sourceArtifactSha256, field)];

  for (const mapping of manifest.channels) {
    const field = fieldByName.get(mapping.source_field);
    const references = baseEvidence(field);
    mappingEvidence.set(mapping.channel_id, references);
    if (!field) {
      mappingStates.set(mapping.channel_id, "ABSENT");
      addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "MISSING_MAPPED_CHANNEL", "ERROR", `Mapped source field ${mapping.source_field} is absent; no channel was synthesized.`, { channelId: mapping.channel_id });
      continue;
    }
    let mismatchKey: "quantity" | "unit" | "axis" | undefined;
    let mismatch = declarationMismatch(field, "quantity", mapping.source_quantity);
    if (mismatch) mismatchKey = "quantity";
    if (!mismatch) {
      mismatch = declarationMismatch(field, "unit", mapping.source_unit);
      if (mismatch) mismatchKey = "unit";
    }
    if (!mismatch && mapping.source_axis !== null) {
      mismatch = declarationMismatch(field, "axis", mapping.source_axis);
      if (mismatch) mismatchKey = "axis";
    }
    if (mismatch) {
      mappingStates.set(mapping.channel_id, "UNRESOLVED");
      channelErrors.add(mapping.channel_id);
      addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, mismatchKey ? declarationMismatchCode(field, mismatchKey) : "DECLARATION_CONFLICT", "ERROR", `${mapping.source_field}: ${mismatch}.`, { channelId: mapping.channel_id });
      continue;
    }
    mappingStates.set(mapping.channel_id, "KNOWN");
    validMappings.set(mapping.channel_id, mapping);
  }

  const mappedFields = new Set(manifest.channels.map((mapping) => mapping.source_field));
  for (const field of input.observation.fields) {
    if (mappedFields.has(field.sourceName)) continue;
    const severity = manifest.ignored_source_fields.includes(field.sourceName) ? "INFO" : "WARNING";
    addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "EXTRA_UNKNOWN_CHANNEL", severity, `Source field ${field.sourceName} is not mapped to a canonical channel.`);
  }

  const timestampMapping = manifest.channels.find((mapping) => mapping.source_field === manifest.timebase.source_field);
  if (!timestampMapping || !validMappings.has(timestampMapping.channel_id)) {
    addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "UNRESOLVED_TIMEBASE", "ERROR", "The timestamp mapping is absent or semantically unresolved.");
  }

  const channelValues = new Map<string, number[]>();
  for (const mapping of validMappings.values()) channelValues.set(mapping.channel_id, []);
  const artifactLines: string[] = [canonicalJson({
    encoding: CANONICAL_SIGNAL_ENCODING,
    canonicalizer_version: canonicalizerVersion,
    source_observation_id: input.sourceObservationId,
    channel_order: manifest.channels.map((mapping) => mapping.channel_id)
  })];
  let expectedIndex = 0n;
  let previousTime: number | undefined;
  let timeUniform = true;
  let recordCount = 0;
  let finiteValueCount = 0;
  let indexedRecordsValid = true;

  const appendRecord = (record: ObservedRecord): void => {
    const recordIndex = record.sourceRecordIndex;
    if (recordIndex !== expectedIndex) {
      indexedRecordsValid = false;
      const code = recordIndex > expectedIndex ? "MISSING_INDEXED_SAMPLE" : "DUPLICATE_INDEXED_SAMPLE";
      addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, code, "ERROR", `Record index ${recordIndex.toString()} did not follow the expected source index.`, { recordIndex: Number(recordIndex) });
    }
    if (recordIndex >= 0n && recordIndex <= BigInt(Number.MAX_SAFE_INTEGER)) expectedIndex = recordIndex + 1n;
    else throw new CanonicalizationError("CANONICAL_RECORD_INVALID", "A source record index exceeded the safe integer boundary.");

    const values: Record<string, number | null> = {};
    for (const mapping of validMappings.values()) {
      const raw = record.values[mapping.source_field];
      const value = typeof raw === "string" ? parsedNumber(raw) : undefined;
      if (value === undefined) {
        channelErrors.add(mapping.channel_id);
        values[mapping.channel_id] = null;
        const missing = raw === undefined || raw.trim().length === 0;
        addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, missing ? "MISSING_VALUE" : "NONFINITE_VALUE", "ERROR", `Record ${recordIndex.toString()} has no finite numeric value for ${mapping.source_field}.`, { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
        continue;
      }
      const transformed = value * mapping.scale * mapping.sign + mapping.offset;
      if (!Number.isFinite(transformed)) {
        channelErrors.add(mapping.channel_id);
        values[mapping.channel_id] = null;
        addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "NONFINITE_VALUE", "ERROR", `Record ${recordIndex.toString()} transformed to a non-finite value for ${mapping.source_field}.`, { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
        continue;
      }
      finiteValueCount += 1;
      values[mapping.channel_id] = transformed;
      channelValues.get(mapping.channel_id)?.push(transformed);
      if ((mapping.range_min !== undefined && transformed < mapping.range_min) || (mapping.range_max !== undefined && transformed > mapping.range_max)) {
        channelErrors.add(mapping.channel_id);
        addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "RANGE_VIOLATION", "ERROR", `Record ${recordIndex.toString()} exceeded the explicit range for ${mapping.source_field}.`, { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
      }
      if (mapping.source_field === manifest.timebase.source_field) {
        if (previousTime !== undefined) {
          const interval = transformed - previousTime;
          const expected = manifest.timebase.expected_interval_seconds;
          const tolerance = manifest.timebase.interval_tolerance_seconds ?? 0;
          if (interval === 0) {
            timeUniform = false;
            addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "DUPLICATE_TIMESTAMP", "ERROR", "Timestamp values are duplicated.", { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
          } else if (interval < 0) {
            timeUniform = false;
            addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "NONMONOTONIC_TIMESTAMP", "ERROR", "Timestamp values are not strictly increasing.", { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
          } else if (expected !== undefined && Math.abs(interval - expected) > tolerance) {
            timeUniform = false;
            addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "IRREGULAR_INTERVAL", "ERROR", "Timestamp interval differs from the explicit mapping-manifest interval.", { recordIndex: Number(recordIndex), channelId: mapping.channel_id });
          }
        }
        previousTime = transformed;
      }
    }
    artifactLines.push(canonicalJson({ record_index: Number(recordIndex), values }));
    recordCount += 1;
  };

  for await (const batch of input.records) {
    if (batch.schemaFingerprint !== input.observation.schemaFingerprint) {
      throw new CanonicalizationError("CANONICAL_RECORD_INVALID", "A record batch schema fingerprint did not match the accepted observation.");
    }
    if (batch.startRecordIndex < 0n) throw new CanonicalizationError("CANONICAL_RECORD_INVALID", "A record batch has a negative start index.");
    for (const record of batch.records) appendRecord(record);
  }
  if (manifest.expected_record_count !== undefined && manifest.expected_record_count !== recordCount) {
    addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "COUNT_MISMATCH", "ERROR", `The source produced ${recordCount} records but the mapping manifest expected ${manifest.expected_record_count}.`);
  }
  if (recordCount === 0) addFinding(findings, manifest, input.sourceArtifactSha256, findingSequence, "NO_RECORDS", "ERROR", "The qualified adapter produced no records.");

  const artifactReferences = [evidence(manifest, input.sourceArtifactSha256)];
  const findingIdsFor = (codes: ReadonlyArray<string>): CanonicalIntegrityFindingId[] => findings
    .filter((finding) => codes.includes(finding.code))
    .map((finding) => finding.finding_id);
  const makeCheck = (
    checkId: string,
    codes: ReadonlyArray<string>,
    evaluated = true
  ): CanonicalIntegrityCheck => {
    const matched = findings.filter((finding) => codes.includes(finding.code));
    const status = !evaluated
      ? "NOT_EVALUATED"
      : matched.some((finding) => finding.severity === "ERROR")
        ? "FAIL"
        : matched.some((finding) => finding.severity === "WARNING")
          ? "WARN"
          : "PASS";
    return {
      check_id: checkId,
      status,
      finding_ids: findingIdsFor(codes),
      evidence_references: artifactReferences
    };
  };
  const timestampResolved = timestampMapping !== undefined && validMappings.has(timestampMapping.channel_id);
  const checks: CanonicalIntegrityCheck[] = [
    makeCheck("MAPPED_CHANNELS", ["MISSING_MAPPED_CHANNEL", "UNRESOLVED_QUANTITY", "CONFLICTING_QUANTITY", "INCOMPATIBLE_QUANTITY"]),
    makeCheck("QUANTITY_DECLARATIONS", ["UNRESOLVED_QUANTITY", "CONFLICTING_QUANTITY", "INCOMPATIBLE_QUANTITY"]),
    makeCheck("UNIT_DECLARATIONS", ["UNRESOLVED_UNIT", "CONFLICTING_UNIT", "INCOMPATIBLE_UNIT"]),
    makeCheck(
      "AXIS_DECLARATIONS",
      ["UNRESOLVED_AXIS", "CONFLICTING_AXIS", "INCOMPATIBLE_AXIS"],
      manifest.channels.some((mapping) => mapping.source_axis !== null)
    ),
    makeCheck("TIMEBASE_RESOLUTION", ["UNRESOLVED_TIMEBASE"]),
    makeCheck("TIME_MONOTONICITY", ["DUPLICATE_TIMESTAMP", "NONMONOTONIC_TIMESTAMP"], timestampResolved && recordCount > 1),
    makeCheck(
      "INTERVAL_REGULARITY",
      ["IRREGULAR_INTERVAL"],
      timestampResolved && manifest.timebase.expected_interval_seconds !== undefined && recordCount > 1
    ),
    makeCheck("INDEX_CONTINUITY", ["MISSING_INDEXED_SAMPLE", "DUPLICATE_INDEXED_SAMPLE"], recordCount > 0),
    makeCheck("FINITE_VALUES", ["MISSING_VALUE", "NONFINITE_VALUE"], recordCount > 0),
    makeCheck("COUNT_MATCH", ["COUNT_MISMATCH"], manifest.expected_record_count !== undefined),
    makeCheck(
      "RANGE_BOUNDS",
      ["RANGE_VIOLATION"],
      manifest.channels.some((mapping) => mapping.range_min !== undefined || mapping.range_max !== undefined) && recordCount > 0
    ),
    makeCheck("RECORD_AVAILABILITY", ["NO_RECORDS"], true),
    makeCheck("EXTRA_FIELDS", ["EXTRA_UNKNOWN_CHANNEL"], true)
  ];

  const report: CanonicalIntegrityReport = {
    status: findings.some((finding) => finding.severity === "ERROR") ? (recordCount === 0 ? "REJECTED" : "REVIEW_REQUIRED") : "QUALIFIED",
    record_count: recordCount,
    channel_count: validMappings.size,
    finite_value_count: finiteValueCount,
    finding_count: findings.length,
    findings,
    checks
  };
  const integrityReportHash = sha256Text(canonicalJson(report));
  const signalBytes = new TextEncoder().encode(`${artifactLines.join("\n")}\n`);
  const signalHash = sha256Bytes(signalBytes);
  const identityPayload = {
    source_artifact_sha256: input.sourceArtifactSha256,
    source_observation_sha256: input.sourceObservationSha256,
    canonicalizer_version: canonicalizerVersion,
    mapping_manifest_sha256: mappingManifestHash,
    signal_artifact_sha256: signalHash,
    integrity_report_sha256: integrityReportHash
  };
  const canonicalIdentityHash = sha256Text(canonicalJson(identityPayload));
  const sourceMappings: ReadonlyArray<CanonicalSourceMapping> = manifest.channels.map((mapping) => ({
    channel_id: mapping.channel_id as `channel_${string}`,
    source_label: mapping.source_field as NonEmptyString,
    mapping_state: mappingStates.get(mapping.channel_id) ?? "UNRESOLVED",
    evidence_references: mappingEvidence.get(mapping.channel_id) ?? artifactReferences,
    transformation: transformation(mapping)
  }));
  const channels = manifest.channels
    .filter((mapping) => validMappings.has(mapping.channel_id))
    .map((mapping) => {
      const field = fieldByName.get(mapping.source_field);
      const references = mappingEvidence.get(mapping.channel_id) ?? artifactReferences;
      const axis = mapping.canonical_axis === null
        ? notApplicable("This channel has no axis semantic in the mapping manifest.", references)
        : known(mapping.canonical_axis, references);
      const quality: QualityState = channelErrors.has(mapping.channel_id) ? "REVIEW_REQUIRED" : "QUALIFIED";
      return {
        channel_id: mapping.channel_id as `channel_${string}`,
        physical_quantity: known(mapping.canonical_quantity, references),
        unit: field && declaration(field, "unit").status === "known"
          ? knownUnit(mapping.canonical_unit, references)
          : unresolvedUnit("The source unit declaration was unresolved.", references),
        axis,
        sign_convention: known(mapping.sign === 1 ? "positive" : "negative", references),
        sample_time: known(`source_field=${manifest.timebase.source_field}`, references),
        quality_state: quality,
        sample_count: recordCount,
        transformation: transformation(mapping),
        evidence_references: references
      };
    });
  const timebaseKnown = timestampMapping !== undefined
    && validMappings.has(timestampMapping.channel_id)
    && !findings.some((finding) => ["UNRESOLVED_TIMEBASE", "NONMONOTONIC_TIMESTAMP", "IRREGULAR_INTERVAL"].includes(finding.code));
  const timebase = timebaseKnown
    ? {
        state: "KNOWN" as const,
        timestamp_channel_id: timestampMapping!.channel_id as `channel_${string}`,
        timestamp_unit: unit(manifest.timebase.canonical_unit),
        ...(manifest.timebase.expected_interval_seconds === undefined ? {} : { sample_interval_seconds: manifest.timebase.expected_interval_seconds }),
        uniformity: timeUniform ? "UNIFORM" as const : "IRREGULAR" as const,
        evidence_references: artifactReferences
      }
    : {
        state: "UNRESOLVED" as const,
        reason: "The source timestamp is missing, non-monotonic, or irregular against the explicit mapping manifest.",
        evidence_references: artifactReferences
      };
  const hasErrors = findings.some((finding) => finding.severity === "ERROR");
  const blockingReasons = findings
    .filter((finding) => finding.severity === "ERROR")
    .map((finding) => ({
      code: `canonical_${finding.code.toLowerCase()}`,
      description: finding.message,
      evidence_references: finding.evidence_references
    }));
  const acquisition: CanonicalAcquisition = {
    entity_type: "CanonicalAcquisition",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/canonical-acquisition.schema.json",
    schema_version: "1.0.0",
    canonical_acquisition_id: `acq_${canonicalIdentityHash.slice(0, 40)}` as unknown as CanonicalAcquisitionId,
    record_version: 1,
    created_at: input.createdAt as `${string}Z`,
    source_artifact_id: `src_${input.sourceArtifactId.replace(/^src_/u, "")}` as unknown as SourceArtifactId,
    source_observation_id: input.sourceObservationId as unknown as SourceObservationId,
    source_observation_sha256: input.sourceObservationSha256 as Sha256,
    canonicalizer_version: canonicalizerVersion,
    mapping_manifest_sha256: mappingManifestHash,
    signal_artifact_sha256: signalHash,
    integrity_report_sha256: integrityReportHash,
    canonical_identity_sha256: canonicalIdentityHash,
    acquisition_state: hasErrors ? (recordCount === 0 ? "REJECTED" : "PARTIALLY_RESOLVED") : "QUALIFIED",
    modality: known(manifest.canonical_modality, artifactReferences),
    channels,
    source_mappings: sourceMappings,
    sample_semantics: indexedRecordsValid
      ? known("source_record_indices_preserved", artifactReferences)
      : unresolved("Source record indices were not contiguous and were not repaired.", artifactReferences),
    timebase,
    synchronization: known("single_source_stream_no_external_synchronization_applied", artifactReferences),
    calibration: known("no_calibration_applied_by_canonicalizer", artifactReferences),
    preprocessing: known("no_preprocessing_applied_by_canonicalizer", artifactReferences),
    missingness_quality: known("explicit_integrity_findings", artifactReferences),
    configuration_resolution: "NOT_EVALUATED",
    manifest: {
      source_observation_id: input.sourceObservationId as unknown as SourceObservationId,
      source_observation_sha256: input.sourceObservationSha256 as Sha256,
      source_artifact_sha256: input.sourceArtifactSha256 as Sha256,
      canonicalizer_version: canonicalizerVersion,
      mapping_manifest_id: manifest.manifest_id as unknown as CanonicalMappingManifestId,
      mapping_manifest_sha256: mappingManifestHash,
      adapter_id: input.observation.adapterExecution.adapterId as NonEmptyString,
      evidence_references: artifactReferences
    },
    signal_artifact: {
      content_hash: signalHash,
      storage_key: `${CANONICAL_SIGNAL_KEY_PREFIX}/${signalHash}` as NonEmptyString,
      byte_size: signalBytes.byteLength,
      media_type: CANONICAL_SIGNAL_MEDIA_TYPE,
      encoding: CANONICAL_SIGNAL_ENCODING,
      channel_order: manifest.channels.map((mapping) => mapping.channel_id as `channel_${string}`)
    },
    integrity_report: report,
    quality_state: hasErrors ? (recordCount === 0 ? "REJECTED" : "REVIEW_REQUIRED") : "QUALIFIED",
    blocking_reasons: blockingReasons
  };
  const status = !hasErrors
    ? "COMPLETE" as const
    : findings.some((finding) => ["MISSING_MAPPED_CHANNEL", "UNRESOLVED_QUANTITY", "CONFLICTING_QUANTITY", "INCOMPATIBLE_QUANTITY", "UNRESOLVED_UNIT", "CONFLICTING_UNIT", "INCOMPATIBLE_UNIT", "UNRESOLVED_AXIS", "CONFLICTING_AXIS", "INCOMPATIBLE_AXIS", "UNRESOLVED_TIMEBASE", "NO_RECORDS"].includes(finding.code))
      ? "BLOCKED" as const
      : "PARTIAL" as const;
  return {
    status,
    acquisition,
    signal_artifact: acquisition.signal_artifact,
    integrity_report: report,
    mapping_manifest_sha256: mappingManifestHash,
    canonical_identity_sha256: canonicalIdentityHash,
    signalBytes,
    signalHash,
    mappingManifestHash,
    integrityReportHash,
    canonicalIdentityHash,
    report
  };
}
