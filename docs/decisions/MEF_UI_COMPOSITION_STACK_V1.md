# MEF UI Composition Stack v1

Status: implementation candidate on `work/mef-ui-composition-stack-v1`

## Authority and scope

This decision consumes the accepted ML-104 predecessor contract. The
controlling preflight was ML-104, predecessor evidence commit
`e5ec7e37e9602e9f84ba37ad765207d2743a0689`, merged to `main` as
`0b4127104c0643397c4c0ceb9f021dd9e6d423fd`. ML-104 was marked Done after the
merge. ML-105 and ML-106 remain Backlog and blocked; this stack does not
implement either issue or advance the scientific block.

The attached run instruction authorizes this auxiliary development-time UI
composition stack. It does not override repository authority files, and no
file under `authority/` was changed.

## Decision

Keep the existing MEF screen-definition and pattern system as the semantic
source of truth. Add only bounded shared seams under
`apps/practitioner-web/src/components/mef/` and improve the global shell and
Eve surface. All 38 screen definitions continue to resolve through the same
authority map; shared composition changes therefore cover the full route set
without a parallel page system.

The implementation is deliberately source-owned. Existing MEF primitives and
tokens remain the base; the shadcn idea is adopted as source ownership rather
than adding a generated package or a second component foundation.

## Stack adoption

| Capability | Decision | Use in v1 | Guardrail |
| --- | --- | --- | --- |
| Beautiful UI | Adapt | Observable agent states and bounded feedback language | No second chat runtime or hidden reasoning |
| Radix Dialog | Adopt | Mobile Eve drawer with focus/escape/return behavior | One justified primitive |
| shadcn | Adapt | Existing repository-owned MEF components | No copied package registry |
| TanStack Table v9 | Adopt | Governed library rows | v9 `useTable` + explicit features; no duplicate table engine |
| TanStack Virtual | Adopt | Long-table path in the shared table | Only activates above 12 rows |
| Motion | Adopt | Desktop Eve entrance continuity | Zero duration under reduced motion |
| React Flow | Adopt | Read-only provenance graph | Dragging and connecting disabled; no mutation |
| Apache ECharts | Adopt | Empty scientific chart rendering shell | Rendering only; no values or transforms fabricated |
| Lucide | Adopt | New common mobile/send/table controls | Existing MEF domain icon wrapper remains source-owned |
| React Hook Form + Zod | Adopt | Session-only preference form | Local preview; no server/evidence write |

Official documentation consulted before installation: [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction),
[TanStack Table](https://tanstack.com/table/latest),
[TanStack Virtual](https://tanstack.com/virtual/latest),
[Motion for React](https://motion.dev/docs/react),
[React Flow](https://reactflow.dev/learn),
[Apache ECharts accessibility](https://echarts.apache.org/handbook/en/best-practices/aria/),
[shadcn/ui](https://ui.shadcn.com/docs),
[Lucide](https://lucide.dev/),
[React Hook Form](https://react-hook-form.com/), and
[Zod](https://zod.dev/).

Package versions are locked in `apps/practitioner-web/package.json` and
`pnpm-lock.yaml`. The added packages are MIT/Apache-2.0/ISC licensed upstream
components with tree-shakable entry points where provided; ECharts is imported
from core/charts/components/renderers rather than the all-in bundle. The
transitive footprint is reviewed by the lockfile and build output; no second
chart, icon, table, form, or chat foundation is introduced.

## Non-goals and boundaries

This change does not add configuration resolution, eligibility, quiet
standing, body weight, onset/takeoff/landing, velocity, displacement, impulse,
jump height, CMJ, readiness, fatigue, injury, health, causality, or any other
blocked scientific output. Empty chart and provenance states remain explicit.

No route, tenancy, authentication, authorization, database, artifact storage,
agent authority, or security boundary is changed. `/api/context` and
`/api/status` failures in local support evidence remain visible as degraded
states; the UI does not claim those capabilities are available.

## Evolution rule

The shared skill `sal-mef-ux-composition-evolver` lives in the development
skill authority at `<LOCAL_PATH_REDACTED>`. It uses
observe -> classify -> propose -> fixed evaluations -> accessibility/visual/
performance checks -> promote or reject. Its immutable core protects the
contracts above; only composition guidance can evolve. Its fixed validator and
package hash are recorded in the run evidence.
