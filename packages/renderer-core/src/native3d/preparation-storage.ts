import type { Composition } from "@still-shift/scene-contract";
import {
  createRenderStorageAsync,
  renderMemory,
} from "../managed-memory-context.ts";
import { passageError } from "../passage-diagnostics.ts";

const maximumDepth = 64;
const maximumArrayEntries = 600000;
const maximumObjectFields = 256;
// Bound each live key list plus descriptors, ancestor entries and call controls.
const scannerBytes = maximumDepth * (maximumObjectFields * 16 + 1024);
type Storage = { pixels: number; metadata: number };
function invalid(message: string): never {
  return passageError("comp-native3d-source", message, {
    path: "preparedNative3D",
  });
}
function ownValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !("value" in descriptor))
    invalid("Native preparation transport cannot contain accessors");
  return descriptor?.value;
}
/** Numeric payload slots are application storage; objects and text use metadata.
 * This bounds supported JSON transport copies, not V8 or driver physical RSS.
 */
function measure(
  value: unknown,
  copies: number,
  storage: Storage,
  available: Storage,
  ancestors: Set<object>,
  depth = 0,
  omitted?: unknown,
): void {
  if (value === omitted && omitted !== undefined) return;
  function add(bucket: keyof Storage, bytes: number) {
    storage[bucket] += bytes * copies;
    if (
      !Number.isSafeInteger(storage[bucket]) ||
      storage[bucket] > available[bucket]
    )
      passageError(
        "comp-native3d-limit",
        `Native catalogue ${bucket} exceeds its worker quota before schema copies`,
        { path: "preparedNative3D" },
      );
  }
  if (typeof value === "string") return add("metadata", 80 + value.length * 2);
  if (value === null || typeof value !== "object") {
    if (
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint"
    )
      invalid("Native preparation transport must contain JSON values");
    return add("metadata", 16);
  }
  if (depth >= maximumDepth || ancestors.has(value))
    invalid("Native preparation transport is cyclic or too deeply nested");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > maximumArrayEntries)
        invalid(
          "Native preparation array exceeds the geometry cardinality bound",
        );
      add("metadata", 80);
      for (let index = 0; index < value.length; index++) {
        const child = ownValue(value, String(index));
        if (typeof child === "number") add("pixels", 16);
        else {
          add("metadata", 16);
          measure(
            child,
            copies,
            storage,
            available,
            ancestors,
            depth + 1,
            omitted,
          );
        }
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype)
      invalid("Native preparation transport must contain plain JSON objects");
    let fields = 0;
    for (const key in value)
      if (Object.hasOwn(value, key) && ++fields > maximumObjectFields)
        invalid(
          "Native preparation object exceeds its declaration field bound",
        );
    const keys = Object.getOwnPropertyNames(value);
    if (keys.length !== fields || Object.getOwnPropertySymbols(value).length)
      invalid(
        "Native preparation transport must contain enumerable string fields",
      );
    add("metadata", 208);
    for (const key of keys) {
      add("metadata", 144 + key.length * 2);
      measure(
        ownValue(value, key),
        copies,
        storage,
        available,
        ancestors,
        depth + 1,
        omitted,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}
function variantCopies(composition: Composition, asset: string) {
  let requests = 1;
  for (const scope of [composition, ...(composition.precomps ?? [])])
    for (const layer of scope.layers) {
      if (layer.type !== "native3d" || layer.asset !== asset) continue;
      if (
        [
          layer.partOverrides,
          layer.materialOverrides,
          layer.pbrMaterialOverrides,
        ].some(
          (overrides) =>
            overrides &&
            Object.values(overrides).some((value) => Object.keys(value).length),
        )
      )
        requests++;
    }
  // The catalogue separately enforces64 distinct variants. Counting duplicate
  // nonempty requests conservatively avoids allocating a normalization key set.
  return 4 * Math.min(requests, 64);
}
function catalogueStorage(
  composition: Composition,
  input: unknown,
  available: Storage,
): Storage {
  const storage = { pixels: 0, metadata: scannerBytes };
  const ancestors = new Set<object>();
  measure(input, 8, storage, available, ancestors);
  const assets = ownValue(input, "assets");
  for (const asset of composition.assets) {
    if (asset.type !== "native3d") continue;
    const source = ownValue(ownValue(assets, asset.id), "source");
    const meshes = ownValue(ownValue(source, "geometry"), "meshes");
    measure(
      source,
      variantCopies(composition, asset.id),
      storage,
      available,
      ancestors,
      0,
      asset.format === "mechanism-scene-2" ? undefined : meshes,
    );
  }
  return storage;
}
/** Admit raw transport/schema/hash staging and retained catalogue copies before
 * the first schema parse. Failure retires only local owners; caller leases survive.
 */
export async function prepareNativeCatalogueStorage<T extends object>(
  composition: Composition,
  input: unknown,
  prepare: () => Promise<T>,
): Promise<T> {
  const memory = renderMemory();
  if (!memory) return prepare();
  const scanner = memory.reserve("metadata", scannerBytes);
  let storage: Storage;
  try {
    const current = memory.statistics.current;
    storage = catalogueStorage(composition, input, {
      pixels: memory.limits.pixels - current.pixels,
      metadata: memory.limits.metadata - current.metadata,
    });
  } finally {
    scanner.release();
  }
  const retained = !memory.hasScratch;
  const metadata = memory.reserve(
    "metadata",
    storage.metadata,
    undefined,
    retained,
  );
  const finish = metadata.deferRelease();
  try {
    const owner = await createRenderStorageAsync(
      Math.max(1, storage.pixels),
      () => ({ value: undefined as T | undefined }),
      async (owner) => {
        owner.value = await prepare();
      },
      (owner) => {
        owner.value = undefined;
        metadata.release();
      },
      retained,
    );
    finish();
    if (!metadata.active) throw Error("Native catalogue owner was disposed");
    return owner.value!;
  } catch (error) {
    try {
      metadata.release();
      finish();
    } catch {
      /* Preserve schema, identity, quota or cancellation failure. */
    }
    throw error;
  }
}
