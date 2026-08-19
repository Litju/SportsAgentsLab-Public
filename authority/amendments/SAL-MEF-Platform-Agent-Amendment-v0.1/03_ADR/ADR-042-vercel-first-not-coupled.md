# ADR-042: Be Vercel-first at deployment while forbidding provider coupling in the governed core

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

Using Vercel aggressively improves iteration speed, but embedding Vercel SDK types into domain/scientific contracts would create unnecessary lock-in.

## Decision

Vercel-specific imports belong only in app hosting or deployment-adapter layers. Canonical contracts, scientific kernel, evidence semantics, job semantics, and authority rules remain provider-neutral.

## Consequences

The team can exploit Vercel now and still move storage/compute/hosting later without rewriting scientific truth.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review only if a provider-specific capability would materially improve the product and cannot be represented behind an adapter.
