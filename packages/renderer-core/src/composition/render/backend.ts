import type {
  CompositionBlendMode,
  TrackMatte,
} from "@still-shift/scene-contract";
import type { Matrix } from "../../node-transform.ts";
import type { Rgba } from "../evaluate/types.ts";
import type {
  ClipRect,
  ImageContent,
  MaskOp,
  RenderGraph,
  RenderOp,
  SurfaceNode,
  TextContent,
  ProviderContent,
  DrawOp,
  SolidContent,
} from "./graph.ts";

export type SolidDraw = DrawOp & { content: SolidContent };

/** A premultiplied RGBA render target owned by a backend. */
export type Surface = { readonly width: number; readonly height: number };

/**
 * Drawing primitives a composition backend implements. The render graph and its
 * executor are shared, so the CE6 WebGL2 backend only has to provide these.
 */
export interface RenderBackend<S extends Surface = Surface> {
  readonly version: string;
  /** A cleared, transparent surface, usually from a pool. */
  createSurface(width: number, height: number): S;
  releaseSurface(surface: S): void;
  /** Clear to transparent, then fill with `background` when given. */
  clear(surface: S, background: Rgba | null): void;
  /** Optional batch for consecutive normal solid fills without clips. */
  fillRects?(dst: S, ops: SolidDraw[]): void;
  fillRect(
    dst: S,
    matrix: Matrix,
    width: number,
    height: number,
    color: Rgba,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
  ): void;
  drawImage(
    dst: S,
    content: ImageContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
  ): void;
  drawText(
    dst: S,
    content: TextContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
  ): void;
  drawProvider(
    dst: S,
    content: ProviderContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
  ): void;
  /** Draw `src` (its pixel grid placed by `matrix`) onto `dst`. */
  composite(
    src: S,
    dst: S,
    blend: CompositionBlendMode,
    opacity: number,
    matrix: Matrix,
    clips: ClipRect[],
    transforms?: Matrix[],
  ): void;
  /** Multiply `target` by the combined coverage of `masks`. */
  applyMask(target: S, masks: MaskOp[]): void;
  /** Multiply `target` by the matte value of `matte`. */
  applyMatte(target: S, matte: S, mode: TrackMatte["mode"]): void;
  /** `dst = dst·(1 − k) + src·k`, with `k = opacity × coverage alpha`. */
  lerp(dst: S, src: S, coverage: S, opacity: number): void;
  /** Unpremultiplied RGBA bytes, top row first. */
  readPixels(surface: S): Uint8ClampedArray;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const WHITE: Rgba = [1, 1, 1, 1];

/** Run a render graph on any backend, drawing the root scope into `target`. */
export function executeGraph<S extends Surface>(
  backend: RenderBackend<S>,
  graph: RenderGraph,
  target: S,
): void {
  const surface = (node: SurfaceNode, into?: S): S => {
    const dst = into ?? backend.createSurface(node.width, node.height);
    backend.clear(dst, node.background);
    runOps(node.ops, dst);
    return dst;
  };
  const isolated = (ops: RenderOp[], like: S) => {
    const tmp = backend.createSurface(like.width, like.height);
    runOps(ops, tmp);
    return tmp;
  };
  const mask = (
    tmp: S,
    masks: MaskOp[],
    matte: { mode: TrackMatte["mode"]; ops: RenderOp[] } | null,
  ) => {
    if (masks.length) backend.applyMask(tmp, masks);
    if (matte) {
      const source = isolated(matte.ops, tmp);
      backend.applyMatte(tmp, source, matte.mode);
      backend.releaseSurface(source);
    }
  };
  const run = (op: RenderOp, dst: S): void => {
    switch (op.kind) {
      case "draw": {
        const { content: c, matrix, opacity, blend, clips, transforms } = op;
        if (c.type === "solid")
          backend.fillRect(
            dst,
            matrix,
            c.width,
            c.height,
            c.color,
            opacity,
            blend,
            clips,
            transforms,
          );
        else if (c.type === "image")
          backend.drawImage(dst, c, matrix, opacity, blend, clips, transforms);
        else if (c.type === "text")
          backend.drawText(dst, c, matrix, opacity, blend, clips, transforms);
        else if (c.type === "provider")
          backend.drawProvider(
            dst,
            c,
            matrix,
            opacity,
            blend,
            clips,
            transforms,
          );
        else {
          const nested = surface(c.surface);
          backend.composite(
            nested,
            dst,
            blend,
            opacity,
            matrix,
            clips,
            transforms,
          );
          backend.releaseSurface(nested);
        }
        return;
      }
      case "isolate": {
        const tmp = isolated(op.ops, dst);
        mask(tmp, op.masks, op.matte);
        backend.composite(tmp, dst, op.blend, op.opacity, IDENTITY, op.clips);
        backend.releaseSurface(tmp);
        return;
      }
      case "adjust": {
        // Effects (CE6) will process `src` here; blend modes already apply.
        const src = backend.createSurface(dst.width, dst.height);
        backend.composite(dst, src, "normal", 1, IDENTITY, []);
        if (op.blend !== "normal")
          backend.composite(dst, src, op.blend, 1, IDENTITY, []);
        const coverage = backend.createSurface(dst.width, dst.height);
        backend.fillRect(
          coverage,
          op.matrix,
          op.width,
          op.height,
          WHITE,
          1,
          "normal",
          op.clips,
          op.transforms,
        );
        mask(coverage, op.masks, op.matte);
        backend.lerp(dst, src, coverage, op.opacity);
        backend.releaseSurface(coverage);
        backend.releaseSurface(src);
        return;
      }
    }
  };
  const batchable = (op: RenderOp): op is SolidDraw =>
    op.kind === "draw" &&
    op.content.type === "solid" &&
    op.blend === "normal" &&
    op.clips.length === 0;
  const runOps = (ops: RenderOp[], dst: S) => {
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index]!;
      if (backend.fillRects && batchable(op)) {
        const batch = [op];
        while (index + 1 < ops.length) {
          const next = ops[index + 1]!;
          if (!batchable(next)) break;
          batch.push(next);
          index++;
        }
        if (batch.length > 1) backend.fillRects(dst, batch);
        else run(op, dst);
      } else run(op, dst);
    }
  };
  surface(graph.root, target);
}
