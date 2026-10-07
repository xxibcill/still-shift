import {
  createRenderStorage,
  createRenderStorageAsync,
  readRenderResponsePixels,
  releaseRenderStorage,
  renderMemory,
} from "./managed-memory-context.ts";

type Preparation = {
  pending: Set<Promise<void>>;
  failed: boolean;
  reason?: unknown;
};
let preparation: Preparation | undefined;

function nestedPreparation<T>(phase: Preparation, work: () => Promise<T>) {
  const result = Promise.resolve().then(work);
  const settled = result.then(
    () => {
      phase.pending.delete(settled);
    },
    (reason: unknown) => {
      if (!phase.failed) phase.reason = reason;
      phase.failed = true;
      phase.pending.delete(settled);
    },
  );
  phase.pending.add(settled);
  return result;
}

/** One load phase commits every successful input/decoder owner, or releases the whole failed phase. */
export async function prepareRenderResources<T>(
  work: () => Promise<T>,
): Promise<T> {
  const memory = renderMemory();
  if (!memory) return work();
  if (preparation) return nestedPreparation(preparation, work);
  if (memory.hasScratch)
    throw Error("Resource loading requires its own managed preparation phase");
  memory.beginScratch();
  const phase: Preparation = { pending: new Set(), failed: false };
  preparation = phase;
  try {
    let result: T | undefined;
    let failed = false;
    let reason: unknown;
    try {
      result = await work();
    } catch (error) {
      failed = true;
      reason = error;
    }
    // Every started decoder settles while this allocator/preparation phase still owns it.
    while (phase.pending.size) await Promise.all(phase.pending);
    if (failed) throw reason;
    if (phase.failed) throw phase.reason;
    memory.commitScratch();
    return result as T;
  } catch (error) {
    try {
      if (memory.hasScratch) memory.endScratch();
    } catch {
      /* Preserve the original load failure. */
    }
    throw error;
  } finally {
    preparation = undefined;
  }
}

/** Managed loads remain sequential so an early rejection cannot leave a decoder running outside its scope. */
export async function mapRenderResources<T, U>(
  values: readonly T[],
  load: (value: T) => Promise<U>,
): Promise<U[]> {
  if (!renderMemory()) return Promise.all(values.map(load));
  const result: U[] = [];
  for (const value of values) result.push(await load(value));
  return result;
}

export async function readRenderAssetBody(
  response: Response,
): Promise<ArrayBuffer> {
  if (!renderMemory()) return response.arrayBuffer();
  const size = response.headers.get("Content-Length");
  if (
    !size ||
    !/^[1-9]\d*$/.test(size) ||
    !Number.isSafeInteger(Number(size))
  ) {
    await response.body?.cancel().catch(() => {});
    throw Error("Managed asset body requires an exact Content-Length");
  }
  return readRenderResponsePixels(response, Number(size));
}

/** The Blob copy stays charged until its URL is revoked and the loader releases its own reference. */
export function createRenderBlob(
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
  type: string,
): Blob {
  return createRenderStorage(
    bytes.byteLength,
    () => new Blob([bytes], { type }),
    () => {},
    () => {},
    false,
  );
}
export function releaseRenderBlob(blob: Blob): void {
  releaseRenderStorage(blob, () => {});
}

/** This is declared RGBA8 decode capacity; native decoder/driver internals remain separate RSS. */
export function decodeRenderImage(
  url: string,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  return createRenderStorageAsync(
    width * height * 4,
    () => new Image(),
    async (image) => {
      image.src = url;
      await image.decode();
    },
    (image) => image.removeAttribute("src"),
    false,
  );
}

/** Each newly owned FontFace admits its input copy before the native constructor receives bytes. */
export function decodeRenderFont(
  family: string,
  bytes: ArrayBuffer,
  descriptors: FontFaceDescriptors,
  initialize: (face: FontFace) => Promise<void>,
): Promise<FontFace> {
  return createRenderStorageAsync(
    bytes.byteLength,
    () => new FontFace(family, bytes, descriptors),
    initialize,
    (face) => {
      document.fonts.delete(face);
    },
    false,
  );
}
