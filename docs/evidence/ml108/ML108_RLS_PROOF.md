# ML-108 PostgreSQL and RLS Proof

## Local isolated qualification

The repository CI database path was executed against the available isolated
Docker PostgreSQL container, not against production:

```text
container=secscanmonitor-postgres-1 image=postgres:16.6-alpine ports=127.0.0.1:5433->5432/tcp status=healthy
database=mef_test user=secscan server=PostgreSQL 16.6
```

Commands and observed results:

```text
CI_DATABASE_PREPARE=PASS migration_role=mef_migration runtime_role=mef_runtime
CI_OPERATIONAL_MIGRATIONS=PASS versions=001_operational_state,002_job_execution,003_auth_tenancy_security,004_ml102_source_import,005_ml102_identity_constraint_hardening,006_ml103_source_observation,007_ml104_canonical_acquisition,008_ml105_configuration_resolution
CI_RUNTIME_GRANTS=PASS role=mef_runtime migration_history=DENIED
POSTGRES_RLS_CI=PASS cross_tenant=PASS principal_boundary=PASS force_rls=PASS synthetic_only=YES
```

The qualification proves forced RLS, tenant isolation, principal boundary,
runtime grants, and denial of migration-history access. The migrations also
make source observations, canonical acquisitions, and configuration
resolutions append-only and revoke update/delete/truncate access.

## Real Neon Preview branch

The same checks were repeated on the isolated Neon Preview branch
`br-nameless-mud-axlo13gq` in project `lively-surf-68186530`, database
`neondb`. The branch had migrations `001_operational_state` through
`008_ml105_configuration_resolution`; both `mef_migration` and `mef_runtime`
were login-capable, non-superuser, and `NOBYPASSRLS`.

The runtime-role transaction reported:

```text
current_user=mef_runtime
bypass_rls=false
tenant_a_visible=1
tenant_b_visible=0
tenant_b_observation=0
tenant_b_canonical=0
tenant_b_resolution=0
transaction=ROLLBACK
```

The probe inserted one synthetic SourceArtifact inside a transaction, verified
that its owning tenant could read it while a second tenant could not, checked
the downstream observation/canonical/resolution scopes, and rolled back the
probe. No permanent test rows were written.

`NEON_REAL_INTEGRATION=PASS` and `CROSS_TENANT_ISOLATION=PASS` are therefore
claimed for this isolated Preview branch only.
