export interface PublicAgentRuntimePort<Context, Request, Response> {
  readonly protocol: "public-agent-runtime-port";
  respond(context: Context, request: Request): Promise<Response>;
}
