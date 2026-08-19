"use client";

import { useMemo, useState } from "react";

const scenarios = [
  "SUCCESS",
  "RETRY_THEN_SUCCESS",
  "NON_RETRYABLE_FAILURE",
  "CANCELLABLE",
  "UNKNOWN_OUTCOME",
  "PROGRESS"
] as const;

type Scenario = typeof scenarios[number];
type Snapshot = {
  job?: { job_id?: string; state?: string; current_attempt_number?: number; error?: { code?: string } };
  progress?: { events?: readonly { phase?: string; message_code?: string; progress_value?: number }[] };
};

export function FixtureJobCard() {
  const [scenario, setScenario] = useState<Scenario>("SUCCESS");
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const jobId = snapshot?.job?.job_id;
  const events = useMemo(() => snapshot?.progress?.events ?? [], [snapshot]);

  async function postJson(path: string, body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const json = await response.json() as Snapshot & { error?: { message?: string }; snapshot?: Snapshot };
      if (!response.ok) throw new Error(json.error?.message ?? "The fixture request failed.");
      setSnapshot(json.snapshot ?? json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fixture request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fixture-card">
      <div className="fixture-heading">
        <div>
          <p className="card-kicker">ML-99 qualification path</p>
          <h2>Synthetic command → job → progress</h2>
        </div>
        <span className="state-chip execution">No live ingestion</span>
      </div>
      <p className="fixture-copy">This panel exercises the existing ControlApi and JobExecutionService with synthetic fixtures only. It is not a force-plate importer.</p>
      <div className="fixture-controls">
        <label>
          <span>Scenario</span>
          <select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)} disabled={busy}>
            {scenarios.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void postJson("/api/fixtures", { scenario, execute: false })} disabled={busy}>
          Submit command
        </button>
        <button type="button" onClick={() => jobId && void postJson(`/api/jobs/${jobId}/run`)} disabled={busy || !jobId}>
          Run worker
        </button>
        <button type="button" className="secondary-button" onClick={() => jobId && void postJson(`/api/jobs/${jobId}`, { reason_code: "USER_REQUESTED" })} disabled={busy || !jobId}>
          Request cancel
        </button>
      </div>

      {error ? <p className="fixture-error">{error}</p> : null}
      {snapshot ? (
        <div className="fixture-result" aria-live="polite">
          <div><span className="result-label">Job</span><code>{jobId ?? "unavailable"}</code></div>
          <div><span className="result-label">State</span><strong className={snapshot.job?.state === "UNKNOWN_OUTCOME" ? "unknown-text" : ""}>{snapshot.job?.state ?? "unavailable"}</strong></div>
          <div><span className="result-label">Attempt</span><strong>{snapshot.job?.current_attempt_number ?? "—"}</strong></div>
          <div><span className="result-label">Progress</span><strong>{events.length} event{events.length === 1 ? "" : "s"}</strong></div>
          {snapshot.job?.error?.code ? <div><span className="result-label">Safe error</span><strong className="unknown-text">{snapshot.job.error.code}</strong></div> : null}
        </div>
      ) : null}
    </section>
  );
}
