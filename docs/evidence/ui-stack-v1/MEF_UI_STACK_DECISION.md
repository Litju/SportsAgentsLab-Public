# MEF UI Composition Stack v1 — Evidence Decision

Status: `PASS_WITH_LIMITATIONS` pending protected Vercel Preview acceptance.

The accepted ML-104 predecessor is `e5ec7e37e9602e9f84ba37ad765207d2743a0689`, merged to `main` as `0b4127104c0643397c4c0ceb9f021dd9e6d423fd`. This run uses branch `work/mef-ui-composition-stack-v1`. ML-105, ML-106, B02, and blocked scientific processors remain untouched.

The existing MEF screen-definition and pattern map remains the semantic source of truth. The stack adds shared composition seams under `apps/practitioner-web/src/components/mef/`, keeps MEF primitives source-owned, and applies the same shell across all 38 governed routes.

| Concern | Adopted implementation | Boundary |
| --- | --- | --- |
| AI-native composition | Selective source-owned Beautiful UI adaptations: activity trace, streaming text, tool chip, task row, context card, guarded approval card, diff table | No hidden reasoning, fake confidence, or second chat runtime |
| Accessible primitives | Radix Dialog for the mobile Eve drawer | One justified Radix primitive with focus/escape/return behavior |
| Component ownership | shadcn/ui source-owned convention applied to MEF components | No registry dump and no second primitive foundation |
| Dense data | TanStack Table v9 with sorting, global filtering, selection, column visibility, row actions and sticky headers | Governed records only; evidence state remains explicit |
| Long tables | TanStack Virtual | Activated only for bounded tables with more than 12 rows |
| Motion | Motion for React | Continuity only; reduced motion is honored |
| Provenance | React Flow | Four-node read-only graph; dragging and connecting disabled |
| Scientific rendering | Tree-shakable Apache ECharts SVG shell | No fabricated observations, regressions, transforms, filters, or authority claims |
| Common icons | Lucide React | Domain semantics remain MEF-owned |
| Forms | React Hook Form + Zod | Session-only preference preview; no server or evidence write |

Official references reviewed before implementation: [Beautiful UI](https://beautiful-ui-five.vercel.app/), [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction), [shadcn/ui](https://ui.shadcn.com/docs), [TanStack Table](https://tanstack.com/table/latest), [TanStack Virtual](https://tanstack.com/virtual/latest), [Motion](https://motion.dev/docs/react), [React Flow](https://reactflow.dev/learn), [ECharts ARIA](https://echarts.apache.org/handbook/en/best-practices/aria/), [Lucide](https://lucide.dev/), [React Hook Form](https://react-hook-form.com/), and [Zod](https://zod.dev/).

The detailed ADR is [MEF_UI_COMPOSITION_STACK_V1.md](../../decisions/MEF_UI_COMPOSITION_STACK_V1.md).
