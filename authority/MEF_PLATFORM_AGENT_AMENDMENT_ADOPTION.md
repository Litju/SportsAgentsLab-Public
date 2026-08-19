# SportsAgentsLab MEF Platform + Agent Amendment Adoption Record

AMENDMENT=SAL-MEF-Platform-Agent-Amendment-v0.1
SOURCE_BUNDLE=authority/SAL-MEF-Platform-Agent-Amendment-v0.1.zip
SOURCE_SHA256=d0916ea63cd738480424b1203e06a2378243130edaca47c1b67b02cad9a15826
MATERIALIZED_ROOT=authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1

FOUNDER_DECISION=ADOPTED
EFFECTIVE_STATUS=NORMATIVE_PLATFORM_AGENT_AMENDMENT
ADOPTION_DATE=2026-08-11

BASELINE_REPLACED=NO
BASELINE_AMENDED=YES
ACCEPTED_PREDECESSOR_HEAD=7b0e8be
ACCEPTED_PREDECESSOR_FULL_HEAD=7b0e8bedb0308018d8e7fffb0e7583e4a6b90580

ADR_044_DISPOSITION=AUTHORITY_PRESERVATION_CLARIFICATION_NO_SUPERSESSION_ROW_REQUIRED

EFFECTIVE_AUTHORITY_RELATIONSHIP=BASELINE + AMENDMENT = CURRENT EFFECTIVE AUTHORITY
ORIGINAL_FROZEN_SOURCE_ZIPS=IMMUTABLE
RUNTIME_IMPLEMENTATION_AUTHORITY=SEPARATELY_GATED
GIT_STAGE_COMMIT_PUSH=FORBIDDEN
LINEAR_MUTATION=FORBIDDEN

The adopted amendment is effective as the normative platform/agent layer over
the preserved ML-93 baseline. It does not replace historical SDD/TDD/ADR or
scientific authority. ADR-044 preserves the distinction
`EVE_APPROVAL_MECHANISM != PRACTITIONER_AUTHORITY`: Eve approval mechanics may
control workflow/tool interaction, but cannot establish scientific truth,
approve a practitioner override, create return-to-participation clearance,
supersede a PractitionerDecision, supersede evidence authority, or override
forbidden-claim rules.
