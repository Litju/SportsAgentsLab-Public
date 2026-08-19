import type { ReactNode } from "react";

export function ShowcasePanel({ children, className = "", as: Tag = "section", ...props }: Readonly<{ children: ReactNode; className?: string; as?: "section" | "article" | "div"; [key: string]: unknown }>) {
  return <Tag className={`showcase-panel${className ? ` ${className}` : ""}`} {...props}>{children}</Tag>;
}

export function ShowcasePanelHeader({ eyebrow, title, detail, action }: Readonly<{ eyebrow?: string; title: string; detail?: string; action?: ReactNode }>) {
  return (
    <div className="showcase-panel-header">
      <div>
        {eyebrow ? <p className="showcase-kicker">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {detail ? <p className="showcase-panel-detail">{detail}</p> : null}
      </div>
      {action ? <div className="showcase-panel-action">{action}</div> : null}
    </div>
  );
}
