import {
  recordVectorPaints,
  replayVectorPaints,
} from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";
import { createCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { preparedProvider } from "../../packages/renderer-core/src/composition/render/providers.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";

/** Single-image preparation must preserve the paint even if its source later changes. */
export function checkSingleImageProvider(stable = false) {
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "single-image-provider",
    width: 192,
    height: 64,
    fps: 30,
    frameCount: 4,
    background: "#f2ede3",
    assets: [],
    layers: Array.from({ length: stable ? 1 : 3 }, (_, index) => ({
      id: `image-${index}`,
      type: "provider" as const,
      provider: "test.image@1.0.0",
      transform: { position: [index * 46, 0] as [number, number] },
      params: {},
    })),
  };
  const make = (backend: "canvas2d" | "webgl2") =>
    createCompositionPreview(
      document.createElement("canvas"),
      composition,
      { images: new Map(), fonts: new Map() },
      {
        backend,
        providers: [
          {
            id: "test.image@1.0.0",
            prepare: () => {
              const source = document.createElement("canvas");
              source.width = 32;
              source.height = 24;
              const paint = source.getContext("2d")!;
              return preparedProvider(
                (ctx, time) => {
                  if (time === 3) return;
                  if (time === 2) ctx.globalAlpha = 0;
                  paint.clearRect(0, 0, 32, 24);
                  paint.fillStyle = time === 1 ? "#477d659a" : "#b739636d";
                  paint.fillRect(1.25, 2.5, 24, 18);
                  if (stable) {
                    ctx.fillStyle = "#83765c";
                    ctx.fillRect(8, 6, 40, 30);
                  }
                  ctx.drawImage(source, 10.25 + time, 8.5);
                  if (!stable) paint.clearRect(0, 0, 32, 24);
                },
                {
                  singleImage: !stable,
                  stableImages: stable,
                  bounds: { left: 8, top: 6, right: 48, bottom: 36 },
                },
              );
            },
          },
        ],
      },
    );
  const gpu = make("webgl2"),
    reference = make("canvas2d");
  let maxDelta = 0;
  try {
    for (const frame of [0, 1, 2, 3, 0]) {
      gpu.renderFrame(frame);
      reference.renderFrame(frame);
      const actual = gpu.readPixels(),
        expected = reference.readPixels();
      for (let index = 0; index < actual.length; index++)
        maxDelta = Math.max(
          maxDelta,
          Math.abs(actual[index]! - expected[index]!),
        );
    }
    if (maxDelta > 1)
      throw new Error(`Single image provider differs by ${maxDelta}`);
    return { frames: 5, maxDelta };
  } finally {
    gpu.dispose();
    reference.dispose();
  }
}

/** More than one sampler batch must preserve every intermediate rounded result. */
export function checkProviderPaintBatches() {
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "provider-paint-batches",
    width: 96,
    height: 64,
    fps: 30,
    frameCount: 4,
    background: "#f2ede3",
    assets: [],
    layers: Array.from({ length: 3 }, (_, index) => ({
      id: `marks-${index}`,
      type: "provider",
      provider: "test.paints@1.0.0",
      params: {},
    })),
  };
  const colors = ["#e5e0d43d", "#46654066", "#ba74392a"];
  const make = (backend: "canvas2d" | "webgl2") =>
    createCompositionPreview(
      document.createElement("canvas"),
      composition,
      { images: new Map(), fonts: new Map() },
      {
        backend,
        providers: [
          {
            id: "test.paints@1.0.0",
            prepare: () =>
              preparedProvider(
                (ctx, time) => {
                  if (time === 3) return;
                  ctx.save();
                  ctx.translate(time, 0);
                  ctx.beginPath();
                  ctx.rect(0, 0, 80, 60);
                  ctx.clip();
                  for (let index = 0; index < 35; index++) {
                    ctx.fillStyle = colors[index % colors.length]!;
                    ctx.fillRect(8 + (index % 4), 8 + (index % 3), 56, 36);
                  }
                  ctx.restore();
                },
                { bounds: { left: 0, top: 0, right: 96, bottom: 64 } },
              ),
          },
        ],
      },
    );
  const gpu = make("webgl2"),
    reference = make("canvas2d");
  let maxDelta = 0;
  try {
    for (const frame of [0, 1, 2, 3, 0]) {
      gpu.renderFrame(frame);
      reference.renderFrame(frame);
      const actual = gpu.readPixels(),
        expected = reference.readPixels();
      for (let index = 0; index < actual.length; index++)
        maxDelta = Math.max(
          maxDelta,
          Math.abs(actual[index]! - expected[index]!),
        );
    }
    if (maxDelta > 1)
      throw new Error(`Provider paint batches differ by ${maxDelta}`);
    return { providers: 3, paints: 105, frames: 5, maxDelta };
  } finally {
    gpu.dispose();
    reference.dispose();
  }
}

/** Exercise mutable sources, clipping and state independently of renderer caching. */
export function checkVectorPaintReplay() {
  const canvas = () => {
    const value = document.createElement("canvas");
    value.width = 96;
    value.height = 64;
    return value;
  };
  const original = canvas(),
    source = canvas(),
    restored = canvas();
  const ctx = original.getContext("2d")!,
    image = source.getContext("2d")!,
    output = restored.getContext("2d")!;
  const bounds = { left: 0, top: 0, right: 96, bottom: 64 };
  const recording = recordVectorPaints(ctx, bounds);
  const paint = recording.context;
  paint.save();
  paint.translate(3, 4);
  paint.beginPath();
  paint.rect(0, 0, 60, 40);
  paint.clip();
  paint.fillStyle = "#ab7929";
  paint.fillRect(0, 0, 70, 50);
  paint.save();
  const matrix = new DOMMatrix([1, 0, 0, 1, 10, 12]);
  paint.setTransform(matrix);
  matrix.e = 50;
  const path = new Path2D();
  path.rect(0, 0, 12, 12);
  paint.fillStyle = "#186487";
  paint.fill(path);
  path.rect(30, 0, 20, 20);
  paint.restore();
  image.fillStyle = "#729b4c";
  image.fillRect(0, 0, 96, 64);
  paint.drawImage(source, 25, 15, 20, 12);
  image.fillStyle = "#b92f31";
  image.fillRect(0, 0, 96, 64);
  paint.drawImage(source, 30, 20, 20, 12);
  paint.restore();
  try {
    const groups = recording.groups();
    if (!groups || groups.length !== 4)
      throw new Error(
        `Expected four overlapping paint groups: ${groups?.length}`,
      );
    for (const group of groups) {
      const part = canvas();
      const partCtx = part.getContext("2d")!;
      replayVectorPaints(partCtx, group);
      output.drawImage(part, 0, 0);
      if (!partCtx.getTransform().isIdentity)
        throw new Error("Paint replay leaked its transform");
    }
    const expected = ctx.getImageData(0, 0, 96, 64).data;
    const actual = output.getImageData(0, 0, 96, 64).data;
    if (actual.some((value, i) => value !== expected[i]))
      throw new Error("Paint replay changed clipping, paths or mutable images");
  } finally {
    recording.dispose();
  }

  const modes = recordVectorPaints(canvas().getContext("2d")!, bounds);
  modes.context.fillRect(0, 0, 4, 4);
  modes.context.filter = "blur(1px)";
  modes.context.fillRect(80, 40, 4, 4);
  const groups = modes.groups();
  if (groups?.length !== 2 || !groups[0]!.primitive || groups[1]!.primitive)
    throw new Error("Disjoint paints with different rounding were combined");
  modes.dispose();

  const empty = recordVectorPaints(canvas().getContext("2d")!, bounds);
  empty.context.save();
  empty.context.beginPath();
  empty.context.rect(0, 0, 20, 20);
  empty.context.clip();
  empty.context.restore();
  if (empty.groups()?.length !== 0)
    throw new Error("Unpainted paths and state must not require a texture");
  empty.dispose();

  const unsupported = recordVectorPaints(canvas().getContext("2d")!, bounds);
  unsupported.context.fillRect(0, 0, 20, 20);
  unsupported.context.globalCompositeOperation = "destination-out";
  unsupported.context.fillRect(0, 0, 10, 10);
  if (unsupported.groups())
    throw new Error(
      "Destination-dependent local paint must use raster fallback",
    );
  unsupported.dispose();

  const curves = recordVectorPaints(canvas().getContext("2d")!, bounds);
  const curve = curves.context;
  curve.beginPath();
  curve.moveTo(8, 8);
  curve.save();
  curve.translate(12, 15);
  curve.rotate(0.2);
  curve.bezierCurveTo(0, 20, 20, -10, 30, 10);
  curve.ellipse(15, 10, 12, 6, 0.4, 0, Math.PI * 2);
  curve.restore();
  curve.quadraticCurveTo(40, 40, 8, 8);
  curve.closePath();
  curve.fill();
  curve.stroke();
  const curvedGroups = curves.groups();
  if (curvedGroups?.length !== 2)
    throw new Error("Overlapping curved paints must retain separate bounds");
  for (const group of curvedGroups) {
    const context = canvas().getContext("2d")!;
    replayVectorPaints(context, group);
    const pixels = context.getImageData(0, 0, 96, 64).data;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 96; x++)
        if (
          pixels[(y * 96 + x) * 4 + 3] &&
          (x < group.bounds.left ||
            x >= group.bounds.right ||
            y < group.bounds.top ||
            y >= group.bounds.bottom)
        )
          throw new Error(`Paint bounds exclude curved coverage at ${x},${y}`);
  }
  curves.dispose();
  const single = recordVectorPaints(canvas().getContext("2d")!, bounds);
  single.context.fillRect(20, 25, 10, 15);
  const singleGroup = single.groups();
  if (
    singleGroup?.length !== 1 ||
    JSON.stringify(singleGroup[0]!.bounds) !==
      JSON.stringify({ left: 18, top: 23, right: 32, bottom: 42 })
  )
    throw new Error("Single paint must retain its own coverage bounds");
  single.dispose();
  return {
    groups: 4,
    mutableSources: 3,
    fallbacks: 1,
    curvedBounds: 2,
    singleBounds: 1,
    empty: 1,
  };
}
