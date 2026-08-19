# ML-108 UI Task Proof

`UI_TASK_PROOF=PASS`.

The production web build passed and emitted the protected import/configuration
routes. The existing practitioner test suite passed 22/22.

The evidence-first task surface is implemented in
`apps/practitioner-web/src/components/source-import-detail.tsx`:

- line 362 displays the measurement boundary, preserves original bytes as
  source of truth, and states that no CMJ biomechanics or scientific metrics
  are calculated;
- line 389 exposes only server-backed, idempotent controlled actions;
- line 401 groups canonical acquisition and configuration resolution;
- line 458 exposes read-only evidence lineage and exact record links;
- line 459 states that the provenance graph cannot edit, connect, or infer
  nodes;
- line 492 exposes the no-silent-inference vocabulary.

The authenticated API surface is protected by principal checks in the GET and
POST configuration-resolution routes. The UI does not save browser-only
configuration values and does not provide a direct qualification mutation.

## Protected Preview attempt

Deployment `dpl_86NjinyW1QKioGnTKPg3uMqaJYZ7` reached `READY` at:

```text
https://sportsagentslab-ky6m8nd4z-julitocrztuga-2084s-projects.vercel.app
```

The authenticated in-app browser reached the Command Center and `/imports`,
selected the 648-byte `valid-current.mef` synthetic fixture, and submitted the
upload action. The visible result was `Authentication is temporarily
unavailable`; the ledger remained at `0 attempts`. Therefore:

```text
HOSTED_DEPLOYMENT=PASS_READY
HOSTED_LANDING_AND_IMPORTS=PASS
HOSTED_REFERENCE_FLOW=NOT_REQUALIFIED_AUTHENTICATION_UNAVAILABLE
```

No hosted source observation, canonical acquisition, configuration resolution,
or agent result is claimed from this blocked attempt.
