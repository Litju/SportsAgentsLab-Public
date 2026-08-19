# ML-109 numerical and integration policy

`numerical_policy_version=1.0.0`.

## Timebase and sample rate

The recorded sample rate must be explicit, qualified, and at least `1000 Hz`.
Rates above the threshold are accepted. Unknown or below-threshold rates are
rejected with `SAMPLE_RATE_UNSUPPORTED`. Timestamps must be finite, strictly
increasing, and uniform at the declared interval; otherwise the result is
`TIMEBASE_INVALID`. A missing sample is `MISSING_SAMPLE`.

`RESAMPLING=NO`, `INTERPOLATION=NO`, and `FILTERING=NONE`. The contract does
not claim that every device supporting 1000 Hz is scientifically equivalent;
the rule is scoped to qualified recorded inputs and must be validated by
metric-specific evidence.

## Force, mass, and gravity

For an unloaded CMJ, the public body-weight value is the accepted quiet-window
mean total force, stored as `body_weight_N`; calculations use the same value as
`system_weight_N`. For dual plates, summation precedes the mean. Mass is
`m_kg = system_weight_N / 9.80665 m/s²`; nonpositive or nonfinite values fail
with `INVALID_MASS` or `BODY_WEIGHT_UNAVAILABLE`.

`g=9.80665 m/s²` is standard gravity, treated as a non-configurable v1
constant. Force is upward-positive after the configured vertical-force
orientation has been qualified.

## Equations

```text
F_net[i] = F_vertical[i] - system_weight_N
a[i]     = F_net[i] / m_kg
```

Both are evaluated in binary64 without rounding. Nonfinite signal or derived
values fail closed.

## Integration convention

Use one left-to-right cumulative trapezoidal method:

```text
y[0] = y_initial
y[i] = y[i-1] + 0.5 * (x[i-1] + x[i]) * (t[i] - t[i-1])
```

Velocity uses `x=a`, `y_initial=0 m/s` at movement onset. Displacement uses
`x=v`, `y_initial=0 m` at movement onset. The pre-takeoff interval is the
inclusive source-sample sequence from movement onset through takeoff. There
is no selectable integration method, drift correction, filter, resampling,
parallel reduction, or interpolation in v1.

## Impulse and jump height

The only included impulse is net impulse from movement onset through takeoff:

```text
J_net_Ns = Σ 0.5 * (F_net[i-1] + F_net[i]) * (t[i] - t[i-1])
v_takeoff_m_per_s = J_net_Ns / m_kg
jump_height_impulse_momentum_m = v_takeoff_m_per_s² / (2 * g)
```

This primary metric is the impulse-momentum takeoff-to-apex height. Flight
time and a flight-time-derived height are excluded from the core and may be
reported only as a descriptive cross-check if a future contract explicitly
adds them.

## Precision and semantic serialization

Internal calculations use IEEE 754 binary64. Storage is finite JSON numbers;
`NaN`, infinities, and locale-dependent number formats are forbidden. Negative
zero normalizes to zero. Rounding before any downstream calculation is
forbidden (`INTERMEDIATE_ROUNDING=NO`). Display rounding is separate and is
metric-specific in the machine-readable manifest.

## Sanity examples

1. A constant quiet force of `800 N` yields `system_weight_N=800 N`.
2. A constant net force of `160 N` for `0.5 s` on `80 kg` yields `Δv=1 m/s`.
3. `v_takeoff=2 m/s` yields `h=4/(2×9.80665)=0.203943... m`.

These are contract formula checks, not the ML-110 validation corpus.
