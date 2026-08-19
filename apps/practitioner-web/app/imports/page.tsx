import { MefIcon } from "../../src/components/mef-icons";
import { SourceImportPanel } from "../../src/components/source-import-panel";

export default function ImportsPage() {
  return (
    <div className="ml106-imports-page">
      <header className="ml106-imports-header">
        <div>
          <p className="mef-kicker">ML-106 / B01-05 · measurement intake</p>
          <h1>Force-plate imports</h1>
          <p>Upload a measurement source, then inspect exactly what the system detected, mapped, and resolved before any downstream processing is considered.</p>
        </div>
        <div className="ml106-imports-boundary"><MefIcon name="shield" size={16} /><span><strong>Evidence first.</strong> Unknown metadata stays unknown.</span></div>
      </header>
      <div className="imports-source-wrap"><SourceImportPanel /></div>
    </div>
  );
}
