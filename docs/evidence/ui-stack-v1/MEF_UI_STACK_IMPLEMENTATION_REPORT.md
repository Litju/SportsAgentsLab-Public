# MEF UI Composition Stack v1 — Implementation Report

## Product surface

- 38 governed route definitions remain covered by the existing MEF pattern system.
- The shared shell now composes responsive navigation, the Eve agent dock, governed tables, evidence/provenance surfaces, chart shells, and session-only memory forms.
- No authority, tenancy, authentication, artifact, database, or scientific boundary was changed.

## Implemented seams

| File | Implementation |
| --- | --- |
| `apps/practitioner-web/src/components/mef/agent/mef-beautiful-ui.tsx` | Source-owned Beautiful UI adaptations: observable activity, streaming text, tool chips, task rows, context cards, guarded approval card, agent messages and source/observed/canonical diff table |
| `apps/practitioner-web/src/components/eve-agent-dock.tsx` | Motion desktop continuity and Radix mobile dialog; lifecycle states remain bounded and honest |
| `apps/practitioner-web/src/components/mef/data/mef-data-table.tsx` | TanStack Table v9 features, Lucide controls, sticky semantic table, filtering, selection, column visibility, row actions and TanStack Virtual for long lists |
| `apps/practitioner-web/src/components/mef/provenance/mef-provenance-graph.tsx` | Lazy React Flow read-only provenance graph with four nodes and three edges |
| `apps/practitioner-web/src/components/mef/charts/mef-echarts-frame.tsx` | Lazy, tree-shakable ECharts SVG renderer with ARIA chart frame and empty-state safety |
| `apps/practitioner-web/src/components/mef/forms/mef-session-preference-form.tsx` | React Hook Form + Zod validation with visible errors, cancel, dirty-safe session-only submission |
| `apps/practitioner-web/src/components/mef-patterns.tsx` | Shared table, diff table, graph, and form composition across existing routes |
| `apps/practitioner-web/src/components/mef-plots.tsx` | Lazy chart seam with no invented data and a text/table fallback |
| `apps/practitioner-web/app/globals.css` | Responsive shell, table, dialog, graph, chart, agent, reduced-motion and focusable-region styles |
| `apps/practitioner-web/package.json` / `pnpm-lock.yaml` | Locked runtime dependencies for the requested stack |

## Dependency implementation

Installed and used in the real app: `@hookform/resolvers`, `@radix-ui/react-dialog`, `@tanstack/react-table`, `@tanstack/react-virtual`, `@xyflow/react`, `echarts`, `lucide-react`, `motion`, `react-hook-form`, and the existing `zod` dependency. Beautiful UI and shadcn/ui are implemented as selective source-owned patterns, not as a second runtime or copied registry.

## Verification

- Node `v24.14.0`; pnpm `9.15.4`.
- Root `pnpm run validate`: pass; the existing live-Postgres tests were skipped because `MEF_DATABASE_URL` is not configured.
- Practitioner typecheck, lint, production build, package tests: pass.
- Architecture, contracts, compatibility, TypeScript, smoke and security suites: pass.
- `axe-core` 4.13 full 38-route pass: zero violations after the focusable comparison region and action-header fixes.
- Final Playwright evidence: 38 routes, 14 critical states, wide/desktop/tablet/mobile/reduced-motion captures.
- Full resource checks confirm ECharts is loaded on the trial chart route and React Flow on the provenance route, not the command-center route.

## Limits

The hosted Preview deployment is Ready and its authenticated synthetic bootstrap returned HTTP 200 on the isolated branch-scoped environment. The browser relay rendered `/imports` and exposed the real file picker and upload control; the client-side upload state did not enable through that relay, so this interaction remains a documented acceptance limitation rather than a claimed pass. Direct browser automation without a Vercel SSO session redirects to Vercel login. Unauthenticated Preview `/api/status` returns HTTP 401, while local provider/runtime support remains bounded by the existing local limitation.
