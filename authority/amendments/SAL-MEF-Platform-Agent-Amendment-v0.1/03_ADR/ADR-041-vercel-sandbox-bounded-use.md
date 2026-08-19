# ADR-041: Use Vercel Sandbox only for bounded isolation-heavy workloads

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

Vercel Sandbox is valuable for untrusted/generated code and isolated agent tasks, but routine use would waste quota and create unnecessary distributed execution.

## Decision

Use Sandbox for special isolation needs: generated-code evaluation, hostile/untrusted execution, selected agent evals, reproducibility/tooling experiments. Do not route ordinary API, database, evidence queries, or normal scientific arithmetic through Sandbox.

## Consequences

Preserves quota and keeps normal execution simple while retaining a strong isolation primitive.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review when a concrete workload requires stronger isolation than Vercel Functions/worker boundaries provide.
