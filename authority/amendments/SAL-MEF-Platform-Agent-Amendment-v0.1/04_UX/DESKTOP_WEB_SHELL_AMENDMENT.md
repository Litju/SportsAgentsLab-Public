# Desktop Web Shell Amendment

**Applies to:** `SAL-MEF-UXD v0.3.0`\
**Visual redesign authorized:** No.

## Preserved UX authority

The existing overview-centered workstation, Tests/Metric Explorer, Force Plates & Imports, Evidence, Reports, Protocols & References, Settings, evidence-first decision card, trace review, explicit uncertainty, and persistent MEF Agent concept remain unchanged.

## New shell requirements

- Canonical runtime is a desktop-first browser application.
- Primary interaction assumes laptop/desktop viewport, keyboard, pointer, dense plots, and multi-panel review.
- Responsive collapse MUST preserve evidence semantics and decision clarity; it does not redefine the information architecture.
- Browser route transitions MUST preserve the active Eve agent session unless the user explicitly starts a new session.
- Agent dock is persistent and visually distinct from verified evidence values.
- Agent-generated narrative MUST never visually impersonate a verified metric/evidence field.
- Long-running ML-97 jobs display deterministic job/progress state independent of agent prose.
- Hosted artifact upload/download/review uses authenticated server routes once ML-98 exists.
- Before ML-98, hosted preview journeys use synthetic/deidentified fixtures only.

## Explicitly deferred

- Native Windows packaging.
- Offline-first mode.
- Mobile-native app.
- Mobile-first redesign.
- Broad SportsAgentsLab multi-agent navigation shell.
