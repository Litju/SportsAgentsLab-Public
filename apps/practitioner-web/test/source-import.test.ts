import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSourceImportEnvelope, maxUploadBytes, normalizeDeclaredMediaType } from "../src/server/source-import.ts";

test("generic source-import envelope preserves operational boundary", () => {
  assert.deepEqual(decideSourceImportEnvelope({ originalFilename: "empty.csv", declaredSizeBytes: 0, actualSizeBytes: 0 }).outcome, "MALFORMED");
  assert.deepEqual(decideSourceImportEnvelope({ originalFilename: "jump.csv", declaredSizeBytes: 10, actualSizeBytes: 9 }).outcome, "MALFORMED");
  assert.deepEqual(decideSourceImportEnvelope({ originalFilename: "jump.vendorbin", declaredSizeBytes: 10, actualSizeBytes: 10 }).outcome, "UNSUPPORTED");
  assert.deepEqual(decideSourceImportEnvelope({ originalFilename: "jump.csv", declaredSizeBytes: 10, actualSizeBytes: 10 }).outcome, "STORED");
});

test("upload policy normalizes invalid declarations without widening the server limit", () => {
  assert.equal(normalizeDeclaredMediaType("TEXT/CSV"), "text/csv");
  assert.equal(normalizeDeclaredMediaType("not-a-media-type"), "application/octet-stream");
  assert.equal(maxUploadBytes({ NODE_ENV: "test", MEF_MAX_UPLOAD_BYTES: "1024" }), 1024);
  assert.equal(maxUploadBytes({ NODE_ENV: "test", MEF_MAX_UPLOAD_BYTES: "999999999999999999999" }), 50 * 1024 * 1024);
});
