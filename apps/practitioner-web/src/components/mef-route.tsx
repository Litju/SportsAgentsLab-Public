import { Suspense } from "react";
import { MefScreen } from "./mef-screen";
import type { ScreenId } from "../lib/mef-authority";

export function MefRoute({ screenId }: Readonly<{ screenId: ScreenId }>) {
  return <Suspense fallback={<div className="mef-screen-fallback" aria-label="Loading workspace" />}><MefScreen screenId={screenId} /></Suspense>;
}
