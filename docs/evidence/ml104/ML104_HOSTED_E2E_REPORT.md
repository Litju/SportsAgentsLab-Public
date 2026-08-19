# ML-104 Hosted E2E Report

## Status: PASS — authenticated Preview E2E and private derived-artifact readback

Captured on 2026-08-16 against the controlled Preview deployment for branch `work/ml104-b01-canonical-acquisition-v01`.

- Authenticated flow deployment: [Preview](https://sportsagentslab-6ldgf01lw-julitocrztuga-2084s-projects.vercel.app), deployment `dpl_nv2batDAijkEVZVMANLuhBhcj2dR`.
- Tenant-isolation deployment: [Preview](https://sportsagentslab-lkuxxne78-julitocrztuga-2084s-projects.vercel.app), deployment `dpl_Gkmi6JBRYaEjpnTqt3Uj1r7CWLtH`.
- Stable branch alias: [ML-104 Preview alias](https://sportsagentslab-mef-git-wor-2e8729-julitocrztuga-2084s-projects.vercel.app).
- Neon project: `lively-surf-68186530`.
- Neon branch: `br-damp-water-axo74u39` (`preview/work/ml104-b01-canonical-acquisition-v01`).

The source bytes came from `packages/ingestion-adk/fixtures/canonical-kn-force.mef` (406 bytes). The current ML-102 generic upload envelope intentionally rejects a direct `.mef` filename; that probe returned `UNSUPPORTED_MEDIA_TYPE` for `imp_31f73638403f4ca1bc7bdd34e5930189`. The same fixture bytes were therefore uploaded through the accepted `text/plain` envelope as `canonical-kn-force.txt`, producing the qualified flow below.

## Flow evidence

| Step | Result |
|---|---|
| Synthetic authenticated bootstrap | HTTP 201; session, organization, and workspace cookies established |
| `POST /api/imports` | HTTP 201; `imp_7775ea1707cd4ea5909a391389614570` |
| Private Blob client-token route | HTTP 200; authorized staging pathname |
| Private staging Blob upload | PASS; 406 bytes; `text/plain` |
| `POST /api/imports/{id}` finalization | HTTP 200; `READY_FOR_ADAPTER`; source `src_7775ea1707cd4ea5909a391389614570` |
| `POST /api/imports/{id}/inspect` | HTTP 201; `OBSERVATION_RECORDED` |
| `GET /api/imports/{id}/observation` | HTTP 200; observation `sob_4a3b573a0c1669344f4154efd23871412a7a443c513261b2` |
| `POST /api/imports/{id}/canonicalize` | HTTP 201; `CANONICAL_ACQUISITION_RECORDED` |
| `GET /api/imports/{id}/canonical-acquisition` | HTTP 200; `CANONICAL_ACQUISITION_REUSED` |
| Replay `POST /api/imports/{id}/canonicalize` | HTTP 200; `CANONICAL_ACQUISITION_REUSED` with the same identity and signal hashes |

Recorded identities:

- Source SHA-256: `7b93d9a57d9c7c0ae24744fc0a156659899400f57a6d4db7f10f5e2fef8b186f`.
- Observation SHA-256: `3224fde641faeae80129112b769cf65de0e7e594fa264702924720f70212c470`.
- Canonical acquisition: `acq_b63dc63f4d34e5b37f3ac96639f53762a547e8b1`.
- Canonical identity SHA-256: `b63dc63f4d34e5b37f3ac96639f53762a547e8b1113425c2eb532e4e9d483b29`.
- Mapping manifest SHA-256: `fa2986465fe197d6317977965fa6f25a665a679d30589f8ed025f33fe6cd6585`.
- Derived signal SHA-256: `69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158`.
- Derived storage key: `canonical/sha256/69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158`.

The private Blob readback used the configured read-write token against that derived key: `head` reported 307 bytes and `application/x-ndjson`; a private `get` streamed 307 bytes whose SHA-256 matched the persisted signal hash exactly.

This is an authenticated HTTP/API acceptance run using the deployed application, its Better Auth session, its client-upload protocol, its private Blob store, and its live Neon-backed runtime. No browser UI click-through result is inferred from these API checks.
