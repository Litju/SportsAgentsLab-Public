export interface PublicScientificComputationPort<Request, Result> {
  readonly protocol: "public-scientific-computation-port";
  execute(request: Request): Promise<Result>;
}
