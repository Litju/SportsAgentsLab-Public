import {
  CONFIGURATION_AUTHORITY_VERSION,
  CONFIGURATION_RESOLVER_VERSION,
  resolveAcquisitionConfiguration,
  type ConfigurationResolutionResult
} from "@mef/acquisition-configuration";
import type { RequestPrincipal } from "@mef/control-api";
import {
  OperationalStateError,
  PostgresOperationalStore,
  type ConfigurationResolutionRecord,
  type SourceImportAttempt
} from "@mef/operational-state";
import { getSourceObservation, getCanonicalAcquisition } from "./source-import.ts";
import { toOperationalSecurityContext } from "./authz.ts";
import { ensureApplicationMigrations, verifyRuntimeRole } from "./job-runtime.ts";
import { getTenantDatabasePool } from "./tenant-db.ts";

const runtimeRoleChecks = new WeakMap<object, Promise<void>>();

function now(): string {
  return new Date().toISOString();
}

async function database(principal: RequestPrincipal): Promise<PostgresOperationalStore> {
  await ensureApplicationMigrations();
  const pool = getTenantDatabasePool();
  if (!pool) throw new OperationalStateError("DATABASE_UNAVAILABLE");
  const roleCheck = runtimeRoleChecks.get(pool) ?? verifyRuntimeRole(pool);
  runtimeRoleChecks.set(pool, roleCheck);
  await roleCheck;
  return new PostgresOperationalStore(pool, toOperationalSecurityContext(principal));
}

function response(
  status: "CONFIGURATION_RESOLUTION_RECORDED" | "CONFIGURATION_RESOLUTION_REUSED",
  attempt: SourceImportAttempt,
  result: ConfigurationResolutionResult | ConfigurationResolutionRecord,
  sourceObservationId: string
) {
  const document = "resolutionDocument" in result ? result.resolutionDocument : result;
  return {
    status,
    attempt,
    sourceObservationId,
    resolution: document.resolution,
    contract: document.contract
  } as const;
}

export async function resolveSourceImportConfiguration(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}) {
  const observation = await getSourceObservation(input);
  if (!observation) throw new OperationalStateError("CONTRACT_INVALID", "Run adapter inspection before configuration resolution.");
  const canonical = await getCanonicalAcquisition(input);
  if (!canonical) throw new OperationalStateError("CONTRACT_INVALID", "Run canonical acquisition before configuration resolution.");

  const databaseStore = await database(input.principal);
  const existing = await databaseStore.findConfigurationResolution({
    canonicalIdentitySha256: canonical.acquisition.canonical_identity_sha256,
    resolverVersion: CONFIGURATION_RESOLVER_VERSION,
    authorityVersion: CONFIGURATION_AUTHORITY_VERSION
  });
  if (existing) return response("CONFIGURATION_RESOLUTION_REUSED", canonical.attempt, existing, observation.sourceObservationId);

  const result = resolveAcquisitionConfiguration({
    canonicalAcquisition: canonical.acquisition,
    sourceObservation: observation.observation,
    createdAt: now()
  });
  const record: ConfigurationResolutionRecord = {
    resolutionSha256: result.resolution.resolution_sha256,
    organizationId: toOperationalSecurityContext(input.principal).organizationId,
    workspaceId: toOperationalSecurityContext(input.principal).workspaceId,
    importAttemptId: canonical.attempt.importAttemptId,
    sourceArtifactId: result.resolution.source_artifact_id,
    sourceObservationId: result.resolution.source_observation_id,
    canonicalAcquisitionId: result.resolution.canonical_acquisition_id,
    canonicalIdentitySha256: result.resolution.canonical_identity_sha256,
    resolverVersion: result.resolution.resolver_version,
    authorityVersion: result.resolution.authority_version,
    configurationState: result.resolution.configuration_state,
    physicalContract: result.resolution.physical_contract.contract,
    resolutionDocument: result,
    createdAt: result.contract.created_at
  };
  const stored = await databaseStore.insertOrGetConfigurationResolution(record);
  return response(
    stored.resolutionSha256 === record.resolutionSha256 ? "CONFIGURATION_RESOLUTION_RECORDED" : "CONFIGURATION_RESOLUTION_REUSED",
    canonical.attempt,
    stored,
    observation.sourceObservationId
  );
}

export async function getSourceImportConfiguration(input: {
  readonly principal: RequestPrincipal;
  readonly importAttemptId: string;
}) {
  const canonical = await getCanonicalAcquisition(input);
  if (!canonical) return undefined;
  const store = await database(input.principal);
  const stored = await store.findConfigurationResolution({
    canonicalIdentitySha256: canonical.acquisition.canonical_identity_sha256,
    resolverVersion: CONFIGURATION_RESOLVER_VERSION,
    authorityVersion: CONFIGURATION_AUTHORITY_VERSION
  });
  return stored ? response("CONFIGURATION_RESOLUTION_REUSED", canonical.attempt, stored, canonical.sourceObservationId) : undefined;
}
