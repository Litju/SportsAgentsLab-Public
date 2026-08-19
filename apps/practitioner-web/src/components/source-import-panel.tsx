"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type SourceImportAttempt = {
  importAttemptId: string;
  originalFilename: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  actualSizeBytes?: number;
  contentHash?: string;
  state: string;
  failureCode?: string;
  safeFailureDetail?: string;
  createdAt: string;
  duplicateOfImportAttemptId?: string;
  scientificEligibility: "INELIGIBLE";
};

type ImportListResponse = { attempts: SourceImportAttempt[] };
type ImportCreateResponse = {
  attempt: SourceImportAttempt & { stagingBlobPath: string };
  upload: { access: "private"; pathname: string; handleUploadUrl: string };
};

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Not verified";
}

function declaredMediaType(file: File): string {
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/iu.test(file.type) ? file.type.toLowerCase() : "application/octet-stream";
}

function stateTone(state: string): string {
  if (state === "READY_FOR_ADAPTER" || state === "STORED") return "mef-badge-green";
  if (state === "UNSUPPORTED" || state === "MALFORMED") return "mef-badge-amber";
  if (state.endsWith("FAILED") || state === "BLOCKED" || state === "CANCELLED") return "mef-badge-violet";
  return "mef-badge-cyan";
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "The import request failed.");
  return payload;
}

export function SourceImportPanel() {
  const [attempts, setAttempts] = useState<SourceImportAttempt[]>([]);
  const [file, setFile] = useState<File | undefined>();
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/imports", { cache: "no-store" });
      const payload = await jsonResponse<ImportListResponse>(response);
      setAttempts(payload.attempts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function startImport() {
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    setError(undefined);
    let importAttemptId: string | undefined;
    let uploadCompleted = false;
    try {
      const created = await jsonResponse<ImportCreateResponse>(await fetch("/api/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          original_filename: file.name,
          declared_content_type: declaredMediaType(file),
          declared_size_bytes: file.size
        })
      }));
      importAttemptId = created.attempt.importAttemptId;
      await upload(created.upload.pathname, file, {
        access: "private",
        handleUploadUrl: created.upload.handleUploadUrl,
        clientPayload: JSON.stringify({ importAttemptId }),
        contentType: declaredMediaType(file),
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage))
      });
      uploadCompleted = true;
      setProgress(100);
      await jsonResponse(await fetch(`/api/imports/${importAttemptId}`, { method: "POST" }));
      await refresh();
      setFile(undefined);
      if (inputRef.current) inputRef.current.value = "";
    } catch (caught) {
      if (importAttemptId && !uploadCompleted) {
        // A browser-side upload error is ambiguous: the Blob service may have
        // accepted the bytes before the response was lost. Reconcile through
        // the trusted server finalizer before treating the attempt as failed.
        try {
          await jsonResponse(await fetch(`/api/imports/${importAttemptId}`, { method: "POST" }));
          setProgress(100);
          await refresh();
          setFile(undefined);
          if (inputRef.current) inputRef.current.value = "";
          return;
        } catch {
          // Leave the attempt retryable. A transport timeout must not erase an
          // upload whose final state is still unknown.
        }
      }
      setError(caught instanceof Error ? caught.message : "The import could not be completed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mef-panel source-import-panel" aria-labelledby="source-import-title">
      <div className="mef-panel-header">
        <div>
          <p className="mef-kicker">ML-102 / B01-01</p>
          <h2 id="source-import-title">Original source artifact intake</h2>
          <p className="source-import-summary">Upload one original file per attempt. The server preserves the exact bytes, verifies SHA-256, and records provenance before any qualified adapter is allowed to interpret measurements.</p>
        </div>
        <span className="mef-badge mef-badge-violet">Scientific processing blocked</span>
      </div>

      <div className="source-import-boundary" role="note">
        <strong>Boundary:</strong> ML-102 stores bytes and identity only. It does not identify a vendor, infer biomechanics, calculate CMJ metrics, or send raw bytes to Eve.
      </div>

      <div className="source-import-form">
        <label className="source-import-picker">
          <span className="source-import-label">Original file</span>
          <input ref={inputRef} type="file" onChange={(event) => setFile(event.target.files?.[0])} disabled={busy} />
          <small>{file ? `${file.name} · ${formatBytes(file.size)}` : "Any file type may be uploaded; unsupported envelopes remain preserved and visibly blocked."}</small>
        </label>
        <button className="mef-button mef-button-primary" type="button" onClick={() => void startImport()} disabled={!file || busy} aria-busy={busy}>
          {busy ? `Uploading ${progress}%` : "Upload original"}
        </button>
      </div>
      {busy ? <div className="source-import-progress" aria-live="polite"><progress max={100} value={progress} /> <span>{progress}% · server finalization follows upload</span></div> : null}
      {error ? <p className="source-import-error" role="alert">{error}</p> : null}

      <div className="source-import-list" aria-live="polite">
        <div className="source-import-list-heading">
          <div><p className="mef-kicker">Immutable intake ledger</p><h3>Upload attempts</h3></div>
          <span className="mef-badge">{loading ? "Loading…" : `${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}</span>
        </div>
        {attempts.length === 0 && !loading ? <p className="source-import-empty">No upload attempts yet. Each upload action creates a distinct attempt, even when the bytes repeat.</p> : null}
        {attempts.map((attempt) => (
          <article className="source-import-row" key={attempt.importAttemptId}>
            <div className="source-import-row-main">
              <Link href={`/imports/${attempt.importAttemptId}`} className="source-import-filename">{attempt.originalFilename}</Link>
              <span className={`mef-badge ${stateTone(attempt.state)}`}>{attempt.state}</span>
              {attempt.duplicateOfImportAttemptId ? <span className="mef-badge mef-badge-amber">duplicate content</span> : null}
              <small>{new Date(attempt.createdAt).toLocaleString()} · {formatBytes(attempt.actualSizeBytes ?? attempt.declaredSizeBytes)} · {attempt.declaredContentType}</small>
            </div>
            <div className="source-import-row-proof"><code title={attempt.contentHash}>{shortHash(attempt.contentHash)}</code><Link className="mef-button mef-button-tertiary mef-button-sm" href={`/imports/${attempt.importAttemptId}`}>Inspect</Link></div>
          </article>
        ))}
      </div>
    </section>
  );
}
