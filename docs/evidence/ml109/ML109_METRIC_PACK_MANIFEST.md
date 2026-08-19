# ML-109 metric-pack manifest

`CMJ_VERTICAL_CORE` is closed in v1. It has exactly one primary metric and
the following descriptive metrics. The authoritative machine-readable form is
`packages/cmj-contract/schemas/metric-pack.json`.

| Metric ID | Class | Definition and unit | Dependencies/events | Availability and display |
| --- | --- | --- | --- | --- |
| `jump_height_impulse_momentum_m` | PRIMARY | `v_takeoff²/(2g)`, `m` | mass, net impulse, takeoff | valid included trial; `0.001 m` |
| `takeoff_velocity_m_per_s` | DESCRIPTIVE | net impulse divided by mass, `m/s` | onset, takeoff, mass | valid included trial; `0.001 m/s` |
| `net_impulse_onset_to_takeoff_Ns` | DESCRIPTIVE | net-force trapezoidal integral, `N·s` | onset, takeoff, system weight | valid included trial; `0.1 N·s` |
| `body_weight_N` | DESCRIPTIVE | accepted quiet-window mean total force, `N` | quiet window | valid baseline; `0.1 N` |
| `body_mass_kg` | DESCRIPTIVE | `body_weight_N/g`, `kg` | quiet window, gravity | valid baseline; `0.001 kg` |
| `pre_takeoff_displacement_m` | DESCRIPTIVE | velocity integral from onset to takeoff, `m` | onset, takeoff, integration | only if displacement precondition holds; `0.001 m` |
| `time_to_takeoff_s` | DESCRIPTIVE | `t_takeoff - t_movement_onset`, `s` | onset, takeoff | valid ordered events; `0.001 s` |
| `time_in_air_s` | DESCRIPTIVE | `t_landing - t_takeoff`, `s` | takeoff, landing | valid ordered events; `0.001 s` |

No metric in this pack requires a phase boundary; `required_phases=[]` for all
v1 metrics. Primary metric availability requires a qualified acquisition,
valid quiet standing, valid mass, valid timebase, finite force, all required
events, valid ordering, and successful integration. Descriptive metrics state
their own dependency failures in the result quality state.

## Explicit exclusions

- `flight_time_jump_height_m` as a primary or core metric;
- RFD and arbitrary high-variance derivative/peak-force metrics;
- asymmetry diagnosis, including left/right conclusions;
- vendor-proprietary metrics or vendor event flags;
- longitudinal metrics;
- readiness or fatigue scores;
- clinical or diagnostic outputs.

Excluded metrics have no core availability and cannot be smuggled in as
aliases. The future contract must add and justify any new metric explicitly.
