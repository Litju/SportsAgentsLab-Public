# Threat Boundary Delta for ML-98

This is not the full ML-98 security design. It identifies new surfaces ML-98 must consume.

## New surfaces

- browser user session;
- Next.js server actions/route handlers;
- Eve session/channel endpoint;
- OpenCode API credential and model requests;
- private Vercel Blob access;
- hosted PostgreSQL connection/RLS context;
- Vercel preview environment isolation;
- Eve tools and HITL approvals;
- optional Vercel Sandbox egress/credentials.

## Required ML-98 controls

- authenticated actor -> organization/tenant -> purpose context;
- Eve session bound to authenticated actor/tenant;
- tool capability policy distinct from model suggestion;
- approval identity verified server-side;
- private Blob access issued only through governed server routes;
- DB RLS context set per request/operation;
- secrets server-only and environment-scoped;
- preview deployments synthetic-only until security gate passes;
- audit event correlation across user request, Eve session, command, job, evidence, and practitioner decision.
