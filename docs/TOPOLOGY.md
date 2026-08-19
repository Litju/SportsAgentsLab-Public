# ML-94 topology decision

## Decision

ML-94 selects a modular monorepo with explicit language and responsibility
boundaries. The machine-readable decision is architecture/topology.json.

The repository contains two TypeScript application boundaries, one typed
scientific port, one framework-neutral agent port, one framework-neutral
contract authority, generated model packages for both languages, one bounded
ML-96 operational-state substrate with the bounded ML-97 job-execution
boundary, one Python scientific workspace, structural fixtures, a generic
evidence/replay tool, architecture tooling, and a documentation-only
infrastructure boundary.

The source architecture TDD was used as proposed input. Its services,
registries, agent runtime, database, object-store, Temporal, Eve, and
deployment details are intentionally deferred because ML-94 requires
boundaries, not product behavior or speculative services.

## Ownership matrix

| Boundary | Purpose | Owner | Public interface | Allowed dependencies | Forbidden dependencies | Why it exists now |
| --- | --- | --- | --- | --- | --- | --- |
| apps/practitioner-web | Practitioner web boundary | practitioner-web | src/index.ts identity export | none | scientific kernel, scientific port, Python models, control API | Keeps the future UI independently testable and unable to import science. |
| apps/control-api | TypeScript control/API boundary | control-api | typed job-execution HTTP adapter plus control-to-science, control-to-agent, and control-to-operational-state port aliases | generated TS, operational-state, scientific port, agent port | scientific kernel, web, Python models | Gives application code explicit typed handoffs without exposing persistence internals. |
| packages/contracts | Canonical framework-neutral schemas | contracts | JSON Schema under schemas/ | none | apps and scientific implementation | Prevents cross-language contract drift. |
| packages/generated-ts | Generated TypeScript models | contracts | generated model exports | contracts | apps as generators, Python implementation | Gives TS consumers derived types. |
| packages/operational-state | ML-96 persistence/integrity substrate plus ML-97 execution boundary and deterministic tests | operational-state | immutable artifact/import evidence, audit/provenance/retention/transaction ports, typed command/job lifecycle, worker port, PostgreSQL job persistence | generated TS | UI, contracts, scientific implementation, agent runtime, evidence tooling, infra, brokers, workflow engines | Keeps immutable admission evidence separate from mutable Job execution while reusing one durable/audit substrate. |
| packages/generated-python | Generated Python models | contracts | mef_generated_models | none | apps and scientific implementation | Gives Python consumers derived types. |
| packages/scientific-boundary | Typed TS scientific port | control-api | ScientificComputationPort | none | Python implementation, apps | Blocks direct TS-to-Python-internals coupling. |
| packages/agent-boundary | Framework-neutral future agent port | agent-boundary | AgentRuntimePort generic interface | none | apps, scientific implementation, evidence, infra | Preserves the frozen persistent-agent seam without implementing runtime behavior. |
| scientific/kernel | Python scientific workspace | scientific-kernel | mef_scientific_kernel | generated Python models | UI, API, TS port, evidence tool, infra | Keeps scientific computation independently runnable/testable. |
| fixtures | Structural fixtures and expectations | test-engineering | JSON fixtures/manifests | contracts | apps, kernel, evidence runtime | Makes tests independent of application code and athlete data. |
| tools/evidence-replay | Declared-output verifier/replay boundary | evidence-tooling | mef_evidence_replay CLI | generated Python models | apps, kernel internals, TS port, infra | Preserves evidence independence from mutable application internals; later kernel replay is a released process boundary. |
| infra | Deployment boundary | infrastructure | documentation only in ML-94 | none | domain and application code | Reserves a future boundary without speculative provider configuration. |

## Dependency graph

    apps/practitioner-web

    apps/control-api
        -> packages/generated-ts
        -> packages/operational-state
        -> packages/scientific-boundary
        -> packages/agent-boundary

    packages/generated-ts
        -> packages/contracts

    packages/operational-state
        -> packages/generated-ts

    packages/contracts

    packages/generated-python

    packages/scientific-boundary

    packages/agent-boundary

    scientific/kernel
        -> packages/generated-python

    tools/evidence-replay
        -> packages/generated-python

    fixtures
    infra

The graph is acyclic. Contracts are the semantic source. Generated models are
derived outputs. The Python kernel is not imported by TypeScript, the web
application, fixtures, evidence tooling, or infrastructure. Evidence replay
may later invoke a versioned released-kernel command over a process boundary;
it must never import mutable kernel internals.

## Rejected alternatives

1. Copy the full proposed TDD tree. Rejected because workers, registries,
   agent runtime behavior, persistence, and deployment are not needed to
   establish ML-94 boundaries and would create architecture theater. The
   small agent port is retained because the persistent-agent seam is already
   frozen; its implementation remains deferred.
2. Split TypeScript and Python into separate repositories. Rejected because
   the requested contract, generated-model, fixture, and evidence boundaries
   are easier to test together in the canonical monorepo.
3. Use one language for all packages. Rejected because the accepted
   architecture explicitly keeps TypeScript control surfaces and Python
   scientific computation separate.
4. Add a build orchestrator such as Nx or Turborepo. Rejected because pnpm,
   uv, PowerShell, and small deterministic scripts are sufficient on Windows.

## Deferred boundaries

No product UI screens, source adapters, CMJ event detection, metric formulas,
inference runtime, real workload workers, agent runtime, authentication,
tenancy, or cloud provider configuration belongs in this boundary. ML-97 adds
only a deterministic framework-neutral execution port, fixture workers, typed
control API, and PostgreSQL persistence; it does not add a broker, workflow
engine, or downstream product behavior.
