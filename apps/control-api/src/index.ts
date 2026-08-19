import type { AgentRuntimePort } from "@mef/agent-boundary";
import type { EntityRecord } from "@mef/generated-ts";
import type { OperationalStatePort } from "@mef/operational-state";
import type { ScientificComputationPort } from "@mef/scientific-boundary";

export * from "./job-api.ts";

export type ControlApiScientificPort = ScientificComputationPort<
  EntityRecord,
  EntityRecord
>;

export type ControlApiAgentPort = AgentRuntimePort<
  EntityRecord,
  EntityRecord,
  EntityRecord
>;

export type ControlApiOperationalStatePort = OperationalStatePort;

export const CONTROL_API_BOUNDARY = "typescript-control-api";
