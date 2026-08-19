"use client";

import dynamic from "next/dynamic";
import { MefBadge, MefPanel, MefPanelHeader, MefStatusChip } from "./mef-primitives";

const MefEchartsFrame = dynamic(() => import("./mef/charts/mef-echarts-frame").then((module) => module.MefEchartsFrame), {
  ssr: false,
  loading: () => <div className="mef-plot-frame" role="status"><div className="mef-plot-empty"><strong>Loading chart shell</strong><p>Rendering remains separate from scientific processing.</p></div></div>
});

export type MefPlotFamily =
  | "force-time"
  | "dual-plate"
  | "event-zoom"
  | "velocity-time"
  | "displacement-time"
  | "impulse-area"
  | "trial-comparison"
  | "session-matrix"
  | "longitudinal"
  | "rolling-baseline"
  | "uncertainty-band"
  | "distribution"
  | "cohort-comparison"
  | "quality-trace"
  | "provenance-graph"
  | "session-timeline"
  | "data-quality"
  | "mapping-preview"
  | "annotation-grammar";

const plotCopy: Record<MefPlotFamily, { title: string; xUnit: string; yUnit: string; note: string }> = {
  "force-time": { title: "Force-time", xUnit: "Time (s)", yUnit: "Vertical force (N)", note: "Canonical vertical force is awaiting a deterministic processor." },
  "dual-plate": { title: "Dual-plate comparison", xUnit: "Time (s)", yUnit: "Force (N)", note: "Plate channels are not bound to a qualified acquisition." },
  "event-zoom": { title: "Event review window", xUnit: "Time (s)", yUnit: "Signal (unit)", note: "Event markers require typed processor output or explicit review metadata." },
  "velocity-time": { title: "Velocity-time", xUnit: "Time (s)", yUnit: "Velocity (m/s)", note: "Derived velocity is planned and not available in this build." },
  "displacement-time": { title: "Displacement-time", xUnit: "Time (s)", yUnit: "Displacement (m)", note: "Derived displacement is planned and not available in this build." },
  "impulse-area": { title: "Impulse area", xUnit: "Time (s)", yUnit: "Force (N)", note: "Impulse remains unavailable until an approved deterministic method is bound." },
  "trial-comparison": { title: "Trial comparison", xUnit: "Trial", yUnit: "Metric (unit)", note: "No qualified trial values are loaded for comparison." },
  "session-matrix": { title: "Session matrix", xUnit: "Session", yUnit: "Metric (unit)", note: "Session-level metrics are unavailable before B03 processing." },
  longitudinal: { title: "Longitudinal trend", xUnit: "Observation window", yUnit: "Observed value (unit)", note: "Longitudinal analysis is planned for B04+." },
  "rolling-baseline": { title: "Rolling baseline", xUnit: "Observation window", yUnit: "Observed value (unit)", note: "Baseline calculations require a qualified evidence set." },
  "uncertainty-band": { title: "Uncertainty band", xUnit: "Observation", yUnit: "Estimate (unit)", note: "Uncertainty is shown only when a real interval is present." },
  distribution: { title: "Distribution", xUnit: "Observation", yUnit: "Count", note: "Distribution data is not loaded." },
  "cohort-comparison": { title: "Cohort comparison", xUnit: "Cohort", yUnit: "Observed value (unit)", note: "Reference population and window are not defined." },
  "quality-trace": { title: "Quality trace", xUnit: "Time (s)", yUnit: "Quality signal (unit)", note: "Quality classification is not produced by this UI layer." },
  "provenance-graph": { title: "Provenance graph", xUnit: "Lineage", yUnit: "Record", note: "The graph renders when source-linked nodes are available." },
  "session-timeline": { title: "Session timeline", xUnit: "Event time", yUnit: "Event", note: "Session events are awaiting a governed record." },
  "data-quality": { title: "Data quality", xUnit: "Field", yUnit: "State", note: "Quality flags appear after acquisition validation." },
  "mapping-preview": { title: "Mapping preview", xUnit: "Source field", yUnit: "Canonical field", note: "Mapping is configuration state, not a scientific output." },
  "annotation-grammar": { title: "Annotation grammar", xUnit: "Event", yUnit: "Review state", note: "Annotations are additive metadata and do not rewrite source traces." }
};

export function MefPlotFrame({ family, className = "", compact = false }: Readonly<{ family: MefPlotFamily; className?: string; compact?: boolean }>) {
  const copy = plotCopy[family];
  return (
    <MefPanel className={`mef-plot-panel${compact ? " mef-plot-compact" : ""}${className ? ` ${className}` : ""}`}>
      <MefPanelHeader title={copy.title} detail="Authority grammar only" action={<MefStatusChip status="unavailable" compact />} />
      <div className="mef-plot-toolbar" aria-label="Plot semantics">
        <MefBadge tone="cyan">Source layer: canonical</MefBadge>
        <MefBadge>Transform: none</MefBadge>
        <MefBadge>Review overlay: none</MefBadge>
      </div>
      <MefEchartsFrame compact={compact} note={copy.note} title={copy.title} xUnit={copy.xUnit} yUnit={copy.yUnit} />
      <p className="mef-plot-caption">No trace, estimate, interval, reference band, or event marker is rendered until its evidence contract is present.</p>
      <table className="mef-visually-hidden"><caption>{copy.title} data table</caption><thead><tr><th>{copy.xUnit}</th><th>{copy.yUnit}</th></tr></thead><tbody><tr><td colSpan={2}>No observations available.</td></tr></tbody></table>
    </MefPanel>
  );
}

export function MefProvenanceStrip({ compact = false }: Readonly<{ compact?: boolean }>) {
  const nodes = ["Source artifact", "Canonical record", "Review metadata", "Evidence record"];
  return (
    <div className={`mef-provenance-strip${compact ? " mef-provenance-compact" : ""}`} aria-label="Evidence provenance path">
      {nodes.map((node, index) => (
        <div className="mef-provenance-node" key={node}>
          <span className="mef-provenance-dot" aria-hidden="true" />
          <span>{node}</span>
          {index < nodes.length - 1 ? <span className="mef-provenance-line" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}
