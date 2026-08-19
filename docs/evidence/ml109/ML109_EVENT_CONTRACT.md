# ML-109 event contract

The processor owns events. Vendor event flags are never authoritative.
Indices refer to source samples; times refer to source timestamps. Persistence
is an inclusive count corresponding to 20 ms at the qualified rate. No event
is interpolated.

| Event | Signal/reference | Rule and direction | Search | Failure |
| --- | --- | --- | --- | --- |
| `MOVEMENT_ONSET` | total vertical force / accepted body-weight baseline | first sample of a persistent 20 ms interval at or below `0.95 × body_weight_N`; downward unloading direction | after the accepted quiet window, before takeoff | `MOVEMENT_ONSET_NOT_FOUND` |
| `TAKEOFF` | total vertical force | first sample of a persistent 20 ms interval at or below `20 N`; force-loss direction | after movement onset | `TAKEOFF_NOT_FOUND` |
| `LANDING` | total vertical force | first sample of a persistent 20 ms interval at or above `20 N`; force-return direction | after takeoff | `LANDING_NOT_FOUND` |

For dual plates, all event rules use the exact summed total force. Event
ordering is `quiet_end < movement_onset < takeoff < landing`, with distinct
sample indices. Violations produce `EVENT_ORDER_INVALID`.

## Baseline and persistence

The baseline is the mean total force in the accepted one-second quiet-standing
window. Movement onset requires at least that window before the search. There
is no adaptive baseline, adaptive threshold, return-to-baseline heuristic, or
vendor event override. The first qualifying persistent run wins.

## Decision classification

The physical meaning of force direction, event ordering, and persistence is
mechanical/methodological. The numeric thresholds (`95%`, `20 N`, `20 ms`) and
first-sample/no-interpolation conventions are explicit v1 engineering
policies. They require corpus validation and may not be silently tuned.

## Excluded phase boundaries

`UNWEIGHTING`, `BRAKING`, and `PROPULSION` are not machine events in v1. The
closed metric pack does not require them, so adding phase heuristics here
would expand scope without a metric dependency.
