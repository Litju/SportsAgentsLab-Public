-- ML-102 adds a mutable upload-attempt aggregate beside the frozen ML-96
-- SourceArtifact and ImportAttempt records. The aggregate is tenant-scoped,
-- while its event and content-identity tables remain append-only.

CREATE TABLE IF NOT EXISTS mef_ml102_import_attempts (
  import_attempt_id text PRIMARY KEY CHECK (import_attempt_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  principal_id text NOT NULL CHECK (length(principal_id) BETWEEN 1 AND 256),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  attempt_number bigint NOT NULL CHECK (attempt_number BETWEEN 1 AND 9007199254740991),
  source_artifact_id text,
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 512),
  declared_content_type text NOT NULL CHECK (declared_content_type ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'),
  declared_size_bytes bigint NOT NULL CHECK (declared_size_bytes >= 0),
  actual_size_bytes bigint CHECK (actual_size_bytes IS NULL OR actual_size_bytes >= 0),
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  storage_key text,
  staging_blob_path text NOT NULL CHECK (staging_blob_path ~ '^staging/ml102/imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  state text NOT NULL CHECK (state IN (
    'CREATED', 'UPLOAD_AUTHORIZED', 'UPLOADING', 'UPLOADED', 'IDENTIFYING',
    'IDENTIFIED', 'STORED', 'READY_FOR_ADAPTER', 'UNSUPPORTED', 'MALFORMED',
    'UPLOAD_FAILED', 'STORAGE_FAILED', 'HASH_FAILED', 'FINALIZATION_FAILED',
    'CANCELLED', 'BLOCKED'
  )),
  failure_code text CHECK (failure_code IS NULL OR failure_code IN (
    'EMPTY_INPUT', 'DECLARED_SIZE_MISMATCH', 'DECLARED_MEDIA_TYPE_MISMATCH',
    'OVERSIZE_INPUT', 'UNSUPPORTED_MEDIA_TYPE', 'UPLOAD_TRANSPORT_FAILED',
    'STORAGE_READ_FAILED', 'STORAGE_WRITE_FAILED', 'HASH_VERIFICATION_FAILED',
    'DATABASE_FINALIZATION_FAILED', 'INVALID_UPLOAD_FINALIZATION',
    'ASSOCIATION_UNAVAILABLE', 'CANCELLED_BY_USER'
  )),
  safe_failure_detail text CHECK (safe_failure_detail IS NULL OR length(safe_failure_detail) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL,
  upload_started_at timestamptz,
  upload_completed_at timestamptz,
  identity_completed_at timestamptz,
  finalized_at timestamptz,
  athlete_id text,
  session_id text,
  duplicate_of_import_attempt_id text,
  audit_event_id text,
  scientific_eligibility text NOT NULL DEFAULT 'INELIGIBLE' CHECK (scientific_eligibility = 'INELIGIBLE'),
  UNIQUE (organization_id, workspace_id, import_attempt_id),
  CHECK (storage_key IS NULL OR storage_key = 'originals/sha256/' || content_hash),
  CHECK ((content_hash IS NULL) = (actual_size_bytes IS NULL AND storage_key IS NULL)),
  CHECK (source_artifact_id IS NULL OR source_artifact_id ~ '^src_[a-z0-9][a-z0-9_-]{0,127}$'),
  CHECK (duplicate_of_import_attempt_id IS NULL OR duplicate_of_import_attempt_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  CHECK (athlete_id IS NULL AND session_id IS NULL)
);

ALTER TABLE mef_ml102_import_attempts
  ADD CONSTRAINT mef_ml102_import_attempts_source_scope_fkey
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
  REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
  ON DELETE RESTRICT;

ALTER TABLE mef_ml102_import_attempts
  ADD CONSTRAINT mef_ml102_import_attempts_duplicate_scope_fkey
  FOREIGN KEY (organization_id, workspace_id, duplicate_of_import_attempt_id)
  REFERENCES mef_ml102_import_attempts (organization_id, workspace_id, import_attempt_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS mef_ml102_import_attempts_scope_created_idx
  ON mef_ml102_import_attempts (organization_id, workspace_id, created_at DESC, import_attempt_id DESC);
CREATE INDEX IF NOT EXISTS mef_ml102_import_attempts_scope_hash_idx
  ON mef_ml102_import_attempts (organization_id, workspace_id, content_hash);

CREATE OR REPLACE FUNCTION mef_ml102_import_attempt_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.principal_id <> OLD.principal_id
     OR NEW.import_attempt_id <> OLD.import_attempt_id
     OR NEW.attempt_number <> OLD.attempt_number
     OR NEW.original_filename <> OLD.original_filename
     OR NEW.declared_content_type <> OLD.declared_content_type
     OR NEW.declared_size_bytes <> OLD.declared_size_bytes
     OR NEW.staging_blob_path <> OLD.staging_blob_path
     OR NEW.created_at <> OLD.created_at
     OR NEW.scientific_eligibility <> OLD.scientific_eligibility
  THEN
    RAISE EXCEPTION 'ML-102 upload identity is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.source_artifact_id IS NOT NULL AND NEW.source_artifact_id IS DISTINCT FROM OLD.source_artifact_id THEN
    RAISE EXCEPTION 'ML-102 source artifact identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.content_hash IS NOT NULL AND NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
    RAISE EXCEPTION 'ML-102 content identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.actual_size_bytes IS NOT NULL AND NEW.actual_size_bytes IS DISTINCT FROM OLD.actual_size_bytes THEN
    RAISE EXCEPTION 'ML-102 verified size is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.storage_key IS NOT NULL AND NEW.storage_key IS DISTINCT FROM OLD.storage_key THEN
    RAISE EXCEPTION 'ML-102 storage identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.audit_event_id IS NOT NULL AND NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id THEN
    RAISE EXCEPTION 'ML-102 audit identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.duplicate_of_import_attempt_id IS NOT NULL AND NEW.duplicate_of_import_attempt_id IS DISTINCT FROM OLD.duplicate_of_import_attempt_id THEN
    RAISE EXCEPTION 'ML-102 duplicate relationship is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.record_version <> OLD.record_version + 1 THEN
    RAISE EXCEPTION 'ML-102 transitions require a monotonic record version' USING ERRCODE = '55000';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
    (OLD.state = 'CREATED' AND NEW.state IN ('UPLOAD_AUTHORIZED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'UPLOAD_AUTHORIZED' AND NEW.state IN ('UPLOADING', 'UPLOAD_FAILED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'UPLOADING' AND NEW.state IN ('UPLOADED', 'UPLOAD_FAILED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'UPLOADED' AND NEW.state IN ('IDENTIFYING', 'UPLOAD_FAILED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'IDENTIFYING' AND NEW.state IN ('IDENTIFIED', 'MALFORMED', 'STORAGE_FAILED', 'HASH_FAILED', 'FINALIZATION_FAILED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'IDENTIFIED' AND NEW.state IN ('STORED', 'UNSUPPORTED', 'MALFORMED', 'STORAGE_FAILED', 'FINALIZATION_FAILED', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'STORED' AND NEW.state IN ('READY_FOR_ADAPTER', 'FINALIZATION_FAILED', 'CANCELLED')) OR
    (OLD.state = 'STORAGE_FAILED' AND NEW.state IN ('IDENTIFYING', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'HASH_FAILED' AND NEW.state IN ('IDENTIFYING', 'CANCELLED', 'BLOCKED')) OR
    (OLD.state = 'FINALIZATION_FAILED' AND NEW.state IN ('IDENTIFYING', 'CANCELLED', 'BLOCKED'))
  ) THEN
    RAISE EXCEPTION 'ML-102 import state transition is not allowed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mef_ml102_import_attempt_transition ON mef_ml102_import_attempts;
CREATE TRIGGER mef_ml102_import_attempt_transition
  BEFORE UPDATE ON mef_ml102_import_attempts
  FOR EACH ROW EXECUTE FUNCTION mef_ml102_import_attempt_transition_guard();
ALTER TABLE mef_ml102_import_attempts ENABLE ALWAYS TRIGGER mef_ml102_import_attempt_transition;

CREATE TABLE IF NOT EXISTS mef_ml102_import_events (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^imp_evt_[a-z0-9][a-z0-9_-]{0,127}$'),
  import_attempt_id text NOT NULL,
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  from_state text,
  to_state text,
  event_code text NOT NULL CHECK (event_code IN (
    'ATTEMPT_CREATED', 'UPLOAD_AUTHORIZED', 'UPLOAD_STARTED',
    'UPLOAD_COMPLETED', 'HASH_STARTED', 'HASH_VERIFIED',
    'DUPLICATE_CONTENT_DETECTED', 'SOURCE_ARTIFACT_ESTABLISHED',
    'IMPORT_UNSUPPORTED', 'IMPORT_MALFORMED', 'IMPORT_FAILED',
    'IMPORT_CANCELLED', 'ORIGINAL_BYTES_RETRIEVED',
    'FINALIZATION_FAILED', 'STORAGE_FAILED', 'HASH_FAILED',
    'ADAPTER_BOUNDARY_RECORDED'
  )),
  occurred_at timestamptz NOT NULL,
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 256),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (organization_id, workspace_id, event_id),
  CHECK (from_state IS NULL OR from_state IN (
    'CREATED', 'UPLOAD_AUTHORIZED', 'UPLOADING', 'UPLOADED', 'IDENTIFYING',
    'IDENTIFIED', 'STORED', 'READY_FOR_ADAPTER', 'UNSUPPORTED', 'MALFORMED',
    'UPLOAD_FAILED', 'STORAGE_FAILED', 'HASH_FAILED', 'FINALIZATION_FAILED',
    'CANCELLED', 'BLOCKED'
  )),
  CHECK (to_state IS NULL OR to_state IN (
    'CREATED', 'UPLOAD_AUTHORIZED', 'UPLOADING', 'UPLOADED', 'IDENTIFYING',
    'IDENTIFIED', 'STORED', 'READY_FOR_ADAPTER', 'UNSUPPORTED', 'MALFORMED',
    'UPLOAD_FAILED', 'STORAGE_FAILED', 'HASH_FAILED', 'FINALIZATION_FAILED',
    'CANCELLED', 'BLOCKED'
  )),
  FOREIGN KEY (organization_id, workspace_id, import_attempt_id)
    REFERENCES mef_ml102_import_attempts (organization_id, workspace_id, import_attempt_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mef_ml102_import_events_attempt_idx
  ON mef_ml102_import_events (organization_id, workspace_id, import_attempt_id, event_sequence);

CREATE OR REPLACE FUNCTION mef_reject_ml102_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ML-102 import events are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_ml102_import_event_append_only ON mef_ml102_import_events;
CREATE TRIGGER mef_ml102_import_event_append_only
  BEFORE UPDATE OR DELETE ON mef_ml102_import_events
  FOR EACH ROW EXECUTE FUNCTION mef_reject_ml102_event_mutation();
ALTER TABLE mef_ml102_import_events ENABLE ALWAYS TRIGGER mef_ml102_import_event_append_only;

CREATE TABLE IF NOT EXISTS mef_ml102_content_identities (
  organization_id text NOT NULL DEFAULT mef_current_organization_id(),
  workspace_id text NOT NULL DEFAULT mef_current_workspace_id(),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  first_import_attempt_id text NOT NULL,
  storage_key text NOT NULL CHECK (storage_key = 'originals/sha256/' || content_hash),
  actual_size_bytes bigint NOT NULL CHECK (actual_size_bytes >= 0),
  media_type text NOT NULL CHECK (media_type ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, workspace_id, content_hash),
  UNIQUE (organization_id, workspace_id, first_import_attempt_id),
  FOREIGN KEY (organization_id, workspace_id, first_import_attempt_id)
    REFERENCES mef_ml102_import_attempts (organization_id, workspace_id, import_attempt_id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION mef_reject_ml102_content_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ML-102 content identities are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_ml102_content_identity_immutable ON mef_ml102_content_identities;
CREATE TRIGGER mef_ml102_content_identity_immutable
  BEFORE UPDATE OR DELETE ON mef_ml102_content_identities
  FOR EACH ROW EXECUTE FUNCTION mef_reject_ml102_content_identity_mutation();
ALTER TABLE mef_ml102_content_identities ENABLE ALWAYS TRIGGER mef_ml102_content_identity_immutable;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mef_ml102_import_attempts', 'mef_ml102_import_events', 'mef_ml102_content_identities'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS mef_ml102_tenant_scope_policy ON %I', table_name);
    EXECUTE format($policy$
      CREATE POLICY mef_ml102_tenant_scope_policy ON %1$I
        USING (
          %1$I.organization_id = nullif(current_setting('mef.organization_id', true), '')
          AND %1$I.workspace_id = nullif(current_setting('mef.workspace_id', true), '')
          AND (
            mef_bootstrap_enabled()
            OR EXISTS (
              SELECT 1 FROM mef_workspace_members AS member
              WHERE member.organization_id = %1$I.organization_id
                AND member.workspace_id = %1$I.workspace_id
                AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
            )
          )
        )
        WITH CHECK (
          %1$I.organization_id = nullif(current_setting('mef.organization_id', true), '')
          AND %1$I.workspace_id = nullif(current_setting('mef.workspace_id', true), '')
          AND (
            mef_bootstrap_enabled()
            OR EXISTS (
              SELECT 1 FROM mef_workspace_members AS member
              WHERE member.organization_id = %1$I.organization_id
                AND member.workspace_id = %1$I.workspace_id
                AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
            )
          )
        )
    $policy$, table_name);
  END LOOP;
END;
$$;

REVOKE ALL ON mef_ml102_import_attempts, mef_ml102_import_events, mef_ml102_content_identities FROM PUBLIC;

COMMENT ON TABLE mef_ml102_import_attempts IS 'ML-102 mutable upload admission aggregate; canonical SourceArtifact and ImportAttempt remain immutable B00 records.';
COMMENT ON TABLE mef_ml102_import_events IS 'ML-102 append-only upload lifecycle and provenance events; contains bounded metadata only, never original bytes.';
COMMENT ON TABLE mef_ml102_content_identities IS 'ML-102 tenant/workspace-scoped SHA-256 content identity race gate.';
