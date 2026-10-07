import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  createCompositionPreview,
  createCompositionPreviewAsync,
  loadCompositionResources,
} from "../../packages/renderer-core/src/index.ts";
import {
  compositionTintFixture,
  type CompositionTintVariant,
} from "./composition-tint-fixture.ts";
import { compositionSourceFixture } from "./composition-source-fixture.ts";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
let pendingSourceMemory: ManagedMemory | undefined;
let pendingRootSnapshot: { roots: unknown[] } | undefined;
let pendingSurfaceSnapshot: { surfaces: unknown[] } | undefined;
export function acknowledgeManagedSourceMemory() {
  const memory = pendingSourceMemory;
  if (!memory) throw Error("No managed source RPC awaits acknowledgement");
  pendingSourceMemory = undefined;
  const before = memory.statistics;
  const snapshot = pendingRootSnapshot;
  if (!snapshot) throw Error("No owned root statistics await acknowledgement");
  const surface = pendingSurfaceSnapshot;
  if (!surface)
    throw Error("No owned surface statistics await acknowledgement");
  const ownedBefore = memory.owns(snapshot),
    rootsBefore = snapshot.roots.length;
  const surfaceOwnedBefore = memory.owns(surface),
    surfacesBefore = surface.surfaces.length;
  memory.dispose();
  pendingRootSnapshot = undefined;
  pendingSurfaceSnapshot = undefined;
  return {
    before,
    after: memory.statistics,
    rootSnapshot: {
      ownedBefore,
      rootsBefore,
      referencesDropped: snapshot.roots.length === 0,
    },
    surfaceSnapshot: {
      ownedBefore: surfaceOwnedBefore,
      surfacesBefore,
      referencesDropped: surface.surfaces.length === 0,
    },
  };
}

export async function checkSharedCompositionSources(options: {
  backend: "canvas2d" | "webgl2";
  software: boolean;
  managed?: boolean;
  animated: boolean;
  variant?: CompositionTintVariant;
  worker: number;
  credential: string;
  scopeKey: string;
  baseUrl: string;
}) {
  if (pendingSourceMemory)
    throw Error("The previous managed source RPC awaits acknowledgement");
  const { composition, svg } = options.variant
    ? await compositionTintFixture(options.software, options.variant)
    : await compositionSourceFixture(options.software, options.animated);
  const resources = await loadCompositionResources(composition, (id) =>
    id === "art"
      ? "data:image/svg+xml," + encodeURIComponent(svg)
      : composition.assets.find((asset) => asset.id === id)!.path,
  );
  const baseline = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources,
    { backend: options.backend, preserveAlpha: true },
  );
  const expected = new Map<number, Uint8ClampedArray>();
  try {
    for (let frame = 0; frame < composition.frameCount; frame++) {
      baseline.renderFrame(frame);
      expected.set(frame, baseline.readPixels().slice());
    }
  } finally {
    baseline.dispose();
  }
  const memory = options.managed
    ? new ManagedMemory({
        pixels: 64 * 1024 * 1024,
        metadata: 16 * 1024 * 1024,
      })
    : undefined;
  const renderCached = async () => {
    const managedResources = memory
      ? await loadCompositionResources(composition, (id) =>
          id === "art"
            ? "/_memory_source_art"
            : composition.assets.find((asset) => asset.id === id)!.path,
        )
      : resources;
    const originalFill = CanvasRenderingContext2D.prototype.fillText,
      originalStroke = CanvasRenderingContext2D.prototype.strokeText,
      originalImage = CanvasRenderingContext2D.prototype.drawImage;
    const paints = { fillText: 0, strokeText: 0, drawImage: 0 };
    CanvasRenderingContext2D.prototype.fillText = function (
      ...args: Parameters<typeof originalFill>
    ) {
      paints.fillText++;
      return originalFill.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.strokeText = function (
      ...args: Parameters<typeof originalStroke>
    ) {
      paints.strokeText++;
      return originalStroke.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...args: Parameters<typeof originalImage>
    ) {
      paints.drawImage++;
      return originalImage.apply(this, args);
    } as typeof originalImage;
    const originalRect = CanvasRenderingContext2D.prototype.fillRect;
    let nativeTintPaints = 0;
    CanvasRenderingContext2D.prototype.fillRect = function (
      ...args: Parameters<typeof originalRect>
    ) {
      if (this.globalCompositeOperation === "source-in") nativeTintPaints++;
      return originalRect.apply(this, args);
    };
    let preview;
    try {
      preview = await createCompositionPreviewAsync(
        createRenderCanvas(),
        composition,
        managedResources,
        {
          backend: options.backend,
          preserveAlpha: true,
          surfaceCache: {
            scopeKey: options.scopeKey,
            byteLimit: 16 * 1024 * 1024,
            exchange: compositionSurfaceExchange(options),
          },
        },
      );
    } catch (error) {
      CanvasRenderingContext2D.prototype.fillRect = originalRect;
      throw error;
    } finally {
      CanvasRenderingContext2D.prototype.fillText = originalFill;
      CanvasRenderingContext2D.prototype.strokeText = originalStroke;
      CanvasRenderingContext2D.prototype.drawImage = originalImage;
    }
    try {
      const frames = [
        ...Array.from({ length: composition.frameCount }, (_, frame) => frame),
        composition.frameCount - 1,
        Math.floor(composition.frameCount / 2),
        1,
        composition.frameCount - 2,
        0,
      ];
      for (const frame of frames) {
        memory?.beginScratch();
        try {
          await preview.prepareFrame(frame);
          preview.renderFrame(frame);
          const actual = preview.readPixels(),
            reference = expected.get(frame)!;
          for (let byte = 0; byte < actual.length; byte++)
            if (actual[byte] !== reference[byte])
              throw Error(
                `${options.backend}/sources/${options.software}/${frame}: byte ${byte}, ${actual[byte]} instead of ${reference[byte]}`,
              );
        } finally {
          memory?.endScratch();
        }
      }
      return {
        worker: options.worker,
        frameChecks: frames.length,
        preparationPaintCalls: paints,
        nativeTintPaints,
        sourceStatistics: preview.sourceCacheStatistics!(),
        surfaceStatistics: preview.surfaceCacheStatistics!(),
        rootStatistics: preview.rootCacheStatistics!(),
      };
    } finally {
      CanvasRenderingContext2D.prototype.fillRect = originalRect;
      preview.dispose();
    }
  };
  if (!memory) return renderCached();
  let completed = false;
  try {
    const result = await withManagedMemory(memory, renderCached);
    const before = memory.statistics;
    pendingSourceMemory = memory;
    pendingRootSnapshot = result.rootStatistics;
    pendingSurfaceSnapshot = result.surfaceStatistics;
    completed = true;
    return {
      ...result,
      managedMemory: {
        coverage:
          "Canvas/GPU renderer and verified asset/font admission; production integration pending",
        before,
        rootSnapshot: undefined as
          | ReturnType<typeof acknowledgeManagedSourceMemory>["rootSnapshot"]
          | undefined,
        surfaceSnapshot: undefined as
          | ReturnType<typeof acknowledgeManagedSourceMemory>["surfaceSnapshot"]
          | undefined,
        after: undefined as ManagedMemory["statistics"] | undefined,
      },
    };
  } finally {
    if (!completed) memory.dispose();
  }
}

export async function checkSourcePreparationFailures() {
  const { CompositionSourceCache } = await import(
    "../../packages/renderer-core/src/composition/render/source-cache.ts"
  );
  const reports = [];
  for (const failure of [
    "checksum",
    "length",
    "alias",
    "lease",
    "budget",
    "abort-claim",
    "abort-publish",
    "abort-hit-hash",
    "abort-publish-hash",
    "null-abort",
    "claim-error",
  ] as const) {
    const controller = new AbortController();
    const reason =
      failure === "null-abort" ? null : Error(`Original source ${failure}`);
    const pixels = new Uint8Array(16);
    const checksum = "sha256:" + (await sha256Hex(pixels.buffer));
    let claims = 0,
      paints = 0,
      restores = 0,
      publishes = 0;
    let canvas: HTMLCanvasElement | undefined;
    const sources = new CompositionSourceCache({
      scopeKey: "sha256:" + "a".repeat(64),
      byteLimit: failure === "budget" ? 31 : 1024,
      signal: controller.signal,
      exchange: {
        async claim() {
          claims++;
          if (failure === "claim-error") throw reason;
          if (failure === "abort-claim" || failure === "null-abort")
            controller.abort(reason);
          if (failure === "checksum")
            return {
              kind: "hit",
              bytes: pixels,
              checksum: "sha256:" + "f".repeat(64),
            };
          if (failure === "abort-hit-hash")
            return { kind: "hit", bytes: pixels, checksum };
          if (failure === "length")
            return { kind: "hit", bytes: new Uint8Array(15), checksum };
          if (failure === "alias")
            return {
              kind: "hit",
              bytes: new Uint8Array(17).subarray(1),
              checksum,
            };
          return {
            kind: "lease",
            token: "test-source",
            byteLength: failure === "lease" ? 15 : 16,
          };
        },
        async publish() {
          publishes++;
          if (failure === "abort-publish") controller.abort(reason);
        },
      },
    });
    const originalDigest = crypto.subtle.digest;
    let digests = 0;
    crypto.subtle.digest = function (
      this: SubtleCrypto,
      ...args: Parameters<typeof originalDigest>
    ) {
      const result = originalDigest.apply(this, args);
      if (
        ++digests === 2 &&
        (failure === "abort-hit-hash" || failure === "abort-publish-hash")
      )
        controller.abort(reason);
      return result;
    };
    let rejected = false;
    try {
      let pending;
      try {
        sources.read(
          { kind: "audit", input: { text: "test" }, width: 2, height: 2 },
          () => {
            paints++;
            canvas = createRenderCanvas();
            canvas.width = canvas.height = 2;
            canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
            return canvas;
          },
          () => {
            restores++;
            throw Error("Invalid pixels reached restoration");
          },
        );
      } catch (error) {
        pending = error;
      }
      if (!(await sources.prepare(pending))) throw pending;
    } catch (error) {
      if (
        failure.startsWith("abort-") ||
        failure === "null-abort" ||
        failure === "claim-error"
      ) {
        if (error !== reason)
          throw Error(`Source ${failure} lost its original reason`);
      } else if (!/checksum|dimensions|storage size|bound/.test(String(error)))
        throw error;
      rejected = true;
    } finally {
      crypto.subtle.digest = originalDigest;
      sources.dispose();
    }
    if (
      !rejected ||
      restores !== 0 ||
      paints !==
        (failure === "abort-publish" || failure === "abort-publish-hash"
          ? 1
          : 0) ||
      publishes !== (failure === "abort-publish" ? 1 : 0) ||
      claims !== (failure === "budget" ? 0 : 1)
    )
      throw Error(`Source ${failure} violated preparation admission`);
    if (canvas && (canvas.width !== 0 || canvas.height !== 0))
      throw Error(`Source ${failure} retained its failed producer canvas`);
    reports.push({
      failure,
      claims,
      paints,
      restores,
      publishes,
      originalReason:
        failure.startsWith("abort-") ||
        failure === "null-abort" ||
        failure === "claim-error",
      retainedCanvasBytes: sources.statistics.retainedCanvasBytes,
    });
  }
  return reports;
}

export async function checkManagedSourceFailures() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  try {
    const reports = await withManagedMemory(
      memory,
      checkSourcePreparationFailures,
    );
    const before = memory.statistics;
    memory.dispose();
    return { reports, before, after: memory.statistics };
  } finally {
    memory.dispose();
  }
}
