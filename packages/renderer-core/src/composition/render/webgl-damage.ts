import type { Bounds } from "../evaluate/types.ts";
import type {
  RenderOp,
  ProviderContent,
  SurfaceNode,
  TextContent,
} from "./graph.ts";
import type { WebglVisualKey } from "./webgl-visual-key.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

type Frame = {
  header: string;
  layers: { id: string; key: string; bounds: Bounds | undefined }[];
};

/** Conservative root damage. Backdrop effects and changed ordering require a complete repaint. */
export class WebglDamage {
  private previous: Frame | undefined;
  constructor(
    private readonly keys: WebglVisualKey,
    private readonly contentBounds?: (
      content: ProviderContent | TextContent,
    ) => Bounds | undefined,
  ) {}

  reset() {
    this.previous = undefined;
  }

  private bounds(op: RenderOp): Bounds | undefined {
    if (op.kind === "adjust") return undefined;
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
      c.type === "provider" || c.type === "text"
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
    const prior = this.previous;
    const bounds = root.ops.map((op) => this.bounds(op));
    if (root.ops.some((op, i) => op.kind !== "draw" && !bounds[i])) {
      this.reset();
      return undefined;
    }
    const frame: Frame = {
      header: this.keys.of([root.id, root.width, root.height, root.background]),
      layers: root.ops.map((op, i) => ({
        id: op.layer,
        key: this.keys.of(op),
        bounds: bounds[i],
      })),
    };
    this.previous = frame;
    if (
      !prior ||
      prior.header !== frame.header ||
      prior.layers.length !== frame.layers.length
    )
      return undefined;
    let dirty: Bounds | null = null;
    for (let i = 0; i < frame.layers.length; i++) {
      const before = prior.layers[i]!,
        after = frame.layers[i]!;
      if (before.id !== after.id) return undefined;
      if (before.key === after.key) continue;
      if (!before.bounds || !after.bounds) return undefined;
      for (const box of [before.bounds, after.bounds]) {
        if (!dirty) dirty = { ...box };
        else {
          dirty.left = Math.min(dirty.left, box.left);
          dirty.top = Math.min(dirty.top, box.top);
          dirty.right = Math.max(dirty.right, box.right);
          dirty.bottom = Math.max(dirty.bottom, box.bottom);
        }
      }
    }
    if (dirty) {
      dirty.left = Math.max(0, dirty.left);
      dirty.top = Math.max(0, dirty.top);
      dirty.right = Math.min(root.width, dirty.right);
      dirty.bottom = Math.min(root.height, dirty.bottom);
      if (dirty.right <= dirty.left || dirty.bottom <= dirty.top) return null;
    }
    return dirty;
  }
}
