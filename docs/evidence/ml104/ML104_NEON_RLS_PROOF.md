# ML-104 Neon/Postgres RLS Proof

## Status: PASS — live Neon branch, runtime role, persistence, RLS metadata, and tenant isolation

Live target:

- Project: `lively-surf-68186530` (`sportsagentslab-mef`).
- Branch: `br-damp-water-axo74u39` (`preview/work/ml104-b01-canonical-acquisition-v01`).
- Better Auth migration: PASS using the unpooled Neon connection.
- Operational migrations: PASS; ordered versions `001_operational_state` through `007_ml104_canonical_acquisition` are present with applied sequences 1–7.
- Migration `007_ml104_canonical_acquisition.sql` SHA-256: `8196306c8717cf3272bc88ce806a9bf9992a21934b7394b550bf93800a7c9212`.

The live runtime role was created for this Preview branch as `mef_ml104_rt_msw3objaitznu0fy`. Neon reported:

- `rolsuper=false`.
- `rolbypassrls=false`.
- `rolcanlogin=true`.
- The role has the required scoped table privileges; public table privileges remain revoked by the migration, and RLS remains the row boundary.

Live catalog checks reported `relrowsecurity=true` and `relforcerowsecurity=true` for `mef_workspaces`, `mef_workspace_members`, `mef_source_artifacts`, `mef_import_attempts`, `mef_source_observations`, and `mef_ml104_canonical_acquisitions`. The ML-104 policy `mef_ml104_canonical_acquisition_tenant_scope_policy` is present with both `USING` and `WITH CHECK` conditions requiring the transaction organization/workspace settings and either bootstrap mode or matching workspace membership.

The persisted ML-104 row was verified directly on Neon:

- Acquisition: `acq_b63dc63f4d34e5b37f3ac96639f53762a547e8b1`.
- Organization/workspace: `kqOvX8CHQGKoLjLs1OwDcscl7Ukpif3V` / `ws_ml104_e2e_2da01d6a45644a8689a7`.
- Import/observation: `imp_7775ea1707cd4ea5909a391389614570` / `sob_4a3b573a0c1669344f4154efd23871412a7a443c513261b2`.
- Signal hash/key: `69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158` / `canonical/sha256/69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158`.
- Canonical identity hash: `b63dc63f4d34e5b37f3ac96639f53762a547e8b1113425c2eb532e4e9d483b29`.

The authenticated application isolation proof used a second synthetic tenant on deployment `dpl_Gkmi6JBRYaEjpnTqt3Uj1r7CWLtH`:

- `GET /api/imports` returned HTTP 200 with `{"attempts":[]}`.
- `GET /api/imports/imp_7775ea1707cd4ea5909a391389614570` returned HTTP 404.
- `GET /api/imports/imp_7775ea1707cd4ea5909a391389614570/canonical-acquisition` returned HTTP 404.

Therefore `NEON_RLS_PROOF=PASS`.
