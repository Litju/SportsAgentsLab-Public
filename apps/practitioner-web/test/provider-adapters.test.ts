import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText } from "ai";
import { BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { sha256Hex } from "@mef/operational-state";
import {
  createOpenCodeGoModel,
  getOpenCodeStatus
} from "../src/server/open-code-model.ts";
import {
  VercelBlobImmutableObjectStore,
  type VercelBlobClient
} from "../src/server/vercel-blob-store.ts";

class FakeBlobClient implements VercelBlobClient {
  readonly objects = new Map<string, { readonly bytes: Uint8Array; readonly mediaType: string }>();
  readonly putCalls: Array<{ readonly pathname: string; readonly options: Parameters<VercelBlobClient["put"]>[2] }> = [];

  put(...args: Parameters<VercelBlobClient["put"]>): ReturnType<VercelBlobClient["put"]> {
    return (async () => {
      const [pathname, body, options] = args;
      this.putCalls.push({ pathname, options });
      if (this.objects.has(pathname)) throw new BlobPreconditionFailedError();
      const bytes = new Uint8Array(await new Blob([body as BlobPart]).arrayBuffer());
      this.objects.set(pathname, {
        bytes,
        mediaType: options.contentType ?? "application/octet-stream"
      });
      return {} as Awaited<ReturnType<VercelBlobClient["put"]>>;
    })();
  }

  head(...args: Parameters<VercelBlobClient["head"]>): ReturnType<VercelBlobClient["head"]> {
    return (async () => {
      const pathname = args[0];
      const object = this.objects.get(pathname);
      if (!object) throw new BlobNotFoundError();
      return {
        size: object.bytes.byteLength,
        uploadedAt: new Date("2026-08-12T00:00:00.000Z"),
        pathname,
        contentType: object.mediaType
      } as Awaited<ReturnType<VercelBlobClient["head"]>>;
    })();
  }

  get(...args: Parameters<VercelBlobClient["get"]>): ReturnType<VercelBlobClient["get"]> {
    return (async () => {
      const pathname = args[0];
      const object = this.objects.get(pathname);
      if (!object) return null;
      const bytes = new Uint8Array(object.bytes);
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        }),
        headers: new Headers(),
        blob: {
          url: `https://blob.test/${pathname}`,
          downloadUrl: `https://blob.test/${pathname}`,
          pathname,
          contentDisposition: "inline",
          cacheControl: "no-cache",
          uploadedAt: new Date("2026-08-12T00:00:00.000Z"),
          etag: "mock-etag",
          contentType: object.mediaType,
          size: bytes.byteLength
        }
      } as Awaited<ReturnType<VercelBlobClient["get"]>>;
    })();
  }

  copy(...args: Parameters<NonNullable<VercelBlobClient["copy"]>>): ReturnType<NonNullable<VercelBlobClient["copy"]>> {
    return (async () => {
      const [sourcePath, destinationPath, options] = args;
      if (this.objects.has(destinationPath)) throw new BlobPreconditionFailedError();
      const source = this.objects.get(sourcePath);
      if (!source) throw new BlobNotFoundError();
      this.objects.set(destinationPath, {
        bytes: new Uint8Array(source.bytes),
        mediaType: options.contentType ?? source.mediaType
      });
      return {} as Awaited<ReturnType<NonNullable<VercelBlobClient["copy"]>>>;
    })();
  }
}

test("OpenCode Go adapter uses the configured Responses endpoint without a live request", async () => {
  let request: { readonly url: string; readonly authorization: string; readonly body: Record<string, unknown> } | undefined;
  const mockFetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    request = {
      url: String(input),
      authorization: headers.get("authorization") ?? "",
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    };
    return new Response(JSON.stringify({
      id: "mock-response",
      object: "response",
      created_at: 1,
      model: "mock-model",
      status: "completed",
      output: [{
        type: "message",
        id: "message-1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "bounded mock response", annotations: [] }]
      }],
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await generateText({
    model: createOpenCodeGoModel({
      apiKey: "mock-secret",
      baseUrl: "https://mock.opencode.test/v1",
      modelId: "mock-model",
      fetch: mockFetch
    }),
    prompt: "Explain the bounded shell."
  });

  assert.equal(result.text, "bounded mock response");
  assert.equal(request?.url, "https://mock.opencode.test/v1/responses");
  assert.equal(request?.authorization, "Bearer mock-secret");
  assert.equal(request?.body.model, "mock-model");
  assert.equal(getOpenCodeStatus().configured, false);
});

test("Vercel Blob adapter is private, content-addressed, immutable, and byte-preserving", async () => {
  const client = new FakeBlobClient();
  const store = new VercelBlobImmutableObjectStore("mock-blob-token", client);
  const bytes = new TextEncoder().encode("ML-99 synthetic immutable bytes");
  const contentHash = sha256Hex(bytes);
  const input = { contentHash, bytes, mediaType: "application/octet-stream" };

  const first = await store.putImmutable(input);
  const duplicate = await store.putImmutable(input);
  const derived = await store.putImmutable({ ...input, keyPrefix: "canonical/sha256" });
  const inspection = await store.inspectImmutable(contentHash);
  const retrieved = await store.readImmutable(contentHash);
  const derivedRetrieved = await store.readImmutable(contentHash, "canonical/sha256");

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.key, `originals/sha256/${contentHash}`);
  assert.equal(derived.key, `canonical/sha256/${contentHash}`);
  assert.deepEqual(retrieved, bytes);
  assert.deepEqual(derivedRetrieved, bytes);
  assert.deepEqual(inspection.metadata, { sha256: contentHash, immutable: "true", access: "private" });
  assert.equal(client.putCalls[0]?.options.access, "private");
  assert.equal(client.putCalls[0]?.options.allowOverwrite, false);
  assert.equal(client.putCalls[0]?.options.addRandomSuffix, false);
});

test("Vercel Blob adapter rejects an existing object with conflicting media type", async () => {
  const client = new FakeBlobClient();
  const store = new VercelBlobImmutableObjectStore("mock-blob-token", client);
  const bytes = new TextEncoder().encode("same bytes");
  const contentHash = sha256Hex(bytes);
  const key = `originals/sha256/${contentHash}`;
  client.objects.set(key, { bytes, mediaType: "text/plain" });

  await assert.rejects(
    () => store.putImmutable({ contentHash, bytes, mediaType: "application/octet-stream" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "OBJECT_ALREADY_EXISTS_MISMATCH"
  );
});

test("Vercel Blob source reader exposes bounded ranges and verifies the streamed identity", async () => {
  const client = new FakeBlobClient();
  const store = new VercelBlobImmutableObjectStore("mock-blob-token", client);
  const bytes = new TextEncoder().encode("streamed source bytes without buffering the source");
  const contentHash = sha256Hex(bytes);
  await store.putImmutable({ contentHash, bytes, mediaType: "text/plain" });

  const source = await store.openImmutableSourceReader("src_streamed-source", contentHash);
  assert.equal(source.byteLength, BigInt(bytes.byteLength));
  assert.deepEqual(await source.readRange(0n, 8), bytes.slice(0, 8));
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const streamed = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    streamed.set(chunk, offset);
    offset += chunk.byteLength;
  }
  assert.deepEqual(streamed, bytes);
});

test("Vercel Blob adapter rejects a corrupt object at a content identity", async () => {
  const client = new FakeBlobClient();
  const store = new VercelBlobImmutableObjectStore("mock-blob-token", client);
  const bytes = new TextEncoder().encode("expected bytes");
  const contentHash = sha256Hex(bytes);
  const key = `originals/sha256/${contentHash}`;
  client.objects.set(key, { bytes: new TextEncoder().encode("corrupt bytes"), mediaType: "application/octet-stream" });

  await assert.rejects(
    () => store.putImmutable({ contentHash, bytes, mediaType: "application/octet-stream" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "OBJECT_INTEGRITY_MISMATCH"
  );
});

test("Vercel Blob adapter materializes a private staging upload by streaming and content-addressing it", async () => {
  const client = new FakeBlobClient();
  const store = new VercelBlobImmutableObjectStore("mock-blob-token", client);
  const bytes = new TextEncoder().encode("ML-102 staging bytes with exact identity\n");
  client.objects.set("staging/ml102/imp_materialize", { bytes, mediaType: "text/plain" });

  const first = await store.materializeUploadedObject({
    sourcePath: "staging/ml102/imp_materialize",
    declaredMediaType: "text/plain",
    maximumSizeBytes: 1024
  });
  const second = await store.materializeUploadedObject({
    sourcePath: "staging/ml102/imp_materialize",
    declaredMediaType: "text/plain",
    maximumSizeBytes: 1024
  });

  assert.equal(first.contentHash, sha256Hex(bytes));
  assert.equal(first.storageKey, `originals/sha256/${first.contentHash}`);
  assert.equal(first.byteSize, bytes.byteLength);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(await store.readImmutable(first.contentHash), bytes);
});
