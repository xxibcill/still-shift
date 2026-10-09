import type { Bounds } from "../evaluate/types.ts";
import type {
  RenderOp,
  ProviderContent,
  SurfaceNode,
  TextContent,
} from "./graph.ts";
import type { WebglVisualKey } from "./webgl-visual-key.ts";
import { unionBounds } from "./webgl-vector-regions.ts";
import { renderMemory } from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";

type Frame = {
  header: string;
  layers: { id: string; key: string; bounds: Bounds | undefined }[];
};

type OwnedFrame = {
  frame: Frame | undefined;
  bounds: (Bounds | undefined)[] | undefined;
  keys: ManagedMetadataText[];
};
type DamageState = {
  previous: OwnedFrame | undefined;
  dirty: Bounds | undefined;
  closed: boolean;
};
function clearOwnedFrame(value: OwnedFrame): void {
  for (const key of value.keys) key.release();
  value.keys.length = 0;
  if (value.frame) value.frame.layers.length = 0;
  value.frame = undefined;
  if (value.bounds) value.bounds.length = 0;
  value.bounds = undefined;
}
function releaseFrame(value: OwnedFrame | undefined): void {
  if (!value) return;
  clearOwnedFrame(value);
  releaseRenderMetadata(value);
}

/** Concrete upper capacity for the original bounds producers, before any callback/copy. */
function frameCapacity(root: SurfaceNode): number {
  if (!renderMemory()) return 0;
  let draws = 0,
    isolates = 0,
    children = 0;
  const visit = (ops: RenderOp[]) => {
    for (const op of ops)
      if (op.kind === "draw") draws++;
      else if (op.kind === "isolate") {
        isolates++;
        children += op.ops.length;
        visit(op.ops);
      }
  };
  visit(root.ops);
  // Control/frame/owner arrays/header input; root bounds/layer slots and records.
  // Each draw: inline box 64 + corner/coordinate arrays 384 + output bounds 64.
  // Empty isolates and each possible union each require one 64-byte bounds record.
  return 384 + 120 * root.ops.length + 512 * draws + 64 * (isolates + children);
}

/** Conservative root damage. Backdrop effects and changed ordering require a complete repaint. */
export class WebglDamage {
  private readonly state: DamageState;
  constructor(
    private readonly keys: WebglVisualKey,
    private readonly contentBounds?: (
      content: ProviderContent | TextContent,
    ) => Bounds | undefined,
  ) {
    this.state = allocateRenderMetadata<DamageState>(
      128,
      () => ({ previous: undefined, dirty: undefined, closed: false }),
      false,
      (value) => {
        value.closed = true;
        releaseFrame(value.previous);
        value.previous = undefined;
        if (value.dirty) releaseRenderMetadata(value.dirty);
        value.dirty = undefined;
      },
    );
  }

  finish() {
    const dirty = this.state.dirty;
    this.state.dirty = undefined;
    if (dirty) releaseRenderMetadata(dirty);
  }
  reset() {
    const previous = this.state.previous;
    this.state.previous = undefined;
    releaseFrame(previous);
    this.finish();
  }
  dispose() {
    this.reset();
    this.state.closed = true;
    releaseRenderMetadata(this.state);
  }

  private bounds(op: RenderOp): Bounds | undefined {
    if (op.kind === "adjust" || op.kind === "project") return undefined;
    if (op.kind === "isolate") {
      if (op.effects.length || op.blend !== "normal") return undefined;
      let bounds: Bounds | undefined;
      for (const child of op.ops) {
        const box = this.bounds(child);
        if (!box) return undefined;
        bounds = bounds ? unionBounds(bounds, box) : box;
      }
      // Masks and mattes only remove destination coverage. Their full state
      // remains in the visual key, including changes beyond these bounds.
      return bounds ?? { left: 0, top: 0, right: 0, bottom: 0 };
    }
    if (op.paintBlur) return undefined;
    const c = op.content;
    const box =
      c.type === "shape"
        ? (c.shapes.bounds ?? undefined)
        : c.type === "provider" || c.type === "text"
          ? this.contentBounds?.(c)
          : c.type === "surface"
            ? {
                left: 0,
                top: 0,
                right: c.surface.width,
                bottom: c.surface.height,
              }
            : { left: 0, top: 0, right: c.width, bottom: c.height };
    if (!box) return undefined;
    const [a, b, cx, d, tx, ty] = op.matrix;
    const points = [
      [box.left, box.top],
      [box.right, box.top],
      [box.right, box.bottom],
      [box.left, box.bottom],
    ];
    const xs = points.map(([x, y]) => a * x! + cx * y! + tx);
    const ys = points.map(([x, y]) => b * x! + d * y! + ty);
    return {
      left: Math.floor(Math.min(...xs)) - 2,
      top: Math.floor(Math.min(...ys)) - 2,
      right: Math.ceil(Math.max(...xs)) + 2,
      bottom: Math.ceil(Math.max(...ys)) + 2,
    };
  }

  /** undefined means the full framebuffer; null means every pixel is unchanged. */
  next(root: SurfaceNode): Bounds | null | undefined {
    if (this.state.closed) throw Error("WebGL damage tracker is disposed");
    this.finish();
    const priorOwner = this.state.previous,
      prior = priorOwner?.frame;
    const owned = allocateRenderMetadata<OwnedFrame>(
      frameCapacity(root),
      () => ({ frame: undefined, bounds: undefined, keys: [] }),
      true,
      clearOwnedFrame,
    );
    let committed = false,
      dirty: Bounds | null = null,
      returned = false;
    try {
      const bounds = (owned.bounds = root.ops.map((op) => this.bounds(op)));
      if (root.ops.some((op, i) => op.kind !== "draw" && !bounds[i])) {
        this.reset();
        return undefined;
      }
      const header = this.keys.metadata([
        root.id,
        root.width,
        root.height,
        root.background,
        root.colorSpace,
      ]);
      owned.keys.push(header);
      const frame: Frame = {
        header: header.value!,
        layers: root.ops.map((op, i) => {
          const id = op.layer,
            key = this.keys.metadata(op);
          owned.keys.push(key);
          return { id, key: key.value!, bounds: bounds[i] };
        }),
      };
      owned.frame = frame;
      let bounded = 0;
      for (const layer of frame.layers) if (layer.bounds) bounded++;
      bounds.length = 0;
      owned.bounds = undefined;
      resizeRenderMetadata(
        owned,
        320 + 112 * frame.layers.length + 64 * bounded,
      );
      for (const key of owned.keys) key.retain();
      this.state.previous = owned;
      committed = true;
      if (
        !prior ||
        prior.header !== frame.header ||
        prior.layers.length !== frame.layers.length
      )
        return undefined;
      for (let i = 0; i < frame.layers.length; i++) {
        const before = prior.layers[i]!,
          after = frame.layers[i]!;
        if (before.id !== after.id) return undefined;
        if (before.key === after.key) continue;
        if (!before.bounds || !after.bounds) return undefined;
        const boxes = allocateRenderMetadata(
          48,
          () => [before.bounds!, after.bounds!],
          false,
          (value) => {
            value.length = 0;
          },
        );
        try {
          for (const box of boxes) {
            if (!dirty) dirty = allocateRenderMetadata(64, () => ({ ...box }));
            else {
              dirty.left = Math.min(dirty.left, box.left);
              dirty.top = Math.min(dirty.top, box.top);
              dirty.right = Math.max(dirty.right, box.right);
              dirty.bottom = Math.max(dirty.bottom, box.bottom);
            }
          }
        } finally {
          releaseRenderMetadata(boxes);
        }
      }
      if (dirty) {
        dirty.left = Math.max(0, dirty.left);
        dirty.top = Math.max(0, dirty.top);
        dirty.right = Math.min(root.width, dirty.right);
        dirty.bottom = Math.min(root.height, dirty.bottom);
        if (dirty.right <= dirty.left || dirty.bottom <= dirty.top) return null;
        renderMemory()?.retain(dirty);
        this.state.dirty = dirty;
        returned = true;
      }
      return dirty;
    } finally {
      if (committed) releaseFrame(priorOwner);
      else releaseFrame(owned);
      if (dirty && !returned) releaseRenderMetadata(dirty);
    }
  }
}
