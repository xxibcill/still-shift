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
  "composition-webgl2-0.1.0" as const;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const COPY =
  "uniform float opacity; void main() { pixel = bytes(texture(source, uv) * opacity); }";
const TRANSFORM = `uniform mat3 inverseTransform;
uniform vec2 size;
uniform vec2 destinationSize;
void main() {
  vec2 point = (inverseTransform * vec3(uv * destinationSize, 1.0)).xy;
  vec2 base = floor(point - 0.5), weight = floor(fract(point - 0.5) * 16.0) / 16.0;
  vec2 lo = clamp(base + 0.5, vec2(0.5), size-0.5);
  vec2 hi = clamp(base + 1.5, vec2(0.5), size-0.5);
  vec4 top = mix(texture(source, lo/size), texture(source, vec2(hi.x,lo.y)/size), weight.x);
  vec4 bottom = mix(texture(source, vec2(lo.x,hi.y)/size), texture(source, hi/size), weight.x);
  vec4 sampled = floor(mix(top,bottom,weight.y)*255.0) / 255.0;
  pixel = bytes(sampled * texture(coverage, uv).a);
}`;

export type Webgl2Backend = RenderBackend<WebglSurface> & {
  readonly target: WebglSurface;
  readonly allocated: number;
  readonly passes: number;
  present(): void;
  dispose(): void;
};

/** Rasterize individual vector/text/image draws; compose GPU surfaces in shaders. */
export function createWebgl2Backend(
  canvas: HTMLCanvasElement,
  options: Canvas2dBackendOptions,
): Webgl2Backend {
  const device = new WebglDevice(canvas);
  const raster = createCanvas2dBackend(options);
  const target = device.surface(canvas.width, canvas.height);
  const gl = device.gl;

  function replace(
    dst: WebglSurface,
    shader: string,
    inputs: WebglSurface[],
    uniforms: Parameters<WebglDevice["pass"]>[3] = {},
  ) {
    const output = device.surface(dst.width, dst.height);
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
  ) {
    if (mode === "normal" || mode === "add") {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, mode === "add" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      try {
        device.pass(COPY, dst, [src], { opacity });
      } finally {
        gl.disable(gl.BLEND);
      }
    } else replace(dst, blendShader(mode), [src, dst], { opacity });
  }

  function draw(
    dst: WebglSurface,
    mode: CompositionBlendMode,
    paint: (surface: CanvasSurface) => void,
  ) {
    const pixels = raster.createSurface(dst.width, dst.height);
    const source = device.surface(dst.width, dst.height);
    try {
      paint(pixels);
      device.upload(source, pixels.canvas);
      blend(source, dst, mode, 1);
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
        destinationSize: [dst.width, dst.height],
      });
      return output;
    } finally {
      device.release(coverage);
      raster.releaseSurface(pixels);
    }
  }

  const backend: Webgl2Backend = {
    version: COMPOSITION_WEBGL_RENDERER_VERSION,
    target,
    get allocated() {
      return device.allocated;
    },
    get passes() {
      return device.passes;
    },
    createSurface: (w, h) => device.surface(w, h),
    releaseSurface: (surface) => device.release(surface),
    clear: (surface, color) => device.clear(surface, color ?? undefined),
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
      draw(dst, mode, (pixels) =>
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
      );
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
      if (paintBlur)
        throw new Error(
          "comp-webgl-effect: surface drawing blur is not implemented",
        );
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
    applyEffects(_target, effects) {
      if (effects.some((effect) => effect.enabled))
        throw new Error(
          "comp-webgl-effect: pixel effect kernels are not implemented",
        );
    },
    applyMask(dst, masks) {
      const coverage = device.surface(dst.width, dst.height);
      const pixels = raster.createSurface(dst.width, dst.height);
      try {
        raster.clear(pixels, [1, 1, 1, 1]);
        raster.applyMask(pixels, masks);
        device.upload(coverage, pixels.canvas);
        replace(
          dst,
          "void main() { pixel = bytes(texture(source,uv) * texture(backdrop,uv).a); }",
          [dst, coverage],
        );
      } finally {
        device.release(coverage);
        raster.releaseSurface(pixels);
      }
    },
    applyMatte(dst, matte, mode) {
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
      replace(
        dst,
        `uniform float opacity;
      void main() { float a = texture(coverage,uv).a * opacity;
        pixel = bytes(texture(source,uv)*a) + bytes(texture(backdrop,uv)*(1.0-a));
      }`,
        [src, dst, coverage],
        { opacity },
      );
    },
    readPixels(surface) {
      const pixels = device.read(surface),
        result = new Uint8ClampedArray(pixels.length);
      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3]!;
        for (let channel = 0; channel < 3; channel++)
          result[i + channel] = a
            ? Math.round((pixels[i + channel]! * 255) / a)
            : 0;
        result[i + 3] = a;
      }
      return result;
    },
    accumulateExposure(dst, count, render) {
      if (count === 1) {
        render(0);
        return;
      }
      const sum = device.surface(dst.width, dst.height, true);
      const next = device.surface(dst.width, dst.height, true);
      try {
        for (let i = 0; i < count; i++) {
          render(i);
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
        device.release(next);
      }
    },
    present: () => device.present(target),
    dispose() {
      raster.dispose();
      device.dispose();
    },
  };
  return backend;
}
