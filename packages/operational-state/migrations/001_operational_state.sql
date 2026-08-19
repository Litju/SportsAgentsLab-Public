CREATE TABLE IF NOT EXISTS mef_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);

CREATE OR REPLACE FUNCTION mef_reject_migration_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'migration history is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_schema_migrations_append_only ON mef_schema_migrations;
CREATE TRIGGER mef_schema_migrations_append_only
  BEFORE UPDATE OR DELETE ON mef_schema_migrations
  FOR EACH ROW EXECUTE FUNCTION mef_reject_migration_mutation();
ALTER TABLE mef_schema_migrations ENABLE ALWAYS TRIGGER mef_schema_migrations_append_only;
REVOKE UPDATE, DELETE ON mef_schema_migrations FROM PUBLIC;
REVOKE TRUNCATE ON mef_schema_migrations FROM PUBLIC;

CREATE OR REPLACE FUNCTION mef_valid_entity_reference(entity_type text, object_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(CASE entity_type
    WHEN 'SourceArtifact' THEN object_id ~ '^src_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'ImportAttempt' THEN object_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'CanonicalAcquisition' THEN object_id ~ '^acq_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'ConfigurationContract' THEN object_id ~ '^cfg_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'ProtocolContract' THEN object_id ~ '^pro_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'Trial' THEN object_id ~ '^trl_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'Session' THEN object_id ~ '^ses_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'MetricObservation' THEN object_id ~ '^met_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'ReferenceEpoch' THEN object_id ~ '^epoch_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'InferenceResult' THEN object_id ~ '^inf_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'EvidenceManifest' THEN object_id ~ '^evm_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'PractitionerDecision' THEN object_id ~ '^dec_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'AgentContext' THEN object_id ~ '^ctx_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'AuditEvent' THEN object_id ~ '^aud_[a-z0-9][a-z0-9_-]{0,127}$'
    ELSE false
  END, false);
$$;

CREATE OR REPLACE FUNCTION mef_valid_object_reference(reference jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_typeof(reference) = 'object'
    AND reference ? 'entity_type'
    AND reference ? 'object_id'
    AND (reference - 'entity_type' - 'object_id') = '{}'::jsonb
    AND jsonb_typeof(reference->'entity_type') = 'string'
    AND jsonb_typeof(reference->'object_id') = 'string'
    AND mef_valid_entity_reference(reference->>'entity_type', reference->>'object_id'), false);
$$;

CREATE TABLE IF NOT EXISTS mef_source_artifacts (
  source_artifact_id text PRIMARY KEY CHECK (source_artifact_id ~ '^src_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('REGISTERED', 'VERIFIED', 'INVALID')),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  media_type text NOT NULL CHECK (media_type ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 512),
  ingested_at timestamptz NOT NULL,
  source_declaration jsonb NOT NULL CHECK (jsonb_typeof(source_declaration) = 'object'),
  immutable_source boolean NOT NULL CHECK (immutable_source = true),
  storage_key text NOT NULL,
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  CHECK (storage_key = 'originals/sha256/' || content_hash),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'SourceArtifact'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/source-artifact.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'source_artifact_id' = source_artifact_id
    AND record_json->>'record_version' = record_version::text
    AND (record_json->>'created_at')::timestamptz = created_at
    AND record_json->>'lifecycle_state' = lifecycle_state
    AND record_json->>'content_hash' = content_hash
    AND record_json->>'byte_size' = byte_size::text
    AND record_json->>'media_type' = media_type
    AND record_json->>'original_filename' = original_filename
    AND (record_json->>'ingested_at')::timestamptz = ingested_at
    AND record_json->'source_declaration' = source_declaration
    AND (record_json->>'immutable_source')::boolean = immutable_source,
    false))
);

CREATE INDEX IF NOT EXISTS mef_source_artifacts_content_hash_idx
  ON mef_source_artifacts (content_hash);

CREATE OR REPLACE FUNCTION mef_reject_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'source artifact records are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_source_artifact_immutable ON mef_source_artifacts;
CREATE TRIGGER mef_source_artifact_immutable
  BEFORE UPDATE OR DELETE ON mef_source_artifacts
  FOR EACH ROW EXECUTE FUNCTION mef_reject_source_mutation();
ALTER TABLE mef_source_artifacts ENABLE ALWAYS TRIGGER mef_source_artifact_immutable;

-- Founder-approved ML-96 boundary: ImportAttempt rows are immutable historical
-- domain records. attempt_state is an admission/outcome classification only;
-- Job execution lifecycle is owned by downstream work and is not persisted here.
CREATE TABLE IF NOT EXISTS mef_import_attempts (
  import_attempt_id text PRIMARY KEY CHECK (import_attempt_id ~ '^imp_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  source_artifact_id text NOT NULL REFERENCES mef_source_artifacts(source_artifact_id) ON DELETE RESTRICT,
  attempt_number bigint NOT NULL CHECK (attempt_number BETWEEN 1 AND 9007199254740991),
  attempted_at timestamptz NOT NULL,
  attempt_state text NOT NULL CHECK (attempt_state IN ('RECEIVED', 'VALIDATING', 'ACCEPTED', 'REJECTED', 'UNSUPPORTED', 'FAILED')),
  errors jsonb NOT NULL CHECK (jsonb_typeof(errors) = 'array'),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  UNIQUE (source_artifact_id, attempt_number),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'ImportAttempt'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/import-attempt.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'import_attempt_id' = import_attempt_id
    AND record_json->>'record_version' = record_version::text
    AND record_json->>'source_artifact_id' = source_artifact_id
    AND record_json->>'attempt_number' = attempt_number::text
    AND (record_json->>'attempted_at')::timestamptz = attempted_at
    AND record_json->>'attempt_state' = attempt_state
    AND record_json->'errors' = errors,
    false))
);

CREATE OR REPLACE FUNCTION mef_reject_import_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'import attempts are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_import_attempt_append_only ON mef_import_attempts;
CREATE TRIGGER mef_import_attempt_append_only
  BEFORE UPDATE OR DELETE ON mef_import_attempts
  FOR EACH ROW EXECUTE FUNCTION mef_reject_import_attempt_mutation();
ALTER TABLE mef_import_attempts ENABLE ALWAYS TRIGGER mef_import_attempt_append_only;

CREATE TABLE IF NOT EXISTS mef_audit_events (
  audit_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audit_event_id text NOT NULL UNIQUE CHECK (audit_event_id ~ '^aud_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  occurred_at timestamptz NOT NULL,
  actor jsonb NOT NULL CHECK (jsonb_typeof(actor) = 'object'),
  audit_action text NOT NULL CHECK (audit_action IN ('CREATED', 'VALIDATED', 'STATE_CHANGED', 'OVERRIDDEN', 'APPROVED', 'REJECTED', 'LINKED', 'UNLINKED')),
  object_reference jsonb NOT NULL CHECK (mef_valid_object_reference(object_reference)),
  authority_type text NOT NULL CHECK (authority_type IN ('SYSTEM', 'MACHINE', 'HUMAN_PRACTITIONER', 'AGENT_DRAFT')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  prior_reference jsonb CHECK (prior_reference IS NULL OR mef_valid_object_reference(prior_reference)),
  new_reference jsonb CHECK (new_reference IS NULL OR mef_valid_object_reference(new_reference)),
  immutable_history boolean NOT NULL CHECK (immutable_history = true),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'AuditEvent'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/audit-event.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'audit_event_id' = audit_event_id
    AND record_json->>'record_version' = record_version::text
    AND (record_json->>'occurred_at')::timestamptz = occurred_at
    AND record_json->'actor' = actor
    AND record_json->>'audit_action' = audit_action
    AND record_json->'object' = object_reference
    AND record_json->>'authority_type' = authority_type
    AND record_json->>'reason' = reason
    AND ((record_json->>'prior_reference' IS NULL AND prior_reference IS NULL) OR record_json->'prior_reference' = prior_reference)
    AND ((record_json->>'new_reference' IS NULL AND new_reference IS NULL) OR record_json->'new_reference' = new_reference)
    AND (record_json->>'immutable_history')::boolean = immutable_history,
    false))
);

CREATE OR REPLACE FUNCTION mef_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit event history is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_audit_event_append_only ON mef_audit_events;
CREATE TRIGGER mef_audit_event_append_only
  BEFORE UPDATE OR DELETE ON mef_audit_events
  FOR EACH ROW EXECUTE FUNCTION mef_reject_audit_mutation();
ALTER TABLE mef_audit_events ENABLE ALWAYS TRIGGER mef_audit_event_append_only;
REVOKE UPDATE, DELETE ON mef_audit_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION mef_entity_reference_exists(entity_type text, object_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT mef_valid_entity_reference(entity_type, object_id) THEN
    RETURN false;
  END IF;
  CASE entity_type
    WHEN 'SourceArtifact' THEN
      RETURN EXISTS (SELECT 1 FROM mef_source_artifacts WHERE source_artifact_id = object_id);
    WHEN 'ImportAttempt' THEN
      RETURN EXISTS (SELECT 1 FROM mef_import_attempts WHERE import_attempt_id = object_id);
    WHEN 'AuditEvent' THEN
      RETURN EXISTS (SELECT 1 FROM mef_audit_events WHERE audit_event_id = object_id);
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE TABLE IF NOT EXISTS mef_provenance_references (
  provenance_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_entity_type text NOT NULL,
  from_object_id text NOT NULL,
  to_entity_type text NOT NULL,
  to_object_id text NOT NULL,
  relation text NOT NULL CHECK (relation ~ '^[A-Z][A-Z0-9_:-]{1,127}$'),
  created_at timestamptz NOT NULL,
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  CHECK (mef_entity_reference_exists(from_entity_type, from_object_id)),
  CHECK (mef_entity_reference_exists(to_entity_type, to_object_id)),
  CHECK (COALESCE(
    record_json->'from' = jsonb_build_object('entity_type', from_entity_type, 'object_id', from_object_id)
    AND record_json->'to' = jsonb_build_object('entity_type', to_entity_type, 'object_id', to_object_id)
    AND record_json->>'relation' = relation
    AND (record_json->>'created_at')::timestamptz = created_at,
    false)),
  CHECK (COALESCE(
    (record_json - 'from' - 'to' - 'relation' - 'created_at') = '{}'::jsonb,
    false)),
  UNIQUE (from_entity_type, from_object_id, to_entity_type, to_object_id, relation)
);

CREATE OR REPLACE FUNCTION mef_reject_provenance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'provenance references are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_provenance_append_only ON mef_provenance_references;
CREATE TRIGGER mef_provenance_append_only
  BEFORE UPDATE OR DELETE ON mef_provenance_references
  FOR EACH ROW EXECUTE FUNCTION mef_reject_provenance_mutation();
ALTER TABLE mef_provenance_references ENABLE ALWAYS TRIGGER mef_provenance_append_only;
REVOKE UPDATE, DELETE ON mef_provenance_references FROM PUBLIC;
REVOKE TRUNCATE ON mef_provenance_references FROM PUBLIC;

CREATE TABLE IF NOT EXISTS mef_artifact_retention (
  source_artifact_id text PRIMARY KEY REFERENCES mef_source_artifacts(source_artifact_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('UNRESOLVED', 'RETAIN', 'HOLD', 'ELIGIBLE')),
  policy_reference text CHECK (policy_reference IS NULL OR length(policy_reference) BETWEEN 1 AND 512),
  hold_state boolean NOT NULL DEFAULT false,
  assessed_at text CHECK (assessed_at IS NULL OR assessed_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK ((status = 'UNRESOLVED' AND hold_state = false) OR status <> 'UNRESOLVED'),
  CHECK ((status = 'UNRESOLVED') OR policy_reference IS NOT NULL),
  CHECK ((status = 'HOLD' AND hold_state = true) OR (status <> 'HOLD' AND hold_state = false))
);

CREATE OR REPLACE FUNCTION mef_validate_retention_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'retention revision must advance by one' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mef_retention_revision_guard ON mef_artifact_retention;
CREATE TRIGGER mef_retention_revision_guard
  BEFORE UPDATE ON mef_artifact_retention
  FOR EACH ROW EXECUTE FUNCTION mef_validate_retention_revision();
ALTER TABLE mef_artifact_retention ENABLE ALWAYS TRIGGER mef_retention_revision_guard;

CREATE OR REPLACE FUNCTION mef_reject_retention_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'retention records cannot be deleted by operational persistence' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_retention_no_delete ON mef_artifact_retention;
CREATE TRIGGER mef_retention_no_delete
  BEFORE DELETE ON mef_artifact_retention
  FOR EACH ROW EXECUTE FUNCTION mef_reject_retention_delete();
ALTER TABLE mef_artifact_retention ENABLE ALWAYS TRIGGER mef_retention_no_delete;

REVOKE UPDATE, DELETE ON mef_source_artifacts FROM PUBLIC;
REVOKE UPDATE, DELETE ON mef_import_attempts FROM PUBLIC;
REVOKE DELETE ON mef_artifact_retention FROM PUBLIC;
REVOKE TRUNCATE ON mef_source_artifacts, mef_import_attempts, mef_audit_events, mef_artifact_retention FROM PUBLIC;
