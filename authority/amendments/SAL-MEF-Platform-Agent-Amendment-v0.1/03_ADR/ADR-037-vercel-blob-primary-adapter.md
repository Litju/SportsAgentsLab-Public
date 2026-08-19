# ADR-037: Use private Vercel Blob as the primary Vercel artifact adapter while retaining S3 portability

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The original design chose immutable S3-compatible object storage. ML-96 already created a provider-neutral immutable artifact contract and S3 adapter. Vercel Blob provides native object storage for the selected deployment platform.

## Decision

Keep `ImmutableArtifactStore` as authority. Add private Vercel Blob as the primary Vercel-hosted adapter. Retain the S3-compatible adapter and tests. Preserve SHA-256 content addressing, byte verification, and no-overwrite application semantics.

## Consequences

Simpler Vercel deployment without AWS dependency, while retaining portability.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review if Blob cannot satisfy immutability/integrity/private-access requirements or cost/scale pressure justifies another adapter.
