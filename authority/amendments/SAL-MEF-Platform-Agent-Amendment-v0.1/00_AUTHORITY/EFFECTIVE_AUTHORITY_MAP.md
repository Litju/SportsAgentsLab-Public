# Effective Authority Map After Adoption

## Precedence

1. Founder decisions recorded in this amendment for platform/deployment/agent/model-access topics.
2. Existing ML-93 normative locks for product identity, scope, forbidden claims, change control, practitioner authority, and scientific/evidence boundaries.
3. `SAL-MEF-UXD v0.3.0` for UX semantics, except the web-shell/session mechanics explicitly amended here.
4. Original `SAL-MEF-SDD-0.1`, `SAL-MEF-TDD-0.1`, and `SAL-MEF-ADR-0.1` for all clauses not explicitly superseded here.
5. Accepted implementation evidence from ML-94 through ML-96; ML-97 only after separate founder acceptance.
6. Live Git and QA evidence constrain claims and cannot broaden authority.

## Rule for future agents

A future agent MUST read `SUPERSESSION_MATRIX.yaml` before interpreting a baseline architecture clause. It MUST NOT infer that “new Vercel architecture” authorizes changes to the scientific contract. It MUST NOT infer that “Eve agent” may bypass typed tools, job execution, evidence authority, or practitioner decisions.

## Interpretation examples

- Baseline says “Eve candidate”; amendment says “Eve canonical runtime” -> amendment controls.
- Baseline says “Temporal after workflow gate”; amendment says “ML-97 jobs for v1, Temporal deferred” -> amendment controls after ML-97 acceptance.
- Baseline says “S3-compatible object storage”; amendment says “ImmutableArtifactStore + Vercel Blob primary adapter + S3 portable adapter” -> amendment controls deployment, original immutability/Parquet requirements survive.
- Baseline says “Python scientific kernel” -> unchanged.
- Baseline forbids readiness/fatigue/causal claims -> unchanged and still absolute.
