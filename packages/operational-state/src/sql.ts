export interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount?: number | null;
}

export interface SqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: ReadonlyArray<unknown>
  ): Promise<SqlResult<Row>>;
  release?(destroy?: boolean): void;
}

export interface SqlPool extends SqlClient {
  connect(): Promise<SqlClient>;
}
