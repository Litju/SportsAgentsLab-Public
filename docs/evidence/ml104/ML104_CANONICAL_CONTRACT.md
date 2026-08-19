# ML-104 Canonical Contract

The canonical record is `CanonicalAcquisition` with schema version `1.0.0`. Its required identity fields are:

- source artifact ID and SHA-256;
- source observation ID and SHA-256;
- canonicalizer version;
- mapping manifest SHA-256;
- signal artifact SHA-256 and private storage key;
- integrity report SHA-256; and
- canonical identity SHA-256.

The report includes deterministic findings plus check statuses. The result envelope exposes `COMPLETE`, `PARTIAL`, `BLOCKED`, or `FAILED`; a returned `CanonicalAcquisition` is never treated as scientifically interpreted data. Source mappings retain the source label, mapping state, evidence references, and transformation (`IDENTITY`, `UNIT_CONVERSION`, `SIGN_FLIP`, or `LINEAR_SCALE`).

The generated TypeScript/Python/OpenAPI surfaces and positive fixture were regenerated from `packages/contracts/schemas/domain-contracts.schema.json`. `pnpm generate:check` and the contract runtime suite passed.
