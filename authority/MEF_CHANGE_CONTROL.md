# MEF Authority Change Control

Status: NORMATIVE candidate; founder review required.

This procedure governs any future change to the frozen program authority. It is a control-plane document, not a product runtime or repository topology design.

## Required change record

Every proposed authority change must identify all of the following:

1. Artifact being changed, exact current version, and current SHA-256.
2. Proposed version and proposed content SHA-256.
3. Reason for change and the source evidence or founder decision that motivates it.
4. Affected downstream blocks and artifacts.
5. Required revalidation: terminology, scope, scientific contract, UX, architecture, security, evidence, accessibility, or other applicable gates.
6. Supersession relationship: exact artifact IDs, whether the prior artifact remains replayable, and any historical evidence impact.
7. Founder approval state, approving authority, date, and decision reference.
8. Updated register entry, conflict record, closure/evidence packet, and checksum record.

## Procedure

1. Open a proposed change record without editing frozen source ZIP bytes.
2. Recompute the current source and artifact hashes independently.
3. State the exact old and new authority, including any conflict before resolution.
4. Obtain the required scientific, architecture, UX, evidence, security, and QA reviews for the affected boundary.
5. Record founder approval or rejection. No builder summary, issue title, or generated register may substitute for approval.
6. If approved, add a new versioned authority artifact and mark the old artifact SUPERSEDED only when the supersession is explicit and references resolve. Preserve old artifacts for audit/replay.
7. Revalidate all affected downstream blocks before any implementation issue consumes the new authority.
8. Relock repository identity, branch, staged-file state, changed paths, frozen source hashes, references, and forbidden paths.

## Immutable downstream locks

No later implementation issue may silently modify product identity, initial scope, forbidden claims, scientific contract, architecture boundary, UX freeze, roadmap dependency order, unknown/override semantics, or practitioner authority. A change to any of these is a material authority change and must follow this procedure.

## Stop conditions

Stop and mark the task BLOCKED if the current/proposed precedence cannot be resolved, a required owner or founder decision is missing, a source hash changes unexpectedly, an active conflict remains in naming/scope/UX/architecture, or required revalidation evidence is unavailable.

## Founder-owned actions

The founder owns acceptance, staging, commits, pushes, pull requests, merges, releases, and Linear updates. This ML-93 run performs none of those actions.

