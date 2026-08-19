# ML-105 Configuration Contract Evidence

The generated contract is the optional `resolution` member of the existing `ConfigurationContract`. It contains:

- resolver and authority versions;
- source artifact, source observation, canonical acquisition, canonical identity, and optional evidence-manifest hashes;
- `configuration_state`;
- `physical_contract` and its state;
- channel capabilities with explicit physical quantity, axis, sign, plate identity, sample count, and evidence references;
- sample-rate, synchronization, axis/sign, preprocessing, calibration, zeroing, and protocol-eligibility resolutions;
- bounded findings and evidence references; and
- deterministic `resolution_sha256`.

The schema has no raw bytes, signal arrays, row records, CMJ fields, biomechanics fields, or science-result fields. Generation was checked with `GENERATED_MODELS=IN_SYNC`, contract tests passed, and the runtime validator accepts the positive resolver fixtures and rejects malformed inputs.

Physical contract vocabulary is intentionally generic: `single.total_fz` and `dual.independent_fz`. Unknown and unsupported contracts remain explicit rather than being converted to a vendor-specific label.
