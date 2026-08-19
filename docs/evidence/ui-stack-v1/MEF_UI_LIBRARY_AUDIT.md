# MEF UI Library Audit

Package footprints below are the measured pnpm package-tree bytes in this workspace (package files plus the package's linked install entries), not transfer-size claims. The route bundle report records the shipped JavaScript sizes.

| Package | Version | License | Source / maintainer | Package-tree bytes | Direct runtime dependencies | Tree-shaking / actual need |
| --- | ---: | --- | --- | ---: | --- | --- |
| `@hookform/resolvers` | 5.9.0 | MIT | [react-hook-form/resolvers](https://github.com/react-hook-form/resolvers) | 1,164,533 | `@standard-schema/utils` | Resolver seam required for RHF + Zod form |
| `@radix-ui/react-dialog` | 1.1.23 | MIT | [radix-ui/primitives](https://github.com/radix-ui/primitives) | 99,377 | Radix focus/dismiss/portal primitives, `aria-hidden`, `react-remove-scroll` | One dialog primitive; imported directly and used only for mobile Eve |
| `@tanstack/react-table` | 9.1.2 | MIT | [TanStack/table](https://github.com/TanStack/table) | 134,093 | `@tanstack/react-store`, `@tanstack/table-core` | Headless feature modules; required for governed table behavior |
| `@tanstack/react-virtual` | 3.14.9 | MIT | [TanStack/virtual](https://github.com/TanStack/virtual) | 56,532 | `@tanstack/virtual-core` | Activated only above 12 rows |
| `@xyflow/react` | 12.11.3 | MIT | [xyflow/xyflow](https://github.com/xyflow/xyflow) | 1,209,862 | `classcat`, `zustand`, `@xyflow/system` | Lazy route-only provenance graph |
| `echarts` | 6.1.0 | Apache-2.0 | [Apache ECharts](https://github.com/apache/echarts) | 60,297,703 | `tslib`, `zrender` | Imported from core/charts/components/renderers; lazy route-only chart |
| `lucide-react` | 1.31.0 | ISC | [lucide](https://github.com/lucide-icons/lucide) | 31,224,249 | none | Individual icon imports; replaces bespoke common glyphs |
| `motion` | 12.43.0 | MIT | [Motion](https://motion.dev/) | 683,139 | `framer-motion`, `tslib` | Used only for bounded Eve continuity and reduced-motion aware transition |
| `react-hook-form` | 7.85.0 | MIT | [react-hook-form](https://github.com/react-hook-form/react-hook-form) | 1,462,944 | none | Required for visible form state without custom form runtime |
| `zod` | 4.4.3 | MIT | [colinhacks/zod](https://github.com/colinhacks/zod) | 4,558,122 | none | Existing dependency; schema is local/session-only |

Beautiful UI is a source reference for AI-native compositions, not an added package. The implementation is selective and source-owned; attribution/reference is retained through this report and the decision record. shadcn/ui is a source-owned convention, not a second registry or runtime foundation.

## Security and supply chain

- `pnpm audit --audit-level high`: pass, no known vulnerabilities found.
- Existing repository security suite: pass (`EVE_EVALS`, auth, tenant, idempotency and boundary checks).
- `scripts/secret_scan.py`: pass with `high_confidence_findings=0`; no secret values were stored in evidence.
- Direct tracked-source secret-pattern scan: zero matches after excluding the CSS `-spin` false positive from the initial broad pattern.
- The repository's `test:vulnerabilities` command reached the lock-aware Python audit after the workspace-safe uv-cache retry but exceeded the bounded verification window before producing a result; the Node audit is independently green. This is a release limitation, not a suppressed finding.
