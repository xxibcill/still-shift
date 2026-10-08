import {
  linearBlendShader,
  linearShaderControls,
  linearTransferBytes,
  LINEAR_LERP_SHADER,
} from "./linear-color.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  PROJECTIVE_SHADER,
  PROJECTIVE_CLIP_SHADER,
  projectionUniforms,
} from "./webgl-projective.ts";
import { blurPadding } from "./webgl-blur-padding.ts";
import { accumulateWebglExposure } from "./webgl-exposure.ts";
import { blurKernelLength } from "./webgl-blur-kernel.ts";
import { WebglPaint } from "./webgl-paint.ts";
import { WebglDamage } from "./webgl-damage.ts";
import { WebglReadback } from "./webgl-readback.ts";
import { WebglVisualKey, type PreparedContentKey } from "./webgl-visual-key.ts";
import { WebglIsolates } from "./webgl-isolates.ts";
import { WebglVectors } from "./webgl-vectors.ts";
import type { Bounds } from "../evaluate/types.ts";
import type { ProviderContent, TextContent } from "./graph.ts";
import { WebglBounds } from "./webgl-bounds.ts";
import { WebglImages } from "./webgl-images.ts";
import { WebglDepthImages } from "./webgl-depth-image.ts";
import { WebglPngImages } from "./webgl-png-images.ts";
import { WebglEffects } from "./webgl-effects.ts";
import type { CompositionBlendMode } from "@still-shift/scene-contract";
import type { Matrix } from "../../node-transform.ts";
import type { RenderBackend } from "./backend.ts";
import {
  createCanvas2dBackend,
  type Canvas2dBackendOptions,
  type CanvasSurface,
} from "./canvas2d.ts";
import type { ClipRect } from "./graph.ts";
import { WebglDevice, type WebglSurface } from "./webgl-device.ts";
import { blendShader } from "./webgl-blend.ts";
import { FLAT_LIGHTING_SHADER, flatLightingUniforms } from "./flat-lighting.ts";

export const COMPOSITION_WEBGL_RENDERER_VERSION =
  "composition-webgl2-0.65.2" as const;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const COPY =
  "uniform float opacity; void main() { pixel = floor(floor(texture(source, uv) * 255.0 + 0.5) * (floor(opacity * 255.0 + 0.5) + 1.0) / 256.0) / 255.0; }";
const TRANSFORM = `uniform mat3 inverseTransform;
uniform vec2 size;
vec4 colorAt(vec2 point) { return floor(texture(source,point)*255.0+0.5); }
void main() {
  vec2 point = (inverseTransform * vec3(gl_FragCoord.xy, 1.0)).xy;
  vec2 base = floor(point - 0.5), weight = floor(fract(point - 0.5) * 16.0) / 16.0;
  vec2 lo = clamp(base + 0.5, vec2(0.5), size-0.5);
  vec2 hi = clamp(base + 1.5, vec2(0.5), size-0.5);
  vec4 top = mix(colorAt(lo/size), colorAt(vec2(hi.x,lo.y)/size), weight.x);
  vec4 bottom = mix(colorAt(vec2(lo.x,hi.y)/size), colorAt(hi/size), weight.x);
  vec4 sampled = floor(mix(top,bottom,weight.y)) / 255.0;
  pixel = bytes(sampled * texture(coverage, uv).a);
}`;

export type Webgl2Backend = RenderBackend<WebglSurface> & {
  readonly target: WebglSurface;
  readonly allocated: number;
  readonly passes: number;
  present(): void;
  dispose(): void;
};

export type Webgl2BackendOptions = Canvas2dBackendOptions & {
  boundedCanvas?: (content: ProviderContent | TextContent) => boolean;
  singleImage?: (content: ProviderContent | TextContent) => boolean;
  stableImages?: (content: ProviderContent | TextContent) => boolean;
  contentKey?: PreparedContentKey;
  contentBounds?: (
    content: ProviderContent | TextContent,
  ) => Bounds | undefined;
};

/** Rasterize vector batches and prepared content; compose GPU surfaces in shaders. */
export function createWebgl2Backend(
  canvas: HTMLCanvasElement,
  options: Webgl2BackendOptions,
): Webgl2Backend {
  const device = new WebglDevice(canvas);
  const raster = createCanvas2dBackend({
    ...options,
    colorSpace: "srgb",
    poolByteLimit: 128 * 1024 * 1024,
  });
  const target = device.surface(canvas.width, canvas.height, false, true, true);
  const gl = device.gl;
  const bounds = new WebglBounds(target);
  const effects = new WebglEffects(device, raster, bounds);
  const paint = new WebglPaint(device, bounds);
  const images = new WebglImages(
    device,
    raster,
    paint,
    options.images.pngImages,
  );
  const depthImages = new WebglDepthImages(device, options.images);
  const pngImages = new WebglPngImages(device, raster, options.images);
  const keys = new WebglVisualKey(options.contentKey);
  const damage = new WebglDamage(keys, options.contentBounds);
  const readback = new WebglReadback(
    target.width,
    target.height,
    () => readSurface(target),
    (rect) =>
      device.readRegion(
        target,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
        "native",
      ),
    undefined,
    "bottom-up",
  );
  let renderingFrame = false,
    exposure = false;
  device.onScreenChange = (region) => {
    readback.changed(region);
    if (!renderingFrame) damage.reset();
  };
  const vectors = new WebglVectors(
    device,
    raster,
    keys,
    paint,
    options.contentBounds,
    options.singleImage,
    options.stableImages,
    options.boundedCanvas,
  );
  const isolates = new WebglIsolates(keys, (surface) => {
    bounds.release(surface);
    device.release(surface);
  });

  let linear = options.colorSpace === "linear-srgb";
  let transfer: WebglSurface | undefined;
  function transferSurface() {
    if (!transfer) {
      const table = device.surface(256, 256);
      try {
        device.uploadBytes(table, linearTransferBytes());
        transfer = table;
      } catch (error) {
        device.release(table);
        throw error;
      }
    }
    return transfer;
  }

  function readSurface(surface: WebglSurface) {
    const region = bounds.read(device, surface);
    if (region) return region;
    const pixels = device.read(surface);
    if (surface.opaque) return new Uint8ClampedArray(pixels.buffer);
    const result = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3]!;
      for (let channel = 0; channel < 3; channel++)
        result[i + channel] = a
          ? Math.round((pixels[i + channel]! * 255) / a)
          : 0;
      result[i + 3] = a;
    }
    return result;
  }

  function replace(
    dst: WebglSurface,
    shader: string,
    inputs: WebglSurface[],
    uniforms: Parameters<WebglDevice["pass"]>[3] = {},
  ) {
    if (dst.screen) {
      device.pass(shader, dst, inputs, uniforms);
      return;
    }
    const output = device.surface(dst.width, dst.height, false, dst.opaque);
    try {
      device.pass(shader, output, inputs, uniforms);
      device.swap(dst, output);
    } finally {
      device.release(output);
    }
  }

  function blend(
    src: WebglSurface,
    dst: WebglSurface,
    mode: CompositionBlendMode,
    opacity: number,
    primitive = false,
    painted?: Bounds,
  ) {
    if (linear) {
      replace(dst, linearBlendShader(mode), [src, dst, transferSurface()], {
        opacity,
      });
    } else if (primitive && mode === "normal") {
      replace(dst, blendShader(mode, true), [src, dst], { opacity });
    } else if (mode === "normal" || mode === "add") {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, mode === "add" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      try {
        // Transparent source texels leave fixed-function source-over and
        // additive results equal to the stored destination bytes.
        device.pass(COPY, dst, [src], { opacity }, true, painted);
      } finally {
        gl.disable(gl.BLEND);
      }
    } else replace(dst, blendShader(mode), [src, dst], { opacity });
  }

  function draw(
    dst: WebglSurface,
    mode: CompositionBlendMode,
    paint: (surface: CanvasSurface) => void,
    primitive = false,
    paintBlur = 0,
    software = false,
  ) {
    const pixels = raster.createSurface(
      dst.width,
      dst.height,
      paintBlur || software ? "software" : undefined,
    );
    const source = device.surface(dst.width, dst.height);
    try {
      paint(pixels);
      device.upload(source, pixels.canvas);
      blend(source, dst, mode, 1, primitive);
    } finally {
      raster.releaseSurface(pixels);
      device.release(source);
    }
  }

  function placed(
    src: WebglSurface,
    dst: Pick<WebglSurface, "width" | "height">,
    matrix: Matrix,
    clips: ClipRect[],
    transforms?: Matrix[],
    localRasterCoverage = false,
  ) {
    const coverage = device.surface(dst.width, dst.height);
    const pixels = raster.createSurface(
      dst.width,
      dst.height,
      localRasterCoverage ? "software" : undefined,
    );
    const output = device.surface(dst.width, dst.height);
    try {
      const affineClips = clips.filter(
        (clip) => !clip.projection || clip.projection.affineMatrix,
      );
      if (localRasterCoverage) {
        const local = raster.createSurface(src.width, src.height, "software");
        try {
          raster.clear(local, [1, 1, 1, 1]);
          raster.composite(
            local,
            pixels,
            "normal",
            1,
            matrix,
            affineClips,
            transforms,
          );
        } finally {
          raster.releaseSurface(local);
        }
      } else {
        raster.fillRect(
          pixels,
          matrix,
          src.width,
          src.height,
          [1, 1, 1, 1],
          1,
          "normal",
          affineClips,
          transforms,
        );
      }
      device.upload(coverage, pixels.canvas);
      const transform = new DOMMatrix();
      if (transforms)
        for (const local of transforms)
          transform.multiplySelf(new DOMMatrix(local));
      else transform.multiplySelf(new DOMMatrix(matrix));
      const inverse = transform.inverse();
      if (
        ![
          inverse.a,
          inverse.b,
          inverse.c,
          inverse.d,
          inverse.e,
          inverse.f,
        ].every(Number.isFinite)
      )
        return output;
      device.pass(TRANSFORM, output, [src, src, coverage], {
        inverseTransform: [
          inverse.a,
          inverse.b,
          0,
          inverse.c,
          inverse.d,
          0,
          inverse.e,
          inverse.f,
          1,
        ],
        size: [src.width, src.height],
      });
      projectiveClips(output, clips);
      return output;
    } finally {
      device.release(coverage);
      raster.releaseSurface(pixels);
    }
  }

  function projectiveClips(surface: WebglSurface, clips: ClipRect[]) {
    for (const clip of clips)
      if (clip.projection && !clip.projection.affineMatrix)
        replace(
          surface,
          PROJECTIVE_CLIP_SHADER,
          [surface],
          projectionUniforms(clip.projection, clip.width, clip.height),
        );
  }

  function blurredPlacement(
    src: WebglSurface,
    dst: WebglSurface,
    matrix: Matrix,
    transforms: Matrix[] | undefined,
    sigma: number,
  ) {
    const transform = new DOMMatrix();
    if (transforms)
      for (const local of transforms)
        transform.multiplySelf(new DOMMatrix(local));
    else transform.multiplySelf(new DOMMatrix(matrix));
    const corners = [
      [0, 0],
      [src.width, 0],
      [0, src.height],
      [src.width, src.height],
    ].map(([x, y]) => transform.transformPoint(new DOMPoint(x, y)));
    const padding = blurPadding(
      dst.width,
      dst.height,
      {
        left: Math.min(...corners.map((p) => p.x)),
        top: Math.min(...corners.map((p) => p.y)),
        right: Math.max(...corners.map((p) => p.x)),
        bottom: Math.max(...corners.map((p) => p.y)),
      },
      Math.ceil((blurKernelLength(sigma) - 1) / 2) + 1,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    );
    const shift: Matrix = [1, 0, 0, 1, padding.left, padding.top];
    const chain = [shift, ...(transforms ?? [matrix])];
    const shifted: Matrix = [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[3],
      matrix[4] + padding.left,
      matrix[5] + padding.top,
    ];
    const padded = padding.width !== dst.width || padding.height !== dst.height;
    const source = padded
      ? placed(src, padding, shifted, [], chain)
      : placed(src, dst, matrix, [], transforms);
    let transferred = false;
    try {
      effects.blur(source, sigma);
      if (!padded) {
        transferred = true;
        return source;
      }
      const output = device.surface(dst.width, dst.height);
      try {
        device.pass(
          "uniform vec2 offset; void main(){pixel=texelFetch(source,ivec2(gl_FragCoord.xy)+ivec2(offset),0);}",
          output,
          [source],
          { offset: [padding.left, padding.top] },
        );
        return output;
      } catch (error) {
        device.release(output);
        throw error;
      }
    } finally {
      if (!transferred) device.release(source);
    }
  }

  const backend: Webgl2Backend = {
    version: COMPOSITION_WEBGL_RENDERER_VERSION,
    frameKey: (root) => keys.of(root),
    beginFrame(root) {
      const next = (root.colorSpace ?? options.colorSpace) === "linear-srgb";
      if (next !== linear) {
        isolates.dispose();
        damage.reset();
      }
      linear = next;
      renderingFrame = true;
      device.setFrameClip(exposure ? undefined : damage.next(root));
    },
    endFrame(completed) {
      renderingFrame = false;
      device.setFrameClip();
      if (!completed) damage.reset();
    },
    renderIsolate: (op, like, draw) => isolates.render(op, like, draw),
    drawVectors: (dst, ops) => {
      if (!linear) {
        bounds.include(dst, vectors.draw(dst, ops));
        return;
      }
      for (const op of ops) {
        const content = op.content;
        if (content.type === "solid")
          backend.fillRect(
            dst,
            op.matrix,
            content.width,
            content.height,
            content.color,
            op.opacity,
            op.blend,
            op.clips,
            op.transforms,
            op.paintBlur,
          );
        else if (content.type === "text")
          backend.drawText(
            dst,
            content,
            op.matrix,
            op.opacity,
            op.blend,
            op.clips,
            op.transforms,
            op.paintBlur,
          );
        else if (content.type === "shape")
          backend.drawShape(
            dst,
            content,
            op.matrix,
            op.opacity,
            op.blend,
            op.clips,
            op.transforms,
            op.paintBlur,
          );
        else
          backend.drawProvider(
            dst,
            content,
            op.matrix,
            op.opacity,
            op.blend,
            op.clips,
            op.transforms,
            op.paintBlur,
          );
      }
    },
    target,
    get allocated() {
      return device.allocated + depthImages.allocated;
    },
    get passes() {
      return device.passes;
    },
    createSurface: (w, h) => {
      const surface = device.surface(w, h);
      bounds.clear(surface, null);
      return surface;
    },
    releaseSurface: (surface) => {
      if (isolates.release(surface)) return;
      bounds.release(surface);
      device.release(surface);
    },
    clear: (surface, color) => {
      bounds.clear(surface, color);
      device.clear(surface, color ?? undefined);
    },
    fillRect(
      dst,
      matrix,
      width,
      height,
      color,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      if (paintBlur) bounds.full(dst);
      else bounds.draw(dst, matrix, width, height);
      draw(
        dst,
        mode,
        (pixels) =>
          raster.fillRect(
            pixels,
            matrix,
            width,
            height,
            color,
            opacity,
            "normal",
            clips,
            transforms,
            paintBlur,
          ),
        !paintBlur,
        paintBlur,
      );
    },
    // Keep a vector batch together: raster coverage rounds each overlapping fill.
    // Splitting it into separately quantized uploads changes repeated AA edges.
    fillRects(dst, ops) {
      if (linear) {
        for (const op of ops)
          backend.fillRect(
            dst,
            op.matrix,
            op.content.width,
            op.content.height,
            op.content.color,
            op.opacity,
            op.blend,
            op.clips,
            op.transforms,
            op.paintBlur,
          );
        return;
      }
      for (const op of ops)
        bounds.draw(dst, op.matrix, op.content.width, op.content.height);
      draw(dst, "normal", (pixels) => raster.fillRects!(pixels, ops));
    },
    drawImage(
      dst,
      content,
      matrix,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      if (content.plane) {
        const source = depthImages.draw(content);
        bounds.full(source);
        try {
          backend.composite(
            source,
            dst,
            mode,
            opacity,
            matrix,
            clips,
            transforms,
            paintBlur,
          );
        } finally {
          bounds.release(source);
          device.release(source);
        }
        return;
      }
      if (paintBlur) bounds.full(dst);
      else bounds.draw(dst, matrix, content.width, content.height);
      if (
        !linear &&
        !paintBlur &&
        mode === "normal" &&
        (pngImages.draw(dst, content, matrix, opacity, clips, transforms) ||
          images.draw(dst, content, matrix, opacity, clips, transforms))
      )
        return;
      draw(
        dst,
        mode,
        (pixels) =>
          raster.drawImage(
            pixels,
            content,
            matrix,
            opacity,
            "normal",
            clips,
            transforms,
            paintBlur,
          ),
        false,
        paintBlur,
      );
    },
    drawDepthImage(
      dst,
      content,
      matrix,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      const source = depthImages.draw(content);
      bounds.full(source);
      try {
        backend.composite(
          source,
          dst,
          mode,
          opacity,
          matrix,
          clips,
          transforms,
          paintBlur,
        );
      } finally {
        bounds.release(source);
        device.release(source);
      }
    },
    drawText(
      dst,
      content,
      matrix,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      const rect = options.contentBounds?.(content);
      if (paintBlur || !rect) bounds.full(dst);
      else bounds.transform(dst, rect, matrix);
      draw(
        dst,
        mode,
        (pixels) =>
          raster.drawText(
            pixels,
            content,
            matrix,
            opacity,
            "normal",
            clips,
            transforms,
            paintBlur,
          ),
        false,
        paintBlur,
      );
    },
    drawShape(
      dst,
      content,
      matrix,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      const rect = content.shapes.bounds;
      if (paintBlur || !rect) bounds.full(dst);
      else bounds.transform(dst, rect, matrix);
      draw(
        dst,
        mode,
        (pixels) =>
          raster.drawShape(
            pixels,
            content,
            matrix,
            opacity,
            "normal",
            clips,
            transforms,
            paintBlur,
          ),
        false,
        paintBlur,
        true,
      );
    },
    drawProvider(
      dst,
      content,
      matrix,
      opacity,
      mode,
      clips,
      transforms,
      paintBlur,
    ) {
      const rect = options.contentBounds?.(content);
      if (paintBlur || !rect) bounds.full(dst);
      else bounds.transform(dst, rect, matrix);
      draw(
        dst,
        mode,
        (pixels) =>
          raster.drawProvider(
            pixels,
            content,
            matrix,
            opacity,
            "normal",
            clips,
            transforms,
            paintBlur,
          ),
        false,
        paintBlur,
      );
    },
    composite(src, dst, mode, opacity, matrix, clips, transforms, paintBlur) {
      if (paintBlur) bounds.full(dst);
      else bounds.composite(src, dst, matrix);
      if (paintBlur) {
        const source = blurredPlacement(
          src,
          dst,
          matrix,
          transforms,
          paintBlur,
        );
        try {
          if (clips.length) {
            const pixels = raster.createSurface(dst.width, dst.height);
            const coverage = device.surface(dst.width, dst.height);
            try {
              raster.fillRect(
                pixels,
                IDENTITY,
                dst.width,
                dst.height,
                [1, 1, 1, 1],
                1,
                "normal",
                clips.filter(
                  (clip) => !clip.projection || clip.projection.affineMatrix,
                ),
              );
              device.upload(coverage, pixels.canvas);
              replace(
                source,
                "void main() {pixel=bytes(texture(source,uv)*texture(backdrop,uv).a);}",
                [source, coverage],
              );
            } finally {
              raster.releaseSurface(pixels);
              device.release(coverage);
            }
          }
          projectiveClips(source, clips);
          blend(source, dst, mode, opacity);
        } finally {
          device.release(source);
        }
        return;
      }
      if (
        src.width === dst.width &&
        src.height === dst.height &&
        !clips.length &&
        matrix.every((v, i) => v === IDENTITY[i])
      ) {
        // Conservative painted bounds: nothing outside them is drawn.
        const painted = bounds.region(src);
        if (painted === null && (mode === "normal" || mode === "add")) return;
        blend(src, dst, mode, opacity, false, painted ?? undefined);
      } else {
        const source = placed(src, dst, matrix, clips, transforms);
        try {
          blend(source, dst, mode, opacity);
        } finally {
          device.release(source);
        }
      }
    },
    validateSpatialSurface(width, height, node) {
      const maximum = device.gl.getParameter(
        device.gl.MAX_TEXTURE_SIZE,
      ) as number;
      if (width > maximum || height > maximum)
        passageError(
          "comp-feature-backend",
          `The local projected surface exceeds this WebGL2 device's ${maximum}-pixel texture limit`,
          { node },
        );
    },
    project(src, dst, placement) {
      if (placement.affineMatrix) {
        const source = placed(
          src,
          dst,
          placement.affineMatrix,
          [],
          undefined,
          true,
        );
        try {
          blend(source, dst, "normal", 1);
        } finally {
          device.release(source);
        }
      } else
        device.pass(
          PROJECTIVE_SHADER,
          dst,
          [src],
          projectionUniforms(placement, src.width, src.height),
        );
      if (placement.bounds)
        bounds.include(dst, {
          left: placement.bounds.left - 2,
          top: placement.bounds.top - 2,
          right: placement.bounds.right + 2,
          bottom: placement.bounds.bottom + 2,
        });
      else bounds.full(dst);
    },
    applyProjectiveClips: projectiveClips,
    applyLighting: (target, lighting) => {
      replace(
        target,
        FLAT_LIGHTING_SHADER,
        [target],
        flatLightingUniforms(lighting),
      );
    },
    applyEffects: (target, stack, layers) => {
      effects.apply(target, stack, layers);
    },
    applyMask(dst, masks) {
      if (dst.opaque) bounds.full(dst);
      const combined = device.surface(dst.width, dst.height);
      const coverage = device.surface(dst.width, dst.height);
      const pixels = raster.createSurface(dst.width, dst.height);
      try {
        if (masks[0]?.mode === "subtract" || masks[0]?.mode === "intersect")
          device.clear(combined, [1, 1, 1, 1]);
        for (const mask of masks) {
          let bakedOpacity = false;
          if (mask.projected) {
            const local = device.surface(
              mask.projected.width,
              mask.projected.height,
            );
            let rasterMask: CanvasSurface | undefined;
            try {
              rasterMask = raster.createSurface(
                mask.projected.width,
                mask.projected.height,
              );
              raster.clear(rasterMask, [1, 1, 1, 1]);
              raster.applyMask(rasterMask, [
                {
                  ...mask,
                  mode: "intersect",
                  inverted: false,
                  opacity: 1,
                  feather: 0,
                },
              ]);
              device.upload(local, rasterMask.canvas);
              if (mask.feather > 0) effects.blur(local, mask.feather / 2);
              device.clear(coverage);
              if (mask.projected.placement)
                backend.project!(local, coverage, mask.projected.placement);
              if (mask.inverted)
                replace(
                  coverage,
                  "void main(){float alpha=1.0-texture(source,uv).a;pixel=bytes(vec4(alpha));}",
                  [coverage],
                );
            } finally {
              if (rasterMask) raster.releaseSurface(rasterMask);
              device.release(local);
            }
          } else {
            const sigma =
              (mask.feather / 2) *
              Math.sqrt(
                Math.abs(
                  mask.matrix[0] * mask.matrix[3] -
                    mask.matrix[1] * mask.matrix[2],
                ),
              );
            // Preserve the raster filter's combined opacity/blur rounding when a
            // transformed feather enters the rescaled Gaussian domain.
            bakedOpacity = sigma > 135;
            raster.clear(pixels, [1, 1, 1, 1]);
            raster.applyMask(pixels, [
              {
                ...mask,
                mode: "intersect",
                opacity: bakedOpacity ? mask.opacity : 1,
                feather: 0,
              },
            ]);
            device.upload(coverage, pixels.canvas);
            if (mask.feather > 0) effects.blur(coverage, sigma);
          }
          const formula =
            mask.mode === "add"
              ? "s+d*(1.0-s.a)"
              : mask.mode === "subtract"
                ? "d*(1.0-s.a)"
                : mask.mode === "intersect"
                  ? "d*s.a"
                  : "s*(1.0-d.a)+d*(1.0-s.a)";
          replace(
            combined,
            `uniform float opacity; void main() {vec4 s=bytes(texture(source,uv)*opacity),d=texture(backdrop,uv);pixel=bytes(${formula});}`,
            [coverage, combined],
            { opacity: bakedOpacity ? 1 : mask.opacity },
          );
        }
        replace(
          dst,
          "void main() { pixel=bytes(texture(source,uv)*texture(backdrop,uv).a); }",
          [dst, combined],
        );
      } finally {
        device.release(combined);
        device.release(coverage);
        raster.releaseSurface(pixels);
      }
    },
    applyMatte(dst, matte, mode) {
      if (dst.opaque) bounds.full(dst);
      const luma = mode === "luma" || mode === "luma-inverted";
      const inverted = mode === "alpha-inverted" || mode === "luma-inverted";
      replace(
        dst,
        `void main() {
        vec4 m = texture(backdrop,uv);
        float a = ${luma ? "floor(dot(m.a > 0.0 ? bytes(vec4(m.rgb/m.a, 1.0)).rgb : vec3(0.0), vec3(0.2125,0.7154,0.0721)) * m.a * 255.0 + 0.5) / 255.0" : "m.a"};
        pixel = bytes(texture(source,uv) * ${inverted ? "(1.0-a)" : "a"});
      }`,
        [dst, matte],
      );
    },
    lerp(dst, src, coverage, opacity) {
      bounds.include(dst, bounds.snapshot(src));
      if (linear) {
        replace(
          dst,
          LINEAR_LERP_SHADER,
          [src, dst, coverage, transferSurface()],
          { opacity },
        );
        return;
      }
      replace(
        dst,
        `uniform float opacity;
      void main() { float a = floor(floor(texture(coverage,uv).a * 255.0 + 0.5) * (floor(opacity * 255.0 + 0.5) + 1.0) / 256.0) / 255.0;
        pixel = bytes(texture(source,uv)*a) + bytes(texture(backdrop,uv)*(1.0-a));
      }`,
        [src, dst, coverage],
        { opacity },
      );
    },
    readPixels: (surface) =>
      surface === target ? readback.read() : readSurface(surface),
    accumulateExposure(dst, count, render) {
      if (count === 1) {
        render(0);
        return;
      }
      damage.reset();
      device.setFrameClip();
      let painted: ReturnType<WebglBounds["snapshot"]> = null;
      let background: number | undefined;
      try {
        exposure = true;
        const renderSample = (i: number) => {
          render(i);
          if (i === 0) background = bounds.clearColor(dst);
          else if (background !== bounds.clearColor(dst)) bounds.full(dst);
          bounds.include(dst, painted);
          painted = bounds.snapshot(dst);
          return { background: bounds.exactClearColor(dst), painted };
        };
        if (!linear) {
          accumulateWebglExposure(device, dst, count, renderSample);
        } else {
          const sum = device.surface(dst.width, dst.height, true);
          let next: WebglSurface | undefined;
          try {
            next = device.surface(dst.width, dst.height, true);
            for (let i = 0; i < count; i++) {
              renderSample(i);
              device.pass(
                `${linearShaderControls()} void main(){pixel=texture(backdrop,uv)+vec4(linearWords(stored(texture(source,uv))));}`,
                next,
                [dst, sum, transferSurface()],
              );
              device.swap(sum, next);
            }
            device.pass(
              `${linearShaderControls("backdrop")} uniform float count; void main(){uvec4 sums=uvec4(texture(source,uv)),words=uvec4(0u);for(int c=0;c<4;c++)words[c]=roundedDivide(sums[c],uint(count));pixel=vec4(encodedWords(words))/255.0;}`,
              dst,
              [sum, transferSurface()],
              { count },
            );
          } finally {
            device.release(sum);
            if (next) device.release(next);
          }
        }
      } finally {
        exposure = false;
        damage.reset();
        device.setFrameClip();
      }
    },
    present: () => device.present(target),
    dispose() {
      damage.reset();
      readback.dispose();
      isolates.dispose();
      vectors.dispose();
      pngImages.dispose();
      depthImages.dispose();
      raster.dispose();
      device.dispose();
    },
  };
  return backend;
}
