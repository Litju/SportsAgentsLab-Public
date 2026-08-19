# ADR-034: Use OpenCode Go as primary model access and disable Vercel AI Gateway by default

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The owner already has OpenCode Go subscription/API access and does not want model billing/routing tied to Vercel AI Gateway. Eve can use a direct provider through compatible provider packages.

## Decision

OpenCode Go is the primary model-access provider. Model ID is configuration. Vercel AI Gateway is not required and is disabled by default. Credentials remain server-side.

## Consequences

Uses existing subscription economics and keeps model-provider choice under SportsAgentsLab control. OpenCode API/catalog changes require adapter qualification.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review when OpenCode terms/API materially change, model quality/availability fails requirements, or a different provider demonstrates a clear advantage.
