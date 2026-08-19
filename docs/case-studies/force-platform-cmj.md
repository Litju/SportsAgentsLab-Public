# Force-platform countermovement jump case study

This bounded case study follows a synthetic vertical-force trace through a
public-safe illustrative workflow:

```text
recording → acquisition checks → signal interpretation → event illustration
→ deterministic force-derived calculation → quality note → practitioner review
```

## What the code demonstrates

- finite time in seconds and force in newtons;
- explicit single-channel input with a clear sign convention;
- trapezoidal integration as a small deterministic helper;
- a synthetic trace whose construction parameters are recorded;
- a render-only force-time plot with labels and a visible limitation.

The calculation is intentionally bounded. It does not claim support for every
force plate, a population, a clinical use, or a production workflow. Readers
can reproduce the example with `python examples/cmj/run_demo.py` and inspect
the selected tests.

## Provenance and uncertainty

The trace is synthetic and its construction parameters are known. Derived
values are numerical outputs from the public helper. No expert annotation,
empirical validation, or hidden evaluation result is implied. The practitioner
review card is a presentation example, not a scientific authority record.

## Reproducibility

The generator uses a fixed seed and writes canonical JSON. The test checks that
the same seed produces the same trace and that the integration result remains
stable. Any future change should update the public example version and its
tests together.
