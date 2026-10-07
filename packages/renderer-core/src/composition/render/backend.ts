import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { RenderEffect } from "./graph.ts";
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
  ShapeContent,
  IsolateOp,
} from "./graph.ts";

export type SolidDraw = DrawOp & { content: SolidContent };
export type VectorDraw = DrawOp & {
  content: Exclude<DrawOp["content"], { type: "image" | "surface" }>;
};

/** A premultiplied RGBA render target owned by a backend. */
export type Surface = { readonly width: number; readonly height: number };

/**
 * Drawing primitives a composition backend implements. The render graph and its
 * executor are shared, so the CE6 WebGL2 backend only has to provide these.
 */
export interface RenderBackend<S extends Surface = Surface> {
  readonly version: string;
  /** Optional retained-frame lifecycle; effects and exposure may request a full repaint. */
  beginFrame?(root: SurfaceNode): void;
  endFrame?(completed: boolean): void;
  /** Optional canonical pixel identity for retained backend content. */
  frameKey?(root: SurfaceNode): string;
  /** Cache an immutable isolate; the caller releases the returned surface normally. */
  renderIsolate?(op: IsolateOp, like: S, draw: () => S): S;
  /** A cleared, transparent surface, usually from a pool. */
  createSurface(width: number, height: number): S;
  releaseSurface(surface: S): void;
  /** Clear to transparent, then fill with `background` when given. */
  clear(surface: S, background: Rgba | null): void;
  /** Optional batch for consecutive normal solid fills without clips. */
  fillRects?(dst: S, ops: SolidDraw[]): void;
  /** Prepare adjacent vectors/text together; effects and compositing boundaries stay explicit. */
  drawVectors?(dst: S, ops: VectorDraw[]): void;
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
    paintBlur?: number,
  ): void;
  drawImage(
    dst: S,
    content: ImageContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
    paintBlur?: number,
  ): void;
  drawText(
    dst: S,
    content: TextContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
    paintBlur?: number,
  ): void;
  drawShape(
    dst: S,
    content: ShapeContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
    paintBlur?: number,
  ): void;
  drawProvider(
    dst: S,
    content: ProviderContent,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
    paintBlur?: number,
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
    paintBlur?: number,
  ): void;
  /** Apply the ordered effect stack in surface pixel space, before masks/mattes. */
  applyEffects(
    target: S,
    effects: RenderEffect[],
    layers?: ReadonlyMap<string, S>,
  ): void;
  /** Multiply `target` by the combined coverage of `masks`. */
  applyMask(target: S, masks: MaskOp[]): void;
  /** Multiply `target` by the matte value of `matte`. */
  applyMatte(target: S, matte: S, mode: TrackMatte["mode"]): void;
  /** `dst = dst·(1 − k) + src·k`, with `k = opacity × coverage alpha`. */
  lerp(dst: S, src: S, coverage: S, opacity: number): void;
  /** Unpremultiplied RGBA bytes, top row first. */
  readPixels(surface: S): Uint8ClampedArray;
  /** Average complete exposure samples in fixed order, using bounded scratch space. */
  accumulateExposure(
    target: S,
    count: number,
    draw: (index: number) => void,
  ): void;
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
    try {
      backend.clear(dst, node.background);
      runOps(node.ops, dst);
      return dst;
    } catch (error) {
      if (!into) backend.releaseSurface(dst);
      throw error;
    }
  };
  const isolated = (ops: RenderOp[], like: S) => {
    const tmp = backend.createSurface(like.width, like.height);
    try {
      runOps(ops, tmp);
      return tmp;
    } catch (error) {
      backend.releaseSurface(tmp);
      throw error;
    }
  };
  const effectStack = (target: S, effects: RenderEffect[]): void => {
    if (!effects.some((effect) => effect.layerInputs)) {
      backend.applyEffects(target, effects);
      return;
    }
    for (const effect of effects) {
      const inputs = new Map<string, S>();
      try {
        for (const [slot, ops] of Object.entries(effect.layerInputs ?? {}))
          inputs.set(slot, isolated(ops, target));
        backend.applyEffects(target, [effect], inputs);
      } finally {
        for (const source of inputs.values()) backend.releaseSurface(source);
      }
    }
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
        const {
          content: c,
          matrix,
          opacity,
          blend,
          clips,
          transforms,
          paintBlur,
        } = op;
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
            paintBlur,
          );
        else if (c.type === "image")
          backend.drawImage(
            dst,
            c,
            matrix,
            opacity,
            blend,
            clips,
            transforms,
            paintBlur,
          );
        else if (c.type === "text")
          backend.drawText(
            dst,
            c,
            matrix,
            opacity,
            blend,
            clips,
            transforms,
            paintBlur,
          );
        else if (c.type === "shape")
          backend.drawShape(
            dst,
            c,
            matrix,
            opacity,
            blend,
            clips,
            transforms,
            paintBlur,
          );
        else if (c.type === "provider")
          backend.drawProvider(
            dst,
            c,
            matrix,
            opacity,
            blend,
            clips,
            transforms,
            paintBlur,
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
            paintBlur,
          );
          backend.releaseSurface(nested);
        }
        return;
      }
      case "isolate": {
        const draw = () => {
          const tmp = isolated(op.ops, dst);
          try {
            if (op.effects.length) effectStack(tmp, op.effects);
            mask(tmp, op.masks, op.matte);
            return tmp;
          } catch (error) {
            backend.releaseSurface(tmp);
            throw error;
          }
        };
        const tmp = backend.renderIsolate?.(op, dst, draw) ?? draw();
        backend.composite(tmp, dst, op.blend, op.opacity, IDENTITY, op.clips);
        backend.releaseSurface(tmp);
        return;
      }
      case "adjust": {
        // Unit coverage replaces the complete backdrop. Generators can paint it
        // directly, preserving rasterization and avoiding copies. Alpha-changing
        // kernels still need an RGBA intermediate when the target is opaque.
        if (
          !op.history?.length &&
          op.effects.every(
            (effect) =>
              compositionEffectDefinition(effect.effect)!.preservesOpaque,
          ) &&
          op.blend === "normal" &&
          op.opacity === 1 &&
          !op.clips.length &&
          !op.masks.length &&
          !op.matte &&
          op.width === dst.width &&
          op.height === dst.height &&
          op.matrix.every((value, i) => value === IDENTITY[i])
        ) {
          effectStack(dst, op.effects);
          return;
        }
        // Process the backdrop before blending it and applying adjustment coverage.
        const src = backend.createSurface(dst.width, dst.height);
        try {
          for (const sample of op.history ?? []) {
            const prior = backend.createSurface(dst.width, dst.height);
            try {
              backend.clear(prior, sample.background);
              runOps(sample.ops, prior);
              backend.composite(
                prior,
                src,
                "normal",
                sample.opacity,
                IDENTITY,
                [],
              );
            } finally {
              backend.releaseSurface(prior);
            }
          }
          backend.composite(dst, src, "normal", 1, IDENTITY, []);
          if (op.effects.length) effectStack(src, op.effects);
          if (op.blend !== "normal") {
            const blended = backend.createSurface(dst.width, dst.height);
            try {
              backend.composite(dst, blended, "normal", 1, IDENTITY, []);
              backend.composite(src, blended, op.blend, 1, IDENTITY, []);
              backend.clear(src, null);
              backend.composite(blended, src, "normal", 1, IDENTITY, []);
            } finally {
              backend.releaseSurface(blended);
            }
          }
          const coverage = backend.createSurface(dst.width, dst.height);
          try {
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
          } finally {
            backend.releaseSurface(coverage);
          }
        } finally {
          backend.releaseSurface(src);
        }
        return;
      }
    }
  };
  const batchable = (op: RenderOp): op is SolidDraw =>
    op.kind === "draw" &&
    op.content.type === "solid" &&
    op.blend === "normal" &&
    op.clips.length === 0 &&
    !op.paintBlur;
  const vector = (op: RenderOp): op is VectorDraw =>
    op.kind === "draw" &&
    op.content.type !== "image" &&
    op.content.type !== "surface" &&
    op.blend === "normal";
  const runOps = (ops: RenderOp[], dst: S) => {
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index]!;
      if (
        graph.root.colorSpace !== "linear-srgb" &&
        backend.drawVectors &&
        vector(op)
      ) {
        const batch = [op];
        while (index + 1 < ops.length) {
          const next = ops[index + 1]!;
          if (!vector(next)) break;
          batch.push(next);
          index++;
        }
        backend.drawVectors(dst, batch);
      } else if (
        graph.root.colorSpace !== "linear-srgb" &&
        backend.fillRects &&
        batchable(op)
      ) {
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
  let completed = false;
  try {
    backend.beginFrame?.(graph.root);
    surface(graph.root, target);
    completed = true;
  } finally {
    backend.endFrame?.(completed);
  }
}
