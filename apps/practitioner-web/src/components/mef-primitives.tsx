import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { MefIcon, type MefIconName } from "./mef-icons";

export type MefStatus =
  | "draft"
  | "imported"
  | "mapping-required"
  | "mapped"
  | "canonicalized"
  | "needs-review"
  | "qualified"
  | "verified"
  | "blocked"
  | "forbidden-claim"
  | "planned"
  | "unavailable"
  | "no-qualified-result"
  | "degraded"
  | "info";

const statusCopy: Record<MefStatus, { label: string; icon: MefIconName }> = {
  draft: { label: "Draft", icon: "clock" },
  imported: { label: "Imported", icon: "database" },
  "mapping-required": { label: "Mapping required", icon: "alert" },
  mapped: { label: "Mapped", icon: "check" },
  canonicalized: { label: "Canonicalized", icon: "check" },
  "needs-review": { label: "Needs review", icon: "alert" },
  qualified: { label: "Qualified", icon: "check" },
  verified: { label: "Verified capability", icon: "shield" },
  blocked: { label: "Blocked", icon: "lock" },
  "forbidden-claim": { label: "Forbidden claim", icon: "lock" },
  planned: { label: "Planned", icon: "clock" },
  unavailable: { label: "Unavailable", icon: "alert" },
  "no-qualified-result": { label: "No qualified result", icon: "alert" },
  degraded: { label: "Provider degraded", icon: "alert" },
  info: { label: "Information", icon: "spark" }
};

export function MefStatusChip({ status, label, compact = false }: Readonly<{ status: MefStatus; label?: string; compact?: boolean }>) {
  const copy = statusCopy[status];
  return (
    <span className={`mef-status mef-status-${status}${compact ? " mef-status-compact" : ""}`} data-status={status}>
      <MefIcon name={copy.icon} size={compact ? 13 : 14} />
      <span>{label ?? copy.label}</span>
    </span>
  );
}

type ButtonTone = "primary" | "secondary" | "tertiary" | "violet" | "success" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonVisualProps = Readonly<{
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: MefIconName;
  loading?: boolean;
}>;

export function MefButton({ tone = "primary", size = "md", icon, loading = false, children, className = "", disabled = false, ...props }: ButtonVisualProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button aria-busy={loading || undefined} className={`mef-button mef-button-${tone} mef-button-${size}${className ? ` ${className}` : ""}`} disabled={loading || disabled} {...props}>
      {loading ? <span aria-hidden="true" className="mef-button-spinner" /> : icon ? <MefIcon name={icon} size={16} /> : null}
      <span>{loading ? "Working…" : children}</span>
    </button>
  );
}

export function MefLinkButton({ href, tone = "primary", size = "md", icon, children, className = "", ...props }: ButtonVisualProps & Readonly<{ href: string; children: React.ReactNode; className?: string }>) {
  return (
    <Link className={`mef-button mef-button-${tone} mef-button-${size}${className ? ` ${className}` : ""}`} href={href} {...props}>
      {icon ? <MefIcon name={icon} size={16} /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function MefPanel({ children, className = "", as: Tag = "section", ...props }: Readonly<{ children: ReactNode; className?: string; as?: "section" | "article" | "div"; [key: string]: unknown }>) {
  return <Tag className={`mef-panel${className ? ` ${className}` : ""}`} {...props}>{children}</Tag>;
}

export function MefPanelHeader({ eyebrow, title, detail, action }: Readonly<{ eyebrow?: string; title: string; detail?: string; action?: ReactNode }>) {
  return (
    <div className="mef-panel-header">
      <div>
        {eyebrow ? <p className="mef-kicker">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {detail ? <p className="mef-panel-detail">{detail}</p> : null}
      </div>
      {action ? <div className="mef-panel-action">{action}</div> : null}
    </div>
  );
}

export function MefField({ label, hint, error, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & Readonly<{ label: string; hint?: string; error?: string }>) {
  return (
    <label className={`mef-field${className ? ` ${className}` : ""}`}>
      <span className="mef-field-label">{label}</span>
      <input {...props} />
      {error ? <span className="mef-field-error" role="alert"><MefIcon name="alert" size={13} />{error}</span> : hint ? <span className="mef-field-hint">{hint}</span> : null}
    </label>
  );
}

export function MefKeyValue({ label, value, mono = false }: Readonly<{ label: string; value: ReactNode; mono?: boolean }>) {
  return (
    <div className="mef-key-value">
      <dt>{label}</dt>
      <dd className={mono ? "mef-mono" : ""}>{value}</dd>
    </div>
  );
}

export function MefStateBanner({ status, title, description, action }: Readonly<{ status: MefStatus; title: string; description: string; action?: ReactNode }>) {
  return (
    <section className={`mef-state-banner mef-state-${status}`} aria-live="polite">
      <div className="mef-state-icon"><MefIcon name={status === "blocked" || status === "forbidden-claim" ? "lock" : status === "planned" ? "clock" : "alert"} size={18} /></div>
      <div className="mef-state-copy">
        <div className="mef-state-title-row"><h2>{title}</h2><MefStatusChip status={status} compact /></div>
        <p>{description}</p>
        {action ? <div className="mef-state-action">{action}</div> : null}
      </div>
    </section>
  );
}

export function MefSkeleton({ lines = 3 }: Readonly<{ lines?: number }>) {
  return <div className="mef-skeleton" aria-label="Loading" role="status">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div>;
}

export function MefDivider() {
  return <div className="mef-divider" aria-hidden="true" />;
}

export function MefBadge({ children, tone = "neutral" }: Readonly<{ children: ReactNode; tone?: "neutral" | "cyan" | "violet" | "amber" | "green" }>) {
  return <span className={`mef-badge mef-badge-${tone}`}>{children}</span>;
}
