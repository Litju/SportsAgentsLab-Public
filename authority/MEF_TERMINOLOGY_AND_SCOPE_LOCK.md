# MEF Terminology and Scope Lock

Status: NORMATIVE candidate; founder review required.

This lock freezes product terminology and the initial scientific/product boundary for ML-93. It is derived from the UX freeze, ADR/SDD/TDD baseline, source diagrams, and the founder sequencing decision. No implementation or package topology is introduced.

## Identity

| Term | Locked meaning |
| --- | --- |
| Umbrella system | SportsAgentsLab |
| First independent product | Measurement Evidence Factory Agent |
| Functional short name | MEF Agent |
| Current product title | Measurement Evidence Factory Agent |
| Engineering system | SportsAgentsLab Engineering Control Plane; development infrastructure only |

AgentSportsLab is not an active current product name. It appears in the UX source as a future integrated-system label and in rejected/superseded concepts. For this program lock it is a legacy/future alias only and must not be used as the current product or umbrella identity.

## Initial boundary

| Field | Locked value |
| --- | --- |
| Domain | sports-performance measurement |
| Population | athletes |
| Patient/clinical diagnosis | out of scope |
| Initial instrument | force plate |
| Initial assessment | bilateral unloaded hands-on-hips countermovement jump |
| Initial data path | supported native force-plate export |
| Scientific acquisition requirement | qualified vertical ground-reaction-force acquisition/configuration; explicit channels, units, axes, sample timing, synchronization, calibration, and preprocessing state |
| Processing boundary | deterministic measurement processing separated from statistical inference and agent behavior |
| Practitioner authority | qualified human practitioner retains final interpretation and consequential disposition |
| Unknown semantics | unknown is a first-class state; it is not confirmed false or confirmed true |
| Override semantics | preserve original evidence; add attributed reason, actor, time, prior value, new value, and affected evidence |

The architecture source narrows validation to trained adult field- and court-sport athletes aged 18-35 who are organizationally cleared to jump. That is a declared validation cohort within the broader athlete product population; it does not authorize clinical claims or broaden the product boundary.

## Scientific boundary

- Force-plate vendor identity is an ingestion concern; physical channels, coordinate/sign conventions, timing, calibration, synchronization, preprocessing, protocol, population, and metric pack determine eligibility.
- Native artifacts are preserved unchanged and hashed before parsing.
- Missing or conflicting units, axes, sample rate, filter state, calibration, synchronization, or protocol facts remain unknown and block qualified processing.
- Human-observed conditions such as hands remaining on hips remain human-confirmed; the force trace cannot fabricate them.
- Deterministic processor output, inferential estimates, practical importance, evidence verification, and human disposition remain separate layers.
- A closed, versioned, code-backed metric pack is required; arbitrary user formulas are forbidden.

## UX boundary

- Global routes: Overview, Tests, Athletes, Force Plates & Imports, Evidence, Reports, Protocols & References, Settings.
- No generic Analytics or Devices route; no clinical/patient route.
- Core test-detail stages: Source, Configuration, Protocol, Trials, Session, Change, Decision, Evidence.
- The persistent MEF Agent retains one identity and bounded, provenance-aware memory across core routes.
- Accepted green state is workflow confirmation only; it never denotes athlete condition.
- Human override is distinct and non-destructive.

## Explicit non-goals

No diagnosis, medical decision-making, readiness/fatigue/recovery state, injury-risk interpretation, clearance, causal training effect, autonomous training prescription, universal practical threshold, broad device family, or ML-94 topology decision is part of this lock.

## Source anchors

- UX freeze record: MEF-UX-FREEZE-RECORD-V030.
- UXD specification: MEF-UX-DESIGN-MD-V030.
- UX contracts and schemas: all MEF-UX-CONTRACT-* and MEF-UX-*SCHEMA-* entries in the YAML register.
- Architecture baseline: the SAL-MEF-ADR-0.1, SAL-MEF-SDD-0.1, and SAL-MEF-TDD-0.1 entries.
- Reconciled naming and scope conflicts: ML93_CONFLICT_REGISTER.md.

