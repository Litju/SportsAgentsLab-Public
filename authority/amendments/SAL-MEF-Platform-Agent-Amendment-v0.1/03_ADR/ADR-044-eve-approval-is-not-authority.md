# ADR-044: Do not equate Eve approval state with MEF practitioner authority

**Status:** `ADOPTED`\
**Date:** 2026-08-11\
**Decision owner:** SportsAgentsLab founder / architecture authority\
**Scope:** MEF v1 platform/agent architecture amendment


## Context

Eve supports human-in-the-loop approvals, but MEF already separates runtime interaction from practitioner/organization authority and requires append-only decision evidence.

## Decision

Eve approval mechanics may pause/resume an agent tool action, but any authority-bearing practitioner approval/override/decision MUST also be validated and persisted through the MEF application authority model with actor, scope, reason, evidence reference, and audit chronology.

## Consequences

Eve can provide excellent UX without becoming the system of record for scientific/practitioner authority.


## Verification and enforcement

- Add architecture/contract tests where the decision creates a code boundary.
- Record hosted qualification evidence where the decision affects deployment.
- A production exception requires a founder-approved waiver or superseding ADR.

## Review trigger

Review only if Eve exposes a formally qualified external authority store that can satisfy all MEF evidence/identity requirements; default remains MEF system of record.
