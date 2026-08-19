# ML-108 Scientific Boundary Proof

`CMJ_SCIENCE_IMPLEMENTED=NO` and `SCIENTIFIC_LEAKAGE=NONE`.

The run performed repository forensics across production packages, the
practitioner app, scripts, and authority records. The only ML-108 product path
added is deterministic replay; the other changed source is the authority
verifier. The existing production surface is bounded as follows:

- `apps/practitioner-web/src/components/source-import-detail.tsx:362` states
  that no CMJ biomechanics or scientific metrics are calculated and that
  original bytes remain the source of truth.
- `apps/practitioner-web/src/server/measurement-agent.ts` returns bounded
  evidence/provenance envelopes and sets qualification mutation to
  `NOT_PERFORMED`.
- `apps/practitioner-web/agent/instructions.md` forbids diagnosis, injury
  risk, readiness, fatigue, clearance, causal claims, and autonomous
  prescription.
- `packages/acquisition-configuration` resolves acquisition configuration
  only; it does not calculate scientific metrics or event timing.
- The canonicalizer reports integrity findings and never repairs irregular
  timebases or synthesizes unresolved channels.
- The seven mocked EVE evaluations reject injury/readiness claims and arbitrary
  database access.

The `CMJ` and readiness terms found in the repository are authority locks,
future-stage UI placeholders, explicit forbidden-claim guards, or negative
tests; no ML-108 implementation path computes or asserts those outcomes.
