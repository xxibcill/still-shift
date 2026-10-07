import {
  allocateRenderPixels,
  createRenderStorage,
  releaseRenderPixels,
  releaseRenderStorage,
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
};

/** Owns GL resources and restores the small, explicit state used by every pass. */
export class WebglDevice {
  readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<string, Program>();
  private readonly surfaces = new Set<WebglSurface>();
  private readonly pool = new Map<string, WebglSurface[]>();
  private readonly vao: WebGLVertexArrayObject;
  private readonly dirtyScreens = new Set<WebglSurface>();
  /** Exact opaque bytes of the latest screen clear while nothing has drawn over it. */
  private solid:
    | { surface: WebglSurface; color: number[]; region: Bounds }
    | undefined;
  passes = 0;
  private pooledBytes = 0;

  private frameClip: Bounds | null | undefined;
  onScreenChange: ((region?: Bounds) => void) | undefined;

  setFrameClip(region?: Bounds | null) {
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
    const result = {
      left: Math.max(frame.left, clip.left),
      top: Math.max(frame.top, clip.top),
      right: Math.min(frame.right, clip.right),
      bottom: Math.min(frame.bottom, clip.bottom),
    };
    return result.right <= result.left || result.bottom <= result.top
      ? null
      : result;
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    preserveAlpha = false,
    private readonly poolByteLimit = 128 * 1024 * 1024,
  ) {
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
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DITHER);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
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
    const cached = this.pool
      .get(`${width}x${height}/${floating}/${opaque}/${screen}`)
      ?.pop();
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
    let framebuffer: WebGLFramebuffer | undefined;
    let texture: WebGLTexture | undefined;
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
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
      const surface: WebglSurface = {
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
      return surface;
    } catch (error) {
      if (texture)
        releaseRenderStorage(texture, (value) => gl.deleteTexture(value));
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw error;
    }
  }

  /** Permanently release a separately budgeted native texture, bypassing the general pool. */
  discard(surface: WebglSurface) {
    releaseRenderStorage(surface.texture, (value) =>
      this.gl.deleteTexture(value),
    );
    this.gl.deleteFramebuffer(surface.framebuffer);
    this.surfaces.delete(surface);
  }

  release(surface: WebglSurface) {
    const key = `${surface.width}x${surface.height}/${surface.floating}/${surface.opaque}/${surface.screen}`;
    const list = this.pool.get(key) ?? [];
    const bytes = surface.width * surface.height * (surface.floating ? 16 : 4);
    if (list.length < 16 && this.pooledBytes + bytes <= this.poolByteLimit) {
      this.pooledBytes += bytes;
      list.push(surface);
      this.pool.set(key, list);
    } else {
      releaseRenderStorage(surface.texture, (value) =>
        this.gl.deleteTexture(value),
      );
      this.gl.deleteFramebuffer(surface.framebuffer);
      this.surfaces.delete(surface);
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
      const bytes = color
        .slice(0, 3)
        .map((value) => value * a * 255)
        .concat(255);
      this.solid =
        surface.opaque && bytes.every((v) => Math.abs(v - Math.round(v)) < 1e-6)
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
      this.dirtyScreens.add(surface);
      this.onScreenChange?.(clip);
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
    if (target?.screen) this.solid = undefined;
    const gl = this.gl;
    if (target?.screen) {
      // Keep every shader in top-left image coordinates while the canvas's
      // physical framebuffer has its origin at the bottom left.
      body =
        "vec4 pixelPosition;\n" +
        body
          .replaceAll("gl_FragCoord", "pixelPosition")
          .replace("void main()", "void shade()") +
        `\nvoid main() { pixelPosition=vec4(gl_FragCoord.x,${target.height}.0-gl_FragCoord.y,gl_FragCoord.zw); shade(); ${blended || !target.opaque ? "" : "pixel.a=1.0;"} }`;
    } else if (target?.opaque && !blended)
      body =
        body.replace("void main()", "void shade()") +
        "\nvoid main() { shade(); pixel.a = 1.0; }";
    let program = this.programs.get(body);
    if (!program) {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const error = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw new Error(`comp-webgl-shader: ${error}`);
        }
        return shader;
      };
      const vertex = compile(
        gl.VERTEX_SHADER,
        target?.screen
          ? VERTEX.replace("uv = p;", "uv = vec2(p.x, 1.0-p.y);")
          : VERTEX,
      );
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_HEADER + body);
      const handle = gl.createProgram()!;
      gl.attachShader(handle, vertex);
      gl.attachShader(handle, fragment);
      gl.linkProgram(handle);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(handle);
        gl.deleteProgram(handle);
        throw new Error(`comp-webgl-program: ${error}`);
      }
      program = { handle, uniforms: new Map() };
      for (
        let i = 0;
        i < gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
        i++
      ) {
        const info = gl.getActiveUniform(handle, i)!;
        program.uniforms.set(
          info.name,
          gl.getUniformLocation(handle, info.name)!,
        );
      }
      if (this.programs.size >= 64) {
        const oldest = this.programs.keys().next().value!;
        gl.deleteProgram(this.programs.get(oldest)!.handle);
        this.programs.delete(oldest);
      }
      this.programs.set(body, program);
    }
    if (
      target &&
      !target.screen &&
      inputs.some((input) => input.texture === target.texture)
    )
      throw new Error("comp-webgl-feedback: input and output textures overlap");
    for (const input of new Set(inputs))
      if (input.screen) this.resolveScreen(input);
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
    for (const [name, value] of Object.entries(uniforms)) {
      const location = program.uniforms.get(name);
      if (!location) continue;
      if (typeof value === "number") gl.uniform1f(location, value);
      else if (value.length === 2) gl.uniform2fv(location, value);
      else if (value.length === 3) gl.uniform3fv(location, value);
      else if (value.length === 4) gl.uniform4fv(location, value);
      else if (value.length === 9) gl.uniformMatrix3fv(location, false, value);
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
      this.dirtyScreens.add(target);
      this.onScreenChange?.(clip);
    }
    this.passes++;
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
    [first.texture, second.texture] = [second.texture, first.texture];
    [first.framebuffer, second.framebuffer] = [
      second.framebuffer,
      first.framebuffer,
    ];
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
            row.set(pixels.subarray(top * stride, (top + 1) * stride));
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
    this.solid = undefined;
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
    this.frameClip = undefined;
    this.onScreenChange = undefined;
    const gl = this.gl;
    for (const surface of this.surfaces) {
      releaseRenderStorage(surface.texture, (value) => gl.deleteTexture(value));
      gl.deleteFramebuffer(surface.framebuffer);
    }
    for (const program of this.programs.values())
      gl.deleteProgram(program.handle);
    gl.deleteVertexArray(this.vao);
    this.pooledBytes = 0;
    this.surfaces.clear();
    this.pool.clear();
    this.programs.clear();
    this.dirtyScreens.clear();
    this.solid = undefined;
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
