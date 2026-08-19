# MEF Program Authority Register

Status: NORMATIVE candidate; founder review required.

This register is the single ML-93 authority index for the initial Measurement Evidence Factory Agent program. It reconciles the three immutable source bundles without copying, extracting, or modifying them in the product repository. It does not authorize product implementation or decide ML-94 repository/package topology.

## Relock identity

- Mission: SPORTSAGENTSLAB_MEF_ML93_PROGRAM_AUTHORITY_FREEZE
- Linear issue: ML-93
- Repository: <LOCAL_PATH_REDACTED>
- Branch: work/ml93-program-authority-freeze
- Base and end HEAD: f70ab7e44b54eca17d4e172d4ef7b970abb4f267
- Staged files: 0 before candidate writes
- Founder review: required

## Authority precedence

1. The founder ML-93 sequencing and identity decision controls current product identity, initial scope, B00 sequencing, repository boundary, and the prohibition on product implementation and topology inference.
2. The UX/UI bundle is explicitly frozen at SAL-MEF-UXD v0.3.0 / FROZEN_FOR_IMPLEMENTATION_PLANNING and controls the frozen UX contract.
3. The dated ADR/SDD/TDD bundle is CURATED_BASELINE_FOR_OWNER_REVIEW. Its internal ADR decisions are accepted design directions, but each source document states that implementation authority is not granted.
4. Diagram DOT sources and renderings support the architecture baseline; identical duplicates across architecture bundles are one representation, not a precedence dispute.
5. The separate SportsAgentsLab Engineering Control Plane supplies development-time authority, QA, reviewer separation, and Windows-native execution. It is not the MEF product, product memory, or product runtime.
6. Live Git state and raw QA evidence constrain observable claims and cannot broaden any authority above.

## Adopted authority layers

The following layer is founder-adopted and is part of the effective authority
after the preserved baseline. Runtime implementation remains separately gated:

| ID | Version | Status | Source SHA-256 | Materialized path | Implementation authority |
|---|---|---|---|---|---|
| MEF-PLATFORM-AGENT-AMENDMENT-V0-1 | 0.1.0 | ADOPTED | `d0916ea63cd738480424b1203e06a2378243130edaca47c1b67b02cad9a15826` | `authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1` | No |

The adopted layer has effective status `NORMATIVE_PLATFORM_AGENT_AMENDMENT`,
references ADR-031 through ADR-044 and its surgical
supersession map in `00_AUTHORITY/SUPERSESSION_MATRIX.yaml`. It changes only
platform/deployment/agent/model/workflow-adapter clauses; the original frozen
source ZIPs, scientific locks, forbidden-claim rules, practitioner authority,
and dependency lock are unchanged. ADR-044 is recorded as an
`AUTHORITY_PRESERVATION_CLARIFICATION_NO_SUPERSESSION_ROW_REQUIRED`.

Filename dates are not used as the sole precedence rule; explicit freeze status, document status, owner decisions, and supersession language were evaluated.

## Source bundles

| ID | Bundle | SHA-256 | Members | Source status | Internal hash evidence |
| --- | --- | --- | ---: | --- | --- |
| MEF-SOURCE-BUNDLE-UX-V030 | SAL-MEF-UX-UI-FREEZE-v0.3.zip | a5eb02c1aeb271e763211e733fdfb761df9a7663d0ce00acc8e5122ce4c941f5 | 27 | NORMATIVE | SAL-MEF-UX-UI-FREEZE-v0.3/SHA256SUMS |
| MEF-SOURCE-BUNDLE-DIAGRAMS-20260803 | SAL-MEF-Architecture-Diagrams.zip | 1a046c587f7413fc4e2cd4c75d20dd57efa5559eec4ea6a5d814c8a48d94c46f | 21 | PROPOSED | none |
| MEF-SOURCE-BUNDLE-ARCH-20260803 | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | e3fa4e306e14d440d95933a084dc2623724117af5a00d5a164cd401f4ce8d9f0 | 24 | PROPOSED | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/bundle-manifest.json |

All three container hashes and all internal manifest/checksum hashes passed independent verification. The frozen ZIP bytes were not modified.

## Complete artifact inventory

The YAML register is canonical for owner, version, dependencies, supersession references, and notes. The table below is the complete 72-file physical inventory, ordered deterministically by bundle and internal path.

| ID | Type | Source bundle | Internal path | Status | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-A11Y-REPORT-JSON | implementation_evidence | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/a11y-report.json | IMPLEMENTATION_EVIDENCE | 70072e7084f62f9541b8b17a60f63190d0bf70928859b068ff295bc632c2ea94 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-CONTRACTS-01-INFORMATION-ARCHITECTURE-AND-ROUTES-MD | ux_contract | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/contracts/01_INFORMATION_ARCHITECTURE_AND_ROUTES.md | NORMATIVE | a8732a7259f77f75c7730ef8733db76c7217ea464a027d1bf27764a781fdf7a5 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-CONTRACTS-02-SCREEN-CONTRACT-REGISTRY-MD | ux_contract | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/contracts/02_SCREEN_CONTRACT_REGISTRY.md | NORMATIVE | 9bb58ecd6d86d221cad913f07992c99dd59f7f128bad9c8c963f88263fb7fb15 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-CONTRACTS-03-PERSISTENT-MEF-AGENT-CONTRACT-MD | ux_contract | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/contracts/03_PERSISTENT_MEF_AGENT_CONTRACT.md | NORMATIVE | a711f3e391c2e2f22be2821aa326d5518e82c10bed7f61834e02c43942d4b1c6 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-CONTRACTS-04-MEASUREMENT-CASE-STATE-MODEL-MD | ux_contract | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/contracts/04_MEASUREMENT_CASE_STATE_MODEL.md | NORMATIVE | baa99dac06b961eb81e3e928e9af3949c38d9362f9f5f3b300eb532cc7b0de37 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-CONTRACTS-05-UX-IMPLEMENTATION-ACCEPTANCE-GATES-MD | ux_contract | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/contracts/05_UX_IMPLEMENTATION_ACCEPTANCE_GATES.md | NORMATIVE | 5a9825b9a3b3c6f746f7d39b9f0a79cdf10b93d401e7e200e1df9a4c8834159e |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-INFORMATION-ARCHITECTURE-DOT | diagram_source | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/information_architecture.dot | NORMATIVE | 19f53b4b52814c413fb1f5a4cbb52d4ae49c7030008a8d2f738062de90ee3ddf |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-INFORMATION-ARCHITECTURE-PNG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/information_architecture.png | INFORMATIVE | 11a48021bc94679cadcf46e50255ef36469ef49ffd15e26bfa179bdd98e1e9db |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-INFORMATION-ARCHITECTURE-SVG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/information_architecture.svg | INFORMATIVE | ada2d2ca01bd3030fcb670e9a7ff74746c8922487393f7199bd41f4f04ca459e |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-OVERVIEW-DASHBOARD-ANATOMY-DOT | diagram_source | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/overview_dashboard_anatomy.dot | NORMATIVE | d0fb335988a82a71e36fa56239ad1669d40a8ff4b84465cab376258e77885c6a |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-OVERVIEW-DASHBOARD-ANATOMY-PNG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/overview_dashboard_anatomy.png | INFORMATIVE | a55f44000951f008e9e92b594de46fffdd5884cae9e9bb5e46b029bc43a0b9a3 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-OVERVIEW-DASHBOARD-ANATOMY-SVG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/overview_dashboard_anatomy.svg | INFORMATIVE | 74da205dd04d123f0d10f1fc936b055004e99f168d274a6992a7a71319bebb1c |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-TEST-DETAIL-WORKFLOW-DOT | diagram_source | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/test_detail_workflow.dot | NORMATIVE | e4d0d1f450d09498882045d9a7f0b1ec3213aa53de35ee301a1a3d58ffc3ff40 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-TEST-DETAIL-WORKFLOW-PNG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/test_detail_workflow.png | INFORMATIVE | cbbd8c56903005f1b3161f54e254382f15102d3d6f030ce6377b171646be24b7 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-DIAGRAMS-TEST-DETAIL-WORKFLOW-SVG | diagram_rendering | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/diagrams/test_detail_workflow.svg | INFORMATIVE | 1f4a1c459c15b18ebc03314d21eac9b116a2362119941000781b47a9484b361c |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-FREEZE-RECORD-MD | freeze_record | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/FREEZE_RECORD.md | NORMATIVE | 1e7536c70fb25a930280f531d0f1ee125a731f88ae627adb9863d5fd04005436 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-IMPLEMENTATION-SEQUENCE-DECISION-BRIEF-MD | decision_brief | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/IMPLEMENTATION_SEQUENCE_DECISION_BRIEF.md | PROPOSED | 4a8e0b2590ddbcac5edb37a54df11abf86953a1ffe3cfb03d6901be5ea263492 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-README-MD | readme | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/README.md | INFORMATIVE | 01f2efa8c5e9c8db4dd73dab85fd877aa4e1bfdb3be0205061408da23b8b71e9 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SAL-MEF-UX-UI-DESIGN-FREEZE-V0-3-DOCX | document_representation | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/SAL-MEF-UX-UI-DESIGN-FREEZE-v0.3.docx | INFORMATIVE | 0c10b9bfe31debe8f45838fc698d3172f1a6c03d3c2aa6b79f4efb8b1f4de517 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SAL-MEF-UX-UI-DESIGN-FREEZE-V0-3-MD | ux_design_spec | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/SAL-MEF-UX-UI-DESIGN-FREEZE-v0.3.md | NORMATIVE | f6beb41a3032d2ae58a60df3b21c11b004ef5f4ec67025811eb1e2f11b4ff4d4 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SAL-MEF-UX-UI-DESIGN-FREEZE-V0-3-PDF | document_representation | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/SAL-MEF-UX-UI-DESIGN-FREEZE-v0.3.pdf | INFORMATIVE | de6e7a0b2531d8b5429cc76feec6231803d04941229beff62f019c59db6a835f |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SCHEMAS-ASSISTANT-CONTEXT-SCHEMA-JSON | schema | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/schemas/assistant-context.schema.json | NORMATIVE | a9be1264cee41fe436361cb42969b29afb43e2db82b884a2652016f48ad3a4e9 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SCHEMAS-DASHBOARD-PROFILE-SCHEMA-JSON | schema | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/schemas/dashboard-profile.schema.json | NORMATIVE | 1cd46634f852980b886cf9a350f4b462925d65394d0f225bf6b875cfd305db45 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SCHEMAS-NAVIGATION-CONTRACT-JSON | schema | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/schemas/navigation.contract.json | NORMATIVE | fa2edd7a73a882f38392294a55c7e519e3421b8884c323d19b9c44a788755612 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SCHEMAS-SCREEN-STATE-REGISTRY-JSON | schema | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/schemas/screen-state-registry.json | NORMATIVE | 9484922afa084a972cccfa52a42eff0d98a10d9927aa6bba07699aaecc6981c5 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SCHEMAS-UX-FREEZE-MANIFEST-JSON | schema | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/schemas/ux-freeze-manifest.json | NORMATIVE | d74cbf83257e5254de368eaed63017917c1ce039a1f2836103009df1fde3f533 |
| MEF-UX-SAL-MEF-UX-UI-FREEZE-V0-3-SHA256SUMS | checksum_manifest | SAL-MEF-UX-UI-FREEZE-v0.3.zip | SAL-MEF-UX-UI-FREEZE-v0.3/SHA256SUMS | INFORMATIVE | 2797eebb6bc481fd08fcaf78390089b5987e9f9640825563d620b24a8a9dba72 |
| MEF-DIAG-CONTAINER-ARCHITECTURE-DOT | diagram_source | SAL-MEF-Architecture-Diagrams.zip | container_architecture.dot | PROPOSED | 09797fbe59d76706b5ccbc66a8184852b3228af03934dc9186727fb452fc66cd |
| MEF-DIAG-CONTAINER-ARCHITECTURE-PDF | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | container_architecture.pdf | INFORMATIVE | 03a38a213f180e089df6c2334dc159323eb81c02f1c6aa5647bf17627a0d74bd |
| MEF-DIAG-CONTAINER-ARCHITECTURE-PNG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | container_architecture.png | INFORMATIVE | 1754f8cf37e869e97ad986af6643121b721085e506f7bafed7c61850e170fa47 |
| MEF-DIAG-CONTAINER-ARCHITECTURE-SVG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | container_architecture.svg | INFORMATIVE | 3ff40a95b97af06aa940e0d0df1ce8275b114de6237a3600ebffc421107704a3 |
| MEF-DIAG-EVIDENCE-STATE-DOT | diagram_source | SAL-MEF-Architecture-Diagrams.zip | evidence_state.dot | PROPOSED | 6b38bf0e6de5f7e50b191edbf519ae9f38b64ffc9eee29f9fae084032644fe19 |
| MEF-DIAG-EVIDENCE-STATE-PDF | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | evidence_state.pdf | INFORMATIVE | 75e57b831927b4926fa57cbd0466d97a8bcb744552e328b3b8b11c97ed0df4c5 |
| MEF-DIAG-EVIDENCE-STATE-PNG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | evidence_state.png | INFORMATIVE | 6607e8f7065139e956b4ceb90c293f177e966c9998505ad41f3cb22685327460 |
| MEF-DIAG-EVIDENCE-STATE-SVG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | evidence_state.svg | INFORMATIVE | d0aaa6b4df7cb7efff527611f95e4b9866e0383d6845507726747dff32def1f7 |
| MEF-DIAG-RELEASE-FACTORY-DOT | diagram_source | SAL-MEF-Architecture-Diagrams.zip | release_factory.dot | PROPOSED | fbc59f5205af87c8ec99e37d19276b235872c0eaa8c9cf89eb64133fd6822262 |
| MEF-DIAG-RELEASE-FACTORY-PDF | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | release_factory.pdf | INFORMATIVE | b872d628cede031a142d617ccba509ae54d371b0b2ad495ef731867eb73fa896 |
| MEF-DIAG-RELEASE-FACTORY-PNG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | release_factory.png | INFORMATIVE | 40bf9a1b014091680d38896bd55f09a16e845b0115c5db31e6630aa0b752df61 |
| MEF-DIAG-RELEASE-FACTORY-SVG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | release_factory.svg | INFORMATIVE | 1576af035873d3f383b5ae5531abe33208a7078bf4ff7b6efc162447d8e96958 |
| MEF-DIAG-SAL-MEF-ARCHITECTURE-DIAGRAMS-PDF | diagram_compendium | SAL-MEF-Architecture-Diagrams.zip | SAL-MEF-Architecture-Diagrams.pdf | INFORMATIVE | f6e11f7b96d99243c9e9e97ee2a66d9b7989d4bc29e2549d4dd82b2ff374b95b |
| MEF-DIAG-SCIENTIFIC-PIPELINE-DOT | diagram_source | SAL-MEF-Architecture-Diagrams.zip | scientific_pipeline.dot | PROPOSED | 71fc498bb93c3e37f59e5fbba9de7824c260de7b78c9ff724be5157bc4a4c8ce |
| MEF-DIAG-SCIENTIFIC-PIPELINE-PDF | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | scientific_pipeline.pdf | INFORMATIVE | e4d09805c12c1855c69f8aafbf3e987caf35f67f1c5c1c8921024e555affd6a2 |
| MEF-DIAG-SCIENTIFIC-PIPELINE-PNG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | scientific_pipeline.png | INFORMATIVE | 470984d7aca0cd0d9a369a8acb67f2b9a8d7bb9a86125371ac3b482d066f277f |
| MEF-DIAG-SCIENTIFIC-PIPELINE-SVG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | scientific_pipeline.svg | INFORMATIVE | 3f2f5c1c6d56a493317b15dbfb4203e9d0022e44d5c70b7c63978a8180c27b23 |
| MEF-DIAG-SYSTEM-CONTEXT-DOT | diagram_source | SAL-MEF-Architecture-Diagrams.zip | system_context.dot | PROPOSED | 233eab6e5b5e0364dfb563147ba49aa1fdb1b3caa1b5157fb23b60f460cbf43f |
| MEF-DIAG-SYSTEM-CONTEXT-PDF | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | system_context.pdf | INFORMATIVE | 9e68a804bf46f0b9140270a1925b38c60849189b7de49f15fecc6a25a9024c22 |
| MEF-DIAG-SYSTEM-CONTEXT-PNG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | system_context.png | INFORMATIVE | b2d4c22c0dd96267d47217e55f0745e04aa011e9df5618dc62c3452b4aac2d21 |
| MEF-DIAG-SYSTEM-CONTEXT-SVG | diagram_rendering | SAL-MEF-Architecture-Diagrams.zip | system_context.svg | INFORMATIVE | 5e0eeb6de70a259a538917ad37fd7c21840ca2526b562ad25e980c53db65e908 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-BUNDLE-MANIFEST-JSON | bundle_manifest | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/bundle-manifest.json | INFORMATIVE | efbaca098cc902718561fd3ed2fdb1ccb7fbff81e2f632ae36eb02c078338cdf |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-CONTAINER-ARCHITECTURE-DOT | diagram_source | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/container_architecture.dot | PROPOSED | 09797fbe59d76706b5ccbc66a8184852b3228af03934dc9186727fb452fc66cd |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-CONTAINER-ARCHITECTURE-PNG | diagram_rendering | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/container_architecture.png | INFORMATIVE | 1754f8cf37e869e97ad986af6643121b721085e506f7bafed7c61850e170fa47 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-EVIDENCE-STATE-DOT | diagram_source | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/evidence_state.dot | PROPOSED | 6b38bf0e6de5f7e50b191edbf519ae9f38b64ffc9eee29f9fae084032644fe19 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-EVIDENCE-STATE-PNG | diagram_rendering | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/evidence_state.png | INFORMATIVE | 6607e8f7065139e956b4ceb90c293f177e966c9998505ad41f3cb22685327460 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-RELEASE-FACTORY-DOT | diagram_source | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/release_factory.dot | PROPOSED | fbc59f5205af87c8ec99e37d19276b235872c0eaa8c9cf89eb64133fd6822262 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-RELEASE-FACTORY-PNG | diagram_rendering | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/release_factory.png | INFORMATIVE | 40bf9a1b014091680d38896bd55f09a16e845b0115c5db31e6630aa0b752df61 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-SCIENTIFIC-PIPELINE-DOT | diagram_source | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/scientific_pipeline.dot | PROPOSED | 71fc498bb93c3e37f59e5fbba9de7824c260de7b78c9ff724be5157bc4a4c8ce |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-SCIENTIFIC-PIPELINE-PNG | diagram_rendering | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/scientific_pipeline.png | INFORMATIVE | 470984d7aca0cd0d9a369a8acb67f2b9a8d7bb9a86125371ac3b482d066f277f |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-SYSTEM-CONTEXT-DOT | diagram_source | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/system_context.dot | PROPOSED | 233eab6e5b5e0364dfb563147ba49aa1fdb1b3caa1b5157fb23b60f460cbf43f |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-DIAGRAMS-SYSTEM-CONTEXT-PNG | diagram_rendering | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/diagrams/system_context.png | INFORMATIVE | b2d4c22c0dd96267d47217e55f0745e04aa011e9df5618dc62c3452b4aac2d21 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-QUALITY-SAL-MEF-ADR-0-1-A11Y-JSON | implementation_evidence | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/quality/SAL-MEF-ADR-0.1.a11y.json | IMPLEMENTATION_EVIDENCE | 65191395c99aa992f6d3f6413b79f58a039aad2dd670654db3a6d130b421cb06 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-QUALITY-SAL-MEF-SDD-0-1-A11Y-JSON | implementation_evidence | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/quality/SAL-MEF-SDD-0.1.a11y.json | IMPLEMENTATION_EVIDENCE | 893377c67c6ead00c95b61cb457f6686b900d39aaa900ac0ca050aa53ee175a1 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-QUALITY-SAL-MEF-TDD-0-1-A11Y-JSON | implementation_evidence | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/quality/SAL-MEF-TDD-0.1.a11y.json | IMPLEMENTATION_EVIDENCE | 1b133b12c519222d0a64a7d2f4881599876566a17acdd2e131817b574181e764 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-README-MD | readme | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/README.md | INFORMATIVE | 6107054afd017e83f191146f34e3305b1b288152979435cab67203a212b4f24f |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-ADR-0-1-DOCX | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-ADR-0.1.docx | INFORMATIVE | 3801e9176e4643a2222cf5cfbc324dac55e459128b5f17d9d5b4d86bdc390b60 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-ADR-0-1-MD | adr_compendium | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-ADR-0.1.md | PROPOSED | 9ba4a29b846ac8475f6350baed98628f87a314287bb2e8fb0664c4d90011e6c0 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-ADR-0-1-PDF | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-ADR-0.1.pdf | INFORMATIVE | ccd5effd6bfd2f45a7f98c37f43ed173b48712e627cb8dd44dbac99d32be3e45 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-SDD-0-1-DOCX | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-SDD-0.1.docx | INFORMATIVE | 037ddad214ca7ebd685ad008815ca50dab916c60b3757625321aec2d31e29230 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-SDD-0-1-MD | sdd | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-SDD-0.1.md | PROPOSED | 36bec94a52993e19a42d9844cbeb2b32dca1a4e7601a0391532e3f73f8f86793 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-SDD-0-1-PDF | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-SDD-0.1.pdf | INFORMATIVE | ad5723b3f5853cd385dd26c4fcb4156446fb6e953cf205c21adcb9617d702874 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-TDD-0-1-DOCX | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-TDD-0.1.docx | INFORMATIVE | 784f882f3ef6c0053b725ab6daf5c5319692be376fe4c4161ac7380707281a41 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-TDD-0-1-MD | tdd | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-TDD-0.1.md | PROPOSED | 61ca2d6915f01f10d324f9f078897fb81389636fe24a1e3f362322de5675b237 |
| MEF-ARCH-SPORTSAGENTSLAB-MEF-ARCHITECTURE-BUNDLE-2026-08-03-SAL-MEF-TDD-0-1-PDF | document_representation | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03.zip | SportsAgentsLab_MEF_Architecture_Bundle_2026-08-03/SAL-MEF-TDD-0.1.pdf | INFORMATIVE | 5d735aec3a212dd20079babedba9ea5406df498c7678e49e52891b5fee62c7c6 |

## Status counts

- NORMATIVE: 15
- INFORMATIVE: 39
- PROPOSED: 14
- SUPERSEDED: 0
- IMPLEMENTATION_EVIDENCE: 4
- REJECTED: 0

No physical source artifact is classified SUPERSEDED. The UX freeze records superseded concepts inside the frozen record; no older design file was present in any source bundle.

## Frozen product and scientific boundary

- Umbrella system: SportsAgentsLab.
- First independent product: Measurement Evidence Factory Agent.
- Functional short name: MEF Agent.
- Domain: sports-performance measurement.
- Population: athletes; the architecture baseline’s narrower trained adult field/court-sport validation cohort is a validation scope, not a new product identity.
- Patient/clinical diagnosis: out of scope.
- Initial instrument: force plate.
- Initial assessment: bilateral, unloaded, hands-on-hips countermovement jump.
- Initial data path: supported native force-plate export.
- Scientific requirement: qualified vertical ground-reaction-force acquisition/configuration with explicit channels, timing, calibration, synchronization, and preprocessing semantics.
- Processing boundary: deterministic measurement processing is separate from statistical inference and from agent behavior.
- Practitioner authority: qualified human practitioner retains final interpretation and consequential disposition.
- Unknown semantics: unknown is distinct from confirmed true or false; missing or conflicting acquisition semantics fail closed for qualified processing.
- Override semantics: an override creates attributed new decision evidence and never destroys original system output.

The Engineering Control Plane at <LOCAL_PATH_REDACTED> is development infrastructure only. It is not the MEF product, MEF runtime architecture, product memory, or product authority.

## UX authority summary

The frozen UX identity is SAL-MEF-UXD v0.3.0, with a desktop-first longitudinal measurement workstation, persistent MEF Agent dock, overview-centered navigation, Tests and Metric Explorer, Force Plates & Imports, Evidence, Reports from accepted evidence only, restricted Protocols & References, and Settings. Routes and state semantics are closed by the UX contracts and schemas. Unsupported, unresolved, insufficient, review-required, non-comparable, inference-failed, and practitioner-override states are explicit. Keyboard access, visible focus, semantic structure, color-independent state communication, and accessible agent history are required. Exact pixel dimensions, final typography/colors, animation, mobile-native UX, future device families, and final assistant brand name are not frozen.

## Architecture authority summary

The architecture baseline separates control/practitioner, scientific, evidence, agent, data, security, and validation boundaries. The SDD defines native-export-first ingestion, immutable source artifacts, configuration-specific qualification, a small closed metric pack, deterministic processing, uncertainty/practical-importance separation, evidence authority, provenance, and practitioner decisions. The TDD provides proposed component/data/service topology and a staged implementation sequence; it is registered as PROPOSED because it explicitly withholds implementation authority and ML-94 controls repository/package topology. The architecture diagram set independently confirms the system context, scientific pipeline, release factory, evidence state, and container boundary relationships.

## Implementation doctrine

The active doctrine is: CONTRACT -> FIXTURES / EXPECTED OUTPUTS -> SCIENTIFIC OR BACKEND IMPLEMENTATION -> TYPED APPLICATION BOUNDARY -> CORRESPONDING UX -> PRODUCT AGENT THROUGH AUTHORIZED TOOLS -> DETERMINISTIC / SCIENTIFIC / UX / ACCESSIBILITY / SAFETY / EVIDENCE TESTS -> FREEZE / RELOCK. No implementation is started by ML-93.

## Roadmap boundary

The B00-B09 dependency lock is the program roadmap for this handoff. B00 is the only active block. B01 and later remain deferred; ML-94 owns monorepo/package topology and all later implementation decisions.

## Change control

Authority change fields and founder approval gates are frozen in MEF_CHANGE_CONTROL.md. No later implementation issue may silently alter product identity, initial scope, forbidden claims, scientific contract, architecture boundary, UX freeze, roadmap dependency, or practitioner authority.

## Verification and limitations

The source bundle and internal-file hash evidence is complete. The source documents retain intentionally open qualification questions such as exact first vendor surfaces, sample-rate set, event thresholds/filter policy, inference runtime, hosting/workflow profile, registry trust model, SESOI governance, and C3D timing. These are explicitly open design decisions, not silently resolved by ML-93. They do not block the B00 authority register, but they block claims of scientific qualification or product implementation readiness.

See ML93_CONFLICT_REGISTER.md for every reconciled disagreement and remaining uncertainty.
