# Technical Design Document Amendment — Platform + Agent v0.1

**Amends:** `SAL-MEF-TDD-0.1`\
**Amendment ID:** `SAL-MEF-TDD-0.1-PLATFORM-AGENT-AMENDMENT-v0.1`\
**Status:** `ADOPTED`\
**Date:** 2026-08-11

## 1. Revised technical baseline

The v1 application baseline is a modular monorepo with one primary Next.js web deployment on Vercel, framework-neutral TypeScript application/domain packages, an Eve agent runtime integrated same-origin with the web application, direct OpenCode model access through a thin provider adapter, PostgreSQL operational state, immutable artifact storage through a provider port, and an independent Python scientific kernel.

### Application plane

- Next.js/React/strict TypeScript.
- `apps/practitioner-web` is the primary Vercel deployment root unless a measured build constraint requires a documented alternative.
- `apps/control-api` remains a typed application/API boundary; it need not be separately deployed in v1. Thin Next.js route handlers may mount/reuse its public handlers/services.
- OpenAPI and JSON Schema remain contract sources/projections as already implemented.

### Agent plane

- Eve runtime in/adjacent to the deployed web app, using same-origin frontend integration.
- Framework-neutral agent boundary remains above/beside Eve-specific code.
- Direct OpenCode Go provider adapter supplies the model object expected by Eve.
- Vercel AI Gateway is not required.
- Agent tools are thin typed adapters to governed application APIs/services.

### Operational plane

- PostgreSQL via existing `pg`/SQL/migration semantics.
- Hosted environment via `DATABASE_URL`; Neon is the initial candidate.
- ML-96 artifact/audit/provenance primitives remain.
- ML-97 Command/Job state machine becomes system orchestration after acceptance.

### Artifact plane

- `ImmutableArtifactStore` remains port.
- Add private Vercel Blob adapter for hosted prototype/development.
- Keep S3-compatible adapter and tests for portability.
- Preserve SHA-256 content identity and Parquet/Arrow canonical signal design.

### Scientific plane

- Python remains independent.
- Vercel Python Functions are an eligible hosted adapter only after workload qualification.
- Dedicated compute remains possible behind the same worker boundary.
- Sandbox is not normal scientific compute.

## 2. Revised target repository topology

The amendment prefers minimal movement of already accepted B00 code.

```text
sportsagentslab-mef/
├── apps/
│   ├── practitioner-web/                 # primary Next.js/Vercel deployment
│   │   ├── app/                          # routes, screens, route handlers
│   │   ├── agent/                        # Eve filesystem-first agent definition
│   │   │   ├── agent.ts
│   │   │   ├── instructions.md
│   │   │   ├── tools/
│   │   │   ├── skills/
│   │   │   ├── evals/
│   │   │   └── subagents/               # only when justified
│   │   └── ...
│   └── control-api/                      # typed application/API boundary; not necessarily standalone deployed service
├── packages/
│   ├── contracts/
│   ├── generated-ts/
│   ├── generated-python/
│   ├── scientific-boundary/
│   ├── agent-boundary/
│   ├── operational-state/
│   ├── eve-runtime-adapter/              # optional package if needed to isolate Eve APIs
│   ├── opencode-model-adapter/           # thin provider adapter
│   └── vercel-deployment-adapters/       # Blob/Sandbox/hosting-only adapters when useful
├── scientific/
│   └── kernel/
├── fixtures/
├── tools/
├── infra/
│   └── vercel/
├── architecture/
├── scripts/
├── docs/
└── authority/
```

### Topology rule

Do not create all three new adapter packages automatically. The platform-refactor implementation MUST choose the smallest set that keeps provider dependencies out of core packages. A package exists only if it creates a measurable dependency boundary. Eve's required filesystem `agent/` stays in the deployed application even if helper adapters live in packages.

## 3. Dependency rules

Allowed conceptual edges:

```text
practitioner-web -> control-api public boundary
practitioner-web/agent -> agent-boundary
practitioner-web/agent -> eve adapter
Eve tools -> control/application boundary -> operational-state/job system
opencode adapter -> provider compatibility package -> OpenCode API
vercel Blob adapter -> ImmutableArtifactStore port
operational-state -> contracts/generated types
scientific host adapter -> scientific kernel
```

Forbidden edges:

```text
scientific/kernel -> Next.js
scientific/kernel -> Eve
scientific/kernel -> OpenCode
scientific/kernel -> @vercel/*
contracts -> Eve/Vercel/OpenCode provider SDKs
browser client -> pg/database internals
browser client -> OpenCode API key
Eve tool -> arbitrary SQL
Eve tool -> scientific implementation modules directly
agent -> practitioner-decision persistence bypass
```

## 4. Vercel deployment profile

### 4.1 Project profile

- One primary Vercel project for the MEF practitioner web application during prototype/development.
- Vercel project root SHOULD be `apps/practitioner-web` if monorepo tooling and workspace imports qualify cleanly.
- Git branch deployments create previews; accepted `main` creates the primary prototype deployment.
- Vercel-specific project configuration is source-controlled where safe; credentials and provider secrets remain environment variables.

### 4.2 Environment policy

Suggested variables, names subject to implementation qualification:

```text
DATABASE_URL
BLOB_READ_WRITE_TOKEN or Vercel-managed Blob binding
OPENCODE_API_KEY
OPENCODE_MODEL
OPENCODE_BASE_URL (only if required by adapter)
MEF_DEPLOYMENT_ENV
MEF_SYNTHETIC_ONLY=true before ML-98
```

No secret is exposed through `NEXT_PUBLIC_*`.

### 4.3 Hobby boundary

Hobby is the active development/prototype plan. The system MUST surface quota exhaustion as infrastructure failure, not reinterpret it as scientific failure. Commercial production requires a later hosting/plan decision.

## 5. Eve runtime design

### 5.1 Agent filesystem

```text
agent/
├── instructions.md
├── agent.ts
├── tools/
├── skills/
├── evals/
└── subagents/
```

The root agent remains a Measurement Evidence Factory agent, not a general sports coach.

### 5.2 Eve responsibilities

- durable conversational sessions;
- agent turn execution;
- tool selection and typed invocation;
- skill loading;
- agent/subagent coordination where justified;
- human-in-the-loop interaction mechanics;
- agent eval harness integration;
- frontend session/event integration.

### 5.3 Eve non-responsibilities

- scientific calculations;
- canonical database authority;
- source-artifact immutability;
- job idempotency semantics;
- scientific release qualification;
- practitioner decision truth;
- evidence-tier promotion.

### 5.4 Version policy

Because Eve is public preview:

- exact package version MUST be pinned;
- upgrades MUST run contract, agent, safety, restart/session, tool, and preview qualification;
- no automatic major/minor upgrade reaches main without review;
- the agent-boundary interface is the migration seam if Eve changes or is replaced.

## 6. OpenCode provider design

### 6.1 Provider seam

The application owns a small model-provider factory. Eve receives a model object/configuration from that seam. OpenCode credentials remain server-side.

Conceptual interface:

```typescript
type MefModelConfig = {
  provider: "opencode-go";
  modelId: string;
};

function createMefModel(config: MefModelConfig): LanguageModelLike;
```

The concrete return type may use the provider-compatibility type Eve expects; that type MUST NOT leak into scientific/domain contracts.

### 6.2 AI SDK role

OpenCode documents AI SDK-compatible provider packages for its Go endpoints. Eve also supports direct providers via provider packages. These packages are allowed inside the adapter. They are not a separate product layer and MUST NOT drive application architecture.

### 6.3 Routing policy

Initially use one configured primary model. Do not build a generic model router/tournament service before MEF evals establish a concrete need. Model fallback/routing may be added later behind the same adapter.

## 7. Tool gateway design

Every Eve tool is classified:

1. **Read/query tool** — reads already authorized typed data.
2. **Command tool** — submits an ML-97 command and receives a Job reference.
3. **Approval/request tool** — creates or requests a governed MEF decision/action; Eve UI approval alone is insufficient authority.

A tool MUST have:

- stable snake_case name;
- bounded typed input schema;
- bounded typed output schema;
- explicit authorization class;
- explicit idempotency behavior for mutations;
- no raw SQL string surface;
- no arbitrary module/function selector;
- audit correlation ID;
- tests/evals for misuse and forbidden claims.

## 8. Same-origin web/agent integration

The web application SHOULD mount Eve on the same origin so the browser does not need a separate agent host URL/CORS boundary. The persistent agent dock consumes Eve session/events through the supported frontend integration.

The UI MUST distinguish:

- verified MEF evidence/data;
- agent explanation/narrative;
- pending tool/job state;
- human approval/decision state.

Cross-route navigation MUST not silently create a new agent session unless explicitly requested.

## 9. Job-system integration

After ML-97 acceptance:

- a long-running or authority-bearing tool submits a typed Command;
- idempotency key + canonical input prevent duplicate logical work;
- Job state is the mutable execution lifecycle;
- JobAttempt is append-oriented execution history;
- progress is append-only ordered events;
- UNKNOWN_OUTCOME requires reconciliation;
- Eve observes/communicates job status but does not define it.

Temporal is not used in v1 unless a future ADR demonstrates the accepted job model cannot safely express a concrete workflow.

## 10. PostgreSQL / Neon hosted profile

The database package remains direct PostgreSQL semantics with versioned SQL migrations. Hosted deployment consumes a normal PostgreSQL connection string. Neon-specific APIs are optional operational conveniences and MUST NOT become the domain persistence contract.

Preview database policy should support isolation/branching where practical. ML-98 will define tenant/session security and RLS context before real athlete data is hosted.

## 11. Vercel Blob artifact adapter

The Vercel adapter implements the same immutable store contract used by ML-96:

```text
putImmutable
readImmutable
inspectImmutable
existsImmutable
```

Content key remains derived from SHA-256, conceptually:

`originals/sha256/<digest>`

Requirements:

- private store for sensitive artifacts;
- no overwrite path exposed by the application adapter;
- byte-for-byte readback hash verification;
- media type/length/integrity metadata verification;
- no original filename as object identity;
- S3 adapter remains tested and available.

Provider semantics that cannot prove an invariant MUST fail closed or be documented as a deployment limitation.

## 12. Vercel Sandbox profile

Sandbox is eligible for:

- generated-code evaluation;
- hostile/untrusted file/code execution that requires process isolation;
- Eve eval workloads requiring shell/file isolation;
- reproducibility experiments;
- temporary development servers or bounded scientific tooling checks.

Sandbox is forbidden as the default path for:

- routine database access;
- every Eve turn;
- normal evidence query;
- standard CMJ arithmetic;
- ordinary object-store access.

Sandbox quota is an operational resource and must be observable.

## 13. Scientific hosted adapter

The Python kernel continues to run locally/CLI for deterministic qualification. A thin Vercel Python Function may host bounded scientific worker endpoints only after verifying:

- supported Python/dependency versions;
- uncompressed bundle limit;
- startup/latency;
- execution duration;
- deterministic/tolerance behavior;
- memory/CPU sufficiency;
- artifact/database connectivity;
- failure/retry semantics through ML-97.

If any condition fails, another worker host may be selected without changing scientific contracts.

## 14. CI/CD and preview-first delivery

Required default loop for application/agent changes:

```text
local branch
  -> deterministic tests/evals
  -> push branch
  -> Vercel Preview
  -> hosted API/DB/agent browser proof
  -> founder review
  -> merge main
  -> primary prototype deployment
```

A preview proof must be tied to Git SHA and capture at least the relevant hosted URLs/IDs, test/eval results, and known limitations.

Do not require a Vercel preview for pure scientific-library unit development before there is a hosted path; require it when the change affects the product/agent/deployment surface.

## 15. Platform-refactor proof slice

The first hosted proof after this amendment MUST be synthetic and small:

1. Next.js desktop shell renders in a Vercel preview.
2. Same-origin typed control API responds.
3. PostgreSQL migrations apply to hosted dev DB and a synthetic ML-97 command/job round-trip succeeds.
4. Private Blob adapter stores/retrieves a synthetic artifact and independently verifies SHA-256.
5. Eve session starts and persists across route navigation.
6. Eve uses OpenCode directly; Vercel AI Gateway is absent from required configuration.
7. Eve invokes one read tool and one synthetic Command/Job tool through governed boundaries.
8. Forbidden direct DB/science access is architecture-tested.
9. No real athlete data is used.
10. Preview evidence is captured before merge.

Vercel Sandbox qualification may be a separate smoke within the same block but is not a blocker for the primary vertical slice unless the selected Eve configuration requires it.

## 16. ML-98 consumer requirements

ML-98 MUST design:

- web user authentication/session;
- Eve channel/session authentication;
- organization/tenant context;
- tool authorization by role/purpose/action;
- Postgres RLS context;
- OpenCode/Vercel/DB secret handling;
- private Blob access policy;
- approval identity binding;
- agent session to practitioner actor correlation;
- preview/production environment separation.

ML-98 MUST NOT change the platform decisions in this amendment without a superseding ADR.
