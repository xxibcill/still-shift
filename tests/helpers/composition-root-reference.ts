import {
  createCompositionPreview,
  createCanvas2dBackend,
  createWebgl2Backend,
} from "../../packages/renderer-core/src/index.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";
import { preparedProvider } from "../../packages/renderer-core/src/composition/render/providers.ts";

export async function checkSharedCompositionRoots(options: {
  backend: "canvas2d" | "webgl2";
  alpha: boolean;
  software: boolean;
  variant: "static" | "coverage" | "late";
  worker: number;
  credential: string;
  scopeKey: string;
  baseUrl: string;
}) {
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "native-root",
    width: 32,
    height: 24,
    fps: 60,
    frameCount: 8,
    background: "#22446680",
    assets: [],
    layers: [
      {
        id: "foreground",
        type: "solid",
        size: [17, 13],
        color: "#cc663380",
        transform: { anchor: [0, 0], position: [3.25, 4.45], rotation: 17.2 },
      },
      {
        id: "paint",
        type: "provider",
        provider: "native-root@1.0.0",
        params: {},
        transform: { anchor: [0, 0] },
        ...(options.variant === "coverage" ? { coverage: "required" } : {}),
        ...(options.variant === "late" ? { inPoint: 4 } : {}),
      },
    ],
  };
  if (options.software)
    composition.layers.push({
      id: "software",
      type: "shape",
      contents: [
        { id: "rect", type: "rect", position: [31, 23], size: [1, 1] },
        { id: "fill", type: "fill", color: "#11335580" },
      ],
    });
  let draws = 0;
  const providers = [
    {
      id: "native-root@1.0.0",
      prepare() {
        return preparedProvider(
          (ctx: CanvasRenderingContext2D) => {
            draws++;
            const gradient = ctx.createLinearGradient(0, 0, 32, 24);
            gradient.addColorStop(
              0,
              options.variant === "coverage" ? "#14bb76" : "#14bb7680",
            );
            gradient.addColorStop(
              1,
              options.variant === "coverage" ? "#4488bb" : "#4488bb60",
            );
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 32, 24);
          },
          {
            visualKey: () => "immutable-native-gradient",
            boundedCanvas: true,
            bounds: { left: 0, top: 0, right: 32, bottom: 24 },
          },
        );
      },
    },
  ];
  const resources = () => ({ images: new Map(), fonts: new Map() });
  const reference = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    { backend: options.backend, preserveAlpha: options.alpha, providers },
  );
  const expected = new Map<number, Uint8ClampedArray>();
  try {
    for (let frame = 0; frame < 8; frame++) {
      reference.renderFrame(frame);
      expected.set(frame, reference.readPixels().slice());
    }
  } finally {
    reference.dispose();
  }
  draws = 0;
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    {
      backend: options.backend,
      preserveAlpha: options.alpha,
      providers,
      surfaceCache: {
        scopeKey: options.scopeKey,
        byteLimit: 16 * 1024 * 1024,
        exchange: compositionSurfaceExchange(options),
      },
    },
  );
  const frames = [0, 1, 2, 3, 4, 5, 6, 7, 7, 4, 1, 6, 0];
  try {
    for (const frame of frames) {
      await preview.prepareFrame(frame);
      preview.renderFrame(frame);
      const actual = preview.readPixels(),
        baseline = expected.get(frame)!;
      if (actual.length !== baseline.length)
        throw Error("Original root storage length changed");
      for (let byte = 0; byte < actual.length; byte++)
        if (actual[byte] !== baseline[byte])
          throw Error(
            `${options.backend}/${options.alpha}/${options.software}/${options.variant}/${frame}: byte ${byte}, ${actual[byte]} instead of ${baseline[byte]}`,
          );
    }
    return {
      worker: options.worker,
      frameChecks: frames.length,
      nativeProviderPaints: draws,
      statistics: preview.rootCacheStatistics!(),
      independent: preview.surfaceCacheStatistics!(),
    };
  } finally {
    preview.dispose();
  }
}

function equalRootBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
) {
  if (actual.length !== expected.length)
    throw Error(`${label}: storage size differs`);
  for (let byte = 0; byte < actual.length; byte++)
    if (actual[byte] !== expected[byte])
      throw Error(
        `${label}: byte ${byte} changed from ${expected[byte]} to ${actual[byte]}`,
      );
}

export function checkNativeRootStorage() {
  const reports = [];
  for (const kind of ["canvas2d", "webgl2"] as const)
    for (const alpha of [false, true])
      for (const software of kind === "canvas2d" ? [false, true] : [false]) {
        const create = (): {
          backend: RenderBackend<Surface> & { dispose(): void };
          target: Surface;
        } => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const options = {
            images: { images: new Map(), sizes: new Map() },
            drawText: () => {},
            softwareRaster: software,
          };
          if (kind === "canvas2d") {
            const backend = createCanvas2dBackend(options);
            return {
              backend,
              target: backend.wrap(
                canvas,
                canvas.getContext("2d", {
                  alpha,
                  willReadFrequently: software,
                })!,
              ),
            };
          }
          const backend = createWebgl2Backend(canvas, {
            ...options,
            preserveAlpha: alpha,
          });
          return { backend, target: backend.target };
        };
        const producer = create(),
          consumer = create();
        const bytes = new Uint8Array(256 * 256 * 4);
        for (let a = 0; a < 256; a++)
          for (let channel = 0; channel < 256; channel++) {
            const i = (a * 256 + channel) * 4;
            bytes[i] =
              kind === "webgl2" && alpha ? Math.min(channel, a) : channel;
            bytes[i + 1] =
              kind === "webgl2" && alpha
                ? Math.min(255 - channel, a)
                : 255 - channel;
            bytes[i + 2] =
              kind === "webgl2" && alpha
                ? Math.min(channel ^ a, a)
                : channel ^ a;
            bytes[i + 3] = a;
          }
        try {
          producer.backend.rootPixels!.restore(producer.target, {
            encoding:
              kind === "canvas2d" ? "rgba8-straight" : "rgba8-premultiplied",
            bytes,
          });
          const original = producer.backend.rootPixels!.capture(
            producer.target,
          );
          consumer.backend.rootPixels!.restore(consumer.target, original);
          equalRootBytes(
            consumer.backend.rootPixels!.capture(consumer.target).bytes,
            original.bytes,
            `${kind}/${alpha}/${software}`,
          );
          equalRootBytes(
            consumer.backend.rootPixels!.capture(consumer.target).bytes,
            original.bytes,
            `${kind}/repeat`,
          );
          if (kind === "webgl2") {
            const expected = bytes.slice();
            if (!alpha)
              for (let i = 3; i < expected.length; i += 4) expected[i] = 255;
            equalRootBytes(
              original.bytes,
              expected,
              `${kind}/native premultiplied storage`,
            );
          }
          reports.push({
            kind,
            alpha,
            software,
            pixels: 65536,
            bytes: original.bytes.byteLength,
          });
        } finally {
          producer.backend.dispose();
          consumer.backend.dispose();
        }
      }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const backend = createWebgl2Backend(canvas, {
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  });
  const values = Float32Array.from(
    { length: 16 * 16 * 4 },
    (_, i) => Math.sin(i) * 3.5,
  );
  const surface = backend.restoreSurface!(16, 16, {
    encoding: "rgba32f-premultiplied",
    bytes: new Uint8Array(values.buffer),
  });
  try {
    backend.rootPixels!.restore(surface, {
      encoding: "rgba32f-premultiplied",
      bytes: new Uint8Array(values.buffer),
    });
    equalRootBytes(
      backend.rootPixels!.capture(surface).bytes,
      new Uint8Array(values.buffer),
      "Native root float32 storage",
    );
    reports.push({
      kind: "webgl2-float",
      alpha: true,
      software: false,
      pixels: 256,
      bytes: values.byteLength,
    });
  } finally {
    backend.releaseSurface(surface);
    backend.dispose();
  }
  return reports;
}

export async function checkRootPreparationFailures() {
  const { CompositionRootCache } = await import(
    "../../packages/renderer-core/src/composition/render/root-cache.ts"
  );
  const { sha256Hex } = await import(
    "../../packages/renderer-core/src/browser-checksum.ts"
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
    "capture-encoding",
    "capture-length",
    "paint-error",
  ] as const) {
    const controller = new AbortController();
    const reason =
      failure === "null-abort" ? null : Error(`Original root ${failure}`);
    const pixels = new Uint8Array(16),
      checksum = "sha256:" + (await sha256Hex(pixels.buffer));
    const backend = createCanvas2dBackend({
      images: { images: new Map(), sizes: new Map() },
      drawText: () => {},
    });
    const target = backend.createSurface(2, 2);
    let claims = 0,
      paints = 0,
      restores = 0,
      publishes = 0;
    const originalPaint = backend.fillRect.bind(backend);
    backend.fillRect = (...args) => {
      paints++;
      if (failure === "paint-error") throw reason;
      return originalPaint(...args);
    };
    const originalRestore = backend.rootPixels!.restore.bind(
      backend.rootPixels,
    );
    backend.rootPixels!.restore = (...args) => {
      restores++;
      return originalRestore(...args);
    };
    const originalCapture = backend.rootPixels!.capture.bind(
      backend.rootPixels,
    );
    backend.rootPixels!.capture = (target) => {
      const result = originalCapture(target);
      return failure === "capture-encoding"
        ? { ...result, encoding: "rgba8-premultiplied" }
        : failure === "capture-length"
          ? { ...result, bytes: new Uint8Array(15) }
          : result;
    };
    const cache = new CompositionRootCache(backend, {
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
            token: "root-test",
            byteLength: failure === "lease" ? 15 : 16,
          };
        },
        async publish() {
          publishes++;
          if (failure === "abort-publish") controller.abort(reason);
        },
      },
    });
    const graph = {
      root: {
        id: "failure",
        width: 2,
        height: 2,
        background: null,
        ops: [
          {
            kind: "draw" as const,
            layer: "paint",
            content: {
              type: "solid" as const,
              width: 2,
              height: 2,
              color: [1, 0, 0, 0.5] as [number, number, number, number],
            },
            matrix: [1, 0, 0, 1, 0, 0] as [
              number,
              number,
              number,
              number,
              number,
              number,
            ],
            transforms: [],
            opacity: 1,
            blend: "normal" as const,
            clips: [],
          },
        ],
      },
      culled: [],
    };
    const originalDigest = crypto.subtle.digest;
    let digests = 0;
    crypto.subtle.digest = function (
      this: SubtleCrypto,
      ...args: Parameters<typeof originalDigest>
    ) {
      const result = originalDigest.apply(this, args);
      if (
        ++digests === 3 &&
        (failure === "abort-hit-hash" || failure === "abort-publish-hash")
      )
        controller.abort(reason);
      return result;
    };
    let rejected = false;
    const originalReason =
      failure.startsWith("abort-") ||
      failure === "null-abort" ||
      failure === "claim-error" ||
      failure === "paint-error";
    try {
      await cache.prepare(graph, target);
    } catch (error) {
      if (originalReason) {
        if (error !== reason)
          throw Error(`Root ${failure} lost its original reason`);
      } else if (
        !/checksum|dimensions|storage size|bound|identity/.test(String(error))
      )
        throw error;
      rejected = true;
    } finally {
      crypto.subtle.digest = originalDigest;
      cache.dispose();
      backend.releaseSurface(target);
      backend.dispose();
    }
    const producer = [
      "abort-publish",
      "abort-publish-hash",
      "capture-encoding",
      "capture-length",
      "paint-error",
    ].includes(failure);
    if (
      !rejected ||
      restores !== 0 ||
      paints !== (producer ? 1 : 0) ||
      publishes !== (failure === "abort-publish" ? 1 : 0) ||
      claims !== (failure === "budget" ? 0 : 1) ||
      cache.statistics.retainedBytes !== 0 ||
      backend.renderRoot !== undefined
    )
      throw Error(`Root ${failure} violated preparation admission or disposal`);
    reports.push({
      failure,
      claims,
      paints,
      restores,
      publishes,
      originalReason,
      retainedBytes: cache.statistics.retainedBytes,
    });
  }
  return reports;
}
