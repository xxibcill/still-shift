import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  CompositionSchema,
  COMPOSITION_MEDIA_DECODER_VERSION,
  compositionMediaFrameId,
  defineCompositionEffect,
  registerCompositionEffectDefinition,
  type Composition,
  type CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import { compositionMediaFrameDependencies as collectDependencies } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import {
  createCompositionMediaResources,
  validateCompositionPreparedMedia,
} from "../../packages/renderer-core/src/composition/render/media-resources.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
// Compiled documents are immutable; each edited graph test uses a new identity.
const compositionMediaFrameDependencies = (comp: Composition, frame: number) =>
  collectDependencies(structuredClone(comp), frame);
const sourceHash = "sha256:" + "0".repeat(64);
const fixture = (): Composition =>
  CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "media",
    width: 16,
    height: 16,
    fps: 24,
    frameCount: 8,
    assets: [
      {
        id: "clip",
        type: "video",
        path: "clip.mkv",
        sha256: sourceHash,
        width: 16,
        height: 16,
        frameCount: 8,
        frameRate: { numerator: 24, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [{ id: "picture", type: "video", asset: "clip" }],
  });
const png = mediaRgbaPng(16, 16, Buffer.alloc(16 * 16 * 4, 255), [
  mediaPngChunk("sRGB", Buffer.from([0])),
]);
const manifest = (): CompositionPreparedMedia => ({
  schemaVersion: "composition-prepared-media-1",
  decoderVersion: COMPOSITION_MEDIA_DECODER_VERSION,
  ffmpegIdentities: [sourceHash],
  frames: Array.from({ length: 8 }, (_, ordinal) => ({
    id: compositionMediaFrameId("clip", ordinal),
    asset: "clip",
    sourceHash,
    ordinal,
    width: 16,
    height: 16,
    sha256: "sha256:" + createHash("sha256").update(png).digest("hex"),
    byteLength: png.length,
  })),
});
afterEach(() => vi.unstubAllGlobals());
it("collects original frame pairs, shutter samples and finite echo history from real render graphs", () => {
  const c = fixture();
  c.layers[0]!.effects = [
    {
      id: "echo",
      effect: "time.echo",
      params: { count: 3, spacing: 2, decay: 0.5 },
    },
  ];
  expect(
    [...compositionMediaFrameDependencies(c, 6).get("clip")!].sort(
      (a, b) => a - b,
    ),
  ).toEqual([0, 2, 4, 6]);
  c.layers[0]!.effects = [];
  const layer = c.layers[0] as Extract<
    (typeof c.layers)[number],
    { type: "video" }
  >;
  layer.frameBlending = "linear";
  layer.timeRemap = 0.5 / 24;
  expect([...compositionMediaFrameDependencies(c, 0).get("clip")!]).toEqual([
    0, 1,
  ]);
  layer.timeRemap = 0;
  expect([...compositionMediaFrameDependencies(c, 0).get("clip")!]).toEqual([
    0,
  ]);
  delete layer.timeRemap;
  layer.motionBlur = true;
  c.motionBlur = {
    enabled: true,
    samples: 3,
    shutterAngle: 360,
    shutterPhase: 0,
  };
  expect(
    [...compositionMediaFrameDependencies(c, 3).get("clip")!].sort(
      (a, b) => a - b,
    ),
  ).toEqual([2, 3, 4]);
});
it("includes disabled effect sources, mattes, nested scopes and isolated required coverage", () => {
  const release = registerCompositionEffectDefinition(
    "test.native-input",
    defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
  );
  try {
    const c = fixture();
    c.layers[0]!.enabled = false;
    c.layers.push({
      id: "graphic",
      type: "solid",
      size: [16, 16],
      color: "#ffffff",
      effects: [
        {
          id: "input",
          effect: "test.native-input",
          inputs: { map: "picture" },
        },
      ],
    });
    expect([...compositionMediaFrameDependencies(c, 2).get("clip")!]).toEqual([
      2,
    ]);
    c.layers[1]!.effects = [];
    c.layers[1]!.trackMatte = { layer: "picture", mode: "alpha" };
    expect([...compositionMediaFrameDependencies(c, 4).get("clip")!]).toEqual([
      4,
    ]);
    c.layers = [{ id: "host", type: "precomp", comp: "child", timeRemap: 5 }];
    c.precomps = [
      {
        id: "child",
        width: 16,
        height: 16,
        frameCount: 8,
        layers: [{ id: "native", type: "video", asset: "clip" }],
      },
    ];
    expect([...compositionMediaFrameDependencies(c, 0).get("clip")!]).toEqual([
      5,
    ]);
    c.layers = [
      {
        id: "native",
        type: "video",
        asset: "clip",
        coverage: "required",
        transform: { position: [-100, 0] },
      },
    ];
    delete c.precomps;
    expect([...compositionMediaFrameDependencies(c, 1).get("clip")!]).toEqual([
      1,
    ]);
  } finally {
    release();
  }
});
it("rejects frame identity/source/dimension mismatch and duplicate captured IDs", () => {
  expect(() =>
    validateCompositionPreparedMedia(fixture(), {
      ...manifest(),
      decoderVersion: "composition-media-decoder-1",
    } as unknown as CompositionPreparedMedia),
  ).toThrow(/manifest|contract/i);
  const c = fixture(),
    m = manifest();
  expect(validateCompositionPreparedMedia(c, m).size).toBe(8);
  const frame = m.frames[0]!;
  frame.sourceHash = "sha256:" + "1".repeat(64);
  expect(() => validateCompositionPreparedMedia(c, m)).toThrow(/identity/);
  frame.sourceHash = sourceHash;
  frame.width = 17;
  expect(() => validateCompositionPreparedMedia(c, m)).toThrow(/identity/);
  frame.width = 16;
  m.frames.push(frame);
  expect(() => validateCompositionPreparedMedia(c, m)).toThrow(/identity/);
});
function browserStub(response = () => new Response(png)) {
  const closed = vi.fn();
  const decode = vi.fn(async () => ({ width: 16, height: 16, close: closed }));
  const fetcher = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("createImageBitmap", decode);
  return { closed, decode, fetcher };
}
it("keeps the complete required set pinned, evicts only old frames and requires readiness before draw", async () => {
  const c = fixture();
  c.mediaLimits = { decodedFrameBytes: 1024 };
  const stub = browserStub(),
    images = new Map<string, CanvasImageSource>();
  const resources = createCompositionMediaResources(
    c,
    manifest(),
    (id) => id,
    images,
  );
  expect(() => resources.assertReady(0)).toThrow(/Prepare/);
  await resources.prepareFrame(0);
  resources.assertReady(0);
  await resources.prepareFrame(0);
  expect(stub.fetcher).toHaveBeenCalledTimes(1);
  await resources.prepareFrame(1);
  expect(images.has("__media:clip:0")).toBe(false);
  expect(images.has("__media:clip:1")).toBe(true);
  expect(stub.closed).toHaveBeenCalledTimes(1);
  expect(resources.stats()).toMatchObject({
    decodedBytes: 1024,
    peakDecodedBytes: 1024,
    hits: 1,
    evictions: 1,
    encodedBytes: 0,
  });
  resources.dispose();
  expect(stub.closed).toHaveBeenCalledTimes(2);
  expect(resources.stats().decodedBytes).toBe(0);
});
it("rejects an over-budget pair before fetching and rejects modified or oversized responses before decoding", async () => {
  const c = fixture();
  c.mediaLimits = { decodedFrameBytes: 1024 };
  const layer = c.layers[0] as Extract<
    (typeof c.layers)[number],
    { type: "video" }
  >;
  layer.frameBlending = "linear";
  layer.timeRemap = 0.5 / 24;
  const stub = browserStub();
  const resource = createCompositionMediaResources(
    c,
    manifest(),
    (id) => id,
    new Map(),
  );
  await expect(resource.prepareFrame(0)).rejects.toThrow(/complete|Complete/);
  expect(stub.fetcher).not.toHaveBeenCalled();
  resource.dispose();
  delete c.mediaLimits;
  layer.timeRemap = 0;
  const corrupt = Buffer.from(png);
  corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
  browserStub(() => new Response(corrupt));
  const changed = createCompositionMediaResources(
    c,
    manifest(),
    (id) => id,
    new Map(),
  );
  await expect(changed.prepareFrame(0)).rejects.toThrow(/bytes differ/);
  changed.dispose();
  const large = browserStub(
    () => new Response(Buffer.concat([png, Buffer.from([0])])),
  );
  const oversized = createCompositionMediaResources(
    c,
    manifest(),
    (id) => id,
    new Map(),
  );
  await expect(oversized.prepareFrame(0)).rejects.toThrow(/exceeds pinned/);
  expect(large.decode).not.toHaveBeenCalled();
  oversized.dispose();
});
it("superseded decode closes its bitmap and cannot publish stale readiness", async () => {
  const c = fixture();
  let accept!: () => void;
  const closed = vi.fn();
  const stub = browserStub();
  stub.decode.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        accept = () => resolve({ width: 16, height: 16, close: closed });
      }),
  );
  const images = new Map<string, CanvasImageSource>(),
    resource = createCompositionMediaResources(
      c,
      manifest(),
      (id) => id,
      images,
    );
  const old = resource.prepareFrame(0);
  const observed = old.catch((error) => error);
  await vi.waitFor(() => expect(stub.decode).toHaveBeenCalledTimes(1));
  const current = resource.prepareFrame(1);
  accept();
  expect((await observed).name).toBe("AbortError");
  await current;
  expect(closed).toHaveBeenCalledTimes(1);
  expect(images.has("__media:clip:0")).toBe(false);
  resource.assertReady(1);
  resource.dispose();
});
it("disposal cancels a pending stream and never publishes decoded data", async () => {
  const stub = browserStub(
    () => new Response(new ReadableStream({ start() {} })),
  );
  const resource = createCompositionMediaResources(
    fixture(),
    manifest(),
    (id) => id,
    new Map(),
  );
  const pending = resource.prepareFrame(0);
  const observed = pending.catch((error) => error);
  await vi.waitFor(() =>
    expect(resource.stats().encodedBytes).toBeGreaterThan(0),
  );
  resource.dispose();
  expect((await observed).name).toBe("AbortError");
  expect(stub.decode).not.toHaveBeenCalled();
  expect(resource.stats()).toMatchObject({ decodedBytes: 0, encodedBytes: 0 });
});
