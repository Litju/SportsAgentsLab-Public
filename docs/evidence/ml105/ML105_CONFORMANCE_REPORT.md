# ML-105 Conformance Report

The pure resolver conformance suite passed 10/10:

1. resolves `single.total_fz` from an exact canonical interval;
2. preserves unknown rate and axis;
3. does not infer synchronization from equal sample counts;
4. fails closed on conflicting sample rates;
5. resolves `dual.independent_fz` with explicit sync and distinct identities;
6. ignores a marketing label without physical-quantity evidence;
7. preserves unresolved protocol authority;
8. detects conflicting axis declarations;
9. preserves explicit dual unsynchronization as unsupported; and
10. preserves explicit preprocessing while ignoring dimension labels.

Supporting qualification also passed:

- root `pnpm run validate`;
- real PostgreSQL migration, uniqueness, append-only audit, rollback, and replay integration 2/2 against isolated Neon Preview;
- authority verification including B01 ML-105 activation;
- architecture, dependency, and secret scans; and
- practitioner-web production build.

The hosted ML-105 acceptance gate was not run because Vercel deployment quota prevented a new Preview deployment. This report is therefore `PASS_WITH_LIMITATIONS`, not a hosted full pass.
