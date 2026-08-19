# Change Impact Register

## Impact summary

| Layer | Impact | Direction |
|---|---:|---|
| Product identity | None | MEF remains the first independent SportsAgentsLab measurement product |
| Scientific contract | None | No formulas, metrics, protocol, uncertainty, SESOI, or qualification semantics change |
| Domain contracts | Low | Platform/agent session/tool references may be added later; existing scientific semantics preserved |
| Operational state | Low | Existing PostgreSQL and ML-96 primitives preserved |
| Job execution | Low | ML-97 becomes the v1 orchestration baseline after acceptance |
| Web/control application | Medium | Same-origin Next.js/Vercel deployment becomes primary |
| Agent runtime | High/new | Eve selected as canonical runtime behind port |
| Model access | High/new | OpenCode Go selected as primary provider through thin adapter |
| Artifact storage | Medium | Vercel Blob adapter added; S3 adapter retained |
| Hosted database | Low | Same PostgreSQL semantics; Neon candidate via Vercel Marketplace |
| Scientific hosting | Medium/deferred | Vercel Python Functions eligible adapter; core remains independent |
| Sandbox | New/bounded | Vercel Sandbox only for isolation-heavy workflows |
| UX | Low/medium | Existing desktop-first UX preserved; browser shell/session behavior clarified |
| Auth/security | Deferred consumer | ML-98 must implement against the amended web/Eve topology |
| CI/CD | Medium | Vercel previews become required hosted qualification evidence |

## Explicitly preserved

The amendment does not alter: `CMJ.BILATERAL.UNLOADED.HANDS_ON_HIPS.v1`, force-plate qualification rules, the native-artifact evidence root, fail-closed unknown semantics, the deterministic/statistical/agent separation, evidence tiers, practitioner authority, or prohibited claims.

## Deliberately removed from v1 critical path

- Temporal as a mandatory workflow platform.
- A separately deployed Fastify service as a mandatory control API topology.
- Managed container services as the default application deployment model.
- AWS/S3 as a required deployment vendor.
- Vercel AI Gateway as a model-access requirement.
- Native desktop packaging as a v1 requirement.

## New risk introduced

- Eve public-preview churn.
- Vercel Hobby quota ceilings and non-commercial restriction.
- Vercel-specific deployment adapters becoming accidental domain dependencies.
- Direct OpenCode model API compatibility/model-catalog drift.
- Preview environments accidentally seeing sensitive data before ML-98 security/tenancy is complete.

All five are addressed by version pinning, provider ports, synthetic-only hosted qualification before ML-98, explicit environment policy, and adapter-only dependencies.
