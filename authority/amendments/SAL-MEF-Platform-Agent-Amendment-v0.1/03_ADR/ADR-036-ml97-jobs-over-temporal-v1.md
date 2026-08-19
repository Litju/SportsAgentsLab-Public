# ADR-036: Use ML-97 Command/Job execution as v1 workflow substrate and defer Temporal

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The baseline planned Temporal after a workflow gate. B00 subsequently built a framework-neutral durable Command/Job system with idempotency, retries, cancellation, progress, unknown-outcome reconciliation, worker replaceability, and PostgreSQL enforcement.

## Decision

After ML-97 founder acceptance, use that system as the v1 orchestration substrate. Temporal is deferred and removed from the critical path. Do not run both systems for the same workflow without a new ADR.

## Consequences

Lower operational complexity and direct reuse of proven B00 infrastructure. Advanced workflow features must be added carefully or justify revisiting Temporal.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review only when measured multi-step/long-wait workflow complexity exceeds the maintainable capabilities of ML-97.
