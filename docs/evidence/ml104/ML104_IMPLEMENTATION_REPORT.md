# ML-104 Implementation Report

## Authority and change control

- Issue: `ML-104`.
- Branch: `work/ml104-b01-canonical-acquisition-v01`.
- Accepted ML-103 main head: `a9c581d6d1722205c5126bafbd0908f828f29a24`.
- Authority activation commit: `b502fdf3aeb441f600b7547383543730d2178bd8`.
- Implementation commit: `256d45015c39539fc25250bf5a2742d3841cc217`.
- Draft PR: `https://github.com/Litju/sportsagentslab-mef/pull/5`.
- Active database: Neon/Postgres.
- Active artifact storage: Vercel Private Blob.
- S3 runtime dependency: none.

## Delivered

- Added the pure `@mef/canonical-acquisition` runtime and generated contract surfaces.
- Added explicit reference mapping, lineage hashes, deterministic canonical NDJSON, integrity findings/checks, and result statuses.
- Added ML-104 append-only persistence, replay comparison, forced RLS, migration `007_ml104_canonical_acquisition`, and embedded hosted migration.
- Added canonicalize and canonical-acquisition API routes.
- Added a Blob-backed streaming `SourceReader` with bounded range reads and end-of-stream hash verification.
- Added synthetic fixtures for conversions, sign inversion, declaration states, timestamp failures, missing/non-finite values, extras, ranges, counts, indices, and multi-batch streaming.

## Local qualification

| Check | Result |
|---|---|
| `pnpm validate` | PASS |
| `pnpm generate:check` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm --filter @mef/canonical-acquisition test` | PASS, 7/7 |
| `pnpm --filter @mef/ingestion-adk test` | PASS, 5/5 |
| operational-state tests | PASS, 38; 2 existing live-Postgres tests skipped without `MEF_DATABASE_URL` |
| practitioner-web tests | PASS, 15/15 |
| practitioner-web lint | PASS |
| practitioner-web production build | PASS |
| contract/generation/compatibility/smoke checks | PASS |
| security suite | PASS; mocked security paths, zero paid model calls |
| dependency scan | PASS; Node high/critical 0, Python vulnerabilities 0 |
| secret scan | PASS; high-confidence findings 0 |

## Remote qualification surface

- GitHub `MEF Quality Gate`: PASS, run `31932885953`.
- Vercel Preview deployment: PASS; [Preview URL](https://sportsagentslab-mef-git-wor-2e8729-julitocrztuga-2084s-projects.vercel.app) observed and returned HTTP 302.
- Vercel Preview Comments: PASS.
- Hosted authenticated E2E: PASS on [deployment](https://sportsagentslab-6ldgf01lw-julitocrztuga-2084s-projects.vercel.app), including private Blob upload/readback, ML-103 observation, ML-104 canonicalization, and deterministic replay.
- Live Neon/RLS: PASS on branch `br-damp-water-axo74u39`; the runtime role is non-superuser and `rolbypassrls=false`, migration `007` is applied, forced RLS is present, and a second authenticated tenant cannot see the first tenant's import or acquisition.
- The derived-artifact readback and exact IDs/hashes are recorded in `ML104_HOSTED_E2E_REPORT.md`, `ML104_NEON_RLS_PROOF.md`, and `ML104_BLOB_DERIVED_ARTIFACT_PROOF.md`.

The local toolchain is Node `22.14.0`; repository policy requests Node `24.14.0`, so package-manager engine warnings remain in local logs.

## Qualification result

The controlled Preview run completed the authenticated upload -> observation -> canonicalization flow, private Blob readback, live Neon persistence/RLS checks, and deterministic replay. Local and remote CI evidence is supplemented by the live acceptance evidence above. ML-104 is qualified for `In Review`; the scientific boundary remains unchanged because ML-104 records canonical measurement representation and does not make scientific decisions.
