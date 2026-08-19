/** INTERFACE_ONLY: a public result envelope; no runtime or service is implied. */

export interface PublicToolResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly message?: string;
  readonly source: "synthetic-demo" | "illustrative-example";
}
