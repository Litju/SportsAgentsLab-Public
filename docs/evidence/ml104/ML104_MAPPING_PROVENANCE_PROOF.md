# ML-104 Mapping and Provenance Proof

Reference mapping:

- File: `packages/ingestion-adk/fixtures/canonical-reference-mapping.json`.
- Manifest ID: `map_ml104_reference_v01`.
- Version: `0.1.0`.
- Evidence manifest ID: `evm_ml104_reference_mapping`.
- Raw file SHA-256: `7dffd92e21f540cf72dbbda6e6276d9ab44f0ac8d5e86f5c5b5b4e15f7ddd5e4`.
- Canonical manifest SHA-256 used in identity: `fa2986465fe197d6317977965fa6f25a665a679d30589f8ed025f33fe6cd6585`.

Mapped channels are `time -> channel_time` and `force_z -> channel_force_z`. The manifest explicitly declares source/canonical quantities, units, axes, sign, scale, offset, transformation kind, and timebase. Producer-derived and user-entered fields are explicitly ignored; no unmapped field is promoted into a canonical channel.

Each mapping evidence reference carries the mapping evidence-manifest ID, the canonical-acquisition component, a source locator, and the source artifact SHA-256. The acquisition manifest separately carries source artifact/observation hashes, adapter identity, mapping ID, mapping hash, and evidence references. No default field name, unit, axis, sign, or sample rate is inferred.
