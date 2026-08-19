import { createHash } from "node:crypto";
import type {
  AcquisitionConfigurationResolution,
  CanonicalAcquisition,
  ConfigurationEvidenceReference,
  EvidenceReference,
  SourceArtifact
} from "@mef/generated-ts";
import type { SourceObservation } from "@mef/ingestion-adk";
import {
  getCanonicalAcquisition,
  getSourceArtifact,
  getSourceObservation
} from "./source-import.ts";
import {
  getSourceImportConfiguration,
  resolveSourceImportConfiguration
} from "./configuration-resolution.ts";

type SourceArtifactInspection = NonNullable<Awaited<ReturnType<typeof getSourceArtifact>>>;
type SourceObservationInspection = NonNullable<Awaited<ReturnType<typeof getSourceObservation>>>;
type CanonicalAcquisitionInspection = NonNullable<Awaited<ReturnType<typeof getCanonicalAcquisition>>>;
type ConfigurationInspection = NonNullable<Awaited<ReturnType<typeof getSourceImportConfiguration>>>;

export interface MeasurementAgentRecords {
  readonly attempt: SourceArtifactInspection["attempt"];
  readonly sourceArtifact?: SourceArtifact;
  readonly sourceObservation?: SourceObservationInspection;
  readonly canonicalAcquisition?: CanonicalAcquisitionInspection;
  readonly configurationResolution?: ConfigurationInspection;
}

export const MEASUREMENT_METADATA_FIELDS = [
  "unit",
  "axis",
  "sign",
  "sample_rate",
  "synchronization",
  "preprocessing",
  "calibration",
  "zeroing",
  "configuration",
  "protocol_eligibility",
  "source_mapping",
  "canonical_mapping",
  "plate_identity",
  "source_observation",
  "canonical_acquisition",
  "configuration_resolution"
] as const;

export type MeasurementMetadataField = typeof MEASUREMENT_METADATA_FIELDS[number];
export type MissingMetadataStatus = "UNKNOWN" | "CONFLICTING" | "UNSUPPORTED" | "NOT_EVALUATED";
export type DownstreamProcessing = "ALLOWED" | "BLOCKED" | "REFUSED";

export interface MeasurementAgentRecordIds {
  readonly import_attempt_id: string;
  readonly source_artifact_id?: string;
  readonly source_observation_id?: string;
  readonly canonical_acquisition_id?: string;
  readonly configuration_resolution_id?: string;
  readonly configuration_contract_id?: string;
  readonly evidence_manifest_ids: ReadonlyArray<string>;
  readonly evidence_manifest_sha256?: string;
}

export interface MissingMetadataItem {
  readonly field: MeasurementMetadataField;
  readonly status: MissingMetadataStatus;
  readonly record_id: string;
  readonly reason: string;
  readonly evidence_references: ReadonlyArray<unknown>;
}

export class MeasurementAgentInputError extends Error {
  readonly code = "MEASUREMENT_AGENT_INPUT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "MeasurementAgentInputError";
  }
}

export const MEASUREMENT_AGENT_BOUNDARY = {
  raw_source_bytes_exposed: false,
  raw_signal_exposed: false,
  llm_biomechanics: false,
  llm_configuration_inference_authority: false,
  configuration_resolution_authority: "DETERMINISTIC_CODE_ONLY",
  human_mutation: "EXPLICIT_UI_PROPOSAL_AND_APPROVAL_ONLY"
} as const;

export async function readMeasurementAgentRecords(input: {
  readonly principal: Parameters<typeof getSourceArtifact>[0]["principal"];
  readonly importAttemptId: string;
}): Promise<MeasurementAgentRecords> {
  const artifact = await getSourceArtifact(input);
  if (!artifact) throw new MeasurementAgentInputError("The import attempt does not exist.");
  const [sourceObservation, canonicalAcquisition, configurationResolution] = await Promise.all([
    getSourceObservation(input),
    getCanonicalAcquisition(input),
    getSourceImportConfiguration(input)
  ]);
  return {
    attempt: artifact.attempt,
    sourceArtifact: artifact.sourceArtifact,
    sourceObservation,
    canonicalAcquisition,
    configurationResolution
  };
}

export function recordIds(records: MeasurementAgentRecords): MeasurementAgentRecordIds {
  const artifactId = records.sourceArtifact?.source_artifact_id ?? records.attempt.sourceArtifactId;
  const observationId = records.sourceObservation?.sourceObservationId ?? records.canonicalAcquisition?.sourceObservationId;
  const acquisitionId = records.canonicalAcquisition?.acquisition.canonical_acquisition_id;
  const configuration = records.configurationResolution;
  const evidenceManifestIds = new Set<string>();
  for (const reference of records.canonicalAcquisition?.acquisition.manifest.evidence_references ?? []) {
    evidenceManifestIds.add(reference.evidence_manifest_id);
  }
  return {
    import_attempt_id: records.attempt.importAttemptId,
    ...(artifactId === undefined ? {} : { source_artifact_id: artifactId }),
    ...(observationId === undefined ? {} : { source_observation_id: observationId }),
    ...(acquisitionId === undefined ? {} : { canonical_acquisition_id: acquisitionId }),
    ...(configuration === undefined ? {} : {
      configuration_resolution_id: configuration.resolution.resolution_sha256,
      configuration_contract_id: configuration.contract.configuration_contract_id,
      ...(configuration.resolution.evidence_manifest_sha256 === undefined
        ? {}
        : { evidence_manifest_sha256: configuration.resolution.evidence_manifest_sha256 })
    }),
    evidence_manifest_ids: [...evidenceManifestIds]
  };
}

export function provenanceForRecords(records: MeasurementAgentRecords) {
  const ids = recordIds(records);
  const evidenceReferences: Array<ConfigurationEvidenceReference | EvidenceReference> = [
    ...(records.canonicalAcquisition?.acquisition.manifest.evidence_references ?? []),
    ...(records.configurationResolution?.resolution.evidence_references ?? [])
  ];
  return {
    record_ids: ids,
    source_artifact: records.sourceArtifact === undefined ? undefined : {
      record_id: records.sourceArtifact.source_artifact_id,
      content_hash: records.sourceArtifact.content_hash,
      locator: "SourceArtifact.content_hash"
    },
    source_observation: records.sourceObservation === undefined ? undefined : {
      record_id: records.sourceObservation.sourceObservationId,
      observation_sha256: records.sourceObservation.observation.observationSha256,
      source_content_sha256: records.sourceObservation.observation.sourceContentSha256,
      locators: records.sourceObservation.observation.provenance.locators
    },
    canonical_acquisition: records.canonicalAcquisition === undefined ? undefined : {
      record_id: records.canonicalAcquisition.acquisition.canonical_acquisition_id,
      canonical_identity_sha256: records.canonicalAcquisition.acquisition.canonical_identity_sha256,
      mapping_manifest_sha256: records.canonicalAcquisition.acquisition.mapping_manifest_sha256,
      signal_artifact_sha256: records.canonicalAcquisition.acquisition.signal_artifact_sha256
    },
    configuration_resolution: records.configurationResolution === undefined ? undefined : {
      record_id: records.configurationResolution.resolution.resolution_sha256,
      canonical_identity_sha256: records.configurationResolution.resolution.canonical_identity_sha256,
      resolver_version: records.configurationResolution.resolution.resolver_version,
      authority_version: records.configurationResolution.resolution.authority_version,
      evidence_manifest_sha256: records.configurationResolution.resolution.evidence_manifest_sha256,
      evidence_references: records.configurationResolution.resolution.evidence_references
    },
    evidence_references: evidenceReferences
  };
}

export function attemptSummary(attempt: MeasurementAgentRecords["attempt"]) {
  return {
    import_attempt_id: attempt.importAttemptId,
    state: attempt.state,
    source_artifact_id: attempt.sourceArtifactId,
    original_filename: attempt.originalFilename,
    declared_content_type: attempt.declaredContentType,
    declared_size_bytes: attempt.declaredSizeBytes,
    actual_size_bytes: attempt.actualSizeBytes,
    content_hash: attempt.contentHash,
    scientific_eligibility: attempt.scientificEligibility
  };
}

function stateStatus(state: string): MissingMetadataStatus | undefined {
  if (state === "KNOWN" || state === "RESOLVED" || state === "CONFIRMED" || state === "DECLARED" || state === "ELIGIBLE") return undefined;
  if (state === "CONFLICTING" || state === "CONFLICTING_METADATA") return "CONFLICTING";
  if (state === "UNSUPPORTED" || state === "UNSYNCHRONIZED" || state === "INELIGIBLE") return "UNSUPPORTED";
  if (state === "NOT_EVALUATED") return "NOT_EVALUATED";
  if (state === "NOT_APPLICABLE") return undefined;
  return "UNKNOWN";
}

function addItem(
  items: MissingMetadataItem[],
  field: MeasurementMetadataField,
  status: MissingMetadataStatus,
  recordId: string,
  reason: string,
  evidenceReferences: ReadonlyArray<unknown> = []
): void {
  const existingIndex = items.findIndex((item) => item.field === field && item.record_id === recordId);
  if (existingIndex >= 0) {
    const priority: Record<MissingMetadataStatus, number> = { UNKNOWN: 1, NOT_EVALUATED: 2, CONFLICTING: 3, UNSUPPORTED: 4 };
    if (priority[status] > priority[items[existingIndex].status]) items[existingIndex] = { field, status, record_id: recordId, reason, evidence_references: evidenceReferences };
    return;
  }
  items.push({ field, status, record_id: recordId, reason, evidence_references: evidenceReferences });
}

function addDeclarationItem(
  items: MissingMetadataItem[],
  field: MeasurementMetadataField,
  recordId: string,
  declarations: ReadonlyArray<{ readonly state: string; readonly reason?: string; readonly evidence_references: ReadonlyArray<unknown> }>,
  label: string
): void {
  const unresolved = declarations.filter((declaration) => stateStatus(declaration.state) !== undefined);
  if (unresolved.length === 0) return;
  const status = unresolved.some((declaration) => stateStatus(declaration.state) === "CONFLICTING")
    ? "CONFLICTING"
    : unresolved.some((declaration) => stateStatus(declaration.state) === "UNSUPPORTED")
      ? "UNSUPPORTED"
      : unresolved.some((declaration) => stateStatus(declaration.state) === "NOT_EVALUATED")
        ? "NOT_EVALUATED"
        : "UNKNOWN";
  const evidenceReferences = unresolved.flatMap((declaration) => declaration.evidence_references);
  addItem(items, field, status, recordId, `${label} is ${status}; no value was inferred.`, evidenceReferences);
}

export function missingMetadataForRecords(records: MeasurementAgentRecords): ReadonlyArray<MissingMetadataItem> {
  const items: MissingMetadataItem[] = [];
  const ids = recordIds(records);
  if (records.sourceArtifact === undefined) {
    addItem(items, "source_observation", "UNKNOWN", ids.import_attempt_id, "No persisted SourceArtifact record is available for this import attempt.");
  }
  if (records.sourceObservation === undefined) {
    addItem(items, "source_observation", "UNKNOWN", ids.import_attempt_id, "SourceObservation is not available; adapter evidence is required.");
  }
  if (records.canonicalAcquisition === undefined) {
    addItem(items, "canonical_acquisition", "UNKNOWN", ids.import_attempt_id, "CanonicalAcquisition is not available; canonical mapping is required.");
  } else {
    const acquisition = records.canonicalAcquisition.acquisition;
    addDeclarationItem(items, "unit", acquisition.canonical_acquisition_id, acquisition.channels.map((channel) => channel.unit), "Channel unit");
    addDeclarationItem(items, "axis", acquisition.canonical_acquisition_id, acquisition.channels.map((channel) => channel.axis), "Channel axis");
    addDeclarationItem(items, "sign", acquisition.canonical_acquisition_id, acquisition.channels.map((channel) => channel.sign_convention), "Channel sign convention");
    addDeclarationItem(items, "source_mapping", acquisition.canonical_acquisition_id, acquisition.source_mappings.map((mapping) => mapping.mapping_state === "KNOWN"
      ? { state: "KNOWN", evidence_references: mapping.evidence_references }
      : { state: mapping.mapping_state, evidence_references: mapping.evidence_references }), "Source mapping");
    addDeclarationItem(items, "canonical_mapping", acquisition.canonical_acquisition_id, acquisition.source_mappings.map((mapping) => mapping.mapping_state === "KNOWN"
      ? { state: "KNOWN", evidence_references: mapping.evidence_references }
      : { state: mapping.mapping_state, evidence_references: mapping.evidence_references }), "Canonical mapping");
    if (acquisition.acquisition_state === "REJECTED") {
      addItem(items, "canonical_acquisition", "UNSUPPORTED", acquisition.canonical_acquisition_id, "CanonicalAcquisition is rejected; downstream processing is refused.", acquisition.blocking_reasons);
    }
    if (["UNSUPPORTED", "REJECTED"].includes(acquisition.quality_state)) {
      addItem(items, "canonical_acquisition", "UNSUPPORTED", acquisition.canonical_acquisition_id, "CanonicalAcquisition quality is unsupported or rejected; downstream processing is refused.", acquisition.blocking_reasons);
    }
  }

  const configuration = records.configurationResolution;
  if (configuration === undefined) {
    addItem(items, "configuration_resolution", "NOT_EVALUATED", ids.import_attempt_id, "ConfigurationResolution has not been recorded; deterministic resolution must run before processing.");
    addItem(items, "configuration", "NOT_EVALUATED", ids.import_attempt_id, "Configuration qualification is not evaluated without a ConfigurationResolution record.");
    return items;
  }

  const resolution = configuration.resolution;
  const resolutionId = resolution.resolution_sha256;
  const references = (value: { readonly evidence_references: ReadonlyArray<ConfigurationEvidenceReference> }) => value.evidence_references;
  const addResolution = (field: MeasurementMetadataField, value: { readonly state: string; readonly evidence_references: ReadonlyArray<ConfigurationEvidenceReference> }, label: string) => {
    const status = stateStatus(value.state);
    if (status !== undefined) addItem(items, field, status, resolutionId, `${label} is ${status}; no value was inferred.`, references(value));
  };
  addResolution("sample_rate", resolution.sample_rate, "Sample rate");
  if (stateStatus(resolution.axis_sign.state) !== undefined) {
    addResolution("axis", resolution.axis_sign, "Resolved axis");
    addResolution("sign", resolution.axis_sign, "Resolved sign convention");
  }
  addResolution("synchronization", resolution.synchronization, "Synchronization");
  addResolution("preprocessing", resolution.preprocessing, "Preprocessing");
  addResolution("calibration", resolution.calibration, "Calibration");
  addResolution("zeroing", resolution.zeroing, "Zeroing");
  addResolution("protocol_eligibility", resolution.protocol_eligibility, "Protocol eligibility");
  if (resolution.physical_contract.state !== "RESOLVED") {
    addItem(items, "configuration", stateStatus(resolution.physical_contract.state) ?? "UNKNOWN", resolutionId, "The physical configuration contract is not resolved; downstream processing remains blocked.", resolution.physical_contract.evidence_references);
  }
  for (const capability of resolution.channel_capabilities) {
    addDeclarationItem(items, "plate_identity", resolutionId, [capability.plate_identity], `Plate identity for ${capability.channel_id}`);
  }
  if (resolution.configuration_state === "CONFLICTING_METADATA") {
    addItem(items, "configuration", "CONFLICTING", resolutionId, "ConfigurationResolution contains conflicting metadata; the conflict must be surfaced to a practitioner.", resolution.evidence_references);
  }
  if (resolution.physical_contract.state === "UNSUPPORTED") {
    addItem(items, "configuration", "UNSUPPORTED", resolutionId, "The acquisition contract is unsupported; downstream processing is refused.", resolution.physical_contract.evidence_references);
  }
  return items;
}

export function downstreamProcessingForRecords(records: MeasurementAgentRecords): DownstreamProcessing {
  if (["UNSUPPORTED", "MALFORMED", "BLOCKED", "CANCELLED"].includes(records.attempt.state)) return "REFUSED";
  const configuration = records.configurationResolution?.resolution;
  if (configuration === undefined) return "BLOCKED";
  const acquisition = records.canonicalAcquisition?.acquisition;
  if (acquisition && (["UNSUPPORTED", "REJECTED"].includes(acquisition.quality_state) || acquisition.acquisition_state === "REJECTED")) return "REFUSED";
  if (configuration.physical_contract.state === "UNSUPPORTED" || configuration.protocol_eligibility.state === "INELIGIBLE") return "REFUSED";
  if (missingMetadataForRecords(records).some((item) => item.status === "UNSUPPORTED")) return "REFUSED";
  if (configuration.configuration_state !== "RESOLVED_QUALIFIED" || configuration.protocol_eligibility.state !== "ELIGIBLE") return "BLOCKED";
  return "ALLOWED";
}

export function measurementAgentEnvelope(records: MeasurementAgentRecords) {
  return {
    record_ids: recordIds(records),
    provenance: provenanceForRecords(records),
    downstream_processing: downstreamProcessingForRecords(records),
    human_authority: {
      mutation: "NONE",
      qualification_mutation: "NOT_PERFORMED",
      practitioner_confirmation_required: true
    },
    llm_boundary: MEASUREMENT_AGENT_BOUNDARY
  } as const;
}

export function missingMetadataStatus(items: ReadonlyArray<MissingMetadataItem>): "COMPLETE" | "MISSING" | "CONFLICTING" | "UNSUPPORTED" {
  if (items.some((item) => item.status === "UNSUPPORTED")) return "UNSUPPORTED";
  if (items.some((item) => item.status === "CONFLICTING")) return "CONFLICTING";
  return items.length === 0 ? "COMPLETE" : "MISSING";
}

export function practitionerQuestion(field: MeasurementMetadataField, item: MissingMetadataItem, prompt?: string): string {
  return prompt?.trim() || `Please confirm the ${field.replaceAll("_", " ")} for record ${item.record_id}. The current evidence is ${item.status}; the agent will not infer it.`;
}

export function practitionerRequestKey(records: MeasurementAgentRecords, field: MeasurementMetadataField, item: MissingMetadataItem): string {
  return createHash("sha256")
    .update(`${records.attempt.importAttemptId}\0${field}\0${item.record_id}\0${item.status}`)
    .digest("hex");
}

export function uiRecordPath(input: {
  readonly records: MeasurementAgentRecords;
  readonly recordType: "import_attempt" | "source_artifact" | "source_observation" | "canonical_acquisition" | "configuration_resolution" | "configuration_contract" | "evidence_manifest" | "provenance";
  readonly recordId: string;
}): string {
  const ids = recordIds(input.records);
  const expected: Partial<Record<typeof input.recordType, string | undefined>> = {
    import_attempt: ids.import_attempt_id,
    source_artifact: ids.source_artifact_id,
    source_observation: ids.source_observation_id,
    canonical_acquisition: ids.canonical_acquisition_id,
    configuration_resolution: ids.configuration_resolution_id,
    configuration_contract: ids.configuration_contract_id
  };
  if (input.recordType === "evidence_manifest" || input.recordType === "provenance") {
    if (!ids.evidence_manifest_ids.includes(input.recordId)) throw new MeasurementAgentInputError("The evidence manifest ID is not part of this import provenance.");
  } else if (expected[input.recordType] !== input.recordId) {
    throw new MeasurementAgentInputError("The requested record ID is not the exact ID for this import.");
  }
  switch (input.recordType) {
    case "import_attempt": return `/imports/${input.recordId}`;
    case "source_artifact": return `/imports/artifacts/${input.recordId}`;
    case "source_observation": return `/imports/${ids.import_attempt_id}#observation`;
    case "canonical_acquisition": return `/imports/artifacts/${ids.source_artifact_id ?? ""}/acquisition`;
    case "configuration_resolution":
    case "configuration_contract": return `/imports/${ids.import_attempt_id}#configuration`;
    case "evidence_manifest": return `/evidence/${input.recordId}`;
    case "provenance": return `/evidence/${input.recordId}/provenance`;
  }
}

export async function resolveMeasurementConfiguration(input: {
  readonly principal: Parameters<typeof getSourceArtifact>[0]["principal"];
  readonly importAttemptId: string;
}) {
  const result = await resolveSourceImportConfiguration(input);
  const records = await readMeasurementAgentRecords(input);
  return {
    ...measurementAgentEnvelope(records),
    tool: "resolve_configuration",
    status: result.status,
    resolution: result.resolution,
    contract: result.contract,
    machine_result_only: true,
    qualification_mutation: "NOT_PERFORMED",
    human_approval_required: true
  } as const;
}

export type ConfigurationResolution = AcquisitionConfigurationResolution;
