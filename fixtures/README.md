# Fixtures boundary

Fixtures are non-athlete, structural test assets. They are fixed before test
execution and never import application code. Expected outputs are independent
JSON values, not snapshots of mutable UI or runtime state.

The current fixture set proves contract loading, declared-output replay, and
ML-102 byte identity. `fixtures/ml102/manifest.json` records the expected
SHA-256 and byte size for each non-sensitive qualification fixture. The
base64-labelled binary fixture is decoded by the qualification harness before
hashing so the corpus does not rely on text normalization. These are not
force-plate or CMJ fixtures and contain no athlete data.
