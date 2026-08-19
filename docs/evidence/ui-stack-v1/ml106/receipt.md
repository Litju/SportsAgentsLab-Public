# ML-106 implementation evidence

Status: `IMPLEMENTATION_READY_FOR_ACCEPTANCE`

Implementation commit: `314f194`

## Scope

- `/imports` now presents the actual source-artifact intake boundary for ML-106.
- `/imports/[import_attempt_id]` now reads SourceObservation, CanonicalAcquisition,
  and ML-105 configuration resolution through the existing API routes.
- The detail view progressively discloses summary, configuration, evidence,
  provenance, and technical details.
- Values carry explicit `DETECTED`, `SOURCE-DECLARED`, `ADAPTER-QUALIFIED`,
  `PRACTITIONER-CONFIRMED`, `INFERRED`, `UNKNOWN`, or `CONFLICTING` labels.
- No biomechanics, scientific metrics, agent tools, B02 work, vendor catalogs,
  or fabricated configuration values were added.

## Verification

- Authority verifier: PASS.
- Practitioner-web typecheck, lint, package tests, and production build: PASS.
- Fixed sal-mef composition evaluator: PASS.
- Playwright intake captures: wide, tablet, and narrow responsive layouts.

## Limitations

- Local `/api/imports` returns `AUTHENTICATION_UNAVAILABLE`; the detail route was
  not populated with synthetic values for browser evidence.
- `HOSTED_ML106=NOT_REQUALIFIED_PLATFORM_LIMIT`; the known Vercel deployment
  quota prevented a new hosted campaign.

## Follow-ons

- ML-107 remains dependency-blocked.
- B02 remains deferred and implementation-disallowed.
