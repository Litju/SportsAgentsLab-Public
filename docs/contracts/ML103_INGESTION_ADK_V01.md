# ML-103 Ingestion ADK v0.1

ML-103 adds a private, vendor-agnostic observation boundary. The versioned JSON Schema is [ingestion-adk.schema.json](../../packages/contracts/schemas/ingestion-adk.schema.json); TypeScript contracts live in [packages/ingestion-adk/src/contracts.ts](../../packages/ingestion-adk/src/contracts.ts).

The ADK exposes `probe`, `inspect`, and streaming `read` behind a capability-bounded `SourceReader`. The registry rejects duplicate identity and resolves only one exact or structural match. Budgets cover probe bytes, total bytes, records, metadata entries, timeout, and cancellation.

The only included adapter is `mef.reference.source-v1`, qualification `reference`, producer `SportsAgentsLab.synthetic`, format marker `MEF_REFERENCE_SOURCE_V1`. It produces deterministic schema and observation hashes, source locators, provenance, and explicit `known`/`unknown`/`conflicting` declarations. Observation documents exclude source row values, raw bytes, and high-rate arrays.

Hosted integration is deliberately narrow: the practitioner API reads the already content-addressed private ML-102 object, runs the reference adapter, and appends one tenant-scoped observation row. No vendor adapter, canonical acquisition, biomechanics interpretation, LLM access, or UI was added.
