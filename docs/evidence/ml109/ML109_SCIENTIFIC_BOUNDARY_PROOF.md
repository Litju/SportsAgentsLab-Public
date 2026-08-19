# ML-109 scientific boundary and independent review

## Hard boundary

```text
PRODUCTION_PROCESSOR_IMPLEMENTED=NO
ML110_CORPUS_IMPLEMENTED=NO
B03_IMPLEMENTED=NO
MACHINE_LEARNING_PROCESSOR=NO
LEARNED_EVENT_DETECTION=NO
LEARNED_THRESHOLD=NO
BAYESIAN_PROCESSOR_COMPONENT=NO
```

The package freezes inputs, equations, events, metric dependencies, quality,
precision, trace, and semantic hashing. It does not consume raw files or
calculate a trial result. The Measurement Agent/LLM receives no new
calculation authority.

## Cross-disciplinary review

Each review challenged the sample-rate rule, quiet-standing rule,
body/system-weight rule, movement onset, takeoff, landing, integration,
gravity, primary height, metric inclusion/exclusion, quality taxonomy, and
deterministic result hash.

| Perspective | Result | Challenge and disposition |
| --- | --- | --- |
| biomechanics | PASS | verified force-minus-weight mechanics, mass derivation, event direction, impulse-momentum height, and explicit unloaded scope; numeric thresholds remain policy |
| signal processing | PASS | verified explicit-rate/timebase requirements, missing-sample failure, no resampling/interpolation/filtering, persistence and boundary semantics; no generic filter was added |
| numerical methods | PASS | checked trapezoid order, inclusive boundaries, one-count semantics, initial conditions, sign, units, no pre-integration rounding, and deterministic serialization |
| statistics (`@statsmodels`) | PASS | checked that stability is deterministic and transparent; rejected unneeded SD/CV/model-fitting and kept no stochastic processor component |
| research methods | PASS | classified source-backed identities/methods versus engineering policies, recorded disagreement, and kept limitations visible |
| software contract | PASS | checked schema/generator synchronization, unique IDs, dependency resolution, quality/failure completeness, supported configs, topology boundary, and stable manifest hash |

The scientific-visualization capability additionally reviewed the future trace
semantics: force-time plots must label `time (s)` and `vertical force (N)`, mark
machine event indices/times, and annotate quality. Such plots remain
rendering-only and cannot change the result.

## Unresolved decisions

There are no unresolved v1 contract ambiguities. Validation questions remain
deliberately open for ML-110: empirical threshold performance across qualified
hardware/protocol populations, sensitivity to sensor noise, and whether a
future validated filtering or resampling policy is necessary. These are not
silently solved in ML-109.

## Scope controls

No machine learning, Bayesian event detection, optimization, automatic
threshold tuning, held-out-corpus tuning, longitudinal modeling, readiness,
fatigue, asymmetry diagnosis, or injury-risk modeling was introduced.
