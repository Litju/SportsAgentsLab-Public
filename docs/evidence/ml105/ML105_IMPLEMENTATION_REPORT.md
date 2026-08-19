# ML-105 Implementation Report

## Authority and change control

- Issue: `ML-105`.
- Branch: `work/ml105-b01-force-plate-config-resolver-v01`.
- Accepted predecessor main head: `e671e3a0837ceb1d5544b024fd3f5c4ec8b53d2c` (UI substrate accepted in merged PR #6); ML-104 predecessor head: `0b4127104c0643397c4c0ceb9f021dd9e6d423fd`.
- Authority activation commit: `5dc8bdf`.
- Implementation commit: `8d01fe6` (`feat(mef): implement ML-105 configuration resolver`).
- Draft PR: [#7](https://github.com/Litju/sportsagentslab-mef/pull/7).
- Database: isolated Neon Preview branch only.
- Artifact storage: existing private Vercel Blob boundary; no ML-105 raw-signal storage.

## Delivered

- Added generated nested ML-105 resolution contracts to the JSON Schema, OpenAPI, TypeScript, and Python surfaces.
- Added pure `@mef/acquisition-configuration` resolution with explicit sample-rate, synchronization, axis/sign, processing, calibration, zeroing, protocol-authority, evidence, and provenance handling.
- Added migration `008_ml105_configuration_resolution` with append-only persistence, lineage checks, idempotency, foreign keys, forced RLS, and no raw payload columns.
- Added concrete Postgres read/insert-or-get methods and minimal authenticated POST/GET routes.
- Added architecture topology and package wiring; ML-106 code was not changed.
- Fixed the embedded migration copy so its normalized SQL checksum matches migration `008` and application startup can replay the complete plan.

## Qualification evidence

| Check | Result |
|---|---|
| `pnpm run validate` | PASS |
| `pnpm --filter @mef/acquisition-configuration test` | PASS, 10/10 |
| `pnpm --filter @mef/operational-state test` | PASS, 38 passed; 2 live-Postgres cases skipped without URL |
| Real PostgreSQL integration test | PASS, 2/2 against isolated Neon Preview |
| `python scripts/verify_authority_hashes.py` | PASS, including B01 ML-105 activation |
| `node scripts/dependency_scan.mjs` | PASS, Node high/critical 0; Python vulnerabilities 0 |
| `python scripts/secret_scan.py` | PASS, high-confidence findings 0 |
| `pnpm --filter @mef/practitioner-web run build` | PASS |
| Local authenticated HTTP boundary | PASS: bootstrap 201, context 200, session 200, authenticated missing-resolution 404, anonymous 401 |

## Limitations

- No ML-105 hosted Preview deployment was available: Vercel manual deployment returned `api-deployments-free-per-day` / more than 100 deployments; no further manual deploys were attempted.
- The local `.env.local` has an empty `BLOB_READ_WRITE_TOKEN`, so the full local Blob upload path stopped at the expected client-token boundary. The local resolver, database, migration, RLS, auth, and route-boundary checks remain valid.
- Neon migration application used the isolated admin endpoint because the existing migration role lacked `REFERENCES` privileges on pre-existing ML-102 parent tables. Runtime-role RLS checks passed; production was not touched.

## Qualification result

`PASS_WITH_LIMITATIONS`. The local implementation and database qualification are complete. Hosted ML-105 acceptance remains an owner/deployment follow-up; ML-105 stays `In Progress` pending that review. ML-106 remains `Backlog` and blocked.
