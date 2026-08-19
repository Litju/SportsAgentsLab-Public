# ML-109 trial-quality taxonomy

The quality state is deterministic and separate from individual failure codes.
The authoritative machine-readable form is
`packages/cmj-contract/schemas/quality-taxonomy.json`.

| State | Severity | Trigger | Inclusion/availability | Source and override |
| --- | --- | --- | --- | --- |
| `ACQUISITION_INELIGIBLE` | ERROR | unsupported configuration, unqualified source chain, protocol/acquisition gate failure | excludes trial; no processor metrics | machine; no silent override |
| `PROCESSOR_FAILURE` | ERROR | processor precondition or implementation failure | excludes trial; no dependent metrics | machine; owner review only |
| `EVENT_FAILURE` | ERROR | onset, takeoff, landing, or event ordering failure | excludes trial; event-dependent metrics unavailable | machine; no automatic override |
| `INTEGRITY_WARNING` | WARNING | nonfatal trace/integrity finding that does not invalidate a metric | inclusion remains possible; affected metrics may be annotated | machine or practitioner; explicit future policy only |
| `METRIC_UNAVAILABLE` | WARNING | a metric dependency is absent while the trial remains interpretable | trial may remain included; only affected metric unavailable | machine; no backfill by guess |
| `REVIEW_REQUIRED` | REVIEW | practitioner or contract-required review condition | not automatically included as valid | practitioner/machine; owner policy required |
| `EXCLUDED` | INFO | explicit protocol, scope, or metric exclusion | not included in core results | machine/practitioner; no silent promotion |
| `VALID_INCLUDED` | OK | all required quality prerequisites pass | included; core metrics available per dependencies | machine with practitioner evidence view |

## Failure-code contract

The v1 machine failure codes are:

`NO_QUALIFIED_QUIET_STANDING`, `BODY_WEIGHT_UNAVAILABLE`, `INVALID_MASS`,
`MOVEMENT_ONSET_NOT_FOUND`, `TAKEOFF_NOT_FOUND`, `LANDING_NOT_FOUND`,
`EVENT_ORDER_INVALID`, `TIMEBASE_INVALID`, `SAMPLE_RATE_UNSUPPORTED`,
`NONFINITE_SIGNAL`, `MISSING_SAMPLE`, `CONFIGURATION_INELIGIBLE`,
`INTEGRATION_PRECONDITION_FAILED`, `SOURCE_CHAIN_INELIGIBLE`,
`PROTOCOL_INELIGIBLE`, and `NONPOSITIVE_SYSTEM_WEIGHT`.

Each is machine-addressable and maps to a quality effect; none is a catch-all
replacement for the specific cause. `P0_OPEN=0`, `P1_OPEN=0`, and `P2_OPEN=0`
are required for gate completion.
