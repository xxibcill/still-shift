import {
  LIMITS,
  SAMPLE_OFFSETS,
  validateExperiment,
  type Experiment,
} from "./model.ts";

/** Independent GPU ray/Gram implementation. Output is direct visibility, not art. */
export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray masks;
uniform vec3 origin[8], edgeU[8], edgeV[8];
uniform ivec2 maskSize[8];
uniform float opacity[8];
uniform vec3 receiverOrigin, receiverU, receiverV, light;
uniform vec2 offsets[16];
uniform int casterCount, sampleCount, side;
uniform float radius;
out vec4 pixel;
float texel(int c, ivec2 p) {
  if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, maskSize[c]))) return 0.0;
  return texelFetch(masks, ivec3(p, c), 0).r;
}
float alphaAt(int c, vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return 0.0;
  vec2 at = uv * vec2(maskSize[c]) - 0.5;
  ivec2 p = ivec2(floor(at)); vec2 f = fract(at);
  return mix(mix(texel(c,p), texel(c,p+ivec2(1,0)),f.x),
             mix(texel(c,p+ivec2(0,1)), texel(c,p+ivec2(1,1)),f.x), f.y);
}
float blocker(int c, vec3 r, vec3 emitter) {
  vec3 ray = emitter-r, n = cross(edgeU[c],edgeV[c]);
  float denominator = dot(n,ray), distance = length(ray);
  if (abs(denominator) <= 1e-6 * length(n) * distance) return 0.0;
  float t = dot(n,origin[c]-r)/denominator;
  if (t*distance <= 0.001 || (1.0-t)*distance <= 0.001) return 0.0;
  vec3 local = r + t*ray - origin[c];
  float uu = dot(edgeU[c],edgeU[c]), uv = dot(edgeU[c],edgeV[c]), vv = dot(edgeV[c],edgeV[c]);
  float determinant = uu*vv-uv*uv;
  return opacity[c] * alphaAt(c,vec2((dot(local,edgeU[c])*vv-dot(local,edgeV[c])*uv)/determinant,
                                  (dot(local,edgeV[c])*uu-dot(local,edgeU[c])*uv)/determinant));
}
void main() {
  // Readback row zero is y=0; invert only when displaying the PNG canvas.
  vec2 uv = gl_FragCoord.xy/float(side);
  vec3 r = receiverOrigin + uv.x*receiverU + uv.y*receiverV;
  float sum = 0.0;
  for (int s=0; s<16; s++) {
    if (s >= sampleCount) break;
    vec3 emitter = light + vec3(offsets[s]*radius,0.0);
    float transmission = 1.0;
    for (int c=0; c<8; c++) { if (c >= casterCount) break; transmission *= 1.0-blocker(c,r,emitter); }
    sum += transmission;
  }
  pixel = vec4(vec3(sum/float(sampleCount)),1.0);
}`;

export function shaderInput(scene: Experiment, side: number) {
  validateExperiment(scene);
  const casters =
    !scene.light.enabled || !scene.receiver.receivesShadow
      ? []
      : scene.casters
          .filter(
            (p) =>
              p.castsShadow &&
              p.scope === scene.receiver.scope &&
              p.id !== scene.receiver.id,
          )
          .sort(
            (a, b) =>
              a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          );
  return {
    scene,
    side,
    casters,
    offsets: SAMPLE_OFFSETS[scene.light.samples],
    vertex: VERTEX,
    fragment: FRAGMENT,
    textureSide: LIMITS.textureSide,
  };
}

/** Serialized by Playwright: no closure imports or production render dependencies. */
export function drawVisibility(input: ReturnType<typeof shaderInput>) {
  const { scene, side, casters, offsets, vertex, fragment, textureSide } =
    input;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL2 unavailable");
  try {
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader)!);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program)!);
    gl.useProgram(program);
    const location = (name: string) => gl.getUniformLocation(program, name);
    const vec3 = (name: string, values: number[]) =>
      gl.uniform3fv(location(name), values);
    vec3("receiverOrigin", scene.receiver.origin);
    vec3("receiverU", scene.receiver.u);
    vec3("receiverV", scene.receiver.v);
    vec3("light", scene.light.position);
    gl.uniform1i(location("casterCount"), casters.length);
    gl.uniform1i(location("sampleCount"), scene.light.samples);
    gl.uniform1i(location("side"), side);
    gl.uniform1f(location("radius"), scene.light.radius);
    gl.uniform2fv(location("offsets[0]"), offsets.flat());
    if (casters.length) {
      vec3(
        "origin[0]",
        casters.flatMap((p) => p.origin),
      );
      vec3(
        "edgeU[0]",
        casters.flatMap((p) => p.u),
      );
      vec3(
        "edgeV[0]",
        casters.flatMap((p) => p.v),
      );
      gl.uniform2iv(
        location("maskSize[0]"),
        casters.flatMap((p) => [p.alpha.width, p.alpha.height]),
      );
      gl.uniform1fv(
        location("opacity[0]"),
        casters.map((p) => p.opacity),
      );
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1,
      gl.R8,
      textureSide,
      textureSide,
      Math.max(1, casters.length),
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    casters.forEach((p, i) =>
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        p.alpha.width,
        p.alpha.height,
        1,
        gl.RED,
        gl.UNSIGNED_BYTE,
        new Uint8Array(p.alpha.pixels),
      ),
    );
    gl.uniform1i(location("masks"), 0);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, side, side);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(side * side * 4);
    gl.readPixels(0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("WebGL error in prototype draw");
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    );
    // Rebuild the display from readback to make its top row match the CPU oracle.
    const display = document.createElement("canvas");
    display.width = display.height = side;
    display
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels), side, side),
        0,
        0,
      );
    return {
      pixels: Array.from(pixels),
      renderer,
      png: display.toDataURL("image/png"),
    };
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
