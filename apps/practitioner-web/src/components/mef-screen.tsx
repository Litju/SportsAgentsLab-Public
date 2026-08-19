"use client";

import { useSearchParams } from "next/navigation";
import { SCREEN_BY_ID, stateFromQuery, type ScreenId, type ScreenState } from "../lib/mef-authority";
import { MefIcon } from "./mef-icons";
import { PatternForScreen } from "./mef-patterns";
import { MefBadge, MefLinkButton, MefStatusChip, type MefStatus } from "./mef-primitives";

function defaultStatus(screenId: ScreenId): MefStatus {
  if (screenId === "20-athlete-longitudinal") return "planned";
  if (screenId === "03-imports-hub" || screenId === "06-source-mapping" || screenId === "08-acquisition-config" || screenId === "11-trial-qa" || screenId === "12-event-review" || screenId === "16-session-adjudication") return "needs-review";
  if (screenId === "30-agent-memory") return "info";
  return "unavailable";
}

function primaryHref(screenId: ScreenId, route: string): string {
  switch (screenId) {
    case "02-command-center": return "/imports";
    case "37-system-health": return "/settings/health?state=degraded";
    case "29-report-builder": return `${route}?state=forbidden-claim`;
    case "20-athlete-longitudinal": return `${route}?state=planned-only`;
    case "06-source-mapping": return `${route}?state=blocked`;
    case "08-acquisition-config": return `${route}?state=validation-error`;
    case "16-session-adjudication": return `${route}?state=review-conflict`;
    default: return `${route}?state=empty`;
  }
}

function stateStatus(state: ScreenState, screenId: ScreenId): MefStatus {
  if (state === "default") return defaultStatus(screenId);
  if (state === "planned-only") return "planned";
  if (state === "forbidden-claim") return "forbidden-claim";
  if (state === "degraded") return "degraded";
  if (state === "blocked" || state === "permission-denied" || state === "missing-link") return "blocked";
  if (state === "review-conflict" || state === "validation-error") return "needs-review";
  return "unavailable";
}

export function MefScreen({ screenId }: Readonly<{ screenId: ScreenId }>) {
  const definition = SCREEN_BY_ID[screenId];
  const searchParams = useSearchParams();
  const state = stateFromQuery(searchParams.get("state"), definition);
  const status = stateStatus(state, screenId);

  return (
    <div className="mef-screen" data-fixture-only="true" data-mef-scientific-authority="none" data-screen-id={screenId} data-screen-kind={definition.kind} data-screen-state={state} data-testid={`screen-${screenId}`}>
      <header className="mef-page-header">
        <div className="mef-page-heading">
          <div className="mef-breadcrumbs"><span>MEF</span><MefIcon name="chevron" size={13} /><span>{definition.area}</span><MefIcon name="chevron" size={13} /><span>{definition.eyebrow}</span></div>
          <div className="mef-title-row"><div><p className="mef-kicker">{definition.eyebrow}</p><h1>{definition.title}</h1><p className="mef-page-summary">{definition.summary}</p></div><div className="mef-page-status"><MefStatusChip status={status} /><MefBadge tone="violet">{definition.stage}</MefBadge></div></div>
        </div>
        <div className="mef-page-actions"><MefLinkButton href={primaryHref(screenId, definition.route)} icon={screenId === "02-command-center" ? "arrow" : "chevron"}>{definition.primaryAction}</MefLinkButton><p className="mef-action-note"><MefIcon name={definition.evidence ? "link" : "shield"} size={13} />{definition.evidence ? "Evidence entry point stays visible" : "Assistant unavailable on this route"}</p></div>
      </header>
      <div className="mef-boundary-ribbon"><MefIcon name="shield" size={15} /><span>Authority boundary</span><strong>No scientific result is emitted by this UI layer.</strong><span className="mef-boundary-spacer" /><span>{definition.capability}</span></div>
      <div className="mef-screen-body"><PatternForScreen definition={definition} state={state} /></div>
    </div>
  );
}
