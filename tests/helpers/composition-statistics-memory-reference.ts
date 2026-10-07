import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
  releaseRenderCanvas,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { allocateRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
import {
  createCompositionPreview,
  loadCompositionResources,
  type CompositionPreview,
} from "../../packages/renderer-core/src/index.ts";
import { withManagedFrame } from "../../packages/execution-runtime/src/composition-frame-capture.ts";

type Snapshot = ReturnType<NonNullable<CompositionPreview["renderStatistics"]>>;
let pending: { memory: ManagedMemory; snapshot: Snapshot } | undefined;

const fixture: Composition = {
  schemaVersion: "composition-1",
  id: "managed-statistics-native",
  width: 32,
  height: 24,
  fps: 60,
  frameCount: 8,
  assets: [],
  background: "#22446680",
  layers: [
    {
      id: "moving",
      type: "solid",
      size: [9, 7],
      color: "#7799cc80",
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [0.35, 2.25], easing: "linear" },
            { frame: 7, value: [21.65, 11.75] },
          ],
        },
      },
    },
    {
      id: "static",
      type: "solid",
      size: [17, 13],
      color: "#cc6633b7",
      transform: { anchor: [0, 0], position: [3.25, 4.45] },
      effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 2 } }],
    },
  ],
};

async function checkStationaryFrameMemory(backend: "canvas2d" | "webgl2") {
  const stationary = structuredClone(fixture);
  stationary.layers[0]!.transform!.position = [8.35, 6.25];
  const resources = await loadCompositionResources(stationary, (id) => id);
  const baseline = createCompositionPreview(
    document.createElement("canvas"),
    stationary,
    resources,
    { backend, preserveAlpha: true },
  );
  let expected: Uint8ClampedArray;
  try {
    baseline.renderFrame(0);
    expected = baseline.readPixels().slice();
  } finally {
    baseline.dispose();
  }
  const memory = new ManagedMemory({
    pixels: 64 * 1024 * 1024,
    metadata: 4 * 1024 * 1024,
  });
  try {
    return await withManagedMemory(memory, async () => {
      const canvas = createRenderCanvas();
      memory.beginScratch();
      const preview = createCompositionPreview(canvas, stationary, resources, {
        backend,
        preserveAlpha: true,
      });
      memory.commitScratch();
      let reused = 0,
        frames = 0,
        retainedMetadata = 0;
      try {
        for (const frame of [0, 1, 7, 3, 0]) {
          await withManagedFrame(async () => {
            const report = preview.renderFrame(frame);
            const expectedSamples = backend === "webgl2" && frames > 0 ? 0 : 1;
            if (report.samples !== expectedSamples)
              throw Error("Native stationary frame changed its reuse behavior");
            if (report.samples === 0) reused++;
            const pixels = preview.readPixels();
            if (pixels.length !== expected.length)
              throw Error("Native stationary frame length differs");
            for (let byte = 0; byte < pixels.length; byte++)
              if (pixels[byte] !== expected[byte])
                throw Error(
                  `Native stationary frame ${frame} byte ${byte} differs`,
                );
            frames++;
          });
          if (frames === 1)
            retainedMetadata = memory.statistics.current.metadata;
          if (memory.statistics.current.metadata !== retainedMetadata)
            throw Error(
              "Native stationary frame retained replacement or comparison metadata",
            );
        }
      } finally {
        preview.dispose();
        releaseRenderCanvas(canvas);
      }
      const after = memory.statistics;
      if (after.current.metadata || after.current.pixels || after.reservations)
        throw Error(
          "Native stationary preview retained storage after disposal",
        );
      return {
        frames,
        reused,
        retainedMetadata,
        exactOriginalNativePixels: true,
        after,
      };
    });
  } finally {
    memory.dispose();
  }
}

/** The actual page result retains its owned snapshot until the Node caller acknowledges its completed RPC. */
export async function checkManagedSubmissionMemory(
  backend: "canvas2d" | "webgl2",
) {
  if (pending)
    throw Error("A native statistics RPC is still awaiting acknowledgement");
  const stationaryFrames = await checkStationaryFrameMemory(backend);
  const resources = await loadCompositionResources(fixture, (id) => id);
  const baseline = createCompositionPreview(
    document.createElement("canvas"),
    fixture,
    resources,
    { backend, preserveAlpha: true },
  );
  const expected = new Map<number, Uint8ClampedArray>();
  try {
    for (let frame = 0; frame < fixture.frameCount; frame++) {
      baseline.renderFrame(frame);
      expected.set(frame, baseline.readPixels().slice());
    }
  } finally {
    baseline.dispose();
  }
  const memory = new ManagedMemory({
    pixels: 64 * 1024 * 1024,
    metadata: 4 * 1024 * 1024,
  });
  try {
    return await withManagedMemory(memory, async () => {
      const canvas = createRenderCanvas();
      memory.beginScratch();
      const preview = createCompositionPreview(canvas, fixture, resources, {
        backend,
        preserveAlpha: true,
        collectStatistics: true,
      });
      memory.commitScratch();
      let frameChecks = 0;
      let snapshot: Snapshot;
      try {
        for (const frame of [0, 1, 2, 3, 4, 5, 6, 7, 7, 3, 0]) {
          await withManagedFrame(async () => {
            preview.renderFrame(frame);
            const actual = preview.readPixels(),
              reference = expected.get(frame)!;
            if (actual.length !== reference.length)
              throw Error("Native statistics frame length differs");
            for (let byte = 0; byte < actual.length; byte++)
              if (actual[byte] !== reference[byte])
                throw Error(
                  `Native statistics frame ${frame} byte ${byte} differs`,
                );
            frameChecks++;
          });
        }
        snapshot = preview.renderStatistics!();
      } finally {
        preview.dispose();
        releaseRenderCanvas(canvas);
      }
      if (
        !memory.owns(snapshot) ||
        !snapshot.spans.length ||
        memory.statistics.current.pixels
      )
        throw Error(
          `Native statistics snapshot has incorrect post-preview ownership: ${JSON.stringify(
            {
              backend,
              owned: memory.owns(snapshot),
              rows: snapshot.spans.length,
              memory: memory.statistics,
            },
          )}`,
        );
      pending = { memory, snapshot };
      return allocateRenderMetadata(256, () => ({
        status: "passed" as const,
        backend,
        frameChecks,
        stationaryFrames,
        exactOriginalNativePixels: true,
        ownedThroughRpc: memory.owns(snapshot),
        beforeRpc: memory.statistics,
        submission: snapshot,
      }));
    });
  } catch (error) {
    pending = undefined;
    memory.dispose();
    throw error;
  }
}

export function acknowledgeManagedSubmissionMemory() {
  const result = pending;
  if (!result) throw Error("No native statistics RPC awaits acknowledgement");
  const before = result.memory.statistics;
  const ownedBefore = result.memory.owns(result.snapshot);
  const rowsBefore = result.snapshot.spans.length;
  result.memory.dispose();
  pending = undefined;
  return {
    status: "passed" as const,
    ownedBefore,
    rowsBefore,
    snapshotReferencesDropped:
      result.snapshot.spans.length === 0 &&
      result.snapshot.byLayerType.length === 0,
    before,
    after: result.memory.statistics,
  };
}
