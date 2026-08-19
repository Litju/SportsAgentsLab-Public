export interface ScientificComputationPort<Request, Result> {
  readonly protocol: "scientific-computation-port";
  execute(request: Request): Promise<Result>;
}
