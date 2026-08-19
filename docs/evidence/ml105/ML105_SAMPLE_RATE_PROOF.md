# ML-105 Sample-Rate Proof

Sample rate is resolved only from authoritative evidence already present at the boundary:

1. explicit source/metadata declarations (`sample_rate`, `sample_rate_hz`, `sampling_rate`, and bounded namespaced variants);
2. an explicit canonical `timebase.sample_rate_hz`; or
3. a positive exact uniform canonical sample interval, using `1 / interval_seconds`.

The resolver applies no default rate, no marketing-label rule, and no invented threshold. Non-finite, zero, negative, conflicting, or malformed declarations become findings and are not silently repaired. If the rate is absent or the interval is irregular, the state is `UNKNOWN`.

Conformance evidence:

- `resolves single.total_fz from canonical channel and exact interval`: resolves `0.01 s` to `100 Hz`.
- `does not default unknown rate or axis`: preserves unknown rate.
- `fails closed on conflicting explicit sample rates`: returns `CONFLICTING` and `CONFLICTING_METADATA`.
- `preserves declared preprocessing and ignores dimension labels`: unrelated labels do not become rate authority.
