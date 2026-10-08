import { releaseDeviceBoxCache } from "./webgl-box-blur.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import {
  allocateRenderPixels,
  createRenderStorage,
  releaseRenderPixels,
  releaseRenderStorage,
  renderMemory,
} from "../../managed-memory-context.ts";
import type { Bounds } from "../evaluate/types.ts";
/** GPU-owned, premultiplied RGBA pixels. Texture row zero is the image's top row. */
export type WebglSurface = {
  readonly width: number;
  readonly height: number;
  readonly floating: boolean;
  readonly opaque: boolean;
  /** Draw directly to the canvas; its texture is a lazily refreshed snapshot. */
  readonly screen: boolean;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

const VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const FRAGMENT_HEADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
out vec4 pixel;
uniform sampler2D source;
uniform sampler2D backdrop;
uniform sampler2D coverage;
vec4 bytes(vec4 value) { return floor(clamp(value, 0.0, 1.0) * 255.0 + 0.5) / 255.0; }
`;

export const inputSampler = (index: number) =>
  ["source", "backdrop", "coverage"][index] ?? `input${index}`;

type UniformValue = number | readonly number[];
type Program = {
  handle: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  lifetime?: ProgramLifetime | undefined;
};
type ProgramLifetime = {
  gl: WebGL2RenderingContext;
  programs: Map<string, Program>;
  body: string | undefined;
  transformed: string | undefined;
  vertexText: string | undefined;
  fragmentText: string | undefined;
  vertex: WebGLShader | undefined;
  fragment: WebGLShader | undefined;
  handle: WebGLProgram | undefined;
  info: WebGLActiveInfo | undefined;
  program: Program | undefined;
};
function clearProgramLifetime(value: ProgramLifetime) {
  let failed = false;
  let first: unknown;
  const cleanup = (action: () => void) => {
    try {
      action();
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  };
  if (
    value.body !== undefined &&
    value.programs.get(value.body)?.lifetime === value
  )
    value.programs.delete(value.body);
  const vertex = value.vertex,
    fragment = value.fragment,
    handle = value.handle;
  value.vertex = value.fragment = value.handle = undefined;
  if (vertex) cleanup(() => value.gl.deleteShader(vertex));
  if (fragment) cleanup(() => value.gl.deleteShader(fragment));
  if (handle) cleanup(() => value.gl.deleteProgram(handle));
  if (value.program) {
    value.program.uniforms.clear();
    value.program.lifetime = undefined;
    value.program = undefined;
  }
  value.body =
    value.transformed =
    value.vertexText =
    value.fragmentText =
      undefined;
  value.info = undefined;
  if (failed) throw first;
}
function releaseProgramLifetime(value: ProgramLifetime, managed: boolean) {
  if (managed) releaseRenderMetadata(value);
  else clearProgramLifetime(value);
}

function programDiagnostic(
  gl: WebGL2RenderingContext,
  handle: WebGLShader | WebGLProgram,
  shader: boolean,
  deleteHandle: () => void,
) {
  const phase = allocateRenderMetadata<{
    log: string | null | undefined;
    error: Error | undefined;
  }>(
    // WebGL removes log-length queries. The pinned 64-bit V8 profile allows fewer
    // than 2^29 UTF16 units: reserve both original log and Error.message first.
    4 * 2 ** 29 + 1024,
    () => ({ log: undefined, error: undefined }),
    true,
    (value) => {
      value.log = undefined;
      value.error = undefined;
    },
  );
  try {
    phase.log = shader
      ? gl.getShaderInfoLog(handle)
      : gl.getProgramInfoLog(handle);
    deleteHandle();
    phase.error = new Error(
      shader
        ? `comp-webgl-shader: ${phase.log}`
        : `comp-webgl-program: ${phase.log}`,
    );
    phase.log = undefined;
    resizeRenderMetadata(phase, 512 + 2 * phase.error.message.length);
    // The actual propagated Error remains in the allocator until export cleanup.
    return phase.error;
  } catch (error) {
    try {
      releaseRenderMetadata(phase);
    } catch {
      /* Preserve the original native diagnostic/Error factory failure. */
    }
    throw error;
  }
}

type ClipLifetime = {
  regions: Set<Bounds>;
  bytes: number;
};
function clearClipLifetime(value: ClipLifetime) {
  value.regions.clear();
}

type SolidLifetime = {
  sliced: number[] | undefined;
  scaled: number[] | undefined;
  bytes: number[] | undefined;
  solid: { surface: WebglSurface; color: number[]; region: Bounds } | undefined;
};
function clearSolidWorking(value: SolidLifetime) {
  if (value.sliced) value.sliced.length = 0;
  if (value.scaled) value.scaled.length = 0;
  if (value.bytes) value.bytes.length = 0;
  value.sliced = value.scaled = value.bytes = undefined;
}
function clearSolidLifetime(value: SolidLifetime) {
  clearSolidWorking(value);
  if (value.solid) value.solid.color.length = 0;
  value.solid = undefined;
}
type SurfaceSwap = {
  textures: [WebGLTexture, WebGLTexture] | undefined;
  framebuffers: [WebGLFramebuffer, WebGLFramebuffer] | undefined;
};
function clearSurfaceSwap(value: SurfaceSwap) {
  if (value.textures) (value.textures as unknown[]).length = 0;
  if (value.framebuffers) (value.framebuffers as unknown[]).length = 0;
  value.textures = undefined;
  value.framebuffers = undefined;
}
type PassMetadata = {
  inputs: Set<WebglSurface> | undefined;
  uniforms: [string, UniformValue][] | undefined;
};
function clearPassMetadata(value: PassMetadata) {
  value.inputs?.clear();
  if (value.uniforms) {
    for (const entry of value.uniforms) (entry as unknown[]).length = 0;
    value.uniforms.length = 0;
  }
  value.inputs = undefined;
  value.uniforms = undefined;
}
type PoolEntry = {
  key: string | undefined;
  surfaces: WebglSurface[] | undefined;
  capacity: number;
};
function clearPoolEntry(value: PoolEntry) {
  if (value.surfaces) value.surfaces.length = 0;
  value.surfaces = undefined;
  value.key = undefined;
}
function poolKey(
  width: number,
  height: number,
  floating: boolean,
  opaque: boolean,
  screen: boolean,
) {
  // Numeric dimensions need at most 24 UTF16 units each; flags/separators at most 20.
  // Holder/text/list controls plus that original template output fit before production.
  return allocateRenderMetadata<PoolEntry>(
    512,
    () => ({
      key: `${width}x${height}/${floating}/${opaque}/${screen}`,
      surfaces: undefined,
      capacity: 0,
    }),
    true,
    clearPoolEntry,
  );
}
type DeviceState = {
  programs: Map<string, Program>;
  surfaces: Set<WebglSurface>;
  pool: Map<string, PoolEntry>;
  dirtyScreens: Set<WebglSurface>;
  gl: WebGL2RenderingContext | undefined;
  vao: WebGLVertexArrayObject | undefined;
  bytes: number;
  managed: boolean;
  dirtyCapacity: number;
  solid: SolidLifetime | undefined;
  clips: ClipLifetime | undefined;
};
function rollbackClip(state: DeviceState, phase: ClipLifetime, before: number) {
  try {
    resizeRenderMetadata(phase, before);
    phase.bytes = before;
  } finally {
    if (phase.regions.size === 0) {
      state.clips = undefined;
      if (state.managed) releaseRenderMetadata(phase);
      else clearClipLifetime(phase);
    }
  }
}
function destroySurface(gl: WebGL2RenderingContext, surface: WebglSurface) {
  let failed = false;
  let first: unknown;
  try {
    releaseRenderStorage(surface.texture, (value) => gl.deleteTexture(value));
  } catch (error) {
    failed = true;
    first = error;
  }
  try {
    gl.deleteFramebuffer(surface.framebuffer);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  if (failed) throw first;
}
function clearDeviceState(state: DeviceState) {
  const gl = state.gl;
  let failed = false;
  let first: unknown;
  const cleanup = (action: () => void) => {
    try {
      action();
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  };
  if (state.solid) {
    const solid = state.solid;
    state.solid = undefined;
    if (state.managed) cleanup(() => releaseRenderMetadata(solid));
    else clearSolidLifetime(solid);
  }
  if (state.clips) {
    const clips = state.clips;
    state.clips = undefined;
    if (state.managed) cleanup(() => releaseRenderMetadata(clips));
    else clearClipLifetime(clips);
  }
  for (const surface of state.surfaces) {
    if (state.managed) cleanup(() => releaseRenderMetadata(surface));
    else if (gl) cleanup(() => destroySurface(gl, surface));
  }
  if (gl) {
    for (const program of state.programs.values()) {
      const lifetime = program.lifetime;
      if (lifetime) {
        if (state.managed) cleanup(() => releaseRenderMetadata(lifetime));
        else cleanup(() => clearProgramLifetime(lifetime));
      } else cleanup(() => gl.deleteProgram(program.handle));
    }
    if (state.vao) cleanup(() => gl.deleteVertexArray(state.vao!));
  }
  for (const entry of state.pool.values()) {
    state.pool.delete(entry.key!);
    if (state.managed) cleanup(() => releaseRenderMetadata(entry));
    else clearPoolEntry(entry);
  }
  state.surfaces.clear();
  state.pool.clear();
  state.programs.clear();
  state.dirtyScreens.clear();
  state.vao = undefined;
  state.gl = undefined;
  if (failed) throw first;
}

/** Owns GL resources and restores the small, explicit state used by every pass. */
export class WebglDevice {
  readonly gl: WebGL2RenderingContext;
  private readonly state = allocateRenderMetadata<DeviceState>(
    // Actual state 128, four Map/Set controls 512, context options 160,
    // VAO/context handles 128 and setup/cleanup control margin 96.
    1024,
    () => ({
      programs: new Map(),
      surfaces: new Set(),
      pool: new Map(),
      dirtyScreens: new Set(),
      gl: undefined,
      vao: undefined,
      bytes: 1024,
      managed: renderMemory() !== undefined,
      dirtyCapacity: 0,
      solid: undefined,
      clips: undefined,
    }),
    true,
    clearDeviceState,
  );
  private readonly programs = this.state.programs;
  private readonly surfaces = this.state.surfaces;
  private readonly pool = this.state.pool;
  private readonly vao: WebGLVertexArrayObject;
  private readonly dirtyScreens = this.state.dirtyScreens;
  /** Exact opaque bytes of the latest screen clear while nothing has drawn over it. */
  private get solid() {
    return this.state.solid?.solid;
  }
  private dropSolid() {
    const prior = this.state.solid;
    this.state.solid = undefined;
    if (prior) {
      if (this.state.managed) releaseRenderMetadata(prior);
      else clearSolidLifetime(prior);
    }
  }
  passes = 0;
  private pooledBytes = 0;

  private frameClip: Bounds | null | undefined;
  onScreenChange: ((region?: Bounds) => void) | undefined;

  setFrameClip(region?: Bounds | null) {
    const clips = this.state.clips;
    this.state.clips = undefined;
    if (clips) {
      if (this.state.managed) releaseRenderMetadata(clips);
      else clearClipLifetime(clips);
    }
    this.frameClip = region;
  }

  drawRegion(surface: WebglSurface, clip: Bounds): Bounds | null {
    return (surface.screen ? this.screenRegion(clip) : clip) ?? null;
  }

  private screenRegion(clip?: Bounds | null): Bounds | null | undefined {
    const frame = this.frameClip;
    if (frame === null || clip === null) return null;
    if (!frame) return clip;
    if (!clip) return frame;
    const phase = (this.state.clips ??= allocateRenderMetadata<ClipLifetime>(
      // Actual holder 64, collection control 128 and lifecycle margin 64.
      256,
      () => ({ regions: new Set(), bytes: 256 }),
      true,
      clearClipLifetime,
    ));
    const before = phase.bytes;
    try {
      // The original four-field box 64 and actual Set entry 40 precede getters/math.
      resizeRenderMetadata(phase, before + 104);
      phase.bytes += 104;
      const result = {
        left: Math.max(frame.left, clip.left),
        top: Math.max(frame.top, clip.top),
        right: Math.min(frame.right, clip.right),
        bottom: Math.min(frame.bottom, clip.bottom),
      };
      if (result.right <= result.left || result.bottom <= result.top) {
        rollbackClip(this.state, phase, before);
        return null;
      }
      phase.regions.add(result);
      return result;
    } catch (error) {
      try {
        rollbackClip(this.state, phase, before);
      } catch {
        /* Preserve the original clip admission/coordinate/Set failure. */
      }
      throw error;
    }
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    preserveAlpha = false,
    private readonly poolByteLimit = 128 * 1024 * 1024,
  ) {
    try {
      const gl = canvas.getContext("webgl2", {
        alpha: preserveAlpha,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("comp-webgl-unavailable: WebGL2 is unavailable");
      this.gl = gl;
      this.state.gl = gl;
      this.vao = gl.createVertexArray()!;
      this.state.vao = this.vao;
      gl.bindVertexArray(this.vao);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    } catch (error) {
      try {
        clearDeviceState(this.state);
      } catch {
        /* Preserve native setup failure. */
      }
      try {
        releaseRenderMetadata(this.state);
      } catch {
        /* Preserve native setup failure. */
      }
      throw error;
    }
  }

  get allocated() {
    return this.surfaces.size;
  }

  surface(
    width: number,
    height: number,
    floating = false,
    opaque = false,
    screen = false,
  ): WebglSurface {
    const key = poolKey(width, height, floating, opaque, screen);
    try {
      const cached = this.pool.get(key.key!)?.surfaces?.pop();
      if (cached) {
        this.pooledBytes -= width * height * (floating ? 16 : 4);
        this.clear(cached);
        return cached;
      }
      const gl = this.gl;
      if (
        width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
        height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
      )
        throw new Error("comp-webgl-size: surface exceeds MAX_TEXTURE_SIZE");
      if (floating && !gl.getExtension("EXT_color_buffer_float"))
        throw new Error(
          "comp-webgl-float: float accumulation surfaces are unavailable",
        );
      const before = this.state.bytes;
      resizeRenderMetadata(this.state, before + 40);
      this.state.bytes += 40;
      let committed = false;
      try {
        return allocateRenderMetadata<WebglSurface>(
          // Actual surface fields/handle controls and native setup closure capacity.
          1024,
          () => {
            let framebuffer: WebGLFramebuffer | undefined;
            let texture: WebGLTexture | undefined;
            let surface: WebglSurface | undefined;
            try {
              texture = createRenderStorage(
                width * height * (floating ? 16 : 4),
                () => gl.createTexture(),
                (texture) => {
                  framebuffer = gl.createFramebuffer() ?? undefined;
                  if (!framebuffer)
                    throw Error("Native render framebuffer creation failed");
                  gl.bindTexture(gl.TEXTURE_2D, texture);
                  gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MIN_FILTER,
                    floating ? gl.NEAREST : gl.LINEAR,
                  );
                  gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MAG_FILTER,
                    floating ? gl.NEAREST : gl.LINEAR,
                  );
                  gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_S,
                    gl.CLAMP_TO_EDGE,
                  );
                  gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_T,
                    gl.CLAMP_TO_EDGE,
                  );
                  gl.texStorage2D(
                    gl.TEXTURE_2D,
                    1,
                    floating ? gl.RGBA32F : gl.RGBA8,
                    width,
                    height,
                  );
                  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                  gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    texture,
                    0,
                  );
                  if (
                    gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
                    gl.FRAMEBUFFER_COMPLETE
                  )
                    throw new Error(
                      "comp-webgl-framebuffer: incomplete render surface",
                    );
                },
                (texture) => gl.deleteTexture(texture),
              );
              surface = {
                width,
                height,
                floating,
                opaque,
                screen,
                texture,
                framebuffer: framebuffer!,
              };
              this.clear(surface);
              this.surfaces.add(surface);
              committed = true;
              return surface;
            } catch (error) {
              if (surface) {
                this.dirtyScreens.delete(surface);
                try {
                  if (this.solid?.surface === surface) this.dropSolid();
                } catch {
                  /* Preserve the original surface failure. */
                }
              }
              try {
                if (texture)
                  releaseRenderStorage(texture, (value) =>
                    gl.deleteTexture(value),
                  );
              } catch {
                /* Preserve the original surface failure. */
              }
              try {
                if (framebuffer) gl.deleteFramebuffer(framebuffer);
              } catch {
                /* Preserve the original surface failure. */
              }
              throw error;
            }
          },
          true,
          (surface) => {
            try {
              destroySurface(gl, surface);
            } finally {
              this.surfaces.delete(surface);
            }
          },
        );
      } catch (error) {
        if (!committed) {
          try {
            resizeRenderMetadata(this.state, this.state.bytes - 40);
            this.state.bytes -= 40;
          } catch {
            /* Preserve original native surface/admission failure. */
          }
        }
        throw error;
      }
    } finally {
      releaseRenderMetadata(key);
    }
  }

  /** Permanently release a separately budgeted native texture, bypassing the general pool. */
  discard(surface: WebglSurface) {
    try {
      if (this.state.managed) releaseRenderMetadata(surface);
      else destroySurface(this.gl, surface);
    } finally {
      this.surfaces.delete(surface);
    }
  }

  release(surface: WebglSurface) {
    const key = poolKey(
      surface.width,
      surface.height,
      surface.floating,
      surface.opaque,
      surface.screen,
    );
    let retained = false;
    const before = this.state.bytes;
    let admitted = false,
      committed = false;
    try {
      const existing = this.pool.get(key.key!);
      const list = existing?.surfaces ?? (key.surfaces = []);
      const bytes =
        surface.width * surface.height * (surface.floating ? 16 : 4);
      if (list.length < 16 && this.pooledBytes + bytes <= this.poolByteLimit) {
        const entry = existing ?? key;
        const capacity = Math.max(entry.capacity, list.length + 1);
        resizeRenderMetadata(entry, 256 + 2 * entry.key!.length + 8 * capacity);
        if (!existing) {
          resizeRenderMetadata(this.state, before + 40);
          this.state.bytes += 40;
          admitted = true;
        }
        entry.capacity = capacity;
        this.pooledBytes += bytes;
        list.push(surface);
        this.pool.set(entry.key!, entry);
        committed = true;
        retained = !existing;
      } else this.discard(surface);
    } catch (error) {
      if (admitted && !committed) {
        try {
          resizeRenderMetadata(this.state, before);
          this.state.bytes = before;
        } catch {
          /* Preserve the original pool failure. */
        }
      }
      throw error;
    } finally {
      if (!retained) releaseRenderMetadata(key);
    }
  }

  clear(surface: WebglSurface, color: readonly number[] = [0, 0, 0, 0]) {
    const clip = surface.screen ? this.screenRegion() : undefined;
    if (clip === null) return;
    const gl = this.gl,
      a = color[3]!;
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      surface.screen ? null : surface.framebuffer,
    );
    gl.clearColor(
      color[0]! * a,
      color[1]! * a,
      color[2]! * a,
      surface.opaque ? 1 : a,
    );
    if (clip) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        clip.left,
        surface.height - clip.bottom,
        clip.right - clip.left,
        clip.bottom - clip.top,
      );
    }
    try {
      gl.clear(gl.COLOR_BUFFER_BIT);
    } finally {
      if (clip) gl.disable(gl.SCISSOR_TEST);
    }
    if (surface.screen) {
      // Opaque screens store whole channel values; only exact byte colors are
      // known without reading the framebuffer back.
      const phase = allocateRenderMetadata<SolidLifetime>(
        // Holder 64 + four array headers/slots 240 + solid/box 144
        // + original map/every callbacks and iteration capacity 320.
        768,
        () => ({
          sliced: undefined,
          scaled: undefined,
          bytes: undefined,
          solid: undefined,
        }),
        true,
        clearSolidLifetime,
      );
      let retained = false;
      try {
        phase.sliced = color.slice(0, 3);
        phase.scaled = phase.sliced.map((value) => value * a * 255);
        const bytes = (phase.bytes = phase.scaled.concat(255));
        phase.solid =
          surface.opaque &&
          bytes.every((v) => Math.abs(v - Math.round(v)) < 1e-6)
            ? {
                surface,
                color: bytes.map(Math.round),
                region: clip ?? {
                  left: 0,
                  top: 0,
                  right: surface.width,
                  bottom: surface.height,
                },
              }
            : undefined;
        clearSolidWorking(phase);
        if (phase.solid) {
          resizeRenderMetadata(phase, 384);
          this.dropSolid();
          this.state.solid = phase;
          retained = true;
        } else this.dropSolid();
        this.markDirty(surface);
        this.onScreenChange?.(clip);
      } finally {
        clearSolidWorking(phase);
        if (!retained) releaseRenderMetadata(phase);
      }
    }
  }

  upload(surface: WebglSurface, canvas: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  uploadRegion(
    surface: WebglSurface,
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
  ) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
    try {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        surface.width,
        surface.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      );
    } finally {
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
  }

  /** Upload one canvas rectangle into the same rectangle of `surface`. */
  uploadArea(surface: WebglSurface, canvas: HTMLCanvasElement, rect: Bounds) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, rect.left);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, rect.top);
    try {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      );
    } finally {
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
  }

  uploadFloats(surface: WebglSurface, pixels: Float32Array<ArrayBuffer>) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      surface.width,
      surface.height,
      gl.RGBA,
      gl.FLOAT,
      pixels,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  /** Upload premultiplied bytes as stored, without browser conversion. */
  uploadBytes(surface: WebglSurface, pixels: Uint8Array<ArrayBuffer>) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      surface.width,
      surface.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  /** Fixed-size triangles cover every destination pixel exactly once. */
  pass(
    body: string,
    target: WebglSurface | null,
    inputs: readonly WebglSurface[],
    uniforms: Record<string, UniformValue> = {},
    blended = false,
    clip?: Bounds | null,
  ) {
    if (target?.screen) clip = this.screenRegion(clip);
    if (clip === null) return;
    if (target?.screen) this.dropSolid();
    const gl = this.gl;
    const workingBytes = 4096 + 12 * body.length;
    const phase = allocateRenderMetadata<ProgramLifetime>(
      // Controls/native handles/fixed shader text 4096. At most six input-length
      // UTF16 copies cover original replacements, final body and fragment source.
      workingBytes,
      () => ({
        gl,
        programs: this.programs,
        body: undefined,
        transformed: undefined,
        vertexText: undefined,
        fragmentText: undefined,
        vertex: undefined,
        fragment: undefined,
        handle: undefined,
        info: undefined,
        program: undefined,
      }),
      true,
      clearProgramLifetime,
    );
    let retained = false,
      released = false;
    try {
      if (target?.screen) {
        // Keep every shader in top-left image coordinates while the canvas's
        // physical framebuffer has its origin at the bottom left.
        body =
          "vec4 pixelPosition;\n" +
          (phase.transformed = body.replaceAll(
            "gl_FragCoord",
            "pixelPosition",
          )).replace("void main()", "void shade()") +
          `\nvoid main() { pixelPosition=vec4(gl_FragCoord.x,${target.height}.0-gl_FragCoord.y,gl_FragCoord.zw); shade(); ${blended || !target.opaque ? "" : "pixel.a=1.0;"} }`;
      } else if (target?.opaque && !blended)
        body =
          body.replace("void main()", "void shade()") +
          "\nvoid main() { shade(); pixel.a = 1.0; }";
      phase.body = body;
      let program = this.programs.get(body);
      if (!program) {
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)!;
          if (type === gl.VERTEX_SHADER) phase.vertex = shader;
          else phase.fragment = shader;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw programDiagnostic(gl, shader, true, () => {
              if (type === gl.VERTEX_SHADER) phase.vertex = undefined;
              else phase.fragment = undefined;
              gl.deleteShader(shader);
            });
          }
          return shader;
        };
        const vertex = compile(
          gl.VERTEX_SHADER,
          (phase.vertexText = target?.screen
            ? VERTEX.replace("uv = p;", "uv = vec2(p.x, 1.0-p.y);")
            : VERTEX),
        );
        const fragment = compile(
          gl.FRAGMENT_SHADER,
          (phase.fragmentText = FRAGMENT_HEADER + body),
        );
        const handle = (phase.handle = gl.createProgram()!);
        gl.attachShader(handle, vertex);
        gl.attachShader(handle, fragment);
        gl.linkProgram(handle);
        phase.vertex = undefined;
        gl.deleteShader(vertex);
        phase.fragment = undefined;
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
          throw programDiagnostic(gl, handle, false, () => {
            phase.handle = undefined;
            gl.deleteProgram(handle);
          });
        }
        program = phase.program = {
          handle,
          uniforms: new Map(),
          lifetime: phase,
        };
        let uniformBytes = 0;
        for (
          let i = 0;
          i < gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
          i++
        ) {
          // Renderer-produced shaders use flat names below 256 units, including
          // generated numeric suffixes. Admit info/name/location/Map entry first.
          resizeRenderMetadata(phase, workingBytes + uniformBytes + 1024);
          const info = (phase.info = gl.getActiveUniform(handle, i)!);
          program.uniforms.set(
            info.name,
            gl.getUniformLocation(handle, info.name)!,
          );
          uniformBytes += 192 + 2 * info.name.length;
          phase.info = undefined;
          resizeRenderMetadata(phase, workingBytes + uniformBytes);
        }
        phase.transformed = phase.vertexText = phase.fragmentText = undefined;
        // Actual holder/program/Map/handle/key/cache-entry/cleanup controls 768;
        // retain original body text and actual uniform name/location entries.
        resizeRenderMetadata(phase, 768 + 2 * body.length + uniformBytes);
        if (this.programs.size >= 64) {
          const oldest = this.programs.keys().next().value!;
          const previous = this.programs.get(oldest)!;
          gl.deleteProgram(previous.handle);
          if (previous.lifetime) previous.lifetime.handle = undefined;
          this.programs.delete(oldest);
          if (previous.lifetime)
            releaseProgramLifetime(previous.lifetime, this.state.managed);
        }
        this.programs.set(body, program);
        retained = true;
      }
      if (
        target &&
        !target.screen &&
        inputs.some((input) => input.texture === target.texture)
      )
        throw new Error(
          "comp-webgl-feedback: input and output textures overlap",
        );
      let uniformCount = 0;
      for (const name in uniforms)
        if (Object.hasOwn(uniforms, name)) uniformCount++;
      const temporary = allocateRenderMetadata<PassMetadata>(
        // Holder/Set/outer array 512; input slots/sampler arrays/text 256 per input;
        // original uniform tuples and outer pointer slots 64 per own enumerable field.
        512 + 256 * inputs.length + 64 * uniformCount,
        () => ({ inputs: undefined, uniforms: undefined }),
        false,
        clearPassMetadata,
      );
      try {
        const unique = (temporary.inputs = new Set(inputs));
        for (const input of unique) if (input.screen) this.resolveScreen(input);
        gl.bindFramebuffer(
          gl.FRAMEBUFFER,
          target?.screen ? null : (target?.framebuffer ?? null),
        );
        gl.viewport(
          0,
          0,
          target?.width ?? this.canvas.width,
          target?.height ?? this.canvas.height,
        );
        gl.useProgram(program.handle);
        gl.bindVertexArray(this.vao);
        for (let i = 0; i < inputs.length; i++) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, inputs[i]!.texture);
          const location = program.uniforms.get(inputSampler(i));
          if (location) gl.uniform1i(location, i);
        }
        const entries = (temporary.uniforms = Object.entries(uniforms));
        for (const [name, value] of entries) {
          const location = program.uniforms.get(name);
          if (!location) continue;
          if (typeof value === "number") gl.uniform1f(location, value);
          else if (value.length === 2) gl.uniform2fv(location, value);
          else if (value.length === 3) gl.uniform3fv(location, value);
          else if (value.length === 4) gl.uniform4fv(location, value);
          else if (value.length === 9)
            gl.uniformMatrix3fv(location, false, value);
          else throw new Error(`comp-webgl-uniform: unsupported ${name}`);
        }
        if (clip) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(
            clip.left,
            target?.screen ? target.height - clip.bottom : clip.top,
            clip.right - clip.left,
            clip.bottom - clip.top,
          );
        }
        try {
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        } finally {
          if (clip) gl.disable(gl.SCISSOR_TEST);
        }
        if (target?.screen) {
          this.markDirty(target);
          this.onScreenChange?.(clip);
        }
        this.passes++;
      } finally {
        releaseRenderMetadata(temporary);
      }
    } catch (error) {
      if (!retained) {
        released = true;
        try {
          releaseProgramLifetime(phase, this.state.managed);
        } catch {
          /* Preserve the original shader/program/native/admission failure. */
        }
      }
      throw error;
    } finally {
      if (!retained && !released)
        releaseProgramLifetime(phase, this.state.managed);
    }
  }

  /** Byte color covering `region` of a screen cleared without later draws. */
  solidColor(surface: WebglSurface, region: Bounds) {
    const solid = this.solid;
    if (
      !solid ||
      solid.surface !== surface ||
      region.left < solid.region.left ||
      region.top < solid.region.top ||
      region.right > solid.region.right ||
      region.bottom > solid.region.bottom
    )
      return undefined;
    return solid.color;
  }

  swap(first: WebglSurface, second: WebglSurface) {
    if (first.screen || second.screen)
      throw new Error("comp-webgl-screen: canvas surfaces cannot be exchanged");
    if (
      first.width !== second.width ||
      first.height !== second.height ||
      first.floating !== second.floating
    )
      throw new Error(
        "comp-webgl-size: cannot exchange differently sized surfaces",
      );
    const temporary = allocateRenderMetadata<SurfaceSwap>(
      256,
      () => ({ textures: undefined, framebuffers: undefined }),
      false,
      clearSurfaceSwap,
    );
    try {
      const textures = (temporary.textures = [second.texture, first.texture]);
      [first.texture, second.texture] = textures;
      const framebuffers = (temporary.framebuffers = [
        second.framebuffer,
        first.framebuffer,
      ]);
      [first.framebuffer, second.framebuffer] = framebuffers;
    } finally {
      releaseRenderMetadata(temporary);
    }
  }

  copyRegion(surface: WebglSurface, rect: Bounds) {
    const width = rect.right - rect.left,
      height = rect.bottom - rect.top;
    const output = this.surface(width, height);
    const gl = this.gl;
    gl.bindFramebuffer(
      gl.READ_FRAMEBUFFER,
      surface.screen ? null : surface.framebuffer,
    );
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, output.framebuffer);
    gl.blitFramebuffer(
      rect.left,
      surface.screen ? surface.height - rect.top : rect.top,
      rect.right,
      surface.screen ? surface.height - rect.bottom : rect.bottom,
      0,
      0,
      width,
      height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return output;
  }

  read(surface: WebglSurface) {
    return this.readRegion(surface, 0, 0, surface.width, surface.height);
  }

  /** Exact offscreen storage, including floating effect intermediates. */
  readFloats(surface: WebglSurface) {
    if (!surface.floating || surface.screen)
      throw Error("Float readback requires an offscreen RGBA32F surface");
    const gl = this.gl;
    const previous = gl.getParameter(
      gl.READ_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const pixels = allocateRenderPixels(
      surface.width * surface.height * 16,
      () => new Float32Array(surface.width * surface.height * 4),
    );
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, surface.framebuffer);
      gl.readPixels(
        0,
        0,
        surface.width,
        surface.height,
        gl.RGBA,
        gl.FLOAT,
        pixels,
      );
      if (gl.getError() !== gl.NO_ERROR)
        throw Error("RGBA32F surface readback failed");
      return pixels;
    } catch (error) {
      releaseRenderPixels(pixels);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
    }
  }

  readRegion(
    surface: WebglSurface,
    x: number,
    y: number,
    width: number,
    height: number,
    rowOrder: "top-down" | "native" = "top-down",
  ) {
    const gl = this.gl;
    const pixels = allocateRenderPixels(
      width * height * 4,
      () => new Uint8Array(width * height * 4),
    );
    try {
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        surface.screen ? null : surface.framebuffer,
      );
      gl.readPixels(
        x,
        surface.screen ? surface.height - y - height : y,
        width,
        height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (surface.screen && rowOrder === "top-down") {
        const stride = width * 4;
        const row = allocateRenderPixels(stride, () => new Uint8Array(stride));
        try {
          for (
            let top = 0, bottom = height - 1;
            top < bottom;
            top++, bottom--
          ) {
            const current = allocateRenderMetadata<{
              view: Uint8Array<ArrayBuffer> | undefined;
            }>(
              128,
              () => ({
                view: pixels.subarray(top * stride, (top + 1) * stride),
              }),
              false,
              (value) => {
                value.view = undefined;
              },
            );
            try {
              row.set(current.view!);
            } finally {
              releaseRenderMetadata(current);
            }
            pixels.copyWithin(
              top * stride,
              bottom * stride,
              (bottom + 1) * stride,
            );
            pixels.set(row, bottom * stride);
          }
        } finally {
          releaseRenderPixels(row);
        }
      }
      return pixels;
    } catch (error) {
      releaseRenderPixels(pixels);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  present(surface: WebglSurface) {
    if (surface.screen) return;
    this.dropSolid();
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, surface.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0,
      0,
      surface.width,
      surface.height,
      0,
      this.canvas.height,
      this.canvas.width,
      0,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    try {
      this.frameClip = undefined;
      this.onScreenChange = undefined;
      this.pooledBytes = 0;
      this.dropSolid();
      try {
        clearDeviceState(this.state);
      } finally {
        releaseRenderMetadata(this.state);
      }
    } catch (error) {
      try {
        releaseDeviceBoxCache(this);
      } catch {
        /* Preserve original device/native disposal failure. */
      }
      throw error;
    }
    releaseDeviceBoxCache(this);
  }

  private markDirty(surface: WebglSurface) {
    const needed =
      this.dirtyScreens.size + (this.dirtyScreens.has(surface) ? 0 : 1);
    const before = this.state.bytes,
      capacity = this.state.dirtyCapacity;
    if (needed > capacity) {
      const bytes = 40 * (needed - capacity);
      resizeRenderMetadata(this.state, before + bytes);
      this.state.bytes += bytes;
      this.state.dirtyCapacity = needed;
    }
    try {
      this.dirtyScreens.add(surface);
    } catch (error) {
      if (needed > capacity) {
        try {
          resizeRenderMetadata(this.state, before);
          this.state.bytes = before;
          this.state.dirtyCapacity = capacity;
        } catch {
          /* Preserve original dirty Set failure. */
        }
      }
      throw error;
    }
  }

  private resolveScreen(surface: WebglSurface) {
    // Backdrop-reading effects need a texture. Ordinary draws avoid this copy.
    if (!this.dirtyScreens.has(surface)) return;
    const gl = this.gl,
      scissored = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissored) gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, surface.framebuffer);
    gl.blitFramebuffer(
      0,
      0,
      surface.width,
      surface.height,
      0,
      surface.height,
      surface.width,
      0,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    if (scissored) gl.enable(gl.SCISSOR_TEST);
    this.dirtyScreens.delete(surface);
  }
}
