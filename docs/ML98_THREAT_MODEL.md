# ML-98 threat model and security qualification

## Scope

This baseline covers Better Auth email/password sessions, organization and
workspace selection, the authenticated ControlApi and Eve channel, execution
records inherited from ML-97, idempotency, audit attribution, migration-time
Row Level Security, and private Vercel Blob access. Preview qualification is
synthetic-only; production and athlete data are out of scope.

## Assets and trust boundaries

- Practitioner credentials, Better Auth sessions, organization membership, and
  workspace membership.
- Commands, jobs, attempts, progress, source metadata, audit history, and
  content-addressed source objects.
- The browser/API boundary, the Eve session boundary, the runtime worker
  boundary, and the PostgreSQL transaction/RLS boundary.
- Server-only database URLs, Better Auth secret, and Blob token.

## Threats and controls

| Threat | Control | Qualification evidence |
| --- | --- | --- |
| Anonymous or forged browser/API access | Better Auth session resolution; explicit local identity only when enabled outside hosted environments; route-level 401/403 handling | ControlApi tests and practitioner-web auth tests |
| Account enumeration or uncontrolled signup | Signup disabled; the only bootstrap path requires a bounded synthetic Preview flag and a server-only bootstrap header secret | Auth route and bootstrap route checks |
| Cross-organization/workspace IDOR | Principal carries organization/workspace; application selects only Better Auth organizations and MEF memberships; job runtimes are cached per scope | `authz.ts`, `job-runtime.ts`, cross-scope execution test |
| Cross-tenant database reads/writes | Transaction-local `set_config`; tenant columns/defaults; composite scoped keys/FKs; RLS enabled and forced on all operational tables; public privileges revoked | migration 003, migration manifest/checksum, migration assertions |
| RLS bypass by an owner or worker | `FORCE ROW LEVEL SECURITY`; runtime URL is separate from migration URL; startup rejects a runtime role with `rolbypassrls`; deployment must grant only required table/sequence privileges | Hosted DB role verification remains a release gate |
| Eve session fixation or tenant switching | Authenticated session scope is checked on every message; first governed tool call persists the Eve-session binding; conflicting scope fails closed | Eve channel and tool boundary code |
| Idempotency replay across tenants | Idempotency uniqueness includes organization/workspace; derived command/job IDs include scope; per-scope runtime cache | migration 003 and job execution tests |
| Sensitive data in logs or responses | Bounded API errors; no password/token logging; payload validation rejects credential-like structural values; synthetic fixtures only in Preview | API parser and error-boundary tests |
| Public source-object exposure | Vercel Blob writes/reads use `access: private`; content-addressed keys and hash verification are retained | `vercel-blob-store.ts` and provider tests |
| Worker/runtime confusion | Principal metadata records human principal, runtime type/id, session, and request id in transaction-local audit defaults | security context and audit migration |

## Residual risks and release gates

- A hosted PostgreSQL qualification must verify the runtime role has no
  `BYPASSRLS`, that `FORCE ROW LEVEL SECURITY` is effective, and that the
  runtime role has explicit least-privilege grants. This workspace has no
  hosted database credentials available for that check.
- The checked-out Node runtime is 22.14.0 while the web package declares
  Node >=24.0.0. Local typechecks/tests pass, but Preview/build qualification
  must run on the declared Node 24 runtime.
- No production deployment, production data, or real athlete data is used by
  this qualification. Preview synthetic data must be discarded after review.
