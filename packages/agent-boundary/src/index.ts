/**
 * Framework-neutral port for the future MEF Agent runtime.
 *
 * ML-94 defines only the boundary. Runtime behavior, tools, memory, and
 * provider integrations belong to later bounded work.
 */
export interface AgentRuntimePort<Context, Request, Response> {
  readonly protocol: "mef-agent-runtime-port";
  respond(context: Context, request: Request): Promise<Response>;
}
