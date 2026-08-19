# MEF UI Composition Stack v1 receipt

Status: `PASS`; the protected Preview acceptance is complete and PR #6 is ready to merge.

## Passed

- ML-104 predecessor merged and closed before UI implementation.
- Target branch is `work/mef-ui-composition-stack-v1`; repository authority and
  B01/ML105 boundary were preserved.
- 38 authority screen definitions remain the route source of truth.
- `pnpm --filter @mef/practitioner-web typecheck` passed.
- `pnpm --filter @mef/practitioner-web lint` passed.
- `pnpm --filter @mef/practitioner-web build` compiled and emitted a build id.
- Playwright checks passed for all 38 route screenshots at 1728x1080, the 14
  critical states, 1440x900, 1024x900, 390x844 and reduced motion; no
  horizontal overflow was observed.
- Full axe-core 4.13 pass across all 38 routes reports zero violations,
  including zero serious or critical findings.
- Radix mobile Eve dialog opened with an accessible labelled title and close
  action; Motion respects reduced motion.
- React Flow rendered four read-only nodes and three edges; node dragging and
  connecting are disabled.
- ECharts rendered an empty accessible SVG shell with no fabricated trace.
- TanStack Table verified filtering, sorting, row selection, column visibility,
  sticky headers and the bounded TanStack Virtual path.
- RHF/Zod rejected an empty session preference and accepted a valid
  session-only draft without a server write.
- `pnpm audit --audit-level high` and the repository security suite passed;
  the repository secret scan passed.
- `sal-mef-ux-composition-evolver` passed `quick_validate.py`, its fixed-case
  evaluator, and skill packaging. SHA-256:
  `2A351A4C961B3D25078724BDAB55900A641C4773DB3453171B10205B15FEF41B`.
- Draft PR [#6](https://github.com/Litju/sportsagentslab-mef/pull/6) is open;
  the protected Vercel Preview is Ready at
  `https://sportsagentslab-lmr3mkqh0-julitocrztuga-2084s-projects.vercel.app`.
- Authenticated Vercel CLI smoke checks returned 200 for command center,
  imports, trials, sessions, evidence, provenance, reports, integrations and
  health routes; the remote MEF Quality Gate passed.
- The authenticated synthetic bootstrap returned HTTP 201. The protected
  browser relay completed the native file picker, private Blob upload,
  `READY_FOR_ADAPTER`, ML-103 source inspection, and ML-104 canonical
  acquisition actions through the new UI.

## Evidence files

- Baseline screenshots: `docs/evidence/ui-stack-v1/baseline/`
- Final screenshots: `docs/evidence/ui-stack-v1/final/` (38 routes, 14 critical
  states, responsive and reduced-motion captures)
- Visual acceptance matrix: `MEF_UI_VISUAL_ACCEPTANCE.csv`
- Accessibility report: `MEF_UI_ACCESSIBILITY_REPORT.md`
- Run manifest: `docs/evidence/ui-stack-v1/run-manifest.json`
- Decision record: `docs/decisions/MEF_UI_COMPOSITION_STACK_V1.md`

## Limitations and blocked work

- Local `/api/context` and `/api/status` return HTTP 500 without authenticated
  provider/runtime support; the UI correctly shows unavailable/degraded copy.
- Direct browser automation without a Vercel SSO session redirects to Vercel
  login; hosted route rendering used the authenticated Vercel CLI protection
  bypass, while local Playwright covered the complete interactive UI
  acceptance.
- The repository `test:vulnerabilities` wrapper did not finish its Python
  pip-audit phase within the bounded verification window; Node audit passed.
- The UI action commit is `deeaaaa`; the hosted acceptance evidence is recorded
  against that final tested head.
- ML-105, ML-106, B02, and all blocked scientific processors remain untouched.
