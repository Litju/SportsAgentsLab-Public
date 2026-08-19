# ML-105 Neon and RLS Proof

Migration `008_ml105_configuration_resolution` was applied to the isolated Neon Preview branch `preview/work/mef-ui-composition-stack-v1`. The ML-105 table is tenant-scoped, append-only, foreign-keyed to accepted ML-102/103/104 records, and configured with forced row-level security. It stores configuration documents and lineage metadata, not raw signal rows or byte payloads.

Qualification results:

```text
CI_OPERATIONAL_MIGRATIONS=PASS versions=001_operational_state,...,008_ml105_configuration_resolution
POSTGRES_RLS_CI=PASS cross_tenant=PASS principal_boundary=PASS force_rls=PASS synthetic_only=YES
REAL_POSTGRES_INTEGRATION=PASS tests=2 pass=2 fail=0
```

The runtime role was checked as a non-bypass-RLS role and received the required runtime table privileges. Applying the migration required the isolated admin endpoint because the existing migration role lacked `REFERENCES` on the pre-existing ML-102 parent tables. This was an isolated Preview limitation; production was not touched.
