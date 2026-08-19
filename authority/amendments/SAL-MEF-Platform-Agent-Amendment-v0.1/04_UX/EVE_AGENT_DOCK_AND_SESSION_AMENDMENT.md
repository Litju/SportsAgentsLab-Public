# Eve Agent Dock and Session Amendment

## Session model

The persistent MEF Agent dock binds to one Eve session identity per intentional user session/work context. Route navigation does not silently fork context. Session restart/recovery behavior must be observable and testable.

## Content classes

The dock/UI must distinguish at least:

1. **Verified evidence** — typed output retrieved from MEF evidence/application APIs.
2. **Execution state** — ML-97 Job/Progress state.
3. **Agent explanation** — model-generated narrative grounded in typed references.
4. **Question/request** — missing metadata or clarification requested by agent/system.
5. **Approval interaction** — Eve HITL interaction, which is not itself the final authority record.
6. **Practitioner decision** — persisted MEF authority event with actor/reason/evidence scope.

## Tool UX

- Read tools may return immediately.
- Long/authority-sensitive tools return Job or governed decision references.
- Approval-required actions show exactly what will happen, the target object, and the evidence context.
- Cancellation communicates requested vs acknowledged vs completed cancellation states; the UI must not overstate cancellation.
- UNKNOWN_OUTCOME is visible and cannot be narrated away.

## Context minimization

The agent receives typed summaries/references. Raw high-rate signals are excluded by default. If a future visual/signal reasoning capability is qualified, it requires a separate explicit policy and eval set.
