# Hosted Preview acceptance

- Draft PR: https://github.com/Litju/sportsagentslab-mef/pull/6
- Final tested head: `deeaaaae099f852e2aba68d81f2b7ad362cea3f1`
- Preview: https://sportsagentslab-lmr3mkqh0-julitocrztuga-2084s-projects.vercel.app
- Vercel owner: `julitocrztuga-2084s`
- Deployment status: `Ready`
- GitHub `MEF Quality Gate`: `pass`

## Authenticated runtime

The branch-scoped Preview uses an isolated Neon branch and least-privilege
runtime/auth roles. A fresh synthetic bootstrap created an authenticated
session, organization, and workspace. The hosted bootstrap returned HTTP 201,
`/api/auth/get-session` returned HTTP 200, and `/api/context` returned HTTP 200
with the practitioner tenant context. No production branch was touched.

## Authenticated browser flow

Playwright, through the protected Vercel CLI relay, completed the real browser
path on the Preview deployment:

`/imports` → native file picker → private Blob upload → `READY_FOR_ADAPTER` →
`Inspect source (ML-103)` → rendered SourceObservation →
`Create canonical (ML-104)` → rendered CanonicalAcquisition.

The accepted synthetic reference fixture was 648 bytes. The Preview database
recorded matching declared/actual byte counts, the immutable source hash, one
SourceObservation using `mef.reference.source-v1` `0.1.0`, and one qualified
CanonicalAcquisition with two records and two channels. Browser console errors,
page errors, and failed requests were all zero.

Required hosted gates:

`HOSTED_AUTHENTICATION=PASS`

`HOSTED_TENANT_CONTEXT=PASS`

`HOSTED_WORKSPACE_CONTEXT=PASS`

`HOSTED_UI_UPLOAD=PASS`

`HOSTED_UI_SOURCE_OBSERVATION=PASS`

`HOSTED_UI_CANONICAL_ACQUISITION=PASS`
