-- ML-103 stores structural source observations beside the immutable ML-102
-- source artifact. The document is bounded metadata and locator evidence only;
-- original bytes and row-level records remain in the private object store.

CREATE TABLE IF NOT EXISTS mef_source_observations (
  source_observation_id text PRIMARY KEY CHECK (source_observation_id ~ '^sob_[a-z0-9][a-z0-9_-]{0,127}$'),
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  source_artifact_id text NOT NULL,
  source_content_sha256 text NOT NULL CHECK (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_id text NOT NULL CHECK (length(adapter_id) BETWEEN 1 AND 256),
  adapter_version text NOT NULL CHECK (adapter_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  adk_api_version text NOT NULL CHECK (adk_api_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  adapter_qualification text NOT NULL CHECK (adapter_qualification IN ('reference', 'unqualified', 'qualified')),
  schema_fingerprint text NOT NULL CHECK (schema_fingerprint ~ '^[0-9a-f]{64}$'),
  observation_sha256 text NOT NULL CHECK (observation_sha256 ~ '^[0-9a-f]{64}$'),
  observation_document jsonb NOT NULL CHECK (jsonb_typeof(observation_document) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, workspace_id, source_artifact_id, adapter_id, adapter_version, adk_api_version),
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
    REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
    ON DELETE RESTRICT,
  CHECK (observation_document->>'sourceArtifactId' = source_artifact_id),
  CHECK (observation_document->>'sourceContentSha256' = source_content_sha256),
  CHECK (observation_document->>'schemaFingerprint' = schema_fingerprint),
  CHECK (observation_document->>'observationSha256' = observation_sha256)
);

CREATE INDEX IF NOT EXISTS mef_source_observations_scope_created_idx
  ON mef_source_observations (organization_id, workspace_id, created_at DESC, source_observation_id DESC);

CREATE OR REPLACE FUNCTION mef_reject_source_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'source observations are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_source_observation_append_only ON mef_source_observations;
CREATE TRIGGER mef_source_observation_append_only
  BEFORE UPDATE OR DELETE ON mef_source_observations
  FOR EACH ROW EXECUTE FUNCTION mef_reject_source_observation_mutation();
ALTER TABLE mef_source_observations ENABLE ALWAYS TRIGGER mef_source_observation_append_only;

ALTER TABLE mef_source_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_source_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mef_source_observation_tenant_scope_policy ON mef_source_observations;
CREATE POLICY mef_source_observation_tenant_scope_policy ON mef_source_observations
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND workspace_id = nullif(current_setting('mef.workspace_id', true), '')
    AND (
      mef_bootstrap_enabled()
      OR EXISTS (
        SELECT 1 FROM mef_workspace_members AS member
        WHERE member.organization_id = mef_source_observations.organization_id
          AND member.workspace_id = mef_source_observations.workspace_id
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
        WHERE member.organization_id = mef_source_observations.organization_id
          AND member.workspace_id = mef_source_observations.workspace_id
          AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
      )
    )
  );

REVOKE ALL ON mef_source_observations FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON mef_source_observations FROM PUBLIC;

COMMENT ON TABLE mef_source_observations IS 'ML-103 append-only structural observations; never contains original bytes or row-level records.';
