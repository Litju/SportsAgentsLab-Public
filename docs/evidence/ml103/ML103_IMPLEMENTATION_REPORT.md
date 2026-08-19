# ML-103 Implementation Report

## Authority

- Issue: `ML-103`, In Progress in Linear.
- Branch: `work/ml103-b01-ingestion-adk-v01`.
- Accepted main head: `db6aed6162eb5ef5437b1ba8351f7d8ba59e59db`.
- Qualified ML-102 evidence commit: `115e27bc42bec34ad92e79c68208d60ff3b96f2f`.
- Authority transition commit: `e35a443 chore(mef): authorize ML-103 ingestion ADK gate`.
- Successor authority: `authority/MEF_BLOCK_DEPENDENCY_LOCK_B01_ML103.yaml` and `authority/MEF_B01_ML103_AUTHORITY_ACTIVATION.yaml`.

## Local qualification

`pnpm validate` passed, including generated-model drift, typecheck, architecture, contract, compatibility, TypeScript, smoke, and all workspace package tests.

The ADK test corpus covers valid/current, copy, changed values, reordered columns, extra unknown fields, missing required fields, duplicate headers, invalid encoding, wrong delimiter, malformed metadata, unsupported version, conflicting declarations, large streaming input, and truncation/budget behavior. The operational-state migration and embedded hosted migration both verify SHA-256 checksum equality.

## Deliberate qualification limit

Local PostgreSQL integration tests remain skipped by their existing guard because the repository test environment does not configure `MEF_DATABASE_URL`. This does not limit the hosted qualification below.

## Hosted Preview qualification

- Vercel Preview deployment: `sportsagentslab-6fi05i6d6-julitocrztuga-2084s-projects.vercel.app` (`Ready`).
- Neon isolation: project `lively-surf-68186530`, branch `br-quiet-hat-axeu8awm`, named `preview/work/ml103-b01-ingestion-adk-v01`; production was not modified.
- The real authenticated path passed bootstrap, import creation, private Blob client-token upload, server finalization to `READY_FOR_ADAPTER`, `POST /inspect` with `OBSERVATION_RECORDED`, GET replay, and a repeat inspect with `OBSERVATION_REUSED`.
- The reference adapter result was `mef.reference.source-v1`, adapter/API `0.1.0`, qualification `reference`. The fixture SHA-256 was `b393e9a6987d7255973c3811fc4fdc51ae7cab471f46d503b92c024fd37615d3`; the observation SHA-256 was `8b71fca4a8f62a85108c2df70b468ebc703fb107d8a3e56531ebd4d9fb8ebe7f`.
- The target database contained one reference observation for the verification tenant and zero observation documents with `rows` or `records` keys. No vendor adapter or biomechanics claim was introduced.
