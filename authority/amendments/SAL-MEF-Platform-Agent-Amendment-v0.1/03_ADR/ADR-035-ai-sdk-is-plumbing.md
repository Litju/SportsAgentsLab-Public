# ADR-035: Treat AI SDK provider packages as implementation plumbing, not an architecture layer

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

Eve and OpenCode both interoperate through AI SDK provider interfaces/packages, but MEF does not need to build its application around AI SDK primitives.

## Decision

AI SDK is allowed only as an Eve/provider compatibility dependency or local implementation detail. It is omitted from the SportsAgentsLab conceptual architecture. MEF domain/application contracts do not depend on AI SDK types.

## Consequences

Avoids redundant abstraction and keeps Eve as the agent-runtime owner. Provider adapter code remains small and replaceable.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review only if MEF needs direct model operations that Eve intentionally cannot provide and the need survives a bounded design review.
