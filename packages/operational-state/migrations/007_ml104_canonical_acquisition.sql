-- ML-104 stores canonical measurement representation metadata and integrity
-- findings beside the accepted ML-103 observation. Canonical signal bytes are
-- kept in the existing private content-addressed object store.

CREATE UNIQUE INDEX IF NOT EXISTS mef_source_observations_scope_identity_uq
  ON mef_source_observations (organization_id, workspace_id, source_observation_id);

CREATE TABLE IF NOT EXISTS mef_ml104_canonical_acquisitions (
  canonical_acquisition_id text PRIMARY KEY CHECK (canonical_acquisition_id ~ '^acq_[a-z0-9][a-z0-9_-]{0,127}$'),
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  import_attempt_id text NOT NULL CHECK (import_attempt_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  source_artifact_id text NOT NULL CHECK (source_artifact_id ~ '^src_[a-z0-9][a-z0-9_-]{0,127}$'),
  source_observation_id text NOT NULL CHECK (source_observation_id ~ '^sob_[a-z0-9][a-z0-9_-]{0,127}$'),
  canonicalizer_version text NOT NULL CHECK (canonicalizer_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  mapping_manifest_sha256 text NOT NULL CHECK (mapping_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  signal_artifact_sha256 text NOT NULL CHECK (signal_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  signal_artifact_key text NOT NULL CHECK (signal_artifact_key = 'canonical/sha256/' || signal_artifact_sha256),
  canonical_identity_sha256 text NOT NULL CHECK (canonical_identity_sha256 ~ '^[0-9a-f]{64}$'),
  acquisition_document jsonb NOT NULL CHECK (jsonb_typeof(acquisition_document) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, workspace_id, source_artifact_id, source_observation_id, canonicalizer_version, mapping_manifest_sha256),
  UNIQUE (organization_id, workspace_id, canonical_identity_sha256),
  CHECK (acquisition_document->>'canonical_acquisition_id' = canonical_acquisition_id),
  CHECK (acquisition_document->>'source_artifact_id' = source_artifact_id),
  CHECK (acquisition_document->>'source_observation_id' = source_observation_id),
  CHECK (acquisition_document->>'canonicalizer_version' = canonicalizer_version),
  CHECK (acquisition_document->>'mapping_manifest_sha256' = mapping_manifest_sha256),
  CHECK (acquisition_document->>'signal_artifact_sha256' = signal_artifact_sha256),
  CHECK (acquisition_document->>'canonical_identity_sha256' = canonical_identity_sha256),
  CHECK (acquisition_document->'signal_artifact'->>'content_hash' = signal_artifact_sha256),
  CHECK (acquisition_document->'signal_artifact'->>'storage_key' = signal_artifact_key),
  FOREIGN KEY (organization_id, workspace_id, import_attempt_id)
    REFERENCES mef_ml102_import_attempts (organization_id, workspace_id, import_attempt_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
    REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, source_observation_id)
    REFERENCES mef_source_observations (organization_id, workspace_id, source_observation_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mef_ml104_canonical_acquisitions_scope_created_idx
  ON mef_ml104_canonical_acquisitions (organization_id, workspace_id, created_at DESC, canonical_acquisition_id DESC);

CREATE OR REPLACE FUNCTION mef_reject_ml104_canonical_acquisition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ML-104 canonical acquisitions are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_ml104_canonical_acquisition_append_only ON mef_ml104_canonical_acquisitions;
CREATE TRIGGER mef_ml104_canonical_acquisition_append_only
  BEFORE UPDATE OR DELETE ON mef_ml104_canonical_acquisitions
  FOR EACH ROW EXECUTE FUNCTION mef_reject_ml104_canonical_acquisition_mutation();
ALTER TABLE mef_ml104_canonical_acquisitions ENABLE ALWAYS TRIGGER mef_ml104_canonical_acquisition_append_only;

ALTER TABLE mef_ml104_canonical_acquisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_ml104_canonical_acquisitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mef_ml104_canonical_acquisition_tenant_scope_policy ON mef_ml104_canonical_acquisitions;
CREATE POLICY mef_ml104_canonical_acquisition_tenant_scope_policy ON mef_ml104_canonical_acquisitions
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND workspace_id = nullif(current_setting('mef.workspace_id', true), '')
    AND (
      mef_bootstrap_enabled()
      OR EXISTS (
        SELECT 1 FROM mef_workspace_members AS member
        WHERE member.organization_id = mef_ml104_canonical_acquisitions.organization_id
          AND member.workspace_id = mef_ml104_canonical_acquisitions.workspace_id
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
        WHERE member.organization_id = mef_ml104_canonical_acquisitions.organization_id
          AND member.workspace_id = mef_ml104_canonical_acquisitions.workspace_id
          AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
      )
    )
  );

REVOKE ALL ON mef_ml104_canonical_acquisitions FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON mef_ml104_canonical_acquisitions FROM PUBLIC;

COMMENT ON TABLE mef_ml104_canonical_acquisitions IS 'ML-104 append-only canonical acquisition metadata, lineage, integrity report, and private derived artifact identity; no signal rows are stored in Postgres.';
