import { coverFit, PREVIEW_LIMITS } from "../../scene.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { CanvasImageResources } from "./canvas2d.ts";
import type { DepthImageContent } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

export const DEPTH_IMAGE_SHADER_VERSION = "composition-depth-image-0.1.0";

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 vertex;
out vec2 uv;
uniform sampler2D depth;
uniform vec2 cover, framing, stepSize, offset;
uniform float overscan, scale, strength, roll, edgeDamping;
float safeDepth(vec2 p) { float value=texture(depth,p).r; return value>=0.0 && value<=1.0 ? value : 0.5; }
void main() {
  uv=vertex.zw;
  float value=safeDepth(uv);
  float gradient=max(max(abs(value-safeDepth(uv+vec2(stepSize.x,0.0))),abs(value-safeDepth(uv-vec2(stepSize.x,0.0)))),max(abs(value-safeDepth(uv+vec2(0.0,stepSize.y))),abs(value-safeDepth(uv-vec2(0.0,stepSize.y)))));
  float damping=1.0-edgeDamping*0.8*smoothstep(0.06,0.25,gradient);
  float parallax=1.0/(1.0-value*strength*damping);
  vec2 p=(vertex.xy*cover+framing)*(1.0+overscan)*scale*parallax;
  float cosine=cos(roll), sine=sin(roll);
  p=vec2(p.x*cosine-p.y*sine,p.x*sine+p.y*cosine)+offset;
  // Retain source winding and MSAA sample orientation until the exact row flip.
  gl_Position=vec4(p,0.0,1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D source;
out vec4 pixel;
void main() {
  vec4 value=texture(source,uv);
  // Match the pinned source algorithm's sRGB OETF after linear-light filtering.
  vec3 encoded=mix(pow(value.rgb,vec3(0.41666))*1.055-vec3(0.055),value.rgb*12.92,lessThanEqual(value.rgb,vec3(0.0031308)));
  pixel=vec4(encoded*value.a,value.a);
}`;

/** Fixed source mesh; no family renderer, camera or export pipeline is created. */
export function depthImageGrid() {
  const columns = PREVIEW_LIMITS.gridColumns,
    rows = PREVIEW_LIMITS.gridRows;
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 4);
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++)
      vertices.set(
        [
          (x * 2) / columns - 1,
          -((y * 2) / rows - 1),
          x / columns,
          1 - y / rows,
        ],
        (y * (columns + 1) + x) * 4,
      );
  const indices = new Uint16Array(columns * rows * 6);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const a = x + (columns + 1) * y,
        b = a + columns + 1;
      indices.set([a, b, a + 1, b, b + 1, a + 1], (y * columns + x) * 6);
    }
  return { vertices, indices };
}

type Multisample = {
  framebuffer: WebGLFramebuffer;
  color: WebGLRenderbuffer;
  width: number;
  height: number;
};

/** Layer-local GPU content, owned by the shared composition device. */
export class WebglDepthImages {
  private program: WebGLProgram | undefined;
  private vao?: WebGLVertexArrayObject;
  private vertex?: WebGLBuffer;
  private index?: WebGLBuffer;
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private multisample: Multisample | undefined;
  private count = 0;
  constructor(
    private readonly device: WebglDevice,
    private readonly images: CanvasImageResources,
  ) {}

  get allocated() {
    return (
      (this.program ? 4 : 0) + this.textures.size + (this.multisample ? 2 : 0)
    );
  }

  private initialize() {
    if (this.program) return;
    const gl = this.device.gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram()!;
    try {
      for (const [type, code] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT],
      ] as const) {
        const shader = gl.createShader(type)!;
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            gl.getShaderInfoLog(shader) ?? "Depth shader compilation failed",
          );
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(
          gl.getProgramInfoLog(program) ?? "Depth shader link failed",
        );
      this.program = program;
      this.vao = gl.createVertexArray()!;
      this.vertex = gl.createBuffer()!;
      this.index = gl.createBuffer()!;
      gl.bindVertexArray(this.vao);
      const { vertices, indices } = depthImageGrid();
      this.count = indices.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    } catch (error) {
      gl.deleteProgram(program);
      this.program = undefined;
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  private texture(id: string, hash: string, color: boolean, node: string) {
    const key = `${id}:${hash}:${color}`;
    const stored = this.textures.get(key);
    if (stored) {
      this.textures.delete(key);
      this.textures.set(key, stored);
      return stored;
    }
    const gl = this.device.gl,
      image = this.images.images.get(id);
    if (!image)
      passageError(
        "comp-asset-missing",
        `Prepared depth-image asset "${id}" is unavailable`,
        { node },
      );
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const size = this.images.sizes.get(id)!;
    if (size[0] > maximum || size[1] > maximum)
      passageError(
        "comp-feature-backend",
        "Depth-image source exceeds this device's texture limit",
        { node },
      );
    const texture = gl.createTexture()!;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        color ? gl.SRGB8_ALPHA8 : gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image as TexImageSource,
      );
      // A bounded asset cache; evictions are recreated from immutable verified bytes.
      if (this.textures.size >= 64) {
        const oldest = this.textures.keys().next().value!;
        gl.deleteTexture(this.textures.get(oldest)!);
        this.textures.delete(oldest);
      }
      this.textures.set(key, texture);
      return texture;
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  private antialias(width: number, height: number, node: string) {
    const gl = this.device.gl;
    if (this.multisample?.width === width && this.multisample.height === height)
      return this.multisample;
    if (this.multisample) {
      gl.deleteFramebuffer(this.multisample.framebuffer);
      gl.deleteRenderbuffer(this.multisample.color);
      this.multisample = undefined;
    }
    const samples = gl.getInternalformatParameter(
      gl.RENDERBUFFER,
      gl.RGBA8,
      gl.SAMPLES,
    ) as Int32Array;
    if (!Array.from(samples).includes(4))
      passageError(
        "comp-feature-backend",
        "Depth-image parity requires four-sample local antialiasing",
        { node },
      );
    const framebuffer = gl.createFramebuffer()!,
      color = gl.createRenderbuffer()!;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.bindRenderbuffer(gl.RENDERBUFFER, color);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        4,
        gl.RGBA8,
        width,
        height,
      );
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.RENDERBUFFER,
        color,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        passageError(
          "comp-feature-backend",
          "Depth-image antialias surface is incomplete",
          { node },
        );
      return (this.multisample = { framebuffer, color, width, height });
    } catch (error) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteRenderbuffer(color);
      throw error;
    }
  }

  draw(content: DepthImageContent): WebglSurface {
    const gl = this.device.gl;
    const output = this.device.surface(content.width, content.height);
    let resolved: WebglSurface | undefined;
    const old = {
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      array: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING),
      read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
      clear: gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array,
      face: gl.getParameter(gl.FRONT_FACE),
      cullMode: gl.getParameter(gl.CULL_FACE_MODE),
      active: gl.getParameter(gl.ACTIVE_TEXTURE),
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
      premultiply: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
      colorspace: gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),
    };
    const flags = [
      gl.BLEND,
      gl.CULL_FACE,
      gl.DEPTH_TEST,
      gl.SCISSOR_TEST,
      gl.DITHER,
    ].map((flag) => [flag, gl.isEnabled(flag)] as const);
    const bindings = [gl.TEXTURE0, gl.TEXTURE1].map((unit) => {
      gl.activeTexture(unit);
      return gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    });
    let completed = false;
    try {
      this.initialize();
      const target = this.antialias(
        content.width,
        content.height,
        content.layer.id,
      );
      gl.useProgram(this.program!);
      gl.bindVertexArray(this.vao!);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        this.texture(
          content.layer.sourceAsset,
          content.sourceHash,
          true,
          content.layer.id,
        ),
      );
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        this.texture(
          content.layer.depth.asset,
          content.depthHash,
          false,
          content.layer.id,
        ),
      );
      const uniform = (name: string) => {
        if (!this.locations.has(name))
          this.locations.set(name, gl.getUniformLocation(this.program!, name));
        return this.locations.get(name)!;
      };
      gl.uniform1i(uniform("source"), 0);
      gl.uniform1i(uniform("depth"), 1);
      const sourceSize = this.images.sizes.get(content.layer.sourceAsset)!;
      const cover = coverFit(
          sourceSize[0],
          sourceSize[1],
          content.width,
          content.height,
        ),
        crop = content.layer.framing;
      gl.uniform2f(uniform("cover"), cover.x, cover.y);
      gl.uniform2f(
        uniform("framing"),
        crop ? (0.5 - crop.x - crop.width / 2) * 2 * cover.x : 0,
        crop ? (crop.y + crop.height / 2 - 0.5) * 2 * cover.y : 0,
      );
      gl.uniform2f(
        uniform("stepSize"),
        Math.max(1 / sourceSize[0], 1 / PREVIEW_LIMITS.gridColumns),
        Math.max(1 / sourceSize[1], 1 / PREVIEW_LIMITS.gridRows),
      );
      gl.uniform2fv(uniform("offset"), content.motion.offset);
      gl.uniform1f(uniform("overscan"), content.layer.overscan);
      gl.uniform1f(uniform("scale"), content.motion.scale);
      gl.uniform1f(uniform("strength"), content.motion.strength);
      gl.uniform1f(uniform("roll"), (content.motion.roll * Math.PI) / 180);
      gl.uniform1f(uniform("edgeDamping"), content.layer.edgeDamping ?? 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, content.width, content.height);
      for (const [flag] of flags) gl.disable(flag);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      resolved = this.device.surface(content.width, content.height);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved.framebuffer);
      gl.blitFramebuffer(
        0,
        0,
        content.width,
        content.height,
        0,
        0,
        content.width,
        content.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      this.device.passes += 2;
      gl.disable(gl.CULL_FACE);
      this.device.pass(
        "uniform float height; void main(){pixel=texelFetch(source,ivec2(int(gl_FragCoord.x),int(height)-1-int(gl_FragCoord.y)),0);}",
        output,
        [resolved],
        { height: content.height },
      );
      completed = true;
      return output;
    } finally {
      gl.bindVertexArray(old.vao);
      gl.useProgram(old.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, old.array);
      gl.bindRenderbuffer(gl.RENDERBUFFER, old.renderbuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old.read);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, old.draw);
      gl.viewport(
        old.viewport[0]!,
        old.viewport[1]!,
        old.viewport[2]!,
        old.viewport[3]!,
      );
      gl.clearColor(old.clear[0]!, old.clear[1]!, old.clear[2]!, old.clear[3]!);
      gl.frontFace(old.face);
      gl.cullFace(old.cullMode);
      flags.forEach(([flag, enabled]) =>
        enabled ? gl.enable(flag) : gl.disable(flag),
      );
      bindings.forEach((texture, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      });
      gl.activeTexture(old.active);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, old.flip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, old.premultiply);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, old.colorspace);
      if (resolved) this.device.release(resolved);
      if (!completed) this.device.release(output);
    }
  }

  dispose() {
    const gl = this.device.gl;
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    this.textures.clear();
    this.locations.clear();
    if (this.multisample) {
      gl.deleteFramebuffer(this.multisample.framebuffer);
      gl.deleteRenderbuffer(this.multisample.color);
      this.multisample = undefined;
    }
    if (this.vertex) gl.deleteBuffer(this.vertex);
    if (this.index) gl.deleteBuffer(this.index);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.program = undefined;
  }
}
