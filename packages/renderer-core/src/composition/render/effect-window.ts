import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import { renderMemory } from "../../managed-memory-context.ts";
import type { Matrix } from "../../node-transform.ts";
import type { RenderBackend, Surface } from "./backend.ts";
import type { RenderEffect } from "./graph.ts";
const identity: Matrix = [1, 0, 0, 1, 0, 0];
/** Scope effects retain their original viewport when a mesh captures offscreen art. */
export function applyWindowEffect<S extends Surface>(
  backend: RenderBackend<S>,
  target: S,
  effect: RenderEffect,
  inputs: ReadonlyMap<string, S>,
) {
  const { left, top, width, height } = effect.window!;
  const memory = renderMemory();
  const work = allocateRenderMetadata(
    8192 + inputs.size * 512,
    () => ({ owned: [] as S[], layers: new Map<string, S>() }),
    false,
    (value) => {
      value.layers.clear();
      release(backend, value.owned, false);
    },
  );
  const owned = work.owned;
  let failed = false;
  const crop = (source: S) => {
    const result = backend.createSurface(width, height);
    owned.push(result);
    backend.composite(
      source,
      result,
      "normal",
      1,
      [1, 0, 0, 1, -left, -top],
      [],
    );
    return result;
  };
  try {
    const region = crop(target),
      layers = work.layers;
    for (const [slot, source] of inputs) layers.set(slot, crop(source));
    const local = { ...effect };
    delete local.window;
    backend.applyEffects(region, [local], layers);
    if (backend.replaceRegion) backend.replaceRegion(region, target, left, top);
    else {
      // Backends without region replacement keep exact native surfaces; no byte readback.
      const prior = backend.createSurface(target.width, target.height);
      owned.push(prior);
      backend.composite(target, prior, "normal", 1, identity, []);
      backend.clear(target, null);
      for (const [x, y, w, h] of [
        [0, 0, target.width, top],
        [0, top + height, target.width, target.height - top - height],
        [0, top, left, height],
        [left + width, top, target.width - left - width, height],
      ]) {
        if (w! <= 0 || h! <= 0) continue;
        backend.composite(prior, target, "normal", 1, identity, [
          { matrix: [1, 0, 0, 1, x!, y!], width: w!, height: h! },
        ]);
      }
      backend.composite(
        region,
        target,
        "normal",
        1,
        [1, 0, 0, 1, left, top],
        [],
      );
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    finish(
      () =>
        memory ? releaseRenderMetadata(work) : release(backend, owned, false),
      failed,
    );
  }
}
function release<S extends Surface>(
  backend: RenderBackend<S>,
  owned: S[],
  failed: boolean,
) {
  let first: unknown,
    cleanupFailed = false;
  for (const surface of owned.reverse())
    try {
      backend.releaseSurface(surface);
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true;
        first = error;
      }
    }
  owned.length = 0;
  if (cleanupFailed && !failed) throw first;
}

function finish(cleanup: () => void, failed: boolean) {
  try {
    cleanup();
  } catch (error) {
    if (!failed) throw error;
  }
}
