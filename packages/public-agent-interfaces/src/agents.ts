/** PUBLIC_ADAPTER: typed public shapes for synthetic agent demonstrations. */

export type AgentRole =
  | "Measurement Agent"
  | "Research Agent"
  | "Monitoring Agent"
  | "Prescription Agent"
  | "Marketing Agent";

export interface AgentRequest {
  readonly role: AgentRole;
  readonly question: string;
  readonly context: Record<string, string>;
}

export interface AgentResult {
  readonly role: AgentRole;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly limitation: string;
  readonly synthetic: true;
}
