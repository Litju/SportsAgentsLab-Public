# ADR-043: Keep Python science independent and qualify Vercel Python Functions as the first hosted adapter

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The original TDD assumed containerized Python workers. Vercel now supports Python Functions, which may fit bounded scientific workloads, but the scientific kernel must remain independently runnable.

## Decision

Keep the Python kernel library/CLI independent. Treat a Vercel Python Function as the preferred first hosted adapter to qualify, not as scientific authority. If runtime/bundle/performance constraints fail, move the worker host without changing contracts.

## Consequences

Potentially removes container operations from the prototype while retaining an escape hatch for heavier compute.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review when B01/B04 scientific workloads are implemented and measured, or when Vercel Python runtime constraints change.
