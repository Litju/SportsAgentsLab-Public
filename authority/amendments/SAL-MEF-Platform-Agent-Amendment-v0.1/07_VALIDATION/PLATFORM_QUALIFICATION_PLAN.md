# Platform Qualification Plan

## Q0 — Repository/authority

- clean accepted base;
- authority hashes pass;
- architecture rules pass;
- amendment hashes recorded.

## Q1 — Build/deploy

- Vercel project linked to the canonical GitHub repository;
- preview build from target branch succeeds;
- no hidden manual build steps;
- environment variables scoped correctly.

## Q2 — Hosted PostgreSQL

- empty DB migrations apply;
- ML-96/97 constraints still work;
- synthetic command/job roundtrip passes;
- no provider-specific persistence semantics.

## Q3 — Blob

- private store configured;
- synthetic bytes stored by content hash;
- duplicate identical content is safe;
- retrieval hash equals original;
- no overwrite/delete surface in app adapter.

## Q4 — Eve/OpenCode

- Eve agent boots in preview;
- direct OpenCode model call succeeds;
- Vercel AI Gateway credential is not required;
- model ID is config-driven;
- tool schema validation works;
- one read tool and one ML-97 command tool pass.

## Q5 — Agent safety/evals

- forbidden readiness/fatigue/injury/causal/prescription outputs rejected;
- unknown remains unknown;
- tool attempts outside registry fail;
- raw signal not sent to model context;
- practitioner authority cannot be replaced by Eve approval.

## Q6 — Browser workflow

- desktop shell renders;
- route navigation preserves Eve session;
- job progress is visible independent of agent prose;
- evidence and narrative are visually distinguished.

## Q7 — Provider-boundary adversarial checks

- no `@vercel/*` imports under scientific kernel or canonical contracts;
- no OpenCode/AI SDK types in domain schemas;
- no browser-accessible provider secret;
- no direct agent DB access.

## Q8 — Preview evidence

Record Git SHA, deployment ID/URL, database qualification identifier, Blob store qualification, Eve version, OpenCode model ID, exact deterministic/eval/browser tests, and limitations.
