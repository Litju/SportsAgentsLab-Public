import { createHash } from "node:crypto";
import type { Sha256 } from "@mef/generated-ts";
import { OperationalStateError } from "./errors.ts";

export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
export const DEFAULT_OBJECT_PREFIX = "originals/sha256";

export type ContentAddressedObjectKey = string & { readonly __contentAddressedObjectKey: unique symbol };

export function isSha256Hex(value: unknown): value is Sha256 {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

export function assertSha256Hex(value: unknown): asserts value is Sha256 {
  if (!isSha256Hex(value)) {
    throw new OperationalStateError("CONTENT_HASH_MISMATCH");
  }
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new OperationalStateError("CONTENT_HASH_MISMATCH");
  }
  return new Uint8Array(bytes);
}

export function sha256Hex(bytes: Uint8Array): Sha256 {
  return createHash("sha256").update(cloneBytes(bytes)).digest("hex") as Sha256;
}

function validatePrefix(prefix: string): string {
  const normalized = prefix.replace(/\/+$/u, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(normalized)
  ) {
    throw new OperationalStateError("INVALID_CONFIGURATION");
  }
  return normalized;
}

export function contentAddressedKey(
  contentHash: Sha256,
  prefix: string = DEFAULT_OBJECT_PREFIX
): ContentAddressedObjectKey {
  assertSha256Hex(contentHash);
  return `${validatePrefix(prefix)}/${contentHash}` as ContentAddressedObjectKey;
}

export function verifyContentHash(bytes: Uint8Array, expectedHash: Sha256): void {
  assertSha256Hex(expectedHash);
  if (sha256Hex(bytes) !== expectedHash) {
    throw new OperationalStateError("CONTENT_HASH_MISMATCH");
  }
}
