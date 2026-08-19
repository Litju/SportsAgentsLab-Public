# ML-100 CI and supply-chain gates

The merge-blocking workflow is .github/workflows/quality.yml. Its stable
required status check is "MEF Quality Gate"; branch protection is intentionally
not changed by ML-100.

## Toolchain and installation

- Node.js "24.14.0" is pinned by .nvmrc, .node-version, the root engine, and
  the workflow.
- pnpm "9.15.4" is pinned by packageManager and the workflow.
- Python "3.12.6" is pinned by .python-version, requires-python, and the
  workflow.
- uv "0.10.1" is pinned by the workflow.
- Node uses "pnpm install --frozen-lockfile --ignore-scripts".
- Python uses "uv sync --all-packages --locked".

"pnpm ci:validate" is the canonical local/CI entrypoint. It records every gate
in artifacts/ci/gate-results.json and fails the CI job if any mandatory gate
fails. Local execution may report PASS_WITH_LIMITATIONS when no PostgreSQL
connection or Node 24 runner is available; CI treats both as mandatory.

## Security policy

"pnpm test:security" runs the practitioner/control API security tests, the
repository's seven deterministic Eve eval definitions through the in-process
Eve mock-model harness, Better Auth migration validation, and the explicit
two-tenant RLS suite when PostgreSQL is configured. The canonical gate runs
the operational PostgreSQL integration suite in its package-test stage before
this security suite. The CI harness
does not start an Eve development server, call Vercel, or create a Preview or
production deployment. It removes model and Blob credentials from child
processes. No paid OpenCode inference is required. Vercel Private Blob is the
only active artifact-storage backend; S3 is not a runtime or CI dependency.

detect-secrets scans tracked text, the relevant Git diff, and bounded generated
artifacts. Verified findings and high-confidence credential detector findings
fail the gate. Unverified high-entropy findings are recorded without printing
values; there is no broad suppression baseline.

"pnpm audit --audit-level=high" fails unresolved high or critical Node
advisories. pip-audit scans the locked Python workspace; any known Python
vulnerability fails because its JSON output does not provide a portable
severity field for a narrower disposition.

## Evidence

The workflow uploads only artifacts/ci/ for seven days. It contains the
CycloneDX JSON SBOM, scanner summaries, test/gate results, a bounded build
provenance statement, an evidence receipt, and SHA256SUMS. The receipt binds
the candidate source commit/ref (using explicit pull-request head metadata
rather than the temporary merge ref), toolchain, both lockfile hashes, authority and
architecture verdicts, test/build verdicts, SBOM hash, and provenance hash.
It never contains secret values, database URLs, cookies, model keys, Blob
credentials, or real data.

## PostgreSQL qualification

GitHub Actions starts a synthetic PostgreSQL 16.4 service pinned to image
index digest
sha256:e62fbf9d3e2b49816a32c400ed2dba83e3b361e6833e624024309c35d334b412.
The setup creates a migration role and a separate NOSUPERUSER, NOBYPASSRLS
runtime role. Operational migrations 001, 002, and 003, followed by Better
Auth migration, run with the migration role. Runtime grants exclude
migration-history mutation. The CI RLS script proves forced RLS, principal
boundaries, cross-tenant read isolation, and cross-tenant write rejection
using synthetic tenants only.
