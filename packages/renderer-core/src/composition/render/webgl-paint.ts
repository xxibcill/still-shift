import type { Bounds } from "../evaluate/types.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import { renderMemory } from "../../managed-memory-context.ts";
import type { WebglBounds } from "./webgl-bounds.ts";
import {
  inputSampler,
  type WebglDevice,
  type WebglSurface,
} from "./webgl-device.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

const PAINT = `uniform vec2 origin; uniform vec2 backdropOrigin; uniform vec4 region; uniform float primitive;
void main() {
  vec2 p=gl_FragCoord.xy;
  vec4 s=vec4(0.0);
  if(p.x>=region.x && p.y>=region.y && p.x<region.z && p.y<region.w)
    s=floor(texelFetch(source,ivec2(p-origin),0)*255.0+0.5);
  vec4 d=floor(texelFetch(backdrop,ivec2(p-backdropOrigin),0)*255.0+0.5);
  pixel=(primitive > 0.5 ? s+floor(d*(256.0-s.a)/256.0) : floor(s+d*(1.0-s.a/255.0)+0.5))/255.0;
}`;

export type PreparedPaint = {
  surface: WebglSurface;
  rect: Bounds;
  primitive: boolean;
};

type PaintLifetime = {
  managed: boolean;
  visible?: PreparedPaint[] | undefined;
  batch?: PreparedPaint[] | undefined;
  rects?: Bounds[] | undefined;
  surfaces?: WebglSurface[] | undefined;
  inputs?: WebglSurface[] | undefined;
  uniforms?: Record<string, number | number[]> | undefined;
  declarations?: string[] | undefined;
  operations?: string[] | undefined;
  shader?: string | undefined;
  rect?: Bounds | undefined;
  clip?: Bounds | undefined;
};
function clearPaintLifetime(value: PaintLifetime) {
  if (value.visible) value.visible.length = 0;
  if (value.batch) value.batch.length = 0;
  if (value.rects) value.rects.length = 0;
  if (value.surfaces) value.surfaces.length = 0;
  if (value.inputs) value.inputs.length = 0;
  if (value.declarations) value.declarations.length = 0;
  if (value.operations) value.operations.length = 0;
  if (value.uniforms) {
    for (const name in value.uniforms) {
      const uniform = value.uniforms[name];
      if (Array.isArray(uniform)) uniform.length = 0;
      delete value.uniforms[name];
    }
  }
  value.visible = value.batch = undefined;
  value.rects = value.surfaces = value.inputs = undefined;
  value.declarations = value.operations = undefined;
  value.uniforms = value.shader = value.rect = value.clip = undefined;
}
function paintLifetime(bytes: number) {
  return allocateRenderMetadata<PaintLifetime>(
    bytes,
    () => ({ managed: renderMemory() !== undefined }),
    false,
    clearPaintLifetime,
  );
}
function releasePaintLifetime(value: PaintLifetime) {
  if (value.managed) releaseRenderMetadata(value);
  else clearPaintLifetime(value);
}
function consumePaint(action: () => void, cleanup: () => void) {
  let cleaned = false;
  try {
    action();
  } catch (error) {
    cleaned = true;
    try {
      cleanup();
    } catch {
      /* Preserve the original paint/native failure. */
    }
    throw error;
  } finally {
    if (!cleaned) cleanup();
  }
}

function batchShader(count: number, phase: PaintLifetime) {
  const declarations = (phase.declarations = [] as string[]),
    operations = (phase.operations = [] as string[]);
  for (let i = 0; i < count; i++) {
    const sampler = inputSampler(i + 1);
    if (i + 1 >= 3) declarations.push(`uniform sampler2D ${sampler};`);
    declarations.push(`uniform vec4 region${i}; uniform float primitive${i};`);
    operations.push(`if (all(greaterThanEqual(p,region${i}.xy)) && all(lessThan(p,region${i}.zw))) {
      vec4 s=floor(texelFetch(${sampler},ivec2(p-region${i}.xy),0)*255.0+0.5);
      d=primitive${i}>0.5 ? s+floor(d*(256.0-s.a)/256.0) : floor(s+d*(1.0-s.a/255.0)+0.5);
    }`);
  }
  return `${declarations.join("\n")}
    uniform vec2 backdropOrigin;
    void main() {
      vec2 p=gl_FragCoord.xy;
      vec4 d=floor(texelFetch(source,ivec2(p-backdropOrigin),0)*255.0+0.5);
      ${operations.join("\n")}
      pixel=d/255.0;
    }`;
}

/** Compose prepared primitive bytes with Canvas's integer source-over rounding. */
export class WebglPaint {
  constructor(
    private device: WebglDevice,
    private bounds: WebglBounds,
  ) {}
  hasBackdrop(dst: WebglSurface) {
    return dst.opaque || this.bounds.snapshot(dst) !== null;
  }

  /** WebGL2 guarantees 16 fragment samplers; one holds the original backdrop. */
  drawMany(parts: PreparedPaint[], dst: WebglSurface) {
    // Holder/filter/array controls 1024 plus actual filtered pointer capacity.
    const visibility = paintLifetime(1024 + 8 * parts.length);
    try {
      const visible = (visibility.visible = parts.filter((part) =>
        this.device.drawRegion(dst, part.rect),
      ));
      for (let start = 0; start < visible.length; start += 15) {
        // Actual batch/geometry/input/uniform/callback controls 2048; 4096 per
        // original part covers text fragments/joins and numeric/key/container slots.
        const phase = paintLifetime(
          2048 + 4096 * Math.min(15, visible.length - start),
        );
        try {
          const batch = (phase.batch = visible.slice(start, start + 15));
          if (batch.length === 1) {
            const part = batch[0]!;
            this.draw(part.surface, dst, part.rect, part.primitive);
            continue;
          }
          const rect = (phase.rect = (phase.rects = batch.map(
            (part) => part.rect,
          )).reduce(unionBounds));
          const active = this.device.drawRegion(dst, rect)!;
          const previous = this.bounds.snapshot(dst);
          const backdrop = dst.screen
            ? this.device.copyRegion(dst, active)
            : dst;
          const output = dst.screen
            ? dst
            : this.device.surface(dst.width, dst.height, false, dst.opaque);
          consumePaint(
            () => {
              const uniforms = (phase.uniforms = {
                backdropOrigin: dst.screen ? [active.left, active.top] : [0, 0],
              } as Record<string, number | number[]>);
              for (const [i, part] of batch.entries()) {
                uniforms[`region${i}`] = [
                  part.rect.left,
                  part.rect.top,
                  part.rect.right,
                  part.rect.bottom,
                ];
                uniforms[`primitive${i}`] = part.primitive ? 1 : 0;
              }
              this.device.pass(
                (phase.shader = batchShader(batch.length, phase)),
                output,
                (phase.inputs = [
                  backdrop,
                  ...(phase.surfaces = batch.map((part) => part.surface)),
                ]),
                uniforms,
                false,
                (phase.clip = dst.screen
                  ? active
                  : previous
                    ? unionBounds(previous, rect)
                    : rect),
              );
              if (!dst.screen) this.device.swap(dst, output);
              this.bounds.include(dst, rect);
            },
            () => {
              if (dst.screen) this.device.release(backdrop);
              else this.device.release(output);
            },
          );
        } finally {
          releasePaintLifetime(phase);
        }
      }
    } finally {
      releasePaintLifetime(visibility);
    }
  }

  draw(
    source: WebglSurface,
    dst: WebglSurface,
    rect: Bounds,
    primitive = true,
    bitmapRounding = false,
  ) {
    const active = this.device.drawRegion(dst, rect);
    if (!active) return;
    // Holder/array/uniform/value/union-box and original/native cleanup controls.
    const phase = paintLifetime(1536);
    try {
      if (!primitive && !dst.floating && !bitmapRounding) {
        const gl = this.device.gl;
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        consumePaint(
          () => {
            this.device.pass(
              `uniform vec2 origin; void main() {
            pixel=texelFetch(source,ivec2(gl_FragCoord.xy-origin),0);
          }`,
              dst,
              (phase.inputs = [source]),
              (phase.uniforms = { origin: [rect.left, rect.top] }),
              true,
              active,
            );
            this.bounds.include(dst, rect);
          },
          () => {
            gl.disable(gl.BLEND);
          },
        );
        return;
      }
      const previous = this.bounds.snapshot(dst);
      const backdrop = dst.screen ? this.device.copyRegion(dst, active) : dst;
      const output = dst.screen
        ? dst
        : this.device.surface(dst.width, dst.height, false, dst.opaque);
      consumePaint(
        () => {
          this.device.pass(
            PAINT,
            output,
            (phase.inputs = [source, backdrop]),
            (phase.uniforms = {
              origin: [rect.left, rect.top],
              backdropOrigin: dst.screen ? [active.left, active.top] : [0, 0],
              region: [rect.left, rect.top, rect.right, rect.bottom],
              primitive: primitive && !bitmapRounding ? 1 : 0,
            }),
            false,
            (phase.clip = dst.screen
              ? active
              : previous
                ? unionBounds(previous, rect)
                : rect),
          );
          if (!dst.screen) this.device.swap(dst, output);
          this.bounds.include(dst, rect);
        },
        () => {
          if (dst.screen) this.device.release(backdrop);
          else this.device.release(output);
        },
      );
    } finally {
      releasePaintLifetime(phase);
    }
  }
}
