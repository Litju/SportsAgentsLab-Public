# Source Basis

## Existing project authority consulted

The amendment was curated against the existing MEF authority inventory and the original architecture source documents:

- `SAL-MEF-UX-UI-FREEZE-v0.3.zip` — normative frozen UX (`SHA-256 a5eb02c1...41f5`).
- `SAL-MEF-Architecture-Diagrams.zip` — proposed diagram baseline (`SHA-256 1a046c58...c46f`).
- `SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip` — curated architecture baseline (`SHA-256 e3fa4e30...d9f0`).
- `SAL-MEF-SDD-0.1.md` — source SDD (`SHA-256 36bec94a...6793`).
- `SAL-MEF-TDD-0.1.md` — source TDD (`SHA-256 61ca2d69...b237`).
- `SAL-MEF-ADR-0.1.md` — source ADR compendium (`SHA-256 9ba4a29b...e6c0`).

The baseline already established a Next.js practitioner web surface, TypeScript control plane, Python scientific plane, PostgreSQL, object storage, a framework-neutral agent port, Eve as a candidate, typed tools, raw-signal minimization, and explicit human authority. This amendment changes the deployment/runtime selections rather than replacing the scientific/evidence model.

## Current platform/vendor sources checked 2026-08-11

Only primary/official sources were used for unstable platform facts:

- Vercel Eve: https://vercel.com/eve
- Eve announcement/public preview: https://vercel.com/changelog/introducing-eve-an-open-source-agent-framework
- Eve self-hosting/direct provider guidance: https://github.com/vercel/eve/blob/main/docs/guides/deployment/self-hosting.md
- Eve frontend/same-origin integration: https://github.com/vercel/eve/blob/main/docs/guides/frontend/overview.mdx
- Vercel Hobby: https://vercel.com/docs/plans/hobby
- Vercel Blob: https://vercel.com/docs/vercel-blob
- Vercel Blob private storage: https://vercel.com/docs/vercel-blob/private-storage
- Vercel Sandbox: https://vercel.com/docs/sandbox
- Vercel Python Functions: https://vercel.com/docs/functions/runtimes/python
- Vercel Marketplace Postgres: https://vercel.com/docs/marketplace-storage
- Neon on Vercel: https://vercel.com/marketplace/neon
- OpenCode Go: https://opencode.ai/docs/go/
- OpenCode providers: https://opencode.ai/docs/providers/

## Important temporal facts

- Eve is in public preview; APIs may change. Pin and gate upgrades.
- Eve can call a provider directly through the appropriate AI SDK provider package; Vercel AI Gateway is not mandatory.
- OpenCode Go exposes model API endpoints and documents the corresponding AI SDK provider packages.
- Vercel Hobby is intended for personal/non-commercial use and has hard usage limits; it is suitable here only as a development/prototype environment.
- Vercel Blob is available on Hobby; private Blob storage exists for authenticated object access.
- Vercel Sandbox is an ephemeral isolation primitive, not the default compute path.
- Vercel Python Functions are available on all plans but remain beta; scientific deployment must qualify bundle/runtime/latency constraints before adoption.
- Vercel connects Postgres providers through Marketplace; Neon is a first candidate, not a domain requirement.
