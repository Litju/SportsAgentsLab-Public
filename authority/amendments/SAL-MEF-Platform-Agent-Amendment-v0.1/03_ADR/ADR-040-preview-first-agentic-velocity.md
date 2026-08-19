# ADR-040: Make preview-first agentic iteration a first-class quality attribute

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

MEF is the first SportsAgentsLab agentic product. The platform must support rapid experimentation with UI, prompts, skills, tools, evals, and models while preventing scientific drift.

## Decision

Use small reversible vertical slices, deterministic gates, and Vercel previews as the default application/agent delivery loop. Keep the scientific/evidence core stable. Generalize shared platform features only after repeated need.

## Consequences

High founder feedback velocity and lower platform toil. Requires disciplined boundary/eval tests so speed does not become authority drift.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review when preview cadence or team scale requires a different promotion model; never use velocity to weaken scientific/safety gates.
