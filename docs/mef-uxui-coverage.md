# MEF UX/UI implementation coverage

This is the implementation ledger for `SportsAgentsLab_MEF_UXUI_Model_Authority_v1.0.0-preimpl.zip`.
It is a working record; files under `authority/` remain frozen source artifacts.

## Authority and boundary

| Field | Value |
| --- | --- |
| Product | SportsAgentsLab Measurement Evidence Factory (MEF) |
| Mission | `SPORTSAGENTSLAB_MEF_FULL_UXUI_AUTHORITY_IMPLEMENTATION` |
| Branch | `work/mef-full-uxui-authority-implementation` |
| Entry head | `b90c6acfae4880392bee7333b8789bcff7b3edc9` |
| Base | `origin/main` at `b90c6acfae4880392bee7333b8789bcff7b3edc9` |
| Accepted platform predecessor | `7b0e8be` (authority amendment record) |
| ML-101 status | `NOT_CLOSED`; isolated UX/UI work only |
| Scientific authority | `NONE_FROM_THIS_BUNDLE` |
| Bundle SHA-256 observed locally | `C74F620804218826857BA9FC170C2335939600DA135DDEBE268EB9A384F70801` |

The prompt names the target branch and authorizes this isolated implementation, but Linear has no issue whose branch matches this mission. That disagreement is retained as a known deviation; it does not authorize product-science or platform changes.

## Primary screen coverage

`EXISTING_ROUTE` records the route that was present before this run. `TARGET_ROUTE` is the authority route. `EVIDENCE_ENTRY_POINT` is the required user-facing doorway; it is not a claim that evidence exists.

| ID | Screen | Existing route | Target route | Primary state | Alternate states | Data / science boundary | Agent | Evidence entry point | Test ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 00-auth | Secure Workspace Access | `/login` | `/login` | Continue | error, loading | auth / none | no | no | `screen-00-auth` |
| 01-workspace-switcher | Workspace Switcher | — | `/workspaces` | Continue | empty, error | context / none | no | no | `screen-01-workspace-switcher` |
| 02-command-center | Command Center | `/` | `/` | Open work queue | loading, empty, error | queue / none | yes | yes | `screen-02-command-center` |
| 03-imports-hub | Force Plates & Imports | `/imports` | `/imports` | Open selected item | empty, error | source artifacts / B01 acquisition only | yes | yes | `screen-03-imports-hub` |
| 04-import-batch-detail | Import Batch Detail | — | `/imports/batches/:batchId` | Open evidence / next workflow | loading, error, blocked | import batch / B01 parsing unavailable | yes | yes | `screen-04-import-batch-detail` |
| 05-source-artifact-detail | Source Artifact Detail | — | `/imports/artifacts/:artifactId` | Open evidence / next workflow | loading, error, blocked | immutable source / no overwrite | yes | yes | `screen-05-source-artifact-detail` |
| 06-source-mapping | Source Mapping | — | `/imports/artifacts/:artifactId/mapping` | Validate and continue | blocked | mapping config / no silent mutation | yes | yes | `screen-06-source-mapping` |
| 07-source-profiles | Source & Device Profiles | — | `/imports/sources` | Open selected item | empty, error | profile registry / none | yes | yes | `screen-07-source-profiles` |
| 08-acquisition-config | Acquisition Configuration | — | `/imports/artifacts/:artifactId/acquisition` | Validate and continue | validation error, blocked | acquisition config / B01 only | yes | yes | `screen-08-acquisition-config` |
| 09-trial-library | Trial Library | — | `/trials` | Open selected item | empty, loading, error | trial records / B02 processor unavailable | yes | yes | `screen-09-trial-library` |
| 10-trial-detail | Trial Detail | — | `/trials/:trialId` | Open evidence / next workflow | loading, blocked | trial record / no CMJ result | yes | yes | `screen-10-trial-detail` |
| 11-trial-qa | Trial QA Workspace | — | `/trials/:trialId/qa` | Commit review metadata | loading, blocked | review metadata / B02 unavailable | yes | yes | `screen-11-trial-qa` |
| 12-event-review | Event Review | — | `/trials/:trialId/events` | Commit review metadata | empty, error, blocked | event review / no onset or landing | yes | yes | `screen-12-event-review` |
| 13-override-history | Override History | — | `/trials/:trialId/overrides` | Inspect event | empty, error | additive metadata / source immutable | yes | yes | `screen-13-override-history` |
| 14-session-queue | Session Queue | — | `/sessions` | Open selected item | empty | session records / B03 unavailable | yes | yes | `screen-14-session-queue` |
| 15-session-detail | Session Detail | — | `/sessions/:sessionId` | Open evidence / next workflow | loading, error | session record / no UI metrics | yes | yes | `screen-15-session-detail` |
| 16-session-adjudication | Session Adjudication | — | `/sessions/:sessionId/adjudicate` | Qualify session | review conflict, blocked | adjudication / no automatic qualification | yes | yes | `screen-16-session-adjudication` |
| 17-session-decision-log | Session Decision Log | — | `/sessions/:sessionId/decisions` | Inspect event | empty, error | audit metadata / none | yes | yes | `screen-17-session-decision-log` |
| 18-athlete-directory | Athlete Directory | `/athletes` | `/athletes` | Open selected item | empty, error | athlete records / no health claim | yes | yes | `screen-18-athlete-directory` |
| 19-athlete-profile | Athlete Profile | — | `/athletes/:athleteId` | Open evidence / next workflow | loading, error | profile / no diagnosis | yes | yes | `screen-19-athlete-profile` |
| 20-athlete-longitudinal | Athlete Longitudinal | — | `/athletes/:athleteId/longitudinal` | Change metric/window | planned-only | B04+ / Planned | yes | yes | `screen-20-athlete-longitudinal` |
| 21-evidence-library | Evidence Library | `/evidence` | `/evidence` | Open selected item | loading, empty, error | evidence records / verified capability only | yes | yes | `screen-21-evidence-library` |
| 22-evidence-record | Evidence Record | — | `/evidence/:evidenceId` | Open provenance | missing-link | evidence graph / no result invention | yes | yes | `screen-22-evidence-record` |
| 23-provenance-graph | Provenance Graph | — | `/evidence/:evidenceId/provenance` | Inspect node | empty, error | provenance / source-linked only | yes | yes | `screen-23-provenance-graph` |
| 24-references-hub | References Hub | `/protocols` | `/references` | Open selected item | empty, error | reference catalog / none | yes | yes | `screen-24-references-hub` |
| 25-metrics-dictionary | Metrics Dictionary | — | `/references/metrics` | Open selected item | empty, error | definitions / B02 typed tools only | yes | yes | `screen-25-metrics-dictionary` |
| 26-protocol-library | Protocol Library | — | `/references/protocols` | Open selected item | empty, error | protocols / no readiness claim | yes | yes | `screen-26-protocol-library` |
| 27-method-detail | Method Detail | — | `/references/methods/:methodId` | Open provenance | loading, error | method definition / no execution result | yes | yes | `screen-27-method-detail` |
| 28-report-library | Report Library | `/reports` | `/reports` | Open selected item | empty, error | reports / evidence-linked only | yes | yes | `screen-28-report-library` |
| 29-report-builder | Report Builder | — | `/reports/:reportId` | Preview / export evidence-linked report | forbidden-claim | report draft / no unsupported claims | yes | yes | `screen-29-report-builder` |
| 30-agent-memory | Assistant Memory | — | `/assistant/memory` | Edit/delete memory | empty, error | preferences / never evidence | yes | yes | `screen-30-agent-memory` |
| 31-notifications | Notifications | — | `/notifications` | Inspect event | empty, error | event log / none | yes | yes | `screen-31-notifications` |
| 32-audit-log | Audit Log | — | `/audit` | Inspect event | empty, error | audit trail / immutable history | yes | yes | `screen-32-audit-log` |
| 33-settings-workspace | Workspace Settings | `/settings` | `/settings` | Save explicit changes | validation error, permission denied | workspace config / no policy bypass | yes | yes | `screen-33-settings-workspace` |
| 34-roles-permissions | Roles & Permissions | — | `/settings/roles` | Save explicit changes | permission denied, error | authorization / preserve RLS | yes | yes | `screen-34-roles-permissions` |
| 35-integrations | Integrations | — | `/settings/integrations` | Save explicit changes | degraded | provider config / no processor claim | yes | yes | `screen-35-integrations` |
| 36-scientific-policies | Scientific & Claim Policies | — | `/settings/scientific` | Save explicit changes | permission denied, validation error | policy config / preserve claim boundary | yes | yes | `screen-36-scientific-policies` |
| 37-system-health | System Health | — | `/settings/health` | Open work queue | loading, error, degraded | runtime health / no science result | yes | yes | `screen-37-system-health` |

## Component and plot coverage

| Authority family | Count | Implementation seam | State strategy |
| --- | ---: | --- | --- |
| buttons | 126 | `MefButton` | intent × size × default/hover/pressed/focus/disabled/loading |
| inputs | 48 | `MefField` | type × default/focus/error/disabled |
| status | 22 | `MefStatusChip` | icon + label + semantic color; never color-only |
| navigation | 11 | `MefRail`, `MefTopbar`, `MefTabs` | active/default/focus plus keyboard route access |
| containers | 13 | `MefPanel`, `MefDrawer`, `MefModal`, `MefDock` | layout surface × open/closed where applicable |
| data | 15 | `MefData*` patterns | source/state context and evidence entry point remain visible |
| feedback | 13 | `MefFeedback` | empty/error/loading/blocked/permission/degraded/recovery |
| agent | 10 | `EveAgentDock` | bounded assistant, typed tool/evidence cards, no silent mutations |
| **Total** | **258** | token-driven primitives | authority SVGs remain reference artifacts; no rasterization |

All 19 plot authorities use `MefPlotContract`: units are explicit, source/canonical/derived layers are named, smoothing is visible and reversible, and unavailable scientific bindings render an honest contract state instead of a trace or metric.

| Plot family | Contract state in this run |
| --- | --- |
| annotation-grammar, force-time, dual-plate, event-zoom | Awaiting deterministic processor; no trace values |
| velocity-time, displacement-time, impulse-area, quality-trace | Planned / unavailable; no derived values |
| trial-comparison, session-matrix, longitudinal, rolling-baseline | Planned / no cohort values |
| uncertainty-band, distribution, cohort-comparison | Planned / no intervals or populations |
| provenance-graph, session-timeline, data-quality, mapping-preview | Structural evidence/config view only |

## Required proof IDs

- `route-coverage-38`: every authority route resolves deterministically.
- `state-coverage-14`: every critical alternate state is reachable with `?state=` and has no fake scientific values.
- `component-coverage-258`: family/state/size contracts are represented by reusable primitives.
- `plot-coverage-19`: every plot family has units/semantics/availability copy or structural evidence view.
- `keyboard-focus-aa`: keyboard traversal, visible focus, hit targets, and reduced-motion parity.
- `scientific-leakage`: no fixture values, CMJ metrics, or agent-invented calculations enter production surfaces.
