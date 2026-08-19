# ML-104 Canonical Acquisition v0.1

## Authority

- Issue: `ML-104`.
- Branch: `work/ml104-b01-canonical-acquisition-v01`.
- Accepted predecessor/base: `a9c581d6d1722205c5126bafbd0908f828f29a24` (merged ML-103).
- Authority activation: `b502fdf3aeb441f600b7547383543730d2178bd8`.
- Implementation: `256d45015c39539fc25250bf5a2742d3841cc217`.
- Scope: `CANONICAL_ACQUISITION_V0_1_PLUS_SYNTHETIC_INTEGRITY_CONFORMANCE`.

## Purpose

ML-104 converts an accepted ML-103 structural observation plus its streamed source records into a vendor-neutral `CanonicalAcquisition`. It records explicit mapping, lineage, transformation, timebase, integrity, and derived-artifact identity without interpreting the measurement scientifically.

## Required behavior

- Source lineage must match the accepted artifact and observation identifiers and hashes.
- Every canonical channel has an explicit source field and mapping manifest entry.
- The only conversion registry entries are `s -> s`, `ms -> s`, `N -> N`, and `kN -> N`; unit changes require an explicit `UNIT_CONVERSION` transformation with the registry-derived scale.
- Axis, sign, quantity, and unit declarations are explicit. Unknown, conflicting, or incompatible declarations fail closed.
- The canonicalizer does not guess sample rate, resample, filter, smooth, interpolate, calibrate, or resolve configuration.
- `configuration_resolution` is always `NOT_EVALUATED`.
- Records are consumed as `AsyncIterable<ObservedRecordBatch>`; canonical signal output is deterministic NDJSON and is not stored in Postgres.
- Canonical identity is derived from source artifact, source observation, canonicalizer, mapping, signal, and integrity-report hashes.

## Integrity contract

`CanonicalIntegrityReport` contains findings and deterministic checks. Check statuses are `PASS`, `WARN`, `FAIL`, or `NOT_EVALUATED`. The implementation covers missing/unresolved/mismatched mappings, unit and axis declaration states, unresolved timebase, duplicate and nonmonotonic timestamps, irregular intervals, missing or duplicate source indices, missing and non-finite values, expected-count mismatch, explicit range violations, no records, and extra fields.

## Persistence boundary

- Metadata and integrity findings are appended to `mef_ml104_canonical_acquisitions`.
- The derived signal is private, immutable, and content-addressed under `canonical/sha256/<signal_hash>` in Vercel Blob.
- Tenant scope is `(organization_id, workspace_id)` and is enforced by forced RLS.
- No S3 runtime dependency, vendor adapter, configuration resolver, scientific metric, trial QA, or downstream block is introduced.
