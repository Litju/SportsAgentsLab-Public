# ADR Index and Baseline Disposition

## New amendment ADRs

ADR-031 through ADR-044 are contained in this directory.

## Existing ADR disposition

| Existing ADR | Disposition after amendment |
|---|---|
| ADR-001 modular monolith | Preserved; deployment consequence amended to one primary Vercel app + bounded workers |
| ADR-002–ADR-021 | Preserved unless listed separately below |
| ADR-022 Temporal | Superseded for v1 orchestration by ADR-036 after ML-97 acceptance; Temporal deferred |
| ADR-023 Eve spike-only | Superseded by ADR-033; Eve adopted behind adapter with pin/upgrade gate |
| ADR-024 raw signals out of LLM | Preserved and strengthened |
| ADR-025 OIDC/RBAC/ABAC/RLS | Preserved; ML-98 implements against web/Eve topology |
| ADR-026 OTel | Preserved |
| ADR-027 no Kubernetes | Preserved; managed-container default is no longer required for application plane |
| ADR-028 outbox not full event sourcing | Preserved |
| ADR-029 forbidden readiness/causality | Preserved unchanged |
| ADR-030 versioned docs | Preserved; this amendment is an application of ADR-030 |

A superseded ADR remains historical evidence; its old text is not deleted.
