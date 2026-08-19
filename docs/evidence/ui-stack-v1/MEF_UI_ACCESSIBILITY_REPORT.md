# MEF UI Accessibility Report

## Automated audit

`axe-core` 4.13 was injected into the production build and run across all 38 governed routes at the final route sweep. Result: `AXE_TOTAL_VIOLATIONS=0`, `AXE_SERIOUS=0`, `AXE_CRITICAL=0`.

The first audit correctly found two issues. The scrollable source-to-canonical comparison region now has keyboard access and an accessible region label; the TanStack action column now has a non-empty accessible header. The post-fix 38-route audit is clean.

## Manual/browser checks

- Radix Eve dialog: role `dialog`, Radix labelled title, close control, Escape close path, mobile viewport 390×844.
- Table controls: searchbox filtering, sort button, checkbox row selection, column visibility menu, sticky header, and empty filtered state all operated in the production build.
- React Flow graph: four nodes and three edges; zero draggable nodes; no horizontal overflow.
- ECharts frame: one SVG inside an accessible `role=img` chart frame; no scientific series or fabricated values.
- RHF/Zod form: empty submission exposes `Use at least 3 characters`; valid submission exposes session-only feedback and does not write to the server.
- Native focus styling and keyboard-visible controls remain enabled; no focus outline reset was added.
- Responsive overflow checks passed at 1728×1080, 1440×900, 1024×900 and 390×844.
- Reduced-motion media emulation matched `prefers-reduced-motion: reduce`; the final reduced-motion capture is recorded.

Local API 500 responses are expected unauthenticated degradation and are rendered as unavailable state, not an accessibility bypass.

Hosted qualification: the Ready Preview rendered the authenticated /imports route through the protected-deployment relay. The relay exposed the native file picker and upload control; its client hydration did not complete the upload state transition, so no hosted upload success is claimed. The full zero-violation axe result remains the local production-build audit above.
