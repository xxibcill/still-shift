/** GPU-owned, premultiplied RGBA pixels. Texture row zero is the image's top row. */
export type WebglSurface = {
  readonly width: number;
  readonly height: number;
  readonly floating: boolean;
  readonly opaque: boolean;
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
  passes = 0;
  private pooledBytes = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
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
  ): WebglSurface {
    const cached = this.pool
      .get(`${width}x${height}/${floating}/${opaque}`)
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
    const texture = gl.createTexture()!,
      framebuffer = gl.createFramebuffer()!;
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
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error("comp-webgl-framebuffer: incomplete render surface");
    }
    const surface = { width, height, floating, opaque, texture, framebuffer };
    this.surfaces.add(surface);
    this.clear(surface);
    return surface;
  }

  release(surface: WebglSurface) {
    const key = `${surface.width}x${surface.height}/${surface.floating}/${surface.opaque}`;
    const list = this.pool.get(key) ?? [];
    const bytes = surface.width * surface.height * (surface.floating ? 16 : 4);
    if (list.length < 16 && this.pooledBytes + bytes <= 128 * 1024 * 1024) {
      this.pooledBytes += bytes;
      list.push(surface);
      this.pool.set(key, list);
    } else {
      this.gl.deleteTexture(surface.texture);
      this.gl.deleteFramebuffer(surface.framebuffer);
      this.surfaces.delete(surface);
    }
  }

  clear(surface: WebglSurface, color: readonly number[] = [0, 0, 0, 0]) {
    const gl = this.gl,
      a = color[3]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.clearColor(
      color[0]! * a,
      color[1]! * a,
      color[2]! * a,
      surface.opaque ? 1 : a,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
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

  /** Fixed-size triangles cover every destination pixel exactly once. */
  pass(
    body: string,
    target: WebglSurface | null,
    inputs: readonly WebglSurface[],
    uniforms: Record<string, UniformValue> = {},
  ) {
    const gl = this.gl;
    if (target?.opaque && !gl.isEnabled(gl.BLEND))
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
      const vertex = compile(gl.VERTEX_SHADER, VERTEX);
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
    if (target && inputs.some((input) => input.texture === target.texture))
      throw new Error("comp-webgl-feedback: input and output textures overlap");
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
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
      const location = program.uniforms.get(
        ["source", "backdrop", "coverage"][i]!,
      );
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.passes++;
  }

  swap(first: WebglSurface, second: WebglSurface) {
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

  read(surface: WebglSurface) {
    return this.readRegion(surface, 0, 0, surface.width, surface.height);
  }

  readRegion(
    surface: WebglSurface,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const gl = this.gl;
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
  }

  present(
    surface: WebglSurface,
    region?: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    },
    background?: Uint8Array,
  ) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, surface.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    if (background) {
      gl.clearColor(
        background[0]! / 255,
        background[1]! / 255,
        background[2]! / 255,
        1,
      );
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const { left, top, right, bottom } = region ?? {
      left: 0,
      top: 0,
      right: surface.width,
      bottom: surface.height,
    };
    gl.blitFramebuffer(
      left,
      top,
      right,
      bottom,
      left,
      this.canvas.height - top,
      right,
      this.canvas.height - bottom,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    const gl = this.gl;
    for (const surface of this.surfaces) {
      gl.deleteTexture(surface.texture);
      gl.deleteFramebuffer(surface.framebuffer);
    }
    for (const program of this.programs.values())
      gl.deleteProgram(program.handle);
    gl.deleteVertexArray(this.vao);
    this.pooledBytes = 0;
    this.surfaces.clear();
    this.pool.clear();
    this.programs.clear();
  }
}
