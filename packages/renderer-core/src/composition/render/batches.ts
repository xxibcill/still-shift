import type {
  RenderBackend,
  Surface,
  SolidDraw,
  VectorDraw,
} from "./backend.ts";
import type { RenderOp } from "./graph.ts";

export type RenderBatch =
  | { kind: "vectors"; start: number; end: number; ops: VectorDraw[] }
  | { kind: "solids"; start: number; end: number; ops: SolidDraw[] }
  | { kind: "single"; start: number; end: number; ops: [RenderOp] };

const solid = (op: RenderOp): op is SolidDraw =>
  op.kind === "draw" &&
  op.content.type === "solid" &&
  op.blend === "normal" &&
  op.clips.length === 0 &&
  !op.paintBlur;
const vector = (op: RenderOp): op is VectorDraw =>
  op.kind === "draw" &&
  op.content.type !== "image" &&
  op.content.type !== "depth-image" &&
  op.content.type !== "surface" &&
  op.blend === "normal" &&
  !op.clips.some((clip) => clip.projection);

/** Preserve the executor's maximal native batches, including backend precedence. */
export function* renderBatches<S extends Surface>(
  backend: Pick<RenderBackend<S>, "drawVectors" | "fillRects">,
  ops: RenderOp[],
  colorSpace?: "srgb" | "linear-srgb",
  start = 0,
): Generator<RenderBatch> {
  for (let index = start; index < ops.length; ) {
    const begin = index,
      op = ops[index++]!;
    if (colorSpace !== "linear-srgb" && backend.drawVectors && vector(op)) {
      const batch = [op];
      while (index < ops.length && vector(ops[index]!))
        batch.push(ops[index++]! as VectorDraw);
      yield { kind: "vectors", start: begin, end: index, ops: batch };
    } else if (colorSpace !== "linear-srgb" && backend.fillRects && solid(op)) {
      const batch = [op];
      while (index < ops.length && solid(ops[index]!))
        batch.push(ops[index++]! as SolidDraw);
      if (batch.length > 1)
        yield { kind: "solids", start: begin, end: index, ops: batch };
      else yield { kind: "single", start: begin, end: index, ops: [op] };
    } else yield { kind: "single", start: begin, end: index, ops: [op] };
  }
}
