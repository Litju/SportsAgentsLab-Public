# ML-109 scientific source ledger

The repository research note
`docs/research/ml109-primary-sources.md` records the inspected literature and
DOIs. This ledger records how each important choice was adjudicated. The
contract remains the final implementation authority.

| Decision | Evidence inspected | Class | Alternatives considered | Final decision | Limitation |
| --- | --- | --- | --- | --- | --- |
| vertical force, net force, acceleration | Newtonian mechanics; Linthorne 2001 | ESTABLISHED_MECHANICAL_IDENTITY | force-minus-weight vs vendor formula | `F_net=F_vertical-system_weight`; `a=F_net/m` | requires qualified axis/orientation and unloaded protocol |
| qualified input chain | accepted repository acquisition contracts | PROJECT_CONVENTION | raw parser in processor | only canonical upstream products; no raw CSV | upstream qualification is a prerequisite |
| supported configurations | B01 accepted scope | PROJECT_CONVENTION | universal plate support; vendor adapters | synthetic/reference only; single total and dual independent | real vendor qualification remains future evidence work |
| minimum sample rate | Street 2001; Owen 2014; Hori 2009 | LITERATURE_SUPPORTED_METHOD + ENGINEERING_POLICY | metric-specific lower rates; device capability claim | explicit recorded rate `>=1000 Hz`; unknown fails closed | threshold is scoped to this pack, not universal hardware truth |
| resampling/filtering/interpolation | sampling and integration error literature; Vanrenterghem 2001 | ENGINEERING_POLICY | filtering, resampling, event interpolation | none in v1 | future validation may authorize a frozen method only with evidence |
| quiet-standing duration | Owen 2014 one-second protocol; Street 2001 baseline context | LITERATURE_SUPPORTED_METHOD + ENGINEERING_POLICY | shorter/longer windows; mean-only stability | exact one second; latest valid window; 5% max deviation and 10% range | numeric stability tolerances are not universal consensus |
| body/system weight | force-plate mechanics; accepted unloaded CMJ protocol | ESTABLISHED_MECHANICAL_IDENTITY + PROJECT_CONVENTION | instantaneous baseline; separate body/external load | quiet-window mean total force; public body weight, calculation system weight | external-load trials are not v1 eligible |
| gravity | NIST SP 811 standard gravity | STANDARDIZED_CONSTANT | local gravity; configurable constant | non-configurable `9.80665 m/s²` | local variation is outside v1 precision needs |
| movement onset | Owen 2014; Pinto & Callaghan 2023; research note comparison | LITERATURE_SUPPORTED_METHOD + ENGINEERING_POLICY | first movement, 5%/10% force rules, kinematic onset | `<=95% BW` for persistent 20 ms after quiet standing | threshold/persistence need ML-110 validation; literature disagrees on onset method |
| takeoff | Owen 2014 force-based criteria; force-plate event practice | LITERATURE_SUPPORTED_METHOD + ENGINEERING_POLICY | zero-force, body-weight fraction, vendor flag | total force `<=20 N` for 20 ms; first sample; no interpolation | numeric threshold is engineering policy |
| landing | force-time mechanics; Owen 2014 event framework | LITERATURE_SUPPORTED_METHOD + ENGINEERING_POLICY | fixed threshold, derivative, vendor flag | total force `>=20 N` for 20 ms after takeoff | landing impact morphology is not modeled |
| phase boundaries | Harry 2020; common CMJ terminology | LITERATURE_SUPPORTED_METHOD | include unweighting/braking/propulsion | omit because no core metric requires them | future phase metrics need their own definitions and validation |
| integration | trapezoidal numerical integration; Vanrenterghem 2001 | LITERATURE_SUPPORTED_METHOD | Simpson, rectangles, selectable methods | cumulative trapezoid, left-to-right, source timebase | integration error remains input- and boundary-dependent |
| displacement | kinematic integral identity | ESTABLISHED_MECHANICAL_IDENTITY + ENGINEERING_POLICY | alternate reference or drift correction | zero at onset; trapezoid of velocity; no drift correction | force-only displacement is sensitive to signal quality |
| impulse convention | Linthorne 2001 impulse-momentum | ESTABLISHED_MECHANICAL_IDENTITY | gross, phase, landing, or flight impulse | only net onset-to-takeoff impulse | phase/gross variants excluded to keep pack closed |
| primary jump height | Linthorne 2001; Moir 2008 comparison of height definitions | ESTABLISHED_MECHANICAL_IDENTITY + PROJECT_CONVENTION | flight-time height as primary; takeoff-to-COM height | impulse-momentum takeoff-to-apex height | not interchangeable with flight-time height |
| metric pack | Anicic 2023 reliability context; B01 scope | PROJECT_CONVENTION + ENGINEERING_POLICY | RFD, asymmetry, readiness, vendor metrics | one primary plus bounded descriptive metrics | no clinical or longitudinal interpretation |
| quality taxonomy | existing repository quality vocabulary and product boundary | PROJECT_CONVENTION | one generic processing error; practitioner-only labels | eight explicit states plus specific failure codes | future override policy requires explicit owner decision |
| precision and hash | IEEE 754 / ISO/IEC 60559:2020; JCGM 100:2008; repo hashing conventions | ENGINEERING_POLICY | decimal rounding; runtime metadata hash | binary64, no intermediate rounding, canonical semantic SHA-256 | floating-point identity still depends on a fixed algorithm/order |

## Disagreements and adjudication

The literature does not provide one universal CMJ onset threshold, persistence
duration, sample-rate cutoff, or jump-height definition. The contract records
those choices as engineering policies and preserves the alternatives in this
ledger. The primary height is explicitly impulse-momentum; flight-time height
is not silently treated as equivalent. No disagreement is hidden as consensus.

## Skill-to-decision trace

| Capability | Evidence inspected | Contribution | Scope boundary |
| --- | --- | --- | --- |
| `@statsmodels` | deterministic variability/stability concepts | challenged SD/CV as unjustified additions; retained explicit max-deviation/range rule | no statistical model in processor |
| `@scikit-learn` | reproducible evaluation and leakage concepts | confirmed ML-110 corpus/evaluation belongs later and cannot tune v1 thresholds | no ML signal processing |
| `@scientific-visualization` | trace/event marker and unit-label semantics | requires future force-time trace to label time in seconds, force in newtons, and event markers; rendering is not authority | no plotting calculation authority |
| research-methods and critical-thinking capability | source hierarchy, disagreement and falsifiability review | classified rules as identity, literature method, project convention, or engineering policy | no invented consensus |
| numerical/unit review capability | trapezoid, units, sign, boundary and serialization checks | challenged off-by-one, double-count, initial-condition, unit, sign, rounding, and nondeterministic serialization risks | no production processor implementation |

`@pymc` was not used because no uncertainty model was materially required;
`BAYESIAN_PROCESSOR_COMPONENT=NO`.
