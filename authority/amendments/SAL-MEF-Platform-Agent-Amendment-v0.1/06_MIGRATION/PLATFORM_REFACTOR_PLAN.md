# Platform Refactor Plan

## Goal

Move the already-built B00 foundation into the amended desktop-web/Vercel/Eve/OpenCode deployment shape without rewriting the governed core.

## Phase P0 — Preconditions

- ML-97 independently accepted/merged.
- Platform amendment materialized and founder-frozen.
- Canonical worktree clean; no extra worktree/temporary clone.
- No real athlete data used in hosted qualification.

## Phase P1 — Next.js shell

- Materialize `apps/practitioner-web` as the actual Next.js app.
- Preserve frozen UX route concepts.
- Add server-only boundaries for control/application imports.
- No product-science implementation.

## Phase P2 — Hosted control API

- Mount ML-97 command/job operations through same-origin Next.js route handlers.
- Reuse existing validation/OpenAPI contracts.
- Keep `apps/control-api` independently testable; no rewrite.

## Phase P3 — Hosted PostgreSQL

- Provision/connect a managed PostgreSQL dev database through Vercel Marketplace; Neon is first candidate.
- Apply migrations from empty database.
- Execute synthetic ML-97 command/job round trip.
- Keep production data disabled until ML-98.

## Phase P4 — Artifact adapter

- Add Vercel Blob implementation of `ImmutableArtifactStore`.
- Use private store.
- Verify synthetic byte roundtrip/hash/metadata/duplicate semantics.
- Retain S3 adapter.

## Phase P5 — Eve + OpenCode

- Add Eve agent definition in deployed app.
- Add thin OpenCode Go provider adapter.
- Verify no Vercel AI Gateway dependency is required.
- Implement one read-only synthetic tool and one ML-97 command tool.
- Preserve framework-neutral agent boundary.

## Phase P6 — Agent UX

- Bind persistent agent dock to Eve session.
- Preserve session across route navigation.
- Distinguish evidence/job/agent/approval states.
- Add minimal agent evals: forbidden claims, tool boundaries, unknown preservation, authority separation.

## Phase P7 — Vercel preview qualification

Required hosted proof:

- preview deployment Ready;
- desktop shell browser smoke;
- API validation;
- hosted PostgreSQL migration/job proof;
- private Blob hash roundtrip;
- Eve session + OpenCode turn;
- Eve read tool;
- Eve ML-97 command tool;
- route/session continuity;
- no provider SDK dependency in scientific/contracts packages;
- no real athlete data.

## Phase P8 — Optional Sandbox smoke

Only if useful and quota permits, run one bounded Sandbox isolation smoke. Do not make Sandbox a dependency of normal app success.

## Exit

Freeze the hosted architecture checkpoint, record Vercel deployment IDs/URLs and Git SHA, then start ML-98.
