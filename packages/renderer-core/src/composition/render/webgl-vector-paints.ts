import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import {
  createRenderCanvas,
  retainRenderCanvas,
  releaseRenderCanvas,
  renderMemory,
} from "../../managed-memory-context.ts";
import type { Bounds } from "../evaluate/types.ts";
import { boundsOverlap, unionBounds } from "./webgl-vector-regions.ts";
import { CanvasPathBounds } from "./webgl-path-bounds.ts";

type Command =
  | { method: string; args: unknown[] }
  | { property: string; value: unknown };
type Paint = {
  command: number;
  bounds: Bounds;
  primitive: boolean;
  shadowRight?: number;
};
export type VectorPaintGroup = {
  commands: Command[];
  selected: Set<number>;
  primitive: boolean;
  bounds: Bounds;
  shadow?: "only" | "none";
  shadowRight?: number;
};
// State containers: 512. Eleven closures: 1,408; shared scope: 256;
// Proxy/handler/returned controller: 64 + 64 + 128.
const recordingControlBytes = 2432;
type RecordingState = {
  commands: Command[];
  marks: Paint[];
  painted: Set<number>;
  snapshots: HTMLCanvasElement[];
  managedSnapshots: boolean;
  bytes: number;
};
function releaseSnapshot(canvas: HTMLCanvasElement, managed: boolean) {
  if (!managed) canvas.width = canvas.height = 0;
  releaseRenderCanvas(canvas);
}
function clearRecordingState(value: RecordingState) {
  for (const command of value.commands)
    if ("method" in command) {
      for (const arg of command.args) if (Array.isArray(arg)) arg.length = 0;
      command.args.length = 0;
    }
  value.commands.length = 0;
  value.marks.length = 0;
  value.painted.clear();
  for (const canvas of value.snapshots)
    releaseSnapshot(canvas, value.managedSnapshots);
  value.snapshots.length = 0;
}
function commandCapacity(name: string, args: unknown[]) {
  let bytes = 136 + 8 * args.length;
  for (const arg of args) {
    if (arg instanceof Path2D || arg instanceof DOMMatrixReadOnly) bytes += 192;
    else if (Array.isArray(arg)) bytes += 32 + 8 * arg.length;
  }
  return bytes + 2 * name.length;
}
type GroupLifetime = {
  working: { marks: Paint[]; bounds: Bounds }[] | undefined;
  output: VectorPaintGroup[] | undefined;
};
function clearWorkingGroups(value: GroupLifetime) {
  if (value.working) {
    for (const group of value.working) group.marks.length = 0;
    value.working.length = 0;
  }
  value.working = undefined;
}
function clearGroupLifetime(value: GroupLifetime) {
  clearWorkingGroups(value);
  if (value.output) {
    for (const group of value.output) group.selected.clear();
    value.output.length = 0;
  }
  value.output = undefined;
}
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

const states = new Set([
  "save",
  "restore",
  "resetTransform",
  "setTransform",
  "transform",
  "translate",
  "rotate",
  "scale",
  "clip",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "rect",
  "roundRect",
  "arc",
  "arcTo",
  "ellipse",
  "setLineDash",
]);

/** Record local paints; optionally retain the first group and defer later raster work.
 * Deferred targets start with empty pixels/path. Destination reads flush pending paints.
 */
export function recordVectorPaints(
  ctx: CanvasRenderingContext2D,
  fallback: Bounds,
  options: { stableImages?: boolean; deferPaints?: boolean } = {},
) {
  const state = allocateRenderMetadata<RecordingState>(
    recordingControlBytes,
    () => ({
      commands: [],
      marks: [],
      painted: new Set(),
      snapshots: [],
      managedSnapshots: renderMemory() !== undefined,
      bytes: recordingControlBytes,
    }),
    false,
    clearRecordingState,
  );
  const commands = state.commands,
    marks = state.marks,
    painted = state.painted,
    snapshots = state.snapshots;
  const grow = (bytes: number) => {
    resizeRenderMetadata(state, state.bytes + bytes);
    state.bytes += bytes;
  };
  const rollback = (bytes: number) => {
    resizeRenderMetadata(state, bytes);
    state.bytes = bytes;
  };
  try {
    let supported = true;
    let deferred = false;
    let marker = options.deferPaints === true,
      depth = 0;
    const path = new CanvasPathBounds();
    let bounds: Set<Bounds> | undefined;
    let groupResults: Set<GroupLifetime> | undefined;
    try {
      bounds = allocateRenderMetadata<Set<Bounds>>(
        256,
        () => new Set(),
        false,
        (value) => {
          for (const rect of value) releaseRenderMetadata(rect);
          value.clear();
        },
      );
      groupResults = allocateRenderMetadata<Set<GroupLifetime>>(
        128,
        () => new Set(),
        false,
        (value) => {
          for (const result of value) releaseRenderMetadata(result);
          value.clear();
        },
      );
    } catch (error) {
      if (bounds) releaseRenderMetadata(bounds);
      path.dispose();
      throw error;
    }
    const retainedBounds = bounds;
    const retainedGroups = groupResults;
    const keepBounds = (factory: () => Bounds) => {
      resizeRenderMetadata(
        retainedBounds,
        256 + 40 * (retainedBounds.size + 1),
      );
      try {
        const rect = allocateRenderMetadata(64, factory);
        retainedBounds.add(rect);
        return rect;
      } finally {
        resizeRenderMetadata(retainedBounds, 256 + 40 * retainedBounds.size);
      }
    };
    const clearBounds = () => {
      for (const rect of retainedBounds) releaseRenderMetadata(rect);
      retainedBounds.clear();
      releaseRenderMetadata(retainedBounds);
      for (const result of retainedGroups) releaseRenderMetadata(result);
      retainedGroups.clear();
      releaseRenderMetadata(retainedGroups);
    };
    if (marker) {
      let saved = false;
      try {
        ctx.save();
        saved = true;
        ctx.beginPath();
      } catch (error) {
        if (saved)
          try {
            ctx.restore();
          } catch {
            /* Preserve the original setup failure. */
          }
        clearBounds();
        path.dispose();
        throw error;
      }
    }
    try {
      const render = () => {
        if (!deferred) return;
        deferred = false;
        for (let i = 0; i < depth; i++) ctx.restore();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        const target = ctx as unknown as Record<string, unknown>;
        for (const [index, command] of commands.entries()) {
          if (painted.has(index)) continue;
          if ("property" in command) target[command.property] = command.value;
          else
            Reflect.apply(
              target[command.method] as (...args: unknown[]) => unknown,
              ctx,
              command.args,
            );
        }
      };
      const invalidate = () => {
        render();
        supported = false;
      };
      let snapshotBytes = 0;
      const context = new Proxy(ctx, {
        get(target, property) {
          if (property === "canvas" && options.deferPaints) invalidate();
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          const before = state.bytes;
          // Function 128 + captured bindings 64 + temporary method object 40 + margin 24.
          grow(256);
          try {
            return {
              ""() {
                // Rest parameters allocate before admission; borrow the VM call input instead.
                // eslint-disable-next-line prefer-rest-params
                const received = arguments;
                const length =
                  typeof property === "string"
                    ? property.length
                    : (property.description?.length ?? 0) + 8;
                const call = allocateRenderMetadata<{
                  args: unknown[] | undefined;
                }>(
                  128 + 8 * received.length + 2 * length,
                  () => ({ args: Array.from(received) as unknown[] }),
                  false,
                  (entry) => {
                    if (entry.args) entry.args.length = 0;
                    entry.args = undefined;
                  },
                );
                const args = call.args!;
                let swapped: { values: unknown[] | undefined } | undefined;
                try {
                  const name = String(property);
                  if (marker && name === "restore" && depth === 0) return;
                  if (
                    !paints.has(name) &&
                    !queries.has(name) &&
                    !states.has(name)
                  )
                    invalidate();
                  if (name === "drawImage" && args[0] === target.canvas)
                    invalidate();
                  path.record(target, name, args);
                  let recorded = args;
                  if (
                    name === "drawImage" &&
                    !(args[0] instanceof HTMLCanvasElement) &&
                    !(args[0] instanceof HTMLImageElement) &&
                    !(args[0] instanceof ImageBitmap)
                  )
                    invalidate();
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
                      invalidate();
                    else {
                      const before = state.bytes;
                      grow(8);
                      let snapshot: HTMLCanvasElement | undefined;
                      try {
                        snapshot = createRenderCanvas();
                        snapshot.width = image.width;
                        snapshot.height = image.height;
                        snapshot.getContext("2d")!.drawImage(image, 0, 0);
                        snapshots.push(snapshot);
                        retainRenderCanvas(snapshot);
                      } catch (error) {
                        if (snapshot && snapshots.at(-1) === snapshot)
                          snapshots.pop();
                        try {
                          if (snapshot)
                            releaseSnapshot(snapshot, state.managedSnapshots);
                          rollback(before);
                        } catch {
                          /* Preserve the original snapshot failure. */
                        }
                        throw error;
                      }
                      snapshotBytes += bytes;
                      const copied = snapshot;
                      swapped = allocateRenderMetadata<{
                        values: unknown[] | undefined;
                      }>(
                        96 + 16 * args.length,
                        () => ({ values: [copied, ...args.slice(1)] }),
                        false,
                        (value) => {
                          if (value.values) value.values.length = 0;
                          value.values = undefined;
                        },
                      );
                      recorded = swapped.values!;
                    }
                  }
                  if (commands.length >= 65536 || marks.length >= 64)
                    invalidate();
                  if (!queries.has(name) && supported) {
                    if (paints.has(name)) {
                      if (
                        target.globalCompositeOperation !== "source-over" ||
                        typeof target.fillStyle !== "string" ||
                        typeof target.strokeStyle !== "string"
                      )
                        invalidate();
                      const shadow =
                        target.filter === "none" &&
                        (target.shadowBlur !== 0 ||
                          target.shadowOffsetX !== 0 ||
                          target.shadowOffsetY !== 0);
                      const shadowRight = shadow
                        ? paintBounds(
                            target,
                            name,
                            args,
                            undefined,
                            path.bounds,
                            keepBounds,
                          )?.right
                        : undefined;
                      const before = state.bytes;
                      grow(104);
                      let mark: Paint;
                      try {
                        mark = {
                          command: commands.length,
                          primitive:
                            name !== "drawImage" && target.filter === "none",
                          bounds: paintBounds(
                            target,
                            name,
                            args,
                            fallback,
                            path.bounds,
                            keepBounds,
                          )!,
                          ...(shadowRight !== undefined &&
                          Number.isFinite(shadowRight)
                            ? { shadowRight }
                            : {}),
                        };
                        if (
                          options.deferPaints &&
                          supported &&
                          marks.length &&
                          (marks[0]!.primitive !== mark.primitive ||
                            marks.some((prior) =>
                              boundsOverlap(prior.bounds, mark.bounds),
                            ))
                        )
                          deferred = true;
                        marks.push(mark);
                      } catch (error) {
                        try {
                          rollback(before);
                        } catch {
                          /* Preserve the original mark failure. */
                        }
                        throw error;
                      }
                    }
                    const before = state.bytes;
                    grow(commandCapacity(name, recorded));
                    try {
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
                    } catch (error) {
                      try {
                        rollback(before);
                      } catch {
                        /* Preserve the original command failure. */
                      }
                      throw error;
                    }
                  }
                  if (deferred && paints.has(name)) return;
                  if (supported && paints.has(name)) {
                    const index = commands.length - 1;
                    if (!painted.has(index)) grow(40);
                    painted.add(index);
                  }
                  if (marker && name === "save") depth++;
                  if (marker && name === "restore") depth--;
                  const result = Reflect.apply(value, target, args);
                  if (name === "reset") {
                    depth = 0;
                    marker = false;
                  }
                  return result;
                } finally {
                  if (swapped) releaseRenderMetadata(swapped);
                  releaseRenderMetadata(call);
                }
              },
            }[""];
          } catch (error) {
            try {
              rollback(before);
            } catch {
              /* Preserve the original wrapper failure. */
            }
            throw error;
          }
        },
        set(target, property, value) {
          if (commands.length >= 65536) invalidate();
          if (supported) {
            const before = state.bytes;
            const length =
              typeof property === "string"
                ? property.length
                : (property.description?.length ?? 0) + 8;
            grow(104 + 2 * length);
            try {
              commands.push({ property: String(property), value });
            } catch (error) {
              try {
                rollback(before);
              } catch {
                /* Preserve the original property failure. */
              }
              throw error;
            }
          }
          return Reflect.set(target, property, value, target);
        },
      });
      return {
        context,
        render,
        firstGroupOnly: () => deferred,
        dispose() {
          try {
            if (marker) {
              for (let i = 0; i <= depth; i++) ctx.restore();
              marker = false;
            }
          } finally {
            try {
              clearBounds();
            } finally {
              try {
                path.dispose();
              } finally {
                clearRecordingState(state);
                releaseRenderMetadata(state);
              }
            }
          }
        },
        groups(): VectorPaintGroup[] | undefined {
          if (!supported || marks.length > 64) return undefined;
          resizeRenderMetadata(
            retainedGroups,
            128 + 40 * (retainedGroups.size + 1),
          );
          let lifetime: GroupLifetime | undefined,
            committed = false,
            failed = false;
          try {
            lifetime = allocateRenderMetadata<GroupLifetime>(
              512 + 1536 * marks.length,
              () => ({ working: undefined, output: undefined }),
              false,
              clearGroupLifetime,
            );
            const groups = (lifetime.working = [] as {
              marks: Paint[];
              bounds: Bounds;
            }[]);

            for (const mark of marks) {
              const previous = groups.at(-1);
              if (
                previous &&
                previous.marks[0]!.primitive === mark.primitive &&
                (previous.marks[0]!.shadowRight === undefined) ===
                  (mark.shadowRight === undefined) &&
                previous.marks.every(
                  (prior) => !boundsOverlap(prior.bounds, mark.bounds),
                )
              ) {
                previous.marks.push(mark);
                previous.bounds = unionBounds(previous.bounds, mark.bounds);
              } else groups.push({ marks: [mark], bounds: mark.bounds });
            }
            const clipped = commands.some(
              (command) => "method" in command && command.method === "clip",
            );
            const output = (lifetime.output = groups.flatMap(
              (group): VectorPaintGroup[] => {
                const base: VectorPaintGroup = {
                  commands,
                  selected: new Set(group.marks.map((mark) => mark.command)),
                  primitive: group.marks[0]!.primitive,
                  bounds: group.bounds,
                };
                if (
                  clipped ||
                  group.marks.some((mark) => mark.shadowRight === undefined)
                )
                  return [base];
                // Canvas composites shadow and source separately over the destination.
                const shadowRight = Math.max(
                  ...group.marks.map((mark) => mark.shadowRight!),
                );
                return [
                  { ...base, shadow: "only", shadowRight },
                  { ...base, shadow: "none" },
                ];
              },
            ));
            clearWorkingGroups(lifetime);
            let bytes = 256 + 136 * output.length;
            for (const group of output) {
              // Shadow pairs share the original selected Set and bounds, with one owner.
              if (group.shadow === "none") continue;
              bytes += 128 + 40 * group.selected.size;
              if (
                group.bounds !== fallback &&
                !retainedBounds.has(group.bounds)
              )
                bytes += 64;
            }
            resizeRenderMetadata(lifetime, bytes);
            retainedGroups.add(lifetime);
            committed = true;
            return output;
          } catch (error) {
            failed = true;
            throw error;
          } finally {
            if (lifetime && !committed) releaseRenderMetadata(lifetime);
            if (!failed)
              resizeRenderMetadata(
                retainedGroups,
                128 + 40 * retainedGroups.size,
              );
            else
              try {
                resizeRenderMetadata(
                  retainedGroups,
                  128 + 40 * retainedGroups.size,
                );
              } catch {
                /* Preserve the original grouping failure. */
              }
          }
        },
      };
    } catch (error) {
      // A late Proxy/controller factory failure must release prior native setup too.
      try {
        if (marker) {
          for (let i = 0; i <= depth; i++) ctx.restore();
          marker = false;
        }
      } catch {
        /* Preserve the original controller failure. */
      }
      try {
        clearBounds();
      } catch {
        /* Preserve the original controller failure. */
      }
      try {
        path.dispose();
      } catch {
        /* Preserve the original controller failure. */
      }
      throw error;
    }
  } catch (error) {
    try {
      clearRecordingState(state);
      releaseRenderMetadata(state);
    } catch {
      /* Preserve the original recording setup failure. */
    }
    throw error;
  }
}

/** Reconstruct state and paths, painting only one consecutive non-overlapping group. */
export function replayVectorPaints(
  ctx: CanvasRenderingContext2D,
  group: VectorPaintGroup,
) {
  const temporary = allocateRenderMetadata(
    256 + 8 * group.selected.size,
    () => ({}),
  );
  try {
    const target = ctx as unknown as Record<string, unknown>;
    let depth = 0;
    ctx.save();
    ctx.beginPath();
    // Move source coverage off-canvas while returning its native shadow in place.
    const shift =
      group.shadow === "only"
        ? ctx.canvas.width + Math.max(0, group.shadowRight!) + 256
        : 0;
    if (shift) {
      ctx.translate(-shift, 0);
      ctx.shadowOffsetX = shift;
    }
    if (group.shadow === "none") ctx.shadowColor = "rgba(0,0,0,0)";
    try {
      const end = Math.max(...group.selected);
      for (let index = 0; index <= end; index++) {
        const command = group.commands[index]!;
        if ("property" in command) {
          target[command.property] =
            command.property === "shadowOffsetX" && shift
              ? Number(command.value) + shift
              : command.property === "shadowColor" && group.shadow === "none"
                ? "rgba(0,0,0,0)"
                : command.value;
          continue;
        }
        if (paints.has(command.method) && !group.selected.has(index)) continue;
        if (command.method === "save") depth++;
        if (command.method === "restore") {
          if (!depth) continue;
          depth--;
        }
        if (shift && command.method === "resetTransform") {
          ctx.setTransform(1, 0, 0, 1, -shift, 0);
          continue;
        }
        if (shift && command.method === "setTransform") {
          const current = allocateRenderMetadata<{
            matrix: DOMMatrix | undefined;
          }>(
            320,
            () => ({
              matrix:
                command.args.length === 1
                  ? DOMMatrix.fromMatrix(command.args[0] as DOMMatrixInit)
                  : command.args.length
                    ? new DOMMatrix(command.args as number[])
                    : new DOMMatrix(),
            }),
            false,
            (value) => {
              value.matrix = undefined;
            },
          );
          try {
            current.matrix!.e -= shift;
            ctx.setTransform(current.matrix!);
          } finally {
            releaseRenderMetadata(current);
          }
          continue;
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
  } finally {
    releaseRenderMetadata(temporary);
  }
}

function paintBounds(
  ctx: CanvasRenderingContext2D,
  method: string,
  args: unknown[],
  fallback: Bounds | undefined,
  path: Bounds | undefined,
  keepBounds: (factory: () => Bounds) => Bounds,
): Bounds | undefined {
  const temporary = allocateRenderMetadata<{
    corners: (DOMPoint | { x: number; y: number })[] | undefined;
    matrix: DOMMatrix | undefined;
  }>(
    2048,
    () => ({ corners: undefined, matrix: undefined }),
    false,
    (value) => {
      if (value.corners) value.corners.length = 0;
      value.corners = undefined;
      value.matrix = undefined;
    },
  );
  try {
    let box: Bounds | undefined;
    const deviceSpace =
      (method === "fill" || method === "stroke") &&
      !(args[0] instanceof Path2D);
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
    const matrix = (temporary.matrix = ctx.getTransform());
    const corners = (temporary.corners = [
      [box.left, box.top],
      [box.right, box.top],
      [box.right, box.bottom],
      [box.left, box.bottom],
    ].map(([x, y]) =>
      deviceSpace ? { x: x!, y: y! } : matrix.transformPoint({ x: x!, y: y! }),
    ));
    const scale = Math.max(
      1,
      Math.hypot(matrix.a, matrix.b),
      Math.hypot(matrix.c, matrix.d),
    );
    let padding = 2;
    if (method.startsWith("stroke"))
      padding += Math.abs(ctx.lineWidth) * Math.max(1, ctx.miterLimit) * scale;
    if (ctx.filter !== "none") {
      const filter = ctx.filter;
      resizeRenderMetadata(temporary, 2176 + 4 * filter.length);
      const match = /^blur\(([\d.e+-]+)px\)$/.exec(filter);
      if (!match) return fallback;
      padding += Math.abs(Number(match[1])) * scale * 4 + 4;
    }
    padding +=
      Math.abs(ctx.shadowBlur) * 4 +
      Math.abs(ctx.shadowOffsetX) +
      Math.abs(ctx.shadowOffsetY);
    return keepBounds(() => ({
      left: Math.max(
        fallback?.left ?? -Infinity,
        Math.floor(Math.min(...corners.map((p) => p.x)) - padding),
      ),
      top: Math.max(
        fallback?.top ?? -Infinity,
        Math.floor(Math.min(...corners.map((p) => p.y)) - padding),
      ),
      right: Math.min(
        fallback?.right ?? Infinity,
        Math.ceil(Math.max(...corners.map((p) => p.x)) + padding),
      ),
      bottom: Math.min(
        fallback?.bottom ?? Infinity,
        Math.ceil(Math.max(...corners.map((p) => p.y)) + padding),
      ),
    }));
  } finally {
    releaseRenderMetadata(temporary);
  }
}
