import type { Sha256 } from "@mef/generated-ts";
import type { ContentAddressedObjectKey } from "./hash.ts";

export interface ImmutableObjectInput {
  readonly contentHash: Sha256;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly keyPrefix?: string;
}

export interface ImmutablePutResult {
  readonly contentHash: Sha256;
  readonly key: ContentAddressedObjectKey;
  readonly byteSize: number;
  readonly created: boolean;
}

export interface ImmutableObjectInspection {
  readonly contentHash: Sha256;
  readonly key: ContentAddressedObjectKey;
  readonly exists: boolean;
  readonly byteSize?: number;
  readonly mediaType?: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ImmutableObjectStore {
  putImmutable(input: ImmutableObjectInput): Promise<ImmutablePutResult>;
  readImmutable(contentHash: Sha256, keyPrefix?: string): Promise<Uint8Array>;
  inspectImmutable(contentHash: Sha256, keyPrefix?: string): Promise<ImmutableObjectInspection>;
  existsImmutable(contentHash: Sha256, keyPrefix?: string): Promise<boolean>;
}
