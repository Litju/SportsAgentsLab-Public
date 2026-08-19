import type { ImmutableObjectStore } from "@mef/operational-state";
import { createVercelBlobImmutableObjectStore } from "./vercel-blob-store.ts";
import type { VercelBlobImmutableObjectStore } from "./vercel-blob-store.ts";

interface ArtifactStoreCache {
  mefArtifactStore?: VercelBlobImmutableObjectStore;
}

const artifactStoreCache = globalThis as typeof globalThis & ArtifactStoreCache;

export function getConfiguredVercelBlobStore(): VercelBlobImmutableObjectStore | undefined {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return undefined;
  artifactStoreCache.mefArtifactStore ??= createVercelBlobImmutableObjectStore();
  return artifactStoreCache.mefArtifactStore;
}

export function getConfiguredArtifactStore(): ImmutableObjectStore | undefined {
  return getConfiguredVercelBlobStore();
}

export function getArtifactStoreStatus() {
  return {
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    access: "private" as const,
    keyPrefix: "originals/sha256"
  };
}
