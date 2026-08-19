# MEF UI Composition Stack v1

## Summary

- Establishes the governed MEF UI composition stack on top of the accepted ML-104 base.
- Adds source-owned Beautiful UI agent patterns, Radix Dialog, Motion with reduced-motion handling, TanStack Table v9 plus bounded TanStack Virtual, React Flow provenance, rendering-only ECharts, and RHF/Zod session-only validation.
- Preserves the existing 38 authority routes, workspace/search behavior, evidence inspector, practitioner authority boundary, and blocked ML-105/ML-106 follow-ons.
- Includes baseline/final visual evidence, 14 critical states, accessibility evidence, bundle evidence, dependency/license audit, and the self-evolving UX skill gate.

## Validation

- `pnpm run validate`
- `pnpm run python:validate`
- `pnpm --filter @mef/practitioner-web typecheck`
- `pnpm --filter @mef/practitioner-web lint`
- `pnpm --filter @mef/practitioner-web build`
- `pnpm --filter @mef/practitioner-web test`
- `pnpm run test:security`
- `pnpm run test:secrets`
- `pnpm audit --audit-level high`
- Playwright: 38 routes, 14 critical states, responsive viewports, reduced motion, keyboard focus, table interactions, provenance graph, ECharts shell, and Eve dialog.
- axe-core: zero serious or critical violations across all 38 routes.

## Acceptance boundary

- This PR is intentionally draft until the protected Vercel Preview gate is verified.
- Local unauthenticated `/api/context` and `/api/status` remain degraded as expected; no credentials or secrets are stored in the repository.
- Do not merge this PR automatically; ML-105, ML-106, B02, and blocked scientific processors remain untouched.
