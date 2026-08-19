import type { Actor } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

export interface TenantScope {
  readonly organizationId: string;
  readonly workspaceId: string;
}

export interface TransactionSecurityContext extends TenantScope {
  readonly principalId: string;
  readonly principalType: "USER" | "SERVICE" | "AGENT" | "SYSTEM";
  readonly sessionId?: string;
  /** Reserved only for a server-side synthetic bootstrap transaction. */
  readonly bootstrap?: boolean;
  readonly humanPrincipalId?: string;
  readonly runtimePrincipalType?: "HTTP" | "EVE" | "JOB_WORKER" | "SYSTEM";
  readonly runtimePrincipalId?: string;
  readonly requestId?: string;
}

export interface OperationalSecurityContext extends TransactionSecurityContext {
  readonly actor?: Actor;
}

export function scopeKey(scope: TenantScope): string {
  return `${scope.organizationId}:${scope.workspaceId}`;
}

export function assertTenantScope(scope: TenantScope): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(scope.organizationId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(scope.workspaceId)
  ) {
    throw new OperationalStateError("INVALID_CONFIGURATION");
  }
}
