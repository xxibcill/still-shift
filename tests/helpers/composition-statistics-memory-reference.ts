import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
  releaseRenderCanvas,
  readRenderImageData,
  releaseRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { allocateRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
import {
  createCompositionPreview,
  loadCompositionResources,
  type CompositionPreview,
} from "../../packages/renderer-core/src/index.ts";
import { withManagedFrame } from "../../packages/execution-runtime/src/composition-frame-capture.ts";

import {
  recordVectorPaints,
  replayVectorPaints,
} from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";

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

async function checkRecordingSnapshotMemory() {
  const memory = new ManagedMemory({
    pixels: 64 * 1024 * 1024,
    metadata: 4 * 1024 * 1024,
  });
  let recording: ReturnType<typeof recordVectorPaints> | undefined;
  let snapshot: HTMLCanvasElement | undefined;
  let exactBytes = 0,
    failures = 0;
  await withManagedMemory(memory, async () => {
    const target = createRenderCanvas(),
      source = createRenderCanvas(),
      output = createRenderCanvas();
    for (const canvas of [target, source, output]) {
      canvas.width = 32;
      canvas.height = 24;
    }
    const image = source.getContext("2d")!;
    image.fillStyle = "#b739636d";
    image.fillRect(3, 4, 16, 8);
    recording = recordVectorPaints(target.getContext("2d")!, {
      left: 0,
      top: 0,
      right: 32,
      bottom: 24,
    });
    recording.context.drawImage(source, 0, 0);
    const groups = recording.groups()!,
      command = groups[0]!.commands[0]!;
    if (!("method" in command))
      throw Error("Native snapshot command is not a method");
    snapshot = command.args[0] as HTMLCanvasElement;
    if (
      snapshot === source ||
      !memory.owns(snapshot) ||
      snapshot.width !== 32 ||
      snapshot.height !== 24
    )
      throw Error("Native snapshot backing is not independently owned");
    image.clearRect(0, 0, 32, 24);
    replayVectorPaints(output.getContext("2d")!, groups[0]!);
    const expected = readRenderImageData(
        target.getContext("2d")!,
        0,
        0,
        32,
        24,
      ),
      actual = readRenderImageData(output.getContext("2d")!, 0, 0, 32, 24);
    try {
      if (actual.data.length !== expected.data.length)
        throw Error("Native snapshot pixel lengths differ");
      for (let i = 0; i < actual.data.length; i++)
        if (actual.data[i] !== expected.data[i])
          throw Error(`Native snapshot changed pixel byte ${i}`);
      exactBytes = actual.data.length;
    } finally {
      releaseRenderPixels(expected.data);
      releaseRenderPixels(actual.data);
    }
    // A method lookup now owns a wrapper; include it among the prior owners.
    const drawSnapshot = recording.context.drawImage;
    const before = memory.statistics.current,
      blocker = memory.reserve(
        "pixels",
        memory.limits.pixels - before.pixels - 179999,
      );
    try {
      let failed = false;
      try {
        drawSnapshot(source, 0, 0);
      } catch (error) {
        failed = true;
        if (
          !(error instanceof Error) ||
          !error.message.includes("aggregate worker quota")
        )
          throw error;
        failures++;
      }
      if (!failed)
        throw Error(
          "Native snapshot pixel quota did not stop its original producer",
        );
    } finally {
      blocker.release();
    }
    if (
      memory.statistics.current.pixels !== before.pixels ||
      memory.statistics.current.metadata !== before.metadata ||
      command.args[0] !== snapshot ||
      snapshot.width !== 32
    )
      throw Error("Failed native snapshot changed prior owners");
    releaseRenderCanvas(target);
    releaseRenderCanvas(source);
    releaseRenderCanvas(output);
  });
  if (!recording || !snapshot || !memory.owns(snapshot))
    throw Error("Native recording snapshot was lost after scope exit");
  recording.dispose();
  if (
    snapshot.width ||
    snapshot.height ||
    memory.statistics.current.pixels ||
    memory.statistics.current.metadata ||
    memory.statistics.reservations
  )
    throw Error(
      "Native snapshot backing/control survived scope-exit recording disposal",
    );
  memory.dispose();
  const second = new ManagedMemory({
    pixels: 64 * 1024 * 1024,
    metadata: 4 * 1024 * 1024,
  });
  await withManagedMemory(second, async () => {
    const target = createRenderCanvas(),
      source = createRenderCanvas();
    target.width = source.width = 32;
    target.height = source.height = 24;
    const recording = recordVectorPaints(target.getContext("2d")!, {
      left: 0,
      top: 0,
      right: 32,
      bottom: 24,
    });
    recording.context.drawImage(source, 0, 0);
    const groups = recording.groups()!,
      command = groups[0]!.commands[0]!;
    if (!("method" in command))
      throw Error("Native disposal snapshot command missing");
    const snapshot = command.args[0] as HTMLCanvasElement,
      selected = groups[0]!.selected,
      commands = groups[0]!.commands;
    second.dispose();
    recording.dispose();
    if (
      snapshot.width ||
      snapshot.height ||
      groups.length ||
      selected.size ||
      commands.length ||
      second.statistics.current.pixels ||
      second.statistics.current.metadata ||
      second.statistics.reservations
    )
      throw Error(
        "Allocator-first native recording snapshot did not release actual references/backing",
      );
  });
  return {
    status: "passed" as const,
    exactBytes,
    protectedFailures: failures,
    actualSnapshotCopies: 2,
    disposedAfterScope: true,
    allocatorFirst: true,
    after: memory.statistics,
    allocatorAfter: second.statistics,
  };
}

/** The actual page result retains its owned snapshot until the Node caller acknowledges its completed RPC. */
export async function checkManagedSubmissionMemory(
  backend: "canvas2d" | "webgl2",
) {
  if (pending)
    throw Error("A native statistics RPC is still awaiting acknowledgement");
  const recordingSnapshots =
    backend === "webgl2" ? await checkRecordingSnapshotMemory() : undefined;
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
        recordingSnapshots,
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
