-- Better Auth schema for ML-98. This is deliberately separate from the
-- operational-state migration history and is applied with the auth migration
-- command before enabling hosted authentication.

CREATE SCHEMA IF NOT EXISTS mef_auth;

CREATE TABLE IF NOT EXISTS mef_auth."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS mef_auth."session" (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES mef_auth."user" (id) ON DELETE CASCADE,
  "activeOrganizationId" text
);

CREATE INDEX IF NOT EXISTS mef_auth_session_user_idx ON mef_auth."session" ("userId");

CREATE TABLE IF NOT EXISTS mef_auth.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES mef_auth."user" (id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  UNIQUE ("providerId", "accountId")
);

CREATE INDEX IF NOT EXISTS mef_auth_account_user_idx ON mef_auth.account ("userId");

CREATE TABLE IF NOT EXISTS mef_auth.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS mef_auth_verification_identifier_idx ON mef_auth.verification (identifier);

CREATE TABLE IF NOT EXISTS mef_auth.organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  "createdAt" timestamptz NOT NULL,
  metadata text
);

CREATE TABLE IF NOT EXISTS mef_auth.member (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES mef_auth.organization (id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES mef_auth."user" (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  "createdAt" timestamptz NOT NULL,
  UNIQUE ("organizationId", "userId")
);

CREATE INDEX IF NOT EXISTS mef_auth_member_user_idx ON mef_auth.member ("userId");
CREATE INDEX IF NOT EXISTS mef_auth_member_org_idx ON mef_auth.member ("organizationId");

CREATE TABLE IF NOT EXISTS mef_auth.invitation (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES mef_auth.organization (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "inviterId" text NOT NULL REFERENCES mef_auth."user" (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mef_auth_invitation_org_idx ON mef_auth.invitation ("organizationId");
CREATE INDEX IF NOT EXISTS mef_auth_invitation_email_idx ON mef_auth.invitation (email);

REVOKE ALL ON SCHEMA mef_auth FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mef_auth FROM PUBLIC;
