# ADR-031: Use a desktop-first web product for MEF v1

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

The frozen UX is already a desktop-first longitudinal measurement workstation. A native desktop wrapper would add packaging, update, IPC, and platform-specific state before the core practitioner workflow is proven.

## Decision

MEF v1 is a browser-delivered web application optimized for desktop/laptop practitioner use. Native desktop packaging is not required. Responsive support is secondary; mobile-first redesign is not authorized.

## Consequences

Fast preview/deployment, one product runtime, easier agent/session integration, and lower platform maintenance. Offline/native OS integration is deferred.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Revisit only when validated workflow evidence requires offline/native capabilities that cannot be delivered acceptably by the web platform.
