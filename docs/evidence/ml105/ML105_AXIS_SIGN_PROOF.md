# ML-105 Axis and Sign Proof

Axis and sign are authoritative only when already known in the accepted canonical acquisition or an explicit metadata declaration. The resolver does not assume `Z` is vertical, does not assume positive is upward, and does not infer semantics from a channel label.

Conflicting authoritative axis/sign declarations produce `CONFLICTING_METADATA`. Missing or unknown semantics remain `UNKNOWN` and prevent a qualified physical contract. The resolution records the chosen value, its source, and the evidence locator when known.

Conformance evidence:

- `does not default unknown rate or axis`: missing axis/sign remains unknown.
- `detects conflicting authoritative axis declarations`: conflicting declarations produce a conflict state.
- `resolves dual.independent_fz only with explicit sync and plate identities`: both channels require known vertical-axis/sign semantics.
