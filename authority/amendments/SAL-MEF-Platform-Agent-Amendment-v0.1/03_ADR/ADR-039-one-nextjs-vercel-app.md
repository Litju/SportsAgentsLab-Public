# ADR-039: Use one primary Next.js Vercel application and same-origin server/agent integration

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

A separate Fastify deployment would increase prototype infrastructure without adding an independent scaling/security requirement yet. The control API is already a typed boundary and can remain logically separate from its transport host.

## Decision

Deploy one primary Next.js application for the v1 practitioner product. Mount thin same-origin API routes that call the existing control/application boundary. Mount Eve same-origin where supported. Do not require a separately deployed control API service initially.

## Consequences

Lower deployment and CORS complexity, faster previews, fewer services. The control boundary remains extractable if measured pressure appears.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review when independent scaling, ownership, security isolation, or external API consumers justify a separate deployment.
