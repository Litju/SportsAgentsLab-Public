import { createHash } from "node:crypto";
import type {
  AcquisitionConfigurationContract,
  AcquisitionConfigurationResolution,
  AxisSignResolution,
  CanonicalAcquisition,
  CanonicalChannel,
  ConfigurationContract,
  ConfigurationEvidenceReference,
  ConfigurationFinding,
  EvidenceReference,
  ReasonReference,
  SampleRateResolution,
  SemanticDeclaration,
  Sha256,
  SourceArtifactId,
  SourceObservationId,
  SynchronizationResolution,
  PreprocessingResolution,
  CalibrationResolution,
  ZeroingResolution,
  ProtocolEligibilityResolution
} from "@mef/generated-ts";
import { canonicalJson, validateEntity } from "@mef/generated-ts";
import type { DeclaredValue, ObservedField, SourceObservation } from "@mef/ingestion-adk";

export const CONFIGURATION_RESOLVER_VERSION = "0.1.0" as const;
export const CONFIGURATION_AUTHORITY_VERSION = "ML-105-CONFIGURATION-AUTHORITY-0.1" as const;

type SourceObservationEvidence = Pick<
  SourceObservation,
  "sourceArtifactId" | "sourceContentSha256" | "fields" | "metadata" | "observationSha256"
>;

export interface ResolverMetadataDeclaration {
  readonly key: string;
  readonly status: "known" | "unknown" | "conflicting";
  readonly value?: string;
  readonly values?: ReadonlyArray<string>;
  readonly locator?: string;
}

export interface ProtocolAuthorityInput {
  readonly version: string;
  readonly state: "ELIGIBLE" | "INELIGIBLE" | "UNRESOLVED" | "NOT_EVALUATED";
}

export interface ConfigurationResolverInput {
  readonly canonicalAcquisition: CanonicalAcquisition;
  readonly sourceObservation?: SourceObservationEvidence;
  readonly metadata?: ReadonlyArray<ResolverMetadataDeclaration>;
  readonly plateIdentityByChannel?: Readonly<Record<string, ResolverMetadataDeclaration>>;
  readonly protocolAuthority?: ProtocolAuthorityInput;
  readonly createdAt?: string;
}

export interface ConfigurationResolutionResult {
  readonly resolution: AcquisitionConfigurationResolution;
  readonly contract: ConfigurationContract;
}

export class ConfigurationResolutionError extends Error {
  readonly code:
    | "CANONICAL_INVALID"
    | "CANONICAL_LINEAGE_INVALID"
    | "METADATA_INVALID"
    | "PROTOCOL_AUTHORITY_INVALID";

  constructor(code: ConfigurationResolutionError["code"], message: string) {
    super(message);
    this.name = "ConfigurationResolutionError";
    this.code = code;
  }
}

function hashText(value: string): Sha256 {
  return createHash("sha256").update(value, "utf8").digest("hex") as Sha256;
}

function declarationValue(declaration: ResolverMetadataDeclaration): string | undefined {
  const values = declaration.values ?? (declaration.value === undefined ? [] : [declaration.value]);
  return values.length === 1 ? values[0] : undefined;
}

function sourceDeclarationValue(declaration: DeclaredValue): string | undefined {
  const values = declaration.values ?? (declaration.value === undefined ? [] : [declaration.value]);
  return values.length === 1 ? values[0] : undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/gu, "_");
}

function metadataDeclarations(input: ConfigurationResolverInput): ReadonlyArray<ResolverMetadataDeclaration> {
  const explicit = input.metadata ?? [];
  const observed = input.sourceObservation?.metadata.map((entry) => ({
    key: entry.key,
    status: entry.declaration.status,
    value: entry.declaration.value,
    values: entry.declaration.values,
    locator: `source-observation.metadata[${entry.key}]`
  })) ?? [];
  return [...observed, ...explicit];
}

function metadataFor(
  declarations: ReadonlyArray<ResolverMetadataDeclaration>,
  predicate: (key: string) => boolean
): ReadonlyArray<ResolverMetadataDeclaration> {
  return declarations.filter((entry) => predicate(normalize(entry.key)));
}

function evidence(
  canonical: CanonicalAcquisition,
  locator: string,
  channelId?: string
): ConfigurationEvidenceReference {
  return {
    source_artifact_id: canonical.source_artifact_id,
    source_observation_id: canonical.source_observation_id,
    canonical_acquisition_id: canonical.canonical_acquisition_id,
    ...(channelId === undefined ? {} : { channel_id: channelId as CanonicalChannel["channel_id"] }),
    locator,
    content_hash: canonical.manifest.source_artifact_sha256
  };
}

function refsForChannel(input: ConfigurationResolverInput, channel: CanonicalChannel): ReadonlyArray<ConfigurationEvidenceReference> {
  const mapping = input.canonicalAcquisition.source_mappings.find((item) => item.channel_id === channel.channel_id);
  const sourceField = mapping?.source_label;
  const observedField = sourceField === undefined
    ? undefined
    : input.sourceObservation?.fields.find((field) => field.sourceName === sourceField);
  const locator = observedField === undefined
    ? `canonical-acquisition.channels[${channel.channel_id}]`
    : `source-observation.fields[${sourceField}].${JSON.stringify(observedField.locator)}`;
  return [evidence(input.canonicalAcquisition, locator, channel.channel_id)];
}

function asSemantic(value: SemanticDeclaration): SemanticDeclaration {
  return value;
}

function sourcePlateDeclaration(
  input: ConfigurationResolverInput,
  channel: CanonicalChannel
): { readonly declaration: SemanticDeclaration; readonly locator: string } {
  const explicit = input.plateIdentityByChannel?.[channel.channel_id];
  if (explicit) {
    if (explicit.status === "conflicting") return { declaration: { state: "UNRESOLVED", reason: "Plate identity metadata conflicts.", evidence_references: [] }, locator: explicit.locator ?? `metadata.plate[${channel.channel_id}]` };
    const value = declarationValue(explicit);
    if (explicit.status === "known" && value) return { declaration: { state: "KNOWN", value, evidence_references: [] }, locator: explicit.locator ?? `metadata.plate[${channel.channel_id}]` };
    return { declaration: { state: "UNKNOWN", reason: "Plate identity metadata is unknown.", evidence_references: [] }, locator: explicit.locator ?? `metadata.plate[${channel.channel_id}]` };
  }
  const mapping = input.canonicalAcquisition.source_mappings.find((item) => item.channel_id === channel.channel_id);
  const field = mapping?.source_label === undefined
    ? undefined
    : input.sourceObservation?.fields.find((item) => item.sourceName === mapping.source_label);
  if (!field) return { declaration: { state: "UNKNOWN", reason: "No plate identity evidence was supplied.", evidence_references: [] }, locator: `canonical-acquisition.channels[${channel.channel_id}]` };
  if (field.plate.status === "conflicting") return { declaration: { state: "UNRESOLVED", reason: "Plate identity metadata conflicts.", evidence_references: [] }, locator: `source-observation.fields[${field.sourceName}].plate` };
  const value = sourceDeclarationValue(field.plate);
  if (field.plate.status === "known" && value) return { declaration: { state: "KNOWN", value, evidence_references: [] }, locator: `source-observation.fields[${field.sourceName}].plate` };
  return { declaration: { state: "UNKNOWN", reason: "Plate identity metadata is unknown.", evidence_references: [] }, locator: `source-observation.fields[${field.sourceName}].plate` };
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function isDecimalLiteral(value: string): boolean {
  let index = 0;
  if (value[index] === "+") index += 1;
  let integerDigits = 0;
  while (value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57) {
    integerDigits += 1;
    index += 1;
  }
  let fractionDigits = 0;
  if (value[index] === ".") {
    index += 1;
    while (value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57) {
      fractionDigits += 1;
      index += 1;
    }
  }
  if (integerDigits === 0 && fractionDigits === 0) return false;
  if (value[index] === "e" || value[index] === "E") {
    index += 1;
    if (value[index] === "+" || value[index] === "-") index += 1;
    const exponentStart = index;
    while (value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57) index += 1;
    if (index === exponentStart) return false;
  }
  return index === value.length;
}

function numberFromDeclaration(declaration: ResolverMetadataDeclaration): number | undefined {
  const value = declarationValue(declaration);
  if (value === undefined || !isDecimalLiteral(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function addFinding(
  findings: ConfigurationFinding[],
  canonical: CanonicalAcquisition,
  code: string,
  severity: ConfigurationFinding["severity"],
  message: string,
  refs: ReadonlyArray<ConfigurationEvidenceReference>
): void {
  findings.push({ code, severity, message, evidence_references: refs });
}

function sampleRate(
  input: ConfigurationResolverInput,
  declarations: ReadonlyArray<ResolverMetadataDeclaration>,
  findings: ConfigurationFinding[]
): SampleRateResolution {
  const explicit = metadataFor(declarations, (key) =>
    key === "sample_rate" || key === "sample_rate_hz" || key === "sampling_rate" || key === "sampling_rate_hz" || /^sample_rate_hz_[a-z0-9_.:-]+$/u.test(key)
  );
  const refs = explicit.map((item) => evidence(input.canonicalAcquisition, item.locator ?? `source-observation.metadata[${item.key}]`));
  if (explicit.some((item) => item.status === "conflicting")) {
    addFinding(findings, input.canonicalAcquisition, "sample_rate_conflicting", "ERROR", "Sample-rate metadata contains a conflict.", refs);
    return { state: "CONFLICTING", source: "EXPLICIT_SOURCE_DECLARATION", evidence_references: refs };
  }
  if (explicit.length > 0) {
    const values = explicit.map(numberFromDeclaration);
    if (values.some((value) => value === undefined || !finitePositive(value))) {
      addFinding(findings, input.canonicalAcquisition, "sample_rate_invalid", "ERROR", "Explicit sample-rate metadata is missing, nonfinite, zero, or negative.", refs);
      return { state: "CONFLICTING", source: "EXPLICIT_SOURCE_DECLARATION", evidence_references: refs };
    }
    const first = values[0]!;
    if (values.some((value) => value !== first)) {
      addFinding(findings, input.canonicalAcquisition, "sample_rate_conflicting", "ERROR", "Explicit sample-rate declarations disagree.", refs);
      return { state: "CONFLICTING", source: "EXPLICIT_SOURCE_DECLARATION", evidence_references: refs };
    }
    return { state: "RESOLVED", sample_rate_hz: first, source: "EXPLICIT_SOURCE_DECLARATION", evidence_references: refs };
  }

  const timebase = input.canonicalAcquisition.timebase;
  const timebaseRefs = [evidence(input.canonicalAcquisition, "canonical-acquisition.timebase")];
  if (timebase.sample_rate_hz !== undefined) {
    if (!finitePositive(timebase.sample_rate_hz)) {
      addFinding(findings, input.canonicalAcquisition, "sample_rate_invalid", "ERROR", "Canonical sample-rate evidence is nonfinite, zero, or negative.", timebaseRefs);
      return { state: "CONFLICTING", source: "CANONICAL_TIMEBASE", evidence_references: timebaseRefs };
    }
    return { state: "RESOLVED", sample_rate_hz: timebase.sample_rate_hz, source: "CANONICAL_TIMEBASE", evidence_references: timebaseRefs };
  }
  if (finitePositive(timebase.sample_interval_seconds) && timebase.uniformity === "UNIFORM") {
    return {
      state: "RESOLVED",
      sample_rate_hz: 1 / timebase.sample_interval_seconds,
      interval_seconds: timebase.sample_interval_seconds,
      source: "EXACT_TIMESTAMP_INTERVAL",
      evidence_references: timebaseRefs
    };
  }
  addFinding(findings, input.canonicalAcquisition, "sample_rate_unknown", "WARNING", "No explicit or qualified uniform timebase establishes sample rate; no default was applied.", timebaseRefs);
  return { state: "UNKNOWN", source: "UNKNOWN", evidence_references: timebaseRefs };
}

function synchronization(
  input: ConfigurationResolverInput,
  forceChannels: ReadonlyArray<CanonicalChannel>,
  declarations: ReadonlyArray<ResolverMetadataDeclaration>,
  findings: ConfigurationFinding[]
): SynchronizationResolution {
  const refs = [evidence(input.canonicalAcquisition, "canonical-acquisition.synchronization")];
  if (forceChannels.length < 2) return { state: "NOT_APPLICABLE", evidence_references: refs };
  const explicit = metadataFor(declarations, (key) => key === "synchronization" || key === "sync" || key === "common_clock" || key === "common_timebase");
  if (explicit.some((item) => item.status === "conflicting")) {
    addFinding(findings, input.canonicalAcquisition, "synchronization_conflicting", "ERROR", "Synchronization metadata conflicts.", refs);
    return { state: "CONFLICTING", evidence_references: refs };
  }
  const explicitValues = explicit.map(declarationValue).filter((value): value is string => value !== undefined).map(normalize);
  if (explicitValues.length > 0) {
    if (explicitValues.every((value) => ["synchronized", "sync", "common_clock", "common_timebase", "shared_clock"].includes(value))) {
      return { state: "SYNCHRONIZED", evidence_references: refs };
    }
    if (explicitValues.every((value) => ["unsynchronized", "unsynchronized_channels", "independent", "false", "no"].includes(value))) {
      return { state: "UNSYNCHRONIZED", evidence_references: refs };
    }
    addFinding(findings, input.canonicalAcquisition, "synchronization_unknown", "WARNING", "Synchronization metadata does not establish a supported synchronization state.", refs);
    return { state: "UNKNOWN", evidence_references: refs };
  }
  const canonicalValue = input.canonicalAcquisition.synchronization.value;
  const normalizedCanonical = canonicalValue === undefined ? "" : normalize(canonicalValue);
  if (["synchronized", "common_clock", "common_timebase", "shared_clock"].includes(normalizedCanonical)) {
    return { state: "SYNCHRONIZED", evidence_references: refs };
  }
  const counts = forceChannels.map((channel) => channel.sample_count);
  const sameCount = counts.length > 1 && counts.every((count) => count === counts[0]);
  addFinding(
    findings,
    input.canonicalAcquisition,
    "synchronization_unknown",
    "WARNING",
    sameCount ? "Force channels have equal sample counts, but equal counts do not establish synchronization." : "No authoritative synchronization evidence was supplied.",
    refs
  );
  return { state: "UNKNOWN", evidence_references: refs };
}

function axisSign(
  input: ConfigurationResolverInput,
  forceChannels: ReadonlyArray<CanonicalChannel>,
  declarations: ReadonlyArray<ResolverMetadataDeclaration>,
  findings: ConfigurationFinding[]
): AxisSignResolution {
  const refs = forceChannels.flatMap((channel) => refsForChannel(input, channel));
  const axisDeclarations = metadataFor(declarations, (key) => key === "axis" || key.startsWith("axis_"));
  const signDeclarations = metadataFor(declarations, (key) => key === "sign" || key === "sign_convention" || key.startsWith("sign_"));
  const sourceConflicts = forceChannels.some((channel) => {
    const mapping = input.canonicalAcquisition.source_mappings.find((item) => item.channel_id === channel.channel_id);
    const field = mapping?.source_label === undefined
      ? undefined
      : input.sourceObservation?.fields.find((item) => item.sourceName === mapping.source_label);
    return field?.axis.status === "conflicting";
  });
  const explicitConflicts = [...axisDeclarations, ...signDeclarations].some((item) => item.status === "conflicting");
  const axisValues = axisDeclarations.map(declarationValue).filter((value): value is string => value !== undefined).map(normalize);
  const signValues = signDeclarations.map(declarationValue).filter((value): value is string => value !== undefined).map(normalize);
  if (sourceConflicts || explicitConflicts || new Set(axisValues).size > 1 || new Set(signValues).size > 1) {
    addFinding(findings, input.canonicalAcquisition, "axis_sign_conflicting", "ERROR", "Axis or sign metadata conflicts.", refs);
    return { state: "CONFLICTING", evidence_references: refs };
  }
  const allKnown = forceChannels.length > 0 && forceChannels.every((channel) =>
    channel.axis.state === "KNOWN" && channel.sign_convention.state === "KNOWN" && channel.axis.value !== undefined && channel.sign_convention.value !== undefined
  );
  if (!allKnown) {
    addFinding(findings, input.canonicalAcquisition, "axis_sign_unknown", "WARNING", "Axis and sign semantics are not fully established; no axis or sign default was applied.", refs);
    return { state: "UNKNOWN", evidence_references: refs };
  }
  const axes = new Set(forceChannels.map((channel) => normalize(channel.axis.value!)));
  const signs = new Set(forceChannels.map((channel) => normalize(channel.sign_convention.value!)));
  const axis = axes.size === 1 ? [...axes][0] : "per_channel_explicit";
  const sign = signs.size === 1 ? [...signs][0] : "per_channel_explicit";
  return { state: "RESOLVED", axis, sign, evidence_references: refs };
}

function processingFact<T extends PreprocessingResolution | CalibrationResolution | ZeroingResolution>(
  input: ConfigurationResolverInput,
  declarations: ReadonlyArray<ResolverMetadataDeclaration>,
  predicate: (key: string) => boolean,
  kind: "preprocessing" | "calibration" | "zeroing"
): T {
  const matches = metadataFor(declarations, predicate);
  const refs = matches.map((item) => evidence(input.canonicalAcquisition, item.locator ?? `source-observation.metadata[${item.key}]`));
  if (matches.some((item) => item.status === "conflicting")) return { state: "CONFLICTING", evidence_references: refs } as unknown as T;
  const value = matches.map(declarationValue).find((item): item is string => item !== undefined);
  if (value === undefined) return { state: "UNKNOWN", evidence_references: refs } as unknown as T;
  if (kind === "preprocessing") {
    return { state: normalize(value) === "none" || normalize(value) === "none_declared" ? "NONE_DECLARED" : "DECLARED", description: value, evidence_references: refs } as unknown as T;
  }
  return { state: "DECLARED", description: value, evidence_references: refs } as unknown as T;
}

function protocolEligibility(
  input: ConfigurationResolverInput,
  findings: ConfigurationFinding[]
): ProtocolEligibilityResolution {
  const authority = input.protocolAuthority;
  if (!authority) return { state: "NOT_EVALUATED", authority_version: "NOT_EVALUATED", evidence_references: [] };
  if (!authority.version.trim()) throw new ConfigurationResolutionError("PROTOCOL_AUTHORITY_INVALID", "Protocol authority version must be explicit.");
  if (authority.state === "UNRESOLVED") addFinding(findings, input.canonicalAcquisition, "protocol_authority_unresolved", "WARNING", "Protocol authority did not establish eligibility; no requirement was invented.", [evidence(input.canonicalAcquisition, "protocol-authority")]);
  return { state: authority.state, authority_version: authority.version, evidence_references: [evidence(input.canonicalAcquisition, "protocol-authority")] };
}

function toEvidenceReference(reference: ConfigurationEvidenceReference, manifestEvidenceId: EvidenceReference["evidence_manifest_id"]): EvidenceReference {
  return {
    evidence_manifest_id: manifestEvidenceId,
    component: "ml105.configuration-resolver",
    locator: reference.locator,
    content_hash: reference.content_hash
  };
}

function assertInput(input: ConfigurationResolverInput): void {
  const canonical = input.canonicalAcquisition;
  const validation = validateEntity(canonical, "CanonicalAcquisition");
  if (!validation.valid) {
    const paths = validation.errors.map((error) => `${error.code}:${error.path}`).join(",");
    throw new ConfigurationResolutionError("CANONICAL_INVALID", `The canonical acquisition failed contract validation (${paths}).`);
  }
  if (
    canonical.manifest.source_observation_id !== canonical.source_observation_id
    || canonical.manifest.source_observation_sha256 !== canonical.source_observation_sha256
    || canonical.manifest.mapping_manifest_sha256 !== canonical.mapping_manifest_sha256
  ) throw new ConfigurationResolutionError("CANONICAL_LINEAGE_INVALID", "Canonical manifest lineage does not match the canonical acquisition.");
  if (input.sourceObservation && (
    input.sourceObservation.sourceArtifactId !== canonical.source_artifact_id
    || input.sourceObservation.sourceContentSha256 !== canonical.manifest.source_artifact_sha256
    || input.sourceObservation.observationSha256 !== canonical.source_observation_sha256
  )) throw new ConfigurationResolutionError("CANONICAL_LINEAGE_INVALID", "Source observation lineage does not match the canonical acquisition.");
}

export function resolveAcquisitionConfiguration(input: ConfigurationResolverInput): ConfigurationResolutionResult {
  assertInput(input);
  const canonical = input.canonicalAcquisition;
  const declarations = metadataDeclarations(input);
  const findings: ConfigurationFinding[] = [];
  const forceChannels = canonical.channels.filter((channel) => channel.physical_quantity.state === "KNOWN" && normalize(channel.physical_quantity.value ?? "") === "force");
  if (forceChannels.length === 0) addFinding(findings, canonical, "no_force_channel", "ERROR", "No canonical channel with an explicit force quantity was found.", [evidence(canonical, "canonical-acquisition.channels")]);

  const channelCapabilities = forceChannels.map((channel) => {
    const plate = sourcePlateDeclaration(input, channel);
    const refs = refsForChannel(input, channel);
    return {
      channel_id: channel.channel_id,
      physical_quantity: asSemantic(channel.physical_quantity),
      axis: asSemantic(channel.axis),
      sign: asSemantic(channel.sign_convention),
      plate_identity: plate.declaration,
      sample_count: channel.sample_count,
      evidence_references: refs
    };
  });

  const rate = sampleRate(input, declarations, findings);
  const sync = synchronization(input, forceChannels, declarations, findings);
  const axis = axisSign(input, forceChannels, declarations, findings);
  const preprocessing = processingFact<PreprocessingResolution>(input, declarations, (key) => key === "preprocessing" || key === "filter" || key === "filter_cutoff" || key === "resampling" || key === "resample", "preprocessing");
  const calibration = processingFact<CalibrationResolution>(input, declarations, (key) => key === "calibration" || key === "calibration_status", "calibration");
  const zeroing = processingFact<ZeroingResolution>(input, declarations, (key) => key === "zeroing" || key === "zeroing_status" || key === "tare", "zeroing");
  const protocol = protocolEligibility(input, findings);

  const forceReady = forceChannels.filter((channel) =>
    channel.quality_state === "QUALIFIED"
    && channel.unit.state === "KNOWN"
    && channel.axis.state === "KNOWN"
    && normalize(channel.axis.value ?? "") === "vertical"
    && channel.sign_convention.state === "KNOWN"
    && channel.sample_time.state === "KNOWN"
  );
  const singleReady = forceChannels.length === 1 && forceReady.length === 1 && rate.state === "RESOLVED";
  const plates = channelCapabilities.map((channel) => channel.plate_identity);
  const distinctPlates = plates.length === 2 && plates.every((plate) => plate.state === "KNOWN" && plate.value !== undefined) && new Set(plates.map((plate) => plate.value)).size === 2;
  const dualReady = forceChannels.length === 2 && forceReady.length === 2 && distinctPlates && rate.state === "RESOLVED" && sync.state === "SYNCHRONIZED";
  const acquisitionQualified = canonical.acquisition_state === "QUALIFIED" && canonical.quality_state === "QUALIFIED" && canonical.integrity_report.status === "QUALIFIED";

  let physicalContract: AcquisitionConfigurationContract;
  if (forceChannels.length === 1) {
    physicalContract = { contract: "single.total_fz", state: singleReady ? "RESOLVED" : "UNKNOWN", evidence_references: forceReady.flatMap((channel) => refsForChannel(input, channel)) };
  } else if (forceChannels.length === 2) {
    physicalContract = { contract: "dual.independent_fz", state: dualReady ? "RESOLVED" : sync.state === "UNSYNCHRONIZED" ? "UNSUPPORTED" : "UNKNOWN", evidence_references: forceChannels.flatMap((channel) => refsForChannel(input, channel)) };
  } else {
    physicalContract = { contract: forceChannels.length > 2 ? "UNSUPPORTED" : "UNKNOWN", state: forceChannels.length > 2 ? "UNSUPPORTED" : "UNKNOWN", evidence_references: [evidence(canonical, "canonical-acquisition.channels")] };
  }

  const conflict = rate.state === "CONFLICTING" || sync.state === "CONFLICTING" || axis.state === "CONFLICTING" || findings.some((finding) => finding.severity === "ERROR" && finding.code.endsWith("_conflicting"));
  const configurationState: AcquisitionConfigurationResolution["configuration_state"] = conflict
    ? "CONFLICTING_METADATA"
    : singleReady || dualReady
      ? acquisitionQualified ? "RESOLVED_QUALIFIED" : "RESOLVED_UNQUALIFIED"
      : forceChannels.length === 0 ? "UNRESOLVED"
        : physicalContract.state === "UNSUPPORTED" ? "RESOLVED_UNQUALIFIED"
          : "PARTIALLY_RESOLVED";

  const baseReferences = [evidence(canonical, "canonical-acquisition.manifest")];
  const evidenceManifestSha256 = canonical.manifest.evidence_references.find((reference) => reference.content_hash)?.content_hash;
  const semanticPayload = {
    resolver_version: CONFIGURATION_RESOLVER_VERSION,
    authority_version: CONFIGURATION_AUTHORITY_VERSION,
    source_artifact_id: canonical.source_artifact_id,
    source_observation_id: canonical.source_observation_id,
    canonical_acquisition_id: canonical.canonical_acquisition_id,
    canonical_identity_sha256: canonical.canonical_identity_sha256,
    ...(evidenceManifestSha256 === undefined ? {} : { evidence_manifest_sha256: evidenceManifestSha256 }),
    configuration_state: configurationState,
    physical_contract: physicalContract,
    channel_capabilities: channelCapabilities,
    sample_rate: rate,
    synchronization: sync,
    axis_sign: axis,
    preprocessing,
    calibration,
    zeroing,
    protocol_eligibility: protocol,
    findings,
    evidence_references: baseReferences
  };
  const resolution: AcquisitionConfigurationResolution = {
    ...semanticPayload,
    resolution_sha256: hashText(canonicalJson(semanticPayload))
  };
  const manifestEvidenceId = canonical.manifest.evidence_references[0]?.evidence_manifest_id ?? "evm_ml105_configuration" as EvidenceReference["evidence_manifest_id"];
  const contractEvidence = resolution.evidence_references.map((reference) => toEvidenceReference(reference, manifestEvidenceId));
  const reasonReferences: ReadonlyArray<ReasonReference> = findings.map((finding) => ({
    code: finding.code,
    description: finding.message,
    evidence_references: finding.evidence_references.map((reference) => toEvidenceReference(reference, manifestEvidenceId))
  }));
  const contract: ConfigurationContract = {
    entity_type: "ConfigurationContract",
    schema_id: "https://schemas.sportsagentslab.local/mef/1.0.0/configuration-contract.schema.json",
    schema_version: "1.0.0",
    configuration_contract_id: `cfg_${resolution.resolution_sha256.slice(0, 40)}` as ConfigurationContract["configuration_contract_id"],
    record_version: 1,
    created_at: (input.createdAt ?? new Date().toISOString()) as ConfigurationContract["created_at"],
    canonical_acquisition_id: canonical.canonical_acquisition_id,
    configuration_state: configurationState,
    configuration_name: physicalContract.state === "RESOLVED"
      ? { state: "KNOWN", value: physicalContract.contract, evidence_references: contractEvidence }
      : { state: "UNRESOLVED", reason: "The physical configuration contract remains unresolved.", evidence_references: contractEvidence },
    qualification_evidence_references: configurationState === "RESOLVED_QUALIFIED" ? contractEvidence : [],
    reason_references: reasonReferences,
    resolution
  };
  const contractValidation = validateEntity(contract, "ConfigurationContract");
  if (!contractValidation.valid) {
    const paths = contractValidation.errors.map((error) => `${error.code}:${error.path}`).join(",");
    throw new ConfigurationResolutionError("METADATA_INVALID", `The generated configuration contract failed validation (${paths}).`);
  }
  return { resolution, contract };
}
