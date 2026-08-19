-- ML-97 extends the ML-96 persistence substrate without changing the
-- immutability semantics of SourceArtifact or ImportAttempt.

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
    WHEN 'Command' THEN object_id ~ '^cmd_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'Job' THEN object_id ~ '^job_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'JobAttempt' THEN object_id ~ '^jatt_[a-z0-9][a-z0-9_-]{0,127}$'
    WHEN 'ProgressEvent' THEN object_id ~ '^pev_[a-z0-9][a-z0-9_-]{0,127}$'
    ELSE false
  END, false);
$$;

ALTER TABLE mef_audit_events
  DROP CONSTRAINT IF EXISTS mef_audit_events_audit_action_check;
ALTER TABLE mef_audit_events
  ADD CONSTRAINT mef_audit_events_audit_action_check CHECK (audit_action IN (
    'CREATED', 'VALIDATED', 'STATE_CHANGED', 'OVERRIDDEN', 'APPROVED',
    'REJECTED', 'LINKED', 'UNLINKED', 'COMMAND_ACCEPTED',
    'COMMAND_IDEMPOTENT_REUSED', 'JOB_CLAIMED', 'ATTEMPT_STARTED',
    'PROGRESS_RECORDED', 'RETRY_SCHEDULED', 'CANCELLATION_REQUESTED',
    'CANCELLATION_ACKNOWLEDGED', 'ATTEMPT_COMPLETED', 'JOB_SUCCEEDED',
    'JOB_FAILED', 'JOB_CANCELED', 'UNKNOWN_OUTCOME', 'RECONCILIATION_ACTION'
  ));

CREATE TABLE IF NOT EXISTS mef_commands (
  command_id text PRIMARY KEY CHECK (command_id ~ '^cmd_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version = 1),
  command_type text NOT NULL CHECK (command_type IN (
    'FIXTURE_EXECUTION', 'IMPORT', 'SCIENTIFIC_PROCESSING', 'INFERENCE',
    'EVIDENCE_ASSEMBLY', 'AUTHORIZED_ACTION'
  )),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
  semantic_input_digest text NOT NULL CHECK (semantic_input_digest ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  requested_operation text NOT NULL CHECK (requested_operation = 'EXECUTE'),
  request_reference jsonb CHECK (request_reference IS NULL OR mef_valid_object_reference(request_reference)),
  authority_context_reference jsonb NOT NULL CHECK (mef_valid_object_reference(authority_context_reference)),
  correlation_metadata jsonb NOT NULL CHECK (jsonb_typeof(correlation_metadata) = 'object'),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  UNIQUE (command_type, idempotency_key),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'Command'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/command.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'command_id' = command_id
    AND record_json->>'record_version' = record_version::text
    AND record_json->>'command_type' = command_type
    AND record_json->>'idempotency_key' = idempotency_key
    AND record_json->>'semantic_input_digest' = semantic_input_digest
    AND (record_json->>'submitted_at')::timestamptz = submitted_at
    AND record_json->'request_payload' = request_payload
    AND record_json->>'requested_operation' = requested_operation
    AND ((record_json ? 'request_reference' AND record_json->'request_reference' = request_reference)
      OR (NOT record_json ? 'request_reference' AND request_reference IS NULL))
    AND record_json->'authority_context_reference' = authority_context_reference
    AND record_json->'correlation_metadata' = correlation_metadata,
    false))
);

CREATE OR REPLACE FUNCTION mef_reject_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commands are immutable accepted requests' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_command_append_only ON mef_commands;
CREATE TRIGGER mef_command_append_only
  BEFORE UPDATE OR DELETE ON mef_commands
  FOR EACH ROW EXECUTE FUNCTION mef_reject_command_mutation();
ALTER TABLE mef_commands ENABLE ALWAYS TRIGGER mef_command_append_only;

CREATE TABLE IF NOT EXISTS mef_jobs (
  job_id text PRIMARY KEY CHECK (job_id ~ '^job_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  command_id text NOT NULL UNIQUE REFERENCES mef_commands(command_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  queued_at timestamptz NOT NULL,
  started_at timestamptz,
  updated_at timestamptz NOT NULL,
  finished_at timestamptz,
  state text NOT NULL CHECK (state IN (
    'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED', 'SUCCEEDED',
    'FAILED', 'CANCELED', 'UNKNOWN_OUTCOME'
  )),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 100),
  backoff_milliseconds bigint NOT NULL CHECK (backoff_milliseconds BETWEEN 0 AND 86400000),
  backoff_strategy text NOT NULL CHECK (backoff_strategy = 'FIXED'),
  retry_policy jsonb NOT NULL CHECK (jsonb_typeof(retry_policy) = 'object'),
  current_attempt_number integer NOT NULL CHECK (current_attempt_number BETWEEN 0 AND 100),
  next_eligible_attempt_at timestamptz,
  last_attempt_id text CHECK (last_attempt_id IS NULL OR last_attempt_id ~ '^jatt_[a-z0-9][a-z0-9_-]{0,127}$'),
  cancellation jsonb CHECK (cancellation IS NULL OR jsonb_typeof(cancellation) = 'object'),
  reconciliation_state text NOT NULL CHECK (reconciliation_state IN ('NONE', 'RECONCILIATION_REQUIRED', 'RECONCILED')),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  CHECK (retry_policy = jsonb_build_object(
    'max_attempts', max_attempts,
    'backoff_milliseconds', backoff_milliseconds,
    'backoff_strategy', backoff_strategy
  )),
  CHECK (state NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') OR finished_at IS NOT NULL),
  CHECK (state <> 'SUCCEEDED' OR result IS NOT NULL),
  CHECK (state NOT IN ('FAILED', 'UNKNOWN_OUTCOME') OR error IS NOT NULL),
  CHECK (state <> 'CANCELED' OR (result IS NOT NULL AND cancellation IS NOT NULL)),
  CHECK (state <> 'UNKNOWN_OUTCOME' OR reconciliation_state = 'RECONCILIATION_REQUIRED'),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'Job'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/job.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'job_id' = job_id
    AND record_json->>'record_version' = record_version::text
    AND record_json->>'command_id' = command_id
    AND (record_json->>'created_at')::timestamptz = created_at
    AND (record_json->>'queued_at')::timestamptz = queued_at
    AND ((record_json ? 'started_at' AND (record_json->>'started_at')::timestamptz = started_at)
      OR (NOT record_json ? 'started_at' AND started_at IS NULL))
    AND (record_json->>'updated_at')::timestamptz = updated_at
    AND ((record_json ? 'finished_at' AND (record_json->>'finished_at')::timestamptz = finished_at)
      OR (NOT record_json ? 'finished_at' AND finished_at IS NULL))
    AND record_json->>'state' = state
    AND record_json->'retry_policy' = retry_policy
    AND record_json->>'current_attempt_number' = current_attempt_number::text
    AND ((record_json ? 'next_eligible_attempt_at' AND (record_json->>'next_eligible_attempt_at')::timestamptz = next_eligible_attempt_at)
      OR (NOT record_json ? 'next_eligible_attempt_at' AND next_eligible_attempt_at IS NULL))
    AND ((record_json ? 'last_attempt_id' AND record_json->>'last_attempt_id' = last_attempt_id)
      OR (NOT record_json ? 'last_attempt_id' AND last_attempt_id IS NULL))
    AND ((record_json ? 'cancellation' AND record_json->'cancellation' = cancellation)
      OR (NOT record_json ? 'cancellation' AND cancellation IS NULL))
    AND record_json->>'reconciliation_state' = reconciliation_state
    AND ((record_json ? 'result' AND record_json->'result' = result)
      OR (NOT record_json ? 'result' AND result IS NULL))
    AND ((record_json ? 'error' AND record_json->'error' = error)
      OR (NOT record_json ? 'error' AND error IS NULL)),
    false))
);

CREATE OR REPLACE FUNCTION mef_job_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.record_version + 1 <> NEW.record_version
    OR OLD.job_id <> NEW.job_id
    OR OLD.command_id <> NEW.command_id
    OR OLD.created_at <> NEW.created_at
    OR OLD.queued_at <> NEW.queued_at THEN
    RAISE EXCEPTION 'job identity or version mutation is invalid' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('SUCCEEDED', 'FAILED', 'CANCELED') THEN
    RAISE EXCEPTION 'terminal jobs are immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.state = 'QUEUED' AND NEW.state IN ('RUNNING', 'CANCEL_REQUESTED')) OR
    (OLD.state = 'RUNNING' AND NEW.state IN ('RETRY_WAIT', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME')) OR
    (OLD.state = 'RETRY_WAIT' AND NEW.state IN ('RUNNING', 'CANCEL_REQUESTED')) OR
    (OLD.state = 'CANCEL_REQUESTED' AND NEW.state IN ('CANCELED', 'SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME')) OR
    (OLD.state = 'UNKNOWN_OUTCOME' AND NEW.state IN ('RETRY_WAIT', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'illegal job state transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'SUCCEEDED' AND (NEW.finished_at IS NULL OR NEW.result IS NULL) THEN
    RAISE EXCEPTION 'successful jobs require a result and finished timestamp' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IN ('FAILED', 'UNKNOWN_OUTCOME') AND (NEW.error IS NULL OR NEW.finished_at IS NULL AND NEW.state = 'FAILED') THEN
    RAISE EXCEPTION 'failed jobs require bounded error evidence' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'CANCELED' AND (NEW.finished_at IS NULL OR NEW.cancellation IS NULL) THEN
    RAISE EXCEPTION 'canceled jobs require safe-boundary evidence' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mef_job_transition_guard ON mef_jobs;
CREATE TRIGGER mef_job_transition_guard
  BEFORE UPDATE ON mef_jobs
  FOR EACH ROW EXECUTE FUNCTION mef_job_transition_guard();
ALTER TABLE mef_jobs ENABLE ALWAYS TRIGGER mef_job_transition_guard;

CREATE INDEX IF NOT EXISTS mef_jobs_claimable_idx
  ON mef_jobs (queued_at, job_id)
  WHERE state IN ('QUEUED', 'RETRY_WAIT');
CREATE INDEX IF NOT EXISTS mef_jobs_state_idx ON mef_jobs (state, next_eligible_attempt_at);

CREATE TABLE IF NOT EXISTS mef_job_attempts (
  job_attempt_id text PRIMARY KEY CHECK (job_attempt_id ~ '^jatt_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version BETWEEN 1 AND 9007199254740991),
  job_id text NOT NULL REFERENCES mef_jobs(job_id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 100),
  worker_identity text NOT NULL CHECK (worker_identity ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  worker_type text NOT NULL CHECK (worker_type = 'FIXTURE'),
  claimed_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  lease_expires_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN (
    'STARTED', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_NON_RETRYABLE',
    'UNKNOWN_OUTCOME', 'CANCELED'
  )),
  failure_category text CHECK (failure_category IS NULL OR failure_category IN ('RETRYABLE', 'NON_RETRYABLE', 'UNKNOWN_OUTCOME')),
  retry_decision text NOT NULL CHECK (retry_decision IN (
    'NOT_APPLICABLE', 'RETRY_SCHEDULED', 'RETRY_EXHAUSTED',
    'MANUAL_RECONCILIATION_REQUIRED', 'CANCELED'
  )),
  cancellation_acknowledged_at timestamptz,
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  UNIQUE (job_id, attempt_number),
  CHECK (outcome = 'STARTED' OR ended_at IS NOT NULL),
  CHECK (outcome <> 'SUCCEEDED' OR result IS NOT NULL),
  CHECK (outcome NOT IN ('FAILED_RETRYABLE', 'FAILED_NON_RETRYABLE', 'UNKNOWN_OUTCOME') OR (failure_category IS NOT NULL AND error IS NOT NULL)),
  CHECK (outcome <> 'CANCELED' OR (cancellation_acknowledged_at IS NOT NULL AND result IS NOT NULL)),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'JobAttempt'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/job-attempt.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'job_attempt_id' = job_attempt_id
    AND record_json->>'record_version' = record_version::text
    AND record_json->>'job_id' = job_id
    AND record_json->>'attempt_number' = attempt_number::text
    AND record_json->>'worker_identity' = worker_identity
    AND record_json->>'worker_type' = worker_type
    AND (record_json->>'claimed_at')::timestamptz = claimed_at
    AND ((record_json ? 'started_at' AND (record_json->>'started_at')::timestamptz = started_at)
      OR (NOT record_json ? 'started_at' AND started_at IS NULL))
    AND ((record_json ? 'ended_at' AND (record_json->>'ended_at')::timestamptz = ended_at)
      OR (NOT record_json ? 'ended_at' AND ended_at IS NULL))
    AND ((record_json ? 'lease_expires_at' AND (record_json->>'lease_expires_at')::timestamptz = lease_expires_at)
      OR (NOT record_json ? 'lease_expires_at' AND lease_expires_at IS NULL))
    AND record_json->>'outcome' = outcome
    AND ((record_json ? 'failure_category' AND record_json->>'failure_category' = failure_category)
      OR (NOT record_json ? 'failure_category' AND failure_category IS NULL))
    AND record_json->>'retry_decision' = retry_decision
    AND ((record_json ? 'cancellation_acknowledged_at' AND (record_json->>'cancellation_acknowledged_at')::timestamptz = cancellation_acknowledged_at)
      OR (NOT record_json ? 'cancellation_acknowledged_at' AND cancellation_acknowledged_at IS NULL))
    AND ((record_json ? 'result' AND record_json->'result' = result)
      OR (NOT record_json ? 'result' AND result IS NULL))
    AND ((record_json ? 'error' AND record_json->'error' = error)
      OR (NOT record_json ? 'error' AND error IS NULL)),
    false))
);

CREATE OR REPLACE FUNCTION mef_job_attempt_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.record_version + 1 <> NEW.record_version
    OR OLD.job_attempt_id <> NEW.job_attempt_id
    OR OLD.job_id <> NEW.job_id
    OR OLD.attempt_number <> NEW.attempt_number
    OR OLD.worker_identity <> NEW.worker_identity
    OR OLD.worker_type <> NEW.worker_type
    OR OLD.claimed_at <> NEW.claimed_at THEN
    RAISE EXCEPTION 'job attempt identity or version mutation is invalid' USING ERRCODE = '55000';
  END IF;
  IF OLD.outcome <> 'STARTED' OR OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'completed job attempts are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.outcome = 'STARTED' AND NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'started job attempts cannot have an end timestamp' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mef_job_attempt_guard ON mef_job_attempts;
CREATE TRIGGER mef_job_attempt_guard
  BEFORE UPDATE ON mef_job_attempts
  FOR EACH ROW EXECUTE FUNCTION mef_job_attempt_guard();
ALTER TABLE mef_job_attempts ENABLE ALWAYS TRIGGER mef_job_attempt_guard;

CREATE UNIQUE INDEX IF NOT EXISTS mef_job_attempts_one_active_idx
  ON mef_job_attempts (job_id)
  WHERE outcome = 'STARTED';
CREATE INDEX IF NOT EXISTS mef_job_attempts_lease_idx
  ON mef_job_attempts (lease_expires_at)
  WHERE outcome = 'STARTED';

CREATE TABLE IF NOT EXISTS mef_progress_events (
  progress_event_id text PRIMARY KEY CHECK (progress_event_id ~ '^pev_[a-z0-9][a-z0-9_-]{0,127}$'),
  record_version bigint NOT NULL CHECK (record_version = 1),
  job_id text NOT NULL REFERENCES mef_jobs(job_id) ON DELETE RESTRICT,
  job_attempt_id text REFERENCES mef_job_attempts(job_attempt_id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  occurred_at timestamptz NOT NULL,
  phase text NOT NULL CHECK (phase IN ('QUEUED', 'STARTING', 'RUNNING', 'RETRYING', 'CANCELLATION_REQUESTED', 'CANCELLATION_ACKNOWLEDGED', 'COMPLETED', 'RECONCILING')),
  message_code text NOT NULL CHECK (message_code IN ('COMMAND_ACCEPTED', 'ATTEMPT_STARTED', 'STEP_COMPLETED', 'RETRY_SCHEDULED', 'CANCELLATION_REQUESTED', 'CANCELLATION_ACKNOWLEDGED', 'ATTEMPT_COMPLETED', 'JOB_COMPLETED', 'OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED')),
  progress_value numeric CHECK (progress_value IS NULL OR (progress_value >= 0 AND progress_value <= 1)),
  record_json jsonb NOT NULL CHECK (jsonb_typeof(record_json) = 'object'),
  UNIQUE (job_id, sequence),
  CHECK (COALESCE(
    record_json->>'entity_type' = 'ProgressEvent'
    AND record_json->>'schema_id' = 'https://schemas.sportsagentslab.local/mef/1.0.0/progress-event.schema.json'
    AND record_json->>'schema_version' = '1.0.0'
    AND record_json->>'progress_event_id' = progress_event_id
    AND record_json->>'record_version' = record_version::text
    AND record_json->>'job_id' = job_id
    AND ((record_json ? 'job_attempt_id' AND record_json->>'job_attempt_id' = job_attempt_id)
      OR (NOT record_json ? 'job_attempt_id' AND job_attempt_id IS NULL))
    AND record_json->>'sequence' = sequence::text
    AND (record_json->>'occurred_at')::timestamptz = occurred_at
    AND record_json->>'phase' = phase
    AND record_json->>'message_code' = message_code
    AND ((record_json ? 'progress_value' AND (record_json->>'progress_value')::numeric = progress_value)
      OR (NOT record_json ? 'progress_value' AND progress_value IS NULL)),
    false))
);

CREATE OR REPLACE FUNCTION mef_reject_progress_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'progress events are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mef_progress_append_only ON mef_progress_events;
CREATE TRIGGER mef_progress_append_only
  BEFORE UPDATE OR DELETE ON mef_progress_events
  FOR EACH ROW EXECUTE FUNCTION mef_reject_progress_mutation();
ALTER TABLE mef_progress_events ENABLE ALWAYS TRIGGER mef_progress_append_only;
CREATE INDEX IF NOT EXISTS mef_progress_events_job_sequence_idx
  ON mef_progress_events (job_id, sequence);

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
    WHEN 'Command' THEN
      RETURN EXISTS (SELECT 1 FROM mef_commands WHERE command_id = object_id);
    WHEN 'Job' THEN
      RETURN EXISTS (SELECT 1 FROM mef_jobs WHERE job_id = object_id);
    WHEN 'JobAttempt' THEN
      RETURN EXISTS (SELECT 1 FROM mef_job_attempts WHERE job_attempt_id = object_id);
    WHEN 'ProgressEvent' THEN
      RETURN EXISTS (SELECT 1 FROM mef_progress_events WHERE progress_event_id = object_id);
    ELSE
      RETURN false;
  END CASE;
END;
$$;

REVOKE UPDATE, DELETE ON mef_commands, mef_jobs, mef_job_attempts FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON mef_progress_events FROM PUBLIC;
