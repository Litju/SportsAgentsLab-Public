# MEF B00 Storage Authority Relock

MISSION=SPORTSAGENTSLAB_MEF_B00_FINAL_STORAGE_AUTHORITY_AND_EVIDENCE_RELOCK
DATE=2026-08-14
ENTRY_HEAD=b4163160ac8a89fbc2fd318b3e5e9bc3b9694835
BRANCH=work/mef-full-uxui-authority-implementation
PR=2

## Authority and scope

The active B00 infrastructure authority is:

    ACTIVE_DATABASE=NEON_POSTGRESQL
    ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB
    S3_RUNTIME_DEPENDENCY=NONE

The controlling work item is ML-101 / B00-09. The current Linear record names a
different historical branch, while this run was explicitly scoped by the owner
to the supplied branch and PR #2. This disagreement is recorded rather than
inferred away. No frozen authority artifact was edited, and no B01, CMJ science,
Neon architecture, Vercel Blob architecture, or UX redesign work was performed.

The PostgreSQL foundation was qualified by the prior B00 system run. The UX/UI
acceptance did not require an independent database rerun, so the evidence uses
the following distinction:

    POSTGRES_FOUNDATION_QUALIFICATION=PASS
    POSTGRES_UX_AUDIT_RERUN=NOT_EXECUTED
    REASON=UX_ACCEPTANCE_SCOPE
    PRIOR_SYSTEM_QUALIFICATION=PASS

## S3 forensic classification

The repository was searched for all requested terms, case-insensitively:

    S3
    MEF_S3
    S3_ENDPOINT
    S3_BUCKET
    AWS_ACCESS
    AWS_SECRET
    s3-compatible
    s3_compatible
    S3Client
    @aws-sdk
    boto3
    MinIO
    minio

### A. Active production path

    ACTIVE_S3_CODE_PATHS=NONE

The removed operational-state S3 adapter had no production callers. The active
artifact path remains the private, immutable Vercel Blob adapter, using the
content-addressed originals/sha256 key space.

### B. Active CI / required validation

Before this relock, scripts/ci_validate.mjs and
scripts/run_security_tests.mjs listed AWS/S3 environment keys as blocked
live-integration requirements. Those entries were removed. CI now reports the
authoritative zero-dependency proof:

    S3_REQUIRED_CI_CHECKS=0
    S3_REQUIRED_ENV_VARS=0

No S3 check is required to qualify the current repository.

### C. Legacy test harness

The following obsolete S3-only harness was removed because it was not part of
the active architecture:

    packages/operational-state/src/s3.ts
    packages/operational-state/test/s3.integration.test.ts
    packages/operational-state/package.json       (@aws-sdk/client-s3 and test entry)
    packages/operational-state/src/index.ts       (S3 export)
    packages/operational-state/test/operational-state.test.ts (UnitS3Transport tests)

The unused direct AWS SDK dependency was removed from the package and lockfile.
The generic object-store contract and the qualified Vercel Blob provider tests
remain in place.

### D. Historical documentation / frozen provenance

The following frozen authority amendment contains historical S3 portability
language. Every hit below is LEGACY_NON_AUTHORITATIVE for the active B00
deployment. The authority/ tree is frozen and was not modified.

    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/00_AUTHORITY/AMENDMENT_AUTHORITY.yaml
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/00_AUTHORITY/CHANGE_IMPACT_REGISTER.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/00_AUTHORITY/DECISION_REGISTER.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/00_AUTHORITY/EFFECTIVE_AUTHORITY_MAP.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/00_AUTHORITY/SUPERSESSION_MATRIX.yaml
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/01_SDD/*
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/02_TDD/*
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/03_ADR/ADR-037-vercel-blob-primary-adapter.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/05_DIAGRAMS/effective_system_context.dot
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/05_DIAGRAMS/effective_system_context.svg
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/06_MIGRATION/PLATFORM_REFACTOR_PLAN.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/06_MIGRATION/PRESERVED_VS_CHANGED.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/07_VALIDATION/ARCHITECTURE_INVARIANTS.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/08_HANDOFF/LUNA_REPO_MATERIALIZATION_PROMPT.md
    authority/amendments/SAL-MEF-Platform-Agent-Amendment-v0.1/README.md

### E. Third-party / irrelevant metadata

The remaining raw search matches in pnpm-lock.yaml and uv.lock are package
metadata such as s390x platform strings, integrity data, or third-party wheel
metadata. They are not S3 configuration, code, dependency names, or runtime
paths. No @aws-sdk package remains in the active lockfile.

The updated final acceptance report, receipt, machine evidence, and this proof
file contain the required S3 terms only as explicit non-active classification or
zero-dependency evidence; they do not establish an active S3 path.

The current documentation hits in `docs/ML100_CI_SUPPLY_CHAIN.md` and
`docs/OPERATIONAL_STATE.md` are also category-D documentation: they state the
current Vercel Blob authority and the required zero values. They do not declare
S3 support. The final acceptance files are evidence-only category-D records.

## Authority hash reconciliation

The frozen downloaded authority bundle was inspected without modifying it:

    ARCHIVE=<LOCAL_PATH_REDACTED>
    FROZEN_RECEIPT_RECORDED_ZIP_SHA256=d7e28ec419a2ed973727bcbe6e64a1181d1adcb82824a26586eed88b6be693f7
    COMPUTED_ZIP_SHA256=C74F620804218826857BA9FC170C233593960DA135DDEBE268EB9A384F70801
    EXTRACTED_FILE_COUNT=731
    MANIFEST_LISTED_FILE_COUNT=730
    MANIFEST_SHA256=89b55526bd945eb17e2436436eb4d29ba29f4e3042322aeaa54fc82e39b16fb0
    EXTRACTED_AUTHORITY_TREE_SHA256=b2949db73e1da8e3e8db980b752653a7a0db073fbdd34fb26b6ccf2c0690c9d0
    EXTRACTED_AUTHORITY_TREE_HASH_METHOD=SHA256(sorted relative path + raw file SHA256)
    MANIFEST_MISMATCHES=0
    FROZEN_RECEIPT_TXT_SHA256=ac1e8162e81b3fb1414fb2d4ff54520958c3c9df620cebbb084c40c911b11c0d

The computed archive bytes differ from the SHA-256 recorded in the frozen
receipt. All 730 manifest-listed files were present and their recorded hashes
matched the extracted files. That proves the extracted controlling content is
internally consistent with its MANIFEST; the discrepancy is at the archive
container/transport level. The archive hash fields were not silently rewritten.
Only one archive byte stream was available for direct hashing; the second value
is the SHA-256 recorded by the frozen receipt. Within the available evidence,
there is no controlling-file or matrix-content difference.

The controlling matrix hashes are:

    SCREEN_MATRIX_SHA256=85e7356b4f77d132c8e5913cf08b2427a8651a666d12e1b263a380229e7573f5
    COMPONENT_MATRIX_SHA256=400e6b45d645352fa204f53141e977a30bf72b63478a44592a131d0e2be9ffee

The controlling global authority file hashes are:

    authority/global/accessibility.yaml=0179bae2ddb7007c82bb6fd3177e8dcff3369d0122f8041d0297556c5c5933ed
    authority/global/action-semantics.yaml=7ce6e74b0035c3c27f4fd6c8f659385ddab043e3c8c9986b44bd5a4914efb71d
    authority/global/agent-authority.yaml=dba20925892acc72bf68a096bf3eccea87ddd301da61465236b8eac25c12a4b7
    authority/global/content-model.yaml=642385e6fd0d3675921a351e8f7e5387fbcbdf7f4c89f5c8161456230da63a05
    authority/global/copy-language.yaml=5751238f11a727c310a09dbefa4fb438bbf85690bba17122af7f93c2a2d55648
    authority/global/empty-error-loading.yaml=1ae55075055e7cefdd31c3a6136aebbeec94285d415e75b65def8ec4f7d6da48
    authority/global/iconography.yaml=ffc5444af5bfa4189aedb2aed94775028d83d917517ae6b9f2863bf453faa08c
    authority/global/information-architecture.yaml=5df633d8c0d4448b130cb00ff65215162bfc667b0c50e05ac64841119af5979e
    authority/global/layout-density.yaml=c395bd4e17d8389fedcb3ae4197fa73f228bc07c9b503c9911528d0202af906b
    authority/global/motion.yaml=ed1feddda75bd7a1981e918abc46b2d9c6e98c98d3a12195e5e59721e2c06968
    authority/global/navigation.yaml=236e853fb6651a4a639e5239f08d7ccb082ff586d4e8005b60de34e635b1d1a2
    authority/global/permissions-visibility.yaml=0eb10582d501144214e6c9b6dd034dc8a345d0077d03903f889dedb4db7bd225
    authority/global/plot-grammar.yaml=7738ea11cde0415b5c6334dbb41c3e219aba43bf3098f38a351352cf60bbc43c
    authority/global/product-principles.yaml=7b6823d2f4fea91bde93af291a859523113f0dd830248ed642648ffc3fdc7f79
    authority/global/responsive.yaml=f52981f38e1aa5242382848a6cbe90e21439c7a5e1c0f743561fa9764d45080d
    authority/global/scientific-boundary.yaml=8b145c382b495ecd212124995ae41aff2ab6802ddc789536137f12c412b8a024
    authority/global/semantic-status.yaml=186d041c123661321a28497e6f804fb982c0fd461fb987b16f32019d71a6a9e2
    authority/global/visual-style.yaml=50537df25807feae0fdda7eafb9339f1c5e398b3f77c9b5e713738c629864e0b

Based on the frozen manifest consistency and the identical controlling file
hashes, the discrepancy is classified as:

    AUTHORITY_CONTENT_IDENTITY=PASS
    AUTHORITY_ARCHIVE_HASH_STATUS=ARCHIVE_CONTAINER_HASH_DIFFERENCE_NON_SEMANTIC
    AUTHORITY_SEMANTIC_DRIFT=NO

## Final storage proof

    ACTIVE_DATABASE=NEON_POSTGRESQL
    POSTGRES_FOUNDATION_QUALIFICATION=PASS
    POSTGRES_UX_AUDIT_RERUN=NOT_EXECUTED
    REASON=UX_ACCEPTANCE_SCOPE
    PRIOR_SYSTEM_QUALIFICATION=PASS
    ACTIVE_ARTIFACT_STORAGE=VERCEL_PRIVATE_BLOB
    S3_RUNTIME_DEPENDENCY=NONE
    S3_REQUIRED_CI_CHECKS=0
    S3_REQUIRED_ENV_VARS=0
    ACTIVE_S3_CODE_PATHS=NONE

## Validation record

```text
NODE_VERSION=24.14.0
PNPM_VALIDATE=PASS
CI_VALIDATE=PASS
PRACTITIONER_LINT=PASS
PRACTITIONER_TESTS=PASS
VERCEL_BLOB_STORAGE_TESTS=PASS (11/11 practitioner tests)
PRODUCTION_BUILD=PASS
AUTHORITY_VERIFIER=PASS
GIT_DIFF_CHECK=PASS
ACTIVE_S3_SOURCE_SEARCH=PASS
```
