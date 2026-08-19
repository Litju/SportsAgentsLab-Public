# ADR-032: Use Vercel as the primary prototype/development deployment platform

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

MEF is the first SportsAgentsLab agentic product and needs rapid branch-to-preview iteration. Vercel provides Next.js hosting, Functions, Blob, Sandbox, deployment previews, environment configuration, and an Eve-native deployment path.

## Decision

Use Vercel as the primary prototype and v1 development deployment platform. The current Hobby plan is explicitly non-commercial development/prototype infrastructure. Do not treat Hobby as authorization for commercial production.

## Consequences

High iteration speed and low infrastructure burden. Vercel quotas/plan constraints become operational limitations, so core portability remains mandatory.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review before commercial production, when Hobby limits materially constrain qualification, or if platform behavior prevents governed invariants.
