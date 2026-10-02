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

export const COMPOSITION_WEBGL_RENDERER_VERSION =
  "composition-webgl2-0.17.0" as const;
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
  const raster = createCanvas2dBackend(options);
  const target = device.surface(canvas.width, canvas.height, false, true, true);
  const gl = device.gl;
  const bounds = new WebglBounds(target);
  const effects = new WebglEffects(device, raster, bounds);
  const images = new WebglImages(device, raster);
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
      ),
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
    new WebglPaint(device, bounds),
    options.contentBounds,
  );
  const isolates = new WebglIsolates(keys, (surface) => {
    bounds.release(surface);
    device.release(surface);
  });

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
  ) {
    if (primitive && mode === "normal") {
      replace(dst, blendShader(mode, true), [src, dst], { opacity });
    } else if (mode === "normal" || mode === "add") {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, mode === "add" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      try {
        device.pass(COPY, dst, [src], { opacity }, true);
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
  ) {
    const pixels = raster.createSurface(dst.width, dst.height);
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
    dst: WebglSurface,
    matrix: Matrix,
    clips: ClipRect[],
    transforms?: Matrix[],
  ) {
    const coverage = device.surface(dst.width, dst.height);
    const pixels = raster.createSurface(dst.width, dst.height);
    const output = device.surface(dst.width, dst.height);
    try {
      raster.fillRect(
        pixels,
        matrix,
        src.width,
        src.height,
        [1, 1, 1, 1],
        1,
        "normal",
        clips,
        transforms,
      );
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
      return output;
    } finally {
      device.release(coverage);
      raster.releaseSurface(pixels);
    }
  }

  const backend: Webgl2Backend = {
    version: COMPOSITION_WEBGL_RENDERER_VERSION,
    frameKey: (root) => keys.of(root),
    beginFrame(root) {
      renderingFrame = true;
      device.setFrameClip(exposure ? undefined : damage.next(root));
    },
    endFrame(completed) {
      renderingFrame = false;
      device.setFrameClip();
      if (!completed) damage.reset();
    },
    renderIsolate: (op, like, draw) => isolates.render(op, like, draw),
    drawVectors: (dst, ops) => bounds.include(dst, vectors.draw(dst, ops)),
    target,
    get allocated() {
      return device.allocated;
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
      );
    },
    // Keep a vector batch together: raster coverage rounds each overlapping fill.
    // Splitting it into separately quantized uploads changes repeated AA edges.
    fillRects(dst, ops) {
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
      if (paintBlur) bounds.full(dst);
      else bounds.draw(dst, matrix, content.width, content.height);
      if (
        !paintBlur &&
        mode === "normal" &&
        images.draw(dst, content, matrix, opacity, clips, transforms)
      )
        return;
      draw(dst, mode, (pixels) =>
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
      );
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
      draw(dst, mode, (pixels) =>
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
      draw(dst, mode, (pixels) =>
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
      );
    },
    composite(src, dst, mode, opacity, matrix, clips, transforms, paintBlur) {
      if (paintBlur) bounds.full(dst);
      else bounds.composite(src, dst, matrix);
      if (paintBlur) {
        const source = placed(src, dst, matrix, [], transforms);
        try {
          effects.blur(source, paintBlur);
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
                clips,
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
      )
        blend(src, dst, mode, opacity);
      else {
        const source = placed(src, dst, matrix, clips, transforms);
        try {
          blend(source, dst, mode, opacity);
        } finally {
          device.release(source);
        }
      }
    },
    applyEffects: (target, stack) => {
      effects.apply(target, stack);
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
          raster.clear(pixels, [1, 1, 1, 1]);
          raster.applyMask(pixels, [
            { ...mask, mode: "intersect", opacity: 1, feather: 0 },
          ]);
          device.upload(coverage, pixels.canvas);
          if (mask.feather > 0)
            effects.blur(
              coverage,
              (mask.feather / 2) *
                Math.sqrt(
                  Math.abs(
                    mask.matrix[0] * mask.matrix[3] -
                      mask.matrix[1] * mask.matrix[2],
                  ),
                ),
            );
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
            { opacity: mask.opacity },
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
      const sum = device.surface(dst.width, dst.height, true);
      let next: WebglSurface | undefined;
      try {
        next = device.surface(dst.width, dst.height, true);
        exposure = true;
        for (let i = 0; i < count; i++) {
          render(i);
          if (i === 0) background = bounds.clearColor(dst);
          else if (background !== bounds.clearColor(dst)) bounds.full(dst);
          bounds.include(dst, painted);
          painted = bounds.snapshot(dst);
          device.pass(
            "void main() { pixel = texture(backdrop,uv) + floor(texture(source,uv)*255.0+0.5); }",
            next,
            [dst, sum],
          );
          device.swap(sum, next);
        }
        device.pass(
          "uniform float count; void main() { pixel = floor(texture(source,uv)/count+0.5)/255.0; }",
          dst,
          [sum],
          { count },
        );
      } finally {
        device.release(sum);
        if (next) device.release(next);
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
      raster.dispose();
      device.dispose();
    },
  };
  return backend;
}
