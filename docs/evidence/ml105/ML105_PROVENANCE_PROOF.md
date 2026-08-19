# ML-105 Provenance Proof

Resolution provenance is bounded to accepted lineage:

- the canonical acquisition must reference its source artifact and manifest;
- a supplied ML-103 observation must match the source artifact and observation identity;
- source, observation, canonical, and optional evidence-manifest identities are copied into the nested resolution;
- evidence references are locators, not raw signal payloads; and
- the deterministic `resolution_sha256` includes semantic inputs and evidence-manifest identity but excludes `createdAt`.

The persistence layer repeats the semantic identity and resolution hash, enforces the ML-102/103/104 foreign keys, and uses the canonical identity plus resolver/authority versions for insert-or-get idempotency. A repeated semantic resolution returns the existing record rather than creating a mutable replacement.
