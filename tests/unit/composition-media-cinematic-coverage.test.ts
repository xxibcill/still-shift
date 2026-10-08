import { afterEach, expect, it, vi } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
import {
  validateRenderedCinematicCompositionCoverage,
  validateRenderedCinematicCompositionCoverageAsync,
} from "../../packages/renderer-core/src/composition/render/cinematic-reveal.ts";
import type { RenderBackend } from "../../packages/renderer-core/src/composition/render/backend.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { prepareCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

const sourceHash = "sha256:" + "0".repeat(64);
const fixture = () =>
  CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "media-cinematic-coverage",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 2,
    assets: [
      {
        id: "painted",
        type: "image",
        path: "painted.png",
        width: 64,
        height: 64,
        sha256: sourceHash,
      },
      {
        id: "foreground",
        type: "image",
        path: "foreground.png",
        width: 16,
        height: 64,
        sha256: sourceHash,
      },
      {
        id: "clip",
        type: "video",
        path: "clip.mkv",
        sha256: sourceHash,
        width: 64,
        height: 64,
        frameCount: 2,
        frameRate: { numerator: 24, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [
      { id: "camera", type: "camera" },
      {
        id: "background",
        type: "image",
        threeD: true,
        size: [64, 64],
        sources: [{ asset: "painted" }],
        fit: "stretch",
        transform: { anchor: [0, 0, 0] },
      },
      {
        id: "subject",
        type: "image",
        threeD: true,
        size: [64, 64],
        sources: [{ asset: "painted" }],
        fit: "stretch",
        trackMatte: { layer: "native-matte", mode: "alpha" },
        transform: { anchor: [0, 0, 0] },
      },
      { id: "native-matte", type: "video", asset: "clip" },
      {
        id: "occluder",
        type: "image",
        threeD: true,
        size: [16, 64],
        sources: [{ asset: "foreground" }],
        fit: "stretch",
        transform: {
          anchor: [0, 0, 0],
          position: {
            keys: [
              { frame: 0, value: [0, 0, 0] },
              { frame: 1, value: [64, 0, 0] },
            ],
          },
        },
      },
    ],
    metadata: {
      cinematicCoverage: {
        background: "background",
        paintedBounds: [0, 0, 64, 64],
        reveal: {
          subject: "subject",
          occluders: ["occluder"],
          region: [
            [0, 0],
            [64, 0],
            [64, 64],
            [0, 64],
          ],
          settleFrame: 1,
        },
      },
    },
  });
const opaque = (id: string) => {
  const width = id === "foreground" ? 16 : 64;
  const data = new Uint8ClampedArray(width * 64 * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  return { width, height: 64, data };
};

type AlphaSurface = { width: number; height: number; alpha: number };
function mediaBackend(transparentFrame?: number) {
  let ready: number | undefined;
  const prepared: number[] = [];
  const drawn: number[] = [];
  const endFrame = vi.fn();
  const backend: RenderBackend<AlphaSurface> = {
    version: "coverage-test",
    createSurface: (width, height) => ({ width, height, alpha: 0 }),
    releaseSurface: () => {},
    clear: (surface) => {
      surface.alpha = 0;
    },
    fillRect: () => {},
    drawImage: (surface, content) => {
      const ordinal = content.media?.pair?.first;
      if (ordinal !== undefined) {
        if (ordinal !== ready)
          throw Error("Native matte frame was not prepared");
        drawn.push(ordinal);
      }
      surface.alpha =
        ordinal !== undefined && ordinal === transparentFrame ? 0 : 255;
    },
    drawText: () => {},
    drawShape: () => {},
    drawProvider: () => {},
    composite: (source, target, _blend, opacity) => {
      target.alpha =
        source.alpha * opacity +
        target.alpha * (1 - (source.alpha * opacity) / 255);
    },
    applyEffects: () => {},
    applyMask: () => {},
    applyMatte: (target, matte) => {
      target.alpha *= matte.alpha / 255;
    },
    lerp: () => {},
    readPixels: (surface) => {
      const data = new Uint8ClampedArray(surface.width * surface.height * 4);
      for (let index = 3; index < data.length; index += 4)
        data[index] = surface.alpha;
      return data;
    },
    accumulateExposure: (_target, count, draw) => {
      for (let index = 0; index < count; index++) draw(index);
    },
    endFrame,
  };
  return {
    backend,
    prepared,
    drawn,
    endFrame,
    prepare: async (frame: number) => {
      await Promise.resolve();
      prepared.push(frame);
      ready = frame;
    },
  };
}

it("prepares each native matte frame before rendered reveal sampling and retains still gate parity", async () => {
  const comp = fixture();
  const pending = mediaBackend();
  expect(() =>
    validateRenderedCinematicCompositionCoverage(comp, opaque, pending.backend),
  ).toThrow("not prepared");
  const media = mediaBackend();
  const result = await validateRenderedCinematicCompositionCoverageAsync(
    comp,
    opaque,
    media.backend,
    media.prepare,
  );
  expect(media.prepared).toEqual([0, 1]);
  expect(media.drawn).toEqual([0, 1]);
  expect(result).toMatchObject({
    checkedFrames: 2,
    initialOcclusion: 0.25,
    clearFrame: 1,
  });
  const still = fixture();
  delete still.layers.find((layer) => layer.id === "subject")!.trackMatte;
  expect(
    validateRenderedCinematicCompositionCoverage(
      still,
      opaque,
      mediaBackend().backend,
    ),
  ).toEqual(result);
});

it("rejects transparency in a later prepared native matte frame and releases the validation backend", async () => {
  const media = mediaBackend(1);
  try {
    await validateRenderedCinematicCompositionCoverageAsync(
      fixture(),
      opaque,
      media.backend,
      media.prepare,
    );
    throw Error("Expected native alpha coverage rejection");
  } catch (error) {
    expect(passageDiagnostics(error)).toContainEqual(
      expect.objectContaining({
        code: "comp-camera-coverage",
        node: "subject",
        frame: 1,
        path: "metadata.cinematicCoverage",
      }),
    );
  }
  expect(media.prepared).toEqual([0, 1]);
  expect(media.endFrame).toHaveBeenCalledWith(false);
});

it("releases an interrupted async validation iterator when media preparation fails", async () => {
  const media = mediaBackend();
  await expect(
    validateRenderedCinematicCompositionCoverageAsync(
      fixture(),
      opaque,
      media.backend,
      async () => {
        throw Error("decode failed");
      },
    ),
  ).rejects.toThrow("decode failed");
  expect(media.drawn).toEqual([]);
  expect(media.endFrame).toHaveBeenCalledWith(false);
});

afterEach(() => vi.unstubAllGlobals());
it("keeps borrowed media alive when reusable prepared previews release temporary backends", async () => {
  const canvas = () => {
    const element = { width: 64, height: 64, getContext: () => context };
    const context = new Proxy(
      { canvas: element },
      {
        get: (object, key) => Reflect.get(object, key) ?? (() => {}),
      },
    );
    return element as unknown as HTMLCanvasElement;
  };
  vi.stubGlobal("document", { createElement: canvas });
  const comp = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "borrowed-media",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 2,
    assets: [],
    layers: [],
  });
  let disposed = false;
  const dispose = vi.fn(() => {
    disposed = true;
  });
  const prepareFrame = vi.fn(async () => {
    if (disposed) throw Error("Disposed media resources");
  });
  const prepared = prepareCompositionPreview(comp, {
    images: new Map(),
    fonts: new Map(),
    media: {
      prepareFrame,
      dispose,
      assertReady: () => {},
      stats: () => ({
        decodedBytes: 0,
        encodedBytes: 0,
        peakDecodedBytes: 0,
        peakEncodedBytes: 0,
        decodedFrames: 0,
        hits: 0,
        evictions: 0,
      }),
    },
  });
  expect(dispose).not.toHaveBeenCalled();
  for (const frame of [0, 1]) {
    const preview = prepared.create(canvas());
    await preview.prepareFrame(frame);
    preview.dispose();
  }
  expect(prepareFrame).toHaveBeenCalledTimes(2);
  expect(dispose).not.toHaveBeenCalled();
});
