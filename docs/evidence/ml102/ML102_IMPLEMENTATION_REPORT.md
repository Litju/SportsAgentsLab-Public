# ML-102 Implementation Report

`LINEAR_ISSUE=ML-102`

`ACTIVE_DATABASE=NEON_POSTGRESQL`

`ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB`

`S3_RUNTIME_DEPENDENCY=NONE`

## Delivered

- B01 migrations `004_ml102_source_import` and `005_ml102_identity_constraint_hardening`.
- Immutable B00 `SourceArtifact`/`ImportAttempt` registration with audit and provenance linkage.
- Private Vercel Blob staging, streaming hash verification, content-addressed materialization, and byte retrieval.
- Tenant/workspace RLS, runtime-role checks, explicit failure states, retry, reconciliation, cancellation, and duplicate-content identity.
- Practitioner imports UI bound to real attempt and artifact API state.
- ML-102 regression fix: PostgreSQL `BIGINT` values are normalized before comparing an existing content identity during duplicate finalization.

## Qualification evidence

The isolated Neon branch `br-little-dream-axsaeb0h` passed migration, runtime-role, RLS, and the duplicate-finalization regression. The direct runtime-role replay also passed every duplicate transition.

The first branch-linked Preview proved Better Auth bootstrap, protected API access, real Neon state, private Blob upload, exact retrieval, and the 59-byte SHA-256 fixture. Its duplicate upload exposed the `BIGINT` comparison defect. The fix was deployed in branch-linked Preview `sportsagentslab-lu8jh6b2o-julitocrztuga-2084s-projects.vercel.app` and the authenticated browser rerun passed: bootstrap `201`, Better Auth session `200`, tenant context `200`, first upload `READY_FOR_ADAPTER`, duplicate upload linked to the first attempt with the same SHA-256, unsupported upload `UNSUPPORTED`, exact original retrieval byte-for-byte, anonymous retrieval `401`, and cross-tenant detail `404` with no original bytes returned.

## Limitations

Hosted post-fix browser qualification and the final push/deployment receipt remain open until the branch is redeployed with the fix. No scientific processing, vendor adapter, CMJ calculation, or longitudinal inference is implemented.
