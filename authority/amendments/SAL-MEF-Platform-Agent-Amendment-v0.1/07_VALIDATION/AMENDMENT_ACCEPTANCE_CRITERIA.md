# Amendment Acceptance Criteria

## Documentation acceptance

- `AMENDMENT_AUTHORITY.yaml` parses successfully.
- `SUPERSESSION_MATRIX.yaml` parses successfully.
- Every superseded baseline platform/runtime decision points to a new ADR.
- No scientific/safety authority is accidentally superseded.
- Original source ZIP hashes remain unchanged.
- Existing ML-93 locks remain intact.
- SDD/TDD/ADR amendment terminology is internally consistent.
- Diagrams match the written architecture.
- ML-97 is not silently declared accepted by this amendment.

## Founder acceptance record

Founder acceptance should record:

```text
AMENDMENT=SAL-MEF-PLATFORM-AGENT-AMENDMENT-v0.1
STATUS=ACCEPTED
ORIGINAL_AUTHORITY_MODIFIED=NO
SCIENTIFIC_SCOPE_CHANGED=NO
UX_VISUAL_FREEZE_CHANGED=NO
PLATFORM_ARCHITECTURE_CHANGED=YES
AGENT_RUNTIME_CHANGED=YES
MODEL_PROVIDER_SELECTED=YES
DEPLOYMENT_PROVIDER_SELECTED_FOR_PROTOTYPE=YES
ML97_ACCEPTANCE_SEPARATE=YES
```
