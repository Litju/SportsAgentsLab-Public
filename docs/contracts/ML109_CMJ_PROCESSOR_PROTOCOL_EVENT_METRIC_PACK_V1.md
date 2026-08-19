# ML-109 CMJ processor scientific contract v1

Status: frozen contract for review. This artifact defines the future
deterministic processor boundary; it does not implement that processor.

## Authority and scope

- Linear issue: `ML-109`.
- Branch: `work/ml109-b02-cmj-processor-contract-v1`.
- Accepted predecessor: `10e57092f6956456134450c901a58daf76f685b0`.
- Protocol: `CMJ-U-BI-HOH`.
- Metric pack: `CMJ_VERTICAL_CORE`.
- Source adapter support: synthetic/reference adapter only.
- Real vendor adapter count and support claims: `0`.
- Supported physical configurations: `single.total_fz`,
  `dual.independent_fz`.
- Production processor: not implemented in ML-109.

The contract is intentionally narrower than universal force-plate support.
Real vendor qualification is evidence-triggered and remains outside this
gate. B02 does not add authority for an agent or an LLM to calculate body
weight, events, velocity, displacement, impulse, or jump height.

## Machine-readable authority

The canonical source is
`packages/cmj-contract/schemas/contract.source.json`. The generator produces
the synchronized contract, protocol, events, metric-pack, excluded-metrics,
quality-taxonomy, numerical-policy, and manifest documents. The JSON Schema is
`packages/cmj-contract/schemas/contract.schema.json`.

The contract and metric-pack versions are `1.0.0`; the numerical-policy
version is `1.0.0`. The generated manifest hash is recorded by the generator
and checked in contract tests.

## Protocol and input eligibility

`CMJ-U-BI-HOH` is a repository-defined protocol identifier. The acronym is
not expanded here because the repository is the authority for that identifier.
The v1 protocol requires a quiet upright starting position, bilateral unloaded
stance, hands on hips, no external load, one deliberate countermovement jump,
and no hand release, step, double jump, assistance, or unqualified contact
change. The countermovement must be a continuous downward-then-upward effort
that produces a valid takeoff and landing.

Only this qualified chain may reach the processor:

`SourceArtifact → SourceObservation → CanonicalAcquisition →
ConfigurationResolution → CMJ processor`

There is no raw CSV parser in B02. A qualified acquisition must provide a
finite total vertical-force signal in newtons, timestamps in seconds, an
explicit qualified recorded sample rate, and a supported resolved
configuration. For dual independent plates, total force is exactly
`F_vertical[i] = Fz_left[i] + Fz_right[i]`; left and right channels may be
preserved for traceability, but no asymmetry diagnosis is introduced.

## Frozen numerical and event rules

- Recorded sample rate must be explicitly qualified and at least `1000 Hz`.
  Above the threshold is accepted. Unknown or below-threshold rate fails
  closed. Irregular timestamps fail `TIMEBASE_INVALID`; missing samples fail
  `MISSING_SAMPLE`. Resampling, interpolation, and filtering are forbidden in
  v1.
- Quiet standing is an exact one-second inclusive timestamp window. Candidate
  windows are enumerated deterministically from the end of the signal and the
  latest valid window is selected. A window is stable only when its maximum
  absolute deviation from its mean is at most `5%` of the mean and its range
  is at most `10%` of the mean. Missing-data tolerance is zero. No valid
  window produces `NO_QUALIFIED_QUIET_STANDING`.
- For an unloaded trial, public terminology is `body_weight_N`; the numerical
  baseline is `system_weight_N` and equals the mean total force over the
  accepted quiet-standing window. Mass is `system_weight_N / 9.80665`.
- Gravity is the non-configurable standard gravity constant `9.80665 m/s²`.
- Net force is `F_net(t) = F_vertical(t) - system_weight_N`, in newtons, with
  upward positive. Acceleration is `a(t) = F_net(t) / mass`, in `m/s²`.
- `MOVEMENT_ONSET` is the first sample of a persistent 20 ms interval with
  total force at or below `95%` of body weight, after the accepted quiet
  window. `TAKEOFF` is the first sample of a persistent 20 ms interval with
  total force at or below `20 N`. `LANDING` is the first sample of a
  persistent 20 ms interval with total force at or above `20 N`, searched
  after takeoff. There is no event interpolation. Events must be strictly
  ordered and use source sample indices and source timestamps.
- No unneeded phase boundary is included in v1; `UNWEIGHTING`, `BRAKING`, and
  `PROPULSION` are not part of the closed core contract.
- Velocity is the left-to-right cumulative trapezoidal integral of
  acceleration, initialized to zero at movement onset. Displacement uses the
  same trapezoidal method on velocity and is initialized to zero at movement
  onset. Integration is over the inclusive onset-to-takeoff sample sequence.
- The only included impulse is `net_impulse_onset_to_takeoff` in `N·s`.
  Takeoff velocity is impulse divided by mass. The primary jump height is
  `jump_height_impulse_momentum_m = v_takeoff² / (2g)` in metres. This is the
  takeoff-to-apex impulse-momentum height. Time-in-air height is excluded from
  the core and retained only as a descriptive cross-check.

## Determinism, trace, and result hash

All arithmetic uses binary64 floating point, no intermediate rounding, and no
parallel reduction. Canonical JSON uses sorted keys, UTF-8, finite numbers,
and normalizes negative zero to zero. Display rounding is presentation-only.

The calculation trace references the canonical acquisition hash,
configuration-resolution hash, contract and metric-pack versions, quiet window,
system weight, mass/gravity convention, event indices/times, net-force
transform, integration policy/version, metric dependency graph, and quality
findings. It does not duplicate high-rate raw data.

The semantic result hash includes the canonical acquisition hash,
configuration-resolution hash, processor-contract version, metric-pack
version, numerical-policy version, events, metric values, and quality state.
It excludes request IDs, paths, hostnames, `created_at`, and runtime clocks.

## Boundaries

`PRODUCTION_PROCESSOR_IMPLEMENTED=NO`, `ML110_CORPUS_IMPLEMENTED=NO`, and
`B03_IMPLEMENTED=NO`. Machine learning, learned event detection, Bayesian
components, adaptive threshold tuning, longitudinal/readiness/fatigue models,
asymmetry diagnosis, clinical outputs, and vendor-proprietary metrics are
outside this gate.

See the evidence set under `docs/evidence/ml109/` for the detailed protocol,
event, numerical, metric, quality, source, consistency, boundary, and final
receipt records.
