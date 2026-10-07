import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import {
  createCanvas2dBackend,
  createWebgl2Backend,
} from "../../packages/renderer-core/src/index.ts";
import {
  preparedProvider,
  type CanvasContentProvider,
} from "../../packages/renderer-core/src/composition/render/providers.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";

function equalBytes(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  label: string,
) {
  if (actual.length !== expected.length)
    throw Error(`${label}: byte count differs`);
  for (let index = 0; index < actual.length; index++)
    if (actual[index] !== expected[index])
      throw Error(
        `${label}: byte ${index}, ${actual[index]} instead of ${expected[index]}`,
      );
}

function fixture(variant: string): Composition {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "surface-" + variant,
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
        effects: [
          { id: "blur", effect: "blur.gaussian", params: { radius: 2 } },
        ],
      },
      {
        id: "direct",
        type: "solid",
        size: [5, 7],
        color: "#18e57980",
        transform: { anchor: [0, 0], position: [14.37, 6.28], rotation: 17.2 },
      },
    ],
  };
  const still = comp.layers[1]!;
  if (variant === "dynamic")
    still.transform = {
      anchor: [0, 0],
      position: {
        keys: [
          { frame: 0, value: [3.25, 4.45], easing: "linear" },
          { frame: 7, value: [11.75, 6.85] },
        ],
      },
    };
  if (variant === "late") still.inPoint = 4;
  if (variant === "coverage") {
    if (still.type !== "solid") throw Error("Fixture source type");
    still.size = [32, 24];
    still.color = "#cc6633";
    still.transform = { anchor: [0, 0] };
    still.effects = [
      { id: "blur", effect: "blur.gaussian", params: { radius: 0 } },
    ];
    still.coverage = "required";
  }
  if (variant === "matte" || variant === "effect-input") {
    comp.layers.unshift({
      id: "map",
      type: "solid",
      size: [28, 20],
      color: "#aabbddbb",
      transform: { anchor: [0, 0], position: [2, 2] },
      effects: [
        { id: "map-blur", effect: "blur.gaussian", params: { radius: 1 } },
      ],
    });
    if (variant === "matte") still.trackMatte = { layer: "map", mode: "alpha" };
    else
      still.effects!.push({
        id: "displace",
        effect: "distort.displacement-map",
        params: { amount: [2, -1], channelX: 0, channelY: 1, midpoint: 0.5 },
        inputs: { map: "map" },
      });
  }
  if (variant === "history")
    comp.layers.unshift({
      id: "echo",
      type: "adjustment",
      effects: [
        {
          id: "trail",
          effect: "time.echo",
          params: { count: 3, spacing: 1, decay: 0.6 },
        },
        { id: "soft", effect: "blur.gaussian", params: { radius: 1 } },
      ],
    });
  if (variant === "exposure") {
    comp.motionBlur = {
      enabled: true,
      shutterAngle: 180,
      shutterPhase: 0,
      samples: 4,
    };
    comp.layers[0]!.motionBlur = true;
  }
  if (variant === "linear") comp.colorSpace = "linear-srgb";
  if (variant === "nested") {
    comp.precomps = [
      {
        id: "inside",
        width: 32,
        height: 24,
        fps: 60,
        frameCount: 8,
        background: null,
        layers: [still],
      },
    ];
    comp.layers[1] = {
      id: "host",
      type: "precomp",
      comp: "inside",
      transform: { anchor: [0, 0], position: [0.5, 0.25] },
    };
  }
  if (variant === "provider")
    comp.layers[1] = {
      id: "static",
      type: "provider",
      provider: "surface-fixture@1.0.0",
      params: {},
      bounds: [0, 0, 17, 13],
      transform: { anchor: [0, 0], position: [3.25, 4.45] },
      effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 2 } }],
    };
  if (variant === "shape")
    comp.layers[1] = {
      id: "static",
      type: "shape",
      transform: { anchor: [0, 0], position: [3.25, 4.45] },
      contents: [
        {
          id: "ellipse",
          type: "ellipse",
          position: [8.5, 6.5],
          size: [17, 13],
        },
        { id: "fill", type: "fill", color: "#cc6633b7" },
      ],
      effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 2 } }],
    };
  return comp;
}

export async function checkSharedCompositionSurfaces(options: {
  variant: string;
  backend: "canvas2d" | "webgl2";
  worker: number;
  credential: string;
  scopeKey: string;
  baseUrl: string;
}) {
  const composition = fixture(options.variant);
  const resources = () => ({ images: new Map(), fonts: new Map() });
  let providerDrawCalls = 0,
    providerPreparations = 0;
  const providers: CanvasContentProvider[] = [
    {
      id: "surface-fixture@1.0.0",
      prepare() {
        providerPreparations++;
        return preparedProvider(
          (ctx) => {
            providerDrawCalls++;
            const gradient = ctx.createLinearGradient(0, 0, 17, 13);
            gradient.addColorStop(0, "#cc6633b7");
            gradient.addColorStop(1, "#8899cc60");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 17, 13);
          },
          { visualKey: () => "static-source", boundedCanvas: true },
        );
      },
    },
  ];
  const reference = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    { backend: options.backend, preserveAlpha: true, providers },
  );
  const expected = new Map<number, Uint8ClampedArray>();
  try {
    for (let frame = 0; frame < composition.frameCount; frame++) {
      reference.renderFrame(frame);
      expected.set(frame, reference.readPixels().slice());
    }
  } finally {
    reference.dispose();
  }
  providerDrawCalls = 0;
  providerPreparations = 0;
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    {
      backend: options.backend,
      preserveAlpha: true,
      providers,
      surfaceCache: {
        scopeKey: options.scopeKey,
        byteLimit: 16 * 1024 * 1024,
        exchange: compositionSurfaceExchange(options),
      },
    },
  );
  try {
    let unpreparedRejected = false;
    try {
      preview.renderFrame(0);
    } catch (error) {
      unpreparedRejected = String(error).includes("Prepare the absolute");
    }
    if (!unpreparedRejected)
      throw Error("Retained frame must require asynchronous preparation");
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 7, 4, 1, 6, 0];
    const lateBefore = [];
    for (const frame of frames) {
      await preview.prepareFrame(frame);
      preview.renderFrame(frame);
      equalBytes(
        preview.readPixels(),
        expected.get(frame)!,
        `${options.backend}/${options.variant}/${frame}`,
      );
      if (options.variant === "late" && frame < 4 && lateBefore.length < 4)
        lateBefore.push(
          preview.surfaceCacheStatistics!().independentSurfacePaints,
        );
    }
    return {
      worker: options.worker,
      frameChecks: frames.length,
      lateBefore,
      providerDrawCalls,
      providerPreparations,
      statistics: preview.surfaceCacheStatistics!(),
    };
  } finally {
    preview.dispose();
  }
}

export function checkFloatSurfaceTransfer() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const device = new WebglDevice(canvas);
  const surface = device.surface(16, 16, true),
    other = device.surface(2, 2, true);
  const values = new Float32Array(16 * 16 * 4);
  for (let index = 0; index < values.length; index++)
    values[index] = Math.fround(Math.sin(index) * 3.5);
  try {
    device.uploadFloats(surface, values);
    device.gl.bindFramebuffer(device.gl.READ_FRAMEBUFFER, other.framebuffer);
    const actual = device.readFloats(surface);
    if (
      device.gl.getParameter(device.gl.READ_FRAMEBUFFER_BINDING) !==
      other.framebuffer
    )
      throw Error("Float readback changed the caller's framebuffer binding");
    equalBytes(
      new Uint8Array(actual.buffer),
      new Uint8Array(values.buffer),
      "Native RGBA32F transfer",
    );
    return { pixels: 256, bytes: values.byteLength };
  } finally {
    device.dispose();
  }
}

export function checkNativeSurfaceStorage() {
  const reports = [];
  for (const kind of ["canvas2d", "webgl2"] as const) {
    const create = (): RenderBackend<Surface> & { dispose(): void } =>
      kind === "canvas2d"
        ? createCanvas2dBackend({
            images: { images: new Map(), sizes: new Map() },
            drawText: () => {},
          })
        : createWebgl2Backend(document.createElement("canvas"), {
            images: { images: new Map(), sizes: new Map() },
            drawText: () => {},
          });
    const first = create(),
      second = create();
    const bytes = new Uint8Array(256 * 256 * 4);
    for (let alpha = 0; alpha < 256; alpha++)
      for (let channel = 0; channel < 256; channel++) {
        const offset = (alpha * 256 + channel) * 4;
        bytes[offset] =
          kind === "canvas2d" ? channel : Math.min(channel, alpha);
        bytes[offset + 1] =
          kind === "canvas2d" ? 255 - channel : Math.min(255 - channel, alpha);
        bytes[offset + 2] =
          kind === "canvas2d"
            ? channel ^ alpha
            : Math.min(channel ^ alpha, alpha);
        bytes[offset + 3] = alpha;
      }
    try {
      const surface = first.restoreSurface!(256, 256, {
        encoding: first.surfaceEncoding!,
        bytes,
      });
      const original = first.captureSurface!(surface);
      if (kind === "webgl2")
        equalBytes(original.bytes, bytes, "Native premultiplied RGBA8 source");
      const restored = second.restoreSurface!(256, 256, original);
      equalBytes(
        second.captureSurface!(restored).bytes,
        original.bytes,
        `${kind} independent backend transfer`,
      );
      first.releaseSurface(surface);
      second.releaseSurface(restored);
      reports.push({ kind, pixels: 65536, bytes: bytes.byteLength });
      if (kind === "webgl2") {
        const values = new Float32Array(16 * 16 * 4);
        for (let index = 0; index < values.length; index++)
          values[index] = Math.fround(Math.sin(index) * 3.5);
        const surface = first.restoreSurface!(16, 16, {
          encoding: "rgba32f-premultiplied",
          bytes: new Uint8Array(values.buffer),
        });
        const captured = first.captureSurface!(surface);
        equalBytes(
          captured.bytes,
          new Uint8Array(values.buffer),
          "Native floating producer",
        );
        const restored = second.restoreSurface!(16, 16, captured);
        equalBytes(
          second.captureSurface!(restored).bytes,
          captured.bytes,
          "Native floating consumer",
        );
        first.releaseSurface(surface);
        second.releaseSurface(restored);
      }
    } finally {
      first.dispose();
      second.dispose();
    }
  }
  return reports;
}

export async function checkSurfacePreparationFailures() {
  let cases = 0;
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const composition = fixture("isolate"),
      reason = Error("Original cache cancellation");
    const bytes = new Uint8Array(32 * 24 * 4);
    const checksum = "sha256:" + (await sha256Hex(bytes.buffer));
    for (const mode of [
      "checksum",
      "length",
      "lease",
      "budget",
      "abort-claim",
      "abort-publish",
    ]) {
      const controller = new AbortController();
      let claims = 0;
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        composition,
        { images: new Map(), fonts: new Map() },
        {
          backend,
          preserveAlpha: true,
          surfaceCache: {
            scopeKey: "sha256:" + "f".repeat(64),
            byteLimit: mode === "budget" ? 1 : 1048576,
            signal: controller.signal,
            exchange: {
              async claim() {
                claims++;
                if (mode === "abort-claim") controller.abort(reason);
                if (mode === "checksum") {
                  const wrong = bytes.slice();
                  wrong[0] = 1;
                  return { kind: "hit", bytes: wrong, checksum };
                }
                if (mode === "length")
                  return { kind: "hit", bytes: new Uint8Array(4), checksum };
                return {
                  kind: "lease",
                  token: "fixture",
                  byteLength: mode === "lease" ? 4 : bytes.length,
                };
              },
              async publish() {
                if (mode === "abort-publish") controller.abort(reason);
              },
            },
          },
        },
      );
      try {
        let failure: unknown;
        try {
          await preview.prepareFrame(0);
        } catch (error) {
          failure = error;
        }
        if (!failure)
          throw Error(`${backend}/${mode}: invalid preparation succeeded`);
        if (mode.startsWith("abort") && failure !== reason)
          throw Error("Cache cancellation lost its original reason");
        if (mode === "budget" && claims !== 0)
          throw Error(
            "Worker memory rejection happened after requesting cache bytes",
          );
        cases++;
      } finally {
        preview.dispose();
      }
    }
  }
  return { cases };
}
