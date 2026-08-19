"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type {
  AcquisitionConfigurationResolution,
  CanonicalAcquisition,
  ConfigurationContract,
  ConfigurationEvidenceReference,
  ConfigurationFinding,
  SemanticDeclaration
} from "@mef/generated-ts";
import type { DeclaredValue, ObservedField, SourceObservation } from "@mef/ingestion-adk";
import type { Edge, Node } from "@xyflow/react";
import { MefIcon } from "./mef-icons";
import { MefBadge, MefButton, MefPanel, MefPanelHeader, MefSkeleton } from "./mef-primitives";

const MefProvenanceGraph = dynamic(() => import("./mef/provenance/mef-provenance-graph").then((module) => module.MefProvenanceGraph), {
  ssr: false,
  loading: () => <div className="mef-flow-canvas" role="status"><MefSkeleton lines={3} /></div>
});

type Attempt = {
  importAttemptId: string;
  organizationId: string;
  workspaceId: string;
  principalId: string;
  sourceArtifactId?: string;
  originalFilename: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  actualSizeBytes?: number;
  contentHash?: string;
  storageKey?: string;
  state: string;
  failureCode?: string;
  safeFailureDetail?: string;
  createdAt: string;
  finalizedAt?: string;
  duplicateOfImportAttemptId?: string;
  athleteId?: string;
  sessionId?: string;
  auditEventId?: string;
  scientificEligibility: "INELIGIBLE";
};

type Event = {
  eventId: string;
  eventCode: string;
  fromState?: string;
  toState?: string;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

type Detail = { attempt: Attempt; events: Event[] };
type ObservationResponse = { attempt: Attempt; sourceObservationId: string; observation: SourceObservation };
type CanonicalResponse = { status: string; attempt: Attempt; sourceObservationId: string; acquisition: CanonicalAcquisition };
type ConfigurationResponse = {
  status: string;
  attempt: Attempt;
  sourceObservationId: string;
  resolution: AcquisitionConfigurationResolution;
  contract: ConfigurationContract;
};

type OriginLabel = "DETECTED" | "SOURCE-DECLARED" | "ADAPTER-QUALIFIED" | "PRACTITIONER-CONFIRMED" | "INFERRED" | "UNKNOWN" | "CONFLICTING";

const origins: ReadonlyArray<{ label: OriginLabel; detail: string }> = [
  { label: "DETECTED", detail: "present in the observed source structure" },
  { label: "SOURCE-DECLARED", detail: "declared by the source metadata" },
  { label: "ADAPTER-QUALIFIED", detail: "accepted by the qualified adapter/canonical contract" },
  { label: "PRACTITIONER-CONFIRMED", detail: "explicit human confirmation; none recorded here" },
  { label: "INFERRED", detail: "inference; none is used by ML-105" },
  { label: "UNKNOWN", detail: "not established by available evidence" },
  { label: "CONFLICTING", detail: "evidence does not agree" }
];

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "UNKNOWN";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function jsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : "The import request failed.";
    throw new Error(message);
  }
  return payload as T;
}

async function optionalJson<T>(path: string): Promise<T | undefined> {
  const response = await fetch(path, { cache: "no-store" });
  if (response.status === 404) return undefined;
  return jsonResponse<T>(response);
}

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 16)}…${value.slice(-10)}` : "UNKNOWN";
}

function originForDeclared(value: DeclaredValue): OriginLabel {
  if (value.status === "conflicting") return "CONFLICTING";
  if (value.status === "unknown") return "UNKNOWN";
  return "SOURCE-DECLARED";
}

function originForSemantic(value: { state: string }): OriginLabel {
  if (value.state === "UNKNOWN" || value.state === "UNRESOLVED" || value.state === "UNSUPPORTED" || value.state === "ABSENT") return "UNKNOWN";
  if (value.state === "CONFLICTING") return "CONFLICTING";
  return "ADAPTER-QUALIFIED";
}

function originForResolution(state: string, source?: string): OriginLabel {
  if (state === "CONFLICTING") return "CONFLICTING";
  if (state === "UNKNOWN" || state === "UNRESOLVED" || state === "NOT_EVALUATED") return "UNKNOWN";
  if (source === "EXPLICIT_SOURCE_DECLARATION") return "SOURCE-DECLARED";
  return "ADAPTER-QUALIFIED";
}

function declaredText(value: DeclaredValue): string {
  if (value.value !== undefined) return value.value;
  if (value.values?.length) return value.values.join(" / ");
  return value.status.toUpperCase();
}

function semanticText(value: SemanticDeclaration | undefined): string {
  if (!value) return "UNKNOWN";
  return value.value ?? value.reason ?? value.state;
}

function safeText(value: string | number | undefined | null): string {
  return value === undefined || value === null || value === "" ? "UNKNOWN" : String(value);
}

function classForState(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

function OriginChip({ label }: Readonly<{ label: OriginLabel }>) {
  return <span className={`ml106-origin ml106-origin-${classForState(label)}`}>{label}</span>;
}

function ResolutionState({ state }: Readonly<{ state: string }>) {
  return <span className={`ml106-resolution-state ml106-resolution-${classForState(state)}`}>{state}</span>;
}

function DeclaredCell({ value }: Readonly<{ value: DeclaredValue }>) {
  return <span className="ml106-cell-value"><strong>{declaredText(value)}</strong><OriginChip label={originForDeclared(value)} /></span>;
}

function SemanticCell({ value }: Readonly<{ value: SemanticDeclaration }>) {
  return <span className="ml106-cell-value"><strong>{semanticText(value)}</strong><OriginChip label={originForSemantic(value)} /></span>;
}

function Fact({ label, value, origin, mono = false, detail }: Readonly<{ label: string; value: React.ReactNode; origin?: OriginLabel; mono?: boolean; detail?: string }>) {
  return (
    <div className="ml106-fact">
      <span className="ml106-fact-label">{label}{origin ? <OriginChip label={origin} /> : null}</span>
      <strong className={mono ? "ml106-mono" : undefined}>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function Disclosure({ eyebrow, title, detail, children, open = true }: Readonly<{ eyebrow: string; title: string; detail: string; children: React.ReactNode; open?: boolean }>) {
  return (
    <details className="ml106-disclosure" open={open}>
      <summary>
        <span className="ml106-disclosure-copy"><span className="mef-kicker">{eyebrow}</span><strong>{title}</strong><small>{detail}</small></span>
        <span className="ml106-disclosure-icon"><MefIcon name="chevron" size={16} /></span>
      </summary>
      <div className="ml106-disclosure-content">{children}</div>
    </details>
  );
}

function EmptyNotice({ title, detail, action }: Readonly<{ title: string; detail: string; action?: React.ReactNode }>) {
  return <div className="ml106-empty-notice"><MefIcon name="alert" size={17} /><div><strong>{title}</strong><p>{detail}</p>{action ? <div className="ml106-empty-action">{action}</div> : null}</div></div>;
}

function Dimension({ label, value, detail, origin }: Readonly<{ label: string; value: string; detail?: string; origin: OriginLabel }>) {
  return <div className="ml106-dimension"><span>{label}<OriginChip label={origin} /></span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function findingReferences(finding: ConfigurationFinding): string {
  return finding.evidence_references.length ? `${finding.evidence_references.length} evidence link${finding.evidence_references.length === 1 ? "" : "s"}` : "No evidence link";
}

function configurationMissing(configuration: ConfigurationResponse | undefined): string[] {
  if (!configuration) return [];
  const resolution = configuration.resolution;
  const missing: string[] = [];
  if (resolution.sample_rate.state !== "RESOLVED") missing.push(`Sample rate is ${resolution.sample_rate.state}.`);
  if (resolution.synchronization.state === "UNKNOWN" || resolution.synchronization.state === "CONFLICTING") missing.push(`Synchronization is ${resolution.synchronization.state}.`);
  if (resolution.axis_sign.state !== "RESOLVED") missing.push(`Axis/sign is ${resolution.axis_sign.state}.`);
  if (resolution.preprocessing.state === "UNKNOWN" || resolution.preprocessing.state === "CONFLICTING") missing.push(`Preprocessing is ${resolution.preprocessing.state}.`);
  if (resolution.calibration.state === "UNKNOWN" || resolution.calibration.state === "CONFLICTING") missing.push(`Calibration is ${resolution.calibration.state}.`);
  if (resolution.zeroing.state === "UNKNOWN" || resolution.zeroing.state === "CONFLICTING") missing.push(`Zeroing is ${resolution.zeroing.state}.`);
  if (resolution.protocol_eligibility.state === "UNRESOLVED" || resolution.protocol_eligibility.state === "NOT_EVALUATED") missing.push(`Protocol eligibility is ${resolution.protocol_eligibility.state}.`);
  return missing;
}

function blockingFindings(acquisition: CanonicalAcquisition | undefined, configuration: ConfigurationResponse | undefined): string[] {
  const reasons = acquisition?.blocking_reasons.map((reason) => `${reason.code}: ${reason.description}`) ?? [];
  const integrity = acquisition?.integrity_report.findings
    .filter((finding) => finding.severity === "ERROR")
    .map((finding) => `${finding.code}: ${finding.message}`) ?? [];
  const resolution = configuration?.resolution.findings
    .filter((finding) => finding.severity === "ERROR")
    .map((finding) => `${finding.code}: ${finding.message}`) ?? [];
  return [...new Set([...reasons, ...integrity, ...resolution])];
}

function sourceFieldLocator(field: ObservedField): string {
  return JSON.stringify(field.locator);
}

function evidenceRows(resolution: AcquisitionConfigurationResolution): ReadonlyArray<ConfigurationEvidenceReference> {
  const seen = new Set<string>();
  return resolution.evidence_references.filter((reference) => {
    const key = `${reference.locator}:${reference.content_hash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function SourceImportDetail({ importAttemptId }: Readonly<{ importAttemptId: string }>) {
  const reducedMotion = useReducedMotion();
  const [detail, setDetail] = useState<Detail>();
  const [observation, setObservation] = useState<ObservationResponse>();
  const [acquisition, setAcquisition] = useState<CanonicalResponse>();
  const [configuration, setConfiguration] = useState<ConfigurationResponse>();
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState<"finalize" | "cancel" | "observation" | "canonical" | "resolve" | undefined>();

  const loadDetail = useCallback(async () => {
    try {
      const next = await jsonResponse<Detail>(await fetch(`/api/imports/${importAttemptId}`, { cache: "no-store" }));
      let nextObservation: ObservationResponse | undefined;
      let nextAcquisition: CanonicalResponse | undefined;
      let nextConfiguration: ConfigurationResponse | undefined;
      if (next.attempt.sourceArtifactId) {
        [nextObservation, nextAcquisition, nextConfiguration] = await Promise.all([
          optionalJson<ObservationResponse>(`/api/imports/${importAttemptId}/observation`),
          optionalJson<CanonicalResponse>(`/api/imports/${importAttemptId}/canonical-acquisition`),
          optionalJson<ConfigurationResponse>(`/api/imports/${importAttemptId}/configuration-resolution`)
        ]);
      }
      setDetail(next);
      setObservation(nextObservation);
      setAcquisition(nextAcquisition);
      setConfiguration(nextConfiguration);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import attempt could not be loaded.");
    }
  }, [importAttemptId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  const attemptState = detail?.attempt.state;
  useEffect(() => {
    if (!attemptState || !["UPLOADED", "IDENTIFYING", "STORED", "STORAGE_FAILED", "HASH_FAILED", "FINALIZATION_FAILED"].includes(attemptState)) return;
    const timer = window.setInterval(() => void loadDetail(), 2500);
    return () => window.clearInterval(timer);
  }, [attemptState, loadDetail]);

  async function runAction(action: "finalize" | "cancel" | "observation" | "canonical" | "resolve", path: string) {
    setBusy(action);
    setActionError(undefined);
    try {
      await jsonResponse(await fetch(path, { method: "POST" }));
      await loadDetail();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The requested step could not be completed.");
      await loadDetail();
    } finally {
      setBusy(undefined);
    }
  }

  if (error) return <section className="mef-panel source-import-detail"><p className="source-import-error" role="alert">{error}</p><Link className="mef-button mef-button-secondary" href="/imports">Back to imports</Link></section>;
  if (!detail) return <section className="mef-panel source-import-detail"><p className="mef-kicker">ML-106 / B01-05</p><h1>Loading acquisition review…</h1><MefSkeleton lines={6} /></section>;

  const { attempt, events } = detail;
  const sourceObservation = observation?.observation;
  const canonical = acquisition?.acquisition;
  const resolution = configuration?.resolution;
  const canDownload = Boolean(attempt.contentHash) && attempt.state !== "UPLOAD_FAILED";
  const canRetry = ["UPLOADED", "IDENTIFYING", "STORED", "STORAGE_FAILED", "HASH_FAILED", "FINALIZATION_FAILED"].includes(attempt.state);
  const canCancel = ["CREATED", "UPLOAD_AUTHORIZED", "UPLOADING", "UPLOADED", "IDENTIFYING", "IDENTIFIED"].includes(attempt.state);
  const canInspect = attempt.state === "READY_FOR_ADAPTER";
  const canCanonicalize = canInspect && Boolean(sourceObservation);
  const canResolve = Boolean(canonical && sourceObservation);
  const missing = configurationMissing(configuration);
  const blocking = blockingFindings(canonical, configuration);
  const nextStep = !sourceObservation
    ? "Inspect the detected source structure."
    : !canonical
      ? "Create the CanonicalAcquisition from the inspected source."
      : !resolution
        ? "Run ML-105 configuration resolution."
        : resolution.configuration_state === "RESOLVED_QUALIFIED"
          ? "Configuration is resolved and qualified for this contract."
          : "Review the missing or conflicting evidence before processing.";
  const systemInterpretation = resolution?.physical_contract.contract
    ?? canonical?.modality.value
    ?? (sourceObservation ? "Source structure detected; physical contract not resolved." : "Source artifact only; no measurement interpretation yet.");
  const processingState = resolution?.configuration_state ?? (canonical ? "NOT_EVALUATED" : sourceObservation ? "CANONICAL_ACQUISITION_REQUIRED" : attempt.state);

  const provenanceNodes: Node[] = [
    { id: "source", position: { x: 0, y: 76 }, data: { label: `SourceArtifact\n${attempt.sourceArtifactId ?? "not established"}` }, type: "input" },
    { id: "observation", position: { x: 210, y: 76 }, data: { label: `SourceObservation\n${observation?.sourceObservationId ?? "not inspected"}` } },
    { id: "canonical", position: { x: 420, y: 76 }, data: { label: `CanonicalAcquisition\n${canonical?.canonical_acquisition_id ?? "not created"}` } },
    { id: "configuration", position: { x: 630, y: 76 }, data: { label: `ConfigurationContract\n${configuration?.contract.configuration_contract_id ?? "not resolved"}` }, type: "output" }
  ];
  const provenanceEdges: Edge[] = [
    { id: "source-observation", source: "source", target: "observation", label: sourceObservation ? "observed by" : "awaiting" },
    { id: "observation-canonical", source: "observation", target: "canonical", label: canonical ? "mapped to" : "awaiting" },
    { id: "canonical-configuration", source: "canonical", target: "configuration", label: resolution ? "resolved by ML-105" : "awaiting" }
  ];

  return (
    <div className="ml106-workflow" aria-labelledby="ml106-title">
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="ml106-workflow-header"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
      >
        <div>
          <Link className="mef-button mef-button-tertiary mef-button-sm" href="/imports"><MefIcon name="arrow" size={14} />Imports</Link>
          <p className="mef-kicker">ML-106 / B01-05 · practitioner review</p>
          <h1 id="ml106-title">{attempt.originalFilename}</h1>
          <p className="ml106-workflow-summary">Trace one source artifact from upload through detected structure, canonical mapping, and ML-105 configuration resolution. Values are shown with their evidence origin; unknown remains unknown.</p>
        </div>
        <div className="ml106-workflow-header-status"><ResolutionState state={processingState} /><MefBadge tone="violet">{attempt.scientificEligibility}</MefBadge></div>
      </motion.header>

      <div className="ml106-boundary-ribbon"><MefIcon name="shield" size={15} /><strong>Measurement boundary</strong><span>No CMJ biomechanics or scientific metrics are calculated here.</span><span className="ml106-boundary-spacer" /><span>Original bytes remain source-of-truth</span></div>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="ml106-summary-grid"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        transition={{ delay: reducedMotion ? 0 : 0.04, duration: reducedMotion ? 0 : 0.18 }}
      >
        <MefPanel className="ml106-summary-card">
          <div className="ml106-summary-card-heading"><div><p className="mef-kicker">SUMMARY · system interpretation</p><h2>What does the system think this acquisition is?</h2></div><ResolutionState state={processingState} /></div>
          <div className="ml106-interpretation"><span>Physical contract</span><strong>{systemInterpretation}</strong><small>{resolution ? `Resolution state: ${resolution.configuration_state}.` : nextStep}</small></div>
          <div className="ml106-summary-facts">
            <Fact label="Import state" value={attempt.state} origin="DETECTED" />
            <Fact label="Adapter" value={sourceObservation ? `${sourceObservation.adapterExecution.adapterId} · ${sourceObservation.adapterExecution.qualification}` : "Not inspected"} origin={sourceObservation ? "ADAPTER-QUALIFIED" : "UNKNOWN"} />
            <Fact label="Canonical state" value={canonical?.acquisition_state ?? "Not created"} origin={canonical ? originForSemantic({ state: canonical.acquisition_state }) : "UNKNOWN"} />
            <Fact label="Protocol eligibility" value={resolution?.protocol_eligibility.state ?? "NOT_EVALUATED"} origin={resolution ? originForResolution(resolution.protocol_eligibility.state) : "UNKNOWN"} />
          </div>
        </MefPanel>
        <MefPanel className="ml106-posture-card">
          <MefPanelHeader eyebrow="PROCESSING POSTURE" title={blocking.length ? "Processing is blocked" : resolution?.configuration_state === "RESOLVED_QUALIFIED" ? "Processing is resolved" : "Processing needs evidence"} />
          <div className={`ml106-posture-state ${blocking.length ? "is-blocked" : resolution?.configuration_state === "RESOLVED_QUALIFIED" ? "is-qualified" : "is-review"}`}><MefIcon name={blocking.length ? "lock" : resolution?.configuration_state === "RESOLVED_QUALIFIED" ? "check" : "alert"} size={18} /><strong>{blocking.length ? `${blocking.length} blocking finding${blocking.length === 1 ? "" : "s"}` : resolution?.configuration_state === "RESOLVED_QUALIFIED" ? "No blocking finding recorded" : "Evidence still required"}</strong></div>
          <p className="ml106-posture-copy">{nextStep}</p>
          {blocking.length ? <ul className="ml106-compact-list">{blocking.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : missing.length ? <ul className="ml106-compact-list">{missing.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="ml106-posture-copy">The current evidence chain does not claim an unsupported result.</p>}
        </MefPanel>
      </motion.section>

      <MefPanel className="ml106-action-panel" aria-label="Workflow actions">
        <div className="ml106-action-copy"><p className="mef-kicker">CONTROLLED ACTIONS</p><strong>Advance only the evidence that is actually available.</strong><span>Each action is server-backed and idempotent. No browser-only configuration value is saved.</span></div>
        <div className="ml106-action-buttons">
          {canDownload ? <a className="mef-button mef-button-secondary mef-button-sm" href={`/api/imports/${attempt.importAttemptId}/original`}><MefIcon name="database" size={14} />Original bytes</a> : null}
          {canRetry ? <MefButton size="sm" loading={busy === "finalize"} disabled={Boolean(busy)} onClick={() => void runAction("finalize", `/api/imports/${importAttemptId}`)}>Retry finalization</MefButton> : null}
          {canCancel ? <MefButton tone="tertiary" size="sm" disabled={Boolean(busy)} onClick={() => void runAction("cancel", `/api/imports/${importAttemptId}/cancel`)}>Cancel attempt</MefButton> : null}
          {canInspect ? <MefButton tone="secondary" size="sm" loading={busy === "observation"} disabled={Boolean(busy)} onClick={() => void runAction("observation", `/api/imports/${importAttemptId}/inspect`)}>{sourceObservation ? "Refresh structure" : "Inspect source structure"}</MefButton> : null}
          {canCanonicalize ? <MefButton size="sm" loading={busy === "canonical"} disabled={Boolean(busy)} onClick={() => void runAction("canonical", `/api/imports/${importAttemptId}/canonicalize`)}>{canonical ? "Refresh canonical" : "Create canonical acquisition"}</MefButton> : null}
          {canResolve ? <MefButton tone="violet" size="sm" loading={busy === "resolve"} disabled={Boolean(busy)} onClick={() => void runAction("resolve", `/api/imports/${importAttemptId}/resolve-configuration`)}>{resolution ? "Re-run ML-105 resolution" : "Resolve configuration"}</MefButton> : null}
        </div>
        {actionError ? <p className="source-import-error" role="alert">{actionError}</p> : null}
      </MefPanel>

      <Disclosure eyebrow="CONFIGURATION" title="Canonical acquisition and ML-105 resolution" detail="The contract, dimensions, qualification state, and missing evidence stay together.">
        {canonical ? <>
          <div className="ml106-fact-grid">
            <Fact label="CanonicalAcquisition" value={canonical.canonical_acquisition_id} origin="ADAPTER-QUALIFIED" mono />
            <Fact label="Acquisition state" value={canonical.acquisition_state} origin={originForSemantic({ state: canonical.acquisition_state })} />
            <Fact label="Integrity" value={`${canonical.integrity_report.status} · ${canonical.integrity_report.finding_count} finding${canonical.integrity_report.finding_count === 1 ? "" : "s"}`} origin={canonical.integrity_report.status === "QUALIFIED" ? "ADAPTER-QUALIFIED" : canonical.integrity_report.status === "REVIEW_REQUIRED" ? "UNKNOWN" : "CONFLICTING"} />
            <Fact label="Records / channels" value={`${canonical.integrity_report.record_count} / ${canonical.integrity_report.channel_count}`} origin="DETECTED" />
            <Fact label="Canonicalizer" value={canonical.canonicalizer_version} origin="ADAPTER-QUALIFIED" />
            <Fact label="Timebase" value={canonical.timebase.sample_rate_hz ? `${canonical.timebase.sample_rate_hz} Hz` : canonical.timebase.sample_interval_seconds ? `${canonical.timebase.sample_interval_seconds} s interval` : canonical.timebase.state} origin={originForSemantic(canonical.timebase)} />
          </div>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">ML-105 configuration contract</p><h3>{resolution ? resolution.physical_contract.contract : "Configuration not yet resolved"}</h3></div>{resolution ? <ResolutionState state={resolution.configuration_state} /> : null}</div>
          {resolution ? <>
            <div className="ml106-dimension-grid">
              <Dimension label="Physical contract" value={resolution.physical_contract.contract} detail={resolution.physical_contract.state} origin={originForResolution(resolution.physical_contract.state)} />
              <Dimension label="Sample rate" value={resolution.sample_rate.sample_rate_hz ? `${resolution.sample_rate.sample_rate_hz} Hz` : resolution.sample_rate.state} detail={resolution.sample_rate.source} origin={originForResolution(resolution.sample_rate.state, resolution.sample_rate.source)} />
              <Dimension label="Synchronization" value={resolution.synchronization.state} origin={originForResolution(resolution.synchronization.state)} />
              <Dimension label="Axis / sign" value={resolution.axis_sign.axis && resolution.axis_sign.sign ? `${resolution.axis_sign.axis} / ${resolution.axis_sign.sign}` : resolution.axis_sign.state} origin={originForResolution(resolution.axis_sign.state)} />
              <Dimension label="Preprocessing" value={resolution.preprocessing.description ?? resolution.preprocessing.state} origin={originForResolution(resolution.preprocessing.state)} />
              <Dimension label="Calibration" value={resolution.calibration.description ?? resolution.calibration.state} origin={originForResolution(resolution.calibration.state)} />
              <Dimension label="Zeroing" value={resolution.zeroing.description ?? resolution.zeroing.state} origin={originForResolution(resolution.zeroing.state)} />
              <Dimension label="Protocol eligibility" value={resolution.protocol_eligibility.state} detail={resolution.protocol_eligibility.authority_version} origin={originForResolution(resolution.protocol_eligibility.state)} />
            </div>
            <div className="ml106-subsection-heading"><div><p className="mef-kicker">Capability evidence</p><h3>Channels and plate membership</h3></div><span className="ml106-table-note">No biomechanics are calculated</span></div>
            <div className="ml106-table-wrap"><table className="ml106-table"><caption>Resolved channel capabilities</caption><thead><tr><th scope="col">Channel</th><th scope="col">Quantity</th><th scope="col">Axis / sign</th><th scope="col">Plate</th><th scope="col">Samples</th></tr></thead><tbody>{resolution.channel_capabilities.map((channel) => <tr key={channel.channel_id}><th scope="row"><code>{channel.channel_id}</code></th><td><SemanticCell value={channel.physical_quantity} /></td><td>{safeText(channel.axis.value)} / {safeText(channel.sign.value)}<OriginChip label={originForSemantic(channel.axis)} /></td><td><SemanticCell value={channel.plate_identity} /></td><td>{channel.sample_count}</td></tr>)}</tbody></table></div>
          </> : <EmptyNotice title="Configuration resolution has not been recorded" detail="The canonical acquisition is available. Run the server-side ML-105 resolver to see the contract and why processing is or is not qualified." action={canResolve ? <MefButton tone="violet" size="sm" loading={busy === "resolve"} disabled={Boolean(busy)} onClick={() => void runAction("resolve", `/api/imports/${importAttemptId}/resolve-configuration`)}>Resolve configuration</MefButton> : undefined} />}
        </> : <EmptyNotice title="CanonicalAcquisition is not available" detail={sourceObservation ? "The source structure is inspected, but canonical mapping has not been created." : "Inspect the source structure first. No canonical or configuration value is fabricated while upstream evidence is missing."} action={canCanonicalize ? <MefButton size="sm" loading={busy === "canonical"} disabled={Boolean(busy)} onClick={() => void runAction("canonical", `/api/imports/${importAttemptId}/canonicalize`)}>Create canonical acquisition</MefButton> : undefined} />}
      </Disclosure>

      <Disclosure eyebrow="EVIDENCE" title="Detected source structure and source → canonical mappings" detail="Every declaration is tied to a source field, adapter observation, or explicit unknown state.">
        {sourceObservation ? <>
          <div className="ml106-fact-grid">
            <Fact label="SourceObservation" value={observation?.sourceObservationId ?? "UNKNOWN"} origin="ADAPTER-QUALIFIED" mono />
            <Fact label="Adapter qualification" value={`${sourceObservation.adapterExecution.adapterId} · ${sourceObservation.adapterExecution.adapterVersion}`} origin="ADAPTER-QUALIFIED" />
            <Fact label="Schema" value={`${sourceObservation.schema.containerType} · ${sourceObservation.schema.schemaVersion}`} origin="DETECTED" />
            <Fact label="Encoding / delimiter" value={`${sourceObservation.schema.encoding} / ${sourceObservation.schema.delimiter ?? "UNKNOWN"}`} origin={sourceObservation.schema.delimiter ? "DETECTED" : "UNKNOWN"} />
            <Fact label="Header rows" value={sourceObservation.schema.headerRowCount} origin="DETECTED" />
            <Fact label="Warnings" value={sourceObservation.warnings.length ? sourceObservation.warnings.length : "None recorded"} origin={sourceObservation.warnings.length ? "UNKNOWN" : "ADAPTER-QUALIFIED"} />
          </div>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Detected fields</p><h3>What the adapter saw</h3></div><span className="ml106-table-note">{sourceObservation.fields.length} field{sourceObservation.fields.length === 1 ? "" : "s"}</span></div>
          <div className="ml106-table-wrap"><table className="ml106-table ml106-source-table"><caption>Detected source fields and source declarations</caption><thead><tr><th scope="col">Source field</th><th scope="col">Classification</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Axis</th><th scope="col">Plate</th></tr></thead><tbody>{sourceObservation.fields.map((field) => <tr key={field.sourceName}><th scope="row"><strong>{field.sourceName}</strong><small>{sourceFieldLocator(field)}</small></th><td><DeclaredCell value={field.classification} /></td><td><DeclaredCell value={field.quantity} /></td><td><DeclaredCell value={field.unit} /></td><td><DeclaredCell value={field.axis} /></td><td><DeclaredCell value={field.plate} /></td></tr>)}</tbody></table></div>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Source metadata</p><h3>Declared keys</h3></div></div>
          {sourceObservation.metadata.length ? <div className="ml106-metadata-list">{sourceObservation.metadata.map((entry) => <div className="ml106-metadata-row" key={entry.key}><code>{entry.key}</code><DeclaredCell value={entry.declaration} /></div>)}</div> : <p className="ml106-muted">No source metadata entries were recorded.</p>}
        </> : <EmptyNotice title="Source structure has not been inspected" detail={attempt.state === "READY_FOR_ADAPTER" ? "Run adapter inspection to expose detected columns, declared quantity, units, axes, and plate membership." : `The import is ${attempt.state}. Source inspection becomes available after the original artifact is finalized.`} action={canInspect ? <MefButton tone="secondary" size="sm" loading={busy === "observation"} disabled={Boolean(busy)} onClick={() => void runAction("observation", `/api/imports/${importAttemptId}/inspect`)}>Inspect source structure</MefButton> : undefined} />}

        {canonical ? <>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Canonical mapping</p><h3>Source labels mapped to canonical channels</h3></div><span className="ml106-table-note">Transformations are displayed, not re-applied</span></div>
          <div className="ml106-table-wrap"><table className="ml106-table"><caption>Source to canonical channel mappings</caption><thead><tr><th scope="col">Canonical channel</th><th scope="col">Source label</th><th scope="col">Mapping state</th><th scope="col">Transformation</th></tr></thead><tbody>{canonical.source_mappings.map((mapping) => <tr key={mapping.channel_id}><th scope="row"><code>{mapping.channel_id}</code></th><td>{mapping.source_label}</td><td><span className="ml106-cell-value"><strong>{mapping.mapping_state}</strong><OriginChip label={originForSemantic({ state: mapping.mapping_state })} /></span></td><td><code>{mapping.transformation.kind}</code><small>scale {mapping.transformation.scale} · offset {mapping.transformation.offset}</small></td></tr>)}</tbody></table></div>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Canonical channels</p><h3>Quantity, unit, axis, sign, and sample count</h3></div></div>
          <div className="ml106-table-wrap"><table className="ml106-table"><caption>Canonical acquisition channels</caption><thead><tr><th scope="col">Channel</th><th scope="col">Quantity / unit</th><th scope="col">Axis / sign</th><th scope="col">Quality</th><th scope="col">Samples</th></tr></thead><tbody>{canonical.channels.map((channel) => <tr key={channel.channel_id}><th scope="row"><code>{channel.channel_id}</code></th><td><SemanticCell value={channel.physical_quantity} /><span className="ml106-secondary-value">{channel.unit.unit?.symbol ?? channel.unit.state}</span></td><td><SemanticCell value={channel.axis} /><span className="ml106-secondary-value">{semanticText(channel.sign_convention)}</span></td><td>{channel.quality_state}</td><td>{channel.sample_count}</td></tr>)}</tbody></table></div>
        </> : null}

        {resolution ? <>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Blocking findings</p><h3>Why processing is or is not available</h3></div><span className="ml106-table-note">{resolution.findings.length} finding{resolution.findings.length === 1 ? "" : "s"}</span></div>
          {resolution.findings.length ? <div className="ml106-findings">{resolution.findings.map((finding) => <article className={`ml106-finding ml106-finding-${finding.severity.toLowerCase()}`} key={`${finding.code}:${finding.message}`}><div><strong>{finding.code}</strong><span>{finding.message}</span></div><span>{findingReferences(finding)}</span></article>)}</div> : <p className="ml106-muted">No configuration finding was recorded.</p>}
        </> : null}
      </Disclosure>

      <Disclosure eyebrow="PROVENANCE" title="Evidence chain and source lineage" detail="Read-only lineage from exact original bytes to the current configuration contract.">
        <div className="ml106-provenance-intro"><div><p className="mef-kicker">Read-only graph</p><h3>What was transformed?</h3><p>Edges show record lineage only. The graph cannot edit, connect, or infer nodes.</p></div><OriginChip label={resolution ? "ADAPTER-QUALIFIED" : "UNKNOWN"} /></div>
        <MefProvenanceGraph ariaLabel="Read-only force-plate acquisition provenance" edges={provenanceEdges} nodes={provenanceNodes} />
        <div className="ml106-provenance-links"><Fact label="Source artifact hash" value={shortHash(attempt.contentHash)} origin={attempt.contentHash ? "DETECTED" : "UNKNOWN"} mono /><Fact label="Observation hash" value={shortHash(sourceObservation?.observationSha256)} origin={sourceObservation ? "ADAPTER-QUALIFIED" : "UNKNOWN"} mono /><Fact label="Canonical identity" value={shortHash(canonical?.canonical_identity_sha256)} origin={canonical ? "ADAPTER-QUALIFIED" : "UNKNOWN"} mono /><Fact label="Resolution hash" value={shortHash(resolution?.resolution_sha256)} origin={resolution ? "ADAPTER-QUALIFIED" : "UNKNOWN"} mono /></div>
        {resolution ? <>
          <div className="ml106-subsection-heading"><div><p className="mef-kicker">Configuration evidence links</p><h3>Why the resolver reached this state</h3></div><span className="ml106-table-note">{evidenceRows(resolution).length} unique link{evidenceRows(resolution).length === 1 ? "" : "s"}</span></div>
          <div className="ml106-table-wrap"><table className="ml106-table"><caption>Configuration evidence references</caption><thead><tr><th scope="col">Locator</th><th scope="col">Channel</th><th scope="col">Content hash</th></tr></thead><tbody>{evidenceRows(resolution).map((reference) => <tr key={`${reference.locator}:${reference.content_hash}`}><th scope="row"><code>{reference.locator}</code></th><td>{reference.channel_id ?? "Acquisition-wide"}</td><td><code>{shortHash(reference.content_hash)}</code></td></tr>)}</tbody></table></div>
        </> : <p className="ml106-muted">No ML-105 evidence links exist until configuration resolution is recorded.</p>}
      </Disclosure>

      <Disclosure eyebrow="TECHNICAL DETAILS" title="Identifiers, contract versions, and lifecycle history" detail="Exact identifiers stay available for support, replay, and evidence review." open={false}>
        <div className="ml106-fact-grid">
          <Fact label="Import attempt" value={attempt.importAttemptId} mono />
          <Fact label="Organization" value={attempt.organizationId} mono />
          <Fact label="Workspace" value={attempt.workspaceId} mono />
          <Fact label="Principal" value={attempt.principalId} mono />
          <Fact label="Declared size" value={formatBytes(attempt.declaredSizeBytes)} origin="SOURCE-DECLARED" />
          <Fact label="Verified size" value={formatBytes(attempt.actualSizeBytes)} origin={attempt.actualSizeBytes === undefined ? "UNKNOWN" : "DETECTED"} />
          <Fact label="Media type" value={attempt.declaredContentType} origin="SOURCE-DECLARED" mono />
          <Fact label="SourceArtifact" value={attempt.sourceArtifactId ?? "UNKNOWN"} origin={attempt.sourceArtifactId ? "ADAPTER-QUALIFIED" : "UNKNOWN"} mono />
          <Fact label="Private storage key" value={attempt.storageKey ?? "UNKNOWN"} origin={attempt.storageKey ? "ADAPTER-QUALIFIED" : "UNKNOWN"} mono />
          <Fact label="Canonicalizer" value={canonical?.canonicalizer_version ?? "UNKNOWN"} origin={canonical ? "ADAPTER-QUALIFIED" : "UNKNOWN"} />
          <Fact label="Resolver" value={resolution?.resolver_version ?? "UNKNOWN"} origin={resolution ? "ADAPTER-QUALIFIED" : "UNKNOWN"} />
          <Fact label="Authority" value={resolution?.authority_version ?? "UNKNOWN"} origin={resolution ? "ADAPTER-QUALIFIED" : "UNKNOWN"} />
          <Fact label="Athlete" value={attempt.athleteId ?? "Not supplied"} origin={attempt.athleteId ? "PRACTITIONER-CONFIRMED" : "UNKNOWN"} />
          <Fact label="Measurement session" value={attempt.sessionId ?? "Not supplied"} origin={attempt.sessionId ? "PRACTITIONER-CONFIRMED" : "UNKNOWN"} />
        </div>
        {attempt.failureCode ? <div className="source-import-failure"><strong>{attempt.failureCode}</strong><span>{attempt.safeFailureDetail ?? "The attempt remains outside scientific processing."}</span></div> : null}
        {attempt.duplicateOfImportAttemptId ? <p className="source-import-duplicate">Same verified content as <Link href={`/imports/${attempt.duplicateOfImportAttemptId}`}>{attempt.duplicateOfImportAttemptId}</Link>. This upload remains a distinct attempt.</p> : null}
        <div className="ml106-subsection-heading"><div><p className="mef-kicker">Append-only provenance</p><h3>Lifecycle events</h3></div><span className="ml106-table-note">{events.length} event{events.length === 1 ? "" : "s"}</span></div>
        <ol className="source-import-events">{events.map((event) => <li key={event.eventId}><div><strong>{event.eventCode}</strong><span>{event.fromState ? `${event.fromState} → ${event.toState ?? "—"}` : event.toState ?? "recorded"}</span></div><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time></li>)}</ol>
      </Disclosure>

      <MefPanel className="ml106-origin-panel">
        <div className="ml106-subsection-heading"><div><p className="mef-kicker">EVIDENCE VOCABULARY</p><h3>How to read field provenance</h3></div><MefBadge tone="cyan">No silent inference</MefBadge></div>
        <div className="ml106-origin-legend">{origins.map((origin) => <div key={origin.label}><OriginChip label={origin.label} /><span>{origin.detail}</span></div>)}</div>
      </MefPanel>
    </div>
  );
}
