-- ML-105 persists only the deterministic configuration-resolution result beside
-- the accepted ML-104 canonical acquisition. Raw bytes and signal rows remain
-- outside Postgres in the existing private object store.

CREATE TABLE IF NOT EXISTS mef_ml105_configuration_resolutions (
  resolution_sha256 text NOT NULL CHECK (resolution_sha256 ~ '^[0-9a-f]{64}$'),
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  import_attempt_id text NOT NULL CHECK (import_attempt_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  source_artifact_id text NOT NULL CHECK (source_artifact_id ~ '^src_[a-z0-9][a-z0-9_-]{0,127}$'),
  source_observation_id text NOT NULL CHECK (source_observation_id ~ '^sob_[a-z0-9][a-z0-9_-]{0,127}$'),
  canonical_acquisition_id text NOT NULL CHECK (canonical_acquisition_id ~ '^acq_[a-z0-9][a-z0-9_-]{0,127}$'),
  canonical_identity_sha256 text NOT NULL CHECK (canonical_identity_sha256 ~ '^[0-9a-f]{64}$'),
  resolver_version text NOT NULL CHECK (resolver_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  authority_version text NOT NULL CHECK (length(authority_version) BETWEEN 1 AND 256),
  configuration_state text NOT NULL CHECK (configuration_state IN (
    'RESOLVED_QUALIFIED', 'RESOLVED_UNQUALIFIED', 'PARTIALLY_RESOLVED',
    'CONFLICTING_METADATA', 'UNRESOLVED'
  )),
  physical_contract text NOT NULL CHECK (physical_contract IN (
    'single.total_fz', 'dual.independent_fz', 'UNKNOWN', 'UNSUPPORTED'
  )),
  resolution_document jsonb NOT NULL CHECK (jsonb_typeof(resolution_document) = 'object'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, workspace_id, resolution_sha256),
  UNIQUE (organization_id, workspace_id, canonical_identity_sha256, resolver_version, authority_version),
  CHECK (resolution_document->'resolution'->>'resolution_sha256' = resolution_sha256),
  CHECK (resolution_document->'resolution'->>'source_artifact_id' = source_artifact_id),
  CHECK (resolution_document->'resolution'->>'source_observation_id' = source_observation_id),
  CHECK (resolution_document->'resolution'->>'canonical_acquisition_id' = canonical_acquisition_id),
  CHECK (resolution_document->'resolution'->>'canonical_identity_sha256' = canonical_identity_sha256),
  CHECK (resolution_document->'resolution'->>'resolver_version' = resolver_version),
  CHECK (resolution_document->'resolution'->>'authority_version' = authority_version),
  CHECK (resolution_document->'resolution'->>'configuration_state' = configuration_state),
  CHECK (resolution_document->'resolution'->'physical_contract'->>'contract' = physical_contract),
  FOREIGN KEY (organization_id, workspace_id, import_attempt_id)
    REFERENCES mef_ml102_import_attempts (organization_id, workspace_id, import_attempt_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
    REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, source_observation_id)
    REFERENCES mef_source_observations (organization_id, workspace_id, source_observation_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (canonical_acquisition_id)
    REFERENCES mef_ml104_canonical_acquisitions (canonical_acquisition_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mef_ml105_configuration_resolutions_scope_created_idx
  ON mef_ml105_configuration_resolutions (organization_id, workspace_id, created_at DESC, resolution_sha256 DESC);

CREATE OR REPLACE FUNCTION mef_reject_ml105_configuration_resolution_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ML-105 configuration resolutions are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_ml105_configuration_resolution_append_only ON mef_ml105_configuration_resolutions;
CREATE TRIGGER mef_ml105_configuration_resolution_append_only
  BEFORE UPDATE OR DELETE ON mef_ml105_configuration_resolutions
  FOR EACH ROW EXECUTE FUNCTION mef_reject_ml105_configuration_resolution_mutation();
ALTER TABLE mef_ml105_configuration_resolutions ENABLE ALWAYS TRIGGER mef_ml105_configuration_resolution_append_only;

ALTER TABLE mef_ml105_configuration_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_ml105_configuration_resolutions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mef_ml105_configuration_resolution_tenant_scope_policy ON mef_ml105_configuration_resolutions;
CREATE POLICY mef_ml105_configuration_resolution_tenant_scope_policy ON mef_ml105_configuration_resolutions
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND workspace_id = nullif(current_setting('mef.workspace_id', true), '')
    AND (
      mef_bootstrap_enabled()
      OR EXISTS (
        SELECT 1 FROM mef_workspace_members AS member
        WHERE member.organization_id = mef_ml105_configuration_resolutions.organization_id
          AND member.workspace_id = mef_ml105_configuration_resolutions.workspace_id
          AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
      )
    )
  )
  WITH CHECK (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND workspace_id = nullif(current_setting('mef.workspace_id', true), '')
    AND (
      mef_bootstrap_enabled()
      OR EXISTS (
        SELECT 1 FROM mef_workspace_members AS member
        WHERE member.organization_id = mef_ml105_configuration_resolutions.organization_id
          AND member.workspace_id = mef_ml105_configuration_resolutions.workspace_id
          AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
      )
    )
  );

REVOKE ALL ON mef_ml105_configuration_resolutions FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON mef_ml105_configuration_resolutions FROM PUBLIC;

COMMENT ON TABLE mef_ml105_configuration_resolutions IS 'ML-105 append-only force-plate configuration and sample-rate resolution metadata; no raw signals or row-level payloads are stored.';
