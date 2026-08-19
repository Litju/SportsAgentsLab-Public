"use client";

import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";

const nodes: Node[] = [
  { id: "source", position: { x: 0, y: 80 }, data: { label: "Source artifact\nImmutable" }, type: "input" },
  { id: "observation", position: { x: 205, y: 80 }, data: { label: "Source observation\nAwaiting binding" } },
  { id: "canonical", position: { x: 410, y: 80 }, data: { label: "Canonical acquisition\nNot created" } },
  { id: "decision", position: { x: 615, y: 80 }, data: { label: "Practitioner decision\nReview metadata" }, type: "output" }
];

const edges: Edge[] = [
  { id: "source-observation", source: "source", target: "observation", label: "preserves" },
  { id: "observation-canonical", source: "observation", target: "canonical", label: "binds" },
  { id: "canonical-decision", source: "canonical", target: "decision", label: "reviewed by" }
];

export function MefProvenanceGraph({
  nodes: graphNodes = nodes,
  edges: graphEdges = edges,
  ariaLabel = "Read-only evidence lineage graph"
}: Readonly<{ nodes?: Node[]; edges?: Edge[]; ariaLabel?: string }>) {
  return (
    <div className="mef-flow-canvas" aria-label={ariaLabel}>
      <ReactFlow
        nodes={graphNodes}
        edges={graphEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.7}
        maxZoom={1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: false }}
      >
        <Background color="rgba(97, 247, 220, .14)" gap={24} size={1} />
      </ReactFlow>
    </div>
  );
}
