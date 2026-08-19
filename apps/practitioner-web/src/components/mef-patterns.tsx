"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { SCREEN_BY_ID, type ScreenDefinition, type ScreenId, type ScreenState } from "../lib/mef-authority";
import { MefIcon } from "./mef-icons";
import { MefPlotFrame, MefProvenanceStrip, type MefPlotFamily } from "./mef-plots";
import { MefDataTable } from "./mef/data/mef-data-table";
import { MefDiffTable } from "./mef/agent/mef-beautiful-ui";
import { MefSessionPreferenceForm } from "./mef/forms/mef-session-preference-form";
const MefProvenanceGraph = dynamic(() => import("./mef/provenance/mef-provenance-graph").then((module) => module.MefProvenanceGraph), {
  ssr: false,
  loading: () => <div className="mef-flow-canvas" role="status"><MefSkeleton lines={3} /></div>
});
import { MefBadge, MefButton, MefDivider, MefField, MefKeyValue, MefLinkButton, MefPanel, MefPanelHeader, MefSkeleton, MefStateBanner, MefStatusChip, type MefStatus } from "./mef-primitives";
import { FixtureJobCard } from "./fixture-job-card";

type PatternProps = Readonly<{ definition: ScreenDefinition; state: ScreenState }>;

const stateDetails: Record<Exclude<ScreenState, "default">, { status: MefStatus; title: string; description: string }> = {
  loading: { status: "unavailable", title: "Loading governed records", description: "The surface is waiting for a tenant-scoped response. No placeholder values are shown while the request is unresolved." },
  empty: { status: "info", title: "Nothing is connected to this view", description: "There is no governed record to show yet. Start with a source, protocol, or explicit configuration step." },
  error: { status: "unavailable", title: "This view could not be loaded", description: "The failure is visible and the source context is preserved. Retry after the runtime is available." },
  blocked: { status: "blocked", title: "A prerequisite is blocking this step", description: "Resolve the upstream source, mapping, or review gate before this action can be committed." },
  "validation-error": { status: "needs-review", title: "Configuration needs review", description: "One or more required fields are incomplete or inconsistent. No downstream record has been created." },
  "review-conflict": { status: "needs-review", title: "Review conflict requires a person", description: "The current review metadata conflicts with another decision. Preserve both entries and resolve explicitly." },
  "planned-only": { status: "planned", title: "Planned for a future processor", description: "This view establishes the interaction and uncertainty boundary. It does not fabricate a metric, trend, interval, or readiness claim." },
  "missing-link": { status: "blocked", title: "Evidence link is missing", description: "The record remains inspectable, but provenance cannot be claimed until the source-linked entry exists." },
  "forbidden-claim": { status: "forbidden-claim", title: "Unsupported claim blocked", description: "This content cannot be exported without a source-linked evidence record and an approved method boundary." },
  "permission-denied": { status: "blocked", title: "Permission required", description: "This action is hidden or unavailable for the current role. Authorization is not weakened by the UI." },
  degraded: { status: "degraded", title: "Provider is degraded", description: "The integration is visible but not treated as available. Retry or inspect configuration before continuing." }
};

function StateSurface({ definition, state }: PatternProps) {
  if (state === "default") return null;
  if (state === "loading") {
    return <MefPanel className="mef-loading-panel"><MefPanelHeader title="Loading" detail="No values are inferred while the request is unresolved." /><MefSkeleton lines={5} /></MefPanel>;
  }
  const detail = stateDetails[state];
  return (
    <MefStateBanner
      description={detail.description}
      status={detail.status}
      title={detail.title}
      action={<MefLinkButton href={definition.route} tone="secondary" size="sm" icon="arrow">Return to default state</MefLinkButton>}
    />
  );
}

function WorkRow({ icon, title, detail, status, href, action = "Inspect" }: Readonly<{ icon: "import" | "trial" | "session" | "athlete" | "evidence" | "reference" | "report" | "settings"; title: string; detail: string; status: MefStatus; href: string; action?: string }>) {
  return (
    <div className="mef-record-row">
      <div className="mef-record-icon"><MefIcon name={icon} size={18} /></div>
      <div className="mef-record-main"><strong>{title}</strong><span>{detail}</span></div>
      <MefStatusChip status={status} compact />
      <Link className="mef-row-action" href={href}>{action}<MefIcon name="arrow" size={15} /></Link>
    </div>
  );
}

type RecordFilter = "all" | "attention" | "planned" | "available";
type RecordSort = "default" | "name";

const filterLabels: Record<RecordFilter, string> = {
  all: "All records",
  attention: "Needs attention",
  planned: "Planned or draft",
  available: "Available states"
};

const sortLabels: Record<RecordSort, string> = {
  default: "Default order",
  name: "Name A–Z"
};

type FilterBarProps = Readonly<{
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  filter: RecordFilter;
  onFilterChange: (value: RecordFilter) => void;
  sort: RecordSort;
  onSortChange: (value: RecordSort) => void;
  resultCount?: number;
}>;

function FilterBar({ placeholder = "Search governed records", query, onQueryChange, filter, onFilterChange, sort, onSortChange, resultCount }: FilterBarProps) {
  const [openMenu, setOpenMenu] = useState<"filter" | "sort" | null>(null);

  function closeMenuOnEscape(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpenMenu(null);
  }

  return (
    <div className="mef-filter-bar" role="search">
      <label className="mef-search-field"><MefIcon name="search" size={16} /><span className="mef-visually-hidden">{placeholder}</span><input aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>
      <div className="mef-filter-menu-wrap" onKeyDown={closeMenuOnEscape}>
        <button aria-controls="mef-filter-menu" aria-expanded={openMenu === "filter"} className="mef-filter-button" type="button" onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}><MefIcon name="filter" size={15} />{filter === "all" ? "Filter" : filterLabels[filter]}</button>
        {openMenu === "filter" ? <div className="mef-filter-menu" id="mef-filter-menu" role="menu" aria-label="Filter records">
          {(Object.keys(filterLabels) as RecordFilter[]).map((value) => <button aria-checked={filter === value} className={filter === value ? "is-selected" : ""} key={value} role="menuitemradio" type="button" onClick={() => { onFilterChange(value); setOpenMenu(null); }}>{filterLabels[value]}</button>)}
        </div> : null}
      </div>
      <div className="mef-filter-menu-wrap" onKeyDown={closeMenuOnEscape}>
        <button aria-controls="mef-sort-menu" aria-expanded={openMenu === "sort"} className="mef-filter-button" type="button" onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}>{sort === "default" ? "Sort" : sortLabels[sort]}<MefIcon name="chevron" size={14} /></button>
        {openMenu === "sort" ? <div className="mef-filter-menu" id="mef-sort-menu" role="menu" aria-label="Sort records">
          {(Object.keys(sortLabels) as RecordSort[]).map((value) => <button aria-checked={sort === value} className={sort === value ? "is-selected" : ""} key={value} role="menuitemradio" type="button" onClick={() => { onSortChange(value); setOpenMenu(null); }}>{sortLabels[value]}</button>)}
        </div> : null}
      </div>
      {typeof resultCount === "number" ? <span className="mef-filter-count" role="status">{resultCount} {resultCount === 1 ? "record" : "records"}</span> : null}
    </div>
  );
}

function EmptyAction({ definition }: Readonly<{ definition: ScreenDefinition }>) {
  return <MefLinkButton href={`${definition.route}?state=empty`} tone="secondary" size="sm" icon="arrow">View empty state</MefLinkButton>;
}

export function DashboardPattern({ definition, state }: PatternProps) {
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return (
    <>
      <section className="mef-command-grid" aria-label="Command center work queue">
        <MefPanel className="mef-command-hero">
          <div className="mef-command-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div className="mef-command-hero-copy">
            <MefBadge tone="cyan">Evidence-first control</MefBadge>
            <h2>Make the next governed step obvious.</h2>
            <p>MEF keeps source state, processing boundaries, review metadata, and evidence links in the same line of sight.</p>
            <MefLinkButton href="/imports" icon="arrow">Open work queue</MefLinkButton>
          </div>
          <div className="mef-command-note"><MefIcon name="shield" size={16} /><span>Verified is capability-scoped. It is never an athlete health claim.</span></div>
        </MefPanel>
        <MefPanel className="mef-readiness-panel">
          <MefPanelHeader eyebrow="System posture" title="Runtime boundary" />
          <div className="mef-readiness-value"><span className="mef-readiness-ring" /><div><strong>Safe preview</strong><span>Deterministic science not connected</span></div></div>
          <MefDivider />
          <div className="mef-readiness-list"><span><MefIcon name="check" size={14} />Auth and tenancy</span><span><MefIcon name="check" size={14} />Source immutability</span><span><MefIcon name="clock" size={14} />B01-B04 processors</span></div>
        </MefPanel>
      </section>
      <section className="mef-section-block">
        <div className="mef-section-heading"><div><p className="mef-kicker">Work queue</p><h2>Awaiting a governed handoff</h2></div><MefBadge>Tenant scoped</MefBadge></div>
        <div className="mef-panel mef-record-list">
          <WorkRow detail="Source artifact and acquisition semantics" href="/imports" icon="import" status="mapping-required" title="Force-plate import" action="Open imports" />
          <WorkRow detail="Typed deterministic processor not connected" href="/trials" icon="trial" status="planned" title="Trial review" action="Open trials" />
          <WorkRow detail="Evidence-linked reporting is not populated" href="/evidence" icon="evidence" status="unavailable" title="Evidence library" action="Open evidence" />
        </div>
      </section>
      <section className="mef-three-col">
        <MefPanel><MefPanelHeader eyebrow="Boundary" title="No silent mutations" /><p className="mef-panel-copy">Mappings, overrides, exclusions, qualification, and report claims require explicit practitioner intent.</p><Link className="mef-inline-link" href="/settings/scientific">Review claim policies <MefIcon name="arrow" size={14} /></Link></MefPanel>
        <MefPanel><MefPanelHeader eyebrow="Assistant" title="Eve stays explanatory" /><p className="mef-panel-copy">Eve can navigate and explain visible evidence. It cannot calculate, diagnose, or qualify.</p><Link className="mef-inline-link" href="/assistant/memory">Review assistant boundary <MefIcon name="arrow" size={14} /></Link></MefPanel>
        <MefPanel><MefPanelHeader eyebrow="Quality" title="Unknown stays visible" /><p className="mef-panel-copy">Blocked, degraded, empty, and unavailable states are first-class records, not presentation gaps.</p><Link className="mef-inline-link" href="/settings/health">Inspect system health <MefIcon name="arrow" size={14} /></Link></MefPanel>
      </section>
    </>
  );
}

type LibraryRow = { icon: "import" | "trial" | "session" | "athlete" | "evidence" | "reference" | "report" | "settings"; title: string; detail: string; status: MefStatus; href: string };

function libraryRowsFor(definition: ScreenDefinition): LibraryRow[] {
    switch (definition.id) {
      case "03-imports-hub": return [
        { icon: "import", title: "Source artifact", detail: "Awaiting an authenticated provider", status: "imported", href: "/imports/artifacts/pending" },
        { icon: "import", title: "Import batch", detail: "Mapping gate not satisfied", status: "mapping-required", href: "/imports/batches/pending" }
      ];
      case "09-trial-library": return [{ icon: "trial", title: "Trial record", detail: "Awaiting deterministic processor", status: "planned", href: "/trials/pending" }];
      case "14-session-queue": return [{ icon: "session", title: "Session review", detail: "Qualification decision not available", status: "needs-review", href: "/sessions/pending" }];
      case "18-athlete-directory": return [{ icon: "athlete", title: "Athlete record", detail: "No athlete data loaded", status: "unavailable", href: "/athletes/pending" }];
      case "21-evidence-library": return [{ icon: "evidence", title: "Evidence record", detail: "Waiting for a source-linked record", status: "unavailable", href: "/evidence/pending" }];
      case "24-references-hub": return [
        { icon: "reference", title: "Metric definitions", detail: "Definitions are available before processors", status: "planned", href: "/references/metrics" },
        { icon: "reference", title: "Protocol library", detail: "Protocol definitions are inspectable", status: "draft", href: "/references/protocols" }
      ];
      case "25-metrics-dictionary": return [{ icon: "reference", title: "Metric definition", detail: "Typed deterministic method required for results", status: "planned", href: "/references/metrics?state=empty" }];
      case "26-protocol-library": return [{ icon: "reference", title: "Protocol definition", detail: "No completed test bound", status: "draft", href: "/references/protocols?state=empty" }];
      case "28-report-library": return [{ icon: "report", title: "Evidence-linked report", detail: "No report draft generated", status: "unavailable", href: "/reports?state=empty" }];
      default: return [{ icon: "evidence", title: "Governed record", detail: "No record is connected to this view", status: "unavailable", href: `${definition.route}?state=empty` }];
    }
}

function LibraryRows({ rows }: Readonly<{ rows: LibraryRow[] }>) {
  return <MefDataTable caption="Governed record queue" rows={rows.map((row, index) => ({ ...row, id: `${row.title}-${index}` }))} />;
}

export function LibraryPattern({ definition, state }: PatternProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");
  const [sort, setSort] = useState<RecordSort>("default");
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = libraryRowsFor(definition).filter((row) => {
      const queryMatches = !normalizedQuery || `${row.title} ${row.detail} ${row.status}`.toLowerCase().includes(normalizedQuery);
      const filterMatches = filter === "all"
        || (filter === "attention" && ["needs-review", "mapping-required", "blocked", "unavailable"].includes(row.status))
        || (filter === "planned" && ["planned", "draft"].includes(row.status))
        || (filter === "available" && ["imported", "mapped", "canonicalized", "qualified", "verified"].includes(row.status));
      return queryMatches && filterMatches;
    });
    return sort === "name" ? [...filtered].sort((left, right) => left.title.localeCompare(right.title)) : filtered;
  }, [definition, filter, query, sort]);
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return (
    <>
      <MefPanel className="mef-library-toolbar"><FilterBar filter={filter} onFilterChange={setFilter} onQueryChange={setQuery} onSortChange={setSort} query={query} resultCount={rows.length} sort={sort} /><div className="mef-toolbar-meta"><span>Showing governed records only</span><MefBadge tone="violet">No live values</MefBadge></div></MefPanel>
      <MefPanel className="mef-list-panel"><MefPanelHeader title="Record queue" detail="Every row keeps its state, limitation, and evidence doorway visible." action={<EmptyAction definition={definition} />} /><LibraryRows rows={rows} /></MefPanel>
      <MefPanel className="mef-next-panel"><MefPanelHeader eyebrow="Next step" title={definition.primaryAction} /><div className="mef-next-grid"><div><MefStatusChip status={definition.id === "03-imports-hub" ? "mapping-required" : "planned"} /><p>{definition.capability}. The next action is explicit and reversible.</p></div><Link className="mef-inline-link" href={`${definition.route}?state=empty`}>Inspect the empty path <MefIcon name="arrow" size={14} /></Link></div></MefPanel>
    </>
  );
}

function RecordBoundary({ definition }: Readonly<{ definition: ScreenDefinition }>) {
  return (
    <MefPanel className="mef-boundary-card">
      <MefPanelHeader eyebrow="Record boundary" title="No qualified result" detail={definition.capability} />
      <dl className="mef-key-value-list">
        <MefKeyValue label="Source" value="Not connected" />
        <MefKeyValue label="Processor" value="Awaiting deterministic tool" />
        <MefKeyValue label="Review state" value={<MefStatusChip status="needs-review" compact />} />
        <MefKeyValue label="Evidence" value={definition.evidence ? "Entry point available" : "Not applicable"} />
      </dl>
      <MefDivider />
      <p className="mef-panel-copy">This view is structurally ready. A record becomes meaningful only when its source, method, and evidence contract are present.</p>
    </MefPanel>
  );
}

export function DetailPattern({ definition, state }: PatternProps) {
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  const plot: MefPlotFamily = definition.id.includes("artifact") || definition.id.includes("batch") ? "mapping-preview" : definition.id.includes("session") ? "session-matrix" : definition.id.includes("athlete") ? "trial-comparison" : "force-time";
  return (
    <>
      <MefProvenanceStrip />
      <section className="mef-detail-grid"><RecordBoundary definition={definition} /><MefPanel className="mef-inspector-card"><MefPanelHeader eyebrow="Inspector" title="Processing status" /><div className="mef-inspector-status"><MefStatusChip status="unavailable" /><span>Data binding is not available in this environment.</span></div><dl className="mef-key-value-list"><MefKeyValue label="Record ID" value="Awaiting source" mono /><MefKeyValue label="Workspace" value="Tenant scoped" /><MefKeyValue label="Last event" value="Awaiting event" /></dl><MefLinkButton href={`${definition.route}?state=blocked`} tone="secondary" size="sm" icon="lock">Open blocked path</MefLinkButton></MefPanel></section>
      <MefPlotFrame family={plot} />
    </>
  );
}

function ConfigFields({ definition, state }: PatternProps) {
  const mapping = definition.id === "06-source-mapping";
  return (
    <MefPanel className="mef-config-panel">
      <MefPanelHeader eyebrow={mapping ? "Source fields" : "Configuration"} title={mapping ? "Explicit mapping review" : "Acquisition contract"} detail="Values are intentionally blank until a provider is bound." />
      <div className="mef-form-grid">
        <label className="mef-field"><span className="mef-field-label">{mapping ? "Source field" : "Device profile"}</span><select aria-label={mapping ? "Source field" : "Device profile"} defaultValue="" disabled><option value="">Select a governed source</option></select>{state === "validation-error" ? <span className="mef-field-error"><MefIcon name="alert" size={13} />Required before validation</span> : <span className="mef-field-hint">No provider is connected.</span>}</label>
        <label className="mef-field"><span className="mef-field-label">{mapping ? "Canonical field" : "Acquisition mode"}</span><select aria-label={mapping ? "Canonical field" : "Acquisition mode"} defaultValue="" disabled><option value="">Awaiting source context</option></select><span className="mef-field-hint">The agent cannot select this silently.</span></label>
        <MefField label="Reviewer note" placeholder="Add rationale when a human reviews this step" disabled />
        <MefField label="Evidence reference" placeholder="Evidence link required" disabled />
      </div>
      {mapping ? <MefDiffTable rows={[{ field: "Source field", source: "Not connected", observed: "Unavailable", canonical: "Not mapped", state: "Blocked" }]} /> : null}
      {state === "validation-error" ? <MefStateBanner description="Resolve the required source and canonical fields before a canonical acquisition can be created." status="needs-review" title="Validation failed" /> : null}
      <div className="mef-form-footer"><MefStatusChip status="mapping-required" /><MefButton disabled icon="check">{definition.primaryAction}</MefButton></div>
    </MefPanel>
  );
}

export function ConfigPattern({ definition, state }: PatternProps) {
  if (state !== "default" && state !== "validation-error") return <StateSurface definition={definition} state={state} />;
  return <><MefProvenanceStrip compact /><ConfigFields definition={definition} state={state} /><MefPanel className="mef-boundary-note"><MefIcon name="shield" size={17} /><div><strong>Source immutability</strong><p>Rework creates additive review metadata. It never overwrites the uploaded artifact.</p></div></MefPanel></>;
}

export function ReviewPattern({ definition, state }: PatternProps) {
  if (state !== "default" && state !== "review-conflict") return <StateSurface definition={definition} state={state} />;
  return (
    <>
      {state === "review-conflict" ? <MefStateBanner description={stateDetails["review-conflict"].description} status="needs-review" title={stateDetails["review-conflict"].title} action={<MefLinkButton href={definition.route} tone="secondary" size="sm">Keep both decisions</MefLinkButton>} /> : null}
      <section className="mef-review-grid"><MefPlotFrame family={definition.id.includes("event") ? "event-zoom" : "quality-trace"} /><MefPanel className="mef-decision-panel"><MefPanelHeader eyebrow="Reviewer action" title="Add review metadata" detail="The source stays unchanged. Author, rationale, and time are required." /><MefField label="Decision" placeholder="Select a review decision" disabled /><label className="mef-field"><span className="mef-field-label">Rationale</span><textarea aria-label="Rationale" placeholder="Explain the decision in bounded, reviewable terms" disabled /></label><div className="mef-review-meta"><MefBadge>Author required</MefBadge><MefBadge>Timestamp required</MefBadge><MefBadge>Source preserved</MefBadge></div><MefButton disabled icon="check">{definition.primaryAction}</MefButton></MefPanel></section>
      <MefPanel><MefPanelHeader eyebrow="Review vocabulary" title="What this surface can say" /><div className="mef-review-rules"><span><MefIcon name="check" size={14} />Needs review is explicit</span><span><MefIcon name="check" size={14} />Overrides are additive</span><span><MefIcon name="lock" size={14} />No automatic qualification</span></div></MefPanel>
    </>
  );
}

export function LogPattern({ definition, state }: PatternProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");
  const [sort, setSort] = useState<RecordSort>("default");
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return (
    <>
      <MefPanel className="mef-library-toolbar"><FilterBar filter={filter} onFilterChange={setFilter} onQueryChange={setQuery} onSortChange={setSort} placeholder="Search events and decisions" query={query} sort={sort} /><div className="mef-toolbar-meta"><span>Actor, time, scope, action</span><MefBadge>Append-only view</MefBadge></div></MefPanel>
      <MefPanel className="mef-timeline-panel"><MefPanelHeader title="Event history" detail="No event is inferred from an absent record." /><div className="mef-empty-inline"><div className="mef-empty-mark"><MefIcon name="clock" size={20} /></div><div><strong>No events loaded</strong><p>{definition.capability}. When an event exists, its actor, timestamp, rationale, and evidence doorway will remain visible.</p></div></div><Link className="mef-inline-link" href={`${definition.route}?state=empty`}>Inspect empty state <MefIcon name="arrow" size={14} /></Link></MefPanel>
    </>
  );
}

export function EvidencePattern({ definition, state }: PatternProps) {
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  if (definition.kind === "graph") {
    return <><MefPanel className="mef-graph-panel"><MefPanelHeader title="Evidence lineage" detail="Read-only structural graph; no scientific values are implied." /><MefProvenanceGraph /></MefPanel><MefProvenanceStrip /></>;
  }
  return <><MefProvenanceStrip /><section className="mef-detail-grid"><MefPanel><MefPanelHeader eyebrow="Capability scoped" title="Evidence record" /><MefStatusChip status="unavailable" /><p className="mef-panel-copy">A verified label can describe a capability and evidence path. It cannot describe athlete health, readiness, injury, or causality.</p><dl className="mef-key-value-list"><MefKeyValue label="Method" value="Not bound" /><MefKeyValue label="Source" value="Not linked" /><MefKeyValue label="Review" value={<MefStatusChip status="needs-review" compact />} /></dl></MefPanel><MefPanel><MefPanelHeader eyebrow="Next step" title={definition.primaryAction} /><p className="mef-panel-copy">Open provenance only after a source-linked record is present. Missing links remain explicit.</p><MefLinkButton href={`${definition.route}?state=missing-link`} tone="secondary" size="sm" icon="link">Open missing-link state</MefLinkButton></MefPanel></section></>;
}

export function LongitudinalPattern({ definition, state }: PatternProps) {
  return <><StateSurface definition={definition} state={state === "default" ? "planned-only" : state} /><MefPlotFrame family="longitudinal" /><MefPanel className="mef-planned-note"><MefIcon name="clock" size={18} /><div><strong>Planned before B04</strong><p>Observed values, estimates, uncertainty, and reference bands will be shown only when the corresponding evidence contracts exist.</p></div></MefPanel></>;
}

export function BuilderPattern({ definition, state }: PatternProps) {
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return <><section className="mef-builder-grid"><MefPanel><MefPanelHeader eyebrow="Report sections" title="Evidence-linked draft" detail="Build from records, not from assistant prose." /><div className="mef-builder-block"><MefIcon name="evidence" size={17} /><div><strong>Evidence summary</strong><span>Awaiting linked record</span></div><MefStatusChip status="unavailable" compact /></div><div className="mef-builder-block"><MefIcon name="reference" size={17} /><div><strong>Method and limitations</strong><span>Reference required</span></div><MefStatusChip status="planned" compact /></div><MefButton disabled icon="arrow">Add evidence section</MefButton></MefPanel><MefPanel className="mef-report-preview"><MefPanelHeader eyebrow="Preview" title="No exportable report" /><div className="mef-report-paper"><MefBadge tone="violet">Draft preview</MefBadge><h3>Evidence-linked report</h3><p>Content will appear when a governed evidence record and approved method are present.</p><div className="mef-report-line" /><div className="mef-report-line short" /><MefStatusChip status="forbidden-claim" /></div></MefPanel></section><MefPanel className="mef-boundary-note"><MefIcon name="lock" size={17} /><div><strong>Claim guard</strong><p>Unlinked metrics, health interpretations, readiness claims, and causal language cannot be exported.</p></div></MefPanel></>;
}

export function MemoryPattern({ definition, state }: PatternProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [kept, setKept] = useState(false);
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return <><MefPanel><MefPanelHeader eyebrow="Visible preferences" title="Assistant memory" detail="Memory supports continuity; it is not an evidence source." action={<MefButton aria-controls="mef-memory-draft" aria-expanded={adding} onClick={() => setAdding((value) => !value)} tone="secondary" size="sm" icon={adding ? "close" : "plus"}>{adding ? "Close" : "Add preference"}</MefButton>} />{adding ? <MefSessionPreferenceForm onCancel={() => setAdding(false)} onSaved={(preference) => { setDraft(preference); setKept(true); setAdding(false); }} /> : null}{kept ? <div className="mef-memory-feedback" role="status"><MefIcon name="check" size={15} /><span>Session preference is visible for this view only.</span></div> : null}<div className="mef-memory-card"><div className="mef-memory-icon"><MefIcon name="memory" size={18} /></div><div><strong>{kept ? "One session preference" : "No saved preferences"}</strong><p>{kept ? draft : "When a preference exists, its scope, author, and delete action are visible here."}</p></div><MefStatusChip status="info" compact /></div></MefPanel><MefStateBanner description="Eve can remember visible, deletable preferences. It cannot remember a measurement, evidence link, or clinical interpretation." status="info" title="Memory stays outside the evidence chain" /></>;
}

export function SettingsPattern({ definition, state }: PatternProps) {
  if (state !== "default" && state !== "permission-denied" && state !== "degraded" && state !== "validation-error") return <StateSurface definition={definition} state={state} />;
  return <><MefPanel className="mef-settings-panel"><MefPanelHeader eyebrow="Configuration" title={definition.title} detail="Changes are explicit, scoped, and auditable." /><div className="mef-settings-list"><div className="mef-setting-row"><div><strong>Workspace scope</strong><span>Tenant context supplied by the authenticated session</span></div><MefStatusChip status="verified" compact /></div><div className="mef-setting-row"><div><strong>Provider capability</strong><span>{definition.id === "35-integrations" ? "Provider reports degraded or not configured" : "Safe capability flag only"}</span></div><MefStatusChip status={definition.id === "35-integrations" || state === "degraded" ? "degraded" : "unavailable"} compact /></div><div className="mef-setting-row"><div><strong>Scientific boundary</strong><span>No CMJ calculations, quality claims, or health interpretations</span></div><MefStatusChip status="blocked" compact /></div></div><MefDivider /><div className="mef-form-grid"><MefField label="Display label" placeholder="Workspace label" disabled error={state === "validation-error" ? "Explicit configuration is required" : undefined} /><MefField label="Review policy" placeholder="Evidence-first" disabled /></div><div className="mef-form-footer"><MefStatusChip status={state === "permission-denied" ? "blocked" : "needs-review"} /><MefButton disabled icon="check">{definition.primaryAction}</MefButton></div></MefPanel><MefStateBanner description={state === "degraded" ? "Inspect the provider configuration and retry after its capability returns." : "The current surface is a safe configuration boundary. It does not change auth, RLS, evidence, storage, or processor behavior."} status={state === "degraded" ? "degraded" : state === "permission-denied" ? "blocked" : "info"} title={state === "degraded" ? "Integration capability is degraded" : state === "permission-denied" ? "Admin permission required" : "Configuration is intentionally bounded"} /></>;
}

export function HealthPattern({ definition, state }: PatternProps) {
  if (state !== "default" && state !== "degraded") return <StateSurface definition={definition} state={state} />;
  return <><section className="mef-health-grid"><MefPanel><MefPanelHeader eyebrow="Runtime" title="Capability checks" /><div className="mef-health-list"><div><span><i className="mef-health-dot ok" />Auth and tenancy</span><MefStatusChip status="verified" compact /></div><div><span><i className="mef-health-dot ok" />Evidence storage boundary</span><MefStatusChip status="verified" compact /></div><div><span><i className="mef-health-dot warn" />Deterministic science processors</span><MefStatusChip status="planned" compact /></div><div><span><i className="mef-health-dot warn" />Assistant provider</span><MefStatusChip status={state === "degraded" ? "degraded" : "unavailable"} compact /></div></div></MefPanel><MefPanel><MefPanelHeader eyebrow="Safe operations" title="No secrets in the browser" /><p className="mef-panel-copy">Only bounded capability flags and error states are displayed. Secret values and provider credentials stay server-side.</p><MefLinkButton href="/settings/integrations" tone="secondary" size="sm" icon="settings">Open integrations</MefLinkButton></MefPanel></section><FixtureJobCard /></>;
}

export function WorkspacePattern({ definition, state }: PatternProps) {
  if (state !== "default") return <StateSurface definition={definition} state={state} />;
  return <><MefPanel className="mef-workspace-picker"><MefPanelHeader eyebrow="Available context" title="Select a workspace" detail="The active workspace controls tenant scope and role visibility." /><div className="mef-workspace-option"><div className="mef-workspace-mark">M</div><div><strong>Preview workspace</strong><span>Authentication context required</span></div><MefStatusChip status="unavailable" compact /><MefLinkButton href="/" tone="secondary" size="sm" icon="arrow">Continue</MefLinkButton></div></MefPanel><MefStateBanner description="Workspace switching preserves route, filters, sort, and selected context. It does not copy records across tenants." status="info" title="Context is explicit" /></>;
}

export function AuthPattern() {
  return null;
}

export function PatternForScreen({ definition, state }: PatternProps) {
  switch (definition.kind) {
    case "dashboard": return <DashboardPattern definition={definition} state={state} />;
    case "workspace": return <WorkspacePattern definition={definition} state={state} />;
    case "library": return <LibraryPattern definition={definition} state={state} />;
    case "detail": return <DetailPattern definition={definition} state={state} />;
    case "config": return <ConfigPattern definition={definition} state={state} />;
    case "review": return <ReviewPattern definition={definition} state={state} />;
    case "log": return <LogPattern definition={definition} state={state} />;
    case "evidence":
    case "graph": return <EvidencePattern definition={definition} state={state} />;
    case "longitudinal": return <LongitudinalPattern definition={definition} state={state} />;
    case "builder": return <BuilderPattern definition={definition} state={state} />;
    case "memory": return <MemoryPattern definition={definition} state={state} />;
    case "settings": return <SettingsPattern definition={definition} state={state} />;
    case "health": return <HealthPattern definition={definition} state={state} />;
    case "auth": return <AuthPattern />;
    default: return null;
  }
}

export function getEvidenceScreen(): ScreenDefinition {
  return SCREEN_BY_ID["21-evidence-library"];
}
