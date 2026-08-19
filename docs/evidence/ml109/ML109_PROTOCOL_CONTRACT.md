# ML-109 protocol and input contract

## Protocol identity

`protocol_id=CMJ-U-BI-HOH`, `protocol_version=1.0.0`.

The identifier is opaque at this layer. Its acronym expansion is not guessed;
the repository-defined identifier is the authority.

## Required execution conditions

- bilateral unloaded stance;
- upright, quiet starting position;
- hands on hips throughout the trial;
- no external load or support;
- one deliberate continuous countermovement followed by takeoff and landing;
- no step, hop, double jump, hand release, assistance, or contact change.

The trial is excluded when the acquisition cannot establish these conditions,
when the protocol metadata is missing, or when the source chain is not
qualified. The processor does not infer protocol eligibility from a raw file.

## Qualified input chain

`SourceArtifact → SourceObservation → CanonicalAcquisition →
ConfigurationResolution → CMJ processor`.

The processor accepts no raw CSV or vendor file. The canonical acquisition
must contain finite force samples in `N`, timestamps in `s`, an explicit
qualified recorded rate, and a resolved supported configuration.

## Supported configurations

| Configuration | Required force | Formation |
| --- | --- | --- |
| `single.total_fz` | total vertical force | use the qualified `Fz_total` channel |
| `dual.independent_fz` | left and right vertical force | `Fz_total[i] = Fz_left[i] + Fz_right[i]` |

Left/right channels are retained when present for traceability. B02 does not
diagnose asymmetry. Any other configuration is `CONFIGURATION_INELIGIBLE`.

## Scientific classification

The mechanical input identity and units are established mechanical contract.
The exact protocol gates and supported configuration boundary are project
convention/engineering policy constrained by the accepted upstream product.
The limitation is that a force-only contract cannot verify all human protocol
behaviour without qualified metadata or practitioner review.
