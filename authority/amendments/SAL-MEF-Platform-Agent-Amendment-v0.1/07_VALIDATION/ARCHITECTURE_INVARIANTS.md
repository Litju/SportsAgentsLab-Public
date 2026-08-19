# Architecture Invariants

These invariants are acceptance gates for materialization and platform refactor.

## Scientific/core invariants

- Scientific kernel imports no web, Eve, OpenCode, Vercel, Blob, Neon, or browser dependencies.
- Agent/model code cannot define metric formulas or thresholds.
- Provider changes cannot change evidence semantics.
- Raw source artifact and evidence immutability remains enforced.
- Unknown states remain explicit/fail-closed.

## Application/agent invariants

- Eve tools use typed bounded inputs/outputs.
- Mutation/long-running tools submit governed commands/jobs where applicable.
- Eve cannot run arbitrary SQL or arbitrary scientific functions.
- Job state, not agent prose, is the execution source of truth.
- Eve approval interaction is not the practitioner authority record.
- Raw high-rate signals remain out of model context by default.

## Deployment invariants

- Vercel-specific SDKs are confined to app/adapter layers.
- OpenCode credentials never reach the client bundle.
- Vercel AI Gateway is absent from required configuration.
- `DATABASE_URL` is the hosted database seam.
- Blob/S3 provider details do not enter canonical domain schemas.
- Hosted preview before ML-98 is synthetic/deidentified only.

## Velocity invariants

- A model change does not require a scientific-core change.
- An agent instruction/skill/tool change can be evaluated independently.
- Hosted previews are tied to Git SHA.
- General platform abstractions require repeated demonstrated need.
