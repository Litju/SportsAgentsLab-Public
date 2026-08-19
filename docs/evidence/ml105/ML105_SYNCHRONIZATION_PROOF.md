# ML-105 Synchronization Proof

Synchronization is resolved only by explicit synchronization metadata or an explicit canonical common-clock/common-timebase value. Equal sample counts are recorded as a warning and never treated as synchronization evidence.

For `dual.independent_fz`, both force channels additionally require distinct known plate identities. Explicit unsynchronization leaves the dual physical contract `UNSUPPORTED` and the overall state `RESOLVED_UNQUALIFIED`; missing synchronization leaves the result partially resolved.

Conformance evidence:

- `does not infer synchronization from equal sample counts`: equal counts remain `UNKNOWN`.
- `resolves dual.independent_fz only with explicit sync and plate identities`: explicit sync plus distinct identities resolves the contract.
- `keeps explicit unsynchronization unsupported for a dual contract`: explicit `unsynchronized` is preserved and not overridden.
