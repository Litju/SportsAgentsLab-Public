# ML-93 Conflict Register

Status: RESOLVED FOR ML-93; founder review required.

Active conflict counts after reconciliation: ACTIVE_NAMING_CONFLICTS=0; ACTIVE_SCOPE_CONFLICTS=0; ACTIVE_UX_CONFLICTS=0; ACTIVE_ARCHITECTURE_CONFLICTS=0.

A resolved conflict remains recorded here; source bundles are immutable and were not edited.

## C-NAMING-001

- conflict_id: C-NAMING-001
- artifact_a: MEF-UX-FREEZE-RECORD-V030 and MEF-UX-DESIGN-MD-V030
- artifact_b: ML-93 founder product-identity decision and MEF-ARCH-* source documents
- topic: umbrella naming
- statement_a: UX source uses AgentSportsLab as a future integrated system and rejects it as the current product name.
- statement_b: Founder lock and architecture source use SportsAgentsLab as the umbrella system; the current product is Measurement Evidence Factory Agent.
- precedence: Founder product-identity decision controls current naming; the UX source is read as an explicit future/legacy occurrence, not an active current identity.
- resolution: Umbrella is SportsAgentsLab; first product is Measurement Evidence Factory Agent; short name is MEF Agent; AgentSportsLab is a prohibited current-name alias.
- reason: This preserves the explicit current-versus-future distinction and removes active naming ambiguity without changing frozen source bytes.
- remaining_uncertainty: None for ML-93 identity.
- blocking: false

## C-SCOPE-001

- conflict_id: C-SCOPE-001
- artifact_a: MEF-ARCH-SDD and MEF-ARCH-TDD
- artifact_b: ML-93 initial scope lock
- topic: initial device/input breadth
- statement_a: Architecture baseline discusses single-total and dual-independent configurations, CSV/XLSX/JSON/C3D surfaces, and optional C3D after qualification.
- statement_b: ML-93 freezes the first product path to a qualified force-plate vertical-force acquisition/configuration and supported native force-plate export; no broad device/input promise is made.
- precedence: Founder initial-scope lock controls B00; the architecture baseline remains proposed and its broader surfaces require later qualification.
- resolution: Initial scope is force plate, bilateral unloaded hands-on-hips CMJ, supported native force-plate export, and qualified vertical-force semantics. Other surfaces remain deferred qualification options.
- reason: A proposed architecture envelope cannot broaden the explicitly frozen first useful product.
- remaining_uncertainty: Exact first vendor/export surface, sample-rate set, and C3D timing remain explicitly open in ADR-0.1.
- blocking: false

## C-SCOPE-002

- conflict_id: C-SCOPE-002
- artifact_a: MEF-ARCH-SDD target validation population
- artifact_b: ML-93 population lock
- topic: population granularity
- statement_a: SDD names trained adult field- and court-sport athletes aged 18-35 who are organizationally cleared to jump as the target validation population.
- statement_b: ML-93 names athletes as the initial product population and excludes patient/clinical diagnosis.
- precedence: ML-93 product scope controls; the SDD cohort is a narrower declared validation cohort.
- resolution: Product domain population is athletes; scientific validation claims remain limited to the declared qualified cohort until evidence expands scope.
- reason: A validation cohort is nested inside, not contradictory to, the product domain population.
- remaining_uncertainty: External-population and subgroup evidence are not established.
- blocking: false

## C-UX-001

- conflict_id: C-UX-001
- artifact_a: MEF-UX dashboard profile schema and UXD return-to-participation section
- artifact_b: MEF_FORBIDDEN_CLAIMS_LOCK.md and ADR-029
- topic: return-to-participation terminology
- statement_a: UX permits a return_to_participation_measurement profile and return-to-participation measurement report.
- statement_b: Product must not issue return-to-participation clearance, readiness, safety, healing, or low-injury-risk claims.
- precedence: The UX source itself limits this context to measurement support; the forbidden-claims lock controls interpretation.
- resolution: Return-to-participation is permitted only as measurement support and practitioner-authored criteria; clearance is forbidden.
- reason: The distinction is explicit in the UX source and prevents measurement support from becoming decision authority.
- remaining_uncertainty: Exact future wording and workflow copy require UX acceptance review at implementation time.
- blocking: false

## C-ARCH-001

- conflict_id: C-ARCH-001
- artifact_a: MEF-ARCH-TDD proposed repository/module topology
- artifact_b: ML-93 and ML-94 sequencing decision
- topic: topology authority
- statement_a: TDD sketches a modular monorepo with apps, services, packages, scientific, registry, tests, evidence-profiles, and infra directories.
- statement_b: ML-93 forbids monorepo topology design and assigns topology/package boundaries to ML-94.
- precedence: ML-94 is authoritative for topology; ML-93 only registers the TDD as a proposed source artifact.
- resolution: No topology is adopted, created, or implied by ML-93; the TDD sketch remains a proposed baseline for later review.
- reason: The source document explicitly withholds implementation authority and the founder sequence explicitly defers topology.
- remaining_uncertainty: Final topology is intentionally deferred to ML-94.
- blocking: false

## C-ARCH-002

- conflict_id: C-ARCH-002
- artifact_a: MEF-ARCH evidence_state diagram
- artifact_b: MEF-UX measurement case state model
- topic: override state label
- statement_a: Architecture rendering uses the shorthand OVERRIDDEN.
- statement_b: UX contract uses PRACTITIONER_OVERRIDDEN and requires original evidence preservation.
- precedence: UX state contract controls product terminology; architecture rendering is informative/proposed shorthand.
- resolution: Canonical product state is PRACTITIONER_OVERRIDDEN; OVERRIDDEN is only a diagram label and cannot erase the original result.
- reason: The state semantics are more precise in the UX contract and align with the source architecture rule that later decisions create new events.
- remaining_uncertainty: None for ML-93 state semantics.
- blocking: false

## C-ROADMAP-001

- conflict_id: C-ROADMAP-001
- artifact_a: MEF-ARCH-SDD A0-A7 implementation roadmap and UX sequence options A-C
- artifact_b: ML-93 B00-B09 founder program roadmap
- topic: program sequencing
- statement_a: Source documents describe architecture increments A0-A7 and UX options without selecting one sequence.
- statement_b: ML-93 defines B00-B09 as the active program block order, with B00 current and ML-94 topology gate.
- precedence: Founder program roadmap controls issue/block sequencing; A0-A7 and UX options remain informative/proposed planning material.
- resolution: B00-B09 is the canonical program dependency order. A0-A7 is retained as a proposed architecture implementation sequence and must not start in ML-93.
- reason: Program block authority and internal architecture planning are different layers.
- remaining_uncertainty: Mapping individual future B blocks to A increments is not finalized and is not needed for B00.
- blocking: false

## C-STATUS-001

- conflict_id: C-STATUS-001
- artifact_a: MEF-ARCH-ADR/SDD/TDD source headers and internal ADR status rows
- artifact_b: ML-93 closed artifact-status vocabulary
- topic: owner-review baseline versus accepted decisions
- statement_a: Core documents say CURATED_BASELINE_FOR_OWNER_REVIEW and Implementation authority: Not granted; internal ADR rows say Accepted or Accepted with qualification.
- statement_b: ML-93 requires a single closed status per physical artifact.
- precedence: Document-level status controls artifact classification; internal ADR rows are recorded in notes as accepted design directions within a proposed bundle.
- resolution: ADR/SDD/TDD physical files are PROPOSED; their internal decision statuses are not silently promoted to implementation authority.
- reason: This preserves both explicit document status and internal decision meaning.
- remaining_uncertainty: Founder acceptance of the architecture baseline is a future gate.
- blocking: false

## Deferred open decisions (explicitly open, not active conflicts)

ADR-0.1 explicitly leaves exact first vendor/export surfaces, qualified sample rates, event thresholds/filter policy, production inference runtime, Temporal profile, hosting/data residency, registry trust model, SESOI governance, and C3D MVP timing open. These are recorded as deferred qualification questions, not guessed in this register. They do not block B00 authority closure; they do block claims of scientific qualification, implementation readiness, or final topology acceptance.

## Closure condition

All required ML-93 active conflict classes are zero after the above resolutions. Any later evidence that changes one of these resolutions must reopen the conflict before implementation proceeds.

