# ADR-038: Keep PostgreSQL provider-neutral and use Neon as the first Vercel-hosted candidate

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

ML-96/97 use direct PostgreSQL semantics. Vercel Marketplace supports managed Postgres providers. Neon integrates directly with Vercel without requiring a persistence redesign.

## Decision

PostgreSQL remains the database authority via standard connection semantics and migrations. Use Neon as the initial hosted development candidate. Do not introduce Neon-specific domain semantics.

## Consequences

Fast hosted setup with preservation of local/native PostgreSQL qualification and migration portability.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review on commercial deployment, residency/compliance requirements, or concrete PostgreSQL-provider limitations.
