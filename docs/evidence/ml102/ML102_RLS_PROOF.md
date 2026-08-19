# ML-102 RLS Proof

Qualification target: isolated Neon branch `br-little-dream-axsaeb0h` in
project `lively-surf-68186530`.

Observed qualification results:

```text
CI_OPERATIONAL_MIGRATIONS=PASS
POSTGRES_RLS_CI=PASS
CROSS_TENANT_READ=PASS
CROSS_TENANT_WRITE=PASS
PRINCIPAL_BOUNDARY=PASS
FORCE_RLS=PASS
CI_RUNTIME_GRANTS=PASS
RUNTIME_ROLE_SUPERUSER=NO
RUNTIME_ROLE_BYPASSRLS=NO
SYNTHETIC_ONLY=YES
```

The runtime role receives tenant and workspace settings in every transaction.
The policies require a matching workspace membership unless the bounded
bootstrap path is explicitly enabled. ML-102 attempts, events, and content
identities are forced through RLS. B00 source records and audit/provenance
records remain separate canonical tables.

The live duplicate replay used the runtime role and passed the complete
`IDENTIFYING -> IDENTIFIED -> STORED -> READY_FOR_ADAPTER` sequence without
cross-tenant access.
