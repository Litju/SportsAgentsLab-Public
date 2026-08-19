# ADR-033: Adopt Eve as the canonical MEF agent runtime behind the agent port

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The baseline accepted Eve only for a spike. The product now deliberately targets an agent-first web architecture, and Eve provides the desired filesystem-first agent definition, durable sessions, tools, skills, approvals, subagents, evals, and Vercel deployment integration.

## Decision

Supersede ADR-023's spike-only disposition. Adopt Eve as the canonical v1 agent runtime while retaining the framework-neutral MEF agent boundary. Pin the Eve version and qualify upgrades because Eve is in public preview.

## Consequences

Rapid agent iteration without custom-runtime construction. Framework churn remains bounded to the adapter/runtime layer.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review on Eve GA, breaking upgrade, missing safety/durability capability, or evidence that another runtime materially improves the MEF workflow.
