import {
  allocateRenderPixels,
  createRenderStorage,
  releaseRenderPixels,
  releaseRenderStorage,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import { coverFit, PREVIEW_LIMITS } from "../../scene.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { CanvasImageResources } from "./canvas2d.ts";
import type { DepthImageContent, ImageContent } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

export const DEPTH_IMAGE_SHADER_VERSION = "composition-image-plane-0.4.0";
const IMAGE_PLANE_BYTE_LIMIT = 128 * 1024 * 1024;

export function validateImagePlaneSurface(
  width: number,
  height: number,
  node: string,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height * 24 > IMAGE_PLANE_BYTE_LIMIT
  )
    passageError(
      "comp-feature-backend",
      "Native image planes require integer dimensions and at most 128 MiB of local MSAA/resolve scratch",
      { node },
    );
}
export function validateImagePlaneAssets(
  source: readonly [number, number],
  depth: readonly [number, number] | undefined,
  node: string,
) {
  const bytes = (source[0] * source[1] + (depth ? depth[0] * depth[1] : 0)) * 4;
  if (bytes > IMAGE_PLANE_BYTE_LIMIT)
    passageError(
      "comp-feature-backend",
      "Image-plane source/depth assets exceed the 128 MiB GPU texture budget",
      { node },
    );
}

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
// sRGB texels decode to linear before filtering. Filter authored alpha in
// premultiplied form so transparent texels cannot darken the visible edge.
const PRESERVED_ALPHA_SAMPLE = `
vec4 sampleSource(vec2 coordinate) {
  if (opaqueAlpha>0.5) return texture(source,coordinate);
  ivec2 dimensions=textureSize(source,0);
  vec2 position=coordinate*vec2(dimensions)-vec2(0.5);
  ivec2 low=ivec2(floor(position));
  vec2 fraction=fract(position);
  ivec2 maximum=dimensions-ivec2(1);
  vec4 a=texelFetch(source,clamp(low,ivec2(0),maximum),0);
  vec4 b=texelFetch(source,clamp(low+ivec2(1,0),ivec2(0),maximum),0);
  vec4 c=texelFetch(source,clamp(low+ivec2(0,1),ivec2(0),maximum),0);
  vec4 d=texelFetch(source,clamp(low+ivec2(1,1),ivec2(0),maximum),0);
  a.rgb*=a.a; b.rgb*=b.a; c.rgb*=c.a; d.rgb*=d.a;
  vec4 value=mix(mix(a,b,fraction.x),mix(c,d,fraction.x),fraction.y);
  value.rgb=value.a>0.0 ? value.rgb/value.a : vec3(0.0);
  return value;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D source;
uniform float revealMode, revealProgress, opaqueAlpha;
out vec4 pixel;
${PRESERVED_ALPHA_SAMPLE}
void main() {
  vec4 value=sampleSource(uv);
  if (opaqueAlpha>0.5) value.a=1.0;
  if (revealMode>0.5 && revealProgress<1.0) {
    vec3 backdrop=texture(source,vec2(0.01,0.99)).rgb;
    float boundary=revealMode<1.5 ? revealProgress : 0.5+0.5*revealProgress;
    float visibility=1.0-smoothstep(boundary-0.0008,boundary+0.0008,uv.x);
    value=vec4(mix(backdrop,value.rgb,visibility),1.0);
  }
  // Match the pinned source algorithm's sRGB OETF after linear-light filtering.
  vec3 encoded=mix(pow(value.rgb,vec3(0.41666))*1.055-vec3(0.055),value.rgb*12.92,lessThanEqual(value.rgb,vec3(0.0031308)));
  pixel=vec4(encoded*value.a,value.a);
}`;

// Keep opaque compatibility sampling and the pinned software mesh unchanged.
// Hardware smooth interpolation uses
// different subpixel precision, which is visible when a depth mesh is downscaled.
// Reconstruct hardware UVs from 1/16-pixel vertices to match the pinned legacy
// precision, without changing triangle coverage or the export algorithm.
// https://github.com/google/swiftshader/blob/master/src/Vulkan/VkConfig.hpp
const HARDWARE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 vertex;
layout(location=1) in vec4 triangleA;
layout(location=2) in vec4 triangleB;
layout(location=3) in vec4 triangleC;
out vec2 fallbackUv;
flat out vec2 screenA;
flat out vec2 screenB;
flat out vec2 screenC;
flat out vec2 uvA;
flat out vec2 uvB;
flat out vec2 uvC;
uniform sampler2D depth;
uniform vec2 cover, framing, stepSize, offset;
uniform float overscan, scale, strength, roll, edgeDamping;
uniform vec2 rasterSize;
float safeDepth(vec2 p) { float value=texture(depth,p).r; return value>=0.0 && value<=1.0 ? value : 0.5; }
vec2 position(vec4 point) {
  vec2 uv=point.zw;
  float value=safeDepth(uv);
  float gradient=max(max(abs(value-safeDepth(uv+vec2(stepSize.x,0.0))),abs(value-safeDepth(uv-vec2(stepSize.x,0.0)))),max(abs(value-safeDepth(uv+vec2(0.0,stepSize.y))),abs(value-safeDepth(uv-vec2(0.0,stepSize.y)))));
  float damping=1.0-edgeDamping*0.8*smoothstep(0.06,0.25,gradient);
  float parallax=1.0/(1.0-value*strength*damping);
  vec2 p=(point.xy*cover+framing)*(1.0+overscan)*scale*parallax;
  float cosine=cos(roll), sine=sin(roll);
  p=vec2(p.x*cosine-p.y*sine,p.x*sine+p.y*cosine)+offset;
  return p;
}
vec2 snap(vec2 p) { return floor((p+1.0)*0.5*rasterSize*16.0+0.5)/16.0; }
void main() {
  fallbackUv=vertex.zw;
  gl_Position=vec4(position(vertex),0.0,1.0);
  screenA=snap(position(triangleA)); screenB=snap(position(triangleB)); screenC=snap(position(triangleC));
  uvA=triangleA.zw; uvB=triangleB.zw; uvC=triangleC.zw;
}
`;
const HARDWARE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 fallbackUv;
flat in vec2 screenA;
flat in vec2 screenB;
flat in vec2 screenC;
flat in vec2 uvA;
flat in vec2 uvB;
flat in vec2 uvC;
uniform vec2 rasterSize;
uniform sampler2D source;
uniform float revealMode, revealProgress, opaqueAlpha;
out vec4 pixel;
${PRESERVED_ALPHA_SAMPLE}
void main() {
  vec2 center=floor(gl_FragCoord.xy)+vec2(0.5);
  vec2 ab=screenB-screenA, ac=screenC-screenA, relative=center-screenA;
  float determinant=ab.x*ac.y-ab.y*ac.x;
  // At very small local resolutions, quantization can collapse a triangle.
  // Its native smooth varying remains defined for the original coverage mesh.
  vec2 uv=fallbackUv;
  if (determinant!=0.0) {
    float b=(relative.x*ac.y-relative.y*ac.x)/determinant;
    float c=(ab.x*relative.y-ab.y*relative.x)/determinant;
    uv=uvA+(uvB-uvA)*b+(uvC-uvA)*c;
  }
  vec4 value=sampleSource(uv);
  if (opaqueAlpha>0.5) value.a=1.0;
  if (revealMode>0.5 && revealProgress<1.0) {
    vec3 backdrop=texture(source,vec2(0.01,0.99)).rgb;
    float boundary=revealMode<1.5 ? revealProgress : 0.5+0.5*revealProgress;
    float visibility=1.0-smoothstep(boundary-0.0008,boundary+0.0008,uv.x);
    value=vec4(mix(backdrop,value.rgb,visibility),1.0);
  }
  // Match the pinned source algorithm's sRGB OETF after linear-light filtering.
  vec3 encoded=mix(pow(value.rgb,vec3(0.41666))*1.055-vec3(0.055),value.rgb*12.92,lessThanEqual(value.rgb,vec3(0.0031308)));
  pixel=vec4(encoded*value.a,value.a);
}`;

type DepthGrid = {
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint16Array<ArrayBuffer>;
};
type GridWork = {
  managed: boolean;
  views: Float32Array<ArrayBuffer>[];
  values?: number[] | undefined;
  triangle?: Float32Array<ArrayBuffer>[] | undefined;
  vertices?: Float32Array<ArrayBuffer> | undefined;
  indices?: Uint16Array<ArrayBuffer> | undefined;
};
function clearGridWork(value: GridWork) {
  if (value.values) value.values.length = 0;
  if (value.triangle) value.triangle.length = 0;
  value.views.length = 0;
  value.values = value.triangle = value.vertices = value.indices = undefined;
}
function gridWork() {
  return allocateRenderMetadata<GridWork>(
    1024,
    () => ({ managed: renderMemory() !== undefined, views: [] }),
    false,
    clearGridWork,
  );
}
function gridResult(
  vertices: DepthGrid["vertices"],
  indices: DepthGrid["indices"],
) {
  return allocateRenderMetadata<DepthGrid>(
    512,
    () => ({ vertices, indices }),
    false,
    (grid) => {
      delete (grid as Partial<DepthGrid>).vertices;
      delete (grid as Partial<DepthGrid>).indices;
    },
  );
}
function releaseGridWork(phase: GridWork) {
  if (phase.managed) releaseRenderMetadata(phase);
  else clearGridWork(phase);
}
function releaseGridPixels(phase: GridWork) {
  let failed = false,
    first: unknown;
  try {
    releaseRenderPixels(phase.vertices);
  } catch (error) {
    failed = true;
    first = error;
  }
  try {
    releaseRenderPixels(phase.indices);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  if (failed) throw first;
}
function setGridValues(
  phase: GridWork,
  target: Float32Array | Uint16Array,
  values: number[],
  offset: number,
) {
  phase.values = values;
  try {
    target.set(values, offset);
  } finally {
    values.length = 0;
    phase.values = undefined;
  }
}

/** Fixed source mesh; no family renderer, camera or export pipeline is created. */
export function depthImageGrid() {
  const phase = gridWork();
  let completed = false,
    cleaned = false;
  try {
    const columns = PREVIEW_LIMITS.gridColumns,
      rows = PREVIEW_LIMITS.gridRows;
    const vertices = (phase.vertices = allocateRenderPixels(
      (columns + 1) * (rows + 1) * 16,
      () => new Float32Array((columns + 1) * (rows + 1) * 4),
    ));
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= columns; x++)
        setGridValues(
          phase,
          vertices,
          [
            (x * 2) / columns - 1,
            -((y * 2) / rows - 1),
            x / columns,
            1 - y / rows,
          ],
          (y * (columns + 1) + x) * 4,
        );
    const indices = (phase.indices = allocateRenderPixels(
      columns * rows * 12,
      () => new Uint16Array(columns * rows * 6),
    ));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const a = x + (columns + 1) * y,
          b = a + columns + 1;
        setGridValues(
          phase,
          indices,
          [a, b, a + 1, b, b + 1, a + 1],
          (y * columns + x) * 6,
        );
      }
    const result = gridResult(vertices, indices);
    completed = true;
    return result;
  } catch (error) {
    cleaned = true;
    try {
      releaseGridPixels(phase);
    } catch {
      /* Preserve original mesh factory/consumer failure. */
    }
    throw error;
  } finally {
    try {
      if (!completed && !cleaned) releaseGridPixels(phase);
    } finally {
      releaseGridWork(phase);
    }
  }
}

/** Original per-triangle hardware attributes, with three borrowed backing views per triangle. */
export function hardwareDepthGrid(grid: DepthGrid) {
  const phase = gridWork();
  let completed = false,
    cleaned = false;
  try {
    const indices = (phase.indices = allocateRenderPixels(
      grid.indices.length * 2,
      () => new Uint16Array(grid.indices.length),
    ));
    const vertices = (phase.vertices = allocateRenderPixels(
      indices.length * 16 * 4,
      () => new Float32Array(indices.length * 16),
    ));
    for (let start = 0; start < indices.length; start += 3) {
      const triangle = (phase.triangle = (phase.values = [0, 1, 2]).map(
        (corner) => {
          const offset = grid.indices[start + corner]! * 4;
          const view = grid.vertices.subarray(offset, offset + 4);
          phase.views.push(view);
          return view;
        },
      ));
      try {
        for (let corner = 0; corner < 3; corner++) {
          const index = start + corner;
          indices[index] = index;
          vertices.set(triangle[corner]!, index * 16);
          for (let other = 0; other < 3; other++)
            vertices.set(triangle[other]!, index * 16 + 4 + other * 4);
        }
      } finally {
        triangle.length = phase.views.length = 0;
        phase.values.length = 0;
        phase.triangle = phase.values = undefined;
      }
    }
    const result = gridResult(vertices, indices);
    completed = true;
    return result;
  } catch (error) {
    cleaned = true;
    try {
      releaseGridPixels(phase);
    } catch {
      /* Preserve original mesh factory/consumer failure. */
    }
    throw error;
  } finally {
    try {
      if (!completed && !cleaned) releaseGridPixels(phase);
    } finally {
      releaseGridWork(phase);
    }
  }
}

type Multisample = {
  framebuffer: WebGLFramebuffer;
  color: WebGLRenderbuffer;
  width: number;
  height: number;
};
type DepthTextureEntry = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  key?: string | undefined;
  texture?: WebGLTexture | undefined;
  nativeOwned: boolean;
  bytes: number;
  counted: boolean;
};
type DepthTextureState = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  closed: boolean;
  textures: Map<string, WebGLTexture>;
  sizes: Map<string, number>;
  entries: Map<string, DepthTextureEntry>;
};

/** Layer-local GPU content, owned by the shared composition device. */
export class WebglDepthImages {
  private program: WebGLProgram | undefined;
  private vao: WebGLVertexArrayObject | undefined;
  private vertex: WebGLBuffer | undefined;
  private index: WebGLBuffer | undefined;
  private readonly textureState = allocateRenderMetadata<DepthTextureState>(
    1536,
    () => ({
      managed: renderMemory() !== undefined,
      memory: renderMemory(),
      closed: false,
      textures: new Map(),
      sizes: new Map(),
      entries: new Map(),
    }),
    true,
    (state) => this.clearTextures(state),
  );
  private get textures() {
    return this.textureState.textures;
  }
  private textureBytes = 0;
  private get textureSizes() {
    return this.textureState.sizes;
  }
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
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const software =
      rendererInfo &&
      /SwiftShader/.test(
        String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)),
      );
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram()!;
    try {
      for (const [type, code] of [
        [gl.VERTEX_SHADER, software ? VERTEX : HARDWARE_VERTEX],
        [gl.FRAGMENT_SHADER, software ? FRAGMENT : HARDWARE_FRAGMENT],
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
      gl.bindVertexArray(this.vao);
      const grid = depthImageGrid();
      let vertices = grid.vertices;
      let indices = grid.indices;
      let expanded: DepthGrid | undefined;
      try {
        if (!software) {
          expanded = hardwareDepthGrid(grid);
          indices = expanded.indices;
          vertices = expanded.vertices;
        }
        this.count = indices.length;
        this.vertex = createRenderStorage(
          vertices.byteLength,
          () => gl.createBuffer(),
          (buffer) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
          },
          (buffer) => gl.deleteBuffer(buffer),
        );
        for (let attribute = 0; attribute < (software ? 1 : 4); attribute++) {
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(
            attribute,
            4,
            gl.FLOAT,
            false,
            software ? 16 : 64,
            attribute * 16,
          );
        }
        this.index = createRenderStorage(
          indices.byteLength,
          () => gl.createBuffer(),
          (buffer) => {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          },
          (buffer) => gl.deleteBuffer(buffer),
        );
      } finally {
        releaseRenderPixels(vertices);
        releaseRenderPixels(indices);
        releaseRenderPixels(grid.vertices);
        releaseRenderPixels(grid.indices);
        if (expanded) releaseRenderMetadata(expanded);
        releaseRenderMetadata(grid);
      }
    } catch (error) {
      gl.deleteProgram(program);
      if (this.vertex)
        releaseRenderStorage(this.vertex, (value) => gl.deleteBuffer(value));
      if (this.index)
        releaseRenderStorage(this.index, (value) => gl.deleteBuffer(value));
      if (this.vao) gl.deleteVertexArray(this.vao);
      this.vertex = undefined;
      this.index = undefined;
      this.vao = undefined;
      this.program = undefined;
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  private destroyTexture(entry: DepthTextureEntry) {
    const key = entry.key,
      texture = entry.texture;
    // Retire the actual cache references even if native destruction fails.
    if (key !== undefined && this.textureState.entries.get(key) === entry) {
      this.textureState.entries.delete(key);
      this.textures.delete(key);
      this.textureSizes.delete(key);
      if (entry.counted) this.textureBytes -= entry.bytes;
    }
    entry.key = entry.texture = undefined;
    entry.counted = false;
    const memory = entry.memory;
    entry.memory = undefined;
    if (texture && (!entry.nativeOwned || memory?.owns(texture)))
      releaseRenderStorage(texture, (value) =>
        this.device.gl.deleteTexture(value),
      );
  }
  private releaseTexture(entry: DepthTextureEntry) {
    if (entry.managed) releaseRenderMetadata(entry);
    else this.destroyTexture(entry);
  }
  private clearTextures(state: DepthTextureState) {
    let failed = false,
      first: unknown;
    for (const entry of state.entries.values()) {
      try {
        this.releaseTexture(entry);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    state.textures.clear();
    state.sizes.clear();
    state.entries.clear();
    state.closed = true;
    state.memory = undefined;
    this.textureBytes = 0;
    if (failed) throw first;
  }
  private texture(id: string, hash: string, color: boolean, node: string) {
    const state = this.textureState,
      memory = renderMemory();
    if (state.closed) throw Error("Depth texture cache is disposed");
    if (memory && state.memory !== memory)
      throw Error("Depth texture cache belongs to another allocator");
    const entry = allocateRenderMetadata<DepthTextureEntry>(
      2048 + 4 * (id.length + hash.length),
      () => ({
        managed: memory !== undefined,
        memory,
        nativeOwned: false,
        bytes: 0,
        counted: false,
      }),
      true,
      (value) => this.destroyTexture(value),
    );
    let failed = false;
    try {
      return this.textureEntry(entry, id, hash, color, node);
    } catch (error) {
      failed = true;
      try {
        this.releaseTexture(entry);
      } catch {
        /* Preserve original texture factory/upload/cache failure. */
      }
      throw error;
    } finally {
      if (!failed && !entry.counted) this.releaseTexture(entry);
    }
  }
  private textureEntry(
    entry: DepthTextureEntry,
    id: string,
    hash: string,
    color: boolean,
    node: string,
  ) {
    const key = (entry.key = `${id}:${hash}:${color}`);
    const stored = this.textures.get(key);
    if (stored) {
      this.textures.delete(key);
      this.textures.set(key, stored);
      const owner = this.textureState.entries.get(key)!;
      this.textureState.entries.delete(key);
      this.textureState.entries.set(key, owner);
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
    const bytes = size[0] * size[1] * 4;
    // Release cache storage before admitting another immutable source texture.
    while (
      this.textures.size &&
      (this.textures.size >= 64 ||
        this.textureBytes + bytes > IMAGE_PLANE_BYTE_LIMIT)
    ) {
      const oldest = this.textures.keys().next().value!;
      this.releaseTexture(this.textureState.entries.get(oldest)!);
    }
    const texture = createRenderStorage(
      bytes,
      () => gl.createTexture(),
      (texture) => {
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
      },
      (texture) => gl.deleteTexture(texture),
    );
    entry.texture = texture;
    entry.nativeOwned = entry.memory?.owns(texture) ?? false;
    entry.bytes = bytes;
    this.textureState.entries.set(key, entry);
    this.textures.set(key, texture);
    this.textureSizes.set(key, bytes);
    this.textureBytes += bytes;
    entry.counted = true;
    return texture;
  }

  private antialias(width: number, height: number, node: string) {
    const gl = this.device.gl;
    if (this.multisample?.width === width && this.multisample.height === height)
      return this.multisample;
    if (this.multisample) {
      gl.deleteFramebuffer(this.multisample.framebuffer);
      releaseRenderStorage(this.multisample.color, (value) =>
        gl.deleteRenderbuffer(value),
      );
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
    let framebuffer: WebGLFramebuffer | undefined;
    let color: WebGLRenderbuffer | undefined;
    try {
      color = createRenderStorage(
        width * height * 4 * 4,
        () => gl.createRenderbuffer(),
        (color) => {
          framebuffer = gl.createFramebuffer() ?? undefined;
          if (!framebuffer)
            throw Error("Native render framebuffer creation failed");
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
          if (
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE
          )
            passageError(
              "comp-feature-backend",
              "Depth-image antialias surface is incomplete",
              { node },
            );
        },
        (color) => gl.deleteRenderbuffer(color),
      );
      return (this.multisample = {
        framebuffer: framebuffer!,
        color,
        width,
        height,
      });
    } catch (error) {
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (color)
        releaseRenderStorage(color, (value) => gl.deleteRenderbuffer(value));
      throw error;
    }
  }

  draw(content: DepthImageContent | ImageContent): WebglSurface {
    const layer =
      content.type === "depth-image"
        ? {
            id: content.layer.id,
            sourceAsset: content.layer.sourceAsset,
            depth: content.layer.depth,
            sourceHash: content.sourceHash,
            depthHash: content.depthHash,
            overscan: content.layer.overscan,
            edgeDamping: content.layer.edgeDamping ?? 1,
            framing: content.layer.framing,
            alphaMode: content.layer.alphaMode ?? "preserve",
            revealMode: 0,
            revealProgress: 1,
            motion: content.motion,
          }
        : {
            id: content.plane!.owner,
            sourceAsset: content.sources[0]!.asset,
            depth: undefined,
            sourceHash: content.plane!.sourceHash,
            depthHash: undefined,
            overscan: content.plane!.controls?.overscan ?? 0,
            edgeDamping: 0,
            framing: content.plane!.controls?.framing,
            alphaMode: content.plane!.alphaMode,
            revealMode:
              content.plane!.controls?.reveal?.mode === "wipe"
                ? 1
                : content.plane!.controls?.reveal?.mode === "half-wipe"
                  ? 2
                  : 0,
            revealProgress: content.plane!.motion.revealProgress,
            motion: { ...content.plane!.motion, strength: 0 },
          };
    const gl = this.device.gl;
    validateImagePlaneSurface(content.width, content.height, layer.id);
    const requiredAssets = [
      layer.sourceAsset,
      ...(layer.depth ? [layer.depth.asset] : []),
    ];
    let assetBytes = 0;
    for (const id of requiredAssets) {
      const size = this.images.sizes.get(id);
      if (!size)
        passageError(
          "comp-asset-missing",
          `Image-plane dimensions are unavailable for "${id}"`,
          { node: layer.id },
        );
      assetBytes += size[0] * size[1] * 4;
    }
    if (assetBytes > IMAGE_PLANE_BYTE_LIMIT)
      passageError(
        "comp-feature-backend",
        "Image-plane source/depth assets exceed the 128 MiB GPU texture budget",
        { node: layer.id },
      );
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
      const target = this.antialias(content.width, content.height, layer.id);
      gl.useProgram(this.program!);
      gl.bindVertexArray(this.vao!);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        this.texture(layer.sourceAsset, layer.sourceHash, true, layer.id),
      );
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        layer.depth
          ? this.texture(layer.depth.asset, layer.depthHash!, false, layer.id)
          : this.texture(layer.sourceAsset, layer.sourceHash, true, layer.id),
      );
      const uniform = (name: string) => {
        if (!this.locations.has(name))
          this.locations.set(name, gl.getUniformLocation(this.program!, name));
        return this.locations.get(name)!;
      };
      gl.uniform2f(uniform("rasterSize"), content.width, content.height);
      gl.uniform1i(uniform("source"), 0);
      gl.uniform1i(uniform("depth"), 1);
      gl.uniform1f(uniform("revealMode"), layer.revealMode);
      gl.uniform1f(uniform("revealProgress"), layer.revealProgress);
      gl.uniform1f(
        uniform("opaqueAlpha"),
        layer.alphaMode === "opaque" ? 1 : 0,
      );
      const sourceSize = this.images.sizes.get(layer.sourceAsset)!;
      const cover = coverFit(
          sourceSize[0],
          sourceSize[1],
          content.width,
          content.height,
        ),
        crop = layer.framing;
      if (content.type === "image" && content.fit === "stretch") {
        cover.x = 1;
        cover.y = 1;
      }
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
      gl.uniform2fv(uniform("offset"), layer.motion.offset);
      gl.uniform1f(uniform("overscan"), layer.overscan);
      gl.uniform1f(uniform("scale"), layer.motion.scale);
      gl.uniform1f(uniform("strength"), layer.motion.strength);
      gl.uniform1f(uniform("roll"), (layer.motion.roll * Math.PI) / 180);
      gl.uniform1f(uniform("edgeDamping"), layer.edgeDamping);
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
    let failed = false,
      first: unknown;
    try {
      if (this.textureState.managed) releaseRenderMetadata(this.textureState);
      else if (!this.textureState.closed) this.clearTextures(this.textureState);
    } catch (error) {
      failed = true;
      first = error;
    }
    try {
      this.locations.clear();
      if (this.multisample) {
        gl.deleteFramebuffer(this.multisample.framebuffer);
        releaseRenderStorage(this.multisample.color, (value) =>
          gl.deleteRenderbuffer(value),
        );
        this.multisample = undefined;
      }
      if (this.vertex)
        releaseRenderStorage(this.vertex, (value) => gl.deleteBuffer(value));
      if (this.index)
        releaseRenderStorage(this.index, (value) => gl.deleteBuffer(value));
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
      this.program = undefined;
      this.vertex = undefined;
      this.index = undefined;
      this.vao = undefined;
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
    if (failed) throw first;
  }
}
