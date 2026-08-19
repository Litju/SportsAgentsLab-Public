# MEF Provenance Graph Report

`apps/practitioner-web/src/components/mef/provenance/mef-provenance-graph.tsx` provides the route-local React Flow seam for `/evidence/demo/provenance`.

Final production result:

- nodes: 4;
- edges: 3;
- nodes draggable: 0;
- nodes connectable: false;
- route overflow at 390×844: false;
- graph is dynamically imported with `ssr: false`;
- the graph is navigational/explanatory only and does not mutate provenance.

Nodes are Source artifact (Immutable), Source observation (Awaiting binding), Canonical acquisition (Not created), and Practitioner decision (Review metadata). Edges describe preserves, binds, and reviewed-by relationships. Missing links and unavailable canonical output remain visible instead of being inferred.
