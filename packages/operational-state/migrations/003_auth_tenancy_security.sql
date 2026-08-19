-- ML-98: tenant ownership, transaction-local RLS, and principal-aware audit metadata.
-- This migration intentionally leaves 001/002 untouched. Existing rows are placed in
-- a reserved scope with no membership, so they remain inaccessible to application users.

CREATE OR REPLACE FUNCTION mef_current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('mef.organization_id', true), '');
$$;

CREATE OR REPLACE FUNCTION mef_current_workspace_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('mef.workspace_id', true), '');
$$;

CREATE OR REPLACE FUNCTION mef_current_principal_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('mef.principal_id', true), '');
$$;

CREATE OR REPLACE FUNCTION mef_bootstrap_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('mef.bootstrap', true) = 'true';
$$;

CREATE TABLE IF NOT EXISTS mef_workspaces (
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  workspace_slug text NOT NULL CHECK (workspace_slug ~ '^[a-z0-9][a-z0-9-]{1,127}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by text NOT NULL,
  PRIMARY KEY (organization_id, workspace_id),
  UNIQUE (organization_id, workspace_slug)
);

CREATE TABLE IF NOT EXISTS mef_workspace_members (
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  principal_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('PRACTITIONER', 'SCIENTIFIC_ADMIN')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by text NOT NULL,
  PRIMARY KEY (organization_id, workspace_id, principal_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES mef_workspaces (organization_id, workspace_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mef_eve_sessions (
  eve_session_id text PRIMARY KEY CHECK (length(eve_session_id) BETWEEN 1 AND 256),
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  principal_id text NOT NULL,
  better_auth_session_id text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, workspace_id, eve_session_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES mef_workspaces (organization_id, workspace_id)
    ON DELETE RESTRICT
);

-- Tenant columns use the transaction-local settings as their insert default. An
-- unscoped transaction therefore fails the NOT NULL/RLS boundary instead of
-- silently creating globally visible rows.
ALTER TABLE mef_source_artifacts ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_source_artifacts ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_import_attempts ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_import_attempts ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_provenance_references ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_provenance_references ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_artifact_retention ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_artifact_retention ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_commands ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_commands ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_jobs ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_jobs ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_job_attempts ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_job_attempts ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE mef_progress_events ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE mef_progress_events ADD COLUMN IF NOT EXISTS workspace_id text;

UPDATE mef_source_artifacts SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_import_attempts SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_audit_events SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_provenance_references SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_artifact_retention SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_commands SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_jobs SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_job_attempts SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;
UPDATE mef_progress_events SET organization_id = 'org_legacy_unassigned', workspace_id = 'ws_legacy_unassigned' WHERE organization_id IS NULL OR workspace_id IS NULL;

ALTER TABLE mef_source_artifacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_source_artifacts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_import_attempts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_import_attempts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_provenance_references ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_provenance_references ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_artifact_retention ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_artifact_retention ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_commands ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_commands ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_jobs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_jobs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_job_attempts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_job_attempts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE mef_progress_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE mef_progress_events ALTER COLUMN workspace_id SET NOT NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mef_source_artifacts', 'mef_import_attempts', 'mef_audit_events',
    'mef_provenance_references', 'mef_artifact_retention', 'mef_commands',
    'mef_jobs', 'mef_job_attempts', 'mef_progress_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET DEFAULT mef_current_organization_id()', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id SET DEFAULT mef_current_workspace_id()', table_name);
  END LOOP;
END;
$$;

ALTER TABLE mef_commands DROP CONSTRAINT IF EXISTS mef_commands_command_type_idempotency_key_key;
ALTER TABLE mef_commands ADD CONSTRAINT mef_commands_scoped_idempotency_key_unique
  UNIQUE (organization_id, workspace_id, command_type, idempotency_key);

ALTER TABLE mef_source_artifacts ADD CONSTRAINT mef_source_artifacts_scope_id_unique
  UNIQUE (organization_id, workspace_id, source_artifact_id);
ALTER TABLE mef_commands ADD CONSTRAINT mef_commands_scope_id_unique
  UNIQUE (organization_id, workspace_id, command_id);
ALTER TABLE mef_jobs ADD CONSTRAINT mef_jobs_scope_id_unique
  UNIQUE (organization_id, workspace_id, job_id);
ALTER TABLE mef_job_attempts ADD CONSTRAINT mef_job_attempts_scope_id_unique
  UNIQUE (organization_id, workspace_id, job_attempt_id);

ALTER TABLE mef_import_attempts DROP CONSTRAINT IF EXISTS mef_import_attempts_source_artifact_id_fkey;
ALTER TABLE mef_import_attempts ADD CONSTRAINT mef_import_attempts_scoped_source_fkey
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
  REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
  ON DELETE RESTRICT;
ALTER TABLE mef_artifact_retention DROP CONSTRAINT IF EXISTS mef_artifact_retention_source_artifact_id_fkey;
ALTER TABLE mef_artifact_retention ADD CONSTRAINT mef_artifact_retention_scoped_source_fkey
  FOREIGN KEY (organization_id, workspace_id, source_artifact_id)
  REFERENCES mef_source_artifacts (organization_id, workspace_id, source_artifact_id)
  ON DELETE RESTRICT;
ALTER TABLE mef_jobs DROP CONSTRAINT IF EXISTS mef_jobs_command_id_fkey;
ALTER TABLE mef_jobs ADD CONSTRAINT mef_jobs_scoped_command_fkey
  FOREIGN KEY (organization_id, workspace_id, command_id)
  REFERENCES mef_commands (organization_id, workspace_id, command_id)
  ON DELETE RESTRICT;
ALTER TABLE mef_job_attempts DROP CONSTRAINT IF EXISTS mef_job_attempts_job_id_fkey;
ALTER TABLE mef_job_attempts ADD CONSTRAINT mef_job_attempts_scoped_job_fkey
  FOREIGN KEY (organization_id, workspace_id, job_id)
  REFERENCES mef_jobs (organization_id, workspace_id, job_id)
  ON DELETE RESTRICT;
ALTER TABLE mef_progress_events DROP CONSTRAINT IF EXISTS mef_progress_events_job_id_fkey;
ALTER TABLE mef_progress_events ADD CONSTRAINT mef_progress_events_scoped_job_fkey
  FOREIGN KEY (organization_id, workspace_id, job_id)
  REFERENCES mef_jobs (organization_id, workspace_id, job_id)
  ON DELETE RESTRICT;
ALTER TABLE mef_progress_events DROP CONSTRAINT IF EXISTS mef_progress_events_job_attempt_id_fkey;
ALTER TABLE mef_progress_events ADD CONSTRAINT mef_progress_events_scoped_attempt_fkey
  FOREIGN KEY (organization_id, workspace_id, job_attempt_id)
  REFERENCES mef_job_attempts (organization_id, workspace_id, job_attempt_id)
  ON DELETE RESTRICT;

ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS principal_type text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS principal_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS human_principal_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS runtime_principal_type text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS runtime_principal_id text;
ALTER TABLE mef_audit_events ADD COLUMN IF NOT EXISTS request_id text;

UPDATE mef_audit_events
SET principal_type = COALESCE(principal_type, 'SYSTEM'),
    principal_id = COALESCE(principal_id, 'system_ml96_legacy'),
    runtime_principal_type = COALESCE(runtime_principal_type, 'SYSTEM'),
    runtime_principal_id = COALESCE(runtime_principal_id, 'system_ml96_legacy')
WHERE principal_type IS NULL OR principal_id IS NULL OR runtime_principal_type IS NULL OR runtime_principal_id IS NULL;

ALTER TABLE mef_audit_events ALTER COLUMN principal_type SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN principal_id SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN runtime_principal_type SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN runtime_principal_id SET NOT NULL;
ALTER TABLE mef_audit_events ALTER COLUMN principal_type SET DEFAULT COALESCE(NULLIF(current_setting('mef.principal_type', true), ''), 'SYSTEM');
ALTER TABLE mef_audit_events ALTER COLUMN principal_id SET DEFAULT COALESCE(NULLIF(current_setting('mef.principal_id', true), ''), 'system_runtime');
ALTER TABLE mef_audit_events ALTER COLUMN session_id SET DEFAULT NULLIF(current_setting('mef.session_id', true), '');
ALTER TABLE mef_audit_events ALTER COLUMN human_principal_id SET DEFAULT NULLIF(current_setting('mef.human_principal_id', true), '');
ALTER TABLE mef_audit_events ALTER COLUMN runtime_principal_type SET DEFAULT COALESCE(NULLIF(current_setting('mef.runtime_principal_type', true), ''), 'SYSTEM');
ALTER TABLE mef_audit_events ALTER COLUMN runtime_principal_id SET DEFAULT COALESCE(NULLIF(current_setting('mef.runtime_principal_id', true), ''), 'system_runtime');
ALTER TABLE mef_audit_events ALTER COLUMN request_id SET DEFAULT NULLIF(current_setting('mef.request_id', true), '');
ALTER TABLE mef_audit_events ADD CONSTRAINT mef_audit_events_principal_type_check
  CHECK (principal_type IN ('USER', 'SERVICE', 'AGENT', 'SYSTEM'));
ALTER TABLE mef_audit_events ADD CONSTRAINT mef_audit_events_runtime_type_check
  CHECK (runtime_principal_type IN ('HTTP', 'EVE', 'JOB_WORKER', 'SYSTEM'));

CREATE INDEX IF NOT EXISTS mef_workspace_members_principal_idx
  ON mef_workspace_members (organization_id, principal_id);
CREATE INDEX IF NOT EXISTS mef_eve_sessions_principal_idx
  ON mef_eve_sessions (organization_id, principal_id, eve_session_id);
CREATE INDEX IF NOT EXISTS mef_commands_scope_idx
  ON mef_commands (organization_id, workspace_id, submitted_at);
CREATE INDEX IF NOT EXISTS mef_jobs_scope_idx
  ON mef_jobs (organization_id, workspace_id, queued_at, job_id);
CREATE INDEX IF NOT EXISTS mef_audit_events_scope_idx
  ON mef_audit_events (organization_id, workspace_id, audit_sequence);

ALTER TABLE mef_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE mef_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE mef_eve_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mef_eve_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mef_workspaces_tenant_policy ON mef_workspaces;
CREATE POLICY mef_workspaces_tenant_policy ON mef_workspaces
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND (
      mef_bootstrap_enabled()
      OR EXISTS (
        SELECT 1 FROM mef_workspace_members AS member
        WHERE member.organization_id = mef_workspaces.organization_id
          AND member.workspace_id = mef_workspaces.workspace_id
          AND member.principal_id = nullif(current_setting('mef.principal_id', true), '')
      )
    )
  )
  WITH CHECK (organization_id = nullif(current_setting('mef.organization_id', true), ''));

DROP POLICY IF EXISTS mef_workspace_members_principal_policy ON mef_workspace_members;
CREATE POLICY mef_workspace_members_principal_policy ON mef_workspace_members
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND (mef_bootstrap_enabled() OR principal_id = nullif(current_setting('mef.principal_id', true), ''))
  )
  WITH CHECK (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND (mef_bootstrap_enabled() OR principal_id = nullif(current_setting('mef.principal_id', true), ''))
  );

DROP POLICY IF EXISTS mef_eve_sessions_principal_policy ON mef_eve_sessions;
CREATE POLICY mef_eve_sessions_principal_policy ON mef_eve_sessions
  USING (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND (mef_bootstrap_enabled() OR principal_id = nullif(current_setting('mef.principal_id', true), ''))
  )
  WITH CHECK (
    organization_id = nullif(current_setting('mef.organization_id', true), '')
    AND (mef_bootstrap_enabled() OR principal_id = nullif(current_setting('mef.principal_id', true), ''))
  );

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mef_source_artifacts', 'mef_import_attempts', 'mef_audit_events',
    'mef_provenance_references', 'mef_artifact_retention', 'mef_commands',
    'mef_jobs', 'mef_job_attempts', 'mef_progress_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS mef_tenant_scope_policy ON %I', table_name);
    EXECUTE format($policy$
      CREATE POLICY mef_tenant_scope_policy ON %1$I
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

REVOKE ALL ON mef_workspaces, mef_workspace_members, mef_eve_sessions FROM PUBLIC;
REVOKE ALL ON mef_source_artifacts, mef_import_attempts, mef_audit_events,
  mef_provenance_references, mef_artifact_retention, mef_commands, mef_jobs,
  mef_job_attempts, mef_progress_events FROM PUBLIC;

COMMENT ON TABLE mef_workspaces IS 'ML-98 tenant workspaces; application access is membership-scoped.';
COMMENT ON TABLE mef_eve_sessions IS 'ML-98 Eve session-to-tenant binding; continuation cannot change workspace.';
