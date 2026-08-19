# Implementation Sequence

```text
ML-97 independent final acceptance
        ↓
Platform + Agent Amendment materialization
        ↓
Founder freeze
        ↓
Platform Refactor + Vercel Qualification
        ├── Next.js desktop shell
        ├── same-origin API
        ├── hosted PostgreSQL
        ├── Vercel Blob
        ├── Eve
        ├── OpenCode
        └── preview proof
        ↓
ML-98 Auth / Authorization / Tenancy / Secrets
        ↓
Remaining B00
        ↓
B01 Force-Plate Ingestion
```

## Why ML-98 comes after platform refactor

Auth/tenancy/security policy depends on actual browser sessions, Eve session/channel authentication, tool authorization, private Blob access, hosted PostgreSQL/RLS, provider secrets, and preview/production environment boundaries. Building ML-98 before the platform shape is frozen would create avoidable rework.
