# System Design Description Amendment — Platform + Agent v0.1

**Amends:** `SAL-MEF-SDD-0.1`\
**Amendment ID:** `SAL-MEF-SDD-0.1-PLATFORM-AGENT-AMENDMENT-v0.1`\
**Status:** `ADOPTED`\
**Date:** 2026-08-11

## 1. Executive amendment

MEF remains an independent scientific/evidentiary system underneath the agent interface. The amendment makes the application form and agent/deployment stack explicit:

- The v1 practitioner product is a **desktop-first web workstation**.
- The primary application runtime is **Next.js/React/TypeScript on Vercel**.
- **Eve** is selected as the canonical agent runtime behind the existing framework-neutral agent boundary.
- **OpenCode Go** is the primary model-access provider through a small provider adapter. Vercel AI Gateway is not required.
- PostgreSQL remains system of record; a Vercel-connected managed Postgres service is used for hosted development, with Neon as the initial candidate.
- Exact source artifacts remain immutable and content-addressed. Vercel Blob is the primary Vercel adapter; S3 compatibility is retained as a portability option.
- The accepted ML-97 Command/Job model becomes the v1 durable system-execution boundary after its independent acceptance. Temporal is no longer on the v1 critical path.
- The stable governed core is intentionally separated from the fast-moving application/agent layer so agent behavior, tools, prompts, skills, models, and UX can iterate quickly without changing scientific truth.

## 2. Product-form amendment

### 2.1 Canonical client

The canonical MEF v1 client is a web application optimized for desktop/laptop practitioner workflows. “Desktop-first” means dense evidence views, large plots, multi-panel comparison, keyboard/mouse interaction, and a persistent agent dock are optimized for desktop viewports. It does not mean Electron, Tauri, or another native desktop package.

### 2.2 Responsive scope

Responsive behavior is required so core read/review flows remain usable on smaller screens. Mobile-first information architecture, mobile-native capture, and native mobile applications remain outside v1.

### 2.3 Installation

PWA/installability or a thin native shell may be evaluated later without changing the application/domain contract. Native packaging is not a prerequisite for v1 qualification.

## 3. Platform architecture amendment

MEF adopts a **Vercel-first, not Vercel-coupled** deployment model.

Vercel owns prototype/development infrastructure concerns: web deployment, preview deployments, Node/Python Functions where qualified, Blob, Sandbox, environment configuration, and deployment observability. Vercel-specific SDKs MUST remain below provider/deployment adapters and MUST NOT appear in scientific-domain packages or canonical schemas.

The initial Vercel Hobby deployment is for non-commercial development, prototype demonstration, and qualification only. No commercial production authorization follows from this amendment.

## 4. Agent-system amendment

### 4.1 Eve selection

Eve moves from candidate/spike status to the selected MEF v1 agent runtime. This does not make Eve scientific authority. Eve owns conversational/session orchestration, tool selection, skills, subagent delegation where justified, approval interactions, schedules/channels where authorized, and agent eval execution.

### 4.2 Framework-neutrality survives

The framework-neutral `MeasurementAgentRuntime`/agent boundary remains the product seam. MEF core services MUST NOT require Eve types. Eve-specific code is an adapter/runtime layer.

### 4.3 Model access

The primary model-access provider is OpenCode Go. Model selection is configuration, not domain semantics. Provider access MUST be isolated so changing the model/provider does not alter tool contracts, job semantics, scientific packages, evidence semantics, or practitioner authority.

Vercel AI Gateway is disabled by default and is not an architecture dependency. AI SDK provider packages used to construct a compatible model object are implementation plumbing only.

### 4.4 Agent authority

The agent MAY:

- inspect typed evidence and metadata;
- ask bounded questions;
- explain verified outputs;
- invoke authorized application tools;
- submit typed commands through ML-97;
- request practitioner approval where policy allows;
- recommend review/retest when supported by explicit evidence rules.

The agent MUST NOT:

- calculate scientific metrics itself;
- run arbitrary SQL;
- mutate evidence history;
- bypass the job/command boundary for authority-bearing work;
- define or change scientific thresholds/contracts;
- place raw high-rate signal data in model context by default;
- infer readiness, fatigue, injury, recovery, diagnosis, causality, or autonomous training prescriptions;
- treat Eve approval state as the authoritative practitioner decision record.

## 5. Stable-core / fast-edge quality attribute

MEF is the first real SportsAgentsLab agentic product. Its architecture MUST make product and agent iteration cheap without weakening scientific governance.

### Stable governed core

- canonical JSON Schemas and generated models;
- scientific kernel and released metric/inference contracts;
- immutable source/evidence semantics;
- PostgreSQL authority/audit primitives;
- ML-97 logical command/job semantics;
- provenance and evidence authority;
- practitioner authority;
- forbidden-claim policy.

### Fast-moving edge

- Next.js UI and route composition;
- Eve instructions, skills, tools, evals, subagents;
- model selection and routing configuration;
- OpenCode adapter internals;
- Vercel deployment adapter internals;
- visual/product experiments that do not change scientific semantics.

### Velocity requirements

- A non-scientific UI/agent change SHOULD reach a hosted preview without infrastructure redesign.
- A model change SHOULD be configuration-level unless model-specific capability requires a separately reviewed adapter change.
- A new Eve tool SHOULD call an existing governed application boundary; it MUST NOT duplicate scientific logic.
- Every material agent-behavior change MUST have deterministic/safety eval coverage appropriate to the change.
- Every major product change MUST receive hosted preview proof before promotion.
- Shared SportsAgentsLab platform abstractions SHOULD be extracted only after repeated need is observed; speculative generic platformization remains out of scope.

## 6. Data/storage amendment

The source-artifact invariant is unchanged: exact bytes are hashed before interpretation and cannot be silently replaced.

`ImmutableArtifactStore` is the authoritative application port. Vercel-hosted development uses a private Vercel Blob adapter with content-derived paths. Existing S3-compatible semantics are retained as a portable adapter. Canonical Parquet/Arrow requirements for high-rate signals remain unchanged.

Artifact-provider APIs MUST NOT leak into domain contracts.

## 7. Operational and workflow amendment

PostgreSQL remains system of record. ML-96 operational primitives remain valid.

When ML-97 is accepted, the Command/Job/JobAttempt/ProgressEvent model is the v1 durable execution substrate for imports, processing, inference, evidence assembly, and authorized agent-triggered work. It provides idempotency, retries, cancellation, progress, explicit unknown outcomes, and replaceable workers.

Temporal is deferred. It may be reconsidered only when measured workflow requirements exceed the accepted ML-97 state machine, such as complex long-lived multi-workflow coordination that cannot be maintained safely with the current substrate. Temporal MUST NOT be introduced merely because the baseline TDD named it.

## 8. Hosted database amendment

Hosted environments use PostgreSQL through a provider-neutral connection contract. Neon is the initial candidate for Vercel-hosted prototype/dev because it integrates with Vercel and preserves PostgreSQL semantics. No Neon SDK becomes domain authority; ordinary PostgreSQL semantics/migrations remain canonical.

ML-98 will define auth, tenancy, role/purpose policies, secret handling, and RLS against this real web-hosted topology.

## 9. Scientific runtime amendment

The Python scientific kernel remains a standalone library/CLI-capable substrate with no Next.js, Eve, OpenCode, Vercel, Blob, Neon, or browser dependency.

For hosted v1, a Vercel Python Functions adapter is eligible as the first deployment option only if the scientific workload fits runtime, bundle, latency, reproducibility, and dependency constraints. If not, the same worker port may target separate qualified compute without changing domain contracts.

Vercel Sandbox is not the routine scientific runtime. It may be used for isolated evaluation, hostile input/code execution, generated-code checks, reproducibility experiments, or other special bounded tasks.

## 10. UX amendment

The frozen SAL-MEF-UXD v0.3 information architecture, evidence-first review, persistent agent concept, tests/evidence/reports/protocol routes, and visual semantics remain authoritative.

This amendment adds:

- canonical browser routing;
- persistent Eve session across route transitions;
- same-origin agent endpoint in the Next.js app;
- desktop workstation as the primary viewport target;
- responsive secondary behavior;
- preview deployment as the default founder-review environment.

No visual redesign is authorized by this document.

## 11. Security/privacy delta

Before ML-98 is accepted, hosted previews MUST use synthetic/deidentified fixtures only. Real athlete data MUST NOT be introduced merely to prove Vercel/Eve deployment.

The hosted agent/model boundary MUST:

- use server-side provider credentials;
- never expose OpenCode credentials to the browser;
- never store secrets in source control;
- keep raw high-rate athlete signals out of model context by default;
- route tool execution through typed application APIs;
- keep practitioner decisions in MEF authority records, not only in Eve session state.

ML-98 remains responsible for complete identity, tenancy, RLS, authorization, and secrets policy.

## 12. New/modified non-functional requirements

| ID | Requirement |
|---|---|
| NFR-PA-001 | The v1 product MUST deploy as a desktop-first web application. |
| NFR-PA-002 | The governed core MUST remain executable/testable without Vercel, Eve, or OpenCode. |
| NFR-PA-003 | Eve-specific and Vercel-specific dependencies MUST remain behind adapters/hosting boundaries. |
| NFR-PA-004 | OpenCode provider/model changes MUST NOT alter scientific/domain semantics. |
| NFR-PA-005 | A major agent change MUST have deterministic/safety eval evidence before promotion. |
| NFR-PA-006 | A major product change MUST have a Vercel preview proof before promotion during the prototype phase. |
| NFR-PA-007 | Hosted previews before ML-98 MUST use synthetic/deidentified data only. |
| NFR-PA-008 | Vercel Hobby MUST NOT be treated as commercial production authorization. |
| NFR-PA-009 | Quota exhaustion/failure of Vercel/Eve/OpenCode MUST not corrupt evidence or silently change scientific meaning. |
| NFR-PA-010 | Provider-specific storage/model/runtime APIs MUST NOT enter canonical JSON Schema contracts. |
| NFR-PA-011 | Agent sessions MAY be durable, but authority-bearing approvals/decisions MUST also exist in MEF system-of-record records. |
| NFR-PA-012 | Model prompts/traces MUST not be treated as scientific evidence; evidence claims remain typed and provenance-linked. |

## 13. Updated roadmap boundary

The sequence becomes:

1. Close ML-97 independently.
2. Adopt this Platform + Agent Amendment.
3. Execute one bounded Platform Refactor + Vercel Qualification block.
4. Resume ML-98 against the hosted web/Eve topology.
5. Continue B00 and then B01 scientific ingestion/processing.

The platform-refactor block may build only the infrastructure needed to prove the amended architecture with synthetic fixtures. It MUST NOT start force-plate scientific implementation early.
