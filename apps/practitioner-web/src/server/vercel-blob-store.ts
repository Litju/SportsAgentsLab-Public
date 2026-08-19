import { createHash } from "node:crypto";
import {
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  copy,
  get,
  head,
  put
} from "@vercel/blob";
import type { Sha256 } from "@mef/generated-ts";
import type { SourceReader } from "@mef/ingestion-adk";
import {
  assertSha256Hex,
  cloneBytes,
  contentAddressedKey,
  mapObjectStoreError,
  OperationalStateError,
  verifyContentHash,
  type ContentAddressedObjectKey,
  type ImmutableObjectInput,
  type ImmutableObjectInspection,
  type ImmutableObjectStore,
  type ImmutablePutResult
} from "@mef/operational-state";

export interface VercelBlobClient {
  readonly put: (...args: Parameters<typeof put>) => ReturnType<typeof put>;
  readonly head: (...args: Parameters<typeof head>) => ReturnType<typeof head>;
  readonly get: (...args: Parameters<typeof get>) => ReturnType<typeof get>;
  readonly copy?: (...args: Parameters<typeof copy>) => ReturnType<typeof copy>;
}

export interface MaterializedUploadedObject {
  readonly contentHash: Sha256;
  readonly storageKey: ContentAddressedObjectKey;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly created: boolean;
}

function isNotFound(error: unknown): boolean {
  return error instanceof BlobNotFoundError || (error instanceof Error && error.name === "BlobNotFoundError");
}

function isConditionalConflict(error: unknown): boolean {
  return error instanceof BlobPathnameMismatchError
    || error instanceof BlobPreconditionFailedError
    || (error instanceof Error && /already exists|precondition|pathname/i.test(error.message));
}

async function streamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const chunk = cloneBytes(item.value ?? new Uint8Array());
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class VercelBlobImmutableObjectStore implements ImmutableObjectStore {
  private readonly token: string;
  private readonly client: VercelBlobClient;

  constructor(token: string, client: VercelBlobClient = { put, head, get, copy }) {
    if (token.length === 0) throw new OperationalStateError("INVALID_CONFIGURATION");
    this.token = token;
    this.client = client;
  }

  private key(contentHash: Sha256, prefix = "originals/sha256"): ContentAddressedObjectKey {
    assertSha256Hex(contentHash);
    return contentAddressedKey(contentHash, prefix);
  }

  private options() {
    return { token: this.token } as const;
  }

  async putImmutable(input: ImmutableObjectInput): Promise<ImmutablePutResult> {
    assertSha256Hex(input.contentHash);
    const bytes = cloneBytes(input.bytes);
    verifyContentHash(bytes, input.contentHash);
    const key = this.key(input.contentHash, input.keyPrefix);
    let uploadAcknowledged = false;

    try {
      await this.client.put(key, Buffer.from(bytes), {
        ...this.options(),
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: input.mediaType
      });
      uploadAcknowledged = true;
      const inspection = await this.inspectImmutable(input.contentHash, input.keyPrefix);
      if (!inspection.exists || inspection.byteSize !== bytes.byteLength || inspection.mediaType !== input.mediaType) {
        throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      }
      return { contentHash: input.contentHash, key, byteSize: bytes.byteLength, created: true };
    } catch (error) {
      if (uploadAcknowledged) {
        if (error instanceof OperationalStateError) throw error;
        throw mapObjectStoreError(error, "write");
      }
      if (!isConditionalConflict(error)) throw mapObjectStoreError(error, "write");

      try {
        const existing = await this.inspectImmutable(input.contentHash, input.keyPrefix);
        if (!existing.exists || existing.byteSize === undefined || existing.mediaType === undefined) {
          throw new OperationalStateError("OBJECT_READ_FAILED");
        }
        if (existing.byteSize !== bytes.byteLength || existing.mediaType !== input.mediaType) {
          throw new OperationalStateError("OBJECT_ALREADY_EXISTS_MISMATCH");
        }
        return { contentHash: input.contentHash, key, byteSize: existing.byteSize, created: false };
      } catch (verificationError) {
        if (verificationError instanceof OperationalStateError) throw verificationError;
        throw mapObjectStoreError(verificationError, "read");
      }
    }
  }

  async readImmutable(contentHash: Sha256, keyPrefix?: string): Promise<Uint8Array> {
    const key = this.key(contentHash, keyPrefix);
    try {
      const metadata = await this.client.head(key, this.options());
      if (metadata.contentType.length === 0) throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      const result = await this.client.get(key, { ...this.options(), access: "private", useCache: false });
      if (result === null || result.statusCode !== 200) throw new OperationalStateError("OBJECT_READ_FAILED");
      const bytes = await streamBytes(result.stream);
      if (metadata.size !== bytes.byteLength) throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      try {
        verifyContentHash(bytes, contentHash);
      } catch (error) {
        if (error instanceof OperationalStateError && error.code === "CONTENT_HASH_MISMATCH") {
          throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
        }
        throw error;
      }
      return bytes;
    } catch (error) {
      if (error instanceof OperationalStateError) throw error;
      if (isNotFound(error)) throw new OperationalStateError("OBJECT_READ_FAILED");
      throw mapObjectStoreError(error, "read");
    }
  }

  async openImmutableSourceReader(sourceArtifactId: string, contentHash: Sha256, keyPrefix?: string): Promise<SourceReader> {
    const key = this.key(contentHash, keyPrefix);
    let metadata: Awaited<ReturnType<typeof head>>;
    try {
      metadata = await this.client.head(key, this.options());
      if (metadata.contentType.length === 0) throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
    } catch (error) {
      if (error instanceof OperationalStateError) throw error;
      if (isNotFound(error)) throw new OperationalStateError("OBJECT_READ_FAILED");
      throw mapObjectStoreError(error, "read");
    }

    const open = async (): Promise<ReadableStream<Uint8Array>> => {
      const result = await this.client.get(key, { ...this.options(), access: "private", useCache: false });
      if (result === null || result.statusCode !== 200) throw new OperationalStateError("OBJECT_READ_FAILED");
      if (result.blob.size !== metadata.size || result.blob.contentType !== metadata.contentType) {
        throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      }
      return result.stream;
    };

    return {
      sourceArtifactId,
      byteLength: BigInt(metadata.size),
      contentSha256: contentHash,
      stream: () => new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const digest = createHash("sha256");
          let byteSize = 0;
          try {
            const reader = (await open()).getReader();
            try {
              while (true) {
                const item = await reader.read();
                if (item.done) break;
                const chunk = item.value ?? new Uint8Array();
                byteSize += chunk.byteLength;
                digest.update(chunk);
                controller.enqueue(chunk);
              }
            } finally {
              reader.releaseLock();
            }
            if (byteSize !== metadata.size || digest.digest("hex") !== contentHash) {
              throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
            }
            controller.close();
          } catch (error) {
            controller.error(error instanceof OperationalStateError ? error : new OperationalStateError("OBJECT_READ_FAILED"));
          }
        }
      }),
      readRange: async (offset, length) => {
        if (offset < 0n || !Number.isSafeInteger(length) || length < 0) throw new OperationalStateError("OBJECT_READ_FAILED");
        if (length === 0 || offset >= BigInt(metadata.size)) return new Uint8Array();
        const reader = (await open()).getReader();
        const chunks: Uint8Array[] = [];
        let skip = offset;
        let remaining = length;
        try {
          while (remaining > 0) {
            const item = await reader.read();
            if (item.done) break;
            const chunk = item.value ?? new Uint8Array();
            if (skip >= BigInt(chunk.byteLength)) {
              skip -= BigInt(chunk.byteLength);
              continue;
            }
            const start = Number(skip);
            const take = Math.min(remaining, chunk.byteLength - start);
            chunks.push(chunk.slice(start, start + take));
            remaining -= take;
            skip = 0n;
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
        let cursor = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, cursor);
          cursor += chunk.byteLength;
        }
        return bytes;
      }
    };
  }

  async inspectImmutable(contentHash: Sha256, keyPrefix?: string): Promise<ImmutableObjectInspection> {
    const key = this.key(contentHash, keyPrefix);
    try {
      const metadata = await this.client.head(key, this.options());
      const bytes = await this.readImmutable(contentHash, keyPrefix);
      return {
        contentHash,
        key,
        exists: true,
        byteSize: bytes.byteLength,
        mediaType: metadata.contentType,
        metadata: { sha256: contentHash, immutable: "true", access: "private" }
      };
    } catch (error) {
      if (isNotFound(error)) return { contentHash, key, exists: false, metadata: {} };
      if (error instanceof OperationalStateError) throw error;
      throw mapObjectStoreError(error, "inspect");
    }
  }

  async existsImmutable(contentHash: Sha256, keyPrefix?: string): Promise<boolean> {
    return (await this.inspectImmutable(contentHash, keyPrefix)).exists;
  }

  async materializeUploadedObject(input: {
    readonly sourcePath: string;
    readonly declaredMediaType: string;
    readonly maximumSizeBytes: number;
  }): Promise<MaterializedUploadedObject> {
    if (input.sourcePath.length === 0 || input.maximumSizeBytes < 0 || !Number.isSafeInteger(input.maximumSizeBytes)) {
      throw new OperationalStateError("INVALID_CONFIGURATION");
    }

    let metadata: Awaited<ReturnType<typeof head>>;
    try {
      metadata = await this.client.head(input.sourcePath, this.options());
      if (metadata.size > input.maximumSizeBytes || metadata.contentType !== input.declaredMediaType) {
        throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      }
    } catch (error) {
      if (error instanceof OperationalStateError) throw error;
      if (isNotFound(error)) throw new OperationalStateError("OBJECT_READ_FAILED");
      throw mapObjectStoreError(error, "read");
    }

    let result: Awaited<ReturnType<typeof get>>;
    try {
      result = await this.client.get(input.sourcePath, { ...this.options(), access: "private", useCache: false });
    } catch (error) {
      if (isNotFound(error)) throw new OperationalStateError("OBJECT_READ_FAILED");
      throw mapObjectStoreError(error, "read");
    }
    if (result === null || result.statusCode !== 200) throw new OperationalStateError("OBJECT_READ_FAILED");

    const digest = createHash("sha256");
    let byteSize = 0;
    const reader = result.stream.getReader();
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        const chunk = item.value ?? new Uint8Array();
        byteSize += chunk.byteLength;
        if (byteSize > input.maximumSizeBytes) throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
        digest.update(chunk);
      }
    } catch (error) {
      if (error instanceof OperationalStateError) throw error;
      throw new OperationalStateError("OBJECT_READ_FAILED");
    } finally {
      reader.releaseLock();
    }
    if (byteSize !== metadata.size) throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");

    const contentHash = digest.digest("hex") as Sha256;
    const storageKey = this.key(contentHash);
    if (!this.client.copy) throw new OperationalStateError("OBJECT_WRITE_FAILED");

    try {
      await this.client.copy(input.sourcePath, storageKey, {
        ...this.options(),
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: metadata.contentType
      });
      const inspection = await this.inspectImmutable(contentHash);
      if (!inspection.exists || inspection.byteSize !== byteSize || inspection.mediaType !== metadata.contentType) {
        throw new OperationalStateError("OBJECT_INTEGRITY_MISMATCH");
      }
      return { contentHash, storageKey, byteSize, mediaType: metadata.contentType, created: true };
    } catch (error) {
      if (error instanceof OperationalStateError) throw error;
      if (!isConditionalConflict(error)) throw mapObjectStoreError(error, "write");
      const inspection = await this.inspectImmutable(contentHash);
      // Content identity is SHA-256 of the exact bytes. A later attempt may
      // declare a different MIME type; that provenance belongs to the attempt,
      // not to the immutable content-addressed object.
      if (!inspection.exists || inspection.byteSize !== byteSize) {
        throw new OperationalStateError("OBJECT_ALREADY_EXISTS_MISMATCH");
      }
      return { contentHash, storageKey, byteSize, mediaType: metadata.contentType, created: false };
    }
  }
}

export function createVercelBlobImmutableObjectStore(): VercelBlobImmutableObjectStore {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new OperationalStateError("INVALID_CONFIGURATION");
  return new VercelBlobImmutableObjectStore(token);
}
