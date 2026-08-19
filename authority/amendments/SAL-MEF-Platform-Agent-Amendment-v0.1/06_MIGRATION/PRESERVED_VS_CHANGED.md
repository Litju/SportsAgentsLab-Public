# Preserved vs Changed

## Preserved without redesign

- `packages/contracts` and schema authority.
- Generated TS/Python models.
- `packages/operational-state` ML-96 primitives.
- ML-97 Command/Job semantics after acceptance.
- Scientific boundary/kernel.
- Evidence/provenance/practitioner authority.
- Existing UX information architecture.
- PostgreSQL migrations and direct SQL approach.
- S3-compatible immutable artifact adapter.

## Changed/added

- `apps/practitioner-web` becomes the real Next.js/Vercel application shell.
- Hosted API routes mount the existing typed control boundary same-origin.
- Eve becomes the selected agent runtime.
- OpenCode Go provider adapter is added.
- Vercel Blob adapter is added.
- Hosted PostgreSQL profile is added (Neon candidate).
- Vercel deployment/preview configuration is added.
- Optional Sandbox adapter/smoke is added for bounded isolated work.
- Vercel Python hosted-science adapter is deferred until scientific workload exists and can be qualified.

## Explicitly not changed

No CMJ formula, threshold, event detector, force-plate adapter, metric pack, reliability model, SESOI, inference model, evidence-tier rule, or forbidden-claim rule is changed by the platform refactor.
