# ML-108 Supported Scope and Limitations

## Supported in this closure candidate

- The synthetic/reference MEF source adapter only.
- Explicit source probing, typed unsupported/malformed/ambiguous outcomes,
  bounded structural observation, and schema-drift evidence.
- Deterministic canonical acquisition with explicit units, axes, signs,
  timestamps, counts, missingness, nonfinite findings, and integrity status.
- `single.total_fz` and `dual.independent_fz` configuration contracts when the
  required evidence is explicit.
- Explicit UNKNOWN, CONFLICTING, UNSUPPORTED, and review-required states.
- Append-only source, observation, canonical, and configuration records with
  content-addressed artifacts and tenant-scoped access.
- Evidence-first practitioner review and bounded Measurement Agent
  explanation/orchestration.

## Explicit limitations

- No real vendor adapter or vendor support claim was added; real vendor support
  still requires source evidence and a later authorized gate.
- The isolated Neon Preview branch `br-nameless-mud-axlo13gq` was configured
  with non-superuser, `NOBYPASSRLS` migration/runtime roles. Real Neon
  migration, grants, forced-RLS, and cross-tenant checks passed; this is a
  test branch, not a production database claim.
- A protected Vercel Preview reference flow is not claimed: the previously
  used `sportsagentslab-mef` project is no longer listed for the connected
  owner team and its old deployment is protected/unavailable for requalification.
- No CMJ event detection, biomechanics, scientific metrics, trial
  qualification, readiness, fatigue, injury-risk, inference, or medical claim
  is in scope.
- No filtering, resampling, interpolation, missing-sample synthesis, missing
  channel synthesis, or silent repair is performed.

`B02` remains deferred and `ML-109` remains implementation-blocked pending
owner acceptance of this closure candidate.
