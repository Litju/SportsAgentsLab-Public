# ML-104 Blob Derived Artifact Proof

## Status: PASS — live private Vercel Blob write, head, readback, and hash match

The authenticated Preview flow wrote the canonical signal to the existing private Vercel Blob store at:

`canonical/sha256/69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158`

Live readback results:

- `head` size: 307 bytes.
- `head` content type: `application/x-ndjson`.
- Private `get` stream size: 307 bytes.
- Private `get` SHA-256: `69b0e253876eb30c61370b6d558f5eabe44299bd009a61044373bf877d53f158`.
- Persisted acquisition `signal_artifact_sha256`: the same hash.
- Replay returned the same storage key, signal hash, and canonical identity without writing a second acquisition.

The original source remained content-addressed under `originals/sha256/7b93d9a57d9c7c0ae24744fc0a156659899400f57a6d4db7f10f5e2fef8b186f`. No S3 path or dependency was added.

Therefore `BLOB_DERIVED_ARTIFACT_PROOF=PASS`.
