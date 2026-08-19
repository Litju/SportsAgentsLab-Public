import { AlertTriangle, Check, CircleDashed, LoaderCircle, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";

export type MefAgentLifecycle = "idle" | "collecting" | "running" | "awaiting-input" | "streaming" | "succeeded" | "failed" | "degraded";
type AgentPart = Readonly<{ type: string; text?: string; toolName?: string; state?: string }>;

const lifecycleCopy: Record<MefAgentLifecycle, string> = {
  idle: "Ready for an observable request",
  collecting: "Collecting visible context",
  running: "Running an authorized action",
  "awaiting-input": "Waiting for practitioner input",
  streaming: "Streaming an answer",
  succeeded: "Turn completed",
  failed: "Turn failed safely",
  degraded: "Runtime capability is degraded"
};

export function MefActivityTrace({ status }: Readonly<{ status: MefAgentLifecycle }>) {
  const Icon = status === "running" || status === "streaming" ? LoaderCircle : status === "failed" || status === "degraded" ? AlertTriangle : status === "succeeded" ? Check : CircleDashed;
  return <div aria-busy={status === "running" || status === "streaming"} aria-live="polite" className={`mef-agent-activity mef-agent-activity-${status}`} role="status"><Icon aria-hidden="true" size={14} /><span>{lifecycleCopy[status]}</span></div>;
}

export function MefStreamingText({ text, streaming = false }: Readonly<{ text: string; streaming?: boolean }>) {
  return <span aria-busy={streaming || undefined} className="mef-agent-streaming-text">{text}</span>;
}

export function MefToolChip({ name, state = "observed" }: Readonly<{ name: string; state?: string }>) {
  return <span className="mef-agent-tool-chip"><Wrench aria-hidden="true" size={12} /><span>{name}</span><small>{state}</small></span>;
}

export function MefTaskRow({ label, detail, state }: Readonly<{ label: string; detail: string; state: "idle" | "running" | "complete" | "failed" }>) {
  const Icon = state === "running" ? LoaderCircle : state === "complete" ? Check : state === "failed" ? AlertTriangle : CircleDashed;
  return <div className={`mef-agent-task mef-agent-task-${state}`} role="status"><Icon aria-hidden="true" size={14} /><div><strong>{label}</strong><span>{detail}</span></div><small>{state}</small></div>;
}

export function MefContextCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return <section className="mef-agent-context-card"><ShieldCheck aria-hidden="true" size={16} /><div><strong>{title}</strong><span>{children}</span></div></section>;
}

export function MefApprovalCard({ question, options, onChoose, disabled = false }: Readonly<{ question: string; options: readonly string[]; onChoose: (option: string) => void; disabled?: boolean }>) {
  return <fieldset className="mef-agent-approval" disabled={disabled}><legend>Practitioner approval required</legend><p>{question}</p><div>{options.map((option) => <button key={option} type="button" onClick={() => onChoose(option)}>{option}</button>)}</div></fieldset>;
}

export type MefDiffRow = Readonly<{ field: string; source: string; observed: string; canonical: string; state: string }>;

export function MefDiffTable({ rows }: Readonly<{ rows: readonly MefDiffRow[] }>) {
  return <div aria-label="Source to canonical comparison" className="mef-diff-table-wrap" role="region" tabIndex={0}><table className="mef-diff-table"><caption>Source, observed, and canonical boundary</caption><thead><tr><th scope="col">Field</th><th scope="col">Source</th><th scope="col">Observed</th><th scope="col">Canonical</th><th scope="col">State</th></tr></thead><tbody>{rows.map((row) => <tr key={row.field}><th scope="row">{row.field}</th><td>{row.source}</td><td>{row.observed}</td><td>{row.canonical}</td><td>{row.state}</td></tr>)}</tbody></table></div>;
}

export function MefAgentMessage({ role, parts, streaming = false }: Readonly<{ role: string; parts: readonly AgentPart[]; streaming?: boolean }>) {
  const textParts = parts.filter((part) => part.type === "text" && part.text);
  const toolParts = parts.filter((part) => part.type.startsWith("tool"));
  const approvalParts = parts.filter((part) => part.type === "approval-requested");
  return <div className={`eve-message eve-message-${role}`}><span className="eve-message-role">{role === "assistant" ? "Eve" : "You"}</span>{textParts.map((part, index) => <p key={`text-${index}`}><MefStreamingText streaming={streaming} text={part.text ?? ""} /></p>)}{toolParts.map((part, index) => <MefToolChip key={`tool-${index}`} name={part.toolName ?? part.text ?? "Observable tool"} state={part.state ?? "observed"} />)}{approvalParts.map((part, index) => <MefApprovalCard disabled key={`approval-${index}`} onChoose={() => undefined} options={["Approve visible action", "Keep unchanged"]} question={part.text ?? "A practitioner decision is required before the action can continue."} />)}</div>;
}
