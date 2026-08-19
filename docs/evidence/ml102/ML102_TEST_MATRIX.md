# ML-102 Test Matrix

| Area | Evidence | State |
| --- | --- | --- |
| SHA-256 identity and byte preservation | operational-state unit tests; fixture manifest | PASS |
| Separate attempts and duplicate history | operational-state tests; Neon duplicate regression | PASS |
| Duplicate finalization with PostgreSQL BIGINT values | real Neon qualification branch regression | PASS |
| Private Blob adapter and streaming materialization | practitioner tests | PASS |
| Migration idempotence and checksum protection | operational-state integration test path | PASS when database URL is supplied |
| Runtime RLS and tenant boundary | Neon qualification proof | PASS |
| Empty, unsupported, malformed, storage, hash, DB failure, retry, cancel | operational-state and practitioner tests | PASS locally; hosted replay pending |
| Browser authentication and first real upload | protected Vercel Preview browser evidence | PASS |
| Hosted post-fix duplicate and unsupported workflow | branch-linked Preview commit `268e9af` | PASS |
| Hosted authentication, tenant context, and anonymous denial | protected Vercel Preview browser flow | PASS |
| Hosted exact-byte retrieval and cross-tenant no-leak check | protected Vercel Preview browser flow | PASS |
| Scientific boundary and no raw bytes to LLM | production-code review and boundary tests | PASS |

The local suite is supporting evidence only. The live acceptance authority is
the protected Vercel Preview browser flow, which passed after the duplicate
finalization fix was deployed.
