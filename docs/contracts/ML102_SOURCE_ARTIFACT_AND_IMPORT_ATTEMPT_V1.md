# ML-102 SourceArtifact and ImportAttempt Contract v1

## Scope

ML-102 is the B01 source-ingestion boundary. It receives bytes, preserves
their identity, records provenance, and stops before vendor interpretation or
scientific measurement. `scientific_eligibility` is always `INELIGIBLE`.

## Records

`SourceArtifact` is the immutable B00 record. It carries the source artifact
ID, SHA-256 content hash, byte size, media type, original filename, private
content-addressed storage key, source declaration, and `immutable_source=true`.
The canonical storage key is `originals/sha256/<lowercase-sha256>`.

The ML-102 `ImportAttempt` is the tenant/workspace-scoped upload lifecycle.
Each upload gets a distinct attempt ID even when its bytes duplicate another
attempt. It records the principal, filename, declared envelope, staging path,
verified identity, failure state, duplicate relationship, and lifecycle events.
Athlete and session association are rejected until an authoritative B00
association registry exists.

`mef_ml102_content_identities` is the race gate keyed by
`(organization_id, workspace_id, content_hash)`. It retains the first attempt
for a shared identity; later attempts retain their own history and point to
the first attempt through `duplicate_of_import_attempt_id`.

## State machine

```text
CREATED -> UPLOAD_AUTHORIZED -> UPLOADING -> UPLOADED -> IDENTIFYING
IDENTIFYING -> IDENTIFIED -> STORED -> READY_FOR_ADAPTER
IDENTIFIED -> UNSUPPORTED | MALFORMED | STORAGE_FAILED | HASH_FAILED
IDENTIFIED -> FINALIZATION_FAILED
STORAGE_FAILED | HASH_FAILED | FINALIZATION_FAILED -> IDENTIFYING
any non-terminal upload state -> CANCELLED | BLOCKED
```

`READY_FOR_ADAPTER`, `UNSUPPORTED`, and `MALFORMED` are terminal for ML-102.
No state authorizes a vendor adapter or scientific calculation.

## API boundary

- `POST /api/imports` creates an authenticated attempt.
- `POST /api/imports/upload` authorizes the private Vercel Blob staging upload.
- `POST /api/imports/:import_attempt_id` retries authoritative finalization.
- `GET /api/imports/:import_attempt_id` returns attempt and lifecycle events.
- `GET /api/imports/:import_attempt_id/original` retrieves bytes only through the authenticated tenant path.
- `POST /api/imports/:import_attempt_id/cancel` records cancellation.

The server streams the staged object, computes SHA-256 independently of the
client, verifies size and identity, and materializes the immutable private
content key. Raw bytes are not sent to an LLM and no ML-102 agent mutation
tool exists.

## Security and failure semantics

Neon PostgreSQL is the active database and Vercel Private Blob is the active
artifact store. The runtime role is subject to forced tenant/workspace RLS;
the migration role is separate. Storage, hash, and database-finalization
failures are explicit retryable states. A lost commit is treated as an
unknown outcome and requires reconciliation rather than a compensating delete.

## Scientific boundary

This contract does not define standing, body weight, movement onset, takeoff,
landing, force, acceleration, velocity, displacement, impulse, jump height,
readiness, fatigue, injury risk, or meaningful-change inference. ML-103 remains
blocked until ML-102 owner acceptance.
