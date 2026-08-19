import { MefRoute } from "./mef-route";
import type { ScreenId } from "../lib/mef-authority";

export type WorkspaceScreenKey = "overview" | "tests" | "athletes" | "imports" | "evidence" | "reports" | "protocols" | "settings";

const screenForLegacyKey: Record<WorkspaceScreenKey, ScreenId> = {
  overview: "02-command-center",
  tests: "25-metrics-dictionary",
  athletes: "18-athlete-directory",
  imports: "03-imports-hub",
  evidence: "21-evidence-library",
  reports: "28-report-library",
  protocols: "24-references-hub",
  settings: "33-settings-workspace"
};

export function WorkspaceScreen({ screen }: Readonly<{ screen: WorkspaceScreenKey }>) {
  return <MefRoute screenId={screenForLegacyKey[screen]} />;
}
