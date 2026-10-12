import { open, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { MechanismSceneV3Schema } from "@still-shift/scene-contract";
import { preflightNativePbrResources } from "../../../renderer-core/src/native3d/pbr-allocations.ts";
import { createHash } from "node:crypto";
import { gltfJsonHash, freezeGltfAsset } from "./gltf-identity.ts";
import type { NativePbrPixelInput } from "./gltf-pbr.ts";
export class NativePbrResourceError extends Error {
  readonly location: { code: string; path: (string | number)[] };
  constructor(message: string, path: (string | number)[]) {
    super(`comp-native3d-resource: ${message}`);
    this.name = "NativePbrResourceError";
    this.location = { code: "comp-native3d-resource", path };
  }
}
const fail = (message: string, path: (string | number)[]): never => {
  throw new NativePbrResourceError(message, path);
};
/** Verified separate binary resources; no encoded/decoded image arrays enter source JSON transport. */
async function readNativePbrSourceResources(
  input: unknown,
  sourceDirectory: string,
  options: { signal?: AbortSignal } = {},
  retainPixels = true,
) {
  options.signal?.throwIfAborted();
  const source = MechanismSceneV3Schema.parse(input);
  if (gltfJsonHash(source.geometry) !== source.geometrySha256)
    fail("Source geometry identity is stale", ["geometrySha256"]);
  const allocation = preflightNativePbrResources(source.geometry).receipt;
  const images: NativePbrPixelInput[] = [],
    paths: Record<string, string> = Object.create(null);
  const root = await realpath(resolve(sourceDirectory)).catch(() =>
    fail("Local resource root is inaccessible", ["resources"]),
  );
  const rootInfo = await stat(root).catch(() =>
    fail("Local resource root is inaccessible", ["resources"]),
  );
  if (!rootInfo.isDirectory())
    fail("Local resource root must be a directory", ["resources"]);
  for (const [index, reference] of source.resources.entries()) {
    options.signal?.throwIfAborted();
    const location = ["resources", index, "path"],
      path = await realpath(resolve(root, reference.path)).catch(() =>
        fail("Local binary resource is missing", location),
      );
    const displacement = relative(root, path);
    if (
      isAbsolute(displacement) ||
      displacement === ".." ||
      displacement.startsWith("../")
    )
      fail("Binary resource escapes its canonical local root", location);
    const handle = await open(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    ).catch(() => fail("Cannot open regular binary resource", location));
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== reference.bytes)
        fail("Binary resource size/type differs before allocation", [
          "resources",
          index,
          "bytes",
        ]);
      // Verification-only callers never allocate a complete RGBA body. Each
      // read owns at most64KiB, including a sentinel for unexpected growth.
      const rgba = retainPixels ? new Uint8Array(reference.bytes) : undefined;
      const chunk = new Uint8Array(Math.min(65536, reference.bytes + 1));
      const identity = createHash("sha256");
      let offset = 0;
      while (offset <= reference.bytes) {
        options.signal?.throwIfAborted();
        const { bytesRead } = await handle.read(
          chunk,
          0,
          Math.min(chunk.length, reference.bytes + 1 - offset),
          offset,
        );
        if (!bytesRead) break;
        if (offset + bytesRead > reference.bytes)
          fail("Binary resource changed during bounded read", location);
        const part = chunk.subarray(0, bytesRead);
        identity.update(part);
        rgba?.set(part, offset);
        offset += bytesRead;
      }
      const after = await handle.stat();
      options.signal?.throwIfAborted();
      if (
        offset !== reference.bytes ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        fail("Binary resource changed during bounded read", location);
      if (`sha256:${identity.digest("hex")}` !== reference.sha256)
        fail("Binary resource checksum differs", [
          "resources",
          index,
          "sha256",
        ]);
      if (rgba) images.push({ image: reference.image, rgba });
      paths[reference.image] = path;
    } finally {
      await handle.close();
    }
  }
  options.signal?.throwIfAborted();
  return {
    source: freezeGltfAsset(source),
    images,
    paths: Object.freeze(paths),
    allocation,
  };
}

/** Retain decoded bodies for callers that actually prepare browser resources. */
export async function loadNativePbrSourceResources(
  input: unknown,
  sourceDirectory: string,
  options: { signal?: AbortSignal } = {},
) {
  return await readNativePbrSourceResources(input, sourceDirectory, options);
}
/** Node composition preparation needs only verified paths and identities. */
export async function verifyNativePbrSourceResources(
  input: unknown,
  sourceDirectory: string,
  options: { signal?: AbortSignal } = {},
) {
  const verified = await readNativePbrSourceResources(
    input,
    sourceDirectory,
    options,
    false,
  );
  return {
    source: verified.source,
    paths: verified.paths,
    allocation: verified.allocation,
  };
}
