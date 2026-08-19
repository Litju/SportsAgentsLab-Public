# MEF Forbidden Claims Lock

Status: NORMATIVE candidate; founder review required.

The product supports measurement evidence, comparability review, uncertainty-aware change interpretation, provenance, and practitioner decision support. It does not own medical, clinical, causal, or autonomous decision authority.

## Prohibited claims and interpretations

| Boundary | Forbidden output or inference |
| --- | --- |
| Athlete readiness | ready, not ready, readiness score, or equivalent athlete-state label |
| Fatigue | fatigued, fatigue detected, recovery state, recovered, or neuromuscular-status conclusion |
| Injury | injured, injury present, injury healed, injury risk, or injury prediction |
| Diagnosis | clinical diagnosis, patient classification, or medical conclusion |
| Medical decision-making | medical advice, treatment decision, or autonomous medical action |
| Return to participation | return-to-play/return-to-participation clearance, safe-to-compete, or permission to resume activity |
| Causal training effects | attributing a change to training, load, sleep, illness, competition, or another cause without a separate qualified causal design |
| Autonomous prescription | training prescription, automatic load change, or authoritative action without human confirmation |
| Universal thresholds | universal practical thresholds or cross-device claims without registered, scope-specific evidence |

## Allowed measurement-support interpretation

A dashboard profile or report may support return-to-participation measurement workflows and practitioner-authored criteria. It may state only measurement facts under the selected contract, for example: Measurement criterion met under the selected contract; Practical interpretation remains uncertain; Practitioner review required. It must not state clearance, safety, healing, readiness, or low injury risk.

Allowed states are measurement validity, comparability, distinguishability, practical-threshold eligibility when registered, unresolved/insufficient/unsupported/retest states, and attributed human disposition. A signed evidence record proves integrity, identity, and scope binding; it does not prove scientific truth, diagnosis, causality, or clearance.

## Agent boundary

The MEF Agent may explain verified outputs, cite exact evidence objects, identify missing information, summarize reference-window differences, navigate to relevant objects, request metadata, draft notes, and prepare structured actions for confirmation. It may not calculate hidden metrics, define formulas, change processing thresholds, silently alter baselines, set thresholds, approve trials/sessions, sign releases, diagnose, prescribe, clear, or mutate authority-bearing state without authorized human action.

## Enforcement

- UX-5 prohibits readiness, fatigue, injury, diagnosis, clearance, and causal labels.
- ADR-029 defines measurement-validity, comparability, distinguishability, practical-threshold, and human-disposition states only.
- SDD FR-035 and FR-036 prohibit generic state labels and unsupported causality.
- Unknown, unsupported, unresolved, and failed states must remain explicit.
- Every human override preserves original system evidence and records actor, time, reason, prior value, new value, and affected evidence.
- Any future expansion of these claims requires the authority change procedure and a new founder-approved scientific/product contract.

