import { installCanvasLinear } from "./canvas-linear.ts";
import { cssColor } from "./canvas-color.ts";
import { drawShapes } from "./draw-shapes.ts";
import { applyCanvasEffects } from "./effects.ts";
import type {
  BezierPath,
  CompositionBlendMode,
  TrackMatte,
  Composition,
} from "@still-shift/scene-contract";
import { imagePlacement, type Matrix } from "../../node-transform.ts";
import type { RenderBackend } from "./backend.ts";
import type {
  ClipRect,
  ImageContent,
  TextContent,
  ProviderContent,
} from "./graph.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { COMPOSITION_RENDERER_VERSION } from "./version.ts";

export type CanvasSurface = {
  readonly width: number;
  readonly height: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly rasterMode?: "software";
};

export type CanvasImageResources = {
  /** Decoded images by asset id. */
  images: ReadonlyMap<string, CanvasImageSource>;
  /** Natural pixel size by asset id, from the composition's asset list. */
  sizes: ReadonlyMap<string, readonly [number, number]>;
  /** Immutable decoded PNG assets verified by the resource loader. */
  pngImages?: ReadonlySet<string>;
};

/** Native camera references, cubic/nib paints and Canvas filters use pinned CPU raster preparation. */
export function requiresSoftwareFilters(composition: Composition): boolean {
  return [composition, ...(composition.precomps ?? [])].some((scope) =>
    scope.layers.some(
      (layer) =>
        layer.threeD === true ||
        layer.type === "shape" ||
        layer.effects?.some((effect) => effect.effect === "blur.primitive"),
    ),
  );
}

/** Draws a text layer's content in layer space; `ctx` already carries the transform. */
export type CanvasTextDrawer = (
  ctx: CanvasRenderingContext2D,
  content: TextContent,
) => void;

const COMPOSITE: Record<CompositionBlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
  add: "lighter",
};

export { cssColor } from "./canvas-color.ts";

export function bezierPath2D(path: BezierPath): Path2D {
  const p = new Path2D(),
    v = path.vertices,
    out = path.outTangents,
    inn = path.inTangents;
  p.moveTo(v[0]![0], v[0]![1]);
  const segment = (from: number, to: number) => {
    const a = v[from]!,
      b = v[to]!;
    const o = out?.[from] ?? [0, 0],
      i = inn?.[to] ?? [0, 0];
    if (!o[0] && !o[1] && !i[0] && !i[1]) p.lineTo(b[0], b[1]);
    else
      p.bezierCurveTo(
        a[0] + o[0],
        a[1] + o[1],
        b[0] + i[0],
        b[1] + i[1],
        b[0],
        b[1],
      );
  };
  for (let i = 1; i < v.length; i++) segment(i - 1, i);
  // Masks are always regions: an open path closes with its last segment.
  segment(v.length - 1, 0);
  p.closePath();
  return p;
}

const matrixScale = (m: Matrix) =>
  Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export type Canvas2dBackendOptions = {
  colorSpace?: "srgb" | "linear-srgb";
  images: CanvasImageResources;
  drawText: CanvasTextDrawer;
  drawProvider?: (
    ctx: CanvasRenderingContext2D,
    content: ProviderContent,
  ) => void;
  /** Defaults to `document.createElement("canvas")`. */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  /** Surfaces kept per size between frames. */
  poolLimit?: number;
  /** Maximum bytes retained by idle preparation surfaces across all sizes. */
  poolByteLimit?: number;
  /** Keep primitive Canvas filters consistent with the pinned CPU raster. */
  softwareRaster?: boolean;
};

export type Canvas2dBackend = RenderBackend<CanvasSurface> & {
  /** Software filter preparation has its own pool; ordinary surfaces stay unchanged. */
  createSurface(
    width: number,
    height: number,
    rasterMode?: "software",
  ): CanvasSurface;
  /** Wrap an existing canvas, such as the preview or export canvas. */
  wrap(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): CanvasSurface;
  /** Pooled surfaces currently allocated (in use and idle). */
  readonly allocated: number;
  dispose(): void;
};

/** Canvas 2D reference backend: surfaces are canvases, compositing uses Canvas operations. */
export function createCanvas2dBackend(
  options: Canvas2dBackendOptions,
): Canvas2dBackend {
  const make =
    options.createCanvas ??
    ((width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    });
  const limit = options.poolLimit ?? 16;
  const pool = new Map<string, CanvasSurface[]>();
  let pooledBytes = 0;
  const byteLimit = options.poolByteLimit ?? Infinity;
  const rasters = new Map<string, HTMLCanvasElement>();
  let allocated = 0;
  let accumulation: Float32Array | undefined;

  const reset = (ctx: CanvasRenderingContext2D) => {
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
  };
  const transform = (
    ctx: CanvasRenderingContext2D,
    matrix: Matrix,
    chain?: Matrix[],
  ) => {
    if (!chain) {
      ctx.setTransform(...matrix);
      return;
    }
    ctx.resetTransform();
    for (const local of chain) ctx.transform(...local);
  };
  const clip = (ctx: CanvasRenderingContext2D, clips: ClipRect[]) => {
    for (const c of clips) {
      transform(ctx, c.matrix, c.transforms);
      ctx.beginPath();
      ctx.rect(0, 0, c.width, c.height);
      ctx.clip();
    }
  };
  const begin = (
    s: CanvasSurface,
    matrix: Matrix,
    opacity: number,
    blend: CompositionBlendMode,
    clips: ClipRect[],
    transforms?: Matrix[],
    paintBlur = 0,
  ) => {
    const ctx = s.ctx;
    ctx.save();
    clip(ctx, clips);
    transform(ctx, matrix, transforms);
    ctx.filter = paintBlur > 0 ? `blur(${paintBlur}px)` : "none";
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = COMPOSITE[blend];
    return ctx;
  };

  const backend: Canvas2dBackend = {
    version: COMPOSITION_RENDERER_VERSION,
    surfaceEncoding: "rgba8-straight",
    captureSurface(surface) {
      return {
        encoding: "rgba8-straight",
        bytes: new Uint8Array(
          surface.ctx.getImageData(
            0,
            0,
            surface.width,
            surface.height,
          ).data.buffer,
        ),
      };
    },
    restoreSurface(width, height, pixels) {
      if (
        pixels.encoding !== "rgba8-straight" ||
        pixels.bytes.byteLength !== width * height * 4
      )
        throw Error(
          "Canvas retained surface storage differs from its contract",
        );
      const surface = backend.createSurface(width, height);
      surface.ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(
            pixels.bytes.buffer,
            pixels.bytes.byteOffset,
            pixels.bytes.byteLength,
          ),
          width,
          height,
        ),
        0,
        0,
      );
      return surface;
    },
    get allocated() {
      return allocated;
    },
    wrap(canvas, ctx) {
      return {
        width: canvas.width,
        height: canvas.height,
        canvas,
        ctx,
        ...(options.softwareRaster ? { rasterMode: "software" as const } : {}),
      };
    },
    createSurface(
      width,
      height,
      rasterMode: "software" | undefined = options.softwareRaster
        ? "software"
        : undefined,
    ) {
      const key = `${width}x${height}:${rasterMode ?? "default"}`;
      const list = pool.get(key);
      const surface = list?.pop();
      if (!list?.length) pool.delete(key);
      if (surface) {
        pooledBytes -= width * height * 4;
        reset(surface.ctx);
        surface.ctx.clearRect(0, 0, width, height);
        return surface;
      }
      allocated += 1;
      const canvas = make(width, height);
      const ctx = canvas.getContext("2d", {
        willReadFrequently: rasterMode === "software",
      })!;
      return {
        width,
        height,
        canvas,
        ctx,
        ...(rasterMode ? { rasterMode } : {}),
      };
    },
    releaseSurface(surface) {
      const key = `${surface.width}x${surface.height}:${surface.rasterMode ?? "default"}`;
      const bytes = surface.width * surface.height * 4;
      if (bytes > byteLimit || (pool.get(key)?.length ?? 0) >= limit) {
        allocated -= 1;
        return;
      }
      while (pooledBytes + bytes > byteLimit && pool.size) {
        const oldestKey = pool.keys().next().value!;
        const oldest = pool.get(oldestKey)!;
        const evicted = oldest.shift()!;
        pooledBytes -= evicted.width * evicted.height * 4;
        evicted.canvas.width = evicted.canvas.height = 0;
        allocated -= 1;
        if (!oldest.length) pool.delete(oldestKey);
      }
      const list = pool.get(key) ?? [];
      list.push(surface);
      pool.set(key, list);
      pooledBytes += bytes;
    },
    clear(surface, background) {
      const ctx = surface.ctx;
      reset(ctx);
      // An opaque background replaces every pixel after reset; clearing first
      // adds a full-surface write without changing the result.
      if (!background || background[3] < 1)
        ctx.clearRect(0, 0, surface.width, surface.height);
      if (background) {
        ctx.fillStyle = cssColor(background);
        ctx.fillRect(0, 0, surface.width, surface.height);
      }
    },
    fillRect(
      dst,
      matrix,
      width,
      height,
      color,
      opacity,
      blend,
      clips,
      transforms,
      paintBlur,
    ) {
      const ctx = begin(
        dst,
        matrix,
        opacity,
        blend,
        clips,
        transforms,
        paintBlur,
      );
      ctx.fillStyle = cssColor(color);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
    fillRects(dst, ops) {
      const ctx = begin(dst, [1, 0, 0, 1, 0, 0], 1, "normal", []);
      try {
        for (const op of ops) {
          ctx.setTransform(...op.matrix);
          ctx.globalAlpha = op.opacity;
          ctx.fillStyle = cssColor(op.content.color);
          ctx.fillRect(0, 0, op.content.width, op.content.height);
        }
      } finally {
        ctx.restore();
      }
    },
    drawImage(
      dst,
      content,
      matrix,
      opacity,
      blend,
      clips,
      transforms,
      paintBlur,
    ) {
      // Settled states draw directly: a screen-sized intermediate resamples pixels
      // and pays the crossfade cost even when no state transition is visible.
      if (
        content.stateFrom === undefined ||
        content.stateMix === undefined ||
        content.stateMix === 0 ||
        content.stateMix === 1 ||
        content.stateFrom === content.state
      ) {
        const ctx = begin(
          dst,
          matrix,
          opacity,
          blend,
          clips,
          transforms,
          paintBlur,
        );
        // Preserve the matrix transfer of an isolated crossfade at its held
        // boundary; settled sources retain the direct drawing path.
        if (
          content.stateFrom !== undefined &&
          content.stateMix !== undefined &&
          content.stateFrom !== content.state
        )
          ctx.setTransform(ctx.getTransform());
        drawSource(
          ctx,
          content,
          content.stateMix === 0 && content.stateFrom !== undefined
            ? content.stateFrom
            : content.state,
          dst.rasterMode,
        );
        ctx.restore();
        return;
      }
      // Crossfade as the legacy renderer does: the outgoing state at 1 − mix,
      // the incoming one added at mix, then composited as one layer.
      const tmp = backend.createSurface(dst.width, dst.height, dst.rasterMode);
      const ctx = tmp.ctx;
      transform(ctx, matrix, transforms);
      // Crossfades transfer the active Canvas matrix to their isolated surface.
      ctx.setTransform(ctx.getTransform());
      ctx.globalAlpha = 1 - content.stateMix;
      drawSource(ctx, content, content.stateFrom, dst.rasterMode);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = content.stateMix;
      drawSource(ctx, content, content.state, dst.rasterMode);
      backend.composite(
        tmp,
        dst,
        blend,
        opacity,
        [1, 0, 0, 1, 0, 0],
        clips,
        undefined,
        paintBlur,
      );
      backend.releaseSurface(tmp);
    },
    drawText(
      dst,
      content,
      matrix,
      opacity,
      blend,
      clips,
      transforms,
      paintBlur,
    ) {
      if (content.stateFrom === undefined) {
        const ctx = begin(
          dst,
          matrix,
          opacity,
          blend,
          clips,
          transforms,
          paintBlur,
        );
        try {
          options.drawText(ctx, content);
        } finally {
          ctx.restore();
        }
        return;
      }
      drawStateContent(
        dst,
        content,
        {
          matrix,
          opacity,
          blend,
          clips,
          ...(transforms ? { transforms } : {}),
          ...(paintBlur ? { paintBlur } : {}),
        },
        (ctx, state) =>
          options.drawText(ctx, { ...content, state: state ?? content.state }),
      );
    },
    drawShape(
      dst,
      content,
      matrix,
      opacity,
      blend,
      clips,
      transforms,
      paintBlur,
    ) {
      const ctx = begin(
        dst,
        matrix,
        opacity,
        blend,
        clips,
        transforms,
        paintBlur,
      );
      try {
        drawShapes(ctx, content.shapes);
      } finally {
        ctx.restore();
      }
    },
    drawProvider(
      dst,
      content,
      matrix,
      opacity,
      blend,
      clips,
      transforms,
      paintBlur,
    ) {
      if (!options.drawProvider)
        passageError(
          "comp-provider-unavailable",
          `Provider ${content.layer.provider} was not prepared`,
          { path: content.key },
        );
      if (content.stateFrom === undefined) {
        const ctx = begin(
          dst,
          matrix,
          opacity,
          blend,
          clips,
          transforms,
          paintBlur,
        );
        try {
          options.drawProvider(ctx, content);
        } finally {
          ctx.restore();
        }
        return;
      }
      drawStateContent(
        dst,
        content,
        {
          matrix,
          opacity,
          blend,
          clips,
          ...(transforms ? { transforms } : {}),
          ...(paintBlur ? { paintBlur } : {}),
        },
        (ctx, state) =>
          options.drawProvider!(ctx, {
            ...content,
            ...(state !== undefined ? { state } : {}),
          }),
      );
    },
    composite(src, dst, blend, opacity, matrix, clips, transforms, paintBlur) {
      const ctx = begin(
        dst,
        matrix,
        opacity,
        blend,
        clips,
        transforms,
        paintBlur,
      );
      ctx.drawImage(src.canvas, 0, 0);
      ctx.restore();
    },
    applyEffects(target, effects, layers) {
      applyCanvasEffects(backend, target, effects, layers);
    },
    applyMask(target, masks) {
      const combined = backend.createSurface(target.width, target.height);
      const coverage = backend.createSurface(target.width, target.height);
      const mctx = combined.ctx,
        cctx = coverage.ctx;
      // A leading subtract or intersect starts from the whole layer, as in AE.
      if (masks[0]!.mode === "subtract" || masks[0]!.mode === "intersect") {
        mctx.fillStyle = "#000000";
        mctx.fillRect(0, 0, target.width, target.height);
      }
      for (const mask of masks) {
        reset(cctx);
        cctx.clearRect(0, 0, target.width, target.height);
        transform(cctx, mask.matrix, mask.transforms);
        const path = bezierPath2D(mask.path);
        cctx.fillStyle = "#000000";
        cctx.strokeStyle = "#000000";
        cctx.lineJoin = "round";
        cctx.fill(path);
        if (mask.expansion !== 0) {
          // Expansion approximates an offset path with a round-joined stroke.
          cctx.lineWidth = Math.abs(mask.expansion) * 2;
          if (mask.expansion < 0)
            cctx.globalCompositeOperation = "destination-out";
          cctx.stroke(path);
          cctx.globalCompositeOperation = "source-over";
        }
        if (mask.inverted) {
          cctx.resetTransform();
          cctx.globalCompositeOperation = "xor";
          cctx.fillRect(0, 0, target.width, target.height);
        }
        reset(mctx);
        mctx.globalAlpha = mask.opacity;
        mctx.globalCompositeOperation =
          mask.mode === "add"
            ? "source-over"
            : mask.mode === "subtract"
              ? "destination-out"
              : mask.mode === "intersect"
                ? "destination-in"
                : "xor";
        // Feather is a Gaussian with σ = feather / 2 layer pixels.
        if (mask.feather > 0)
          mctx.filter = `blur(${(mask.feather / 2) * matrixScale(mask.matrix)}px)`;
        mctx.drawImage(coverage.canvas, 0, 0);
      }
      const ctx = target.ctx;
      reset(ctx);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(combined.canvas, 0, 0);
      reset(ctx);
      backend.releaseSurface(coverage);
      backend.releaseSurface(combined);
    },
    applyMatte(target, matte, mode) {
      const ctx = target.ctx;
      reset(ctx);
      if (mode === "luma" || mode === "luma-inverted") lumaToAlpha(matte, mode);
      ctx.globalCompositeOperation =
        mode === "alpha-inverted" ? "destination-out" : "destination-in";
      ctx.drawImage(matte.canvas, 0, 0);
      reset(ctx);
    },
    lerp(dst, src, coverage, opacity) {
      const sctx = src.ctx,
        dctx = dst.ctx;
      reset(sctx);
      sctx.globalAlpha = opacity;
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(coverage.canvas, 0, 0);
      reset(sctx);
      reset(dctx);
      dctx.globalAlpha = opacity;
      dctx.globalCompositeOperation = "destination-out";
      dctx.drawImage(coverage.canvas, 0, 0);
      dctx.globalAlpha = 1;
      dctx.globalCompositeOperation = "lighter";
      dctx.drawImage(src.canvas, 0, 0);
      reset(dctx);
    },
    readPixels(surface) {
      return surface.ctx.getImageData(0, 0, surface.width, surface.height).data;
    },
    accumulateExposure(target, count, draw) {
      if (count === 1) {
        draw(0);
        return;
      }
      const length = target.width * target.height * 4;
      if (accumulation?.length !== length)
        accumulation = new Float32Array(length);
      else accumulation.fill(0);
      let pixels: ImageData | undefined;
      for (let sample = 0; sample < count; sample++) {
        draw(sample);
        pixels = target.ctx.getImageData(0, 0, target.width, target.height);
        for (let index = 0; index < length; index++)
          accumulation[index] = accumulation[index]! + pixels.data[index]!;
      }
      for (let index = 0; index < length; index++)
        pixels!.data[index] = Math.round(accumulation[index]! / count);
      target.ctx.putImageData(pixels!, 0, 0);
    },
    dispose() {
      accumulation = undefined;
      pool.clear();
      pooledBytes = 0;
      rasters.clear();
      allocated = 0;
    },
  };

  /** Blend local content on a full surface so opacity, masks and clipping apply once. */
  function drawStateContent(
    dst: CanvasSurface,
    content: TextContent | ProviderContent,
    placement: {
      matrix: Matrix;
      opacity: number;
      blend: CompositionBlendMode;
      clips: ClipRect[];
      transforms?: Matrix[];
      paintBlur?: number;
    },
    draw: (ctx: CanvasRenderingContext2D, state?: number) => void,
  ) {
    const { matrix, opacity, blend, clips, transforms, paintBlur } = placement;
    const mix = content.stateMix ?? 1;
    if (content.stateFrom === undefined || mix === 1) {
      const ctx = begin(
        dst,
        matrix,
        opacity,
        blend,
        clips,
        transforms,
        paintBlur,
      );
      try {
        draw(ctx, content.state);
      } finally {
        ctx.restore();
      }
      return;
    }
    const tmp = backend.createSurface(dst.width, dst.height, dst.rasterMode);
    try {
      const ctx = tmp.ctx;
      transform(ctx, matrix, transforms);
      // Match the Canvas matrix transfer used when legacy content is isolated.
      ctx.setTransform(ctx.getTransform());
      ctx.globalAlpha = 1 - mix;
      draw(ctx, content.stateFrom);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = mix;
      draw(ctx, content.state);
      backend.composite(
        tmp,
        dst,
        blend,
        opacity,
        [1, 0, 0, 1, 0, 0],
        clips,
        undefined,
        paintBlur,
      );
    } finally {
      backend.releaseSurface(tmp);
    }
  }

  /** Matte value = CSS Masking luminance of the premultiplied colour. */
  function lumaToAlpha(matte: CanvasSurface, mode: TrackMatte["mode"]) {
    const image = matte.ctx.getImageData(0, 0, matte.width, matte.height);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const luma =
        ((0.2125 * px[i]! + 0.7154 * px[i + 1]! + 0.0721 * px[i + 2]!) *
          px[i + 3]!) /
        255;
      px[i] = px[i + 1] = px[i + 2] = 0;
      px[i + 3] = Math.round(mode === "luma" ? luma : 255 - luma);
    }
    matte.ctx.putImageData(image, 0, 0);
  }

  function source(
    asset: string,
    rasterize: ImageContent["rasterize"],
    rasterMode?: "software",
  ) {
    const image = options.images.images.get(asset);
    if (!image)
      throw new Error(`comp-asset-missing: image ${asset} was not loaded`);
    if (rasterize !== "natural-size") return image;
    const key = `${asset}:${rasterMode ?? "default"}`;
    let raster = rasters.get(key);
    if (!raster) {
      // Vector sources rasterise once, so every placement shares the same pixels.
      const [w, h] = options.images.sizes.get(asset)!;
      raster = make(w, h);
      raster
        .getContext("2d", { willReadFrequently: rasterMode === "software" })!
        .drawImage(image, 0, 0, w, h);
      rasters.set(key, raster);
    }
    return raster;
  }

  function drawSource(
    ctx: CanvasRenderingContext2D,
    content: ImageContent,
    index: number,
    rasterMode?: "software",
  ) {
    const variant = content.sources[index];
    if (!variant)
      throw new Error(
        `comp-image-state: no source ${index} on this image layer`,
      );
    const size = options.images.sizes.get(variant.asset)!;
    const crop = variant.crop ?? [0, 0, size[0], size[1]];
    const p = imagePlacement(content, crop, variant.registration?.anchor);
    ctx.save();
    if (content.clip !== false) {
      ctx.beginPath();
      ctx.rect(0, 0, content.width, content.height);
      ctx.clip();
    }
    ctx.drawImage(
      source(variant.asset, content.rasterize, rasterMode),
      p.sx,
      p.sy,
      p.sw,
      p.sh,
      p.x,
      p.y,
      p.width,
      p.height,
    );
    ctx.restore();
  }

  installCanvasLinear(backend, options.colorSpace === "linear-srgb");
  return backend;
}
