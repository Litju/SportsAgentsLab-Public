# ML-108 Implementation Report

## Authority and change control

- Issue: `ML-108`.
- Branch: `work/ml108-b01-final-conformance-replay-relock-v1`.
- Accepted predecessor main head: `9b818a414f4430ce8b829ef0db924c088a8ee5e8` (ML-107 PR #9 merge).
- ML-107 qualified implementation head: `4dd8771e209f29cf82518d6c868ff5856163115d`.
- ML-107 merge commit: `9b818a414f4430ce8b829ef0db924c088a8ee5e8`.
- ML-108 authority activation commit: `b53042b263ee9327cbdc004541f4ab07079c4366`.
- ML-107 Linear status: `Done`.
- ML-108 Linear status at evidence capture: `In Review`.

The ML-108 run closes the existing source-to-configuration path. It adds one
authority-verifier check and one deterministic replay runner; it does not add a
vendor adapter, raw-signal LLM path, CMJ processor, or scientific metric.

## Qualification evidence

| Check | Result |
|---|---|
| ML-107 PR #9 merged into `main` | PASS; merge commit `9b818a4` |
| ML-108 authority activation | PASS; `python scripts/verify_authority_hashes.py` |
| Deterministic source-to-configuration replay | PASS; two identical runs |
| Reference source adapter tests | PASS, 5/5 |
| Canonical acquisition tests | PASS, 7/7 |
| Configuration resolver tests | PASS, 10/10 |
| Operational-state tests | PASS, 38/40; 2 live-Postgres tests skipped without `MEF_DATABASE_URL` |
| Practitioner web tests | PASS, 22/22 |
| Measurement Agent evaluations | PASS; 7 definitions, 0 paid model calls |
| Production web build | PASS; Next.js 16.3.0 |
| Unified `pnpm ci:validate` | `PASS_WITH_LIMITATIONS` |
| Isolated Neon Preview migrations, grants, and RLS | PASS; `NOBYPASSRLS`, cross-tenant/principal-boundary/force-RLS on branch `br-nameless-mud-axlo13gq` |
| Protected Vercel Preview deployment | PASS; `dpl_EUR3DEu6FMuXbKgfeSrWnrCSbLHC` reached `READY` |
| Hosted reference flow | NOT_REQUALIFIED_PLATFORM_LIMIT_PROJECT_UNAVAILABLE; old project is no longer listed for the connected owner team |
| Secret and dependency scans | PASS; high-confidence secrets 0, Node high/critical 0, Python vulnerabilities 0 |

## Result

`B01_CONFORMANCE=PASS` and `B01_REPLAY=PASS`.

The overall mission remains `PASS_WITH_LIMITATIONS` because the previously
used `sportsagentslab-mef` Vercel Preview project is no longer listed for the
connected owner team and its old deployment is protected, so the complete
hosted reference flow could not be requalified. The real Neon Preview branch
passed migration, role, forced-RLS, and cross-tenant verification; the hosted
limitation must not be interpreted as a Neon limitation.

No B02 or ML-109 implementation was started. ML-108 remains unmerged and
requires owner acceptance before B02 can unlock.
