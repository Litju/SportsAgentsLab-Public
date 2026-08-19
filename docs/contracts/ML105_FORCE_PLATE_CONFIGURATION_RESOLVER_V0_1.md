# ML-105 Force-Plate Configuration Resolver v0.1

## Authority

- Issue: `ML-105`.
- Authority: `ML-105-CONFIGURATION-AUTHORITY-0.1`.
- Scope: physical acquisition configuration and sample-rate resolution only.
- Inputs are an accepted ML-104 `CanonicalAcquisition`, optional stored ML-103 structural observation evidence, explicit metadata declarations, and optional protocol-authority status.
- The resolver does not read raw bytes, reparse source files, canonicalize records, infer a vendor contract from a marketing label, or make a scientific/biomechanics decision.

## Physical contracts

| Contract | Meaning | Minimum authoritative evidence |
|---|---|---|
| `single.total_fz` | One explicit force channel representing total vertical force | One canonical force channel; qualified channel/unit/vertical-axis/sign/sample-time semantics; resolved sample rate |
| `dual.independent_fz` | Two independent force channels | Two explicit force channels; distinct known plate identities; qualified channel semantics; resolved sample rate; explicit synchronization |

More than two force channels are `UNSUPPORTED`. A producer or device name never supplies physical-quantity authority.

## Resolution states

- `RESOLVED_QUALIFIED`: the contract is resolved and the accepted acquisition/integrity state is qualified.
- `RESOLVED_UNQUALIFIED`: the contract is resolved but the accepted acquisition is not qualified, or the explicit dual-channel synchronization is unsupported.
- `PARTIALLY_RESOLVED`: some configuration facts are known but the contract is not ready.
- `CONFLICTING_METADATA`: authoritative declarations disagree.
- `UNRESOLVED`: no explicit force channel is available.

Unknown, unresolved, conflicting, and unsupported values are preserved in the nested resolution contract. The result includes evidence locators, source/observation/canonical identities, resolver and authority versions, and a deterministic `resolution_sha256` that excludes creation time.

## Persistence and API surface

`mef_ml105_configuration_resolutions` is tenant-scoped, append-only, forced-RLS, foreign-keyed to ML-102/103/104 records, and idempotent on canonical identity plus resolver/authority versions. The minimal API is:

- `POST /api/imports/{import_attempt_id}/resolve-configuration`
- `GET /api/imports/{import_attempt_id}/configuration-resolution`

No raw signal rows or byte payloads are stored by ML-105.
