import {
  allocateRenderPixels,
  readRenderImageData,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import { imagePlacement, type Matrix } from "../../node-transform.ts";
import type { Canvas2dBackend, CanvasImageResources } from "./canvas2d.ts";
import type { ClipRect, ImageContent } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

const LIMIT = 128 * 1024 * 1024;
const f = Math.fround;
const SHADER = `uniform vec2 imageSize; uniform vec4 edges; uniform float opacity;
void main() {
  ivec2 pos=ivec2(gl_FragCoord.xy);
  vec2 position=vec2(pos)+0.5;
  if(any(lessThanEqual(position,edges.xy)) || any(greaterThan(position,edges.zw))) {
    pixel=vec4(0.0); return;
  }
  vec2 q=vec2(texelFetch(backdrop,ivec2(pos.x,0),0).r,texelFetch(backdrop,ivec2(pos.y,0),0).g);
  vec2 lo=floor(q/16.0), weight=q-lo*16.0;
  vec4 value=floor(texture(source,(lo+0.5+weight/16.0)/imageSize)*255.0+0.001);
  pixel=floor(value*(floor(opacity*255.0+0.5)+1.0)/256.0)/255.0;
}`;

type PngDrawLifetime = {
  managed: boolean;
  fallback?: Matrix[] | undefined;
  bounds?: [number, number, number, number] | undefined;
  placement?: ReturnType<typeof imagePlacement> | undefined;
  rect?:
    | { left: number; top: number; right: number; bottom: number }
    | undefined;
  inputs?: WebglSurface[] | undefined;
  imageSize?: number[] | undefined;
  edges?: number[] | undefined;
  uniforms?: Record<string, number | number[]> | undefined;
};
function clearPngDraw(value: PngDrawLifetime) {
  if (value.fallback) value.fallback.length = 0;
  if (value.bounds) (value.bounds as number[]).length = 0;
  if (value.inputs) value.inputs.length = 0;
  if (value.imageSize) value.imageSize.length = 0;
  if (value.edges) value.edges.length = 0;
  if (value.placement)
    for (const name in value.placement)
      delete (value.placement as Partial<ReturnType<typeof imagePlacement>>)[
        name as keyof ReturnType<typeof imagePlacement>
      ];
  if (value.uniforms)
    for (const name in value.uniforms) delete value.uniforms[name];
  value.fallback = value.bounds = value.placement = value.rect = undefined;
  value.inputs = value.imageSize = value.edges = value.uniforms = undefined;
}
type PngControl = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  nativeOwned: boolean;
  surface: WebglSurface;
  values: Float32Array<ArrayBuffer>;
};
type PngSourceOwner = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  key: string;
  tuple: (string | number)[];
  edges: ImageData[];
  pixels?: ReturnType<Canvas2dBackend["createSurface"]> | undefined;
  surface?: WebglSurface | undefined;
  promoted: boolean;
  nativeOwned: boolean;
};
type PngSourceState = {
  sources: Map<string, WebglSurface>;
  unsupported: Set<string>;
  entries: Map<string, PngSourceOwner>;
  managed: boolean;
  closed: boolean;
  memory: ReturnType<typeof renderMemory>;
};
function clearPngSourceData(value: PngSourceOwner) {
  value.tuple.length = value.edges.length = 0;
  value.pixels = value.surface = undefined;
  value.key = "";
  value.memory = undefined;
}
function releasePngEdges(value: PngSourceOwner) {
  let failed = false,
    first: unknown;
  for (const edge of value.edges) {
    try {
      releaseRenderPixels(edge.data);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  }
  value.edges.length = 0;
  if (failed) throw first;
}
/** Native bitmap spans, restricted to downscaled PNG sprites with transparent borders. */
export class WebglPngImages {
  private readonly sourceState = allocateRenderMetadata<PngSourceState>(
    1536,
    () => ({
      sources: new Map(),
      unsupported: new Set(),
      entries: new Map(),
      managed: renderMemory() !== undefined,
      closed: false,
      memory: renderMemory(),
    }),
    true,
    (value) => this.clearSources(value),
  );
  private get sources() {
    return this.sourceState.sources;
  }
  private get unsupported() {
    return this.sourceState.unsupported;
  }
  private bytes = 0;
  private control: PngControl | undefined;
  private readonly maximum: number;

  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
    private readonly resources: CanvasImageResources,
  ) {
    try {
      this.maximum = Math.min(
        16384,
        device.gl.getParameter(device.gl.MAX_TEXTURE_SIZE) as number,
      );
    } catch (error) {
      if (this.sourceState.managed) releaseRenderMetadata(this.sourceState);
      else this.clearSources();
      throw error;
    }
  }

  private destroySource(owner: PngSourceOwner) {
    const key = owner.key;
    if (this.sourceState.entries.get(key) === owner) {
      this.sourceState.entries.delete(key);
      this.unsupported.delete(key);
      const surface = this.sources.get(key);
      this.sources.delete(key);
      if (surface) this.bytes -= surface.width * surface.height * 4;
    }
    const surface = owner.surface;
    owner.surface = undefined;
    try {
      if (surface && (!owner.nativeOwned || owner.memory?.owns(surface)))
        this.device.release(surface);
    } finally {
      clearPngSourceData(owner);
    }
  }
  private releaseSourceOwner(owner: PngSourceOwner) {
    if (owner.managed) releaseRenderMetadata(owner);
    else this.destroySource(owner);
  }
  private forget(key: string) {
    const surface = this.sources.get(key)!;
    const owner = this.sourceState.entries.get(key);
    this.sources.delete(key);
    this.sourceState.entries.delete(key);
    this.bytes -= surface.width * surface.height * 4;
    if (owner) owner.surface = undefined;
    try {
      this.device.release(surface);
    } finally {
      if (owner) this.releaseSourceOwner(owner);
    }
  }
  private clearSources(state = this.sourceState) {
    if (state.closed) return;
    state.closed = true;
    let failed = false,
      first: unknown;
    for (const key of state.sources.keys()) {
      const owner = state.entries.get(key);
      try {
        if (owner) this.releaseSourceOwner(owner);
        else this.forget(key);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    for (const owner of state.entries.values()) {
      try {
        this.releaseSourceOwner(owner);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    state.sources.clear();
    state.unsupported.clear();
    state.entries.clear();
    this.bytes = 0;
    state.memory = undefined;
    if (failed) throw first;
  }
  private cleanupSource(owner: PngSourceOwner) {
    let failed = false,
      first: unknown;
    try {
      releasePngEdges(owner);
    } catch (error) {
      failed = true;
      first = error;
    }
    const surface = owner.promoted ? undefined : owner.surface,
      pixels = owner.pixels;
    if (!owner.promoted) owner.surface = undefined;
    owner.pixels = undefined;
    if (surface) {
      try {
        this.device.release(surface);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    if (pixels) {
      try {
        this.raster.releaseSurface(pixels);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    owner.tuple.length = 0;
    if (failed) throw first;
  }
  private promoteSource(owner: PngSourceOwner, surface?: WebglSurface) {
    if (owner.managed) resizeRenderMetadata(owner, 592 + 2 * owner.key.length);
    this.sourceState.entries.set(owner.key, owner);
    if (surface) {
      this.sources.set(owner.key, surface);
      this.bytes += surface.width * surface.height * 4;
    } else this.unsupported.add(owner.key);
    owner.promoted = true;
  }
  private source(asset: string, level: number) {
    if (this.sourceState.closed) throw Error("PNG source cache is disposed");
    const memory = renderMemory();
    if (memory && this.sourceState.memory !== memory)
      throw Error("PNG source cache belongs to another allocator");
    // Native JSON may escape each borrowed UTF16 unit to six output units.
    const owner = allocateRenderMetadata<PngSourceOwner>(
      2048 + 12 * asset.length,
      () => ({
        managed: renderMemory() !== undefined,
        memory: renderMemory(),
        key: "",
        tuple: [],
        edges: [],
        promoted: false,
        nativeOwned: false,
      }),
      true,
      (value) => this.destroySource(value),
    );
    let cleaned = false;
    try {
      const key = (owner.key = JSON.stringify((owner.tuple = [asset, level])));
      if (this.unsupported.has(key)) return undefined;
      const cached = this.sources.get(key);
      if (cached) {
        this.sources.delete(key);
        this.sources.set(key, cached);
        return cached;
      }
      const size = this.resources.sizes.get(asset)!;
      const width = size[0] / 2 ** level,
        height = size[1] / 2 ** level;
      if (width < 6 || height < 6) return undefined;
      const pixels = (owner.pixels = this.raster.createSurface(width, height));
      pixels.ctx.drawImage(
        this.resources.images.get(asset)!,
        0,
        0,
        width,
        height,
      );
      // Preserve original four border reads and their short-circuit alpha test.
      owner.edges.push(readRenderImageData(pixels.ctx, 0, 0, width, 3));
      owner.edges.push(
        readRenderImageData(pixels.ctx, 0, height - 3, width, 3),
      );
      owner.edges.push(readRenderImageData(pixels.ctx, 0, 0, 3, height));
      owner.edges.push(
        readRenderImageData(pixels.ctx, width - 3, 0, 3, height),
      );
      const unsupported = owner.edges.some(({ data }) =>
        data.some((value, i) => i % 4 === 3 && value !== 0),
      );
      releasePngEdges(owner);
      if (unsupported) {
        if (this.unsupported.size >= 1024) {
          const oldest = this.unsupported.values().next().value!;
          this.unsupported.delete(oldest);
          const old = this.sourceState.entries.get(oldest);
          if (old) this.releaseSourceOwner(old);
        }
        this.promoteSource(owner);
        return undefined;
      }
      const bytes = width * height * 4;
      while (this.bytes + bytes > LIMIT && this.sources.size)
        this.forget(this.sources.keys().next().value!);
      const surface = (owner.surface = this.device.surface(width, height));
      owner.nativeOwned = owner.memory?.owns(surface) ?? false;
      this.device.upload(surface, pixels.canvas);
      this.promoteSource(owner, surface);
      return surface;
    } catch (error) {
      cleaned = true;
      try {
        this.cleanupSource(owner);
      } catch {
        /* Preserve original read/native/quota/null failure. */
      }
      throw error;
    } finally {
      try {
        if (!cleaned) this.cleanupSource(owner);
      } finally {
        if (!owner.promoted) this.releaseSourceOwner(owner);
      }
    }
  }

  draw(
    dst: WebglSurface,
    content: ImageContent,
    matrix: Matrix,
    opacity: number,
    clips: ClipRect[],
    transforms?: Matrix[],
  ) {
    if (content.media) return false;
    if (clips.length || content.rasterize !== "draw") return false;
    if (
      content.stateFrom !== undefined &&
      content.stateFrom !== content.state &&
      content.stateMix !== 0 &&
      content.stateMix !== 1
    )
      return false;
    const variant =
      content.sources[
        content.stateMix === 0 && content.stateFrom !== undefined
          ? content.stateFrom
          : content.state
      ]!;
    if (
      variant.crop ||
      variant.registration ||
      !this.resources.pngImages?.has(variant.asset)
    )
      return false;
    if (!(this.resources.images.get(variant.asset) instanceof HTMLImageElement))
      return false;
    const size = this.resources.sizes.get(variant.asset)!;
    if (size[0] * size[1] * 4 > LIMIT || Math.max(...size) >= this.maximum)
      return false;
    const phase = allocateRenderMetadata<PngDrawLifetime>(
      4096,
      () => ({ managed: renderMemory() !== undefined }),
      false,
      clearPngDraw,
    );
    try {
      let a = 1,
        d = 1,
        tx = 0,
        ty = 0;
      for (const local of transforms ?? (phase.fallback = [matrix])) {
        if (local[1] !== 0 || local[2] !== 0 || local[0] <= 0 || local[3] <= 0)
          return false;
        tx = f(f(a * f(local[4])) + tx);
        ty = f(f(d * f(local[5])) + ty);
        a = f(a * f(local[0]));
        d = f(d * f(local[3]));
      }
      const p = (phase.placement = imagePlacement(
        content,
        (phase.bounds = [0, 0, ...size]),
      ));
      if (
        p.x < 0 ||
        p.y < 0 ||
        p.x + p.width > content.width + 0.000001 ||
        p.y + p.height > content.height + 0.000001
      )
        return false;
      const scaleX = (a * p.width) / size[0],
        scaleY = (d * p.height) / size[1];
      const scale = Math.max(scaleX, scaleY),
        log = Math.log2(scale);
      // Keep unverified anisotropic, identity and mip-boundary procedures on Canvas.
      if (
        !(scale > 0 && scale < 1) ||
        Math.abs(scaleX - scaleY) > scale * 0.000001 ||
        Math.abs(log - Math.round(log)) < 1 / 256
      )
        return false;
      const level = Math.max(0, Math.floor(-log));
      // Keep ordinary downscales on the existing raster cache. The measured
      // benefit is for mipped sprites, which reuse a smaller source texture.
      if (level === 0 || size.some((value) => value % 2 ** level !== 0))
        return false;
      const source = this.source(variant.asset, level);
      if (!source) return false;
      const left = f(a * f(p.x) + tx),
        top = f(d * f(p.y) + ty);
      const right = f(a * f(f(p.x) + f(p.width)) + tx);
      const bottom = f(d * f(f(p.y) + f(p.height)) + ty);
      const rect = (phase.rect = {
        left: Math.max(0, Math.floor(left)),
        top: Math.max(0, Math.floor(top)),
        right: Math.min(dst.width, Math.ceil(right)),
        bottom: Math.min(dst.height, Math.ceil(bottom)),
      });
      if (rect.right <= rect.left || rect.bottom <= rect.top) return true;
      if (!this.device.drawRegion(dst, rect)) return true;
      const imageScaleX = f(
        a * f(f(f(f(p.x) + f(p.width)) - f(p.x)) / source.width),
      );
      const imageScaleY = f(
        d * f(f(f(f(p.y) + f(p.height)) - f(p.y)) / source.height),
      );
      const sx = f(1 / imageScaleX),
        sy = f(1 / imageScaleY);
      const control = this.coordinates(
        dst,
        sx,
        sy,
        f(-left * sx),
        f(-top * sy),
        left,
      );
      const gl = this.device.gl;
      let failed = false;
      try {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.device.pass(
          SHADER,
          dst,
          (phase.inputs = [source, control]),
          (phase.uniforms = {
            imageSize: (phase.imageSize = [source.width, source.height]),
            edges: (phase.edges = [left, top, right, bottom]),
            opacity,
          }),
          true,
          rect,
        );
      } catch (error) {
        failed = true;
        try {
          gl.disable(gl.BLEND);
        } catch {
          /* Preserve original setup/pass failure. */
        }
        throw error;
      } finally {
        if (!failed) gl.disable(gl.BLEND);
      }
      return true;
    } finally {
      if (phase.managed) releaseRenderMetadata(phase);
      else clearPngDraw(phase);
    }
  }

  private destroyControl(value: PngControl) {
    const { surface, values, memory } = value;
    if (this.control === value) this.control = undefined;
    let failed = false,
      first: unknown;
    try {
      if (!value.nativeOwned || memory?.owns(surface))
        this.device.release(surface);
    } catch (error) {
      failed = true;
      first = error;
    }
    try {
      if (memory) memory.release(values.buffer);
      else releaseRenderPixels(values);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
    delete (value as Partial<PngControl>).surface;
    delete (value as Partial<PngControl>).values;
    value.memory = undefined;
    if (failed) throw first;
  }
  private releaseControl(value: PngControl) {
    if (value.managed) releaseRenderMetadata(value);
    else this.destroyControl(value);
  }
  private createControl(length: number) {
    const memory = renderMemory();
    return allocateRenderMetadata<PngControl>(
      1024,
      () => {
        const surface = this.device.surface(length, 1, true);
        try {
          return {
            surface,
            values: allocateRenderPixels(
              length * 16,
              () => new Float32Array(length * 4),
              true,
            ),
            managed: memory !== undefined,
            memory,
            nativeOwned: memory?.owns(surface) ?? false,
          };
        } catch (error) {
          try {
            this.device.release(surface);
          } catch {
            /* Preserve original pixel/control failure. */
          }
          throw error;
        }
      },
      true,
      (value) => this.destroyControl(value),
    );
  }

  private coordinates(
    dst: WebglSurface,
    sx: number,
    sy: number,
    ix: number,
    iy: number,
    left: number,
  ) {
    const memory = renderMemory();
    if (memory && this.sourceState.memory !== memory)
      throw Error("PNG coordinate control belongs to another allocator");
    const length = Math.max(dst.width, dst.height);
    if (this.control?.surface.width !== length) {
      if (this.control) {
        const previous = this.control;
        this.control = undefined;
        this.releaseControl(previous);
      }
      this.control = this.createControl(length);
    }
    const { surface, values } = this.control;
    const start = Math.max(0, Math.floor(left + 0.5));
    for (let x = 0; x < dst.width; x++) {
      const span = start + Math.floor((x - start) / 127) * 127;
      const initial = f(f(sx * (span + 0.5)) + ix) - 0.5;
      values[x * 4] = Math.floor((initial + sx * (x - span)) * 16);
    }
    for (let y = 0; y < dst.height; y++)
      values[y * 4 + 1] = Math.floor((f(f(sy * (y + 0.5)) + iy) - 0.5) * 16);
    this.device.uploadFloats(surface, values);
    return surface;
  }

  dispose() {
    let failed = false,
      first: unknown;
    try {
      this.clearSources();
    } catch (error) {
      failed = true;
      first = error;
    }
    try {
      if (this.sourceState.managed) releaseRenderMetadata(this.sourceState);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
    const control = this.control;
    this.control = undefined;
    if (control) {
      try {
        this.releaseControl(control);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    if (failed) throw first;
  }
}
