# MEF UI Bundle and Route Performance

Measured from the Node 24 production build in `apps/practitioner-web/.next`.

| Metric | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| Static chunk files | 17 | 22 | +5 |
| Static chunk bytes | 2,422,827 | 2,466,187 | +43,360 (+1.79%) |
| Server app files | not captured in baseline | 340 | — |
| Server app bytes | not captured in baseline | 4,024,373 | — |

The baseline is the pre-stack production measurement recorded before the candidate build. The final candidate remains bounded because heavy route libraries are split from the shared shell:

- `/` loaded no ECharts or React Flow implementation chunks in the browser resource list.
- `/evidence/demo/provenance` loaded the React Flow chunks `178.9339f48bfba41722.js` (91,608 bytes) and `734dfbf4.2035189107e8fccf.js` (69,787 bytes).
- `/trials/demo` loaded the ECharts chunks `5361.830175310692d757.js` (524,680 bytes) and `5714.12ed4a3350280033.js` (1,689 bytes).
- The shared table path contains TanStack code because the command-center pattern uses it; TanStack Virtual only activates for lists over 12 rows.

No duplicate React runtime, icon pack, primitive stack, table engine or chart library was introduced. ECharts is configured with core/charts/components/renderers imports and React Flow/ECharts are both dynamically loaded at the route seam.

Hosted qualification used the same candidate build in a Ready Preview deployment; the protected relay did not change the measured client chunk graph.
