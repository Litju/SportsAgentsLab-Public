# ML-108 Replay Determinism Proof

## Executable check

```text
node --experimental-loader ./packages/operational-state/test/ts-loader.mjs scripts/ml108_replay_check.mjs
```

The runner executes the existing reference adapter, canonicalizer, and
configuration resolver twice against the same synthetic reference source. It
asserts deep equality of every reported identity and state, then requires
`exact_match`, `RESOLVED_QUALIFIED`, and `single.total_fz`.

Observed output:

```json
{
  "sourceArtifactSha256": "83c289117d4c1eda2ceeeddaceff3c814f5d0ead156f955b1fe53d4d778f7634",
  "sourceObservationSha256": "2a443de2eb8fcdd8c82f9c2f1faf292fd454715644d35a8c9c11037b76c25685",
  "schemaFingerprint": "6aeb453630f1d0b1941b7a5e9b4822e94472fa84b1d5d844436b03ef180e513c",
  "probeStatus": "exact_match",
  "probeBytes": 648,
  "recordsProcessed": 2,
  "canonicalArtifactSha256": "2f6c925d851896eb97d9e553eb9cc085b65571ac28d4a32d971e4fb66b14c0c5",
  "canonicalIdentitySha256": "b1f050000f22c0fc9477fb9318369b3f20a42c47cf5b5dd845d1a081f38f26c8",
  "canonicalBytes": 318,
  "configurationResolutionSha256": "7b13037065f33f24506ca47a07b68ff22ce13668a5945447854e578e07247a34",
  "configurationState": "RESOLVED_QUALIFIED",
  "physicalContract": "single.total_fz",
  "deterministic": true
}
```

The repository evidence replay also passed twice against
`fixtures/evidence/replay-manifest.json`, returning canonical contract hash
`ab2c7dd21a2e14d92f53ab3e8c18dd0a117e897899db1b08c327b2f9b93880a8` both times.

The attempted locked `uv run` path was unavailable on this workstation because
the repository `.venv/lib64` link returned `Access denied`. The documented
fallback used the repository module with Python 3.12.6 and passed; no replay
result was altered or repaired.
