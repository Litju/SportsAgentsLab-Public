import { isOperationalStateError, mapDatabaseError, OperationalStateError } from "./errors.ts";
import type { TransactionSecurityContext } from "./security.ts";
import type { SqlClient, SqlPool } from "./sql.ts";

async function setTransactionSecurityContext(client: SqlClient, context: TransactionSecurityContext | undefined): Promise<void> {
  if (!context) return;
  await client.query(
    "SELECT set_config('mef.organization_id', $1, true), set_config('mef.workspace_id', $2, true), set_config('mef.principal_id', $3, true), set_config('mef.principal_type', $4, true), set_config('mef.session_id', $5, true), set_config('mef.bootstrap', $6, true), set_config('mef.human_principal_id', $7, true), set_config('mef.runtime_principal_type', $8, true), set_config('mef.runtime_principal_id', $9, true), set_config('mef.request_id', $10, true)",
    [
      context.organizationId,
      context.workspaceId,
      context.principalId,
      context.principalType,
      context.sessionId ?? "",
      context.bootstrap === true ? "true" : "",
      context.humanPrincipalId ?? "",
      context.runtimePrincipalType ?? "",
      context.runtimePrincipalId ?? "",
      context.requestId ?? ""
    ]
  );
}

export async function withTransaction<T>(
  pool: SqlPool,
  operation: (client: SqlClient) => Promise<T>,
  context?: TransactionSecurityContext
): Promise<T> {
  let client: SqlClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw mapDatabaseError(error, "connect");
  }

  let destroyClient = false;
  try {
    try {
      await client.query("BEGIN");
      await setTransactionSecurityContext(client, context);
    } catch (error) {
      destroyClient = true;
      if (isOperationalStateError(error)) throw error;
      throw mapDatabaseError(error, "transaction");
    }

    let result: T;
    try {
      result = await operation(client);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original bounded operational error is retained; raw driver details never leave this boundary.
        destroyClient = true;
      }
      if (isOperationalStateError(error)) throw error;
      throw mapDatabaseError(error, "transaction");
    }

    try {
      await client.query("COMMIT");
    } catch {
      // A lost COMMIT response is ambiguous: PostgreSQL may have committed before the connection failed.
      // Do not issue a compensating DELETE or report a definite rollback.
      destroyClient = true;
      throw new OperationalStateError("DATABASE_TRANSACTION_FAILED", undefined, {
        transactionOutcome: "UNKNOWN"
      });
    }
    return result;
  } finally {
    try {
      client.release?.(destroyClient);
    } catch {
      // Release failures do not change the already-observed transaction result.
    }
  }
}

export async function executeRead<T>(
  pool: SqlPool,
  operation: (client: SqlClient) => Promise<T>,
  context?: TransactionSecurityContext
): Promise<T> {
  if (context) return withTransaction(pool, operation, context);
  let client: SqlClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw mapDatabaseError(error, "connect");
  }
  try {
    return await operation(client);
  } catch (error) {
    if (error instanceof OperationalStateError) throw error;
    throw mapDatabaseError(error, "transaction");
  } finally {
    try {
      client.release?.();
    } catch {
      // See withTransaction: connection cleanup is best effort after a bounded result exists.
    }
  }
}
