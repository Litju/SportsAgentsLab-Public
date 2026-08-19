-- ML-102 hardens the verified identity tuple after the initial lifecycle
-- migration. A verified row is all-or-none: hash, byte size, and immutable
-- content-addressed storage key must be present together.

ALTER TABLE mef_ml102_import_attempts
  ADD CONSTRAINT mef_ml102_import_attempts_verified_identity_all_or_none
  CHECK (
    (content_hash IS NULL AND actual_size_bytes IS NULL AND storage_key IS NULL)
    OR
    (content_hash IS NOT NULL AND actual_size_bytes IS NOT NULL AND storage_key IS NOT NULL)
  );
