# SAL-MEF Platform + Agent Architecture Amendment v0.1

**Artifact:** `SAL-MEF-Platform-Agent-Amendment-v0.1`\
**Date:** 2026-08-11\
**Owner:** SportsAgentsLab founder / architecture authority\
**Status:** `ADOPTED`\
**Adoption effect:** Effective as normative platform/agent authority over the preserved baseline; runtime implementation remains separately gated.\
**Purpose:** Amend the Measurement Evidence Factory (MEF) architecture for a desktop-first web product, Vercel-first prototype/development deployment, Eve agent runtime, and OpenCode model access while preserving the governed scientific/evidence core.

## Authority model

The original source bundles are preserved byte-for-byte. This bundle is an amendment, not a rewrite:

`FROZEN/REVIEW BASELINE + THIS AMENDMENT = CURRENT EFFECTIVE AUTHORITY AFTER ADOPTION`

This amendment is surgical. It changes application platform, deployment, agent runtime selection, model-provider access, workflow implementation strategy, and product-iteration doctrine. It does **not** change the MEF scientific contract, force-plate scope, measurement semantics, evidence authority, practitioner authority, forbidden claims, or provenance requirements.

## Primary decisions

- The MEF v1 client is a **desktop-first web application**, not a native desktop application.
- The primary application framework is **Next.js/React/TypeScript**.
- **Vercel** is the primary prototype/development deployment platform.
- The current **Vercel Hobby** plan is a development/prototype environment only; commercial production on Hobby is not authorized.
- **Eve** is the canonical MEF agent runtime, but remains behind the framework-neutral agent boundary and is version-pinned/upgrade-gated because it is in public preview.
- **OpenCode Go** is the primary model-access provider. Vercel AI Gateway is not required and is disabled by default.
- Vercel/AI SDK packages used to connect Eve to OpenCode are implementation plumbing, not a SportsAgentsLab architecture layer.
- PostgreSQL remains the operational system of record. Hosted deployment uses a provider-neutral `DATABASE_URL`; **Neon is the first Vercel-hosted candidate**, not a domain dependency.
- `ImmutableArtifactStore` remains the storage authority. **Vercel Blob** becomes the primary Vercel deployment adapter; the S3-compatible adapter is preserved for portability.
- The accepted ML-97 Job/Command execution model becomes the v1 system-orchestration baseline after ML-97 acceptance. **Temporal is deferred**, not required for v1.
- Vercel Sandbox is available for bounded isolated workloads, agent evals, generated code, and hostile/untrusted execution. It is not the normal path for database requests or routine scientific computation.
- The Python scientific kernel remains independent and provider-neutral. A Vercel Python Functions adapter is an eligible first hosted adapter only after workload qualification.
- Agent/product iteration speed is a first-class quality attribute: preview-first, small reversible vertical slices, stable governed core, fast-moving agent/application layer.

## Bundle structure

- `00_AUTHORITY/` — authority, supersession, decision, source, and impact records.
- `01_SDD/` — System Design Description amendment.
- `02_TDD/` — Technical Design Document amendment.
- `03_ADR/` — durable architecture decisions and supersessions.
- `04_UX/` — desktop-web shell and persistent agent-dock amendments.
- `05_DIAGRAMS/` — source DOT plus rendered SVG/PNG architecture views.
- `06_MIGRATION/` — current-to-target refactor and roadmap insertion.
- `07_VALIDATION/` — acceptance, architecture invariants, and qualification plan.
- `08_HANDOFF/` — Luna materialization prompt and proposed Linear insertion.

## Adoption sequence

1. Finish/accept ML-97 independently; do not mix this amendment into the ML-97 candidate diff.
2. Create a dedicated platform-authority branch from the accepted main commit.
3. Materialize this bundle into the repository without altering frozen source ZIPs.
4. Run authority/architecture consistency checks.
5. Founder reviews and freezes the amendment.
6. Execute one bounded Vercel/Eve/OpenCode platform refactor and hosted qualification block.
7. Resume ML-98 (auth/authorization/tenancy/secrets) against the real deployment topology.

## Non-negotiable preservation rules

- Scientific calculations never move into Eve, the LLM, the browser, or UI components.
- Eve tools call typed, governed application boundaries.
- The agent cannot bypass ML-97 job execution for authority-bearing or long-running operations.
- Raw high-rate athlete signals do not enter model context by default.
- Unknown remains unknown.
- No generic readiness, fatigue, recovery, injury-risk, causal training, medical, or autonomous prescription claims are introduced.
- Practitioner authority and append-only evidence/decision history remain intact.
