import type { Bounds } from "../evaluate/types.ts";
import { boundsOverlap, unionBounds } from "./webgl-vector-regions.ts";
import { CanvasPathBounds } from "./webgl-path-bounds.ts";

type Command =
  | { method: string; args: unknown[] }
  | { property: string; value: unknown };
type Paint = { command: number; bounds: Bounds; primitive: boolean };
export type VectorPaintGroup = {
  commands: Command[];
  selected: Set<number>;
  primitive: boolean;
  bounds: Bounds;
};
const paints = new Set([
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "fillText",
  "strokeText",
  "drawImage",
]);
const queries = new Set([
  "measureText",
  "getTransform",
  "getLineDash",
  "isPointInPath",
  "isPointInStroke",
  "getContextAttributes",
]);

/** Record local paint boundaries without changing the provider's original Canvas execution. */
export function recordVectorPaints(
  ctx: CanvasRenderingContext2D,
  fallback: Bounds,
  options: { stableImages?: boolean } = {},
) {
  const commands: Command[] = [],
    marks: Paint[] = [];
  let supported = true;
  const snapshots: HTMLCanvasElement[] = [];
  let snapshotBytes = 0;
  const path = new CanvasPathBounds();
  const context = new Proxy(ctx, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const name = String(property);
        path.record(target, name, args);
        if (
          [
            "getImageData",
            "putImageData",
            "clearRect",
            "reset",
            "createPattern",
            "createLinearGradient",
            "createRadialGradient",
            "createConicGradient",
          ].includes(name)
        )
          supported = false;
        let recorded = args;
        if (
          name === "drawImage" &&
          !(args[0] instanceof HTMLCanvasElement) &&
          !(args[0] instanceof HTMLImageElement) &&
          !(args[0] instanceof ImageBitmap)
        )
          supported = false;
        if (
          name === "drawImage" &&
          args[0] instanceof HTMLCanvasElement &&
          !options.stableImages &&
          supported
        ) {
          const image = args[0];
          const bytes = image.width * image.height * 4;
          if (
            snapshotBytes + bytes > 32 * 1024 * 1024 ||
            marks.length >= 64 ||
            image === target.canvas
          )
            supported = false;
          else {
            const snapshot = document.createElement("canvas");
            snapshot.width = image.width;
            snapshot.height = image.height;
            snapshot.getContext("2d")!.drawImage(image, 0, 0);
            snapshots.push(snapshot);
            snapshotBytes += bytes;
            recorded = [snapshot, ...args.slice(1)];
          }
        }
        if (commands.length >= 65536 || marks.length >= 64) supported = false;
        if (!queries.has(name) && supported) {
          if (paints.has(name)) {
            if (
              target.globalCompositeOperation !== "source-over" ||
              typeof target.fillStyle !== "string" ||
              typeof target.strokeStyle !== "string"
            )
              supported = false;
            marks.push({
              command: commands.length,
              primitive: name !== "drawImage" && target.filter === "none",
              bounds: paintBounds(target, name, args, fallback, path.bounds),
            });
          }
          commands.push({
            method: name,
            args: recorded.map((arg) =>
              arg instanceof Path2D
                ? new Path2D(arg)
                : arg instanceof DOMMatrixReadOnly
                  ? DOMMatrix.fromMatrix(arg)
                  : Array.isArray(arg)
                    ? [...arg]
                    : arg,
            ),
          });
        }
        return Reflect.apply(value, target, args);
      };
    },
    set(target, property, value) {
      if (commands.length >= 65536) supported = false;
      if (supported) commands.push({ property: String(property), value });
      return Reflect.set(target, property, value, target);
    },
  });
  return {
    context,
    dispose() {
      for (const canvas of snapshots) canvas.width = canvas.height = 0;
    },
    groups(): VectorPaintGroup[] | undefined {
      if (!supported || marks.length > 64) return undefined;
      const groups: { marks: Paint[]; bounds: Bounds }[] = [];
      for (const mark of marks) {
        const previous = groups.at(-1);
        if (
          previous &&
          previous.marks[0]!.primitive === mark.primitive &&
          previous.marks.every(
            (prior) => !boundsOverlap(prior.bounds, mark.bounds),
          )
        ) {
          previous.marks.push(mark);
          previous.bounds = unionBounds(previous.bounds, mark.bounds);
        } else groups.push({ marks: [mark], bounds: mark.bounds });
      }
      return groups.map((group) => ({
        commands,
        selected: new Set(group.marks.map((mark) => mark.command)),
        primitive: group.marks[0]!.primitive,
        bounds: group.bounds,
      }));
    },
  };
}

/** Reconstruct state and paths, painting only one consecutive non-overlapping group. */
export function replayVectorPaints(
  ctx: CanvasRenderingContext2D,
  group: VectorPaintGroup,
) {
  const target = ctx as unknown as Record<string, unknown>;
  let depth = 0;
  ctx.save();
  ctx.beginPath();
  try {
    const end = Math.max(...group.selected);
    for (let index = 0; index <= end; index++) {
      const command = group.commands[index]!;
      if ("property" in command) {
        target[command.property] = command.value;
        continue;
      }
      if (paints.has(command.method) && !group.selected.has(index)) continue;
      if (command.method === "save") depth++;
      if (command.method === "restore") {
        if (!depth) continue;
        depth--;
      }
      Reflect.apply(
        target[command.method] as (...args: unknown[]) => unknown,
        ctx,
        command.args,
      );
    }
  } finally {
    while (depth-- > 0) ctx.restore();
    ctx.restore();
    ctx.beginPath();
  }
}

function paintBounds(
  ctx: CanvasRenderingContext2D,
  method: string,
  args: unknown[],
  fallback: Bounds,
  path?: Bounds,
): Bounds {
  let box: Bounds | undefined;
  const deviceSpace =
    (method === "fill" || method === "stroke") && !(args[0] instanceof Path2D);
  const numbers = args as number[];
  if (deviceSpace) box = path;
  else if (method === "fillRect" || method === "strokeRect") {
    const [x, y, width, height] = numbers as [number, number, number, number];
    box = {
      left: Math.min(x, x + width),
      top: Math.min(y, y + height),
      right: Math.max(x, x + width),
      bottom: Math.max(y, y + height),
    };
  } else if (method === "drawImage") {
    const image = args[0] as {
      width: number;
      height: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    const x = numbers[args.length === 9 ? 5 : 1]!,
      y = numbers[args.length === 9 ? 6 : 2]!;
    const width =
      args.length === 3
        ? (image.naturalWidth ?? image.width)
        : numbers[args.length === 9 ? 7 : 3]!;
    const height =
      args.length === 3
        ? (image.naturalHeight ?? image.height)
        : numbers[args.length === 9 ? 8 : 4]!;
    box = {
      left: Math.min(x, x + width),
      top: Math.min(y, y + height),
      right: Math.max(x, x + width),
      bottom: Math.max(y, y + height),
    };
  } else if (
    (method === "fillText" || method === "strokeText") &&
    args.length === 3
  ) {
    const metrics = ctx.measureText(String(args[0])),
      x = numbers[1]!,
      y = numbers[2]!;
    box = {
      left: x - metrics.actualBoundingBoxLeft,
      top: y - metrics.actualBoundingBoxAscent,
      right: x + metrics.actualBoundingBoxRight,
      bottom: y + metrics.actualBoundingBoxDescent,
    };
  }
  if (!box) return fallback;
  const matrix = ctx.getTransform();
  const corners = [
    [box.left, box.top],
    [box.right, box.top],
    [box.right, box.bottom],
    [box.left, box.bottom],
  ].map(([x, y]) =>
    deviceSpace ? { x: x!, y: y! } : matrix.transformPoint({ x: x!, y: y! }),
  );
  const scale = Math.max(
    1,
    Math.hypot(matrix.a, matrix.b),
    Math.hypot(matrix.c, matrix.d),
  );
  let padding = 2;
  if (method.startsWith("stroke"))
    padding += Math.abs(ctx.lineWidth) * Math.max(1, ctx.miterLimit) * scale;
  if (ctx.filter !== "none") {
    const match = /^blur\(([\d.e+-]+)px\)$/.exec(ctx.filter);
    if (!match) return fallback;
    padding += Math.abs(Number(match[1])) * scale * 4 + 4;
  }
  padding +=
    Math.abs(ctx.shadowBlur) * 4 +
    Math.abs(ctx.shadowOffsetX) +
    Math.abs(ctx.shadowOffsetY);
  return {
    left: Math.max(
      fallback.left,
      Math.floor(Math.min(...corners.map((p) => p.x)) - padding),
    ),
    top: Math.max(
      fallback.top,
      Math.floor(Math.min(...corners.map((p) => p.y)) - padding),
    ),
    right: Math.min(
      fallback.right,
      Math.ceil(Math.max(...corners.map((p) => p.x)) + padding),
    ),
    bottom: Math.min(
      fallback.bottom,
      Math.ceil(Math.max(...corners.map((p) => p.y)) + padding),
    ),
  };
}
