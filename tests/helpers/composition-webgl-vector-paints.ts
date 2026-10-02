import {
  recordVectorPaints,
  replayVectorPaints,
} from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";

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

  const unsupported = recordVectorPaints(canvas().getContext("2d")!, bounds);
  unsupported.context.fillRect(0, 0, 20, 20);
  unsupported.context.globalCompositeOperation = "destination-out";
  unsupported.context.fillRect(0, 0, 10, 10);
  if (unsupported.groups())
    throw new Error(
      "Destination-dependent local paint must use raster fallback",
    );
  unsupported.dispose();
  return { groups: 4, mutableSources: 3, fallbacks: 1 };
}
