# ML-104 Replay and Determinism Proof

Determinism is enforced by:

- recursively sorted canonical JSON for manifests, reports, identity payloads, and acquisitions;
- fixed channel order from the mapping manifest;
- fixed `MEF_CANONICAL_SIGNAL_NDJSON_V0_1` encoding;
- explicit source record indices and no resampling or filtering; and
- identity inputs consisting of source artifact hash, source observation hash, canonicalizer version, mapping hash, signal hash, and integrity-report hash.

The deterministic test runs the same source twice and asserts equal canonical identity, signal hash, and canonical acquisition JSON. Persistence replay comparison excludes only storage creation timestamps (`createdAt` and `created_at`); all semantic identity, lineage, signal, report, mapping, and storage-key fields remain comparable. A concurrent duplicate therefore reuses the existing canonical row or fails closed on a semantic mismatch.
