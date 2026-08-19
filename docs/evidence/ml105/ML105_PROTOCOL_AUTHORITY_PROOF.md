# ML-105 Protocol Authority Proof

Protocol authority is an optional input to the configuration resolver. When supplied, it must contain a non-empty version and an explicit status. The resolver records `NOT_EVALUATED`, `UNRESOLVED`, `ELIGIBLE`, or `INELIGIBLE` as declared; it does not invent protocol requirements or convert a device or marketing name into authority.

An unresolved protocol status is preserved as an unresolved finding and cannot be presented as qualification. An invalid authority object is rejected at the trust boundary. The authority version used by the implementation is `ML-105-CONFIGURATION-AUTHORITY-0.1`.

Conformance evidence:

- `preserves unresolved protocol authority`: unresolved status remains unresolved.
- `rejects malformed protocol authority`: an empty version or invalid status is rejected.
