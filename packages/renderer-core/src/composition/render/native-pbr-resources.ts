import type {
  CompositionPreparedNative3DVersions,
  NativePbrBinaryReference,
} from "@still-shift/scene-contract";
import type { PreparedNative3DSceneVersions } from "../../native3d/types-v2.ts";
import type {
  PreparedNativePbrResources,
  NativePbrPixelInput,
} from "../../native3d/pbr-resources.ts";
import {
  createRenderStorageAsync,
  readRenderResponsePixels,
  releaseRenderPixels,
  releaseRenderStorage,
  renderMemory,
} from "../../managed-memory-context.ts";
import { passageError } from "../../passage-diagnostics.ts";

/** Retain preparation copies separately from the world factory's CPU/GPU storage. */
type ResourceOwner = {
  value?: PreparedNativePbrResources;
  release: (resource: PreparedNativePbrResources) => void;
};
const owners = new WeakMap<PreparedNativePbrResources, ResourceOwner>();
function destroyOwner(owner: ResourceOwner) {
  if (owner.value) {
    owners.delete(owner.value);
    owner.release(owner.value);
    delete owner.value;
  }
}
export function releaseCompositionPbrResources(
  resources: Readonly<Record<string, PreparedNativePbrResources>>,
) {
  for (const resource of Object.values(resources)) {
    const owner = owners.get(resource);
    if (owner) releaseRenderStorage(owner, destroyOwner);
  }
}

/** Reject size disagreement before allocation; unmanaged preview has the same streaming bound. */
async function readBinary(
  response: Response,
  reference: NativePbrBinaryReference,
  path: string,
): Promise<ArrayBuffer> {
  if (
    !response.ok ||
    response.headers.get("Content-Length") !== String(reference.bytes) ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    passageError(
      "comp-native3d-resource",
      `PBR binary response requires ${reference.bytes} bytes (status ${response.status}, Content-Length ${response.headers.get("Content-Length")})`,
      { path },
    );
  }
  if (renderMemory())
    return readRenderResponsePixels(response, reference.bytes);
  const reader = response.body.getReader(),
    bytes = new Uint8Array(reference.bytes);
  let count = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      if (count + part.value.byteLength > bytes.byteLength)
        passageError(
          "comp-native3d-resource",
          "PBR binary body exceeds its declared byte size",
          { path },
        );
      bytes.set(part.value, count);
      count += part.value.byteLength;
    }
    if (count !== bytes.byteLength)
      passageError(
        "comp-native3d-resource",
        "PBR binary body differs from its declared byte size",
        { path },
      );
    return bytes.buffer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fetch separate HTTP binaries once per source, then prepare every immutable style variant. */
export async function loadCompositionPbrResources(
  transport: CompositionPreparedNative3DVersions,
  catalogue: Readonly<Record<string, PreparedNative3DSceneVersions>>,
  assetUrl: (id: string) => string,
  signal?: AbortSignal,
): Promise<Readonly<Record<string, PreparedNativePbrResources>>> {
  const resources: Record<string, PreparedNativePbrResources> =
    Object.create(null);
  if (transport.version !== "composition-prepared-native3d-3") return resources;
  const { prepareNativePbrResources, releasePreparedNativePbrResources } =
    await import("../../native3d/pbr-resources.ts");
  try {
    for (const [asset, scene] of Object.entries(catalogue)) {
      if (scene.version !== "prepared-native3d-scene-3") continue;
      const inputs: NativePbrPixelInput[] = [];
      try {
        const references = transport.assets[asset]!.binaryResources;
        for (const [index, reference] of references.entries()) {
          signal?.throwIfAborted();
          const response = await fetch(assetUrl(reference.asset), {
            signal: signal ?? null,
          });
          const bytes = await readBinary(
            response,
            reference,
            `preparedNative3D.assets.${asset}.binaryResources.${index}`,
          );
          inputs.push({ image: reference.image, rgba: new Uint8Array(bytes) });
        }
        for (const variant of Object.values(scene.variants)) {
          signal?.throwIfAborted();
          const allocation = variant.allocation;
          // One private source-array copy and RGBA copy, plus hash's transient
          // RGBA copy. Conservative retained admission covers that transient too.
          const owner = await createRenderStorageAsync<ResourceOwner>(
            allocation.sourceAttributeBytes + allocation.pixelBytes * 2,
            () => ({ release: releasePreparedNativePbrResources }),
            async (owner) => {
              try {
                owner.value = await prepareNativePbrResources(
                  variant.source.geometry,
                  inputs,
                );
              } catch (error) {
                passageError(
                  error instanceof Error &&
                    error.message.includes("comp-native3d-checksum")
                    ? "comp-native3d-checksum"
                    : "comp-native3d-resource",
                  error instanceof Error ? error.message : String(error),
                  { path: `preparedNative3D.assets.${asset}.binaryResources` },
                );
              }
            },
            destroyOwner,
          );
          const prepared = owner.value!;
          owners.set(prepared, owner);
          resources[variant.sourceKey] = prepared;
        }
      } finally {
        for (const input of inputs) releaseRenderPixels(input.rgba);
      }
    }
    signal?.throwIfAborted();
    return Object.freeze(resources);
  } catch (error) {
    releaseCompositionPbrResources(resources);
    throw error;
  }
}
